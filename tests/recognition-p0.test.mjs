import { withWrittenFixture } from "./helpers/written-recognition-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeCompactRegion } from "../lib/recognition-wire.mjs";
import { createRegionSubmission } from "../lib/recognition-submission.mjs";
import { generateScoreRegion } from "../lib/ai.mjs";
import { generateDigitalRegion } from "../lib/digital-recognition.mjs";
import { createFullScoreJobStore } from "../lib/full-score-jobs.mjs";
import { decodeHostedRegion } from "../lib/accounts/recognition-provider.mjs";
import { readScoreDocument, toPracticeScore } from "../lib/score-document.ts";

const image = {
  mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII=",
};
const region = {
  id: "row",
  page: 1,
  system: 1,
  measureCount: 1,
  rect: { x: 0, y: 0, width: 100, height: 100 },
  image,
};
const request = {
  engine: "pi",
  metadata: { title: "Synthetic protocol fixture" },
  region,
};
const raw = () =>
  withWrittenFixture({
    complete: true,
    meter: [4, 4],
    key: 0,
    bpm: 90,
    bars: [4],
    notes: [
      [60, 0, 4, 1, 0.3, 0.25, 0.75],
      [48, 0, 4, -1, 0.3, 0.75, 0.55],
    ],
    rests: [],
    in: [],
    out: [],
    ties: [],
    graces: [],
    warnings: [],
  });
const digital = (r) => ({ ...r, notes: r.notes.map((n) => n.slice(0, 4)) });

