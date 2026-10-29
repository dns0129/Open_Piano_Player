import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFullScoreJobStore,
  validateRegionResult,
} from "../lib/full-score-jobs.mjs";
import { acceptScoreRegion } from "../lib/ai.mjs";
import { RECOGNITION_PROMPT_VERSION } from "../lib/recognition-prompts.mjs";

const image = {
  mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII=",
};
const auth = { sessionId: "server-owned-session" };
const rawJob = (count = 3) => ({
  title: "Different ordinary scanned piano edition",
  totalPages: count,
  engine: "pi",
  timeSignature: [4, 4],
  tempo: 90,
  keySignature: 0,
  regions: Array.from({ length: count }, (_, i) => ({
    id: `row-${i + 1}`,
    page: i + 1,
    system: 1,
    rect: { x: 10, y: 20, width: 200, height: 100 },
    pageWidth: 600,
    pageHeight: 800,
    measureCount: 1,
    image,
  })),
});
const regionResult = (region, overrides = {}) => ({
  score: {
    title: "Original row",
    tempo: 90,
    timeSignature: [4, 4],
    keySignature: 0,
    durationBeats: 4,
    notes: [
      {
        id: "r",
        beat: 0,
        duration: 4,
        midi: 60,
        hand: "right",
        voice: "right-1",
      },
      {
        id: "l",
        beat: 0,
        duration: 4,
        midi: 48,
        hand: "left",
        voice: "left-1",
      },
    ],
  },
  coverage: { complete: true, measureCount: 1, measureDurations: [4] },
  positions: [
    { noteId: "r", x: region.rect.x + 30, y: region.rect.y + 20 },
    { noteId: "l", x: region.rect.x + 30, y: region.rect.y + 70 },
  ],
  rests: [],
  continuity: { tieIn: [], tieOut: [] },
  ...overrides,
});
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "qinban-full-jobs-"));
  const store = createFullScoreJobStore({
    directory,
    recognizeRegion: async ({ region }) => regionResult(region),
    checkRegion: false,
    ...options,
  });
  t.after(async () => {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { store, directory };
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("100 physical requests are shared across scores without exceeding the cap", async (t) => {
  let active = 0,
    maximum = 0,
    calls = 0,
    release,
    full;
  const held = new Promise((resolve) => (release = resolve));
  const hundred = new Promise((resolve) => (full = resolve));
  const { store } = await fixture(t, {
    maxConcurrency: 100,
    recognizeRegion: async ({ region }) => {
      calls++;
      maximum = Math.max(maximum, ++active);
      if (active === 100) full();
      await held;
      active--;
      return regionResult(region);
    },
  });
  const jobs = await Promise.all(
    [1, 2].map(() => store.createJob(rawJob(60), auth)),
  );
  let timeout;
  try {
    await Promise.all(jobs.map((j) => store.startJob(j.id, auth)));
    await Promise.race([
      hundred,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(Error("100 requests never started")),
          10000,
        );
      }),
    ]);
    assert.equal(active, 100);
    assert.equal(calls, 100);
  } finally {
    clearTimeout(timeout);
    release();
  }
  const results = await Promise.all(
    jobs.map((j) => store.waitForIdle(j.id, auth)),
  );
  assert.equal(maximum, 100);
  assert.equal(calls, 120);
  assert.equal(active, 0);
  assert.ok(results.every((j) => j.progress.needsReview === 60));
});

test("recropping one failed source updates page geometry and preserves successful rows without review approval", async (t) => {
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) => {
      if (region.id === "row-2" && region.rect.height === 100)
        throw Object.assign(Error("lower ledger clipped"), {
          code: "NEEDS_SOURCE",
          public: true,
        });
      return regionResult(region);
    },
  });
  const created = await store.createJob(rawJob(2), auth);
  await store.startJob(created.id, auth);
  const before = await store.waitForIdle(created.id, auth);
  assert.ok(before.regions[0].result);
  assert.equal(before.regions[1].status, "failed");
  const rect = { x: 10, y: 10, width: 200, height: 150 };
  await assert.rejects(
    store.uploadRegion(
      created.id,
      "row-2",
      { image, rect: { ...rect, height: 900 } },
      auth,
    ),
  );
  const updated = await store.uploadRegion(
    created.id,
    "row-2",
    { image, rect },
    auth,
  );
  assert.deepEqual(updated.regions[0].result, before.regions[0].result);
  assert.equal(updated.regions[0].attempts, 1);
  assert.deepEqual(updated.regions[1].rect, rect);
  assert.equal(updated.regions[1].result, null);
  assert.equal(updated.regions[1].planCheckpoint, null);
  assert.equal(updated.regions[1].sourceHistory.length, 1);
  await store.startJob(created.id, auth);
  const after = await store.waitForIdle(created.id, auth);
  assert.equal(after.regions[0].attempts, 1);
  assert.ok(after.regions[1].result);
  assert.notEqual(after.regions[1].status, "confirmed");
});
async function legacyFixture(
  t,
  count,
  {
    checks = null,
    recognizeRegion = async ({ region }) => regionResult(region),
    statuses = [],
  } = {},
) {
  const original = await fixture(t);
  const created = await original.store.createJob(
    {
      ...rawJob(count),
      originalPdf: {
        data: Buffer.from("%PDF-test").toString("base64"),
        mimeType: "application/pdf",
        name: "source.pdf",
      },
    },
    auth,
  );
  await original.store.close();
  const path = join(original.directory, created.id, "job.json"),
    saved = JSON.parse(await readFile(path, "utf8"));
  saved.engine = "audiveris";
  saved.status = "needs-review";
  saved.calls.document = 1;
  saved.documentChecks = checks;
  saved.regions.forEach((region, i) => {
    region.lastEngine = "audiveris";
    region.status = statuses[i] || "failed";
    if (region.status === "confirmed") {
      region.result = {
        ...validateRegionResult(regionResult(region), region, saved.metadata),
        engine: "audiveris",
        reviewStatus: "confirmed",
      };
      region.confirmedAt = "2026-10-16T00:00:00Z";
    }
  });
  await writeFile(path, JSON.stringify(saved), { mode: 0o600 });
  const store = createFullScoreJobStore({
    directory: original.directory,
    recognizeRegion,
    checkRegion: false,
  });
  t.after(() => store.close());
  return { ...original, store, id: created.id, saved };
}

