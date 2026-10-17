// The package root has different CJS/ESM entry points in Node and Vite.
// Its explicit UMD entry interoperates consistently in both environments.
import MidiPackage from '@tonejs/midi/build/Midi.js';
import MidiFilePackage from 'midi-file';
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

function assignVoices(notes) {
  const grouped = new Map();
  for (const note of notes) {
    const key = `${note.start}:${note.ticks}`;
    if (grouped.has(key)) grouped.get(key).notes.push(note);
    else grouped.set(key, { start: note.start, ticks: note.ticks, notes: [note] });
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

/** Export a two-staff, editable piano MusicXML score with real rests and ties. */
export function exportMusicXML(score) {
  const notes = normalizedNotes(score);
  const numerator = Math.round(limit(score.timeSignature?.[0] || 4, 1, 32));
  const denominatorValue = Number(score.timeSignature?.[1]) || 4;
  const denominator = [1, 2, 4, 8, 16, 32].includes(denominatorValue) ? denominatorValue : 4;
  const measureTicks = Math.round(numerator * 4 / denominator * DIVISIONS);
  const durationTicks = Math.max(tick(Number(score.durationBeats) || 0), ...notes.map((note) => note.start + note.ticks), 1);
  const measureCount = Math.max(1, Math.ceil(durationTicks / measureTicks));
  const fifths = Math.round(limit(score.keySignature || 0, -7, 7));
  const tempo = limit(score.tempo || 88, 20, 240);
  const hands = [assignVoices(notes.filter((note) => note.hand === 'right')),
    assignVoices(notes.filter((note) => note.hand === 'left'))];
  const source = [score.source?.label, score.source?.license, score.source?.url].filter(Boolean).join(' · ');
  const measures = [];
  for (let index = 0; index < measureCount; index++) {
    const begin = index * measureTicks;
    const end = Math.min((index + 1) * measureTicks, durationTicks);
    const length = end - begin;
    const content = [];
    if (index === 0) {
      content.push(`<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${fifths}</fifths></key>`
        + `<time><beats>${numerator}</beats><beat-type>${denominator}</beat-type></time><staves>2</staves>`
        + '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>');
      content.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>`
        + `<per-minute>${tempo}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${tempo}"/></direction>`);
    }
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
          const tieStop = group.start < begin;
          const tieStart = group.start + group.ticks > end;
          group.notes.forEach((note, chordIndex) => {
            const ties = `${tieStop ? '<tie type="stop"/>' : ''}${tieStart ? '<tie type="start"/>' : ''}`;
            const notations = tieStop || tieStart ? `<notations>${tieStop ? '<tied type="stop"/>' : ''}`
              + `${tieStart ? '<tied type="start"/>' : ''}</notations>` : '';
            content.push(`<note>${chordIndex ? '<chord/>' : ''}${pitchXML(note.midi, fifths < 0)}`
              + `<duration>${stop - start}</duration>${ties}<voice>${voiceId}</voice>`
              + `${rhythmXML(stop - start)}<staff>${staffIndex + 1}</staff>${notations}</note>`);
          });
          cursor = stop;
        }
        if (cursor < end) content.push(rest(end - cursor));
      }
    }
    if (index === measureCount - 1) content.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    measures.push(`<measure number="${index + 1}"${length < measureTicks ? ' implicit="yes"' : ''}>${content.join('')}</measure>`);
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
  const tempo = limit(score.tempo || 88, 20, 240);
  midi.name = score.title || '钢琴练习';
  midi.header.name = midi.name;
  midi.header.setTempo(tempo);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: score.timeSignature || [4, 4] });
  const notes = normalizedNotes(score);
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
