// The package root has different CJS/ESM entry points in Node and Vite.
// Its explicit UMD entry interoperates consistently in both environments.
import MidiPackage from '@tonejs/midi/build/Midi.js';
import MidiFilePackage from 'midi-file';
import { scoreMeasureBounds, beatsPerMeasure } from './score.mjs';
import { performanceNotes, ornamentAccidental } from './note-effects.mjs';
const { Midi } = MidiPackage;
const { parseMidi, writeMidi } = MidiFilePackage;

// Exactly represents straight, triplet, quintuplet, and 1/1024-quarter durations.
const DIVISIONS = 15360;
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

function rhythmXML(ticks) {
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

function pitchXML(midi, useFlats) {
  const sharps = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
  const flats = [['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0]];
  const [step, alter] = (useFlats ? flats : sharps)[midi % 12];
  return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${Math.floor(midi / 12) - 1}</octave></pitch>`;
}

function assignLayer(notes) {
  const grouped = new Map();
  for (const note of notes) {
    const key = `${note.start}:${note.ticks}:${note.rest?1:0}`;
    if (grouped.has(key)) grouped.get(key).notes.push(note);
    else grouped.set(key, { start: note.start, ticks: note.ticks, notes: note.rest?[]:[note], rest:note.rest, source:note });
  }
  const groups = [...grouped.values()].sort((a, b) => a.start - b.start || b.ticks - a.ticks);
  const voices = [];
  for (const group of groups) {
    let voice = voices.find((candidate) => candidate.end <= group.start);
    if (!voice) { voice = { end: 0, groups: [] }; voices.push(voice); }
    voice.groups.push(group);
    voice.end = group.start + group.ticks;
  }
  return voices.length ? voices : [{ end: 0, groups: [] }];
}

// Skill adapter: explicit source voices must not collapse into one chord.
function assignVoices(notes) {
  const layers = new Map();
  for (const note of notes) {
    const key = String(note.voice ?? '');
    if (!layers.has(key)) layers.set(key, []);
    layers.get(key).push(note);
  }
  return layers.size ? [...layers.values()].flatMap(assignLayer) : assignLayer([]);
}

/** Export a two-staff, editable piano MusicXML score with real rests and ties. */
export function exportMusicXML(score) {
  const notes = normalizedNotes(score);
  const incoming=new Set(notes.filter(n=>n.tieTo).map(n=>n.tieTo));
  const expressive=notes.some(n=>n.dynamic||n.accent||n.articulation||n.ornament||n.arpeggio||n.tieTo);
  const numerator = Math.round(limit(score.timeSignature?.[0] || 4, 1, 32));
  const denominatorValue = Number(score.timeSignature?.[1]) || 4;
  const denominator = [1, 2, 4, 8, 16, 32].includes(denominatorValue) ? denominatorValue : 4;
  const measureTicks = Math.round(numerator * 4 / denominator * DIVISIONS);
  const durationTicks = Math.max(tick(Number(score.durationBeats) || 0), ...notes.map((note) => note.start + note.ticks), 1);
  const measureCount = score.measureMap?.length || Math.max(1, Math.ceil(durationTicks / measureTicks));
  const fifths = Math.round(limit(score.keySignature || 0, -7, 7));
  const tempo = limit(score.tempo || 88, 20, 300);
  const events=[...notes,...(score.rests||[]).map(r=>({...r,rest:true,start:tick(r.beat),ticks:tick(r.duration)}))];
  const hands=[1,2].map(staff=>assignVoices(events.filter(n=>(n.staff||(n.hand==='left'?2:1))===staff)));
  const source = [score.source?.label, score.source?.license, score.source?.url].filter(Boolean).join(' · ');
  const measures = [];
  for (let index = 0; index < measureCount; index++) {
    const bounds = scoreMeasureBounds(score,index);
    const begin = tick(bounds.start);
    const end = Math.min(tick(bounds.end), durationTicks);
    const length = end - begin;
    const content = [];
    if (index === 0) {
      content.push(`<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${fifths}</fifths>${score.mode ? `<mode>${score.mode}</mode>` : ''}</key>`
        + `<time><beats>${numerator}</beats><beat-type>${denominator}</beat-type></time><staves>2</staves>`
        + '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>');
      content.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>`
        + `<per-minute>${tempo}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${tempo}"/></direction>`);
    }
    if (index > 0 && bounds.timeSignature.join('/') !== scoreMeasureBounds(score,index-1).timeSignature.join('/')) content.push(`<attributes><time><beats>${bounds.timeSignature[0]}</beats><beat-type>${bounds.timeSignature[1]}</beat-type></time></attributes>`);
    let firstVoice = true;
    let voiceId = 0;
    for (let staffIndex = 0; staffIndex < hands.length; staffIndex++) {
      for (const voice of hands[staffIndex]) {
        voiceId++;
        if (!firstVoice) content.push(`<backup><duration>${length}</duration></backup>`);
        firstVoice = false;
        let cursor = begin;
        const rest = (amount) => `<note><rest/><duration>${amount}</duration><voice>${voiceId}</voice>`
          + `${rhythmXML(amount)}<staff>${staffIndex + 1}</staff></note>`;
        for (const group of voice.groups) {
          if (group.start >= end || group.start + group.ticks <= begin) continue;
          const start = Math.max(group.start, begin);
          const stop = Math.min(group.start + group.ticks, end);
          if (start > cursor) content.push(rest(start - cursor));
          if(group.rest){content.push(rest(stop-start));cursor=stop;continue;}
          const tieStop = group.start < begin;
          const tieStart = group.start + group.ticks > end;
          group.notes.forEach((note, chordIndex) => {
            const attack=start===note.start, begins=tieStart||!!note.tieTo, ends=tieStop||(attack&&incoming.has(note.id));
            const ties = `${ends ? '<tie type="stop"/>' : ''}${begins ? '<tie type="start"/>' : ''}`;
            const articulation=attack?[note.accent==='accent'?'<accent/>':note.accent==='marcato'?'<strong-accent type="up"/>':'',note.articulation?`<${note.articulation}/>`:''].join(''):'';
            const auxAccidental=ornamentAccidental(note,fifths), auxMark=auxAccidental?`<accidental-mark placement="${note.ornament==='mordent-lower'?'below':'above'}">${({bb:'flat-flat',b:'flat',n:'natural','#':'sharp','##':'double-sharp'})[auxAccidental]}</accidental-mark>`:'';
            const ornament=attack&&note.ornament?`<ornaments>${note.ornament==='trill'?'<trill-mark/>':note.ornament==='mordent-upper'?'<inverted-mordent/>':'<mordent/>'}${auxMark}</ornaments>`:'';
            const notation=`${ends?'<tied type="stop"/>':''}${begins?'<tied type="start"/>':''}${articulation?`<articulations>${articulation}</articulations>`:''}${ornament}${attack&&note.arpeggio?`<arpeggiate direction="${note.arpeggio}"/>`:''}`;
            const notations=notation?`<notations>${notation}</notations>`:'';
            if(attack&&note.dynamic&&chordIndex===0) content.push(`<direction placement="below"><direction-type><dynamics><${note.dynamic}/></dynamics></direction-type><voice>${voiceId}</voice><staff>${staffIndex+1}</staff></direction>`);
            // Native MusicXML marks remain usable in other editors. Optional play
            // metadata preserves note-local settings and explicit ties on reimport.
            const expression=expressive&&attack?{...Object.fromEntries(['id','dynamic','accent','articulation','ornament','ornamentInterval','arpeggio','tieTo','velocity'].filter(k=>note[k]!==undefined).map(k=>[k,note[k]])),voice:note.voice??''}:null;
            const play=expression?`<play><other-play type="qinban-expression">${escapeXML(JSON.stringify(expression))}</other-play></play>`:'';
            content.push(`<note id="note-${escapeXML(note.id)}-m${index+1}"${expressive?` dynamics="${((note.velocity??.7)*127/90*100).toFixed(4)}"`:''}>${chordIndex ? '<chord/>' : ''}${pitchXML(note.midi, fifths < 0)}`
              + `<duration>${stop - start}</duration>${ties}<voice>${voiceId}</voice>`
              + `${rhythmXML(stop - start)}<staff>${staffIndex + 1}</staff>${notations}${play}</note>`);
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
    + `${source ? `<source>${escapeXML(source)}</source>` : ''}</identification>`
    + `<credit><credit-words>${escapeXML(source)}</credit-words></credit>`
    + '<part-list><score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno.</part-abbreviation>'
    + '<score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument>'
    + '<midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>'
    + `</score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>`;
}

/** Export two piano tracks. @tonejs/midi converts quarter-note beats to MIDI ticks. */
export function exportMidi(score) {
  const midi = new Midi();
  const tempo = limit(score.tempo || 88, 20, 300);
  midi.name = score.title || '钢琴练习';
  midi.header.name = midi.name;
  midi.header.setTempo(tempo);
  const meters = score.measureMap || [{beat:0,timeSignature:score.timeSignature || [4,4]}];
  for (let i=0;i<meters.length;i++) if (i===0 || meters[i].timeSignature.join('/')!==meters[i-1].timeSignature.join('/')) midi.header.timeSignatures.push({ticks:Math.round(meters[i].beat*midi.header.ppq),timeSignature:meters[i].timeSignature});
  const notes = normalizedNotes({...score,notes:performanceNotes(score)});
  for (const hand of ['right', 'left']) {
    const track = midi.addTrack();
    track.name = hand === 'right' ? '右手 · Right hand' : '左手 · Left hand';
    track.instrument.number = 0;
    track.channel = hand === 'right' ? 0 : 1;
    for (const note of notes.filter((entry) => entry.hand === hand)) {
      track.addNote({ midi: note.midi, ticks: Math.round(note.beat * midi.header.ppq),
        durationTicks: Math.max(1, Math.round(note.duration * midi.header.ppq)),
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
  const endTick = Math.max(Math.round((Number(score.durationBeats) || 0) * midi.header.ppq),
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
