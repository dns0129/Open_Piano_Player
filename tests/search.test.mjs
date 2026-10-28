import test from "node:test";
import assert from "node:assert/strict";
import {
  createScoreSearch,
  createGithubMidiProvider,
  parseDuckDuckGo,
  parseSogou,
  parseBingHtml,
  relevanceScore,
  mergeProviderResults,
  discoverScoreFiles,
  searchWeb,
} from "../lib/public-library.mjs";
import {
  isPublicAddress,
  normalizePublicUrl,
  validatePublicTarget,
} from "../lib/safe-network.mjs";
import { importScore } from "../lib/importers.mjs";
import MidiPackage from "@tonejs/midi/build/Midi.js";
const { Midi } = MidiPackage;

const html = `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fscores.example.org%2Fqing-tian.pdf&amp;rut=x">晴天 · 周杰伦 &amp; Piano</a>`;
const searchEngine = async (q) => ({
  ok: true,
  engine: "test fixture",
  results: [
    {
      title: q + "真实谱面",
      url: "https://scores.example.org/view/song",
      format: "web",
    },
  ],
});
test("search parses genuine engine markup including encoded outbound links and arbitrary song names", async () => {
  const rows = parseDuckDuckGo(html);
  assert.equal(rows[0].url, "https://scores.example.org/qing-tian.pdf");
  assert.equal(rows[0].title, "晴天 · 周杰伦 & Piano");
  assert.equal(rows[0].format, "pdf");
  const lite = parseDuckDuckGo(
    html.replace("result__a", "result-link").replaceAll('"', "'"),
  );
  assert.equal(lite.length, 1);
  let queried;
  const service = createScoreSearch({
    searchEngine: async (q) => {
      queried = q;
      return searchEngine(q);
    },
  });
  const report = await service.search(
    "不在任何内置目录的任意新歌",
    "session-a",
  );
  assert.equal(queried, "不在任何内置目录的任意新歌");
  assert.equal(report.results.length, 1);
  assert.equal(report.network.attempted, true);
  assert.equal(report.network.ok, true);
});
test("blocked search is disclosed and never converted into fabricated online results", async () => {
  const service = createScoreSearch({
    searchEngine: async () => ({
      ok: false,
      engine: "blocked",
      results: [],
      message: "搜索引擎要求验证",
    }),
  });
  const report = await service.search("尚无来源的新歌", "a");
  assert.equal(report.results.length, 0);
  assert.equal(report.network.ok, false);
  assert.match(report.warning, /要求验证/);
  assert.ok(report.externalSearchUrl.startsWith("https://"));
});
test("live search sends the original query to HTTP and falls back honestly when captcha appears", async () => {
  const calls = [];
  const result = await searchWeb("晴天 周杰伦", {
    cache: new Map(),
    fetcher: async (url) => {
      calls.push(new URL(url));
      return {
        buffer: Buffer.from(
          url.includes("html.duckduckgo")
            ? "captcha anomaly"
            : url.includes("lite.duckduckgo")
              ? html
              : url.includes("archive.org")
                ? '{"response":{"docs":[]}}'
                : "<html></html>",
        ),
      };
    },
  });
  assert.ok(
    calls
      .find((url) => url.hostname === "html.duckduckgo.com")
      .searchParams.get("q")
      .startsWith("晴天 周杰伦"),
  );
  assert.equal(result.engine, "DuckDuckGo");
  assert.equal(result.results[0].format, "pdf");
  assert.equal(result.providerStatuses.length, 7);
  assert.equal(result.state, "partial");
});
function midiFixture({ ensemble = false } = {}) {
  const midi = new Midi();
  midi.header.setTempo(96);
  const right = midi.addTrack();
  right.instrument.number = 0;
  right.addNote({ midi: 72, time: 0, duration: 0.625, velocity: 0.8 });
  const left = midi.addTrack();
  left.instrument.number = ensemble ? 73 : 0;
  left.addNote({ midi: 48, time: 0, duration: 1.25, velocity: 0.7 });
  return Buffer.from(midi.toArray());
}
const fixtureCommit = "1234567890abcdef1234567890abcdef12345678";
const catalogueBuffer = (url, tree) =>
  Buffer.from(
    JSON.stringify(
      url.includes("/git/ref/")
        ? { object: { type: "commit", sha: fixtureCommit } }
        : { truncated: false, tree },
    ),
  );
