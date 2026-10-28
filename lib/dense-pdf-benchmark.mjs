/** Independent, written-head benchmark. Never feeds a reference back to OMR. */
export const BENCHMARK_TOLERANCE = 1e-4;
const close = (a, b) =>
  Number.isFinite(a) &&
  Number.isFinite(b) &&
  Math.abs(a - b) <= BENCHMARK_TOLERANCE;
const pitch = (a, b) => a.hand === b.hand && a.midi === b.midi;
const onset = (a, b) => pitch(a, b) && close(a.beat, b.beat);
const strict = (a, b) => onset(a, b) && close(a.duration, b.duration);

// Maximum one-to-one matching prevents duplicate heads and chord ordering from
// inflating accuracy, including near tolerance boundaries. Keeps every extra.
export function matchBenchmarkHeads(reference, actual, equal = strict) {
  const assigned = new Map();
  function augment(i, seen) {
    for (let j = 0; j < actual.length; j++) {
      if (seen.has(j) || !equal(reference[i], actual[j])) continue;
      seen.add(j);
      if (!assigned.has(j) || augment(assigned.get(j), seen)) {
        assigned.set(j, i);
        return true;
      }
    }
    return false;
  }
  for (let i = 0; i < reference.length; i++) augment(i, new Set());
  const matched = new Set(assigned.values()),
    correct = assigned.size;
  return {
    reference: reference.length,
    predicted: actual.length,
    correct,
    recall: reference.length ? correct / reference.length : null,
    precision: actual.length ? correct / actual.length : null,
    f1:
      reference.length + actual.length
        ? (2 * correct) / (reference.length + actual.length)
        : null,
    missing: reference.filter((_, i) => !matched.has(i)),
    extra: actual.filter((_, i) => !assigned.has(i)),
  };
}

export function normalizedBenchmarkResult(result) {
  const notes = [],
    graces = [];
  for (const n of result?.score?.notes || []) {
    notes.push({ ...n, grace: undefined });
    for (const [i, g] of (n.grace?.notes || []).entries())
      graces.push({
        id: n.id + "-grace-" + i,
        hand: n.hand,
        midi: g.midi,
        beat: n.beat,
        duration: 0,
      });
  }
  return { notes, graces, bars: result?.coverage?.measureDurations || [] };
}

export function scoreDensePdfRow(reference, result) {
  const actual = normalizedBenchmarkResult(result),
    normal = reference.notes.filter((n) => !n.grace),
    graces = reference.notes.filter((n) => n.grace);
  const countsMatch = reference.measures.length === actual.bars.length;
  return {
    strict: matchBenchmarkHeads(normal, actual.notes),
    pitchAndHand: matchBenchmarkHeads(normal, actual.notes, pitch),
    pitchHandOnset: matchBenchmarkHeads(normal, actual.notes, onset),
    grace: matchBenchmarkHeads(graces, actual.graces, onset),
    expectedBars: reference.measures.map((m) => m.duration),
    predictedBars: actual.bars,
    barDurationsExact:
      countsMatch &&
      reference.measures.every((m, i) => close(m.duration, actual.bars[i])),
    returned: !!result,
    checksPassed: result?.checks?.passed ?? null,
  };
}
