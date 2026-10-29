import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import MidiFilePackage from 'midi-file';
import { build, validateTranscription, musicXML, midi, usageSummary } from './score_pipeline.mjs';
import { performanceNotes } from './core/qinban-core.mjs';
import {recordMeasureReview} from './review-evidence.mjs';
import {execFileSync} from 'node:child_process';
import {verifyArtifactOutput} from './artifact-output.mjs';
const {parseMidi}=MidiFilePackage;
const example=JSON.parse(await fs.readFile(fileURLToPath(new URL('../assets/transcription-example.json',import.meta.url)),'utf8'));
const stamp=raw=>{raw.review.evidence=raw.score.measureMap.map((_,i)=>recordMeasureReview(raw,i+1,{method:'model-original-reread',reviewer:'synthetic-test-fixture',reviewedAt:'2026-10-28T00:00:00Z'}));return raw;};
const clone=()=>stamp(structuredClone(example));
const manifestFor=raw=>({schema:'piano-score-pages/v1',pages:raw.pages.map(p=>({page:p.page,sha256:p.sha256,file:`page-${p.page}.png`}))});
async function fileFixture(dir){
  const raw=clone(),manifest=manifestFor(raw),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64');
  for(let i=0;i<raw.pages.length;i++){raw.pages[i].sha256=manifest.pages[i].sha256=createHash('sha256').update(png).digest('hex');await fs.writeFile(path.join(dir,manifest.pages[i].file),png);}stamp(raw);
  const input=path.join(dir,'input.json'),mf=path.join(dir,'manifest.json'),out=path.join(dir,'out');await fs.writeFile(input,JSON.stringify(raw));await fs.writeFile(mf,JSON.stringify(manifest));return {raw,input,mf,out};
}

test('review flags are strict booleans even in drafts; stale measure and tie evidence cannot pass',()=>{
  for(const change of [r=>r.pages[0].reviewed='false',r=>r.pages[0].systems[0].complete='true',r=>r.pages[0].systems[0].reviewed=1,r=>r.notation.notes.bb.checked='false',r=>r.review.humanConfirmed='false']){
    const raw=clone();change(raw);assert.throws(()=>validateTranscription(raw,manifestFor(raw),{draft:true}),/布尔/);
  }
  const changed=clone();changed.score.notes.find(n=>n.id==='aSharp').velocity=.2;
  const draft=validateTranscription(changed,manifestFor(changed),{draft:true});
  assert.ok(draft.blockers.some(s=>s.includes('第1小节')&&s.includes('失效')));
  assert.ok(draft.blockers.some(s=>s.includes('第2小节')&&s.includes('失效')),'tie dependency invalidates the adjacent measure');
  assert.ok(!draft.blockers.some(s=>s.includes('第3小节')&&s.includes('失效')),'independent measure retains its evidence');
  assert.throws(()=>validateTranscription(changed,manifestFor(changed)),/失效/);
  const removed=clone();removed.score.notes=removed.score.notes.filter(n=>n.id!=='bbCarry');delete removed.notation.notes.bbCarry;
  assert.throws(()=>validateTranscription(removed,manifestFor(removed)),/失效/);
  const legacy=clone();delete legacy.review.evidence;
  assert.throws(()=>validateTranscription(legacy,manifestFor(legacy)),/复核证据/);
  assert.ok(validateTranscription(legacy,manifestFor(legacy),{draft:true}).blockers.length);
});

test('unknown source tempo can retain a draft without presenting practice BPM as source evidence',()=>{
  const raw=clone();raw.score.tempo=null;raw.notation.tempoMarks[0]={beat:0,unit:'quarter',dots:0,bpm:null};stamp(raw);
  const draft=validateTranscription(raw,manifestFor(raw),{draft:true});
  assert.equal(draft.score.tempo,90);assert.equal(draft.score.tempoEvidence.sourceBpm,null);
  assert.match(musicXML(draft),/练习速度/);assert.throws(()=>validateTranscription(raw,manifestFor(raw)),/原谱速度待确认/);
});

