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
import { performanceNotes } from './core/note-effects.mjs';
const {parseMidi}=MidiFilePackage;
const example=JSON.parse(await fs.readFile(fileURLToPath(new URL('../assets/transcription-example.json',import.meta.url)),'utf8'));
const clone=()=>structuredClone(example);
const manifestFor=raw=>({schema:'piano-score-pages/v1',pages:raw.pages.map(p=>({page:p.page,sha256:p.sha256,file:`page-${p.page}.png`}))});

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
  const raw=clone();raw.notation.keys.push({measure:3,fifths:0,mode:'minor'});
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
  raw.notation.notes.bbOtherVoice=structuredClone(raw.notation.notes.bb);
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
