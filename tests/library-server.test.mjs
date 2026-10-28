import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { createAppServer } from "../server.mjs";
import { createLibraryStore } from "../lib/library-store.mjs";

test("unified HTTP library is shared across browser sessions, preserves Unicode IDs and gates all mutations", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "qinban-library-http-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = createAppServer({
    libraryStore: createLibraryStore({
      directory,
      legacyLibrary: {
        list: async () => ({ scores: [], warnings: ["旧记录未能读取。"] }),
      },
    }),
    fullScoreJobs: { close: async () => {} },
    neteaseProvider: { close() {} },
    statusReader: async () => ({ available: false }),
    settingsStore: { read: async () => ({}) },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  const base = "http://127.0.0.1:" + server.address().port;
  async function session() {
    const response = await fetch(base + "/api/status");
    return {
      cookie: response.headers.get("set-cookie").split(";")[0],
      csrf: (await response.json()).csrfToken,
    };
  }
  const a = await session(),
    b = await session();
  const post = (path, body, auth = a) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        cookie: auth.cookie,
        "content-type": "application/json",
        "x-csrf-token": auth.csrf,
        origin: base,
      },
      body: JSON.stringify(body),
    });
  const score = {
    version: 1,
    id: "我的练习/一",
    title: "共享曲库",
    tempo: 90,
    timeSignature: [4, 4],
    notes: [{ id: "a", midi: 60, beat: 0, duration: 4, hand: "right" }],
  };
  assert.equal(
    (
      await post(
        "/api/library",
        { record: { score }, expectedRevision: 0 },
        { ...a, csrf: "invalid" },
      )
    ).status,
    403,
  );
  const saved = await post("/api/library", {
    record: { score },
    expectedRevision: 0,
  });
  assert.equal(saved.status, 200);
  const list = await (
    await fetch(base + "/api/library", { headers: { cookie: b.cookie } })
  ).json();
  assert.equal(list.records[0].score.title, score.title);
  assert.deepEqual(list.warnings, ["旧记录未能读取。"]);
  assert.equal("assets" in list.records[0], false);
  const route = "/api/library/records/" + encodeURIComponent(score.id),
    read = await (
      await fetch(base + route, { headers: { cookie: b.cookie } })
    ).json();
  assert.equal(read.document.version, 2);
  assert.equal(
    (await post("/api/library", { record: { score }, expectedRevision: 0 }, b))
      .status,
    409,
  );
  assert.equal((await post(route + "/delete", {})).status, 200);
  assert.equal(
    (await fetch(base + route, { headers: { cookie: b.cookie } })).status,
    404,
  );
});
