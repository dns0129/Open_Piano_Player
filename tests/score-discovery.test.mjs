import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverScoreFiles,
  createScoreSearch,
  scoreFormat,
} from "../lib/public-library.mjs";

test("public PDF embedded in an iframe is offered as an actual score file", () => {
  const page = "https://scores.example.org/piano/flight";
  const result = discoverScoreFiles(
    '<title>Flight — Piano sheet music</title><iframe title="Piano score PDF" src="/scores/flight.pdf#view=FitH"></iframe>',
    page,
  );
  assert.deepEqual(
    result.files.map((row) => [row.url, row.format]),
    [["https://scores.example.org/scores/flight.pdf", "pdf"]],
  );
});

test("IMSLP File description pages ending in .pdf remain web pages, not downloadable PDF files", () => {
  assert.equal(
    scoreFormat("https://imslp.org/wiki/File:Public_Piano_Study.pdf"),
    "web",
  );
  assert.equal(
    scoreFormat("https://example.org/view.pdf", "text/html; charset=utf-8"),
    "web",
  );
  assert.equal(
    scoreFormat("https://cdn.example.org/Study.pdf", "application/pdf"),
    "pdf",
  );
});

test("Turnstile human verification is disclosed rather than reported as a page with no score links", async () => {
  const service = createScoreSearch({
    searchEngine: async () => ({
      ok: true,
      results: [
        {
          title: "Study",
          url: "https://scores.example.org/study",
          format: "web",
        },
      ],
    }),
    fetcher: async (url) => ({
      url,
      headers: { "content-type": "text/html" },
      buffer: Buffer.from(
        '<title>Free-scores.com</title><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script><p>Verifying you are human…</p><form action="/verify_human.php"><div class="cf-turnstile"></div></form>',
      ),
    }),
  });
  const report = await service.search("Study", "s");
  await assert.rejects(
    () => service.resolve(report.results[0].id, "s"),
    (error) => error.code === "SOURCE_RESTRICTED",
  );
});

test("hidden files, photo links, advertising iframes and unsafe embedded URLs are not exposed or followed", () => {
  const result = discoverScoreFiles(
    '<title>Piano sheet music</title><span class="hidden"><a href="/private.pdf">hidden</a></span><a href="/photo.png"><img alt="piano photo" src="/photo-thumb.png"></a><iframe src="https://ads.example.org/advert"></iframe><embed type="application/pdf" src="http://127.0.0.1/private.pdf"><script><a href="/script.pdf">secret</a></script>',
    "https://scores.example.org/study",
  );
  assert.equal(result.files.length, 0);
  assert.deepEqual(result.links || [], []);
});

test("full size image linked around a labelled score thumbnail is discoverable", () => {
  const result = discoverScoreFiles(
    '<title>晴天 钢琴谱</title><a href="/uploads/abc123.png"><img alt="晴天 五线谱 第1页" src="/uploads/abc123-thumb.png"></a>',
    "https://scores.example.org/song",
  );
  assert.equal(result.files.length, 1);
  assert.equal(
    result.files[0].url,
    "https://scores.example.org/uploads/abc123.png",
  );
  assert.equal(result.files[0].format, "image");
  assert.equal(result.files[0].preview, true);
});