test("stored source-head and tie doubts cannot be erased by omitting their audit fields", async (t) => {
  const audit = {
    detected: 3,
    mapped: 2,
    unmapped: [
      { id: "candidate", x: 60, y: 50, staff: 1, pitch: 0, grade: 0.9 },
    ],
    reviewed: false,
  };
  const tieAudit = {
    unresolved: [{ description: "uncertain source tie", noteIds: ["r"] }],
    reviewed: false,
  };
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) =>
      regionResult(region, { sourceHeadAudit: audit, tieAudit }),
  });
  const { id } = await store.createJob(rawJob(1), auth);
  await store.startJob(id, auth);
  const job = await store.waitForIdle(id, auth);
  assert.equal(job.regions[0].result.checks.passed, false);
  const edited = regionResult(rawJob(1).regions[0]);
  await assert.rejects(
    store.confirmRegion(id, "row-1", edited, auth),
    (e) => e.code === "REGION_CHECK_FAILED",
  );
  edited.sourceHeadAudit = { reviewed: true };
  edited.tieAudit = { reviewed: true };
  const confirmed = await store.confirmRegion(id, "row-1", edited, auth);
  assert.equal(
    confirmed.regions[0].result.sourceHeadAudit.unmapped[0].id,
    "candidate",
  );
  assert.equal(confirmed.regions[0].result.tieAudit.unresolved.length, 1);
});

test("all pages and all ordered systems must be explicitly accounted before calls", async (t) => {
  let calls = 0;
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) => {
      calls++;
      return regionResult(region);
    },
  });
  await assert.rejects(
    store.createJob(
      { ...rawJob(), regions: rawJob().regions.slice(0, 1) },
      auth,
    ),
    (e) => e.code === "MISSING_PAGE_COVERAGE",
  );
  const omitted = rawJob(1);
  omitted.regions[0].system = 2;
  await assert.rejects(
    store.createJob(omitted, auth),
    (e) => e.code === "MISSING_SYSTEM_COVERAGE",
  );
  const excluded = {
    ...rawJob(2),
    regions: rawJob(2).regions.slice(0, 1),
    excludedPages: [{ page: 2, reason: "封面，无乐谱" }],
  };
  const created = await store.createJob(excluded, auth);
  assert.equal(created.snapshot.totalPages, 2);
  assert.equal(calls, 0);
});

test("one start processes every row once with concurrency two, then waits for human confirmation", async (t) => {
  let active = 0,
    maximum = 0,
    calls = 0;
  let releasePair;
  const pairStarted = new Promise((resolve) => {
    releasePair = resolve;
  });
  const recognize = async ({ region }) => {
    active++;
    maximum = Math.max(maximum, active);
    calls++;
    if (calls === 2) releasePair();
    await pairStarted;
    active--;
    return regionResult(region);
  };
  const { store } = await fixture(t, {
    recognizeRegion: recognize,
    checkRegion: recognize,
    maxConcurrency: 2,
  });
  const { id } = await store.createJob(rawJob(), auth);
  const started = await store.startJob(id, auth);
  assert.equal(started.status, "running");
  assert.equal(started.estimate.piCalls, 3);
  let job = await store.waitForIdle(id, auth);
  assert.equal(calls, 3);
  assert.equal(maximum, 2);
  assert.equal(job.status, "needs-review");
  assert.equal(job.progress.needsReview, 3);
  assert.equal(job.result, null);
  await assert.rejects(
    store.confirmJob(id, auth),
    (e) => e.code === "INCOMPLETE_JOB",
  );
  for (const region of job.regions)
    job = await store.confirmRegion(id, region.id, region.result, auth);
  assert.equal(job.status, "complete");
  assert.equal(job.result.score.notes.length, 6);
  assert.equal(job.result.score.durationBeats, 12);
  assert.deepEqual(
    job.result.measureMap.map((m) => [m.measure, m.startBeat, m.endBeat]),
    [
      [1, 0, 4],
      [2, 4, 8],
      [3, 8, 12],
    ],
  );
  assert.equal(job.result.sourceNotation.notes.length, 6);
  assert.ok(
    job.result.sourceNotation.notes.every((h) =>
      job.result.score.notes.some((n) => n.id === h.noteId),
    ),
  );
});

test("token/session access, private on-disk state, credentials excluded, and restart persistence", async (t) => {
  const { store, directory } = await fixture(t);
  const raw = {
    ...rawJob(1),
    deepseekApiKey: "never-persist-this-key",
    settings: { secret: "never-persist-this-key" },
  };
  const { id, token } = await store.createJob(raw, auth);
  await assert.rejects(
    store.getJob(id, { token: "wrong" }),
    (e) => e.code === "JOB_NOT_FOUND",
  );
  await assert.rejects(
    store.getJob("../escape", auth),
    (e) => e.code === "JOB_NOT_FOUND",
  );
  assert.equal((await store.getJob(id, { token })).id, id);
  assert.equal(
    (await stat(join(directory, id, "job.json"))).mode & 0o777,
    0o600,
  );
  assert.equal((await stat(join(directory, id))).mode & 0o777, 0o700);
  const persisted = await readFile(join(directory, id, "job.json"), "utf8");
  assert.ok(!persisted.includes(token));
  assert.ok(!persisted.includes("never-persist-this-key"));
  assert.ok(!persisted.includes(image.data));
  const restored = createFullScoreJobStore({ directory, checkRegion: false });
  t.after(() => restored.close());
  const snapshot = await restored.getJob(id, { token });
  assert.equal(snapshot.regions[0].pageWidth, 600);
  assert.equal(snapshot.tokenHash, undefined);
  const asset = await restored.readRegionImage(id, "row-1", { token });
  assert.equal(asset.mimeType, "image/png");
  assert.deepEqual(asset.buffer, Buffer.from(image.data, "base64"));
});

