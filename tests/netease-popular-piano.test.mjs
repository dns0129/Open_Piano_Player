import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  atomicJson,
  canonicalTitle,
  compositionKey,
  expandSystemCrops,
  withRunLease,
  createBatchRequestGate,
  selectRecoveryRegionIds,
  rankCandidates,
  batchScheduling,
} from "../scripts/netease-popular-piano.mjs";

test("explicit 100-request recovery also opens enough score workers to fill the shared gate", () => {
  assert.deepEqual(batchScheduling({ recoveryMode: true }), {
    maxConcurrency: 4,
    scoreWorkers: 2,
  });
  assert.deepEqual(
    batchScheduling({ recoveryMode: true, maxConcurrency: "100" }),
    { maxConcurrency: 100, scoreWorkers: 25 },
  );
  for (const maxConcurrency of [0, 101, -1, 1.5, "bad"])
    assert.throws(() => batchScheduling({ maxConcurrency }), /1.*100/);
});

test("explicit missing-only resume preserves every existing result, including results awaiting review", () => {
  const rows = [
    { id: "valid", result: { checks: { passed: true } } },
    { id: "needs-review", result: { checks: { passed: false } } },
    {
      id: "network",
      result: null,
      error: { code: "MODEL_REQUEST_FAILED" },
      attempts: 2,
    },
    {
      id: "source",
      result: null,
      error: { code: "NEEDS_SOURCE" },
      attempts: 2,
    },
    { id: "pending", result: null, status: "queued" },
  ];
  assert.deepEqual(
    selectRecoveryRegionIds(rows, "job", { missingOnly: true }),
    ["network", "source", "pending"],
  );
  assert.deepEqual(
    selectRecoveryRegionIds(rows, "job", {
      missingOnly: true,
      scheduled: { "job/network": {} },
    }),
    ["source", "pending"],
  );
});
import { createFullScoreJobStore } from "../lib/full-score-jobs.mjs";