test('full-page coverage, stable identity, source accidental state and pitch arithmetic',()=>{
  const raw=clone(), manifest=manifestFor(raw), checked=validateTranscription(raw,manifest);
  assert.equal(checked.coverage.length,2);assert.equal(checked.score.measureMap.length,3);
  for(const mutate of [
    r=>r.pages.pop(),
    r=>r.pages[1].systems[0].measureStart=4,
    r=>r.notation.notes.bb.pitch.alter=1,
    r=>r.notation.notes.bbCarry.printedAccidental=0,
    r=>r.score.notes[1].id=r.score.notes[0].id,
    r=>r.score.notes[0].ornament='turn',
    r=>r.notation.unhandled.push({message:'踏板未适配',severity:'warning'}),
    r=>r.notation.notes.bb.checked=false,
  ]) {
    const changed=clone();mutate(changed);assert.throws(()=>validateTranscription(changed,manifest));
  }
  const draft=clone();draft.notation.notes.bb.checked=false;
  assert.equal(validateTranscription(draft,manifest,{draft:true}).blockers.length,1);
});

test('written flats and enharmonic sharps survive; ties, marks, tuplets and grace stay native',()=>{
  const raw=clone(),checked=validateTranscription(raw,manifestFor(raw)),xml=musicXML(checked);
  const parsed=new XMLParser({ignoreAttributes:false}).parse(xml);
  const measures=parsed['score-partwise'].part.measure;
  const all=measures.flatMap(m=>Array.isArray(m.note)?m.note:[m.note]);
  const byId=new Map(all.filter(Boolean).map(n=>[n['@_id'],n]));
  assert.deepEqual(byId.get('note-bb-m1').pitch,{step:'B',alter:-1,octave:4});
  assert.deepEqual(byId.get('note-aSharp-m1').pitch,{step:'A',alter:1,octave:4});
  assert.equal(byId.get('note-bn-m1').accidental,'natural');
  assert.equal(byId.get('note-aSharp-m1').tie['@_type'],'start');
  assert.equal(byId.get('note-aSharpTie-m2').tie['@_type'],'stop');
  assert.ok(byId.get('note-bb-m1').notations.articulations);
  assert.ok(byId.get('note-trill-m2').notations.ornaments);
  assert.equal(byId.get('note-arpC-m3').notations.arpeggiate['@_direction'],'up');
  assert.equal(byId.get('grace-graceD').grace['@_slash'],'yes');
  assert.equal(byId.get('note-t1-m3')['time-modification']['actual-notes'],3);
  assert.equal(byId.get('note-t1-m3').type,'eighth');
  assert.equal(byId.get('note-t1-m3').notations.tuplet['@_type'],'start');
  assert.equal(byId.get('note-t3-m3').notations.tuplet['@_type'],'stop');
  assert.equal(byId.get('note-end-m3').notations.fermata,'normal');
  assert.equal(byId.get('note-bb-m1').notations.slur['@_type'],'start');
  const mainPerformed=performanceNotes(checked.score);
  const tied=mainPerformed.filter(n=>n.sourceIds.includes('aSharp'));
  assert.equal(tied.length,1);assert.equal(tied[0].duration,2);
  assert.equal(mainPerformed.filter(n=>n.id==='trill').length,8);
});

test('printed dotted BPM and later tempo/key map are real MIDI events',()=>{
  const raw=clone();raw.notation.keys.push({measure:3,fifths:0,mode:'minor'});stamp(raw);
  const checked=validateTranscription(raw,manifestFor(raw)),data=parseMidi(midi(checked));
  const tempos=data.tracks.flat().filter(e=>e.type==='setTempo').map(e=>e.microsecondsPerBeat);
  assert.deepEqual(tempos,[Math.round(60000000/141),600000]);
  assert.deepEqual(data.tracks.flat().filter(e=>e.type==='keySignature').map(e=>e.scale),[0,1]);
  assert.match(musicXML(checked),/<beat-unit-dot\/>/);
  assert.match(musicXML(checked),/tempo="141"/);
});