test("interrupted process requires explicit resume and never silently spends calls", async (t) => {
  const { store, directory } = await fixture(t);
  const { id, token } = await store.createJob(rawJob(1), auth);
  const path = join(directory, id, "job.json");
  const data = JSON.parse(await readFile(path, "utf8"));
  data.status = "running";
  data.regions[0].status = "running";
  await writeFile(path, JSON.stringify(data));
  let calls = 0;
  const restored = createFullScoreJobStore({
    directory,
    recognizeRegion: async ({ region }) => {
      calls++;
      return regionResult(region);
    },
    checkRegion: false,
  });
  t.after(() => restored.close());
  const snapshot = await restored.getJob(id, { token });
  assert.equal(snapshot.status, "paused");
  assert.equal(snapshot.regions[0].status, "queued");
  assert.equal(calls, 0);
});

test("cancellation aborts the adapter and prevents late results or next rows committing", async (t) => {
  let signal;
  const { store } = await fixture(t, {
    maxConcurrency: 1,
    recognizeRegion: async (request, options) => {
      signal = options.signal;
      await new Promise((resolve) =>
        options.signal.addEventListener("abort", resolve, { once: true }),
      );
      return regionResult(request.region);
    },
  });
  const { id } = await store.createJob(rawJob(), auth);
  await store.startJob(id, auth);
  for (let i = 0; i < 20 && !signal; i++) await delay(2);
  assert.ok(signal);
  await store.cancelJob(id, auth);
  const stopped = await store.waitForIdle(id, auth);
  assert.equal(signal.aborted, true);
  assert.equal(stopped.status, "cancelled");
  assert.equal(stopped.calls.recognition, 1);
  assert.ok(stopped.regions.every((r) => !r.result));
});

test("failure retries the requested row only, and optional limited batches retain pending rows", async (t) => {
  const seen = [];
  let fail = true;
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) => {
      seen.push(region.id);
      if (region.id === "row-2" && fail)
        throw new Error("Bearer secret and /private/path");
      return regionResult(region);
    },
  });
  const { id } = await store.createJob(rawJob(), auth);
  await store.startJob(id, { ...auth, autoContinue: false, batchSize: 2 });
  let job = await store.waitForIdle(id, auth);
  assert.deepEqual(seen.sort(), ["row-1", "row-2"]);
  assert.equal(job.regions[2].status, "queued");
  assert.ok(!JSON.stringify(job).includes("Bearer secret"));
  fail = false;
  await store.retryRegion(id, "row-2", auth);
  job = await store.waitForIdle(id, auth);
  assert.deepEqual(seen, ["row-1", "row-2", "row-2"]);
  assert.equal(job.regions[1].attempts, 2);
  assert.equal(job.regions[2].attempts, 0);
});

test("incomplete coverage is not accepted; rhythm/positions are independently rechecked after manual edits", async (t) => {
  const region = rawJob(1).regions[0],
    valid = regionResult(region);
  assert.throws(
    () =>
      validateRegionResult({ ...valid, coverage: { complete: false } }, region),
    (e) => e.code === "INCOMPLETE_REGION",
  );
  const short = structuredClone(valid);
  short.score.notes[0].duration = 1;
  assert.ok(
    validateRegionResult(short, region).checks.errors.some(
      (e) => e.code === "RHYTHM_GAP",
    ),
  );
  const missing = structuredClone(valid);
  missing.positions.pop();
  assert.ok(
    validateRegionResult(missing, region).checks.errors.some(
      (e) => e.code === "MISSING_HEADS",
    ),
  );
  const { store } = await fixture(t);
  const { id } = await store.createJob(rawJob(1), auth);
  await store.startJob(id, auth);
  await store.waitForIdle(id, auth);
  await assert.rejects(
    store.confirmRegion(id, region.id, short, auth),
    (e) => e.code === "REGION_CHECK_FAILED",
  );
  const edited = structuredClone(valid);
  edited.score.notes[0].midi = 61;
  const job = await store.confirmRegion(id, region.id, edited, auth);
  assert.equal(job.result.score.notes.find((n) => n.hand === "right").midi, 61);
});

test("explicit rests validate chordal/polyphonic hands without adding chord lengths twice", () => {
  const region = rawJob(1).regions[0],
    raw = regionResult(region);
  raw.score.notes = [
    { id: "a", beat: 0, duration: 2, midi: 60, hand: "right" },
    { id: "b", beat: 0, duration: 2, midi: 64, hand: "right" },
    {
      id: "c",
      beat: 1,
      duration: 1,
      midi: 76,
      hand: "right",
      voice: "right-2",
    },
  ];
  raw.positions = raw.score.notes.map((n, i) => ({
    noteId: n.id,
    x: 50 + i,
    y: 50,
  }));
  raw.rests = [
    { beat: 2, duration: 2, hand: "right" },
    { beat: 0, duration: 4, hand: "left" },
  ];
  assert.equal(validateRegionResult(raw, region).checks.passed, true);
  raw.score.notes[2].voice = "right-1";
  assert.ok(
    validateRegionResult(raw, region).checks.errors.some(
      (e) => e.code === "VOICE_OVERLAP",
    ),
  );
});

test("manual rhythm corrections replace derived warnings and repeated validation preserves unique source notices", () => {
  const region = rawJob(1).regions[0],
    raw = regionResult(region);
  const disclaimer = "算法与模型检查不能证明识谱无误；必须逐行对照原图确认。";
  const octave = "OMR导出含八度线；须校对八度线起止。",
    repeat = "原谱含反复记号，须核对播放顺序。";
  raw.warnings = [
    "第1小节按原谱保留3.75拍弱起/不满小节，须对照确认。",
    "第1小节识别声部超过拍号时值（5.75拍）；需校正，未截断音符。",
    ...Array(15).fill(disclaimer),
    octave,
    octave,
    repeat,
  ];
  const corrected = validateRegionResult(raw, region);
  assert.equal(corrected.checks.passed, true);
  assert.deepEqual(corrected.warnings, [disclaimer, octave, repeat]);
  const again = validateRegionResult(corrected, region);
  assert.deepEqual(again.warnings, corrected.warnings);
  const pickup = structuredClone(again);
  pickup.score.durationBeats = 3.5;
  pickup.score.notes.forEach((note) => (note.duration = 3.5));
  pickup.coverage.measureDurations = [3.5];
  const rechecked = validateRegionResult(
    validateRegionResult(pickup, region),
    region,
  );
  assert.equal(rechecked.checks.passed, true);
  assert.deepEqual(rechecked.warnings, [
    disclaimer,
    "第1小节按原谱保留3.5拍弱起/不满小节，须对照确认。",
    octave,
    repeat,
  ]);
});

