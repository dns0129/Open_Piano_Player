import test from "node:test";
import assert from "node:assert/strict";
import {
  validateScore,
  scoreMeasureIndex,
  scoreMeasureBounds,
} from "../lib/score.mjs";
import { planSystems, measureSegments } from "../lib/notation-layout.mjs";
const raw = {
  title: "Mixed meter",
  timeSignature: [12, 8],
  notes: [
    { id: "a", hand: "right", midi: 60, beat: 0, duration: 6 },
    { id: "b", hand: "right", midi: 62, beat: 6, duration: 4 },
  ],
  durationBeats: 10,
  measureMap: [
    { beat: 0, duration: 6, timeSignature: [12, 8] },
    { beat: 6, duration: 4, timeSignature: [4, 4] },
  ],
};
test("12/8 to 4/4 keeps exact bar boundaries and engraving after validation", () => {
  const s = validateScore(raw);
  assert.equal(scoreMeasureIndex(s, 5.99), 0);
  assert.equal(scoreMeasureIndex(s, 6), 1);
  assert.equal(scoreMeasureIndex(s, 10), 1);
  assert.deepEqual(scoreMeasureBounds(s, 1), {
    start: 6,
    end: 10,
    length: 4,
    timeSignature: [4, 4],
  });
  assert.deepEqual(
    measureSegments(s, 1, "right").map((x) => [x.beat, x.duration]),
    [[6, 4]],
  );
  assert.equal(planSystems(s, 1000).flatMap((x) => x.bars).length, 2);
  assert.equal(validateScore(s).measureMap[1].timeSignature[0], 4);
});
test("mixed meter rejects a missing bar, an overfull bar, and an incomplete timeline", () => {
  for (const measureMap of [
    [{ beat: 1, duration: 6 }],
    [{ beat: 0, duration: 7, timeSignature: [12, 8] }],
    [{ beat: 0, duration: 6, timeSignature: [12, 8] }],
  ])
    assert.throws(() => validateScore({ ...raw, measureMap }));
});
