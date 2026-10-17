import test from 'node:test';
import assert from 'node:assert/strict';
import MidiPackage from '@tonejs/midi/build/Midi.js';
import { zipSync, strToU8 } from 'fflate';
import { validateScore, transposeScore, beatsPerMeasure } from '../lib/score.mjs';

test('triplet totals tolerate machine rounding while genuine note overruns remain invalid',()=>{
  const raw={durationBeats:13.333333333333332,notes:[{id:'triplet',beat:13,duration:1/3,midi:60,hand:'right'}]};
  assert.equal(validateScore(raw).durationBeats,raw.durationBeats);
  assert.throws(()=>validateScore({...raw,durationBeats:13.333}),/乐谱总拍数/);
});
import { importScore, importMusicXML } from '../lib/importers.mjs';
import { library, findLibraryScores } from '../lib/catalog.mjs';
import { measureSegments, spellMidi, numberedPitch, planSystems, durationGlyph } from '../lib/notation-layout.mjs';
const { Midi }=MidiPackage;

test('MIDI titles recover Chinese metadata only when the actual filename confirms it',async()=>{
  const midi=new Midi();midi.name=String.fromCharCode(0xc7,0xe0,0xbb,0xa8,0xb4,0xc9);
  midi.addTrack().addNote({midi:60,ticks:0,durationTicks:480,velocity:.7});
  const imported=await importScore(midi.toArray(),'(SG)青花瓷.mid');
  assert.equal(imported.score.title,'青花瓷');assert.equal(imported.score.notes[0].midi,60);
  const other=new Midi();other.name='Etude';other.addTrack().addNote({midi:64,ticks:0,durationTicks:480});
  assert.equal((await importScore(other.toArray(),'练习.mid')).score.title,'Etude');
});