test("pickup measure duration survives cumulative assembly and original-head mapping", async (t) => {
  const request = rawJob(2);
  delete request.timeSignature;
  request.regions[0].measureCount = 2;
  const recognize = async ({ region }) => {
    const result = regionResult(region);
    result.score.timeSignature = [3, 8];
    result.score.durationBeats = region.page === 1 ? 2 : 1.5;
    result.score.notes.forEach(
      (n) => (n.duration = result.score.durationBeats),
    );
    result.coverage = {
      complete: true,
      measureCount: region.page === 1 ? 2 : 1,
      measureDurations: region.page === 1 ? [0.5, 1.5] : [1.5],
    };
    return result;
  };
  const { store } = await fixture(t, { recognizeRegion: recognize });
  const { id } = await store.createJob(request, auth);
  await store.startJob(id, auth);
  let job = await store.waitForIdle(id, auth);
  assert.equal(job.regions[0].result.checks.passed, true);
  for (const row of job.regions)
    job = await store.confirmRegion(id, row.id, row.result, auth);
  assert.equal(job.status, "complete");
  assert.equal(job.result.score.durationBeats, 3.5);
  assert.deepEqual(
    job.result.measureMap.map((m) => [m.startBeat, m.endBeat]),
    [
      [0, 0.5],
      [0.5, 2],
      [2, 3.5],
    ],
  );
});

test("cross-line ties require continuity and merge playback while preserving two visible heads", async (t) => {
  const recognize = async ({ region }) =>
    regionResult(region, {
      continuity: {
        tieIn: region.page === 2 ? [{ noteId: "r" }] : [],
        tieOut: region.page === 1 ? [{ noteId: "r" }] : [],
      },
    });
  const { store } = await fixture(t, { recognizeRegion: recognize });
  const { id } = await store.createJob(rawJob(2), auth);
  await store.startJob(id, auth);
  let job = await store.waitForIdle(id, auth);
  for (const row of job.regions)
    job = await store.confirmRegion(id, row.id, row.result, auth);
  assert.equal(job.status, "complete");
  assert.equal(job.result.score.notes.length, 3);
  const tied = job.result.score.notes.find((n) => n.hand === "right");
  assert.equal(tied.duration, 8);
  assert.equal(
    job.result.sourceNotation.notes.filter((h) => h.noteId === tied.id).length,
    2,
  );
});

test("PDFs and automatic routing use GPT rows only, even when a legacy document adapter is supplied", async (t) => {
  let documents = 0,
    rows = 0;
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) => {
      rows++;
      return regionResult(region);
    },
    recognizeDocument: async () => {
      documents++;
      throw new Error("disabled adapter must not run");
    },
  });
  for (const engine of ["omr", "audiveris"])
    await assert.rejects(
      store.createJob({ ...rawJob(), engine }, auth),
      (e) => e.code === "LOCAL_OMR_DISABLED",
    );
  const { id } = await store.createJob(
    {
      ...rawJob(3),
      engine: "auto",
      originalPdf: {
        data: Buffer.from("%PDF-test").toString("base64"),
        mimeType: "application/pdf",
      },
    },
    auth,
  );
  await assert.rejects(
    store.startJob(id, { ...auth, engine: "audiveris" }),
    (e) => e.code === "LOCAL_OMR_DISABLED",
  );
  await store.startJob(id, auth);
  const job = await store.waitForIdle(id, auth);
  assert.equal(documents, 0);
  assert.equal(rows, 3);
  assert.equal(job.engine, "pi");
  assert.equal(job.calls.document, 0);
  assert.equal(job.progress.needsReview, 3);
  assert.equal(job.recognition.reasoningEffort, "high");
});

test("GPT incomplete or failed rows block full import without a local fallback", async (t) => {
  let documents = 0;
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) =>
      region.page === 2
        ? { coverage: { complete: false } }
        : regionResult(region),
    recognizeDocument: async () => documents++,
  });
  const { id } = await store.createJob(rawJob(2), auth);
  await store.startJob(id, auth);
  const job = await store.waitForIdle(id, auth);
  assert.equal(job.regions[1].status, "failed");
  assert.equal(job.regions[1].error.code, "INCOMPLETE_REGION");
  assert.equal(documents, 0);
  await assert.rejects(
    store.confirmJob(id, auth),
    (e) => e.code === "INCOMPLETE_JOB",
  );
});

test("new Pi acceptance maps normalized image heads without altering legacy OCR contract", () => {
  const region = rawJob(1).regions[0],
    raw = regionResult(region);
  const payload = {
    ...raw.score,
    coverage: raw.coverage,
    rests: [],
    continuity: raw.continuity,
    warnings: [],
    notes: raw.score.notes.map((n, i) => ({ ...n, x: 0.25, y: 0.2 + i * 0.5 })),
  };
  const accepted = acceptScoreRegion(payload, {
    metadata: { title: "real original" },
    region,
  });
  assert.deepEqual(accepted.positions[0], {
    noteId: "r",
    x: 60,
    y: 40,
    coordinateSpace: "page",
  });
  assert.equal(accepted.score.notes.length, 2);
});

test("user expectedMeasureCount is enforced and excluded music rows cannot be hidden", async (t) => {
  const { store } = await fixture(t);
  const raw = rawJob(1);
  delete raw.regions[0].measureCount;
  raw.regions[0].expectedMeasureCount = 2;
  const { id } = await store.createJob(raw, auth);
  await store.startJob(id, auth);
  const job = await store.waitForIdle(id, auth);
  assert.equal(job.regions[0].measureCount, 2);
  assert.ok(
    job.regions[0].result.checks.errors.some(
      (e) => e.code === "MEASURE_COVERAGE",
    ),
  );
  await assert.rejects(
    store.confirmRegion(id, "row-1", job.regions[0].result, auth),
    (e) => e.code === "REGION_CHECK_FAILED",
  );
  await assert.rejects(
    store.createJob(
      { ...rawJob(1), excludeRegions: [{ page: 1, system: 2 }] },
      auth,
    ),
    (e) => e.code === "EXCLUDED_MUSIC_REGION",
  );
});

