// Boots the bundled app in jsdom with a fake local server (or IndexedDB only for the static site).
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { webcrypto } from "node:crypto";

// Polls instead of a fixed delay; the bundle boots slowly when the whole suite runs in parallel.
export async function until(check, message) {
  for (const end = Date.now() + 5000; !check();) {
    if (Date.now() > end) assert.fail(message);
    await new Promise((r) => setTimeout(r, 10));
  }
}

export async function boot(t, { staticSite = false } = {}) {
  const bundle = await build({
    entryPoints: ["src/app.js"],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    loader: { ".css": "empty" },
    define: {
      "import.meta.env": JSON.stringify({
        BASE_URL: "/",
        VITE_STATIC_SITE: staticSite ? "1" : "0",
        VITE_HOSTED_SITE: "0",
      }),
    },
    logLevel: "silent",
  });
  const dom = new JSDOM(
      '<!doctype html><html><body><div id="app"></div></body></html>',
      {
        url: "http://127.0.0.1:8792/",
        runScripts: "outside-only",
        pretendToBeVisual: true,
      },
    ),
    w = dom.window;
  t.after(() => w.close());
  Object.defineProperty(w, "crypto", { value: webcrypto });
  Object.assign(w, {
    structuredClone,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    Response,
    AbortController,
    AbortSignal,
  });
  w.indexedDB = new IDBFactory();
  w.IDBKeyRange = IDBKeyRange;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLElement.prototype.scrollTo = () => {};
  // jsdom Blobs lack arrayBuffer()/text(), which every browser the app supports has.
  const read = (blob, method) =>
    new Promise((resolve, reject) => {
      const r = new w.FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r[method](blob);
    });
  w.Blob.prototype.arrayBuffer ??= function () {
    return read(this, "readAsArrayBuffer");
  };
  w.Blob.prototype.text ??= function () {
    return read(this, "readAsText");
  };
  w.HTMLCanvasElement.prototype.getContext = () => ({
    font: "",
    measureText: (text) => ({
      width: String(text).length * 8,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
    }),
  });
  const requests = [];
  w.fetch = async (path) => {
    requests.push(String(path));
    return Response.json(
      String(path).endsWith("/api/status")
        ? {
            csrfToken: "fixture-csrf",
            pi: { available: false },
            fullScore: { pi: { ready: false }, deepseek: { ready: false } },
          }
        : { records: [], scores: [], warnings: [] },
    );
  };
  w.eval(bundle.outputFiles[0].text);
  await until(
    () =>
      staticSite
        ? w.document.querySelector(".score-document-heading h1")
        : w.document.querySelector("[data-fullscore-jobs]") &&
          requests.some((p) => p.endsWith("/api/library")),
    "练习室应完成启动和曲库同步",
  );
  return { w, doc: w.document, requests };
}
