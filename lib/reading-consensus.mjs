import { validateRegionResult } from "./full-score-jobs.mjs";
import { compareRegionReadings } from "./recognition-comparison.mjs";
import { SCORE_RECOGNITION } from "./recognition-policy.mjs";

// Agreement is evidence, never a declaration of human verification or accuracy.
export function chooseReadingAgreement(
  candidates,
  region,
  metadata,
  policy = SCORE_RECOGNITION,
  { allowDigital = false } = {},
) {
  const seen = new Set(),
    valid = [];
  for (const c of candidates) {
    const r = c.result,
      identity =
        c.startedAt + "|" + c.endedAt + "|" + Boolean(r?.positionlessReview);
    if (
      !c.startedAt ||
      !c.endedAt ||
      seen.has(identity) ||
      r?.model !== policy.model ||
      r.reasoningEffort !== policy.reasoningEffort ||
      r.promptVersion !== policy.promptVersion ||
      !r.requestAudit?.length ||
      r.requestAudit.some(
        (a) =>
          a.model !== policy.model ||
          a.reasoningEffort !== policy.reasoningEffort,
      )
    )
      continue;
    seen.add(identity);
    try {
      const normalized = validateRegionResult(r, region, metadata, {
        requirePositions: !r.positionlessReview,
      });
      if (normalized.checks.passed) valid.push({ ...c, normalized });
    } catch {}
  }
  const same = (a, b) =>
    compareRegionReadings(a.normalized, b.normalized).exactMatch &&
    (!(region.page === 1 && region.system === 1) ||
      a.normalized.score.tempo === b.normalized.score.tempo);
  const groups = [];
  for (const c of valid) {
    const g = groups.find((g) => same(g[0], c));
    if (g) g.push(c);
    else groups.push([c]);
  }
  groups.sort((a, b) => b.length - a.length);
  const counts = groups.map((g) => g.length);
  if (
    !groups.length ||
    groups[0].length < 2 ||
    (groups[1] && groups[1].length === groups[0].length)
  )
    return { resolved: false, validReadings: valid.length, counts };
  const group = groups[0],
    order = (a, b) => b.startedAt.localeCompare(a.startedAt);
  const primary =
    group.filter((c) => !c.result.positionlessReview).sort(order)[0] ||
    (allowDigital ? [...group].sort(order)[0] : null);
  if (!primary) return { resolved: false, validReadings: valid.length, counts };
  const independent = group.find((c) => c !== primary);
  return {
    resolved: true,
    validReadings: valid.length,
    counts,
    primary,
    independent,
    sourcePositionsAvailable: !primary.result.positionlessReview,
    comparison: compareRegionReadings(
      primary.normalized,
      independent.normalized,
    ),
  };
}