test("uncertain page/row scope needs explicit final human acknowledgement", async (t) => {
  const { store } = await fixture(t);
  const { id } = await store.createJob(
    { ...rawJob(1), needsUserScopeConfirmation: true },
    auth,
  );
  await store.startJob(id, auth);
  let job = await store.waitForIdle(id, auth);
  job = await store.confirmRegion(id, "row-1", job.regions[0].result, auth);
  assert.equal(job.status, "needs-review");
  assert.equal(job.result.reviewStatus, "needs-scope-confirmation");
  await assert.rejects(
    store.confirmJob(id, auth),
    (e) => e.code === "SCOPE_CONFIRMATION_REQUIRED",
  );
  job = await store.confirmJob(id, auth, { scopeConfirmed: true });
  assert.equal(job.status, "complete");
  assert.equal(job.result.scope.completeDocument, true);
});

test("legacy verify requests and injected reviewers cannot add a second reading", async (t) => {
  let reviews = 0;
  const { store } = await fixture(t, {
    checkRegion: async () => {
      reviews++;
      throw Error("review must not run");
    },
  });
  const { id } = await store.createJob({ ...rawJob(1), verify: true }, auth);
  await store.startJob(id, auth);
  const job = await store.waitForIdle(id, auth);
  assert.equal(reviews, 0);
  assert.equal(job.calls.recognition, 1);
  assert.equal(job.calls.verification, 0);
  assert.equal(job.estimate.modelCalls, 1);
  assert.equal(job.regions[0].result.verification, null);
  assert.equal(
    job.regions[0].result.score.notes.find((n) => n.hand === "right").midi,
    60,
  );
  assert.equal(job.progress.confirmed, 0);
});

test("rest-only source rows remain silent while keeping their full place in the document", async (t) => {
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) => {
      const raw = regionResult(region);
      if (region.page === 1) {
        raw.score.notes = [];
        raw.positions = [];
        raw.rests = [
          { beat: 0, duration: 4, hand: "right" },
          { beat: 0, duration: 4, hand: "left" },
        ];
      }
      return raw;
    },
  });
  const { id } = await store.createJob(rawJob(2), auth);
  await store.startJob(id, auth);
  let job = await store.waitForIdle(id, auth);
  assert.equal(job.regions[0].result.score.notes.length, 0);
  assert.equal(job.regions[0].result.checks.passed, true);
  for (const row of job.regions)
    job = await store.confirmRegion(id, row.id, row.result, auth);
  assert.equal(job.result.score.notes.length, 2);
  assert.equal(job.result.score.notes[0].beat, 4);
  assert.equal(job.result.score.durationBeats, 8);
  assert.equal(job.result.sourceNotation.systems.length, 2);
});

test("legacy source coverage errors survive the GPT migration and PDF access stays private", async (t) => {
  const { store, id } = await legacyFixture(t, 1, {
    checks: {
      complete: false,
      errors: [{ code: "UNMAPPED_SYSTEM", message: "原PDF还有未映射谱行。" }],
    },
  });
  const doc = await store.readDocument(id, auth);
  assert.equal(doc.buffer.toString(), "%PDF-test");
  assert.equal(doc.name, "source.pdf");
  await assert.rejects(
    store.readDocument(id, { token: "invalid" }),
    (e) => e.code === "JOB_NOT_FOUND",
  );
  await store.startJob(id, auth);
  let job = await store.waitForIdle(id, auth);
  job = await store.confirmRegion(id, "row-1", job.regions[0].result, auth);
  assert.equal(job.status, "needs-review");
  await assert.rejects(
    store.confirmJob(id, auth),
    (e) => e.code === "CONTINUITY_FAILED",
  );
  assert.equal(job.documentChecks.errors[0].code, "UNMAPPED_SYSTEM");
});

test("shutdown actively aborts live recognition and leaves a resumable private checkpoint", async (t) => {
  let signal;
  const { store, directory } = await fixture(t, {
    recognizeRegion: async (_request, options) => {
      signal = options.signal;
      await new Promise((resolve) =>
        signal.addEventListener("abort", resolve, { once: true }),
      );
      throw signal.reason;
    },
  });
  const { id } = await store.createJob(rawJob(1), auth);
  await store.startJob(id, auth);
  for (let i = 0; i < 20 && !signal; i++) await delay(2);
  await store.close();
  assert.equal(signal.aborted, true);
  assert.equal((await store.getJob(id, auth)).status, "paused");
  const saved = JSON.parse(
    await readFile(join(directory, id, "job.json"), "utf8"),
  );
  assert.equal(saved.regions[0].status, "queued");
  await assert.rejects(
    store.startJob(id, auth),
    (e) => e.code === "STORE_CLOSED",
  );
});

test("retrying legacy OMR uses GPT and preserves approved rows, provenance and a private backup", async (t) => {
  const recognized = [];
  const { store, id, directory, saved } = await legacyFixture(t, 3, {
    statuses: ["confirmed", "failed", "confirmed"],
    checks: {
      complete: false,
      errors: [{ code: "DOCUMENT_FAILED", message: "旧引擎失败" }],
    },
    recognizeRegion: async ({ region }) => {
      recognized.push(region.id);
      return regionResult(region);
    },
  });
  await store.retryRegion(id, "row-2", auth);
  let job = await store.waitForIdle(id, auth);
  assert.deepEqual(recognized, ["row-2"]);
  assert.equal(job.engine, "pi");
  assert.equal(job.previousEngine, "audiveris");
  assert.equal(job.calls.document, 1);
  assert.equal(job.documentChecks, null);
  assert.equal(job.regions[0].status, "confirmed");
  assert.equal(job.regions[2].status, "confirmed");
  assert.deepEqual(job.regions[0].result, saved.regions[0].result);
  assert.equal(job.regions[1].lastEngine, "pi");
  const backup = join(directory, id, "before-gpt-only.json");
  assert.equal(JSON.parse(await readFile(backup, "utf8")).engine, "audiveris");
  assert.equal((await stat(backup)).mode & 0o777, 0o600);
  await assert.rejects(
    store.retryRegion(id, "row-1", auth),
    (e) => e.code === "REGION_CONFIRMED",
  );
  job = await store.confirmRegion(id, "row-2", job.regions[1].result, auth);
  assert.equal(job.status, "complete");
});

