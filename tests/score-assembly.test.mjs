import test from "node:test";
import assert from "node:assert/strict";
import {
  assembleScoreSegments,
  compareScoreEvents,
} from "../lib/score-assembly.mjs";
const meta = {
  version: 1,
  title: "同一7页原谱",
  tempo: 185,
  timeSignature: [2, 4],
  keySignature: 0,
};
const range = [
  { id: "page-1", firstMeasure: 1, lastMeasure: 2 },
  { id: "page-2", firstMeasure: 3, lastMeasure: 4 },
];
const part = (id) => ({
  id,
  score: {
    ...meta,
    durationBeats: 4,
    notes: [
      { id: "n", beat: 0, duration: 0.25, midi: 88, hand: "right" },
      { beat: 3, duration: 1, midi: 48, hand: "left" },
    ],
  },
});
test("source ranges assemble absolute beats while retaining complete trailing rests", () => {
  const { score, coverage } = assembleScoreSegments(meta, range, [
    part("page-1"),
    part("page-2"),
  ]);
  assert.equal(score.durationBeats, 8);
  assert.deepEqual(
    score.notes.map((n) => n.beat),
    [0, 3, 4, 7],
  );
  assert.equal(coverage[1].firstMeasure, 3);
});
test("a claimed complete score cannot have a missing, duplicate, overlapping or truncated page", () => {
  assert.throws(
    () => assembleScoreSegments(meta, range, [part("page-1")]),
    /缺少/,
  );
  assert.throws(
    () => assembleScoreSegments(meta, range, [part("page-1"), part("page-1")]),
    /重复/,
  );
  assert.throws(
    () =>
      assembleScoreSegments(
        meta,
        [range[0], { ...range[1], firstMeasure: 2 }],
        [part("page-1"), part("page-2")],
      ),
    /重叠/,
  );
  assert.throws(
    () =>
      assembleScoreSegments(meta, range, [
        {
          ...part("page-1"),
          score: { ...part("page-1").score, durationBeats: 5 },
        },
        part("page-2"),
      ]),
    /不能作为完整页/,
  );
});
test("event comparison preserves unisons and finds exact pitch, hand, onset and duration differences", () => {
  const { score } = assembleScoreSegments(meta, range, [
    part("page-1"),
    part("page-2"),
  ]);
  assert.equal(compareScoreEvents(score, score).exactMatch, true);
  const changed = {
    ...score,
    notes: score.notes.map((n, i) => (i ? n : { ...n, midi: n.midi - 1 })),
  };
  assert.equal(compareScoreEvents(score, changed).missing.length, 1);
  assert.equal(compareScoreEvents(score, changed).extra.length, 1);
});