test("live GitHub catalogue finds arbitrary named MIDI files and verifies search to registered download to importer", async () => {
  const binary = midiFixture(),
    calls = [],
    filename = "目录新曲甲.mid";
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return {
      url,
      headers: {
        "content-type": url.includes("api.github.com")
          ? "application/json"
          : "audio/midi",
      },
      buffer: url.includes("api.github.com")
        ? catalogueBuffer(url, [
            {
              type: "blob",
              path: "piano/" + filename,
              size: binary.length,
              sha: "public-sha",
            },
          ])
        : binary,
    };
  };
  const searchEngine = (query, options) =>
    searchWeb(query, {
      ...options,
      providers: [createGithubMidiProvider(query)],
      cache: new Map(),
    });
  const service = createScoreSearch({ searchEngine, fetcher }),
    report = await service.search("目录新曲甲", "session");
  assert.equal(report.results.length, 1);
  assert.equal(report.network.scope, "site");
  assert.equal(report.providerStatuses[0].id, "github-midi");
  const row = report.results[0];
  assert.equal(row.verified, true);
  assert.equal(row.importable, true);
  assert.equal(row.format, "midi");
  assert.equal(row.filename, filename);
  assert.equal(row.pianoOnly, true);
  assert.equal(row.instrumentation, "piano");
  assert.equal(row.noteCount, 2);
  assert.equal(row.repositoryRef, fixtureCommit);
  assert.equal(
    row.url,
    "https://raw.githubusercontent.com/callmeyyzx/midi/" +
      fixtureCommit +
      "/piano/" +
      encodeURIComponent(filename),
  );
  assert.equal(
    row.sourceUrl,
    "https://github.com/callmeyyzx/midi/blob/" +
      fixtureCommit +
      "/piano/" +
      encodeURIComponent(filename),
  );
  assert.ok(row.downloadUrl.startsWith("/api/import-score?id="));
  assert.equal(row.composer, undefined);
  assert.match(row.license, /未声明/);
  const downloaded = await service.download(row.id, "session"),
    parsed = await importScore(downloaded.buffer, downloaded.filename);
  assert.equal(downloaded.filename, filename);
  assert.equal(parsed.score.notes.length, row.noteCount);
  assert.deepEqual(calls.at(-1).options.allowedHosts, [
    "raw.githubusercontent.com",
  ]);
  await assert.rejects(
    () => service.download(row.id, "another-session"),
    (e) => e.code === "SEARCH_RESULT_EXPIRED",
  );
});
test("GitHub directory and verified MIDI metadata cache across queries, while artist and arrangement remain source bounded", async () => {
  const piano = midiFixture(),
    ensemble = midiFixture({ ensemble: true }),
    calls = [];
  const tree = [
    "(SG)青花瓷.mid",
    "【经典改编】稻香 - 周杰伦.mid",
    "qfl.mid",
    "晴天 - 另一位歌手.mid",
    "../青花瓷.mid",
    "卡农.mid",
  ].map((path, i) => ({
    type: "blob",
    path,
    size: piano.length,
    sha: "sha" + i,
  }));
  const fetcher = async (url) => {
    calls.push(url);
    return {
      buffer: url.includes("api.github.com")
        ? catalogueBuffer(url, tree)
        : decodeURIComponent(url).includes("稻香")
          ? ensemble
          : piano,
    };
  };
  const run = (query) =>
    searchWeb(query, {
      providers: [createGithubMidiProvider(query)],
      fetcher,
      cache: new Map(),
    });
  const first = await run("青花瓷");
  assert.equal(first.results.length, 1);
  assert.equal(first.results[0].title, "青花瓷");
  assert.equal((await run("青花瓷 钢琴谱")).results.length, 1);
  assert.equal(calls.filter((url) => url.includes("/git/ref/")).length, 1);
  assert.equal(calls.filter((url) => url.includes("/git/trees/")).length, 1);
  assert.equal(
    calls.filter((url) => url.includes("raw.githubusercontent.com")).length,
    1,
  );
  assert.equal((await run("青花瓷 周杰伦")).results.length, 0);
  assert.equal((await run("起风了")).results.length, 0);
  assert.equal((await run("晴天 周杰伦")).results.length, 0);
  const arranged = await run("稻香 周杰伦");
  assert.equal(arranged.results.length, 1);
  assert.equal(arranged.results[0].instrumentation, "ensemble");
  assert.equal(arranged.results[0].pianoOnly, false);
  assert.match(arranged.results[0].warnings[0], /合奏 MIDI/);
  assert.equal((await run("卡农 周杰伦")).results.length, 0);
  assert.equal((await run("卡农")).results.length, 1);
});
test("GitHub rate limits and unparseable files are not reported as verified importable scores", async () => {
  const blocked = await searchWeb("青花瓷", {
    providers: [createGithubMidiProvider("青花瓷")],
    cache: new Map(),
    fetcher: async () => {
      throw Object.assign(new Error("rate limited"), { upstreamStatus: 403 });
    },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.providerStatuses[0].status, "blocked");
  assert.equal(blocked.results.length, 0);
  const invalid = await searchWeb("坏曲", {
    providers: [createGithubMidiProvider("坏曲")],
    cache: new Map(),
    fetcher: async (url) => ({
      buffer: url.includes("api.github.com")
        ? catalogueBuffer(url, [
            { type: "blob", path: "坏曲.mid", size: 100, sha: "bad" },
          ])
        : Buffer.from("<html>login</html>"),
    }),
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.providerStatuses[0].status, "error");
  assert.equal(invalid.results.length, 0);
  assert.match(invalid.providerStatuses[0].message, /无法完成实际解析/);
});
test("cached verification and actual download use the same immutable GitHub commit after main changes", async () => {
  const piano = midiFixture(),
    changed = midiFixture({ ensemble: true }),
    requests = [];
  let mainChanged = false;
  const fetcher = async (url) => {
    requests.push(url);
    return {
      url,
      headers: { "content-type": "audio/midi" },
      buffer: url.includes("api.github.com")
        ? catalogueBuffer(url, [
            {
              type: "blob",
              path: "晴天.mid",
              size: piano.length,
              sha: "original-blob",
            },
          ])
        : url.includes("/" + fixtureCommit + "/")
          ? piano
          : mainChanged
            ? changed
            : piano,
    };
  };
  const service = createScoreSearch({
    fetcher,
    searchEngine: (query, options) =>
      searchWeb(query, {
        ...options,
        providers: [createGithubMidiProvider(query)],
        cache: new Map(),
      }),
  });
  const original = await service.search("晴天", "session");
  mainChanged = true;
  const again = await service.search("晴天 钢琴谱", "session"),
    download = await service.download(again.results[0].id, "session");
  const midi = new Midi(download.buffer);
  assert.equal(original.results[0].pianoOnly, true);
  assert.equal(again.results[0].pianoOnly, true);
  assert.ok(midi.tracks.every((track) => track.instrument.family === "piano"));
  assert.ok(
    requests
      .filter((url) => url.includes("raw.githubusercontent.com"))
      .every((url) => url.includes("/" + fixtureCommit + "/")),
  );
  assert.equal(requests.filter((url) => url.includes("/git/ref/")).length, 1);
});
test("a later stalled MIDI candidate cannot discard an earlier actually parsed result", async () => {
  const binary = midiFixture(),
    tree = ["晴天.mid", "晴天 演奏.mid"].map((path, i) => ({
      type: "blob",
      path,
      size: binary.length,
      sha: "blob" + i,
    }));
  const result = await searchWeb("晴天", {
    providers: [createGithubMidiProvider("晴天")],
    cache: new Map(),
    providerTimeoutMs: 80,
    totalTimeoutMs: 300,
    fetcher: async (url) => {
      if (url.includes("api.github.com"))
        return { buffer: catalogueBuffer(url, tree) };
      if (decodeURIComponent(url).includes("演奏"))
        await new Promise((resolve) => setTimeout(resolve, 140));
      return { buffer: binary };
    },
  });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].filename, "晴天.mid");
  assert.equal(result.results[0].verified, true);
  assert.equal(result.providerStatuses[0].status, "ok");
  assert.match(
    result.providerStatuses[0].message,
    /1 个匹配文件无法完成实际解析/,
  );
});
test("independent engines merge duplicate URLs while retaining both provider attributions", async () => {
  const row = {
    title: "晴天 周杰伦 钢琴谱",
    url: "https://score.example.org/song?utm_source=x",
  };
  const providers = [
    { id: "a", name: "A", scope: "web", run: async () => ({ rows: [row] }) },
    {
      id: "b",
      name: "B",
      scope: "web",
      run: async () => ({
        rows: [{ ...row, url: "https://www.score.example.org/song" }],
      }),
    },
    {
      id: "c",
      name: "C",
      scope: "web",
      run: async () => ({ status: "blocked", rows: [], message: "验证" }),
    },
  ];
  const result = await searchWeb("晴天 周杰伦", {
    providers,
    cache: new Map(),
  });
  assert.equal(result.sourcesCount, 2);
  assert.equal(result.results.length, 1);
  assert.deepEqual(
    result.results[0].providers.map((p) => p.id),
    ["a", "b"],
  );
  assert.equal(result.state, "partial");
  assert.equal(result.providerStatuses[2].status, "blocked");
});
test("song, artist and score relevance reject camera, lyrics and other songs by the same artist", () => {
  assert.equal(
    relevanceScore(
      { title: "Canon Cameras", url: "https://canon.com/cameras" },
      "Canon in D",
    ),
    0,
  );
  assert.equal(
    relevanceScore(
      { title: "周杰伦 晴天歌词", url: "https://lyrics.example.org" },
      "晴天 周杰伦",
    ),
    0,
  );
  assert.equal(
    relevanceScore(
      { title: "周杰伦 七里香钢琴谱", url: "https://score.example.org" },
      "晴天 周杰伦",
    ),
    0,
  );
  assert.equal(
    relevanceScore(
      {
        title: "Canon Gigant",
        catalogScore: true,
        url: "https://archive.org/details/other",
      },
      "卡农",
    ),
    0,
  );
  assert.ok(
    relevanceScore(
      {
        title: "Canon in D",
        composer: "Pachelbel",
        catalogScore: true,
        url: "https://archive.org/details/canon",
      },
      "卡农",
    ) > 0,
  );
  assert.equal(
    relevanceScore(
      {
        title: "Canon in D",
        composer: "Pachelbel",
        catalogScore: true,
        url: "https://archive.org/details/canon",
      },
      "卡农 周杰伦",
    ),
    0,
  );
  assert.equal(
    relevanceScore(
      {
        title: "致爱丽丝 钢琴谱",
        composer: "贝多芬",
        url: "https://score.example.org/elise.mid",
      },
      "致爱丽丝 周杰伦",
    ),
    0,
  );
  assert.ok(
    relevanceScore(
      {
        title: "Canon in D",
        composer: "Pachelbel",
        catalogScore: true,
        url: "https://archive.org/details/canon",
      },
      "卡农 Pachelbel",
    ) > 0,
  );
  assert.equal(
    relevanceScore(
      {
        title: "Canon in D",
        snippet: "周杰伦也弹卡农",
        composer: "Pachelbel",
        catalogScore: true,
        url: "https://archive.org/details/canon",
      },
      "卡农 周杰伦",
    ),
    0,
  );
  assert.ok(
    relevanceScore(
      { title: "起風了 鋼琴譜", url: "https://score.example.org" },
      "起风了",
    ) > 0,
  );
  assert.equal(
    relevanceScore(
      {
        title: "An Innocent Man - Billy Joel",
        url: "https://score.example.org/innocent.mid",
      },
      "Piano Man Billy Joel",
    ),
    0,
  );
  assert.ok(
    relevanceScore(
      {
        title: "Piano Man - Billy Joel",
        url: "https://score.example.org/piano-man.mid",
      },
      "Piano Man Billy Joel",
    ) > 0,
  );
});
test("Sogou result metadata binds its own title to original URL rather than the next card", () => {
  const page =
    '<h3>前一条曲谱</h3><div data-url="https://score.example.org/first" data-title="' +
    encodeURIComponent("晴天 周杰伦钢琴谱") +
    '"></div><h3>下一条无关结果</h3><div data-url="https://score.example.org/next" data-title="' +
    encodeURIComponent("七里香钢琴谱") +
    '"></div>';
  const rows = parseSogou(page);
  assert.equal(rows[0].title, "晴天 周杰伦钢琴谱");
  assert.equal(rows[0].url, "https://score.example.org/first");
  assert.equal(rows[1].title, "七里香钢琴谱");
  const target = "https://score.example.org/canon.pdf";
  const bing = parseBingHtml(
    '<h2><a href="https://www.bing.com/ck/a?u=a1' +
      Buffer.from(target).toString("base64url") +
      '">Canon in D piano sheet music</a></h2>',
  );
  assert.equal(bing[0].url, target);
});
test("scheduler limits concurrency to three and retains success when another provider times out", async () => {
  let active = 0,
    maximum = 0;
  const providers = Array.from({ length: 6 }, (_, index) => ({
    id: "p" + index,
    name: "P" + index,
    run: async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return {
        rows: [
          { title: "晴天 钢琴谱", url: "https://score.example.org/" + index },
        ],
      };
    },
  }));
  providers.push({
    id: "timeout",
    name: "超时源",
    run: () => new Promise(() => {}),
  });
  const result = await searchWeb("晴天", {
    providers,
    cache: new Map(),
    providerTimeoutMs: 20,
    totalTimeoutMs: 200,
  });
  assert.equal(maximum, 3);
  assert.equal(result.sourcesCount, 6);
  assert.equal(result.providerStatuses.at(-1).status, "error");
  assert.equal(result.state, "partial");
});
test("only valid results are briefly cached, with no cached fake success for blocked engines", async () => {
  const cache = new Map();
  let goodCalls = 0,
    badCalls = 0;
  const providers = [
    {
      id: "good",
      name: "有结果",
      run: async () => {
        goodCalls++;
        return {
          rows: [
            { title: "晴天 钢琴谱", url: "https://score.example.org/good" },
          ],
        };
      },
    },
    {
      id: "bad",
      name: "受限",
      run: async () => {
        badCalls++;
        return { status: "blocked", rows: [] };
      },
    },
  ];
  await searchWeb("晴天", { providers, cache });
  const again = await searchWeb("晴天", { providers, cache });
  assert.equal(goodCalls, 1);
  assert.equal(badCalls, 2);
  assert.equal(again.providerStatuses[0].cached, true);
  assert.equal(again.providerStatuses[1].status, "blocked");
});
test("official search APIs use fixed documented endpoints and never expose their keys", async () => {
  const seen = [];
  const config = {
    braveApiKey: "private-brave",
    tavilyApiKey: "private-tavily",
    serperApiKey: "private-serper",
  };
  const result = await searchWeb("晴天", {
    searchConfig: config,
    cache: new Map(),
    fetcher: async (url, options) => {
      seen.push({ url, options });
      let data = url.includes("api.search.brave.com")
        ? {
            web: {
              results: [
                {
                  title: "晴天 钢琴谱",
                  url: "https://scores.example.org/brave",
                },
              ],
            },
          }
        : url.includes("api.tavily.com")
          ? {
              results: [
                {
                  title: "晴天 钢琴谱",
                  url: "https://scores.example.org/tavily",
                },
              ],
            }
          : url.includes("google.serper.dev")
            ? {
                organic: [
                  {
                    title: "晴天 钢琴谱",
                    link: "https://scores.example.org/serper",
                  },
                ],
              }
            : url.includes("archive.org")
              ? { response: { docs: [] } }
              : null;
      return { buffer: Buffer.from(data ? JSON.stringify(data) : "captcha") };
    },
  });
  assert.equal(result.sourcesCount, 3);
  assert.equal(
    seen.find((item) => item.url.includes("api.search.brave.com")).options
      .headers["X-Subscription-Token"],
    "private-brave",
  );
  assert.equal(
    seen.find((item) => item.url.includes("api.tavily.com")).options.method,
    "POST",
  );
  assert.equal(
    seen.find((item) => item.url.includes("google.serper.dev")).options.headers[
      "X-API-KEY"
    ],
    "private-serper",
  );
  assert.ok(!JSON.stringify(result).includes("private-"));
  assert.equal(
    result.providerStatuses.filter((item) => item.scope === "api").length,
    3,
  );
});
test("inspect only exposes public score anchors and appropriate score images", () => {
  const found = discoverScoreFiles(
    `<title>晴天 原版</title><a href="/file/song.musicxml">谱面</a><img alt="晴天 五线谱" data-src="https://cdn.example.org/sheet/1.png"><img alt="logo" src="/logo.png"><a href="javascript:unlockPaywall()">VIP下载</a><script>var hidden='https://secret.example.org/member.pdf';</script>`,
    "https://scores.example.org/song",
  );
  assert.equal(found.files.length, 2);
  assert.equal(found.files[0].format, "musicxml");
  assert.equal(found.files[1].format, "image");
  assert.ok(!JSON.stringify(found).includes("secret.example.org"));
});
test("downloads are bound to a session and exact registered result, with real file validation", async () => {
  const requests = [];
  const service = createScoreSearch({
    searchEngine,
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return url.endsWith("/view/song")
        ? {
            url,
            headers: { "content-type": "text/html" },
            buffer: Buffer.from('<a href="/score.pdf">原谱PDF</a>'),
          }
        : {
            url,
            headers: { "content-type": "application/pdf" },
            buffer: Buffer.from("%PDF-1.7\ntest"),
          };
    },
  });
  const report = await service.search("晴天 周杰伦", "session-a");
  const row = report.results[0];
  assert.equal(row.format, "web");
  await assert.rejects(
    () => service.resolve(row.id, "session-b"),
    (e) => e.code === "SEARCH_RESULT_EXPIRED",
  );
  const resolved = await service.resolve(row.id, "session-a");
  assert.equal(resolved.files.length, 1);
  assert.equal(resolved.files[0].format, "pdf");
  const result = await service.download(resolved.files[0].id, "session-a");
  assert.equal(result.format, "pdf");
  assert.equal(result.filename, "score.pdf");
  assert.equal(requests.at(-1).url, "https://scores.example.org/score.pdf");
  assert.deepEqual(requests.at(-1).options.allowedHosts, [
    "scores.example.org",
  ]);
  await assert.rejects(
    () => service.download("https://127.0.0.1/private", "session-a"),
    (e) => e.code === "SEARCH_RESULT_EXPIRED",
  );
});
test("HTML login/error content cannot masquerade as a downloadable PDF", async () => {
  const service = createScoreSearch({
    searchEngine: async () => ({
      ok: true,
      results: [{ title: "song", url: "https://scores.example.org/score.pdf" }],
    }),
    fetcher: async (url) => ({
      url,
      headers: { "content-type": "text/html" },
      buffer: Buffer.from("<h1>Please log in to buy</h1>"),
    }),
  });
  const report = await service.search("song", "a");
  await assert.rejects(
    () => service.download(report.results[0].id, "a"),
    (e) => e.code === "INVALID_SCORE_FILE",
  );
});
test("private, loopback, metadata, alternate IP spellings and unsafe schemes are denied", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.2",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700::1111"), true);
  for (const url of [
    "file:///etc/passwd",
    "https://localhost/a",
    "https://127.1/a",
    "https://2130706433/a",
    "https://user:pass@example.org/a",
    "https://example.org:3000/a",
  ])
    assert.throws(
      () => normalizePublicUrl(url),
      (e) => e.code === "UNSAFE_URL",
    );
  await assert.rejects(
    () =>
      validatePublicTarget("https://public-looking.example.org/a", {
        lookupImpl: async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
      }),
    (e) => e.code === "UNSAFE_URL",
  );
});
