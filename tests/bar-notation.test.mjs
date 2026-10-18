import test from 'node:test';
import assert from 'node:assert/strict';
import { barsToScore, parsePitch } from '../lib/bar-notation.mjs';

test('pitch names map to MIDI with accidentals and ties', () => {
  assert.deepEqual(parsePitch('C4'), { midi: 60, tie: false });
  assert.deepEqual(parsePitch('F#5~'), { midi: 78, tie: true });
  assert.equal(parsePitch('Bb3').midi, 58);
  assert.equal(parsePitch('Gn4').midi, 67);
  assert.throws(() => parsePitch('H4'));
});

test('bars build a score; repeats copy whole bars; ties merge across bars', () => {
  const { errors, score } = barsToScore(`time: 3/4\nkey: 1\n1 R: G4:1 A4+C5:1 B4~:1\n1 L: G2:3\n2 R: B4:1 r:1 D5:1\n2 L: D3:3\n3 = 1\n`);
  assert.deepEqual(errors, []);
  assert.equal(score.durationBeats, 9);
  const b = score.notes.filter(n => n.midi === 71);
  assert.equal(b[0].duration, 2, 'tied B4 across the barline is one held note');
  assert.equal(score.notes.filter(n => n.beat >= 6).length, 5, 'bar 3 copies bar 1 (G4, A4, C5, B4 + left G2)');
});

test('every voice must fill its bar; missing bars and hands are reported, not filled in', () => {
  const { errors, score } = barsToScore(`time: 4/4\n1 R: C5:1 D5:1\n1 L: C3:4\n3 R: C5:4\n3 L: C3:4\n3 R2: E5:2\n`);
  assert.equal(score, null);
  assert.ok(errors.some(e => /共 2 拍，应为 4 拍/.test(e)));
  assert.ok(errors.some(e => /缺少第2小节/.test(e)));
  assert.ok(errors.some(e => /声部2共 2 拍/.test(e)));
});

test('a single page can be checked on its own with allowMissing', () => {
  const page = `time: 4/4\n5 R: C5:4\n5 L: C3:4\n6 R: D5:4\n6 L: D3:4\n`;
  assert.ok(barsToScore(page).errors.some(e => /缺少第1小节/.test(e)));
  const { errors, score } = barsToScore(page, { allowMissing: '1' });
  assert.deepEqual(errors, []);
  assert.equal(score.notes[0].beat, 16, 'bar 5 keeps its real position');
});
