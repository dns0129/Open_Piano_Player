// @ts-check
// Shared HTTP plumbing for the local server (server.mjs) and the hosted account
// server (lib/accounts/http.mjs). Each server keeps its own error wording by
// passing an `errors` object; everything here only decides *when* to fail.
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { timingSafeEqual } from "node:crypto";

export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

export function setSecurityHeaders(res, extra = {}) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("content-security-policy", CONTENT_SECURITY_POLICY);
  for (const [name, value] of Object.entries(extra)) res.setHeader(name, value);
}

/** Constant-time comparison that never throws on unequal byte lengths. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * @typedef {{
 *   tooLarge: () => Error,
 *   contentType: () => Error,
 *   invalidJson: () => Error,
 *   method: () => Error,
 *   notFound: () => Error,
 *   buildRequired: () => Error,
 *   badPath?: () => Error,
 * }} HttpErrors
 */

/** Reads the request body, rejecting a declared or streamed size above `limit`. */
export async function readBytes(req, limit, errors) {
  if (Number(req.headers["content-length"]) > limit) throw errors.tooLarge();
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw errors.tooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, limit, errors) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
    throw errors.contentType();
  const bytes = await readBytes(req, limit, errors);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw errors.invalidJson();
  }
}

/**
 * Serves a built file from `distDir`. Dot segments, backslashes, unknown
 * extensions and anything resolving outside the directory are reported as
 * missing; hashed `/assets/` files are cached for a year.
 */
/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ pathname: string, distDir: string, indexFile?: string, types: Record<string, string>,
 *   errors: HttpErrors, cacheControl?: string }} options
 */
export async function serveStatic(
  req,
  res,
  { pathname, distDir, indexFile = "index.html", types, errors, cacheControl },
) {
  if (!["GET", "HEAD"].includes(req.method ?? "")) throw errors.method();
  let name;
  try {
    name = decodeURIComponent(pathname === "/" ? "/" + indexFile : pathname);
  } catch {
    throw (errors.badPath || errors.notFound)();
  }
  if (
    name.split("/").some((segment) => segment.startsWith(".")) ||
    name.includes("\\") ||
    !types[extname(name)]
  )
    throw errors.notFound();
  const base = await realpath(distDir).catch(() => null);
  if (!base) throw errors.buildRequired();
  const file = await realpath(resolve(base, "." + name)).catch(() => null);
  if (!file || !file.startsWith(base + sep)) throw errors.notFound();
  const info = await stat(file);
  if (!info.isFile()) throw errors.notFound();
  const immutable = name.startsWith("/assets/");
  res.writeHead(200, {
    "content-type": types[extname(name)],
    "content-length": info.size,
    ...(immutable
      ? { "cache-control": "public, max-age=31536000, immutable" }
      : cacheControl
        ? { "cache-control": cacheControl }
        : {}),
  });
  res.end(req.method === "HEAD" ? undefined : await readFile(file));
}

/**
 * Ordered route table. A route matches when its pattern matches the path and
 * its method list contains the request method (or "*"); the first match wins,
 * so register specific methods before a "*" fallback for the same pattern.
 * String patterns match exactly; RegExp captures become `params`.
 */
export function createRouter() {
  const routes = [];
  const router = {
    add(methods, pattern, handler) {
      routes.push({ methods: [].concat(methods), pattern, handler });
      return router;
    },
    match(method, path) {
      for (const route of routes) {
        const found =
          typeof route.pattern === "string"
            ? route.pattern === path && [path]
            : route.pattern.exec(path);
        if (
          found &&
          (route.methods.includes("*") || route.methods.includes(method))
        )
          return { handler: route.handler, params: found.slice(1) };
      }
      return null;
    },
  };
  return router;
}
