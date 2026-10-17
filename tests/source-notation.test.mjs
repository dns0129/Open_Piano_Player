import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSourceNotation, sourcePositionAtBeat } from '../src/source-notation.js';

test('pickup measures keep original measure numbering and local beat labels',()=>{
  const score={durationBeats:4,timeSignature:[3,4],notes:[
    {id:'pickup',beat:0,duration:1,midi:76,hand:'right'},
    {id:'first-full',beat:1,duration:.5,midi:74,hand:'right'},
    {id:'last',beat:3.5,duration:.5,midi:72,hand:'right'},
  ]};
  const manifest={coordinateSpace:'page',measureMap:[{measure:1,beat:0,duration:1},{measure:2,beat:1,duration:3}],
    systems:[{id:'row',page:1,system:1,imageUrl:'/score.png',rect:{x:0,y:0,width:400,height:120},startBeat:0,endBeat:4,firstMeasure:1,lastMeasure:2}],
    notes:score.notes.map((note,index)=>({noteId:note.id,page:1,system:1,x:30+index*100,y:40})),
  };
  const layout=normalizeSourceNotation(score,manifest);
  assert.deepEqual(layout.notes.map(note=>[note.measure,note.beatInMeasure]),[[1,0],[2,0],[2,2.5]]);
  const broken=structuredClone(manifest);broken.measureMap[1].beat=1.5;
  assert.throws(()=>normalizeSourceNotation(score,broken),/缺口或重叠/);
});

function sourceFixture() {
  const score = {
    durationBeats: 8, timeSignature: [2, 4], keySignature: 0,
    notes: [
      { id: 'r1', beat: 0, duration: .5, midi: 76, hand: 'right' },
      { id: 'l1', beat: 0, duration: 2, midi: 48, hand: 'left' },
      { id: 'r2', beat: 1, duration: 1, midi: 75, hand: 'right' },
      { id: 'r3', beat: 4, duration: 4, midi: 74, hand: 'right' },
    ],
  };
  const manifest = {
    coordinateSpace: 'page', systems: [
      { id: 'p1-s1', page: 1, system: 1, imageUrl: '/scores/p1-s1.png', rect: { x: 20, y: 100, width: 400, height: 120 }, startBeat: 0, endBeat: 4 },
      { id: 'p2-s1', page: 2, system: 1, imageUrl: '/scores/p2-s1.png', rect: { x: 20, y: 50, width: 400, height: 120 }, firstMeasure: 3, lastMeasure: 4 },
    ],
    notes: [
      { noteId: 'r1', page: 1, system: 1, x: 50, y: 120 },
      { noteId: 'l1', page: 1, system: 1, x: 52, y: 190 },
      { noteId: 'r2', page: 1, system: 1, x: 130, y: 125 },
      { id: 'tie-start', noteId: 'r3', beat: 4, duration: 2, page: 2, system: 1, x: 60, y: 80 },
      { id: 'tie-end', noteId: 'r3', beat: 6, duration: 2, page: 2, system: 1, x: 260, y: 80 },
    ],
  };
  return { score, manifest };
}

test('original score uses page-local system numbers and converts PDF crop coordinates', () => {
  const { score, manifest } = sourceFixture();
  const layout = normalizeSourceNotation(score, manifest);
  assert.equal(layout.notes.length, 5);
  assert.deepEqual(layout.notes.map(note => [note.x, note.y]), [[30, 20], [32, 90], [110, 25], [40, 30], [240, 30]]);
  assert.equal(layout.notes[3].systemIndex, 1);
  assert.equal(layout.notes[0].midi, 76);
  assert.equal(layout.notes[1].hand, 'left');
  assert.deepEqual(layout.systems.map(system => [system.firstMeasure, system.lastMeasure]), [[1, 2], [3, 4]]);
});

test('cursor follows printed rhythmic anchors, switches system at the boundary, and clears at the end', () => {
  const { score, manifest } = sourceFixture();
  const layout = normalizeSourceNotation(score, manifest);
  // Two chord heads at the same beat have a shared median x. Horizontal spacing
  // comes from the score rather than a uniform beats-to-pixels approximation.
  assert.deepEqual(sourcePositionAtBeat(layout, 0), { systemIndex: 0, x: 31, beat: 0 });
  assert.deepEqual(sourcePositionAtBeat(layout, .5), { systemIndex: 0, x: 70.5, beat: .5 });
  assert.deepEqual(sourcePositionAtBeat(layout, 4), { systemIndex: 1, x: 40, beat: 4 });
  assert.deepEqual(sourcePositionAtBeat(layout, 5), { systemIndex: 1, x: 140, beat: 5 });
  assert.deepEqual(sourcePositionAtBeat(layout, 7), { systemIndex: 1, x: 318, beat: 7 });
  assert.equal(sourcePositionAtBeat(layout, 8), null);
  assert.equal(sourcePositionAtBeat(layout, 100), null);
});

test('one sustained playback note can map to several printed tied note heads', () => {
  const { score, manifest } = sourceFixture();
  const layout = normalizeSourceNotation(score, manifest);
  const tiedHeads = layout.notes.filter(note => note.noteId === 'r3');
  assert.deepEqual(tiedHeads.map(note => [note.beat, note.duration, note.endBeat]), [[4, 2, 6], [6, 2, 8]]);
  assert.notEqual(tiedHeads[0].id, tiedHeads[1].id);
});

test('source overlays accept local coordinates and explicit system ids without moving note heads', () => {
  const { score, manifest } = sourceFixture();
  const original = normalizeSourceNotation(score, manifest);
  manifest.coordinateSpace = 'system';
  manifest.notes = original.notes.map(note => ({
    ...note, systemId: original.systems[note.systemIndex].id,
  }));
  const local = normalizeSourceNotation(score, manifest);
  assert.deepEqual(local.notes.map(note => [note.x, note.y]), original.notes.map(note => [note.x, note.y]));
});

test('invalid source mapping fails visibly rather than displaying unrelated or unaligned material', () => {
  const { score, manifest } = sourceFixture();
  assert.throws(() => normalizeSourceNotation(score, { systems: [] }), /逐行图片及坐标/);
  assert.throws(() => normalizeSourceNotation(score, { ...manifest, notes: [] }), /已校对的音符位置/);
  const outside = structuredClone(manifest); outside.notes[0].x = 800;
  assert.throws(() => normalizeSourceNotation(score, outside), /图片之外/);
  const wrongPage = structuredClone(manifest); wrongPage.notes[0].page = 3;
  assert.throws(() => normalizeSourceNotation(score, wrongPage), /没有对应的谱行/);
  const overlap = structuredClone(manifest); overlap.systems[1].startBeat = 3;
  assert.throws(() => normalizeSourceNotation(score, overlap), /相互重叠/);
});
