// Original comparison phrase, shared by the in-app preview and audio exports.
export const INSTRUMENT_PREVIEW = Object.freeze([
  { midi: 67, beat: 0, duration: 0.65, velocity: 0.64 },
  { midi: 72, beat: 0.75, duration: 0.65, velocity: 0.71 },
  { midi: 76, beat: 1.5, duration: 0.9, velocity: 0.8 },
  { midi: 74, beat: 2.5, duration: 0.4, velocity: 0.7 },
  { midi: 72, beat: 3, duration: 0.9, velocity: 0.67 },
  { midi: 67, beat: 4, duration: 2, velocity: 0.6 },
]);

export function instrumentDemoScore(instrument = 'warm') {
  const notes = INSTRUMENT_PREVIEW.map(note => ({ ...note, hand: 'right' }));
  for (const note of INSTRUMENT_PREVIEW) notes.push({ ...note, beat: note.beat + 8, hand: 'right' });
  for (const [beat, pitches] of [[8, [48, 55, 60]], [10, [45, 52, 60]], [12, [41, 53, 57]], [14, [43, 55, 59]], [16, [48, 55, 60, 67, 72]]]) {
    if (instrument === 'violin') continue;
    for (const midi of pitches) notes.push({ midi, beat, duration: beat === 16 ? 8 : 1.8, velocity: 0.49, hand: 'left' });
  }
  if (instrument === 'violin') {
    // Bow changes, repeated notes, a rest and a final held note.
    for (const [index, midi] of [67, 69, 72, 74, 74, 76].entries()) {
      notes.push({ midi, beat: 5.5 + index * 0.25, duration: 0.25, velocity: 0.58 + index * 0.03, hand: 'right' });
    }
    notes.push({ midi: 72, beat: 16, duration: 8, velocity: 0.65, hand: 'right' });
  }
  return { version: 1, id: 'instrument-demo', title: '暖光 · 音色试听', composer: '琴伴原创试听', tempo: 78,
    timeSignature: [4, 4], durationBeats: 24, notes: notes.map((note, index) => ({ ...note, id: `demo-${index}` })) };
}
