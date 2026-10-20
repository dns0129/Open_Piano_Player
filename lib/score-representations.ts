import { readScoreDocument, toPracticeScore } from "./score-document.ts";
import { performanceNotes } from "./note-effects.mjs";
import { createScoreTimeline } from "./score-timing.mjs";

export function createPerformanceTimeline(input: unknown) {
  const document = readScoreDocument(input),
    score = toPracticeScore(document);
  const timing = createScoreTimeline(score);
  const notes = performanceNotes(score).map((note) => ({
    ...note,
    startSeconds: timing.secondsAt(note.beat, "after"),
    endSeconds: timing.secondsAt(note.beat + note.duration, "before"),
  }));
  return {
    document,
    score,
    notes,
    timing,
    durationSeconds: timing.durationSeconds,
  };
}

export function createDisplayRepresentation(
  input: unknown,
  options: { sourceNotation?: unknown } = {},
) {
  const document = readScoreDocument(input, options),
    score = toPracticeScore(document);
  return {
    document,
    score,
    notes: document.notes,
    rests: document.rests,
    measures: document.measureMap!,
    sourceNotation: document.sourceNotation || null,
  };
}