test("a lost persisted source image becomes an explicit row failure without a model call", async (t) => {
  let calls = 0;
  const { store, directory } = await fixture(t, {
    recognizeRegion: async ({ region }) => {
      calls++;
      return regionResult(region);
    },
  });
  const { id } = await store.createJob(rawJob(1), auth);
  await rm(join(directory, id, "row-1.image"));
  await store.startJob(id, auth);
  const job = await store.waitForIdle(id, auth);
  assert.equal(calls, 0);
  assert.equal(job.calls.recognition, 0);
  assert.equal(job.status, "failed");
  assert.equal(job.regions[0].status, "failed");
  assert.ok(job.regions[0].error);
  assert.ok(!JSON.stringify(job.regions[0].error).includes(directory));
});

test("a cancelled generation fences an already prepared retry before its scheduler starts", async (t) => {
  let calls = 0;
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) => {
      calls++;
      return regionResult(region);
    },
  });
  const { id } = await store.createJob(rawJob(1), auth),
    start = store.startJob;
  // Interleave an actual public cancellation exactly at the retry -> start seam.
  store.startJob = async (jobId, options) => {
    await store.cancelJob(jobId, auth);
    return start(jobId, options);
  };
  await assert.rejects(
    store.retryRegion(id, "row-1", auth),
    (e) => e.code === "STALE_JOB_INTENT",
  );
  const job = await store.getJob(id, auth);
  assert.equal(job.status, "cancelled");
  assert.equal(calls, 0);
  assert.equal(job.calls.recognition, 0);
});

test("late HTTP start/retry intents with old runVersion cannot revive a cancelled job", async (t) => {
  let calls = 0;
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) => {
      calls++;
      return regionResult(region);
    },
  });
  const { id, snapshot } = await store.createJob(rawJob(1), auth),
    expectedVersion = snapshot.runVersion;
  const cancelled = await store.cancelJob(id, auth);
  assert.ok(cancelled.runVersion > expectedVersion);
  await assert.rejects(
    store.startJob(id, { ...auth, expectedVersion }),
    (e) => e.code === "STALE_JOB_INTENT",
  );
  await assert.rejects(
    store.retryRegion(id, "row-1", auth, { expectedVersion }),
    (e) => e.code === "STALE_JOB_INTENT",
  );
  assert.equal(calls, 0);
  await store.startJob(id, { ...auth, expectedVersion: cancelled.runVersion });
  const resumed = await store.waitForIdle(id, auth);
  assert.equal(resumed.progress.needsReview, 1);
  assert.equal(calls, 1);
});

test("internal and cross-line tie chains merge playback while retaining every written source head", async (t) => {
  const recognize = async ({ region }) => {
    const raw = regionResult(region);
    const cut = region.page === 1 ? 2 : 1;
    raw.score.notes = [
      {
        id: "r0",
        beat: 0,
        duration: cut,
        midi: 60,
        hand: "right",
        voice: "right-1",
      },
      {
        id: "r1",
        beat: cut,
        duration: 4 - cut,
        midi: 60,
        hand: "right",
        voice: "right-1",
      },
      {
        id: "l",
        beat: 0,
        duration: 4,
        midi: 48,
        hand: "left",
        voice: "left-1",
      },
    ];
    raw.positions = raw.score.notes.map((n, index) => ({
      noteId: n.id,
      x: 40 + index * 20,
      y: n.hand === "right" ? 50 : 90,
    }));
    raw.internalTies = [{ fromNoteId: "r0", toNoteId: "r1" }];
    raw.continuity = {
      tieIn: region.page === 2 ? [{ noteId: "r0" }] : [],
      tieOut: region.page === 1 ? [{ noteId: "r1" }] : [],
    };
    return raw;
  };
  const { store } = await fixture(t, { recognizeRegion: recognize });
  const { id } = await store.createJob(rawJob(2), auth);
  await store.startJob(id, auth);
  let job = await store.waitForIdle(id, auth);
  assert.equal(job.regions[0].result.internalTies.length, 1);
  for (const row of job.regions)
    job = await store.confirmRegion(id, row.id, row.result, auth);
  assert.equal(job.status, "complete");
  assert.equal(job.result.score.notes.length, 3);
  const right = job.result.score.notes.find((n) => n.hand === "right");
  assert.equal(right.duration, 8);
  const heads = job.result.sourceNotation.notes.filter(
    (n) => n.noteId === right.id,
  );
  assert.equal(heads.length, 4);
  assert.deepEqual(
    heads.map((h) => [h.beat, h.duration]),
    [
      [0, 2],
      [2, 2],
      [4, 1],
      [5, 3],
    ],
  );
  assert.equal(job.result.sourceNotation.notes.length, 6);
});

test("internal ties reject wrong pitch/hand/voice, nonadjacency, duplicate edges and missing heads", () => {
  const region = rawJob(1).regions[0],
    base = regionResult(region);
  base.score.notes = [
    { id: "a", beat: 0, duration: 2, midi: 60, hand: "right", voice: "v1" },
    { id: "b", beat: 2, duration: 2, midi: 60, hand: "right", voice: "v1" },
    { id: "l", beat: 0, duration: 4, midi: 48, hand: "left" },
  ];
  base.positions = base.score.notes.map((n, i) => ({
    noteId: n.id,
    x: 40 + i,
    y: 60,
  }));
  base.internalTies = [{ fromNoteId: "a", toNoteId: "b" }];
  assert.equal(validateRegionResult(base, region).checks.passed, true);
  for (const [field, value] of [
    ["midi", 61],
    ["hand", "left"],
    ["voice", "v2"],
    ["beat", 1.9],
  ]) {
    const changed = structuredClone(base);
    changed.score.notes[1][field] = value;
    assert.ok(
      validateRegionResult(changed, region).checks.errors.some(
        (e) => e.code === "INVALID_INTERNAL_TIE",
      ),
      field,
    );
  }
  for (const ties of [
    [...base.internalTies, ...base.internalTies],
    [{ fromNoteId: "b", toNoteId: "a" }],
    [{ fromNoteId: "a", toNoteId: "missing" }],
  ])
    assert.ok(
      validateRegionResult(
        { ...base, internalTies: ties },
        region,
      ).checks.errors.some((e) => e.code === "INVALID_INTERNAL_TIE"),
    );
});