test('source spelling controls auxiliary accidental and separate voices stay separate',()=>{
  const raw=clone();raw.score.notes[0].ornament='trill';raw.score.notes[0].ornamentInterval=2;
  raw.score.notes.push({...raw.score.notes[0],id:'bbOtherVoice',voice:'3',ornament:undefined,ornamentInterval:undefined});
  raw.notation.notes.bbOtherVoice=structuredClone(raw.notation.notes.bb);stamp(raw);
  const checked=validateTranscription(raw,manifestFor(raw)), parsed=new XMLParser({ignoreAttributes:false}).parse(musicXML(checked));
  const notes=parsed['score-partwise'].part.measure.flatMap(m=>m.note||[]), byId=new Map(notes.map(n=>[n['@_id'],n]));
  assert.equal(byId.get('note-bb-m1').notations.ornaments['accidental-mark'],undefined);
  assert.notEqual(byId.get('note-bb-m1').voice,byId.get('note-bbOtherVoice-m1').voice);
});

test('usage never substitutes missing totals or double-counts included cache tokens',()=>{
  const u=usageSummary([{usage:{inputTokens:100,cachedInputTokens:80,outputTokens:20,totalTokens:120}},{}]);
  assert.equal(u.fields.totalTokens.sum,120);assert.equal(u.fields.inputTokens.reportedCalls,1);
  assert.equal(u.fields.reasoningTokens.sum,null);assert.equal(u.calls,2);
});

