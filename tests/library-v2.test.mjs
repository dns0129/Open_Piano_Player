import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { indexedDB } from "fake-indexeddb";
import { createBrowserLibrary } from "../src/library-indexeddb.js";
import { createLibraryStore } from "../lib/library-store.mjs";
import {
  createUnifiedLibrary,
  createLibraryClient,
  createDiskLibrary,
} from "../src/library.js";
const input = () => ({
  score: {
    version: 1,
    id: "song",
    title: "曲库",
    tempo: 90,
    timeSignature: [4, 4],
    keySignature: 0,
    durationBeats: 4,
    notes: [{ id: "a", midi: 60, beat: 0, duration: 4, hand: "right" }],
  },
  sourceNotation: {
    version: 1,
    coordinateSpace: "page",
    scoreId: "song",
    systems: [{ id: "row", page: 1, system: 1 }],
    notes: [{ noteId: "a", page: 1, system: 1, x: 20, y: 20 }],
  },
  assets: [
    {
      id: "row",
      mimeType: "image/png",
      data: Buffer.from("original-image").toString("base64"),
    },
  ],
  reviewStatus: { method: "human-confirmed" },
});
test("application factory keeps live library getters after asynchronous saves and refreshes", async (t) => {
  const browser = createBrowserLibrary({
    name: "factory-" + crypto.randomUUID(),
    indexedDB,
  });
  t.after(() => browser.close());
  const client = createLibraryClient({
    capabilities: { mode: "browser" },
    browser,
    storage: { getItem: () => null },
    legacySources: async () => [],
  });
  await client.initialize();
  assert.equal(client.scores.length, 0);
  await client.save(input().score);
  assert.equal(client.scores.length, 1);
  assert.equal(client.records[0].revision, 1);
});
for (const kind of ["disk", "browser"])
  test(
    kind +
      " adapter preserves assets/history across reopen, rejects stale writes, and restores verified full backups",
    async (t) => {
      const directory = await mkdtemp(join(tmpdir(), "qinban-library-v2-"));
      t.after(() => rm(directory, { recursive: true, force: true }));
      const name = "library-" + globalThis.crypto.randomUUID();
      const open = () =>
        kind === "disk"
          ? createLibraryStore({ directory })
          : createBrowserLibrary({ name, indexedDB });
      const first = open();
      t.after(() => first.close?.());
      const record = await first.save(input(), { expectedRevision: 0 });
      const reopened = open();
      t.after(() => reopened.close?.());
      assert.equal(
        (await reopened.get("song")).assets[0].data,
        input().assets[0].data,
      );
      const edited = {
        ...input(),
        score: { ...input().score, title: "修改后" },
      };
      await reopened.save(edited, { expectedRevision: record.revision });
      await assert.rejects(
        first.save(input(), { expectedRevision: record.revision }),
        { code: "REVISION_CONFLICT" },
      );
      const current = await first.get("song");
      assert.equal(current.revision, 2);
      assert.equal(current.history[0].document.title, "曲库");
      const backup = await first.backup(),
        corrupt = structuredClone(backup);
      corrupt.records[0].document.title = "篡改";
      assert.equal(
        Object.keys(backup.resources).length,
        1,
        "unchanged original images are stored once across revisions",
      );
      await assert.rejects(first.restore(corrupt), /校验/);
      assert.equal((await first.get("song")).revision, 2);
      await first.remove("song");
      assert.equal((await reopened.list()).records.length, 0);
      const result = await reopened.restore(backup);
      assert.deepEqual(result.restored, ["song"]);
      assert.equal(
        (await first.get("song")).history[0].assets[0].data,
        input().assets[0].data,
      );
      assert.deepEqual((await first.restore(backup)).conflicts, ["song"]);
    },
  );