test("source inspection follows a publicly embedded PDF viewer once without exposing its HTML as a downloadable score", async () => {
  const calls = [];
  const service = createScoreSearch({
    searchEngine: async () => ({
      ok: true,
      results: [
        {
          title: "Piano Study sheet music",
          url: "https://scores.example.org/study",
          format: "web",
        },
      ],
    }),
    fetcher: async (url) => {
      calls.push(url);
      if (new URL(url).pathname === "/study")
        return {
          url,
          headers: { "content-type": "text/html" },
          buffer: Buffer.from(
            '<title>Piano Study</title><iframe title="Piano score" src="/viewer/study"></iframe>',
          ),
        };
      if (url.endsWith("/viewer/study"))
        return {
          url,
          headers: { "content-type": "text/html" },
          buffer: Buffer.from(
            '<embed type="application/pdf" src="/files/study.pdf">',
          ),
        };
      return {
        url,
        headers: { "content-type": "application/pdf" },
        buffer: Buffer.from("%PDF-1.7\npublic score"),
      };
    },
  });
  const report = await service.search("Piano Study", "session");
  const resolved = await service.resolve(report.results[0].id, "session");
  assert.equal(resolved.files.length, 1);
  assert.equal(resolved.files[0].format, "pdf");
  assert.equal(
    resolved.files[0].url,
    "https://scores.example.org/files/study.pdf",
  );
  const file = await service.download(resolved.files[0].id, "session");
  assert.equal(file.format, "pdf");
  assert.deepEqual(calls, [
    "https://scores.example.org/study",
    "https://scores.example.org/viewer/study",
    "https://scores.example.org/files/study.pdf",
  ]);
});

test("IMSLP multi-edition work pages resolve only the corresponding solo piano files and keep each version licence", async () => {
  const block = (id, edition, license) =>
    `<h4>Piano Study</h4><h5>${edition}</h5><div class="we edition"><div id="IMSLP${id}"><a href="/wiki/File:Study_${id}.pdf">#${id}</a> - 0.2MB, 3 pp.</div><table><tr><th>Copyright</th><td>${license}</td></tr></table></div>`;
  const page =
    "<title>Piano Study (Composer, Name)</title>" +
    block("11", "For Piano (A)", "Public Domain") +
    block("22", "For Piano (B)", "CC BY-SA 4.0") +
    block("33", "For Violin and Piano", "Public Domain");
  const calls = [];
  const service = createScoreSearch({
    searchEngine: async () => ({
      ok: true,
      results: [
        {
          title: "Piano Study",
          url: "https://imslp.org/wiki/Study",
          format: "web",
        },
      ],
    }),
    fetcher: async (url) => {
      calls.push(url);
      return {
        url,
        headers: { "content-type": "text/html" },
        buffer: Buffer.from(
          url.endsWith("/wiki/Study")
            ? page
            : `<title>Piano Study</title><div class="fullMedia"><a href="https://cdn.imslp.org/files/Study_${url.includes("_11") ? "11" : "22"}.pdf">Original PDF</a></div>`,
        ),
      };
    },
  });
  const report = await service.search("Piano Study", "s"),
    resolved = await service.resolve(report.results[0].id, "s");
  assert.equal(resolved.files.length, 2);
  assert.equal(resolved.links.length, 2);
  assert.deepEqual(
    resolved.files.map((file) => file.license),
    ["Public Domain", "CC BY-SA 4.0"],
  );
  assert.ok(
    resolved.files.every(
      (file) => file.pianoSourceVerified && file.instrumentation === "piano",
    ),
  );
  assert.ok(!calls.some((url) => url.includes("_33")));
});

test("cross-origin HTML viewers remain inspectable links and are never fetched as part of a source crawl", async () => {
  const calls = [];
  const service = createScoreSearch({
    searchEngine: async () => ({
      ok: true,
      results: [
        {
          title: "Study",
          url: "https://scores.example.org/study",
          format: "web",
        },
      ],
    }),
    fetcher: async (url) => {
      calls.push(url);
      return {
        url,
        headers: { "content-type": "text/html" },
        buffer: Buffer.from(
          '<title>Piano Study</title><iframe title="Piano score" src="https://viewer.example.org/sheet"></iframe>',
        ),
      };
    },
  });
  const report = await service.search("Study", "s"),
    resolved = await service.resolve(report.results[0].id, "s");
  assert.equal(resolved.files.length, 0);
  assert.equal(resolved.links.length, 1);
  assert.equal(resolved.links[0].importable, false);
  assert.ok(resolved.links[0].resolveUrl);
  assert.deepEqual(calls, ["https://scores.example.org/study"]);
});
