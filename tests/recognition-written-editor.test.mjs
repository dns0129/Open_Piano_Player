import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {writtenEvidenceEditor,applyWrittenEvidenceInput} from '../src/recognition-written-editor.js';
import {refreshWrittenPitch,removeWrittenEvent} from '../lib/recognition-edit.mjs';
import {decodeCompactRegion} from '../lib/recognition-wire.mjs';
import {validateRegionResult} from '../lib/score-region.mjs';
import {withWrittenFixture} from './helpers/written-recognition-fixture.mjs';
const raw=withWrittenFixture({complete:true,meter:[4,4],key:0,bpm:90,bars:[4],notes:[[60,0,4,1,.2,.2,.7],[48,0,4,-1,.2,.8,.5]],rests:[],in:[],out:[],ties:[],graces:[],warnings:[]});
const source={id:'row',page:1,system:1,rect:{x:0,y:0,width:100,height:80}};
function fixture(){const result=validateRegionResult(decodeCompactRegion(raw,{region:source,metadata:{title:'fixture'}}),source);return {...result,notes:result.score.notes};}
test('source editor changes explicit reading evidence and exposes MIDI disagreement until both are corrected',()=>{
 const region=fixture(),dom=new JSDOM(writtenEvidenceEditor(region)),doc=dom.window.document;
 const input=doc.querySelector('[data-written-note="n0"][data-written-field="alter"]');assert.ok(input);input.value='1';assert.equal(applyWrittenEvidenceInput(input,region),true);
 assert.equal(region.notes.find(n=>n.id==='n0').midi,60,'source editing cannot silently move the sounding pitch');assert.equal(region.notes.find(n=>n.id==='n0').pitch,undefined);
 const printed=doc.querySelector('[data-written-note="n0"][data-written-field="printed"]');printed.value='1';applyWrittenEvidenceInput(printed,region);
 region.notes.find(n=>n.id==='n0').midi=61;refreshWrittenPitch(region,'n0');assert.equal(region.notes.find(n=>n.id==='n0').pitch.alter,1);
 assert.equal(region.notes.find(n=>n.id==='n0').accidental,'sharp');
 printed.value='';applyWrittenEvidenceInput(printed,region);assert.equal(region.notes.find(n=>n.id==='n0').accidental,undefined);
 assert.ok(region.corrections.every(c=>c.type==='written-source-edit'));assert.ok(writtenEvidenceEditor(region).includes('按原图核对'));
});
test('manual event deletion drops its source references and clef changes never silently alter MIDI',()=>{
 const region=fixture();region.internalTies=[{fromNoteId:'n0',toNoteId:'n1'}];region.continuity.tieOut=[{noteId:'n0'}];
 removeWrittenEvent(region,'note','n0');region.notes=region.notes.filter(n=>n.id!=='n0');
 assert.ok(!region.score.recognitionEvidence.notes.some(n=>n.noteId==='n0'));assert.deepEqual(region.internalTies,[]);assert.deepEqual(region.continuity.tieOut,[]);
 region.rests=[{beat:0,duration:4,voice:'right-1',hand:'right'}];
 const edit=(kind,index,field,value)=>applyWrittenEvidenceInput({dataset:{writtenKind:kind,writtenIndex:String(index),writtenField:field},value},region);
 edit('rest',0,'staff','1');const id=region.rests[0].id;assert.equal(region.score.recognitionEvidence.rests[0].restId,id);
 removeWrittenEvent(region,'rest',id);region.rests=[];assert.deepEqual(region.score.recognitionEvidence.rests,[]);
 const note=region.notes[0],midi=note.midi;edit('clef',1,'octaveChange','1');assert.equal(note.midi,midi);assert.equal(note.pitch,undefined);
 edit('key',0,'fifths','1');assert.equal(region.score.keySignature,1);assert.equal(region.score.measureMap[0].keySignature,1);
});
test('new notes receive no guessed source name from a MIDI number',()=>{
 const region=fixture();region.notes.push({id:'manual',midi:61,beat:0,duration:1,hand:'right',voice:'right-1'});
 applyWrittenEvidenceInput({dataset:{writtenKind:'note',writtenIndex:'2',writtenNote:'manual',writtenField:'staff'},value:'1'},region);
 const e=region.score.recognitionEvidence.notes.find(n=>n.noteId==='manual');assert.equal(e.step,'');assert.equal(e.octave,null);assert.equal(e.alter,null);
});
