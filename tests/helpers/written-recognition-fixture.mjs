import { spellMidi } from "../../lib/pitch-spelling.mjs";
// Synthetic transport fixtures only. Never use this to enrich real model output
// or an independent benchmark: MIDI cannot recover original spelling.
export function withWrittenFixture(raw) {
  const r = structuredClone(raw);
  if (!Array.isArray(r.notes) || r.notation) return r;
  r.notation = {
    version: 1,
    notes: r.notes.map((n, index) => {
      const p = spellMidi(n[0], r.key || 0);
      return {
        index,
        staff: n[3] > 0 ? 1 : 2,
        step: p.letter,
        octave: p.octave,
        alter: p.accidental,
        printed: p.accidental,
        shift: 0,
      };
    }),
    rests: (r.rests || []).map((n, index) => ({
      index,
      staff: n[2] > 0 ? 1 : 2,
    })),
    clefs: [
      { beat: 0, staff: 1, sign: "G", line: 2, octaveChange: 0 },
      { beat: 0, staff: 2, sign: "F", line: 4, octaveChange: 0 },
    ],
    voices: [
      ...new Set([
        ...(r.notes || []).map((n) => n[3]),
        ...(r.rests || []).map((n) => n[2]),
      ]),
    ].map((voice) => ({
      voice,
      from: 0,
      to: r.bars.reduce((a, b) => a + b, 0),
    })),
  };
  return r;
}
