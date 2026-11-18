import test from "node:test";
import assert from "node:assert/strict";
import { boot, until } from "./app-harness.mjs";

const musicxml = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>流程测试曲</work-title></work><identification><creator type="composer">Tester</creator></identification><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes><note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><staff>1</staff></note><backup><duration>4</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><staff>2</staff></note></measure></part></score-partwise>`;

test("opening the library waits behind progress, unlocks after an error, and can retry", async (t) => {
  let complete;
  const { doc, requests } = await boot(t, {
    fetchResponse: (path) =>
      path === "/api/library"
        ? new Promise((resolve) => {
            complete = resolve;
          })
        : undefined,
  });
  const app = doc.querySelector("#app");
  assert.ok(!app.inert, "preloading during practice leaves it interactive");
  doc.querySelector('.main-nav [data-nav="library"]').click();
  assert.ok(doc.querySelector("#library-loading:not([hidden]) progress"));
  assert.equal(app.inert, true);
  assert.equal(requests.filter((path) => path === "/api/library").length, 1);
  complete(Response.json({ error: "暂时无法读取" }, { status: 500 }));
  await until(() => !app.inert, "曲库失败后应恢复操作");
  assert.ok(doc.querySelector("#library-loading").hidden);
  assert.match(
    doc.querySelector(".view-library [role=alert]").textContent,
    /暂时无法读取/,
  );
  doc.querySelector("[data-library-retry]").click();
  assert.ok(!doc.querySelector("#library-loading").hidden);
  await until(
    () => requests.filter((path) => path === "/api/library").length === 2,
    "重试应重新读取曲库",
  );
  complete(Response.json({ records: [] }));
  await until(() => !app.inert, "加载成功后应恢复操作");
  assert.ok(doc.querySelector("#library-loading").hidden);
  assert.ok(doc.querySelector(".view-library .cloud-library-empty"));
});

// Import through the real file input, then export through the export dialog;
// the parsers and exporters are loaded on demand along the way.
test("a MusicXML import reaches the practice room and exports as MusicXML and MIDI", async (t) => {
  const { w, doc } = await boot(t, { staticSite: true });
  const downloads = [];
  w.URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return "blob:fixture";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.at(-1).fileName = this.download;
  };

  const input = doc.querySelector("#file-input");
  const file = new w.File([musicxml], "flow.musicxml", {
    type: "application/vnd.recordare.musicxml+xml",
  });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new w.Event("change"));
  await until(
    () => doc.querySelector(".practice-current")?.textContent === "流程测试曲",
    "导入后练习室应显示新曲",
  );
  assert.match(
    doc.querySelector('.main-nav [data-nav="library"] small')?.textContent ||
      "",
    /^1$/,
    "曲库计数应包含新导入的曲目",
  );

  doc.querySelector("[data-export]").click();
  doc.querySelector('[data-format="xml"]').click();
  await until(() => downloads.length === 1, "应生成 MusicXML 文件");
  assert.equal(downloads[0].fileName, "流程测试曲.musicxml");
  const xml = await downloads[0].text();
  assert.match(xml, /<score-partwise/);
  assert.match(xml, /流程测试曲/);

  doc.querySelector("[data-export]").click();
  doc.querySelector('[data-format="midi"]').click();
  await until(() => downloads.length === 2, "应生成 MIDI 文件");
  assert.equal(downloads[1].fileName, "流程测试曲.mid");
  const header = new Uint8Array(await downloads[1].arrayBuffer()).slice(0, 4);
  assert.equal(String.fromCharCode(...header), "MThd");
});

test("a late original score keeps the editor and shares its source request", async (t) => {
  const { normalizeLibraryRecord } = await import("../lib/library-format.ts");
  const { starterScore } = await import("../lib/starter-score.mjs");
  const score = { ...starterScore, id: "with-source" };
  const record = normalizeLibraryRecord({
    score,
    sourceNotation: {
      version: 1,
      scoreId: score.id,
      systems: [{ id: "row", page: 1, system: 1 }],
      notes: [{ noteId: score.notes[0].id, page: 1, system: 1, x: 10, y: 10 }],
    },
    assets: [{ id: "row", mimeType: "image/png", data: "YQ==" }],
  });
  const pending = [];
  const { w, doc } = await boot(t, {
    fetchResponse: (path) =>
      path === "/api/library"
        ? Response.json({ records: [record] })
        : path.includes("/records/")
          ? new Promise((resolve) => pending.push(resolve))
          : undefined,
  });
  w.URL.createObjectURL = () => "blob:row";
  w.URL.revokeObjectURL = () => {};
  doc.querySelector('.main-nav [data-nav="library"]').click();
  await until(() => doc.querySelector('[data-open="with-source"]'), "曲目录入");
  doc.querySelector('[data-open="with-source"]').click();
  await until(() => pending.length, "开始读取原谱");
  doc.querySelector("[data-edit-notes]").click();
  const host = doc.querySelector("#note-editor-host");
  await new Promise((resolve) => setImmediate(resolve));
  const total = pending.length;
  for (const resolve of pending) resolve(Response.json(record));
  await until(() => doc.querySelector('[data-mode="source"]'), "原图参考入口");
  assert.equal(total, 1);
  assert.equal(doc.querySelector("#note-editor-host"), host);
  await until(() => host.childElementCount, "编辑器可用");
});

test("startup restoration respects navigation while the catalogue is loading", async (t) => {
  const { starterScore } = await import("../lib/starter-score.mjs");
  const score = { ...starterScore, id: "remembered", title: "上次练习" };
  let finish;
  const { doc } = await boot(t, {
    beforeStart: (w) =>
      w.localStorage.setItem("qinban-active-score", JSON.stringify(score.id)),
    fetchResponse: (path) =>
      path === "/api/library"
        ? new Promise((r) => (finish = r))
        : path === "/api/cloud-library"
          ? Response.json({ version: 1, scores: [] })
          : undefined,
  });
  doc.querySelector('.main-nav [data-nav="search"]').click();
  finish(Response.json({ records: [{ id: score.id, score }] }));
  await until(
    () =>
      doc.querySelector('.main-nav [data-nav="library"] small').textContent ===
      "1",
    "曲库加载",
  );
  assert.ok(doc.querySelector(".view-search"));
});

test("a hosted practice link opens only the selected document and skips the original PDF", async (t) => {
  const { starterScore } = await import("../lib/starter-score.mjs");
  const { readScoreDocument } = await import("../lib/score-document.ts");
  const records = [1, 2].map((i) => ({
    entryId: "e" + i,
    documentId: "d" + i,
    title: "私有曲" + i,
    instrument: "piano",
    revision: 1,
  }));
  const score = { ...starterScore, id: "d2", title: records[1].title };
  const { doc, requests, startup } = await boot(t, {
    hosted: true,
    url: "http://localhost/practice.html?entry=e2",
    fetchResponse(path) {
      if (path === "/api/v1/session")
        return Response.json({
          user: { id: "a", state: "active" },
          sessionId: "s",
        });
      if (path === "/api/v1/library/entries?limit=100")
        return Response.json({ records });
      if (path === "/api/v1/library/entries/e2")
        return Response.json({
          summary: records[1],
          document: readScoreDocument(score),
          sourceNotation: null,
          assets: [{ role: "original", resourceId: "pdf" }],
        });
    },
  });
  await startup;
  assert.equal(doc.querySelector(".practice-current").textContent, "私有曲2");
  assert.equal(
    requests.filter((p) => p === "/api/v1/library/entries/e2").length,
    1,
  );
  assert.equal(requests.includes("/api/v1/library/entries/e1"), false);
  assert.equal(requests.includes("/api/v1/resources/pdf"), false);
});

test("a delayed first hosted sign-in preserves the user's navigation", async (t) => {
  let authenticate;
  const { doc, startup } = await boot(t, {
    hosted: true,
    fetchResponse: (path) => {
      if (path === "/api/v1/session")
        return new Promise((resolve) => (authenticate = resolve));
      if (path.endsWith("/cloud-library/index.json"))
        return Response.json({ version: 1, scores: [] });
      return Response.json({ records: [] });
    },
  });
  await until(() => authenticate, "准备账号请求");
  doc.querySelector('.main-nav [data-nav="search"]').click();
  authenticate(
    Response.json({ user: { id: "a", state: "active" }, sessionId: "s" }),
  );
  await startup;
  assert.ok(doc.querySelector(".view-search"));
});