function fakeModels(responses, { json = false } = {}) {
  const contexts = [];
  return {
    contexts,
    getModel: () => ({
      id: "gpt-6.1-sol",
      provider: "test",
      api: "test",
      input: ["image"],
    }),
    streamSimple: (model, context, options) => {
      contexts.push(structuredClone(context));
      options.onPayload({ model: model.id, reasoning: { effort: "high" } });
      const r = structuredClone(
        responses[Math.min(contexts.length - 1, responses.length - 1)],
      );
      const message = {
        role: "assistant",
        model: model.id,
        provider: "test",
        api: "test",
        timestamp: Date.now(),
        stopReason: json ? "stop" : "toolUse",
        usage: { input: 10, output: 20, totalTokens: 30 },
        content: json
          ? [{ type: "text", text: JSON.stringify(r) }]
          : [
              {
                type: "toolCall",
                id: "call-" + contexts.length,
                name: "submit_score_region",
                arguments: r,
              },
            ],
      };
      return {
        result: async () => message,
        async *[Symbol.asyncIterator]() {
          yield { type: "done", message };
        },
      };
    },
  };
}
async function sandbox(t) {
  const dir = await mkdtemp(join(tmpdir(), "qinban-p0-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("unknown tempo preserves raw source evidence through score v2 and hosted decoding", () => {
  for (const bpm of [null, 0]) {
    const wire = { ...raw(), bpm },
      before = structuredClone(wire);
    const decoded = decodeCompactRegion(wire, request);
    assert.deepEqual(wire, before);
    assert.equal(decoded.score.tempo, 90);
    assert.equal(decoded.score.tempoEvidence.sourceBpm, null);
    assert.equal(decoded.score.tempoEvidence.rawBpm, bpm);
    assert.ok(decoded.warnings.some((w) => w.includes("原谱速度")));
    const saved = toPracticeScore(readScoreDocument(decoded.score));
    assert.deepEqual(saved.tempoEvidence, decoded.score.tempoEvidence);
    const hosted = decodeHostedRegion(
      {
        status: "completed",
        text: JSON.stringify(digital(wire)),
        model: "fixture",
      },
      { ...request, metadata: { title: "fixture", fallbackTempo: 80 } },
    );
    assert.equal(hosted.score.tempo, 80);
    assert.equal(hosted.score.tempoEvidence.sourceBpm, null);
  }
  assert.throws(
    () =>
      decodeCompactRegion({ ...raw(), bpm: 0, tempoStatus: "read" }, request),
    (e) => e.issues[0].path === "bpm",
  );
});

test("bad field types and note references expose exact locations without truthy coercion", () => {
  for (const [mutate, path] of [
    [(r) => (r.complete = "true"), "complete"],
    [(r) => (r.notes[1][0] = "48"), "notes[1][0]"],
    [(r) => (r.ties = [[0, 999]]), "ties[0][1]"],
    [(r) => (r.notes[0][2] = 5), "notes[0][2]"],
  ]) {
    const r = raw();
    mutate(r);
    assert.throws(
      () => decodeCompactRegion(r, request),
      (e) => e.issues[0].path === path && e.expose === true,
    );
  }
});

test("submission returns rhythmic errors before acceptance and preserves both repair attempts", async () => {
  const records = [],
    submission = createRegionSubmission(request, {
      onSubmission: async (r) => records.push(r),
    }),
    broken = raw();
  broken.notes[0][2] = 3;
  const first = await submission.submit(broken);
  assert.equal(first.isError, true);
  assert.equal(first.terminate, false);
  assert.ok(
    first.details.issues.some(
      (i) => i.code === "RHYTHM_GAP" && i.measure === 1,
    ),
  );
  assert.equal(submission.result, undefined);
  const second = await submission.submit(raw());
  assert.equal(second.isError, false);
  assert.equal(second.terminate, true);
  assert.equal(submission.finish().checks.passed, true);
  assert.equal(records.length, 2);
  assert.equal(records[0].raw.notes[0][2], 3);
  await submission.submit(raw());
  assert.equal(
    records.length,
    2,
    "third submission cannot consume another repair",
  );
});

test("exhausted structural repairs remain editable and never become passed", async () => {
  const submission = createRegionSubmission(request),
    broken = raw();
  broken.notes[0][2] = 3;
  await submission.submit(broken);
  await submission.submit(broken);
  const r = submission.finish();
  assert.equal(r.checks.passed, false);
  assert.equal(r.reviewStatus, "needs-correction");
  assert.equal(r.score.notes.length, 2);
});

test("an explicit incomplete-source response is preserved and ends without asking to invent coverage", async () => {
  const submission = createRegionSubmission(request),
    partial = { ...raw(), complete: false };
  const outcome = await submission.submit(partial);
  assert.equal(outcome.terminate, true);
  assert.throws(
    () => submission.finish(),
    (e) =>
      e.code === "INCOMPLETE_REGION" &&
      e.submissionAudit[0].raw.complete === false,
  );
});

test("real Pi Agent executes one first read plus one repair with feedback and no extra verification", async (t) => {
  const dir = await sandbox(t),
    bad = raw();
  bad.notes[0][2] = 3;
  const models = fakeModels([bad, raw()]);
  const result = await generateScoreRegion(
    request,
    {},
    {
      modelsImpl: models,
      authenticate: async () => {},
      traceOptions: { path: join(dir, "usage.jsonl") },
    },
  );
  assert.equal(models.contexts.length, 2);
  assert.equal(result.checks.passed, true);
  assert.equal(result.usage.totalTokens, 60);
  assert.match(JSON.stringify(models.contexts[1]), /RHYTHM_GAP/);
  assert.equal(result.submissionAudit.length, 2);
  const ledger = JSON.parse(
    (await readFile(join(dir, "usage.jsonl"), "utf8")).trim(),
  );
  assert.equal(ledger.actualRequests, 2);
  const records = (
    await readFile(join(dir, "usage.jsonl.submissions.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.ok(
    records.some((r) => r.stage === "first" && r.raw.notes[0][2] === 3),
  );
});

test("Pi schema failures stop after two provider calls and cannot trigger a third JSON fallback", async (t) => {
  const dir = await sandbox(t),
    bad = raw();
  bad.notes[0][0] = 999;
  const models = fakeModels([bad]);
  let fallbackCalls = 0;
  const store = createFullScoreJobStore({
    directory: join(dir, "jobs"),
    digitalFallback: true,
    digitalRecognizeRegion: async () => {
      fallbackCalls++;
      throw Error("unreachable");
    },
    recognizeRegion: (req, opts) =>
      generateScoreRegion(
        req,
        {},
        {
          ...opts,
          modelsImpl: models,
          authenticate: async () => {},
          traceOptions: { path: join(dir, "usage.jsonl") },
        },
      ),
  });
  t.after(() => store.close());
  const auth = { sessionId: "fixture" },
    job = await store.createJob(
      { title: "fixture", totalPages: 1, regions: [region] },
      auth,
    );
  await store.startJob(job.id, auth);
  const done = await store.waitForIdle(job.id, auth);
  assert.equal(models.contexts.length, 2);
  assert.equal(fallbackCalls, 0);
  assert.equal(done.regions[0].status, "failed");
  assert.ok(
    done.regions[0].recognitionAttempts.some(
      (r) => r.stage === "provider-turn",
    ),
  );
});

test("JSON repair uses the same structural acceptance and explicit one-call remaining budget", async (t) => {
  const dir = await sandbox(t),
    bad = digital(raw());
  bad.notes[0][2] = 3;
  const models = fakeModels([bad, digital(raw())], { json: true });
  const options = {
    modelsImpl: models,
    authenticate: async () => {},
    traceOptions: { path: join(dir, "usage.jsonl") },
  };
  const fixed = await generateDigitalRegion(request, options);
  assert.equal(models.contexts.length, 2);
  assert.equal(fixed.checks.passed, true);
  const one = fakeModels([bad], { json: true });
  const remaining = await generateDigitalRegion(request, {
    ...options,
    modelsImpl: one,
    maxCalls: 1,
  });
  assert.equal(one.contexts.length, 1);
  assert.equal(remaining.checks.passed, false);
  assert.equal(remaining.score.notes.length, 2);
});