for (const kind of ["disk", "browser"])
  test(
    kind +
      " keeps Unicode/legacy IDs, original file bytes and concurrent revision checks",
    async (t) => {
      const directory = await mkdtemp(join(tmpdir(), "qinban-library-ids-"));
      t.after(() => rm(directory, { recursive: true, force: true }));
      const name = "ids-" + crypto.randomUUID(),
        open = () =>
          kind === "disk"
            ? createLibraryStore({ directory })
            : createBrowserLibrary({ name, indexedDB });
      const one = open(),
        two = open();
      t.after(() => one.close?.());
      t.after(() => two.close?.());
      const score = { ...input().score, id: "练习/版本 1" },
        originalFile = {
          name: "原谱.pdf",
          mimeType: "application/pdf",
          data: Buffer.from("%PDF-original").toString("base64"),
        };
      const saved = await one.save(
        { score, originalFile },
        { expectedRevision: 0 },
      );
      assert.equal(saved.id, score.id);
      const attempts = await Promise.allSettled([
        one.save({ score, originalFile }, { expectedRevision: 1 }),
        two.save({ score, originalFile }, { expectedRevision: 1 }),
      ]);
      assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        attempts.find((r) => r.status === "rejected").reason.code,
        "REVISION_CONFLICT",
      );
      const backup = await one.backup();
      await one.remove(score.id);
      await two.restore(backup);
      assert.equal(
        (await one.get(score.id)).originalFile.data,
        originalFile.data,
      );
    },
  );
test("browser legacy migration commits before clearing localStorage; failed commits retain original data", async (t) => {
  const raw = JSON.stringify([input().score]),
    values = new Map([["qinban-scores", raw]]),
    metadata = new Map();
  const storage = {
    getItem: (k) => values.get(k) || null,
    removeItem: (k) => values.delete(k),
  };
  let fail = true;
  const browser = createBrowserLibrary({
    name: "migration-" + crypto.randomUUID(),
    indexedDB,
  });
  t.after(() => browser.close());
  const adapter = {
    ...browser,
    save: (...args) => {
      if (fail) throw new Error("disk full");
      return browser.save(...args);
    },
  };
  const client = createUnifiedLibrary({
    adapter,
    storage,
    metadata: {
      get: (k) => metadata.get(k),
      set: (k, v) => metadata.set(k, v),
    },
    legacySources: async () => [],
  });
  await assert.rejects(client.initialize(), /disk full/);
  assert.equal(values.get("qinban-scores"), raw);
  fail = false;
  await client.initialize();
  assert.equal(values.has("qinban-scores"), false);
  assert.equal(client.scores.length, 1);
  assert.equal(metadata.get("legacy-localStorage-backup"), raw);
  const fresh = createUnifiedLibrary({
    adapter: browser,
    metadata: browser.metadata,
    storage,
    legacySources: async () => [],
  });
  await fresh.initialize();
  assert.equal(fresh.scores[0].title, "曲库");
});
test("legacy task migration remains private, discovers later jobs, and a deletion tombstone prevents revival", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "qinban-legacy-library-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const data = input();
  let entries = [{ score: data.score, jobId: "job" }];
  const legacy = {
    list: async () => ({ scores: entries }),
    source: async (id) => ({
      score: entries.find((e) => e.jobId === id).score,
      notation: data.sourceNotation,
      warnings: [],
    }),
    image: async () => ({
      buffer: Buffer.from("original-image"),
      mimeType: "image/png",
    }),
  };
  const store = createLibraryStore({ directory, legacyLibrary: legacy });
  assert.equal((await store.list()).records.length, 1);
  await store.remove("song");
  assert.equal((await store.list()).records.length, 0);
  entries.push({ score: { ...data.score, id: "later" }, jobId: "later-job" });
  assert.deepEqual(
    (await store.list()).records.map((r) => r.id),
    ["later"],
  );
  for (const file of (await readdir(directory)).filter((f) =>
    f.endsWith(".json"),
  ))
    assert.ok(
      !(await readFile(join(directory, file), "utf8")).includes("tokenHash"),
    );
});
test("unreadable legacy entries report warnings without hiding the authoritative library", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "qinban-legacy-warning-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacy = {
    list: async () => ({
      scores: [{ score: { ...input().score, id: "bad" } }],
      warnings: ["旧任务损坏。"],
    }),
    source: async () => {
      throw new Error("invalid notation");
    },
  };
  const store = createLibraryStore({ directory, legacyLibrary: legacy });
  await store.save({ score: input().score });
  const result = await store.list();
  assert.equal(result.records.length, 1);
  assert.equal(result.warnings.length, 2);
  assert.equal((await store.get("song")).id, "song");
});
test("disk client restores a full backup in separately verified requests", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "qinban-library-batches-"));
  const source = createLibraryStore({ directory: join(directory, "source") }),
    target = createLibraryStore({ directory: join(directory, "target") });
  t.after(async () => {
    await source.close?.();
    await target.close?.();
    await rm(directory, { recursive: true, force: true });
  });
  for (const id of ["one", "two", "three"]) {
    const record = input();
    record.score.id = record.sourceNotation.scoreId = id;
    await source.save(record, { expectedRevision: 0 });
  }
  const requests = [];
  const disk = createDiskLibrary(
    {
      json: async (path, body) => {
        requests.push(path);
        return target.restore(body.backup);
      },
    },
    { restoreBatchChars: 1 },
  );
  const backup = await source.backup();
  assert.deepEqual((await disk.restore(backup)).restored.sort(), [
    "one",
    "three",
    "two",
  ]);
  assert.deepEqual(requests, Array(3).fill("/api/library/restore"));
  assert.deepEqual((await disk.restore(backup)).conflicts.sort(), [
    "one",
    "three",
    "two",
  ]);
  const corrupt = structuredClone(backup);
  corrupt.records[0].revision++;
  requests.length = 0;
  await assert.rejects(disk.restore(corrupt), /校验/);
  assert.equal(requests.length, 0, "损坏的备份不应发出任何恢复请求");
});

