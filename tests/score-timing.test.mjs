import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScore} from '../lib/score.mjs';
import {createScoreTimeline,assembleScoreTiming} from '../lib/score-timing.mjs';
import {performanceNotes} from '../lib/note-effects.mjs';
import {createNoteEditor} from '../lib/note-editor.mjs';
import {exportMidi,exportMusicXML} from '../lib/exporters.mjs';
import {importMusicXML,importMidi} from '../lib/importers.mjs';
import {decodeCompactRegion,encodeCompactRegion} from '../lib/recognition-wire.mjs';
import MidiPackage from '@tonejs/midi/build/Midi.js';
const {Midi}=MidiPackage;
const raw=()=>({id:'timing',title:'演奏时间轴',tempo:120,timeSignature:[4,4],durationBeats:8,notes:[{id:'r',midi:60,hand:'right',voice:'1',beat:0,duration:4},{id:'r2',midi:64,hand:'right',voice:'1',beat:4,duration:4},{id:'l',midi:48,hand:'left',beat:0,duration:8}]});
const close=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('old scores keep their original clock and optional timing survives JSON and validation',()=>{
 const score=validateScore(raw()),timeline=createScoreTimeline(score);close(timeline.secondsAt(8),4);close(timeline.beatAt(2),4);
 const s=raw();s.notes[0].grace={notes:[{midi:62},{midi:64}],placement:'on',slash:false,stealBeats:.5};s.notes[0].fermata={holdBeats:2};s.tempoMap=[{beat:0,bpm:120,curve:'linear'},{beat:8,bpm:60,curve:'step'}];s.fermatas=[{beat:8,holdBeats:1}];
 const valid=validateScore(s);assert.deepEqual(validateScore(JSON.parse(JSON.stringify(valid))),valid);assert.equal(valid.notes.find(n=>n.id==='r').duration,4);
});

test('tempo steps, ramps, holds and inverse mapping use one integrated time axis',()=>{
 const s=raw();s.tempoMap=[{beat:0,bpm:120,curve:'linear'},{beat:4,bpm:60,curve:'step'}];s.fermatas=[{beat:4,holdBeats:2},{beat:4,holdBeats:1},{beat:8,holdBeats:1}];
 const t=createScoreTimeline(validateScore(s)),ramp=4*Math.log(2);
 close(t.secondsAt(4,'before'),ramp);close(t.secondsAt(4),ramp+2);close(t.durationSeconds,ramp+7);
 close(t.beatAt(ramp+1),4);close(t.beatAt(t.durationSeconds-.5),8);
 for(const b of [0,.125,1,3.75,4,4.5,7.99,8])close(t.beatAt(t.secondsAt(b)),b);
 const step=createScoreTimeline({...s,tempoMap:[{beat:4,bpm:60}],fermatas:[]});close(step.durationSeconds,6);
});

test('grace performance borrows from one voice, never edits written notes or the opposite hand',()=>{
 const s=raw();s.notes[1].grace={notes:[{midi:62},{midi:63}],placement:'before',slash:true,stealBeats:.25};
 const score=validateScore(s),before=JSON.stringify(score),events=performanceNotes(score),graces=events.filter(n=>n.isGrace);
 assert.deepEqual(graces.map(n=>[n.midi,n.beat,n.duration]),[[62,3.75,.125],[63,3.875,.125]]);
 close(events.find(n=>n.id==='r').duration,3.75);close(events.find(n=>n.id==='r2').beat,4);close(events.find(n=>n.id==='l').duration,8);assert.equal(JSON.stringify(score),before);
 s.notes[0].grace=s.notes[1].grace;delete s.notes[1].grace;const opening=performanceNotes(validateScore(s));close(opening.find(n=>n.id==='r').beat,.25);close(opening.find(n=>n.id==='r').duration,3.75);
});

