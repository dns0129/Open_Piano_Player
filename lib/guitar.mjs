// Standard tuning, string 1 (highest) to string 6. MIDI is sounding pitch.
export const GUITAR_TUNING = Object.freeze([64, 59, 55, 50, 45, 40]);
export const GUITAR_MAX_FRET = 20;
export function guitarPositions(midi) {
  return GUITAR_TUNING.flatMap((open, index) => {
    const fret = midi - open;
    return Number.isInteger(fret) && fret >= 0 && fret <= GUITAR_MAX_FRET ? [{ string: index + 1, fret }] : [];
  });
}

/** Suggested fingering only. Never change pitch or silently omit unplayable notes.
 * Reserve strings until the written note ends, including across barlines.
 * Chords are matched as a group so an early high note cannot steal a bass string.
 */
export function guitarTabNotes(score) {
  const notes = [...score.notes].sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const result = [], active = new Map();
  let position = 0;
  for (let i = 0; i < notes.length;) {
    const group = [], beat = notes[i].beat;
    while (i < notes.length && Math.abs(notes[i].beat - beat) < 1e-7) group.push(notes[i++]);
    for (const [string, end] of active) if (end <= beat + 1e-7) active.delete(string);
    let best = group.map(() => null), bestCost = group.length * 1000 + 1, visits = 0;
    // At most six strings: bounded search, even for imported piano-like chords.
    const search = (index, used, assigned, cost, frets) => {
      if (++visits > 4000 || cost >= bestCost) return;
      if (index === group.length) {
        best = [...assigned]; bestCost = cost; return;
      }
      const note = group[index];
      const candidates = guitarPositions(note.midi).filter(p => !used.has(p.string))
        .sort((a, b) => a.fret - b.fret);
      for (const p of candidates) {
        const nextFrets = p.fret ? [...frets, p.fret] : frets;
        // A first-version fingering should not imply an impossible wide stretch.
        if (nextFrets.length && Math.max(...nextFrets) - Math.min(...nextFrets) > 4) continue;
        used.add(p.string); assigned.push(p);
        search(index + 1, used, assigned, cost + (p.fret === 0 ? .1 : p.fret * .4 + Math.abs(p.fret - position)), nextFrets);
        used.delete(p.string); assigned.pop();
      }
      assigned.push(null);
      search(index + 1, used, assigned, cost + 1000, frets);
      assigned.pop();
    };
    // Chords > 12 notes cannot be played on six strings. Bound pathological input.
    const limited = group.length > 12;
    if (!limited) search(0, new Set(active.keys()), [], 0, []);
    for (const [index, note] of group.entries()) {
      const fingering = limited ? null : best?.[index];
      result.push({ ...note, fingering: fingering || null });
      if (fingering) active.set(fingering.string, note.beat + note.duration);
    }
    const fretted = (best || []).filter(p => p?.fret).map(p => p.fret);
    if (fretted.length) position = Math.min(...fretted);
  }
  return result;
}

// Original eight-bar C–Am–F–G arpeggio, safely within open-position guitar range.
const chords = [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]];
export const guitarStarterScore = {
  version: 1, instrument: 'guitar', id: 'guitar-first-light-v1', title: '初光 · 吉他分解和弦',
  composer: '琴伴原创练习', tempo: 84, timeSignature: [4, 4], keySignature: 0, durationBeats: 32,
  source: { kind: 'original', label: '吉他入门示例 · 标准调弦 E A D G B E' },
  notes: Array.from({ length: 64 }, (_, i) => ({
    id: `guitar-first-${i}`, midi: chords[Math.floor(i / 16)][[0, 1, 2, 3, 2, 1, 2, 3][i % 8]],
    beat: i * .5, duration: .45, hand: 'right', velocity: i % 8 === 0 ? .76 : .63,
  })),
};
