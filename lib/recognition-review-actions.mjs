import { fullScoreReviewSummary } from "./full-score-review.mjs";

// A single explicit user action acknowledges review flags across the chosen
// scope. Validate copies first so a failed preflight never partly approves it.
export function prepareBulkReview(draft) {
  const included = new Set(
    draft.pages
      .filter((page) => page.decision === "include")
      .map((page) => page.page),
  );
  const regions = draft.regions.map((region) =>
    region.selected && included.has(region.page)
      ? {
          ...region,
          reviewed: true,
          coverageComplete: true,
          ...(region.sourceHeadAudit
            ? { sourceHeadAudit: { ...region.sourceHeadAudit, reviewed: true } }
            : {}),
          ...(region.tieAudit
            ? { tieAudit: { ...region.tieAudit, reviewed: true } }
            : {}),
        }
      : region,
  );
  return { regions, summary: fullScoreReviewSummary({ ...draft, regions }) };
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function sourcePoint(rect, bounds, clientX, clientY) {
  if (!(bounds.width > 0 && bounds.height > 0)) return null;
  return {
    x:
      rect.x + clamp((clientX - bounds.left) / bounds.width, 0, 1) * rect.width,
    y:
      rect.y +
      clamp((clientY - bounds.top) / bounds.height, 0, 1) * rect.height,
  };
}

export function rollRange(region) {
  const pitches = region.notes.map((note) => note.midi).filter(Number.isFinite);
  return {
    min: Math.max(21, Math.min(48, ...pitches) - 2),
    max: Math.min(108, Math.max(72, ...pitches) + 2),
  };
}

export function rollMove(note, region, range, bounds, dx, dy, snap = 0.25) {
  if (!(bounds.width > 0 && bounds.height > 0)) return null;
  const desiredBeat = note.beat + (dx / bounds.width) * region.durationBeats;
  // Preserve tuplets/off-grid timings on a purely vertical move.
  const beat =
    Math.abs(dx) < 3
      ? note.beat
      : clamp(
          Math.round(desiredBeat / snap) * snap,
          0,
          Math.max(0, region.durationBeats - note.duration),
        );
  return {
    beat,
    midi: clamp(
      note.midi -
        Math.round((dy / bounds.height) * (range.max - range.min + 1)),
      21,
      108,
    ),
  };
}
