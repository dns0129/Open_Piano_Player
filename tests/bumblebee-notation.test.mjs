import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bumblebeeYeungScore as score } from '../lib/scores/bumblebee-yeung.mjs';
import { bumblebeeYeungNotation as notation, bumblebeeYeungPdfSha256, sourceNotationMatched } from '../lib/scores/bumblebee-yeung-notation.mjs';
import { normalizeSourceNotation, sourcePositionAtBeat } from '../src/source-notation.js';

test('complete source notation maps all 1313 notes through 27 continuous systems and all 210 beats', () => {
  const layout = normalizeSourceNotation(score, notation);
  assert.equal(layout.systems.length, 27);
  assert.equal(layout.notes.length, 1313);
  assert.deepEqual([...new Set(layout.systems.map(system => system.page))], [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(layout.systems[0].startBeat, 0);
  assert.equal(layout.systems.at(-1).endBeat, 210);
  assert.equal(layout.systems.at(-1).lastMeasure, 105);
  for (let index = 1; index < layout.systems.length; index++) assert.equal(layout.systems[index].startBeat, layout.systems[index - 1].endBeat);
  for (const note of layout.notes) assert.equal(sourcePositionAtBeat(layout, note.beat).systemIndex, note.systemIndex);
  for (let tick = 0; tick < 210 * 16; tick++) assert.ok(sourcePositionAtBeat(layout, tick / 16));
  assert.equal(sourcePositionAtBeat(layout, 210), null);
  assert.equal(sourcePositionAtBeat(layout, 211), null);
  assert.equal(notation.sourceSha256, bumblebeeYeungPdfSha256);
});

test('bundled images are actual PNG score crops whose aspect ratios match their PDF coordinates', async () => {
  for (const system of notation.systems) {
    assert.match(system.imageUrl, /^\/scores\/bumblebee-yeung\/p\d{2}-s\d{2}\.png$/);
    const image = await readFile(new URL(`../public${system.imageUrl}`, import.meta.url));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
    assert.ok(width > 1000 && height > 100);
    assert.ok(Math.abs(width - system.rect.width * 200 / 72) < 2, system.id);
    assert.ok(Math.abs(height - system.rect.height * 200 / 72) < 2, system.id);
  }
});

test('reference source coordinate applies the documented three-point head-center correction', () => {
  const first = notation.notes.find(note => note.noteId === 'pdf-p1-g43');
  const last = notation.notes.find(note => note.noteId === 'pdf-p7-g798');
  assert.deepEqual([first.x, first.y], [146.880005 + 3, 114.559998]);
  assert.deepEqual([last.x, last.y], [347.519989 + 3, 468.320007]);
});

test('original-page matcher permits practice tempo and ordering while rejecting every changed note tuple', () => {
  assert.equal(sourceNotationMatched(score), true);
  const reordered = structuredClone(score); reordered.notes.reverse(); reordered.tempo = 80;
  assert.equal(sourceNotationMatched(reordered), true);
  for (const [field, value] of [['id', 'different-note'], ['beat', .125], ['duration', .5], ['midi', 89], ['hand', 'left']]) {
    const changed = structuredClone(score); changed.notes[0][field] = value;
    assert.equal(sourceNotationMatched(changed), false, field);
  }
  const removed = structuredClone(score); removed.notes.pop();
  assert.equal(sourceNotationMatched(removed), false);
  const added = structuredClone(score); added.notes.push({ ...added.notes[0], id: 'another' });
  assert.equal(sourceNotationMatched(added), false);
  const duplicate = structuredClone(score); duplicate.notes[1] = { ...duplicate.notes[0] };
  assert.equal(sourceNotationMatched(duplicate), false);
  const transposed = structuredClone(score); transposed.notes = transposed.notes.map(note => ({ ...note, midi: note.midi + 1 }));
  assert.equal(sourceNotationMatched(transposed), false);
});

test('original-page matcher rejects different identities, meters, keys, and timeline lengths', () => {
  for (const [field, value] of [['id', 'a-different-edition'], ['durationBeats', 209], ['keySignature', 1], ['timeSignature', [4, 4]]]) {
    assert.equal(sourceNotationMatched({ ...score, [field]: value }), false, field);
  }
  assert.equal(sourceNotationMatched(null), false);
});