test('invalid timing is rejected atomically and editor undo/save retains all expression',()=>{
 for(const patch of [{tempoMap:[{beat:2,bpm:0}]},{tempoMap:[{beat:9,bpm:60}]},{tempoMap:[{beat:0,bpm:90,curve:'linear'}]},{tempoMap:[{beat:0,bpm:60},{beat:0,bpm:90}]},{fermatas:[{beat:4,holdBeats:-1}]}])assert.throws(()=>validateScore({...raw(),...patch}));
 const editor=createNoteEditor(raw());editor.setTiming([{beat:4,bpm:60}],[]);editor.update('r',{grace:{notes:[{midi:62}],placement:'on',slash:true,stealBeats:.125},fermata:{holdBeats:2}});const saved=editor.savedScore();assert.equal(saved.tempoMap[0].bpm,60);assert.equal(saved.notes.find(n=>n.id==='r').grace.notes[0].midi,62);
 assert.throws(()=>editor.setTiming([{beat:0,bpm:90,curve:'linear'}],[]));assert.equal(editor.score.tempoMap[0].bpm,60);editor.undo();assert.equal(editor.score.notes.find(n=>n.id==='r').grace,undefined);editor.redo();assert.equal(editor.score.notes.find(n=>n.id==='r').fermata.holdBeats,2);
});

test('row protocol and assembly retain grace semantics, ramp endpoints and rest fermatas',()=>{
 const region={id:'r',page:1,system:1,rect:{x:0,y:0,width:100,height:100}};
 const request={region,metadata:{title:'test'}};
 const raw={complete:true,meter:[4,4],key:0,bpm:120,bars:[4],notes:[[62,0,0,1,.1,.2,.7],[60,0,4,1,.2,.2,.7],[48,0,4,-1,.2,.8,.5]],graces:[[0,1]],rests:[],in:[],out:[],ties:[],tempos:[[0,120,1],[4,60,0]],fermatas:[[4,2]]};
 const a=decodeCompactRegion(raw,request);a.score=validateScore(a.score);assert.equal(a.score.notes.length,2);assert.equal(a.score.notes.find(n=>n.midi===60).duration,4);
 const b=decodeCompactRegion(encodeCompactRegion(a,region),request);assert.deepEqual(b.score.tempoMap,a.score.tempoMap);assert.deepEqual(b.score.fermatas,a.score.fermatas);assert.deepEqual(b.score.notes.find(n=>n.midi===60).grace,a.score.notes.find(n=>n.midi===60).grace);
 const timing=assembleScoreTiming([{score:a.score,offset:0},{score:{...a.score,tempoMap:[{beat:0,bpm:60,curve:'step'}]},offset:4}]);assert.deepEqual(timing.tempoMap.map(e=>e.beat),[0,4]);assert.deepEqual(timing.fermatas.map(e=>e.beat),[4,8]);
});

test('MIDI export and reimport preserve performed timings including two hands, grace, ramp and final hold',()=>{
 const s=raw();s.tempoMap=[{beat:0,bpm:120,curve:'linear'},{beat:4,bpm:60,curve:'step'}];s.notes[0].grace={notes:[{midi:62}],placement:'on',slash:true,stealBeats:.125};s.notes[0].fermata={holdBeats:2};s.fermatas=[{beat:8,holdBeats:1}];
 const score=validateScore(s),timeline=createScoreTimeline(score),bytes=exportMidi(score),midi=new Midi(bytes);assert.ok(midi.header.tempos.length>10);
 const expected=performanceNotes(score),actual=midi.tracks.flatMap(t=>t.notes);
 for(const n of expected){const start=timeline.secondsAt(n.beat),end=timeline.secondsAt(n.beat+n.duration);const a=actual.find(a=>a.midi===n.midi&&Math.abs(a.time-start)<.003);assert.ok(a,`missing ${n.midi}`);close(a.duration,end-start,.003);}
 close(midi.duration,timeline.durationSeconds,.003);
 const imported=importMidi(bytes,'timing.mid');assert.ok(imported.score.tempoMap.length>10);close(createScoreTimeline(imported.score).durationSeconds,timeline.durationSeconds,.004);
});

