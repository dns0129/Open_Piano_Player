import {writtenBeats} from './notation-rhythm.mjs';
import {createDisplayRepresentation, createPerformanceTimeline} from './score-representations.ts';
// The package root has different CJS/ESM entry points in Node and Vite.
// Its explicit UMD entry interoperates consistently in both environments.
import MidiPackage from '@tonejs/midi/build/Midi.js';
import MidiFilePackage from 'midi-file';
import { scoreMeasureBounds, beatsPerMeasure, scoreKeySignature } from './score.mjs';
import { ornamentAccidental } from './note-effects.mjs';
const { Midi } = MidiPackage;
const { parseMidi, writeMidi } = MidiFilePackage;

// Integral MusicXML ticks for 1/1024 beats, nested triplets through four
// levels, and the usual 5/7/11/13 tuplets. MIDI keeps its independent PPQ.
export const MUSICXML_DIVISIONS = 15360 * 27 * 7 * 11 * 13;
const DIVISIONS = MUSICXML_DIVISIONS;
const escapeXML = (value) => String(value ?? '').replace(/[<>&"']/g, (char) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));
const limit = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const tick = (beat) => Math.round(beat * DIVISIONS);
const gcd = (a, b) => b ? gcd(b, a % b) : a;

function normalizedNotes(score) {
  return (score.notes || []).filter((note) => Number.isFinite(note.midi) && Number.isFinite(note.beat)
    && Number.isFinite(note.duration) && note.duration > 0 && note.beat >= 0)
    .map((note) => ({ ...note, midi: Math.round(limit(note.midi, 0, 127)),
      start: tick(note.beat), ticks: Math.max(1, tick(note.duration)), hand: note.hand === 'left' ? 'left' : 'right' }))
    .sort((a, b) => a.start - b.start || a.midi - b.midi);
}

function rhythmXML(ticks, rhythm) {
  if(rhythm && Math.abs(writtenBeats(rhythm)*DIVISIONS-ticks)<.1){
    const ts=rhythm.tuplets||[],actual=ts.reduce((n,t)=>n*t.actual,1),normal=ts.reduce((n,t)=>n*t.normal,1);
    return `<type>${rhythm.type}</type>${'<dot/>'.repeat(rhythm.dots)}`+(ts.length?`<time-modification><actual-notes>${actual}</actual-notes><normal-notes>${normal}</normal-notes></time-modification>`:'');
  }
  const types = [['long', 16], ['breve', 8], ['whole', 4], ['half', 2], ['quarter', 1],
    ['eighth', 0.5], ['16th', 0.25], ['32nd', 0.125], ['64th', 0.0625], ['128th', 0.03125], ['256th', 0.015625]];
  for (const [name, beats] of types) {
    for (let dots = 0; dots <= 2; dots++) {
      const value = beats * (2 - 1 / 2 ** dots) * DIVISIONS;
      if (Math.abs(ticks - value) < 0.01) return `<type>${name}</type>${'<dot/>'.repeat(dots)}`;
    }
  }
  // MusicXML duration is authoritative. Preserve an unusual or tuplet duration
  // exactly and describe its ratio to a conventional written note.
  const [, beats] = types.reduce((best, candidate) => Math.abs(Math.log2(ticks / (candidate[1] * DIVISIONS)))
    < Math.abs(Math.log2(ticks / (best[1] * DIVISIONS))) ? candidate : best, types[4]);
  const name = types.find((entry) => entry[1] === beats)[0];
  const baseTicks = Math.round(beats * DIVISIONS);
  const divisor = gcd(baseTicks, ticks);
  return `<type>${name}</type><time-modification><actual-notes>${baseTicks / divisor}</actual-notes>`
    + `<normal-notes>${ticks / divisor}</normal-notes></time-modification>`;
}

function pitchXML(midi, useFlats, written) {
  if(written)return '<pitch><step>'+written.step+'</step>'+(written.alter?'<alter>'+written.alter+'</alter>':'')+'<octave>'+written.octave+'</octave></pitch>';
  const sharps = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
  const flats = [['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0]];
  const [step, alter] = (useFlats ? flats : sharps)[midi % 12];
  return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${Math.floor(midi / 12) - 1}</octave></pitch>`;
}

function assignVoices(notes, rests=[]) {
  const byVoice=new Map();
  for(const note of [...notes,...rests]){
    const name=note.voice||'1';if(!byVoice.has(name))byVoice.set(name,new Map());
    const groups=byVoice.get(name),key=[note.start,note.ticks,note.rest?'rest':'note'].join(':');
    if(groups.has(key)&&!note.rest)groups.get(key).notes.push(note);
    else groups.set(key,{start:note.start,ticks:note.ticks,notes:note.rest?[]:[note],rest:note.rest,rhythm:note.rhythm,sourceRest:note.rest?note:undefined});
  }
  const voices=[];
  for(const [name,groups]of byVoice){
    const lanes=[];
    for(const group of [...groups.values()].sort((a,b)=>a.start-b.start||b.ticks-a.ticks)){
      let lane=lanes.find(v=>v.end<=group.start);
      if(!lane){lane={id:lanes.length?name+'-'+(lanes.length+1):name,end:0,groups:[]};lanes.push(lane);}
      lane.groups.push(group);lane.end=group.start+group.ticks;
    }
    voices.push(...lanes);
  }
  return voices.length?voices:[{id:'1',end:0,groups:[]}];
}

/** Export a two-staff, editable piano MusicXML score with real rests and ties. */
/** `noteIds` adds stable id="note-<id>-m<measure>" attributes (used by the score-to-MusicXML Skill). */
export function exportMusicXML(score, { noteIds = false } = {}) {
  score=createDisplayRepresentation(score).score;
  const notes = normalizedNotes(score);
  const incoming=new Set(notes.filter(n=>n.tieTo).map(n=>n.tieTo));
  const expressive=!!score.recognitionEvidence||notes.some(n=>n.rhythm||n.dynamic||n.accent||n.articulation||n.ornament||n.arpeggio||n.tieTo||n.grace||n.fermata);
  const numerator = Math.round(limit(score.timeSignature?.[0] || 4, 1, 32));
  const denominatorValue = Number(score.timeSignature?.[1]) || 4;
  const denominator = [1, 2, 4, 8, 16, 32].includes(denominatorValue) ? denominatorValue : 4;
  const measureTicks = Math.round(numerator * 4 / denominator * DIVISIONS);
  const durationTicks = Math.max(tick(Number(score.durationBeats) || 0), ...notes.map((note) => note.start + note.ticks), 1);
  const measureCount = score.measureMap?.length || Math.max(1, Math.ceil(durationTicks / measureTicks));
  const fifths = Math.round(limit(score.keySignature || 0, -7, 7));
  const tempo = limit(score.tempo || 88, 20, 300);
  const guitar = score.instrument === 'guitar';
  const staffOf=n=>guitar ? 1 : n.staff || (n.hand==='left'?2:1);
  const rests=(score.rests||[]).filter(r=>r.provenance!=='inferred').map(r=>({...r,rest:true,start:tick(r.beat),ticks:tick(r.duration)}));
  const hands=(guitar?[1]:[1,2]).map(staff=>assignVoices(notes.filter(n=>staffOf(n)===staff),rests.filter(r=>(guitar?1:r.staff)===staff)));
  const source = [score.source?.label, score.source?.license, score.source?.url].filter(Boolean).join(' · ');
  const sourceClefs=score.recognitionEvidence?.clefs||[];
  const clefXML=(staff,beat)=>{const c=sourceClefs.filter(c=>c.staff===staff&&c.beat<=beat).sort((a,b)=>a.beat-b.beat).at(-1)||{sign:staff===1?'G':'F',line:staff===1?2:4};return `<clef number="${staff}"><sign>${c.sign}</sign><line>${c.line}</line></clef>`;};
  const measures = [];
  for (let index = 0; index < measureCount; index++) {
    const bounds = scoreMeasureBounds(score,index);
    const currentKey=scoreKeySignature(score,index);
    const begin = tick(bounds.start);
    const end = Math.min(tick(bounds.end), durationTicks);
    const length = end - begin;
    const content = [];
    if (index === 0) {
      content.push(`<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${fifths}</fifths>${score.mode ? `<mode>${score.mode}</mode>` : ''}</key>`
        + `<time><beats>${numerator}</beats><beat-type>${denominator}</beat-type></time><staves>${guitar?1:2}</staves>`
        + clefXML(1,0) + (guitar?'':clefXML(2,0)) + '</attributes>');
      content.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>`
        + `<per-minute>${tempo}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${tempo}"/></direction>`);
      if(score.tempoMap?.length||score.fermatas?.length)content.push(`<direction><direction-type><other-direction>${escapeXML('qinban-timing:'+JSON.stringify({tempoMap:score.tempoMap||[],fermatas:score.fermatas||[]}))}</other-direction></direction-type></direction>`);
    }
    for(const e of score.tempoMap||[])if(e.beat>=bounds.start&&e.beat<bounds.end)content.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${e.bpm}</per-minute></metronome></direction-type><offset>${tick(e.beat-bounds.start)}</offset><sound tempo="${e.bpm}"/></direction>`);
    if (index > 0 && bounds.timeSignature.join('/') !== scoreMeasureBounds(score,index-1).timeSignature.join('/')) content.push(`<attributes><time><beats>${bounds.timeSignature[0]}</beats><beat-type>${bounds.timeSignature[1]}</beat-type></time></attributes>`);
    if(index>0&&currentKey!==scoreKeySignature(score,index-1))content.push('<attributes><key><fifths>'+currentKey+'</fifths></key></attributes>');
    if(index>0){const changes=sourceClefs.filter(c=>Math.abs(c.beat-bounds.start)<1e-6);if(changes.length)content.push('<attributes>'+changes.map(c=>clefXML(c.staff,bounds.start)).join('')+'</attributes>');}
    let firstVoice = true;
    let voiceId = 0;
    for (let staffIndex = 0; staffIndex < hands.length; staffIndex++) {
      for (const voice of hands[staffIndex]) {
        voiceId=voice.id;
        if (!firstVoice) content.push(`<backup><duration>${length}</duration></backup>`);
        firstVoice = false;
        let cursor = begin;
        const rest = (amount,rhythm,original) => `<note><rest/><duration>${amount}</duration><voice>${escapeXML(voiceId)}</voice>`
          + `${rhythmXML(amount,rhythm)}<staff>${staffIndex + 1}</staff>${original?'<play><other-play type="qinban-rest">'+escapeXML(JSON.stringify(original))+'</other-play></play>':''}</note>`;
        for (const group of voice.groups) {
          if (group.start >= end || group.start + group.ticks <= begin) continue;
          const start = Math.max(group.start, begin);
          const stop = Math.min(group.start + group.ticks, end);
          if (start > cursor) content.push(rest(start - cursor));
          if(group.rest){content.push(rest(stop-start,group.rhythm,group.sourceRest));cursor=stop;continue;}
          const tieStop = group.start < begin;
          const tieStart = group.start + group.ticks > end;
          group.notes.forEach((note, chordIndex) => {
            const attack=start===note.start, begins=tieStart||!!note.tieTo, ends=tieStop||(attack&&incoming.has(note.id));
            const ties = `${ends ? '<tie type="stop"/>' : ''}${begins ? '<tie type="start"/>' : ''}`;
            const articulation=attack?[note.accent==='accent'?'<accent/>':note.accent==='marcato'?'<strong-accent type="up"/>':'',note.articulation?`<${note.articulation}/>`:''].join(''):'';
            const auxAccidental=ornamentAccidental(note,fifths), auxMark=auxAccidental?`<accidental-mark placement="${note.ornament==='mordent-lower'?'below':'above'}">${({bb:'flat-flat',b:'flat',n:'natural','#':'sharp','##':'double-sharp'})[auxAccidental]}</accidental-mark>`:'';
            const ornament=attack&&note.ornament?`<ornaments>${note.ornament==='trill'?'<trill-mark/>':note.ornament==='mordent-upper'?'<inverted-mordent/>':'<mordent/>'}${auxMark}</ornaments>`:'';
            const notation=`${ends?'<tied type="stop"/>':''}${begins?'<tied type="start"/>':''}${articulation?`<articulations>${articulation}</articulations>`:''}${ornament}${attack&&note.arpeggio?`<arpeggiate direction="${note.arpeggio}"/>`:''}${stop===note.start+note.ticks&&note.fermata?'<fermata/>':''}`;
            const notations=notation?`<notations>${notation}</notations>`:'';
            if(attack&&note.dynamic&&!group.notes.slice(0,chordIndex).some(n=>n.dynamic)) content.push(`<direction placement="below"><direction-type><dynamics><${note.dynamic}/></dynamics></direction-type><voice>${escapeXML(voiceId)}</voice><staff>${staffIndex+1}</staff></direction>`);
            // Native MusicXML marks remain usable in other editors. Optional play
            // metadata preserves note-local settings and explicit ties on reimport.
            const expression=expressive&&attack?{...Object.fromEntries(['rhythm','id','hand','staff','sourcePositions','dynamic','accent','articulation','ornament','ornamentInterval','arpeggio','tieTo','velocity','grace','fermata'].filter(k=>note[k]!==undefined&&(k!=='rhythm'||Math.abs(writtenBeats(note.rhythm)*DIVISIONS-(stop-start))<1)).map(k=>[k,note[k]])),voice:note.voice??''}:null;
            const play=expression?`<play><other-play type="qinban-expression">${escapeXML(JSON.stringify(expression))}</other-play></play>`:'';
            if(attack&&note.grace)for(const g of note.grace.notes)content.push(`<note><grace slash="${note.grace.slash?'yes':'no'}"/>${pitchXML(g.midi,currentKey<0,g.pitch)}<voice>${escapeXML(voiceId)}</voice><type>16th</type><staff>${staffIndex+1}</staff></note>`);
            content.push(`<note${noteIds?` id="note-${escapeXML(note.id)}-m${index+1}"`:''}${expressive?` dynamics="${((note.velocity??.7)*127/90*100).toFixed(4)}"`:''}>${chordIndex ? '<chord/>' : ''}${pitchXML(note.midi, currentKey < 0, note.pitch)}`
              + `<duration>${stop - start}</duration>${ties}<voice>${escapeXML(voiceId)}</voice>`
              + `${rhythmXML(stop - start,note.rhythm)}${note.accidental?'<accidental>'+escapeXML(note.accidental)+'</accidental>':''}<staff>${staffIndex + 1}</staff>${notations}${play}</note>`);
          });
          cursor = stop;
        }
        if (cursor < end) content.push(rest(end - cursor));
      }
    }
    if (index === measureCount - 1) content.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    measures.push(`<measure number="${index + 1}"${length < tick(beatsPerMeasure({timeSignature:bounds.timeSignature})) ? ' implicit="yes"' : ''}>${content.join('')}</measure>`);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<score-partwise version="4.0"><work><work-title>${escapeXML(score.title || '钢琴练习')}</work-title></work>`
    + `<identification><creator type="composer">${escapeXML(score.composer || '')}</creator>`
    + `${source ? `<source>${escapeXML(source)}</source>` : ''}${score.recognitionEvidence?'<miscellaneous><miscellaneous-field name="qinban-recognition-evidence">'+escapeXML(JSON.stringify(score.recognitionEvidence))+'</miscellaneous-field></miscellaneous>':''}</identification>`
    + `<credit><credit-words>${escapeXML(source)}</credit-words></credit>`
    + `<part-list><score-part id="P1"><part-name>${guitar?'Guitar':'Piano'}</part-name><part-abbreviation>${guitar?'Gtr.':'Pno.'}</part-abbreviation>`
    + `<score-instrument id="P1-I1"><instrument-name>${guitar?'Guitar':'Piano'}</instrument-name></score-instrument>`
    + `<midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>${guitar?25:1}</midi-program></midi-instrument>`
    + `</score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>`;
}

/** Export two piano tracks. @tonejs/midi converts quarter-note beats to MIDI ticks. */
export function exportMidi(score) {
  const performance=createPerformanceTimeline(score);score=performance.score;
  const midi = new Midi();
  const tempo = limit(score.tempo || 88, 20, 300);
  midi.name = score.title || '钢琴练习';
  midi.header.name = midi.name;
  const timeline=performance.timing,holds=timeline.segments.filter(s=>s.from===s.to);
  const midiBeat=beat=>beat+holds.filter(s=>s.from<=beat).reduce((sum,s)=>sum+(s.end-s.start)*timeline.tempoAt(s.from)/60,0);
  // Integrate each ramp slice, then use its exact average tempo. MIDI tempo
  // events are stepped; slices <= 1/32 beat bound the audible approximation.
  midi.header.tempos=[];let performedBeat=0;
  for(const s of timeline.segments){
    const hold=s.from===s.to,count=hold?1:Math.min(Math.max(1,Math.floor(32768/Math.max(1,timeline.segments.length))),Math.max(1,Math.ceil((s.to-s.from)/(s.slope?1/32:20000))));
    for(let i=0;i<count;i++){
      const length=hold?(s.end-s.start)*timeline.tempoAt(s.from)/60:(s.to-s.from)/count;
      const a=hold?s.start:timeline.secondsAt(s.from+i*length),b=hold?s.end:timeline.secondsAt(s.from+(i+1)*length,'before');
      midi.header.tempos.push({ticks:Math.round(performedBeat*midi.header.ppq),bpm:60*length/(b-a)});performedBeat+=length;
    }
  }
  if(!midi.header.tempos.length)midi.header.setTempo(tempo);else midi.header.update();
  const meters = score.measureMap || [{beat:0,timeSignature:score.timeSignature || [4,4]}];
  for (let i=0;i<meters.length;i++) if (i===0 || meters[i].timeSignature.join('/')!==meters[i-1].timeSignature.join('/')) midi.header.timeSignatures.push({ticks:Math.round(midiBeat(meters[i].beat)*midi.header.ppq),timeSignature:meters[i].timeSignature});
  const notes = normalizedNotes({...score,notes:performance.notes});
  for (const hand of (score.instrument === 'guitar' ? ['guitar'] : ['right', 'left'])) {
    const track = midi.addTrack();
    track.name = hand === 'guitar' ? '尼龙弦吉他 · Guitar' : hand === 'right' ? '右手 · Right hand' : '左手 · Left hand';
    track.instrument.number = hand === 'guitar' ? 24 : 0;
    track.channel = hand === 'right' ? 0 : 1;
    for (const note of notes.filter((entry) => hand === 'guitar' || entry.hand === hand)) {
      track.addNote({ midi: note.midi, ticks: Math.round(midiBeat(note.beat) * midi.header.ppq),
        durationTicks: Math.max(1, Math.round((midiBeat(note.beat+note.duration)-midiBeat(note.beat)) * midi.header.ppq)),
        velocity: limit(note.velocity ?? 0.75, 0, 1) });
    }
  }
  // @tonejs/midi writes end-of-track immediately after the last event even when
  // Track.endOfTrackTicks is supplied. Extend the SMF end event itself to keep
  // written trailing rests, without adding a silent note or controller event.
  const data = parseMidi(midi.toArray());
  // Write the signed SMF fifths directly; the installed wrapper's encoder
  // offsets its key index incorrectly. Notes and mode must round-trip together.
  if (score.mode && data.tracks[0]) data.tracks[0].unshift({deltaTime:0,meta:true,type:'keySignature',key:score.keySignature || 0,scale:score.mode==='minor'?1:0});
  const endTick = Math.max(Math.round(midiBeat(Number(score.durationBeats) || 0) * midi.header.ppq),
    ...midi.tracks.map(track => track.durationTicks), 0);
  for (const track of data.tracks) {
    let elapsed = 0;
    for (const event of track) {
      if (event.type === 'endOfTrack') event.deltaTime = Math.max(event.deltaTime, endTick - elapsed);
      elapsed += event.deltaTime;
    }
  }
  return new Uint8Array(writeMidi(data));
}
