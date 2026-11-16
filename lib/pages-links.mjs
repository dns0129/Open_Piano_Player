// Links to this repository's GitHub Pages site are checked against the local
// `dist-pages` build. That build is what the next publish will contain, so a
// new path such as /app/ can pass before gh-pages is updated.
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const PAGES_HOST = "dns0129.github.io";
const PAGES_PREFIX = "/Open_Piano_Player";

export function publishedPagesFile(href, pagesRoot) {
  let url;
  try {
    url = href instanceof URL ? href : new URL(href);
  } catch {
    return null;
  }
  if (url.hostname !== PAGES_HOST) return null;
  const pathname = decodeURIComponent(url.pathname);
  if (pathname !== PAGES_PREFIX && !pathname.startsWith(`${PAGES_PREFIX}/`))
    return null;
  let relative = pathname.slice(PAGES_PREFIX.length);
  if (!relative || relative.endsWith("/")) relative += "/index.html";
  const file = resolve(pagesRoot, `.${relative}`);
  const root = pagesRoot.endsWith(sep) ? pagesRoot : `${pagesRoot}${sep}`;
  if (!file.startsWith(root))
    throw new Error(`Pages link escapes the build directory: ${url.href}`);
  return file;
}

export async function readPublishedPagesFile(file) {
  const info = await stat(file).catch((error) => {
    if (error.code !== "ENOENT" || extname(file)) throw error;
    return null;
  });
  if (!info || info.isDirectory()) return readFile(resolve(file, "index.html"));
  return readFile(file);
}
