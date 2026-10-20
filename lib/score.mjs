import { validatePracticeScore } from "./score-validation.mjs";
import { toPracticeScore } from "./score-document.ts";
export { KEY_NAMES } from "./score-validation.mjs";
export function validateScore(raw) {
  return raw?.version === 2 ? toPracticeScore(raw) : validatePracticeScore(raw);
}

export function transposeScore(score, semitones) {
  if (!Number.isInteger(semitones) || Math.abs(semitones) > 24)
    throw new Error("移调范围为上下 24 个半音。");
  score = validateScore(score);
  const fifths = (key) =>
    semitones === 0 ? key : ((((key + semitones * 7 + 6) % 12) + 12) % 12) - 6;
  return validateScore({
    ...score,
    keySignature: fifths(score.keySignature),
    ...(score.measureMap
      ? {
          measureMap: score.measureMap.map((bar) => ({
            ...bar,
            ...(bar.keySignature !== undefined
              ? { keySignature: fifths(bar.keySignature) }
              : {}),
          })),
        }
      : {}),
    notes: score.notes.map((n) => ({
      ...n,
      midi: n.midi + semitones,
      ...(semitones ? { pitch: undefined, accidental: undefined } : {}),
      ...(n.grace
        ? {
            grace: {
              ...n.grace,
              notes: n.grace.notes.map((g) => ({
                ...g,
                midi: g.midi + semitones,
                ...(semitones ? { pitch: undefined } : {}),
              })),
            },
          }
        : {}),
    })),
  });
}

export function midiName(midi, flats = false) {
  return `${(flats ? ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"] : ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"])[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export const beatsPerMeasure = (score) =>
  (score.timeSignature[0] * 4) / score.timeSignature[1];

/** Sparse per-bar keys inherit until the next explicit key change. */
export function scoreKeySignature(score, index) {
  for (
    let i = Math.min(index, (score.measureMap?.length || 0) - 1);
    i >= 0;
    i--
  ) {
    const key = score.measureMap[i].keySignature;
    if (key !== undefined) return key;
  }
  return score.keySignature;
}

export function scoreMeasureBounds(score, index) {
  const b = score.measureMap?.[index];
  const length = beatsPerMeasure(score);
  return b
    ? {
        start: b.beat,
        end: b.beat + b.duration,
        length: b.duration,
        timeSignature: b.timeSignature || score.timeSignature,
      }
    : {
        start: index * length,
        end: (index + 1) * length,
        length,
        timeSignature: score.timeSignature,
      };
}
export function scoreMeasureIndex(score, beat) {
  if (!score.measureMap?.length)
    return Math.min(
      Math.max(0, Math.floor(beat / beatsPerMeasure(score))),
      Math.max(0, Math.ceil(score.durationBeats / beatsPerMeasure(score)) - 1),
    );
  let lo = 0,
    hi = score.measureMap.length - 1;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (score.measureMap[m].beat <= beat + 1e-7) lo = m;
    else hi = m - 1;
  }
  return lo;
}
