import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import {
  runRecognitionPlan,
  normalizeRecognitionPlan,
  mergeRecognitionParts,
} from "../lib/recognition-plan.mjs";
import {
  enhanceRecognitionRegion,
  splitRecognitionRegion,
} from "../lib/recognition-regions.mjs";
import {
  decodeCompactRegion,
  encodeCompactRegion,
} from "../lib/recognition-wire.mjs";
import { validateRegionResult, assembleJob } from "../lib/score-region.mjs";
import { recognizeImageSelection } from "../lib/recognition-image-input.mjs";
import { withWrittenFixture } from "./helpers/written-recognition-fixture.mjs";
import { recognitionCacheKey } from "../lib/recognition-cache.mjs";
const region = {
  id: "row",
  page: 1,
  system: 1,
  rect: { x: 0, y: 0, width: 100, height: 60 },
  image: {
    data: "not-an-image-but-never-decoded-by-mock",
    mimeType: "image/png",
    sha256: "synthetic",
  },
};
const request = {
  metadata: { title: "Synthetic fixture" },
  region,
  engine: "pi",
  previousResult: "DO_NOT_TRANSMIT",
};
const raw = () =>
  withWrittenFixture({
    complete: true,
    meter: [4, 4],
    key: 0,
    bpm: 90,
    bars: [4],
    notes: [
      [60, 0, 4, 1, 0.2, 0.2, 0.7],
      [48, 0, 4, -1, 0.2, 0.8, 0.5],
    ],
    rests: [],
    in: [],
    out: [],
    ties: [],
    graces: [],
    warnings: [],
  });
const reading = () =>
  validateRegionResult(
    decodeCompactRegion(raw(), request),
    region,
    request.metadata,
  );
const denied = () =>
  Object.assign(new Error("Need clearer source"), {
    code: "NEEDS_SOURCE",
    expose: true,
  });

