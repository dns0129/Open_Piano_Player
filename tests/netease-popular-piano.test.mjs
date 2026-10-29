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
  rankCandidates,
} from "../scripts/netease-popular-piano.mjs";

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