test("DeepSeek jobs keep their provider across resume and reread, reject switching, and isolate Pi caches", async (t) => {
  const requests = [];
  const adapter = async (request) => {
    requests.push({
      engine: request.engine,
      pass: request.pass,
      hasPrevious: !!request.previousResult,
    });
    return regionResult(request.region, {
      engine: request.engine,
      model: request.engine === "deepseek" ? "deepseek-flash" : "gpt-6.1-sol",
      reasoningEffort: "high",
      promptVersion: RECOGNITION_PROMPT_VERSION,
    });
  };
  const { store } = await fixture(t, {
    recognizeRegion: adapter,
    checkRegion: adapter,
  });
  const pi = await store.createJob(rawJob(1), auth);
  await store.startJob(pi.id, auth);
  await store.waitForIdle(pi.id, auth);
  await store.confirmRegion(pi.id, "row-1", null, auth);
  const ds = await store.createJob({ ...rawJob(1), engine: "deepseek" }, auth);
  assert.equal(ds.snapshot.engine, "deepseek");
  assert.equal(ds.snapshot.recognition.model, "deepseek-flash");
  await assert.rejects(store.startJob(ds.id, { ...auth, engine: "pi" }), {
    code: "RECOGNITION_ENGINE_LOCKED",
  });
  await store.startJob(ds.id, auth);
  let job = await store.waitForIdle(ds.id, auth);
  assert.equal(job.reuse.hits, 0);
  assert.equal(job.calls.recognition, 1);
  assert.equal(job.calls.verification, 0);
  assert.equal(job.regions[0].result.model, "deepseek-flash");
  assert.deepEqual(requests.slice(-1), [
    { engine: "deepseek", pass: "recognize", hasPrevious: false },
  ]);
  await store.confirmRegion(ds.id, "row-1", null, auth);
  const next = await store.createJob(
    { ...rawJob(1), engine: "deepseek" },
    auth,
  );
  await store.startJob(next.id, auth);
  job = await store.waitForIdle(next.id, auth);
  assert.equal(job.reuse.hits, 1);
  assert.equal(job.calls.recognition, 0);
});

test("AI draft export requires every row and scope confirmation, and never marks a task human-reviewed", async (t) => {
  const { store } = await fixture(t);
  const { id } = await store.createJob(rawJob(2), auth);
  await assert.rejects(
    store.exportDraft(id, auth, { scopeConfirmed: true }),
    (e) => e.code === "INCOMPLETE_JOB",
  );
  await store.startJob(id, auth);
  await store.waitForIdle(id, auth);
  await assert.rejects(
    store.exportDraft(id, auth),
    (e) => e.code === "SCOPE_CONFIRMATION_REQUIRED",
  );
  const draft = await store.exportDraft(id, auth, { scopeConfirmed: true });
  assert.equal(draft.result.reviewStatus, "ai-unreviewed");
  assert.equal(draft.result.score.source.kind, "full-score-ai-draft");
  assert.equal(draft.result.scope.allIncludedRowsConfirmed, false);
  assert.equal(draft.result.sourceNotation.systems.length, 2);
  assert.equal((await store.getJob(id, auth)).progress.confirmed, 0);
});

test("an empty tool submission falls back once to independent digital output on the real job path", async (t) => {
  let fallbackCalls = 0;
  const fallback = async ({ region }) => {
    fallbackCalls++;
    return {
      ...regionResult(region),
      positions: [],
      positionlessReview: true,
      wireFormat: "compact-json-v2",
    };
  };
  const { store } = await fixture(t, {
    recognizeRegion: async () => {
      throw Object.assign(new Error("no submission"), {
        code: "NO_REGION_RESULT",
      });
    },
    digitalFallback: true,
    digitalRecognizeRegion: fallback,
    checkRegion: fallback,
  });
  const { id } = await store.createJob(rawJob(1), auth);
  await store.startJob(id, auth);
  const job = await store.waitForIdle(id, auth);
  assert.equal(job.calls.recognition, 2);
  assert.equal(fallbackCalls, 1);
  assert.equal(job.regions[0].result.positionlessSource, true);
  assert.equal(job.regions[0].result.verification, null);
  const exported = await store.exportDraft(id, auth, { scopeConfirmed: true });
  assert.equal(exported.result.score.notes.length, 2);
  assert.equal(exported.result.sourceNotation.notes.length, 0);
  assert.equal(exported.progress.confirmed, 0);
});

test("digital-only AI readings export timed notes without inventing original image head positions", async (t) => {
  const original = await fixture(t);
  const { id } = await original.store.createJob(rawJob(1), auth);
  await original.store.startJob(id, auth);
  await original.store.waitForIdle(id, auth);
  await original.store.close();
  const path = join(original.directory, id, "job.json"),
    saved = JSON.parse(await readFile(path, "utf8")),
    row = saved.regions[0];
  row.result.positions = [];
  row.result.positionlessSource = true;
  row.result.checks = validateRegionResult(row.result, row, saved.metadata, {
    requirePositions: false,
  }).checks;
  await writeFile(path, JSON.stringify(saved));
  const digital = createFullScoreJobStore({ directory: original.directory });
  t.after(() => digital.close());
  const exported = await digital.exportDraft(id, auth, {
    scopeConfirmed: true,
  });
  assert.equal(exported.result.score.notes.length, 2);
  assert.equal(exported.result.sourceNotation.notes.length, 0);
  assert.equal(exported.result.reviewStatus, "ai-unreviewed");
  assert.equal(exported.progress.confirmed, 0);
  delete row.result.positionlessSource;
  await writeFile(path, JSON.stringify(saved));
  const strict = createFullScoreJobStore({ directory: original.directory });
  t.after(() => strict.close());
  await assert.rejects(
    strict.exportDraft(id, auth, { scopeConfirmed: true }),
    (e) => e.code === "MISSING_HEAD_POSITIONS",
  );
});

