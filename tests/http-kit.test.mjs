import test from "node:test";
import assert from "node:assert/strict";
import { createRouter, safeEqual } from "../lib/http-kit.mjs";
import { equal } from "../lib/accounts/common.mjs";

test("routes match in registration order and a * fallback only catches what specific methods left", () => {
  const seen = [];
  const router = createRouter()
    .add("GET", "/api/items", () => seen.push("list"))
    .add("GET", /^\/api\/items\/([a-z]+)$/, ({ params }) => seen.push(params))
    .add("*", /^\/api\/items\/([a-z]+)$/, () => seen.push("405"));
  router.match("GET", "/api/items").handler({});
  const one = router.match("GET", "/api/items/abc");
  one.handler(one);
  router.match("DELETE", "/api/items/abc").handler({});
  assert.deepEqual(seen, ["list", ["abc"], "405"]);
  assert.equal(router.match("POST", "/api/items"), null);
  assert.equal(router.match("GET", "/api/items/abc/extra"), null);
});

test("constant-time comparison rejects equal-length strings of different byte size instead of throwing", () => {
  for (const compare of [safeEqual, equal]) {
    assert.equal(compare("abcd", "abcd"), true);
    assert.equal(compare("abcd", "abce"), false);
    assert.equal(compare("abcd", "ab琴d"), false);
    assert.equal(compare("abcd", undefined), false);
  }
});

test("static files revalidate with ETag and Last-Modified and answer 304 without a body", async (t) => {
  const { mkdtemp, writeFile, utimes, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const http = await import("node:http");
  const { serveStatic } = await import("../lib/http-kit.mjs");
  const dir = await mkdtemp(join(tmpdir(), "qinban-static-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "piano.mp3"), "sample-v1");
  const fail = () => Object.assign(new Error("x"), { status: 404 });
  const errors = {
    tooLarge: fail,
    contentType: fail,
    invalidJson: fail,
    method: fail,
    notFound: fail,
    buildRequired: fail,
  };
  const server = http.createServer((req, res) =>
    serveStatic(req, res, {
      pathname: new URL(req.url, "http://x").pathname,
      distDir: dir,
      types: { ".mp3": "audio/mpeg" },
      errors,
      cacheControl: "no-cache",
    }).catch((e) => {
      res.writeHead(e.status || 500);
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/piano.mp3`;
  const first = await fetch(url);
  assert.equal(first.status, 200);
  assert.equal(await first.text(), "sample-v1");
  assert.equal(first.headers.get("cache-control"), "no-cache");
  const etag = first.headers.get("etag"),
    modified = first.headers.get("last-modified");
  assert.match(etag, /^W\/"/);

  const again = await fetch(url, { headers: { "if-none-match": etag } });
  assert.equal(again.status, 304);
  assert.equal(await again.text(), "");
  assert.equal(
    (await fetch(url, { headers: { "if-modified-since": modified } })).status,
    304,
  );

  await writeFile(join(dir, "piano.mp3"), "sample-v2!");
  await utimes(join(dir, "piano.mp3"), new Date(), new Date(Date.now() + 5000));
  const changed = await fetch(url, { headers: { "if-none-match": etag } });
  assert.equal(changed.status, 200);
  assert.equal(await changed.text(), "sample-v2!");
});
