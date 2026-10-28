import { validateScore, midiName } from "./score.mjs";
import { detachInvalidTies } from "./note-effects.mjs";

const mod = (n) => ((n % 12) + 12) % 12;
export const MODE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};
export const CHORD_QUALITIES = [
  { id: "major", label: "大三和弦", intervals: [0, 4, 7] },
  { id: "minor", label: "小三和弦", intervals: [0, 3, 7] },
  { id: "dominant7", label: "属七和弦", intervals: [0, 4, 7, 10] },
  { id: "major7", label: "大七和弦", intervals: [0, 4, 7, 11] },
  { id: "minor7", label: "小七和弦", intervals: [0, 3, 7, 10] },
  { id: "diminished", label: "减三和弦", intervals: [0, 3, 6] },
  { id: "sus4", label: "挂四和弦", intervals: [0, 5, 7] },
];

export function tonicPitchClass(keySignature = 0, mode = "major") {
  return mod(keySignature * 7 - (mode === "minor" ? 3 : 0));
}
export function tonalityLabel(score, assumedMode = "major") {
  const mode = score.mode || assumedMode;
  return `${midiName(60 + tonicPitchClass(score.keySignature, mode), score.keySignature < 0).replace(/4$/, "")}${mode === "minor" ? "小调" : "大调"}`;
}

/** Parallel natural major/minor. Chromatic notes remain absolute pitches and are counted for review. */
export function convertScoreMode(raw, targetMode, sourceMode = raw.mode) {
  if (!MODE_INTERVALS[sourceMode] || !MODE_INTERVALS[targetMode])
    throw new Error("请先明确原调式和目标调式。");
  const score = validateScore(raw),
    tonic = tonicPitchClass(score.keySignature, sourceMode);
  const from = MODE_INTERVALS[sourceMode],
    to = MODE_INTERVALS[targetMode];
  let changedNotes = 0,
    chromaticNotes = 0;
  const notes = score.notes.map((n) => {
    const degree = from.indexOf(mod(n.midi - tonic));
    if (degree < 0) {
      chromaticNotes++;
      return n;
    }
    const midi = n.midi + to[degree] - from[degree];
    if (midi !== n.midi) changedNotes++;
    return {
      ...n,
      midi,
      ...(midi !== n.midi ? { pitch: undefined, accidental: undefined } : {}),
    };
  });
  const majorTonic = mod(tonic + (targetMode === "minor" ? 3 : 0));
  const choices = Array.from({ length: 15 }, (_, i) => i - 7).filter(
    (f) => mod(f * 7) === majorTonic,
  );
  const keySignature = choices.sort(
    (a, b) =>
      Math.abs(a) - Math.abs(b) ||
      Math.abs(a - score.keySignature) - Math.abs(b - score.keySignature),
  )[0];
  return {
    score: validateScore({ ...score, mode: targetMode, keySignature, notes }),
    changedNotes,
    chromaticNotes,
  };
}

export function onsetGroup(score, noteId) {
  const n = score.notes.find((n) => n.id === noteId);
  if (!n) throw new Error("请先选择音符。");
  return score.notes
    .filter(
      (other) => other.hand === n.hand && Math.abs(other.beat - n.beat) < 1e-7,
    )
    .sort((a, b) => a.midi - b.midi);
}

/** Replace this hand's simultaneous attack only. Timing and the opposite hand remain untouched. */
export function replaceOnsetChord(raw, noteId, { rootMidi, quality }) {
  const score = validateScore(raw),
    group = onsetGroup(score, noteId),
    selected = group.find((n) => n.id === noteId);
  const chord = CHORD_QUALITIES.find((c) => c.id === quality);
  if (!chord || !Number.isInteger(rootMidi))
    throw new Error("请选择和弦类型与根音。");
  const removed = new Set(group.map((n) => n.id));
  const notes = chord.intervals.map((interval, index) => ({
    ...(group[index] || selected),
    id: `chord-${globalThis.crypto.randomUUID()}`,
    beat: selected.beat,
    hand: selected.hand,
    midi: rootMidi + interval,
    pitch: undefined,
    accidental: undefined,
  }));
  return {
    score: validateScore({
      ...score,
      notes: detachInvalidTies([
        ...score.notes.filter((n) => !removed.has(n.id)),
        ...notes,
      ]),
    }),
    ids: notes.map((n) => n.id),
  };
}