const fixture = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>双手测试</work-title></work><identification><creator type="composer">Tester</creator></identification><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes><direction><sound tempo="84"/></direction><note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><tie type="start"/></note><note><chord/><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note><note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><tie type="stop"/></note><note><rest/><duration>8</duration><voice>1</voice><staff>1</staff></note><backup><duration>16</duration></backup><note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><staff>2</staff></note><note><pitch><step>D</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><staff>2</staff></note></measure><measure number="2"><note><pitch><step>G</step><octave>4</octave></pitch><duration>16</duration><staff>1</staff></note></measure></part></score-partwise>`;

test('MusicXML preserves chord timing, backup, hands, key, tempo, metadata and ties',()=>{
  const {score,warnings}=importMusicXML(fixture);
  assert.equal(score.title,'双手测试');assert.equal(score.composer,'Tester');assert.equal(score.tempo,84);assert.equal(score.keySignature,1);
  assert.equal(score.durationBeats,8);assert.equal(warnings.length,0);
  assert.deepEqual(score.notes.map(({beat,duration,midi,hand})=>({beat,duration,midi,hand})),[
    {beat:0,duration:2,midi:43,hand:'left'},
    {beat:0,duration:2,midi:66,hand:'right'},
    {beat:0,duration:1,midi:69,hand:'right'},
    {beat:2,duration:2,midi:50,hand:'left'},
    {beat:4,duration:4,midi:67,hand:'right'},
  ]);
});

test('MusicXML pickup uses its true duration rather than inserting a full empty bar',()=>{
  const pickup=`<score-partwise><part id="P1"><measure number="0" implicit="yes"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><staff>1</staff></note></measure><measure number="1"><note><pitch><step>D</step><octave>4</octave></pitch><duration>3</duration><staff>1</staff></note></measure></part></score-partwise>`;
  const {score}=importMusicXML(pickup);assert.equal(score.notes[1].beat,1);assert.equal(score.durationBeats,4);
});

test('MXL finds rootfile from container and parses compressed XML',async()=>{
  const zip=zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="scores/main.musicxml"/></rootfiles></container>'),'scores/main.musicxml':strToU8(fixture)});
  const {score}=await importScore(zip,'test.mxl');assert.equal(score.notes.length,5);assert.equal(score.tempo,84);
});

test('MIDI converts ticks to beats without losing independent tracks and chords',async()=>{
  const midi=new Midi();midi.header.setTempo(100);midi.header.timeSignatures.push({ticks:0,timeSignature:[3,4]});
  midi.addTrack().addNote({midi:72,ticks:0,durationTicks:240,velocity:.8}).addNote({midi:76,ticks:0,durationTicks:480,velocity:.7});
  midi.addTrack().addNote({midi:48,ticks:0,durationTicks:960,velocity:.5});
  const {score,warnings}=await importScore(midi.toArray(),'dual.mid');
  assert.equal(score.tempo,100);assert.deepEqual(score.timeSignature,[3,4]);
  assert.equal(score.notes.find(n=>n.midi===72).duration,.5);assert.equal(score.notes.find(n=>n.midi===48).duration,2);
  assert.equal(score.notes.find(n=>n.midi===48).hand,'left');assert.equal(score.notes.find(n=>n.midi===72).hand,'right');assert.ok(warnings.length);
});

test('validation rejects unsafe or unbounded event data',()=>{
  const source=library[0];
  for(const change of [{midi:109},{beat:Infinity},{duration:-1},{hand:'other'},{velocity:2}])assert.throws(()=>validateScore({...source,notes:[{...source.notes[0],...change}]}));
  assert.throws(()=>validateScore({...source,durationBeats:1}));
  assert.throws(()=>validateScore({...source,notes:Array(10001).fill(source.notes[0])}));
  assert.throws(()=>validateScore({...source,tempo:0}));
  assert.throws(()=>importMusicXML('<!ENTITY x "bad"><score-partwise/>'));
});

test('transposition changes all pitches and key signature consistently and respects piano range',()=>{
  const score=transposeScore(library[0],2);assert.equal(score.keySignature,2);assert.equal(score.notes[0].midi,library[0].notes[0].midi+2);assert.equal(score.notes[0].beat,library[0].notes[0].beat);
  assert.throws(()=>transposeScore({...library[0],notes:[{...library[0].notes[0],midi:108}]},1));
});

test('key spelling and numbered pitches respect sharp/flat key signatures and octaves',()=>{
  const {letter,accidental,octave}=spellMidi(65,6);
  assert.deepEqual({letter,accidental,octave},{letter:'E',accidental:1,octave:4});
  assert.equal(spellMidi(61,-5).letter,'D');
  assert.deepEqual(numberedPitch(67,1),{degree:1,octave:0,accidental:0});
  assert.deepEqual(numberedPitch(66,1),{degree:7,octave:-1,accidental:0});
  assert.deepEqual(numberedPitch(72,0),{degree:1,octave:1,accidental:0});
  assert.deepEqual(numberedPitch(61,0),{degree:1,octave:0,accidental:1});
});

test('engraving segments keep whole measures and tie independent overlapping durations',()=>{
  const score=validateScore({notes:[{id:'long',beat:0,duration:4,midi:60,hand:'right'},{id:'short',beat:1,duration:1,midi:64,hand:'right'}]});
  const segments=measureSegments(score,0,'right');
  assert.equal(segments.reduce((n,s)=>n+s.duration,0),beatsPerMeasure(score));
  assert.deepEqual(segments.map(s=>[s.beat,s.duration,s.notes.length]),[[0,1,1],[1,1,2],[2,2,1]]);
  assert.equal(measureSegments(score,0,'left')[0].notes.length,0);
});

test('library distinguishes simplified arrangements from the complete source edition and has searchable aliases',()=>{
  for(const score of library){assert.equal(validateScore(score).notes.length,score.notes.length);assert.ok(score.notes.some(n=>n.hand==='left'));assert.ok(score.notes.some(n=>n.hand==='right'));if(score.source.kind==='public-domain-arrangement')assert.match(score.source.label,/非原版全曲/);}
  const complete=findLibraryScores('野蜂飞舞')[0];
  assert.equal(complete.id,'bumblebee-yeung-complete');assert.equal(complete.source.kind,'pdf-transcription-checked');assert.equal(complete.notes.length,1313);assert.equal(complete.durationBeats,210);assert.match(complete.source.license,/CC BY-SA 3\.0/);assert.match(complete.source.license,/Non-PD US/);
  assert.equal(findLibraryScores('小星星')[0].id,'twinkle');assert.equal(findLibraryScores('ode to joy')[0].id,'ode-to-joy');assert.equal(findLibraryScores('不存在的歌曲').length,0);
});

test('continuous systems pack 1–5 bars responsively with no horizontal gaps or lost measures',()=>{
  const score=library[0], count=Math.ceil(score.durationBeats/beatsPerMeasure(score));
  for(const [width,expected]of[[280,1],[420,2],[640,3],[900,4],[1200,5]]){
    for(const mode of['staff','numbered']){
      const systems=planSystems(score,width,mode);
      assert.equal(systems[0].bars.length,expected);
      assert.deepEqual(systems.flatMap(s=>s.bars.map(b=>b.index)),Array.from({length:count},(_,i)=>i));
      for(const system of systems){
        assert.ok(system.width>=width);
        assert.equal(system.bars[0].x,16);
        assert.ok(Math.abs(system.bars.at(-1).endX-(system.width-16))<.001);
        for(let i=0;i<system.bars.length;i++){
          const bar=system.bars[i];assert.ok(bar.width>0);
          if(i){assert.equal(bar.prefix,0);assert.ok(Math.abs(bar.x-system.bars[i-1].endX)<.001);}
        }
      }
    }
  }
});

test('dense bars remain isolated and get enough logical width for note spacing',()=>{
  const score=validateScore({notes:Array.from({length:32},(_,i)=>({id:`dense-${i}`,beat:i*.25,duration:.25,midi:60+(i%8),hand:'right'}))});
  const systems=planSystems(score,420);
  assert.equal(systems[0].bars.length,1);assert.ok(systems[0].width>420);
  assert.ok(systems[0].bars[0].width>=16*25);
});

test('sustained events retain their original identity across bar and system boundaries',()=>{
  const score=validateScore({notes:[{id:'held',beat:3,duration:6,midi:60,hand:'right'},{id:'bass',beat:0,duration:9,midi:48,hand:'left'}]});
  assert.equal(measureSegments(score,0,'right').at(-1).notes[0].id,'held');
  assert.equal(measureSegments(score,1,'right')[0].notes[0].id,'held');
  assert.equal(measureSegments(score,2,'right')[0].notes[0].id,'held');
  const systems=planSystems(score,280);assert.equal(systems.length,3);
  assert.deepEqual(systems.map(s=>s.bars[0].index),[0,1,2]);
});

test('every supported duration has a real VexFlow glyph including numeric fractional durations',()=>{
  for(const [duration,expected]of[[6,['w',1]],[4,['w',0]],[3,['h',1]],[2,['h',0]],[1.5,['q',1]],[1,['q',0]],[.75,['8',1]],[.5,['8',0]],[.25,['16',0]]])assert.deepEqual(durationGlyph(duration),expected);
  for(const score of library)for(let i=0;i<Math.ceil(score.durationBeats/beatsPerMeasure(score));i++)for(const hand of['right','left'])for(const segment of measureSegments(score,i,hand))assert.ok(durationGlyph(segment.duration),`${score.title}: bar ${i+1}, ${segment.duration}`);
});
