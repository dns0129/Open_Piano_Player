import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scoreMeasureBounds} from '../lib/score.mjs';
import {StaveNote,Tuplet,Voice,Dot,Element} from 'vexflow';
import {notationDuration,notationMeasureSegments,notationTupletGroups} from '../src/notation.js';

Element.setTextMeasurementCanvas({getContext:()=>({measureText:t=>({width:String(t).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})})});
const ticksFor = segments => {
  const notes=segments.map(s=>{const d=notationDuration(s.duration,s.rhythm);const n=new StaveNote({keys:['c/4'],duration:d.glyph,dots:d.dots});for(let i=0;i<d.dots;i++)Dot.buildAndAttach([n],{all:true});return n;});
  for(const group of notationTupletGroups(segments)){
    const d=notationDuration(segments[group[0]].duration,segments[group[0]].rhythm);
    const t=d.tuplet||{actual:3,normal:2};
    new Tuplet(group.map(i=>notes[i]),{numNotes:t.actual,notesOccupied:t.normal});
  }
  return notes.map(n=>n.getTicks().value()/4096);
};

test('all base values through 256th, breve and up to three dots have exact written durations',()=>{
 for(const [glyph,base] of [['1/2',8],['w',4],['h',2],['q',1],['8',.5],['16',.25],['32',.125],['64',.0625],['128',.03125],['256',.015625]])for(let dots=0;dots<=3;dots++){
  const duration=base*(2-2**-dots),d=notationDuration(duration);
  assert.equal(d.glyph,glyph);assert.equal(d.dots,dots);assert.equal(d.printedBeats,duration);
 }
});

test('5, 7, 9, 11 and 13 tuplets and mixed values keep every exact VexFlow tick',()=>{
 for(const n of [3,5,7,9,11,13]){
  const segments=Array.from({length:n},(_,i)=>({beat:i/n,duration:1/n,notes:[]}));
  const ticks=ticksFor(segments);ticks.forEach(t=>assert.ok(Math.abs(t-1/n)<1e-8,`${n}: ${t}`));
  assert.ok(Math.abs(ticks.reduce((a,b)=>a+b,0)-1)<1e-8);
 }
 const segments=[{beat:0,duration:.2},{beat:.2,duration:.4},{beat:.6,duration:.2},{beat:.8,duration:.2}];
 assert.deepEqual(notationTupletGroups(segments),[[0,1,2,3]]);
});

test('every bar of the entire public library can be represented without dropping notes or time',async()=>{
 const index=JSON.parse(await readFile(new URL('../public/cloud-library/index.json',import.meta.url)));
 for(const entry of index.scores){
  const {score}=JSON.parse(await readFile(new URL('../public/cloud-library/'+entry.file,import.meta.url)));
  const before=JSON.stringify(score),length=score.timeSignature[0]*4/score.timeSignature[1];
  for(let m=0;m<(score.measureMap?.length||Math.ceil(score.durationBeats/length));m++)for(const hand of ['right','left']){
   let segments;assert.doesNotThrow(()=>{segments=notationMeasureSegments(score,m,hand);notationTupletGroups(segments);},`${entry.id} bar ${m+1} ${hand}`);
   const expected=scoreMeasureBounds(score,m).length;
   assert.ok(Math.abs(segments.reduce((sum,s)=>sum+s.duration,0)-expected)<1e-5,`${entry.id}: covered duration`);
  }
  assert.equal(JSON.stringify(score),before,'engraving cannot change playback events');
 }
});

test('explicit compound-meter duplets, nested ratios, and rests survive document and XML round trips',async()=>{
 const {readScoreDocument,toPracticeScore}=await import('../lib/score-document.ts');
 const {exportMusicXML}=await import('../lib/exporters.mjs');const {importMusicXML}=await import('../lib/importers.mjs');
 const rhythm={type:'eighth',dots:0,tuplets:[{actual:2,normal:3}]};
 const raw={id:'ratios',title:'ratios',tempo:90,timeSignature:[6,8],durationBeats:3,notes:[
  {id:'a',beat:0,duration:.75,midi:60,hand:'right',rhythm},
  {id:'b',beat:.75,duration:.75,midi:62,hand:'right',rhythm},
  {id:'c',beat:1.5,duration:1/9,midi:64,hand:'right',rhythm:{type:'16th',dots:0,tuplets:[{actual:3,normal:2},{actual:3,normal:2}]}}
 ],rests:[{id:'rest',beat:0,duration:.75,staff:2,voice:'1',hand:'left',provenance:'source',rhythm}]};
 const doc=readScoreDocument(raw);assert.deepEqual(doc.notes[0].rhythm,rhythm);
 const segments=notationMeasureSegments(toPracticeScore(doc),0,'left');
 assert.deepEqual(segments[0].rhythm,rhythm);assert.equal(segments[0].duration,.75);
 const restored=importMusicXML(exportMusicXML(raw)).score;
 assert.deepEqual(restored.notes[0].rhythm,rhythm);
 assert.deepEqual(restored.rests.find(r=>r.staff===2&&r.beat===0).rhythm,rhythm);
 assert.deepEqual(restored.notes[2].rhythm,raw.notes[2].rhythm);
 assert.throws(()=>readScoreDocument({...raw,notes:[{...raw.notes[0],duration:1}]}),/书写时值/);
});

test('a written duration split across bars exports valid tied values rather than stale full-note rhythm',async()=>{
 const {exportMusicXML}=await import('../lib/exporters.mjs');const {importMusicXML}=await import('../lib/importers.mjs');
 const raw={id:'breve',tempo:80,timeSignature:[4,4],durationBeats:8,notes:[{id:'a',midi:60,hand:'right',beat:0,duration:8,rhythm:{type:'breve',dots:0}}]};
 const restored=importMusicXML(exportMusicXML(raw)).score;
 assert.equal(restored.notes.length,2);assert.equal(restored.notes[0].duration,4);assert.equal(restored.notes[0].tieTo,restored.notes[1].id);
});
