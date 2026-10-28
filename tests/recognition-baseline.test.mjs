import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { freezeRecognitionBaseline } from "../scripts/freeze-recognition-baseline.mjs";
import { replayRecognitionP0 } from "../scripts/replay-recognition-p0.mjs";

test("offline baseline freezes failed rows, references and raw bytes and refuses changed or overwritten evidence", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "qinban-baseline-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, "original");
  await mkdir(join(root, "fixture"), { recursive: true });
  await mkdir(join(root, "raw-calls"));
  const save = (file, value) =>
    writeFile(join(root, file), JSON.stringify(value));
  const ref = {
    notes: [
      { midi: 60, beat: 0, duration: 4, hand: "right" },
      { midi: 48, beat: 0, duration: 4, hand: "left" },
    ],
    measures: [{ duration: 4 }],
  };
  await save("fixture/reference-row-1.json", ref);
  await writeFile(join(root, "fixture/row.png"), "synthetic-no-model-input");
  const sha = async (p) =>
    createHash("sha256")
      .update(await readFile(join(root, p)))
      .digest("hex");
  await save("manifest.json", [
    {
      id: "fixture",
      regions: [
        {
          id: "row",
          page: 1,
          system: 1,
          rect: { x: 0, y: 0, width: 100, height: 100 },
          path: join(root, "fixture/row.png"),
          sha256: await sha("fixture/row.png"),
          referenceSha256: await sha("fixture/reference-row-1.json"),
        },
      ],
    },
  ]);
  await save("run.json", { jobs: [{ key: "fixture", id: "synthetic-job" }] });
  await save("protocol.json", { reference: "independent synthetic fixture" });
  await save("fixture/final-state.json", {
    regions: [{ id: "row", status: "failed", result: null }],
  });
  const raw = {
    complete: true,
    meter: [4, 4],
    key: 0,
    bpm: 0,
    bars: [4],
    notes: [
      [60, 0, 4, 1],
      [48, 0, 4, -1],
    ],
    rests: [],
    in: [],
    out: [],
    ties: [],
    graces: [],
    warnings: [],
  };
  await save("raw-calls/synthetic-job-row-fallback-wire.json", { raw });
  await save("job-auth.json", { token: "never-read-or-publish" });
  const baseline = join(dir, "baseline.json");
  await freezeRecognitionBaseline(root, baseline);
  assert.ok(!(await readFile(baseline, "utf8")).includes("job-auth"));
  const report = await replayRecognitionP0(root, join(dir, "replay"), baseline);
  assert.equal(report.before.reference, 2);
  assert.equal(report.before.correct, 0);
  assert.equal(report.after.correct, 2);
  assert.equal(report.providerCalls, 0);
  await assert.rejects(
    replayRecognitionP0(root, join(dir, "replay"), baseline),
    { code: "EEXIST" },
  );
  await assert.rejects(freezeRecognitionBaseline(root, baseline), {
    code: "EEXIST",
  });
  await save("run.json", { jobs: [{ key: "fixture", id: "different-job" }] });
  await assert.rejects(
    replayRecognitionP0(root, join(dir, "tampered"), baseline),
    /冻结输入/,
  );
});
