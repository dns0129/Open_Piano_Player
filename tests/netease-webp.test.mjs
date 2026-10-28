import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import {
  createNeteaseScoreProvider,
  mergeScorePages,
} from "../lib/netease-scores.mjs";
import { createAppServer } from "../server.mjs";

const source = "https://music.163.com/sheet?id=123";
const imageUrl =
  "https://p6.music.126.net/synthetic-score.jpg?signature=fixture";
// Synthetic source only. The real CDN failure returns WebP bytes labelled JPEG.
const webp = await sharp({
  create: { width: 848, height: 1200, channels: 3, background: "#f2f2f2" },
})
  .webp({ quality: 90 })
  .toBuffer();
function provider(buffer = webp) {
  let fetches = 0;
  const service = createNeteaseScoreProvider({
    sessionStore: {
      read: async () => ({ cookie: "MUSIC_U=synthetic-test-only" }),
    },
    sdk: async () => ({
      body: {
        code: 200,
        data: {
          title: "合成测试谱",
          pageCount: 1,
          pages: [{ pageNumber: 1, url: imageUrl }],
        },
      },
    }),
    fetcher: async (url, options) => {
      fetches++;
      assert.equal(url, imageUrl);
      assert.deepEqual(options.allowedHosts, ["p6.music.126.net"]);
      return {
        buffer,
        headers: { "content-type": "image/jpeg;charset=UTF-8" },
      };
    },
  });
  return { service, fetches: () => fetches };
}

test("CDN WebP bytes labelled JPEG are previewed unchanged with their real media type and hash", async (t) => {
  const { service, fetches } = provider();
  t.after(() => service.close());
  const preview = await service.preview("123", source, "owner");
  const image = await service.image(preview.id, 1, "owner");
  assert.equal(image.mimeType, "image/webp");
  assert.deepEqual(image.buffer, webp);
  assert.equal(image.sha256, createHash("sha256").update(webp).digest("hex"));
  assert.deepEqual(await service.image(preview.id, 1, "owner"), image);
  assert.equal(fetches(), 1);
  await assert.rejects(service.image(preview.id, 1, "other"), {
    code: "NETEASE_IMPORT_EXPIRED",
  });
});

test("WebP PDF conversion matches lossless PNG embedding at the original pixel dimensions", async () => {
  const png = await sharp(webp, { limitInputPixels: 45000000 })
    .png()
    .toBuffer();
  const actual = await mergeScorePages([
    { buffer: webp, mimeType: "image/webp" },
  ]);
  const expected = await mergeScorePages([
    { buffer: png, mimeType: "image/png" },
  ]);
  assert.deepEqual(
    actual,
    expected,
    "WebP conversion must preserve the decoded source pixels without resizing",
  );
  const pdf = await PDFDocument.load(actual),
    page = pdf.getPage(0);
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(Math.abs(page.getHeight() / page.getWidth() - 1200 / 848) < 1e-6);
});

test("a corrupt WebP header cannot be cached or imported as a valid score image", async (t) => {
  const { service } = provider(
    Buffer.from("RIFF\u0008\u0000\u0000\u0000WEBPbroken"),
  );
  t.after(() => service.close());
  const preview = await service.preview("123", source, "owner");
  await assert.rejects(service.image(preview.id, 1, "owner"), {
    code: "NETEASE_IMAGE",
  });
  await assert.rejects(
    service.pdf(preview.id, { pianoConfirmed: true }, "owner"),
    { code: "NETEASE_IMAGE" },
  );
});

test("lossless static WebP is supported while animated WebP is rejected as a score page", async (t) => {
  const lossless = await sharp(webp).webp({ lossless: true }).toBuffer();
  const still = provider(lossless).service;
  t.after(() => still.close());
  const preview = await still.preview("123", source, "owner");
  assert.deepEqual(
    (await still.image(preview.id, 1, "owner")).buffer,
    lossless,
  );
  const frames = Buffer.concat([
    Buffer.alloc(600 * 800 * 3, 20),
    Buffer.alloc(600 * 800 * 3, 245),
  ]);
  const animated = await sharp(frames, {
    raw: { width: 600, height: 1600, channels: 3, pageHeight: 800 },
  })
    .webp({ lossless: true, loop: 0 })
    .toBuffer();
  assert.equal(
    (await sharp(animated).metadata()).pages,
    2,
    "fixture must contain two distinct frames",
  );
  const moving = provider(animated).service;
  t.after(() => moving.close());
  const animation = await moving.preview("123", source, "owner");
  await assert.rejects(moving.image(animation.id, 1, "owner"), {
    code: "NETEASE_IMAGE",
  });
});

test("real NetEase HTTP routes serve WebP previews and an all-page PDF while enforcing session scope", async (t) => {
  const { service, fetches } = provider();
  const server = createAppServer({
    neteaseProvider: service,
    fullScoreJobs: { close: async () => {} },
    statusReader: async () => ({ available: false }),
    settingsStore: { read: async () => ({}) },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(base + "/api/status"),
    cookie = initial.headers.get("set-cookie").split(";")[0],
    status = await initial.json();
  const headers = {
    cookie,
    "content-type": "application/json",
    "x-csrf-token": status.csrfToken,
    origin: base,
  };
  const post = (path, body) =>
    fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  const response = await post("/api/netease/preview", {
    sheetId: "123",
    sourceUrl: source,
  });
  assert.equal(response.status, 200);
  const preview = await response.json();
  const page = await fetch(base + preview.pages[0].url, {
    headers: { cookie },
  });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("content-type"), "image/webp");
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await page.arrayBuffer()), webp);
  const other = await fetch(base + "/api/status"),
    otherCookie = other.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await fetch(base + preview.pages[0].url, {
        headers: { cookie: otherCookie },
      })
    ).status,
    404,
  );
  const pdf = await post("/api/netease/pdf", {
    id: preview.id,
    pianoConfirmed: true,
  });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(
    (await PDFDocument.load(await pdf.arrayBuffer())).getPageCount(),
    1,
  );
  assert.equal(fetches(), 1, "PDF uses the validated original cached image");
});