test("a systemic provider outage stops the batch after three failures and leaves undispatched rows resumable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qinban-outage-"));
  let calls = 0;
  const gate = createBatchRequestGate(async () => {
    calls++;
    throw Object.assign(Error("upstream request failed"), {
      code: "MODEL_REQUEST_FAILED",
      public: true,
    });
  });
  const store = createFullScoreJobStore({
    directory,
    maxConcurrency: 1,
    recognizeRegion: gate.recognize,
  });
  try {
    const image = {
      mimeType: "image/png",
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII=",
    };
    const j = await store.createJob({
      title: "Synthetic provider outage",
      totalPages: 1,
      regions: Array.from({ length: 12 }, (_, i) => ({
        id: "row-" + i,
        page: 1,
        system: i + 1,
        rect: { x: 0, y: i * 100, width: 600, height: 90 },
        pageWidth: 600,
        pageHeight: 1300,
        image,
      })),
    });
    await store.startJob(j.id, j);
    const result = await store.waitForIdle(j.id, j);
    assert.equal(
      calls,
      3,
      "must not dispatch the rest of the batch into a known outage",
    );
    assert.equal(result.progress.failed, 3);
    assert.equal(result.progress.pending, 9);
    assert.equal(gate.state.stopped, "MODEL_SERVICE_UNAVAILABLE");
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("source doubts are not transport outages and successful reads reset the failure streak", async () => {
  let calls = 0;
  const gate = createBatchRequestGate(async (kind) => {
    calls++;
    if (kind === "ok") return {};
    throw Object.assign(Error("fixture"), { code: kind });
  });
  for (const code of [
    "NEEDS_SOURCE",
    "NEEDS_SOURCE",
    "NEEDS_SOURCE",
    "MODEL_REQUEST_FAILED",
    "MODEL_REQUEST_FAILED",
  ])
    await assert.rejects(gate.recognize(code));
  assert.equal(gate.state.stopped, null);
  await gate.recognize("ok");
  await assert.rejects(gate.recognize("MODEL_REQUEST_FAILED"));
  assert.equal(gate.state.stopped, null);
  assert.equal(calls, 7);
});

test("one batch owner fences a duplicate model runner and releases the lease after failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qinban-batch-lease-"));
  try {
    await withRunLease(dir, async () => {
      await assert.rejects(
        withRunLease(dir, () => assert.fail("must not dispatch")),
        { code: "BATCH_ALREADY_RUNNING" },
      );
    });
    await assert.rejects(
      withRunLease(dir, () => {
        throw Error("test failure");
      }),
      /test failure/,
    );
    await withRunLease(dir, async () => {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("batch crop recovery preserves outer musical ink without overlapping neighboring staves", () => {
  const staff = (top) => ({
    spacing: 8,
    lines: [top, top + 8, top + 16, top + 24, top + 32],
  });
  const original = {
    width: 800,
    height: 1100,
    systems: [
      {
        rect: { x: 30, y: 150, width: 700, height: 194 },
        staffs: [staff(200), staff(288)],
      },
      {
        rect: { x: 30, y: 514, width: 700, height: 170 },
        staffs: [staff(540), staff(628)],
      },
    ],
  };
  const layout = expandSystemCrops(original),
    [first, second] = layout.systems;
  assert.ok(first.rect.y + first.rect.height >= 363);
  assert.ok(second.rect.y <= 492);
  assert.ok(first.rect.y + first.rect.height <= second.rect.y + 1);
  assert.equal(original.systems[0].rect.height, 194);
});

test("popular candidates use observable popularity, then playlist evidence, and deduplicate arrangements", () => {
  const songs = [
    {
      id: 1,
      name: "River Flows in You (Piano)",
      pop: 95,
      playlistOccurrences: 8,
      playlistWeight: 900,
    },
    {
      id: 2,
      name: "River Flows in You",
      pop: 100,
      playlistOccurrences: 2,
      playlistWeight: 10,
    },
    {
      id: 3,
      name: "Summer",
      pop: 100,
      playlistOccurrences: 3,
      playlistWeight: 20,
    },
    {
      id: 4,
      name: "The Rain",
      pop: 100,
      playlistOccurrences: 2,
      playlistWeight: 50,
    },
    {
      id: 5,
      name: "Missing popularity",
      playlistOccurrences: 200,
      playlistWeight: 999999,
    },
  ];
  assert.deepEqual(
    rankCandidates(songs).map((s) => s.id),
    [3, 4, 2],
  );
  assert.deepEqual(
    rankCandidates(songs).map((s) => s.candidateRank),
    [1, 2, 3],
  );
  assert.equal(
    canonicalTitle("The\u00a0Truth That You Leave（钢琴版）"),
    "thetruththatyouleave",
  );
});

test("known translated composition names cannot occupy two of the hundred slots", () => {
  assert.equal(
    compositionKey({ name: "風の住む街" }),
    compositionKey({ name: "风居住的街道（Piano ver） (翻自 磯村由紀子）" }),
  );
  assert.equal(
    compositionKey({ name: "Always With Me" }),
    compositionKey({ name: "いつも何度でも" }),
  );
  assert.equal(
    compositionKey({ name: "Summer", artists: ["久石譲"] }),
    compositionKey({ name: "菊次郎的夏天" }),
  );
  assert.notEqual(
    compositionKey({ name: "Summer", artists: ["Other composer"] }),
    compositionKey({ name: "菊次郎的夏天" }),
  );
});

test("concurrent checkpoint writes are complete, ordered, private, and leave no shared-temp race", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qinban-popular-"));
  try {
    const path = join(dir, "state.json");
    await Promise.all(
      Array.from({ length: 30 }, (_, n) =>
        atomicJson(path, { n, payload: "x".repeat(n * 100) }),
      ),
    );
    const value = JSON.parse(await readFile(path, "utf8"));
    assert.equal(value.n, 29);
    assert.equal(value.payload.length, 2900);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