test('standalone file build verifies real page hashes, reengraves SVG, and rejects missing source images',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'piano-skill-test-'));
  try {
    const raw=clone(), manifest=manifestFor(raw);
    // Tiny valid PNGs stand in for source pages. No model is called or measured.
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64');
    for(let i=0;i<2;i++) {
      raw.pages[i].sha256=manifest.pages[i].sha256=createHash('sha256').update(png).digest('hex');
      await fs.writeFile(path.join(dir,manifest.pages[i].file),png);
    }
    stamp(raw);
    const input=path.join(dir,'input.json'), mf=path.join(dir,'manifest.json'),out=path.join(dir,'out');
    await fs.writeFile(input,JSON.stringify(raw));await fs.writeFile(mf,JSON.stringify(manifest));
    const report=await build(input,mf,out);
    assert.equal(report.status,'checked');assert.equal(report.sourcePages,2);assert.equal(report.accuracy.measured,false);
    assert.ok(report.engravedPages>0);
    const svg=await fs.readFile(path.join(out,'engraved-001.svg'),'utf8');
    assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<image\b/);assert.match(svg,/class="note/);
    await assert.rejects(build(input,mf,out),/输出目录已存在/);
    await fs.writeFile(path.join(dir,manifest.pages[0].file),'changed');
    await assert.rejects(build(input,mf,path.join(dir,'again')),/原图第 1 页已变化/);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('explicit source rests and independent voices survive cross-staff engraving; gaps cannot become confirmed rests',()=>{
 const raw={schema:'piano-score-transcription/v1',pages:[{page:1,sha256:'synthetic',status:'score',reviewed:true,systems:[{id:'s',staves:2,measureStart:1,measureEnd:1,complete:true,reviewed:true}]}],
 score:{version:1,title:'self-composed evidence fixture',tempo:90,keySignature:0,mode:'major',timeSignature:[4,4],durationBeats:4,measureMap:[{beat:0,duration:4,timeSignature:[4,4]}],notes:[{id:'R',midi:60,beat:0,duration:1,hand:'right',voice:'1',staff:2},{id:'L',midi:48,beat:0,duration:4,hand:'left',voice:'2',staff:1}]},
 notation:{notes:{R:{pitch:{step:'C',alter:0,octave:4},printedAccidental:0,source:{page:1,system:'s',measure:1,staff:2},checked:true},L:{pitch:{step:'C',alter:0,octave:3},printedAccidental:0,source:{page:1,system:'s',measure:1,staff:1},checked:true}},keys:[{measure:1,fifths:0,mode:'major'}],rests:[{id:'rest-R',beat:1,duration:3,hand:'right',voice:'1',source:{page:1,system:'s',measure:1,staff:2},checked:true}],voices:[{hand:'right',voice:'1',from:0,to:4},{hand:'left',voice:'2',from:0,to:4}],clefs:[{beat:0,staff:1,sign:'G',line:2,octaveChange:0},{beat:0,staff:2,sign:'G',line:2,octaveChange:0}],unhandled:[]},issues:[],review:{status:'checked',humanConfirmed:false}};
 stamp(raw);const checked=validateTranscription(raw,manifestFor(raw));assert.equal(checked.score.rests.length,1);
 const parsed=new XMLParser({ignoreAttributes:false}).parse(musicXML(checked)),all=parsed['score-partwise'].part.measure.note;
 assert.equal(all.find(n=>n['@_id']==='note-R-m1').staff,2);assert.ok(all.some(n=>n.rest!==undefined&&n.staff===2));
 raw.notation.rests=[];const draft=validateTranscription(raw,manifestFor(raw),{draft:true});assert.ok(draft.blockers.some(s=>s.includes('空缺')||s.includes('缺少原谱')));assert.throws(()=>validateTranscription(raw,manifestFor(raw)));
});

test('a killed build publishes no half-result; explicit resume verifies reused files and atomically completes delivery',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'piano-skill-crash-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const {input,mf,out}=await fileFixture(dir);
 const source=new URL('./score_pipeline.mjs',import.meta.url).href;
 const code=`import {build} from ${JSON.stringify(source)};await build(${JSON.stringify(input)},${JSON.stringify(mf)},${JSON.stringify(out)},{render:false,onArtifact:name=>{if(name==='score.mid')process.kill(process.pid,'SIGKILL');}});`;
 assert.throws(()=>execFileSync(process.execPath,['--input-type=module','--eval',code],{stdio:'pipe'}),error=>error.signal==='SIGKILL');
 await assert.rejects(fs.stat(out),{code:'ENOENT'});const stage=path.join(dir,'.out.partial'),before=await fs.stat(path.join(stage,'score.musicxml'));
 const report=await build(input,mf,out,{render:false,resume:true});assert.equal(report.status,'checked');assert.equal((await fs.stat(path.join(out,'score.musicxml'))).mtimeMs,before.mtimeMs);
 const receipt=await verifyArtifactOutput(out);assert.equal(receipt.artifactSetComplete,true);assert.equal(receipt.transcriptionStatus,'checked');
 const saved=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8')),score=JSON.parse(await fs.readFile(path.join(out,'score.qinban.json'),'utf8'));assert.equal(saved.writtenMainNotes,score.notes.length);
 assert.deepEqual(await build(input,mf,out,{render:false,resume:true}),report);await assert.rejects(build(input,mf,out,{render:false}),/已存在/);
});
test('resume refuses changed inputs or edited stage files and never overwrites them',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'piano-skill-tamper-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const {input,mf,out}=await fileFixture(dir);
 await assert.rejects(build(input,mf,out,{render:false,onArtifact:name=>{if(name==='score.mid')throw Error('injected disk interruption');}}),/--resume/);
 await assert.rejects(build(input,mf,out,{render:true,resume:true}),{code:'ARTIFACT_FINGERPRINT'});
 const changed=path.join(dir,'.out.partial','score.mid');await fs.writeFile(changed,'explicit user edit');await assert.rejects(build(input,mf,out,{render:false,resume:true}),{code:'ARTIFACT_TAMPERED'});assert.equal(await fs.readFile(changed,'utf8'),'explicit user edit');await assert.rejects(fs.stat(out),{code:'ENOENT'});
});
test('concurrent builders cannot publish to or steal the same output location',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'piano-skill-lock-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const {input,mf,out}=await fileFixture(dir);let ready,release;const entered=new Promise(r=>ready=r),hold=new Promise(r=>release=r);
 const first=build(input,mf,out,{render:false,onArtifact:async name=>{if(name==='score.musicxml'){ready();await hold;}}});await entered;
 try{await assert.rejects(build(input,mf,out,{render:false,resume:true}),{code:'ARTIFACT_BUILD_BUSY'});}finally{release();}
 await first;assert.equal((await verifyArtifactOutput(out)).artifactSetComplete,true);
});
