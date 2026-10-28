import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createFullScoreJobStore } from "../lib/full-score-jobs.mjs";
test("a timed-out call holds its physical slot until its adapter actually settles", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "qinban-timeout-cap-"));
  let active = 0,
    peak = 0;
  const adapter = async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 90));
    active--;
    throw Error("late provider exit");
  };
  const store = createFullScoreJobStore({
    directory,
    maxConcurrency: 2,
    timeoutMs: 15,
    recognizeRegion: adapter,
    checkRegion: false,
  });
  t.after(async () => {
    await store.close();
    await new Promise((r) => setTimeout(r, 100));
    await rm(directory, { recursive: true, force: true });
  });
  const image = {
    mimeType: "image/png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII=",
  };
  const created = await store.createJob({
    title: "Timeout cap test",
    totalPages: 6,
    regions: Array.from({ length: 6 }, (_, i) => ({
      id: "row-" + i,
      page: i + 1,
      system: 1,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      image,
    })),
  });
  await store.startJob(created.id, { token: created.token });
  await store.waitForIdle(created.id, { token: created.token });
  assert.ok(peak <= 2, `Observed ${peak} physical calls with a cap of 2`);
});