test('MusicXML retains native grace and fermata symbols and lossless timing metadata',()=>{
 const s=raw();s.tempoMap=[{beat:0,bpm:120,curve:'linear'},{beat:4,bpm:60,curve:'step'}];s.fermatas=[{beat:8,holdBeats:1}];s.notes[0].grace={notes:[{midi:62},{midi:63}],placement:'on',slash:false,stealBeats:.25};s.notes[0].fermata={holdBeats:2};
 const score=validateScore(s),xml=exportMusicXML(score);assert.ok(xml.includes('<grace slash="no"/>'));assert.ok(xml.includes('<fermata/>'));const imported=importMusicXML(xml).score;
 assert.deepEqual(imported.tempoMap,score.tempoMap);assert.deepEqual(imported.fermatas,score.fermatas);assert.deepEqual(imported.notes.find(n=>n.id==='r').grace,score.notes.find(n=>n.id==='r').grace);assert.deepEqual(imported.notes.find(n=>n.id==='r').fermata,{holdBeats:2});close(createScoreTimeline(imported).durationSeconds,createScoreTimeline(score).durationSeconds);
});

test('full-score job persistence, row offsets and draft export retain timing without AI verification',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const {createFullScoreJobStore}=await import('../lib/full-score-jobs.mjs');
 const directory=await mkdtemp(join(tmpdir(),'qinban-expressive-')),auth={sessionId:'timing-test'};
 const store=createFullScoreJobStore({directory,recognizeRegion:async({region})=>({score:{title:'row',tempo:120,timeSignature:[4,4],keySignature:0,durationBeats:4,tempoMap:[{beat:0,bpm:region.page===1?120:60,curve:'step'}],fermatas:[{beat:4,holdBeats:1}],notes:[{id:'r',midi:60,hand:'right',beat:0,duration:4,grace:{notes:[{midi:62}],slash:true,placement:'on',stealBeats:.125}},{id:'l',midi:48,hand:'left',beat:0,duration:4}]},positions:[{noteId:'r',x:20,y:20},{noteId:'l',x:20,y:80}],rests:[],coverage:{complete:true,measureCount:1,measureDurations:[4]},continuity:{tieIn:[],tieOut:[]},internalTies:[]})});
 t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII='};const {id}=await store.createJob({title:'完整表达',totalPages:2,regions:[1,2].map(page=>({id:'r'+page,page,system:1,rect:{x:0,y:0,width:100,height:100},measureCount:1,image}))},auth);await store.startJob(id,auth);const job=await store.waitForIdle(id,auth);assert.equal(job.calls.verification,0);const draft=await store.exportDraft(id,auth,{scopeConfirmed:true});
 assert.deepEqual(draft.result.score.tempoMap.map(e=>[e.beat,e.bpm]),[[0,120],[4,60]]);assert.deepEqual(draft.result.score.fermatas.map(e=>e.beat),[4,8]);assert.equal(draft.result.score.notes.filter(n=>n.grace).length,2);close(createScoreTimeline(draft.result.score).durationSeconds,8);
});

test('native MusicXML reads changed numeric tempo, grace heads and rest fermatas',()=>{
 const xml='<score-partwise><part-list><score-part id="p"><part-name>Piano</part-name></score-part></part-list><part id="p"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><direction><sound tempo="120"/></direction><note><grace slash="yes"/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice><staff>1</staff></note><note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note><direction><sound tempo="60"/></direction><note><rest/><duration>2</duration><voice>1</voice><staff>1</staff><notations><fermata/></notations></note></measure></part></score-partwise>';
 const score=importMusicXML(xml).score;assert.deepEqual(score.tempoMap.map(e=>[e.beat,e.bpm]),[[0,120],[2,60]]);assert.equal(score.notes[0].grace.notes[0].midi,62);assert.equal(score.notes[0].duration,2);assert.deepEqual(score.fermatas,[{beat:4,holdBeats:1}]);close(createScoreTimeline(score).durationSeconds,4);
});

test('transpose includes attached grace pitches and rejects out-of-range grace notes',async()=>{
 const {transposeScore}=await import('../lib/score.mjs');const s=raw();s.notes[0].grace={notes:[{midi:108}],placement:'on',slash:true,stealBeats:.125};assert.throws(()=>transposeScore(validateScore(s),1));assert.equal(transposeScore(validateScore(s),-1).notes.find(n=>n.id==='r').grace.notes[0].midi,107);
});
