import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreTranscription } from '../scripts/omr-benchmark-score.mjs';

const ref = { barBeats: 4, bars: 2, notes: [
  { hand: 'right', beat: 0, duration: 1, midi: 72 }, { hand: 'right', beat: 1, duration: 1, midi: 74 },
  { hand: 'right', beat: 2, duration: 2, midi: 76 }, { hand: 'left', beat: 0, duration: 4, midi: 48 },
  { hand: 'right', beat: 4, duration: 4, midi: 77 }, { hand: 'left', beat: 4, duration: 4, midi: 41 },
] };

test('a perfect transcription scores 100% at every level', () => {
  const r = scoreTranscription(ref, { notes: ref.notes });
  assert.equal(r.total.POD.recall, 1); assert.equal(r.total.POD.precision, 1);
  assert.equal(r.total.exactBars, 2); assert.equal(r.total.exactUnits, 4);
});

test('levels separate pitch, onset and duration errors; missing and extra are counted', () => {
  const pred = { notes: [
    { hand: 'right', beat: 0, duration: 1, midi: 72 },
    { hand: 'right', beat: 1, duration: 1, midi: 73 },          // 错音
    { hand: 'right', beat: 2, duration: 1, midi: 76 },          // 时值错
    { hand: 'right', beat: 3, duration: 1, midi: 79 },          // 多音
    { hand: 'left', beat: 0, duration: 4, midi: 48 },
    { hand: 'right', beat: 5, duration: 3, midi: 77 },          // 起拍错（同小节内音高仍对）
    // 第 2 小节左手漏音
  ] };
  const r = scoreTranscription(ref, pred);
  const right = r.hands.right, left = r.hands.left;
  assert.equal(right.referenceNotes, 4); assert.equal(right.predictedNotes, 5);
  assert.equal(right.P.matched, 3); assert.equal(right.P.missing, 1); assert.equal(right.P.extra, 2);
  assert.equal(right.PO.matched, 2); assert.equal(right.POD.matched, 1);
  assert.equal(left.P.matched, 1); assert.equal(left.P.missing, 1); assert.equal(left.P.extra, 0);
  assert.equal(r.total.exactBars, 0); assert.equal(left.exactUnits, 1);
});

test('a note given to the wrong hand is missing in one hand and extra in the other', () => {
  const pred = { notes: ref.notes.map(n => n.midi === 48 ? { ...n, hand: 'right' } : n) };
  const r = scoreTranscription(ref, pred);
  assert.equal(r.hands.left.P.missing, 1); assert.equal(r.hands.right.P.extra, 1);
  assert.equal(r.total.handAgnosticPO, 6, 'the hand-agnostic diagnostic still finds every note');
});