test("full-score assembly preserves a 12/8 to 4/4 change without changing note times", async (t) => {
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) => {
      const r = regionResult(region),
        duration = region.page === 1 ? 6 : 4;
      r.score.timeSignature = region.page === 1 ? [12, 8] : [4, 4];
      r.score.durationBeats = duration;
      r.score.notes.forEach((n) => (n.duration = duration));
      r.coverage.measureDurations = [duration];
      return r;
    },
  });
  const raw = rawJob(2);
  delete raw.timeSignature;
  const { id } = await store.createJob(raw, auth);
  await store.startJob(id, auth);
  let job = await store.waitForIdle(id, auth);
  for (const row of job.regions)
    await store.confirmRegion(id, row.id, row.result, auth);
  job = await store.getJob(id, auth);
  assert.equal(job.status, "complete");
  assert.deepEqual(
    job.result.score.measureMap.map((b) => [
      b.beat,
      b.duration,
      b.timeSignature,
    ]),
    [
      [0, 6, [12, 8]],
      [6, 4, [4, 4]],
    ],
  );
  assert.equal(job.result.score.durationBeats, 10);
});

test("an explicit in-row 2/4 bar is not treated as a 4/4 pickup", async (t) => {
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) => {
      const r = regionResult(region);
      r.score.durationBeats = 6;
      r.score.notes.forEach((n) => (n.duration = 6));
      r.coverage = {
        complete: true,
        measureCount: 2,
        measureDurations: [2, 4],
        measureTimeSignatures: [
          [2, 4],
          [4, 4],
        ],
      };
      return r;
    },
  });
  const raw = rawJob(1);
  raw.regions[0].measureCount = 2;
  const { id } = await store.createJob(raw, auth);
  await store.startJob(id, auth);
  await store.waitForIdle(id, auth);
  const job = await store.exportDraft(id, auth, { scopeConfirmed: true });
  assert.deepEqual(
    job.result.score.measureMap.map((b) => [
      b.duration,
      b.timeSignature,
      b.implicit,
    ]),
    [
      [2, [2, 4], false],
      [4, [4, 4], false],
    ],
  );
});

test("batch retry switches provider only for failed/invalid rows and preserves successful and confirmed rows", async (t) => {
  let fail = true;
  const seen = [];
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region, engine }) => {
      seen.push([region.id, engine]);
      if (fail && region.id === "row-2") throw new Error("read failed");
      if (fail && region.id === "row-4") {
        const invalid = regionResult(region);
        invalid.score.notes.forEach((n) => (n.duration = 2));
        return invalid;
      }
      return regionResult(region, {
        model: engine === "deepseek" ? "deepseek-flash" : "gpt-6.1-sol",
      });
    },
  });
  const { id } = await store.createJob(rawJob(4), auth);
  await store.startJob(id, auth);
  let job = await store.waitForIdle(id, auth);
  await store.confirmRegion(id, "row-1", null, auth);
  const before = await store.getJob(id, auth);
  fail = false;
  await store.retryRegions(id, auth, {
    engine: "deepseek",
    expectedVersion: job.runVersion,
  });
  job = await store.waitForIdle(id, auth);
  assert.deepEqual(seen.slice(4).sort(), [
    ["row-2", "deepseek"],
    ["row-4", "deepseek"],
  ]);
  assert.equal(job.engine, "deepseek");
  assert.deepEqual(job.regions[0], before.regions[0]);
  assert.deepEqual(job.regions[2], before.regions[2]);
  await assert.rejects(
    store.retryRegions(id, auth, {
      regionIds: ["row-2", "row-1"],
      engine: "pi",
    }),
    { code: "REGION_CONFIRMED" },
  );
  assert.deepEqual((await store.getJob(id, auth)).regions, job.regions);
  await assert.rejects(store.retryRegions(id, auth, { regionIds: [] }), {
    code: "INVALID_REGIONS",
  });
  await assert.rejects(
    store.retryRegions(id, auth, { expectedVersion: job.runVersion - 1 }),
    { code: "STALE_JOB_INTENT" },
  );
});

test("review of trusted digital fallback keeps missing positions explicit and persists a complete reviewed score", async (t) => {
  const { store } = await fixture(t, {
    recognizeRegion: async ({ region }) => ({
      ...regionResult(region),
      positions: [],
      positionlessReview: true,
      wireFormat: "compact-json-v2",
    }),
  });
  const { id } = await store.createJob(rawJob(1), auth);
  await store.startJob(id, auth);
  await store.waitForIdle(id, auth);
  await store.confirmRegion(id, "row-1", null, auth);
  const job = await store.confirmJob(id, auth, { scopeConfirmed: true });
  assert.equal(job.status, "complete");
  assert.equal(job.result.reviewStatus, "human-confirmed");
  assert.equal(job.result.sourceNotation.notePositionsComplete, false);
  assert.deepEqual(job.result.sourceNotation.notes, []);
});

test("mixed-meter rows validate each bar against its explicit meter, without relaxing overfull checks", () => {
  const region = {
    id: "mixed",
    page: 1,
    system: 1,
    rect: { x: 0, y: 0, width: 200, height: 100 },
  };
  const raw = {
    score: {
      title: "6/8 into 12/8",
      tempo: 80,
      timeSignature: [6, 8],
      keySignature: 0,
      durationBeats: 9,
      notes: [
        { id: "r1", beat: 0, duration: 3, midi: 60, hand: "right" },
        { id: "l1", beat: 0, duration: 3, midi: 48, hand: "left" },
        { id: "r2", beat: 3, duration: 6, midi: 62, hand: "right" },
        { id: "l2", beat: 3, duration: 6, midi: 50, hand: "left" },
      ],
    },
    coverage: {
      complete: true,
      measureCount: 2,
      measureDurations: [3, 6],
      measureTimeSignatures: [
        [6, 8],
        [12, 8],
      ],
    },
    positions: ["r1", "l1", "r2", "l2"].map((noteId, i) => ({
      noteId,
      x: 20 + i * 30,
      y: i % 2 ? 80 : 25,
    })),
    rests: [],
    continuity: { tieIn: [], tieOut: [] },
  };
  assert.equal(validateRegionResult(raw, region).checks.passed, true);
  const wrong = structuredClone(raw);
  wrong.coverage.measureTimeSignatures[1] = [6, 8];
  assert(
    validateRegionResult(wrong, region).checks.errors.some(
      (e) => e.code === "OVERFULL_MEASURE" && e.measure === 2,
    ),
  );
});
