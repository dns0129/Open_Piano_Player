import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addScore,
  verifyRepository,
  readManifest,
} from "../lib/score-repository.mjs";
import { repositoryScores } from "../score-repo/index.mjs";
import { library } from "../lib/catalog.mjs";

const sample = (id, extra = {}) => ({
  version: 1,
  id,
  title: `测试曲 ${id}`,
  composer: "测试",
  tempo: 90,
  timeSignature: [4, 4],
  keySignature: 0,
  notes: [
    { id: "r", beat: 0, duration: 4, midi: 72, hand: "right" },
    { id: "l", beat: 0, duration: 4, midi: 48, hand: "left" },
  ],
  ...extra,
});

test("committed cloud score repository is consistent and feeds the built-in library", async () => {
  const result = await verifyRepository();
  assert.deepEqual(result.problems, []);
  assert.ok(result.count >= 1);
  const manifest = await readManifest();
  assert.deepEqual(
    repositoryScores.map((s) => s.id),
    manifest.scores.map((s) => s.id),
  );
  for (const score of repositoryScores)
    assert.ok(library.some((s) => s.id === score.id && s.description));
});

test("add writes a normalized score, upserts by id and keeps the first added time", async () => {
  const dir = await mkdtemp(join(tmpdir(), "score-repo-"));
  try {
    const first = await addScore(sample("song-a"), {
      dir,
      description: "第一版",
      now: () => "2026-01-01T00:00:00.000Z",
    });
    assert.equal(first.replaced, false);
    assert.equal(first.entry.measures, 1);
    await addScore(sample("song-b"), { dir });
    const second = await addScore(sample("song-a", { tempo: 100 }), {
      dir,
      now: () => "later",
    });
    assert.equal(second.replaced, true);
    assert.equal(second.entry.addedAt, "2026-01-01T00:00:00.000Z");
    assert.equal(second.entry.description, "第一版");
    const manifest = await readManifest(dir);
    assert.deepEqual(
      manifest.scores.map((s) => s.id),
      ["song-a", "song-b"],
    );
    assert.equal(manifest.scores[0].tempo, 100);
    assert.deepEqual((await verifyRepository(dir)).problems, []);
    assert.match(
      await readFile(join(dir, "index.mjs"), "utf8"),
      /scores\/song-b\.json/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verify reports tampered files, stale index and invalid ids", async () => {
  const dir = await mkdtemp(join(tmpdir(), "score-repo-"));
  try {
    await addScore(sample("song-a"), { dir });
    const file = join(dir, "scores", "song-a.json");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace('"tempo":90', '"tempo":91'),
    );
    await writeFile(join(dir, "index.mjs"), "// stale\n");
    const { ok, problems } = await verifyRepository(dir);
    assert.equal(ok, false);
    assert.ok(problems.some((p) => p.includes("SHA-256")));
    assert.ok(problems.some((p) => p.includes("index.mjs")));
    await assert.rejects(addScore(sample("Bad ID"), { dir }), /曲目 ID/);
    await assert.rejects(addScore({ ...sample("song-c"), notes: [] }, { dir }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