test("migration preserves tempo-only arrangements and rebinds the original to each conflict copy", async (t) => {
  const browser = createBrowserLibrary({
    name: "variant-" + crypto.randomUUID(),
    indexedDB,
  });
  t.after(() => browser.close());
  const fixture = input(),
    original = await browser.save(fixture);
  for (const changedPitch of [false, true]) {
    const score = {
      ...fixture.score,
      title: "旧教材编配",
      tempo: 112,
      notes: fixture.score.notes.map((n) => ({
        ...n,
        midi: n.midi + Number(changedPitch),
      })),
    };
    const reference = {
      ...original.sourceReference,
      notes: score.notes.map((n) => [n.id, n.beat, n.duration, n.midi, n.hand]),
    };
    const legacy = {
      id: score.id,
      score,
      reference,
      notation: fixture.sourceNotation,
      assets: [
        { id: "row", blob: new Blob(["archived"], { type: "image/png" }) },
      ],
    };
    const lib = createUnifiedLibrary({
      adapter: browser,
      metadata: browser.metadata,
      storage: null,
      legacySources: async () => [legacy],
    });
    await lib.initialize();
    const copy = lib.scores.find(
      (s) => s.tempo === 112 && s.notes[0].midi === score.notes[0].midi,
    );
    assert.ok(copy);
    const source = await lib.readSource(copy);
    assert.equal(source?.notation.scoreId, copy.id);
    assert.equal(await source.assets[0].blob.text(), "archived");
    lib.release(copy.id);
  }
});

test("repairs completed legacy migrations using their backup and leaves deleted songs deleted", async (t) => {
  const { contentHash } = await import("../lib/library-format.ts");
  const adapter = createBrowserLibrary({
    name: "past-" + crypto.randomUUID(),
    indexedDB,
  });
  t.after(() => adapter.close());
  const current = input().score;
  await adapter.save({ score: current });
  const old = { ...current, tempo: 114, title: "旧速度版本" };
  const backup = JSON.stringify([
    old,
    { ...old, id: "deleted", title: "已删除" },
  ]);
  await adapter.metadata.set("legacy-localStorage-backup", backup);
  await adapter.metadata.set(
    "legacy-receipt:" + (await contentHash([backup, []])),
    true,
  );
  const open = () =>
    createUnifiedLibrary({
      adapter,
      metadata: adapter.metadata,
      storage: null,
      legacySources: async () => [],
    });
  const client = open();
  await client.initialize();
  assert.deepEqual(client.scores.map((s) => s.tempo).sort(), [114, 90]);
  const copy = client.scores.find((s) => s.tempo === 114);
  await client.remove(copy.id);
  const reopened = open();
  await reopened.initialize();
  assert.deepEqual(
    reopened.scores.map((s) => s.id),
    [current.id],
  );
});
