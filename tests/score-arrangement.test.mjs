import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScore} from '../lib/score.mjs';
import {convertScoreMode,replaceOnsetChord,tonicPitchClass} from '../lib/score-arrangement.mjs';
import {createNoteEditor} from '../lib/note-editor.mjs';
import {exportMusicXML,exportMidi} from '../lib/exporters.mjs';
import {importMusicXML,importScore} from '../lib/importers.mjs';
const raw={id:'source',title:'编配测试',mode:'major',keySignature:0,timeSignature:[4,4],durationBeats:4,notes:[60,62,64,65,67,69,71,61].map((midi,i)=>({id:'n'+i,midi,hand:'right',beat:i/2,duration:.5,voice:'melody'})),source:{kind:'full-score-ai-draft',url:'https://example.com/score'}};
test('parallel mode changes real scale pitches and preserves chromatic tones, timing, IDs and voices',()=>{
 const result=convertScoreMode(raw,'minor','major');
 assert.equal(result.score.keySignature,-3);assert.equal(result.score.mode,'minor');
 assert.equal(result.changedNotes,3);assert.equal(result.chromaticNotes,1);
 assert.deepEqual(result.score.notes.map(n=>n.midi),[60,62,63,65,67,68,70,61]);
 assert.deepEqual(result.score.notes.map(n=>[n.id,n.beat,n.duration,n.hand,n.voice]),raw.notes.map(n=>[n.id,n.beat,n.duration,n.hand,n.voice]));
 assert.deepEqual(convertScoreMode(result.score,'major').score.notes.map(n=>n.midi),raw.notes.map(n=>n.midi));
 assert.throws(()=>convertScoreMode({...raw,mode:undefined},'minor'),/原调式/);
});
test('all 15 key signatures keep the same tonic across parallel major/minor conversions',()=>{
 for(let fifths=-7;fifths<=7;fifths++)for(const mode of ['major','minor']){
  const pc=tonicPitchClass(fifths,mode),s=validateScore({...raw,mode,keySignature:fifths,notes:[{id:'root',midi:60+pc,hand:'left',beat:0,duration:4}]});
  const result=convertScoreMode(s,mode==='major'?'minor':'major');
  assert.equal(tonicPitchClass(result.score.keySignature,result.score.mode),pc);
  assert.equal(result.score.notes[0].midi,60+pc);
 }
});
test('chord replacement targets one hand and onset, retains durations and rejects out of range atomically',()=>{
 const s=validateScore({...raw,notes:[{id:'l1',midi:48,beat:0,duration:2,hand:'left'},{id:'l2',midi:52,beat:0,duration:1,hand:'left'},{id:'r',midi:72,beat:0,duration:4,hand:'right'},{id:'later',midi:55,beat:2,duration:2,hand:'left'}]});
 const editor=createNoteEditor(s);const ids=editor.replaceChord('l1',{rootMidi:50,quality:'minor7'});
 assert.deepEqual(editor.score.notes.filter(n=>ids.includes(n.id)).map(n=>[n.midi,n.duration]),[[50,2],[53,1],[57,2],[60,2]]);
 assert.deepEqual(editor.score.notes.find(n=>n.id==='r'),s.notes.find(n=>n.id==='r'));
 assert.deepEqual(editor.score.notes.find(n=>n.id==='later'),s.notes.find(n=>n.id==='later'));
 const before=editor.score;assert.throws(()=>editor.replaceChord(ids[0],{rootMidi:108,quality:'major'}));assert.equal(editor.score,before);
 editor.undo();assert.deepEqual(editor.score,s);editor.redo();assert.equal(editor.score.notes.length,6);
});
test('mixed meter survives editing, mode conversion and MusicXML round trip with actual notes',()=>{
 const s=validateScore({...raw,durationBeats:10,timeSignature:[12,8],measureMap:[{beat:0,duration:6,timeSignature:[12,8]},{beat:6,duration:4,timeSignature:[4,4]}],notes:[{id:'a',midi:64,beat:0,duration:6,hand:'right'},{id:'b',midi:69,beat:6,duration:4,hand:'left'}]});
 const editor=createNoteEditor(s);assert.equal(editor.notesInMeasure(1)[0].id,'b');
 editor.convertMode('minor','major');const saved=editor.savedScore();assert.equal(saved.source.reviewRequired,true);
 const xml=exportMusicXML(saved), round=importMusicXML(xml).score;
 assert.equal(round.mode,'minor');assert.equal(round.keySignature,-3);assert.deepEqual(round.measureMap,s.measureMap.map((b,i)=>({...b,measure:i+1})));
 assert.deepEqual(round.notes.map(n=>[n.midi,n.beat,n.duration,n.hand]),[[63,0,6,'right'],[68,6,4,'left']]);
 editor.add(10,'left');assert.equal(editor.score.measureMap.at(-1).beat,10);assert.equal(editor.score.durationBeats,11);
});

test('MIDI keeps signed fifths and minor mode rather than changing the key on reimport',async()=>{
 const s=convertScoreMode(raw,'minor','major').score;const b=await importScore(exportMidi(s),'minor.mid');
 assert.equal(b.score.keySignature,-3);assert.equal(b.score.mode,'minor');assert.deepEqual(b.score.notes.map(n=>n.midi),s.notes.map(n=>n.midi));
});