test("source recovery stays local to the failed row, saves a checkpoint and resumes without repeated model calls", async () => {
  let calls = 0,
    checkpoint;
  const first = await runRecognitionPlan(request, {
    read: async () => {
      if (++calls === 1) throw denied();
      return reading();
    },
    prepare: async (r) => ({
      ...r,
      recoveryImage: { kind: "native-image-detail" },
    }),
    onCheckpoint: async (c) => (checkpoint = c),
  });
  assert.equal(calls, 2);
  assert.equal(first.recognitionPlan.calls, 2);
  assert.equal(first.recognitionPlan.history[0].error.code, "NEEDS_SOURCE");
  const resumed = await runRecognitionPlan(request, {
    read: async () =>
      assert.fail("successful/rejected calls must not be repeated"),
    prepare: async (r) => r,
    checkpoint,
  });
  assert.equal(resumed.score.notes.length, 2);
  assert.equal(resumed.recognitionPlan.calls, 2);
});
test("a failed image preparation retains the editable first reading; partial recovery can still use verified measure segments", async () => {
  const partial = reading();
  partial.checks = {
    passed: false,
    errors: [{ code: "VOICE_GAP", message: "source gap" }],
  };
  let calls = 0;
  const kept = await runRecognitionPlan(request, {
    read: async () => {
      calls++;
      return partial;
    },
    prepare: async () => {
      throw new Error("render failed");
    },
  });
  assert.equal(calls, 1);
  assert.equal(kept.score.notes.length, 2);
  assert.equal(kept.checks.passed, false);
  const parts = [0, 1].map((i) => ({
    ...region,
    id: "part" + i,
    measureCount: 1,
    parentMapping: { x: i * 50, width: 50 },
  }));
  calls = 0;
  const result = await runRecognitionPlan(
    { ...request, region: { ...region, measureCount: 2 } },
    {
      policy: { maxCalls: 4 },
      prepare: async (r) => r,
      split: async () => parts,
      read: async () => (++calls <= 2 ? partial : reading()),
    },
  );
  assert.equal(calls, 4);
  assert.equal(result.coverage.measureCount, 2);
  assert.equal(result.checks.passed, true);
  assert.equal(result.score.notes.length, 4);
});
test("risk review is opt-in, independent of first answer, and disagreements remain unresolved", async () => {
  const a = reading();
  a.score.keySignature = 5;
  let calls = 0;
  const result = await runRecognitionPlan(
    {
      ...request,
      region: { ...region, result: { secret: "FIRST_ANSWER" } },
      metadata: { title: "source", notes: "FIRST_ANSWER" },
    },
    {
      policy: { review: "risk", maxCalls: 2 },
      read: async (req) => {
        calls++;
        if (calls === 1) return a;
        assert.equal(req.pass, "verify");
        assert.ok(!JSON.stringify(req).includes("FIRST_ANSWER"));
        assert.ok(!JSON.stringify(req).includes("DO_NOT_TRANSMIT"));
        const b = structuredClone(a);
        b.score.notes[0].midi++;
        return b;
      },
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.verification.status, "disagreement");
  assert.equal(result.checks.passed, false);
  assert.equal(result.score.notes[0].midi, a.score.notes[0].midi);
  const off = await runRecognitionPlan(request, { read: async () => a });
  assert.equal(off.recognitionPlan.calls, 1);
  assert.equal(off.verification.status, "not-requested");
});
test("uncertain physical calls are never automatically dispatched again after a restart", async () => {
  const checkpoint = {
    calls: 1,
    history: [
      { stage: "first", regionId: "row", startedAt: "2026-10-28T00:00:00Z" },
    ],
  };
  await assert.rejects(
    runRecognitionPlan(request, {
      checkpoint,
      read: async () => assert.fail("unknown request duplicated"),
    }),
    (e) => e.code === "UNCERTAIN_PROVIDER_STATE",
  );
  assert.throws(() =>
    normalizeRecognitionPlan({ review: "risk", maxCalls: 99 }),
  );
});
test("source context, verified measure geometry and review policy cannot share a prior reading cache", () => {
  const key = recognitionCacheKey({}, region);
  assert.notEqual(
    key,
    recognitionCacheKey(
      { sourceContextIdentity: { pdfSha256: "another-original" } },
      region,
    ),
  );
  assert.notEqual(
    key,
    recognitionCacheKey(
      { recognitionPlan: { review: "risk", maxCalls: 2 } },
      region,
    ),
  );
  assert.notEqual(
    key,
    recognitionCacheKey(
      {},
      {
        ...region,
        measureBoundsVerified: true,
        measureBounds: [
          { from: 0, to: 0.5 },
          { from: 0.5, to: 1 },
        ],
      },
    ),
  );
});
test("PDF recovery rerenders source pixels and image recovery never pretends upsampling adds detail", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  const bytes = await pdf.save();
  const image = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const r = {
    ...region,
    pageWidth: 100,
    pageHeight: 100,
    rect: { x: 0, y: 0, width: 100, height: 100 },
    image: { mimeType: "image/png", data: image.toString("base64") },
  };
  const enhanced = await enhanceRecognitionRegion(r, { pdf: bytes });
  assert.equal(enhanced.recoveryImage.kind, "pdf-rerender");
  assert.equal(enhanced.recoveryImage.nativeWidth, 200);
  assert.equal(enhanced.detailImages.length, 2);
  const native = await enhanceRecognitionRegion(r);
  assert.equal(native.recoveryImage.nativeWidth, 100);
  assert.equal(native.recoveryImage.kind, "native-image-detail");
  const parts = await splitRecognitionRegion({
    ...r,
    measureBoundsVerified: true,
    measureBounds: [
      { from: 0, to: 0.5 },
      { from: 0.5, to: 1 },
    ],
  });
  assert.equal(parts.length, 2);
  assert.ok(parts[0].selection.to < 1);
  assert.ok(parts[1].selection.from > 0);
  await assert.rejects(
    splitRecognitionRegion(r),
    (e) => e.code === "RECOVERY_SCOPE_REQUIRED",
  );
});
test("split merge retains repeated same-pitch events and source identity; it never deduplicates by MIDI", () => {
  const parts = [0, 1].map((i) => ({
      ...region,
      id: "part" + i,
      measureCount: 1,
      parentMapping: { x: i * 50, width: 50 },
    })),
    a = reading(),
    b = reading();
  const merged = mergeRecognitionParts([a, b], parts, {
    ...request,
    region: { ...region, measureCount: 2 },
  });
  assert.equal(merged.score.notes.length, 4);
  assert.equal(merged.coverage.measureCount, 2);
  assert.equal(new Set(merged.score.notes.map((n) => n.id)).size, 4);
  assert.equal(
    merged.checks.passed,
    true,
    JSON.stringify(merged.checks.errors),
  );
});
test("single image and whole document use the same event/notation acceptance and keep native ties", async () => {
  const a = reading();
  const single = await recognizeImageSelection(
    { title: "fixture", provider: "pi", images: [{}] },
    { prepare: async () => [region], read: async () => a },
  );
  const assembled = assembleJob(
    {
      id: "image-selection",
      metadata: { title: "fixture", source: { label: "fixture" } },
      regions: [{ ...region, result: a, status: "needs-review" }],
      totalPages: 1,
      excludedPages: [],
    },
    { draft: true },
  );
  assert.deepEqual(single.score.notes, assembled.score.notes);
  assert.deepEqual(
    single.score.recognitionEvidence,
    assembled.score.recognitionEvidence,
  );
  assert.equal(single.scope.completeDocument, false);
  const roundtrip = validateRegionResult(
    decodeCompactRegion(encodeCompactRegion(a, region), request),
    region,
  );
  assert.deepEqual(
    roundtrip.score.notes.map((n) => n.pitch),
    a.score.notes.map((n) => n.pitch),
  );
});

test("persistent jobs retain review disagreement until an explicit human confirmation resolves it", async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createFullScoreJobStore } =
    await import("../lib/full-score-jobs.mjs");
  const directory = await mkdtemp(join(tmpdir(), "qinban-p1-job-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const bytes = await sharp({
    create: { width: 100, height: 60, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const row = {
    ...region,
    image: { mimeType: "image/png", data: bytes.toString("base64") },
  };
  const store = createFullScoreJobStore({
    directory,
    recognizeRegion: async (req) => {
      calls++;
      const r = reading();
      r.warnings.push("原图连奏符号需核对");
      if (req.pass === "verify") {
        r.score.notes[0].midi++;
      }
      return r;
    },
  });
  t.after(() => store.close());
  const auth = { sessionId: "synthetic-owner" },
    created = await store.createJob(
      {
        title: "fixture",
        totalPages: 1,
        regions: [row],
        recognitionPlan: { review: "risk", maxCalls: 2, recover: false },
      },
      auth,
    );
  await store.startJob(created.id, auth);
  const job = await store.waitForIdle(created.id, auth);
  assert.equal(calls, 2);
  assert.equal(job.calls.verification, 1);
  assert.equal(job.regions[0].result.checks.passed, false);
  assert.equal(job.regions[0].result.verification.status, "disagreement");
  const confirmed = await store.confirmRegion(
    created.id,
    "row",
    job.regions[0].result,
    auth,
  );
  assert.equal(
    confirmed.regions[0].result.verificationResolution.actor,
    "human",
  );
  assert.equal(confirmed.regions[0].status, "confirmed");
});
