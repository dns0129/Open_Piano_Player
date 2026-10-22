import { beatsPerMeasure, KEY_NAMES, scoreMeasureBounds, scoreMeasureIndex, scoreKeySignature } from './score.mjs';

import { spellMidi } from './pitch-spelling.mjs';
export { spellMidi } from './pitch-spelling.mjs';
const letters=['C','D','E','F','G','A','B'], natural=[0,2,4,5,7,9,11];

export function numberedPitch(midi, keySignature = 0, written) {
  const spelling = written?{letter:written.step,accidental:written.alter,octave:written.octave}:spellMidi(midi,keySignature);
  const tonic = KEY_NAMES[keySignature + 7];
  const tonicLetter = letters.indexOf(tonic[0]);
  const tonicPitch = 60 + natural[tonicLetter] + (tonic.includes('#') ? 1 : tonic.includes('b') ? -1 : 0);
  const degree = (letters.indexOf(spelling.letter) - tonicLetter + 7) % 7;
  const expected = tonicPitch + natural[degree];
  const accidental = ((midi - expected + 6) % 12 + 12) % 12 - 6;
  return { degree: degree + 1, octave: (midi - expected - accidental) / 12, accidental };
}

/** Quantization is for engraving only. The audio transport always uses the original events. */
export function measureSegments(score, measureIndex, hand) {
  const {start,end}=scoreMeasureBounds(score,measureIndex);
  const notes = score.notes.filter(n => (n.staff || (n.hand==='left'?2:1)) === (hand==='left'?2:1)).map(n => ({ ...n, start: Math.round(n.beat * 4) / 4, end: Math.max(Math.round((n.beat + n.duration) * 4) / 4, Math.round(n.beat * 4) / 4 + .25) })).filter(n => n.start < end - .0001 && n.end > start + .0001);
  const boundaries = [...new Set([start, end, ...notes.flatMap(n => [Math.max(start,n.start), Math.min(end,n.end)])])].sort((a,b)=>a-b);
  const segments = [];
  for (let i=0; i < boundaries.length-1; i++) {
    const beat = boundaries[i], stop = boundaries[i+1];
    const active = notes.filter(n => n.start < stop - .0001 && n.end > beat + .0001).sort((a,b)=>a.midi-b.midi);
    const previous = segments.at(-1);
    if (previous && previous.notes.map(n=>n.id).join('|') === active.map(n=>n.id).join('|')) previous.duration += stop - beat;
    else segments.push({ beat, duration: stop-beat, notes: active });
  }
  return segments.flatMap(segment => {
    let remaining = segment.duration, beat = segment.beat;
    const output = [];
    for (const duration of [6,4,3,2,1.5,1,.75,.5,.25]) {
      while (remaining >= duration - .00001) { output.push({ ...segment, beat, duration }); remaining -= duration; beat += duration; }
    }
    return output;
  });
}

export const durationGlyph = duration => ({ 6: ['w',1],4:['w',0],3:['h',1],2:['h',0],1.5:['q',1],1:['q',0],0.75:['8',1],0.5:['8',0],0.25:['16',0] })[duration];

/** Pack adjacent bars into continuous, justified systems. Every x is a system-local SVG coordinate. */
export function planSystems(score, availableWidth, mode = 'staff') {
  const width = Math.max(240, Math.floor(Number(availableWidth) || 800));
  const length = beatsPerMeasure(score), count = score.measureMap?.length || Math.max(1, Math.ceil(score.durationBeats / length));
  const density = Array(count).fill(1);
  const onsets = Array.from({length: count}, () => new Set());
  for (const note of score.notes) {
    const bar = scoreMeasureIndex(score,note.beat);
    if (bar < count) onsets[bar].add(Math.round(note.beat * 1e6) / 1e6);
    const lastBar = Math.min(count - 1, scoreMeasureIndex(score,note.beat + note.duration - .00001));
    for (let i = Math.max(0, bar); i <= lastBar; i++) density[i] = Math.max(density[i], onsets[i].size);
  }
  for (let i = 0; i < count; i++) density[i] = Math.max(density[i], onsets[i].size);
  const cap = width >= 1100 ? 5 : width >= 780 ? 4 : width >= 560 ? 3 : width >= 390 ? 2 : 1;
  const margin = 16, usable = width - margin * 2;
  const systems = [];
  let index = 0;
  while (index < count) {
    const prefix = mode === 'staff' ? 48 + Math.abs(scoreKeySignature(score,index)) * 9 + (index === 0 ? 24 : 0) : 43;
    const bars = [];
    let total = prefix;
    while (index < count && bars.length < cap) {
      const key=scoreKeySignature(score,index),previousKey=index?scoreKeySignature(score,index-1):key;
      const keySpace=bars.length&&key!==previousKey?(mode==='staff'?(Math.abs(previousKey)+Math.abs(key))*10+18:58):0;
      const ideal = Math.max(mode === 'staff' ? 115 : 120, density[index] * (mode === 'staff' ? 25 : 29) + 32)+keySpace;
      if (bars.length && total + ideal > usable) break;
      bars.push({ ...scoreMeasureBounds(score,index), index, weight: ideal, prefix: bars.length ? 0 : prefix });
      total += ideal;
      index++;
    }
    const weights = bars.reduce((sum,b) => sum+b.weight,0);
    const systemWidth = Math.max(width, Math.ceil(prefix + weights + margin * 2));
    const musicWidth = Math.max(40,systemWidth-margin*2-prefix);
    let x = margin;
    for (let i=0;i<bars.length;i++) {
      const bar = bars[i];
      bar.x = x;
      bar.width = i === bars.length-1 ? systemWidth-margin-x : bar.prefix + musicWidth*bar.weight/weights;
      x += bar.width;
      bar.endX = x;
    }
    systems.push({ index: systems.length, width: systemWidth, bars, firstMeasure: bars[0].index, lastMeasure: bars.at(-1).index });
  }
  return systems;
}
