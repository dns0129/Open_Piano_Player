import test from 'node:test';
import assert from 'node:assert/strict';
import { StaveNote, Tuplet, Voice } from 'vexflow';
import { beatsPerMeasure } from '../lib/score.mjs';
import { library } from '../lib/catalog.mjs';
import { measureSegments } from '../lib/notation-layout.mjs';
import { notationDuration, notationMeasureSegments, notationTupletGroups } from '../src/notation.js';

const tripletScore = {
  timeSignature: [2, 4], durationBeats: 2,
  notes: [
    { id: 'chord-a', beat: 0, duration: .5, hand: 'left', midi: 67 },
    { id: 'chord-b', beat: 0, duration: .5, hand: 'left', midi: 70 },
    { id: 'triplet-chord-a', beat: 1, duration: .333333, hand: 'left', midi: 65 },
    { id: 'triplet-chord-b', beat: 1, duration: .333333, hand: 'left', midi: 69 },
    { id: 'triplet-two', beat: 1.333333, duration: .333333, hand: 'left', midi: 74 },
    { id: 'triplet-three', beat: 1.666667, duration: .333333, hand: 'left', midi: 75 },
  ],
};

test('m44-style triplet keeps true one-third timing rather than 16th/eighth/16th quantization', () => {
  const segments = notationMeasureSegments(tripletScore, 0, 'left');
  assert.equal(segments.length, 5);
  assert.deepEqual(segments.slice(0, 2).map(segment => [segment.beat, segment.duration]), [[0, .5], [.5, .5]]);
  for (let index = 0; index < 3; index++) {
    assert.ok(Math.abs(segments[index + 2].beat - (1 + index / 3)) < 1e-10);
    assert.ok(Math.abs(segments[index + 2].duration - 1 / 3) < 1e-10);
    assert.deepEqual(notationDuration(segments[index + 2].duration), { glyph: '8', dots: 0, printedBeats: .5, triplet: true });
  }
  assert.deepEqual(notationTupletGroups(segments), [[2, 3, 4]]);
  assert.equal(segments[2].notes.length, 2, 'a triplet chord remains one rhythmic event');
  assert.ok(Math.abs(segments.reduce((sum, segment) => sum + segment.duration, 0) - 2) < 1e-10);
});

test('VexFlow receives an actual 3:2 eighth-note tuplet with a complete 2/4 voice', () => {
  const segments = notationMeasureSegments(tripletScore, 0, 'left');
  const notes = segments.map(segment => new StaveNote({ keys: ['g/4'], duration: notationDuration(segment.duration).glyph }));
  for (const indices of notationTupletGroups(segments)) new Tuplet(indices.map(index => notes[index]), { numNotes: 3, notesOccupied: 2, bracketed: true });
  const voice = new Voice({ numBeats: 2, beatValue: 4 }).addTickables(notes);
  assert.equal(voice.getTicksUsed().value(), voice.getTotalTicks().value());
  assert.ok(Math.abs(notes[2].getTicks().value() * 3 - notes[0].getTicks().value() * 2) < 1e-8);
});

test('mixed eighth and sixteenth triplets retain both one-beat groups and exact VexFlow ticks', () => {
  const durations = [1/3, 1/3, 1/6, 1/6, 1/3, 1/3, 1/6, 1/6, .5, .5, 1];
  let beat = 0;
  const segments = durations.map(duration => { const segment = {beat,duration}; beat += duration; return segment; });
  assert.deepEqual(notationTupletGroups(segments), [[0,1,2,3],[4,5,6,7]]);
  const notes = segments.map(segment => new StaveNote({keys:['g/4'],duration:notationDuration(segment.duration).glyph}));
  for (const group of notationTupletGroups(segments)) new Tuplet(group.map(index=>notes[index]), {numNotes:3,notesOccupied:2,bracketed:true});
  const voice = new Voice({numBeats:4,beatValue:4}).addTickables(notes);
  assert.equal(voice.getTicksUsed().value(),voice.getTotalTicks().value());
  for(let i=0;i<notes.length;i++) assert.ok(Math.abs(notes[i].getTicks().value()/voice.getTotalTicks().value()*4-durations[i])<1e-10);
});

test('existing ordinary scores keep exactly the previous engraving segmentation', () => {
  for (const score of library.filter(score => score.notes.every(note => Math.abs(note.beat*4-Math.round(note.beat*4))<1e-5 && Math.abs(note.duration*4-Math.round(note.duration*4))<1e-5))) {
    for (let measure = 0; measure < Math.ceil(score.durationBeats / beatsPerMeasure(score)); measure++) {
      for (const hand of ['right', 'left']) assert.deepEqual(notationMeasureSegments(score, measure, hand), measureSegments(score, measure, hand));
    }
  }
});

test('polyphonic held notes keep their identity through merged segments and are not retriggered', () => {
  const score = { timeSignature: [2, 4], notes: [
    { id: 'held', beat: 1, duration: 1, hand: 'left', midi: 80 },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `moving-${index}`, beat: 1 + index / 4, duration: .25, hand: 'left', midi: 88 - index })),
  ] };
  const segments = notationMeasureSegments(score, 0, 'left').filter(segment => segment.notes.length);
  assert.equal(segments.length, 4);
  assert.ok(segments.every(segment => segment.notes.some(note => note.id === 'held')));
  assert.ok(segments.every(segment => segment.notes.length === 2));
  assert.equal(score.notes.filter(note => note.id === 'held').length, 1, 'rendering does not modify the playback events');
});

test('unsupported isolated tuplets fail explicitly instead of printing a false rhythm', () => {
  assert.throws(() => notationDuration(.2), /暂不支持的连音节奏/);
  assert.throws(() => notationTupletGroups([{ beat: 0, duration: 1 / 3 }]), /不能准确重排/);
});
