import {scoreMeasureBounds} from './score.mjs';
import {measureSegments} from './notation-layout.mjs';
import {RHYTHM_EPSILON,closeRhythm as closeTo} from './notation-rhythm.mjs';
/** Preserve ordinary scores' layout, while never rounding a triplet to 16ths. */
export function notationMeasureSegments(score, measureIndex, hand) {
  const {length,start,end}=scoreMeasureBounds(score,measureIndex);
  const inRests=(score.rests||[]).filter(r=>r.provenance!=='inferred'&&r.staff===(hand==='left'?2:1)&&r.beat<end-RHYTHM_EPSILON&&r.beat+r.duration>start+RHYTHM_EPSILON);
  const inMeasure = score.notes.filter(note => (note.staff || (note.hand==='left'?2:1)) === (hand==='left'?2:1) && note.beat < end - RHYTHM_EPSILON && note.beat + note.duration > start + RHYTHM_EPSILON);
  if (!inRests.length && !inMeasure.some(n=>n.rhythm) && inMeasure.every(note => closeTo(note.beat * 4, Math.round(note.beat * 4)) && closeTo((note.beat + note.duration) * 4, Math.round((note.beat + note.duration) * 4)))) return measureSegments(score, measureIndex, hand);
  const snap = value => {
    for (const grid of [4,12,8,16,24,32,48,64,96,128,192,256,384,768,1536]) if (closeTo(value, Math.round(value * grid) / grid)) return Math.round(value * grid) / grid;
    return value;
  };
  const midi = /midi/i.test(score.source?.kind||'');
  const notes = inMeasure.map(note => {
    let stop=snap(note.beat+note.duration);
    // LilyPond MIDI releases one tick early. Close only a sub-1/128-beat
    // release gap to a neighbouring attack or barline; never alter the data.
    if(midi&&!note.rhythm){
      const next=Math.min(end,...inMeasure.filter(n=>n.beat>note.beat+RHYTHM_EPSILON).map(n=>snap(n.beat)));
      if(next>=stop&&next-stop<=1/128)stop=next;
    }
    return {...note,start:Math.max(start,snap(note.beat)),end:Math.min(end,stop)};
  });
  const boundaries = [...new Set([start, end, ...notes.flatMap(note => [note.start, note.end]),...inRests.flatMap(r=>[Math.max(start,snap(r.beat)),Math.min(end,snap(r.beat+r.duration))])])].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const beat = boundaries[index], stop = boundaries[index + 1];
    if (stop - beat < RHYTHM_EPSILON) continue;
    const active = notes.filter(note => note.start < stop - RHYTHM_EPSILON && note.end > beat + RHYTHM_EPSILON).sort((a, b) => a.midi - b.midi);
    const previous = segments.at(-1);
    if (previous && !inRests.some(r=>closeTo(r.beat,beat)||closeTo(r.beat+r.duration,beat)) && previous.notes.map(note => note.id).join('|') === active.map(note => note.id).join('|')) previous.duration += stop - beat;
    else {
      const explicit=active.find(n=>n.rhythm&&closeTo(n.beat,beat)&&closeTo(n.duration,stop-beat))
        || (score.rests||[]).find(r=>r.rhythm&&r.staff===(hand==='left'?2:1)&&closeTo(r.beat,beat)&&closeTo(r.duration,stop-beat));
      segments.push({beat,duration:stop-beat,notes:active,...(explicit?{rhythm:explicit.rhythm}:{})});
    }
  }
  return segments;
}
