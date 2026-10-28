// Deterministic comparison only. Reference notes must be independently frozen.
export function compareBenchmarkSubset(
  reference,
  raw,
  { epsilon = 1e-4 } = {},
) {
  const offsets = [];
  let beat = 0;
  for (const d of raw?.bars || []) {
    offsets.push(beat);
    beat += d;
  }
  const wanted = new Set(reference.notes.map((n) => n.measure)),
    actual = [];
  for (const tuple of raw?.notes || []) {
    if (
      !Array.isArray(tuple) ||
      tuple.length < 4 ||
      tuple.some((n) => !Number.isFinite(n))
    )
      continue;
    const measure =
      offsets.findIndex(
        (o, i) =>
          tuple[1] >= o - epsilon && tuple[1] < o + raw.bars[i] - epsilon,
      ) + 1;
    if (!wanted.has(measure)) continue;
    actual.push({
      measure,
      midi: tuple[0],
      beat: tuple[1] - offsets[measure - 1],
      duration: tuple[2],
      hand: tuple[3] > 0 ? "right" : "left",
    });
  }
  const unmatched = new Set(actual.map((_, i) => i)),
    matches = [],
    missing = [];
  for (const n of reference.notes) {
    const candidates = [...unmatched].filter(
      (i) =>
        actual[i].measure === n.measure &&
        actual[i].hand === n.hand &&
        Math.abs(actual[i].beat - n.beat) <= epsilon,
    );
    candidates.sort(
      (a, b) =>
        Math.abs(actual[a].midi - n.midi) - Math.abs(actual[b].midi - n.midi) ||
        Math.abs(actual[a].duration - n.duration) -
          Math.abs(actual[b].duration - n.duration),
    );
    if (!candidates.length) {
      missing.push(n);
      continue;
    }
    const idx = candidates[0];
    unmatched.delete(idx);
    matches.push({
      reference: n,
      actual: actual[idx],
      pitchCorrect: actual[idx].midi === n.midi,
      strict:
        actual[idx].midi === n.midi &&
        Math.abs(actual[idx].duration - n.duration) <= epsilon,
    });
  }
  const extras = [...unmatched].map((i) => actual[i]),
    bars = [...wanted].map((measure) => ({
      measure,
      exact:
        !missing.some((n) => n.measure === measure) &&
        !extras.some((n) => n.measure === measure) &&
        matches
          .filter((m) => m.reference.measure === measure)
          .every((m) => m.strict),
    }));
  return {
    referenceNotes: reference.notes.length,
    predictedNotes: actual.length,
    matchedEvents: matches.length,
    pitchCorrect: matches.filter((m) => m.pitchCorrect).length,
    strictCorrect: matches.filter((m) => m.strict).length,
    missing: missing.length,
    extras: extras.length,
    bars,
    errors: [
      ...missing.map((reference) => ({ kind: "missing", reference })),
      ...extras.map((actual) => ({ kind: "extra", actual })),
      ...matches
        .filter((m) => !m.strict)
        .map((m) => ({ kind: m.pitchCorrect ? "rhythm" : "pitch", ...m })),
    ],
  };
}
