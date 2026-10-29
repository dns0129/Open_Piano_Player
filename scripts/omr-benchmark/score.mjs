const EPS = 1e-4,
  q = (v) => Math.round(v / EPS),
  num = (v) =>
    typeof v === "number"
      ? v
      : typeof v === "string" && /^-?\d+(?:\.\d+)?\/-?\d+(?:\.\d+)?$/.test(v)
        ? v
            .split("/")
            .map(Number)
            .reduce((a, b) => a / b)
        : Number(v);
export function normalizeAI(raw) {
  if (!raw || !Array.isArray(raw.measureDurations) || !Array.isArray(raw.notes))
    throw Error("Missing transcription arrays");
  const durations = raw.measureDurations.map(num);
  if (durations.some((v) => !Number.isFinite(v) || v <= 0 || v > 64))
    throw Error("Invalid measure lengths");
  let offset = 0;
  const measures = durations.map((duration, i) => {
    const m = { measure: i + 1, beat: offset, duration };
    offset += duration;
    return m;
  });
  const issues = [];
  const notes = raw.notes.map((r, i) => {
    if (!Array.isArray(r) || r.length !== 7) throw Error("Invalid note tuple");
    const [measure, beat, duration, midi, hand, tie, grace] = r.map((v, j) =>
      j === 4 ? v : num(v),
    );
    if (
      !Number.isInteger(measure) ||
      measure < 1 ||
      measure > measures.length ||
      !Number.isFinite(beat) ||
      beat < 0 ||
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > 64 ||
      !Number.isInteger(midi) ||
      midi < 21 ||
      midi > 108 ||
      !["R", "L"].includes(hand) ||
      ![0, 1, 2, 3].includes(tie) ||
      ![0, 1].includes(grace) ||
      (!grace && duration === 0)
    )
      throw Error("Invalid note values");
    if (beat + duration > durations[measure - 1] + EPS)
      issues.push({ measure, issue: "OVERFULL_NOTE", index: i });
    return {
      id: "ai-" + i,
      measure,
      localBeat: beat,
      beat: measures[measure - 1].beat + beat,
      duration,
      midi,
      hand: hand === "R" ? "right" : "left",
      voice: "unknown",
      grace: !!grace,
      tieStart: tie === 1 || tie === 3,
      tieStop: tie === 2 || tie === 3,
    };
  });
  return { notes, measures, durationBeats: offset, issues };
}
const at = (n) => [n.measure, q(n.localBeat), n.hand, n.midi].join(":");
export function performed(score) {
  const raw = score?.notes || [],
    normal = raw.filter((n) => !n.grace).map((n) => ({ ...n })),
    active = new Map(normal.map((n) => [n.id, n])),
    roots = new Map(normal.map((n) => [n.id, n.id])),
    pending = [],
    tieEdges = [],
    tieProblems = [];
  for (const n of [...normal].sort(
    (a, b) => a.beat - b.beat || a.midi - b.midi || a.id.localeCompare(b.id),
  )) {
    if (n.tieStop) {
      let candidates = pending.filter(
        (p) =>
          p.midi === n.midi &&
          p.hand === n.hand &&
          Math.abs(p.beat + p.duration - n.beat) <= EPS,
      );
      const same = candidates.filter((p) => p.voice === n.voice);
      if (same.length) candidates = same;
      if (candidates.length === 1) {
        const p = candidates[0];
        pending.splice(pending.indexOf(p), 1);
        const parent = roots.get(p.id),
          from = active.get(parent);
        from.duration += n.duration;
        active.delete(n.id);
        roots.set(n.id, parent);
        tieEdges.push(at(p) + ">" + at(n));
      } else tieProblems.push({ id: n.id, issue: "UNRESOLVED_TIE_STOP" });
    }
    if (n.tieStart) pending.push(n);
  }
  for (const n of pending)
    tieProblems.push({ id: n.id, issue: "UNRESOLVED_TIE_START" });
  return {
    notes: [...active.values()],
    graces: raw.filter((n) => n.grace),
    tieEdges,
    tieProblems,
  };
}
export function matchSets(expected, actual, key) {
  const counts = new Map();
  for (const n of actual) {
    const k = key(n);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let tp = 0;
  const missing = [];
  for (const n of expected) {
    const k = key(n),
      v = counts.get(k) || 0;
    if (v) {
      tp++;
      counts.set(k, v - 1);
    } else missing.push(n);
  }
  const fp = actual.length - tp,
    fn = expected.length - tp;
  return {
    expected: expected.length,
    actual: actual.length,
    tp,
    fp,
    fn,
    precision: actual.length ? tp / actual.length : 0,
    recall: expected.length ? tp / expected.length : 0,
    f1:
      expected.length + actual.length
        ? (2 * tp) / (expected.length + actual.length)
        : null,
    missing,
    extraKeys: [...counts]
      .filter(([, v]) => v > 0)
      .map(([key, count]) => ({ key, count })),
  };
}
export function evaluate(reference, actual, { complete = true } = {}) {
  const ref = performed(reference),
    pred = performed(actual || { notes: [] });
  const strict = matchSets(ref.notes, pred.notes, (n) =>
    [n.hand, n.midi, q(n.beat), q(n.duration)].join(":"),
  );
  const barAligned = matchSets(ref.notes, pred.notes, (n) =>
    [n.measure, n.hand, n.midi, q(n.localBeat), q(n.duration)].join(":"),
  );
  const pitchByBar = matchSets(ref.notes, pred.notes, (n) =>
    [n.measure, n.hand, n.midi].join(":"),
  );
  const ties = matchSets(ref.tieEdges, pred.tieEdges, (n) => n),
    graces = matchSets(ref.graces, pred.graces, (n) =>
      [n.measure, n.hand, n.midi, q(n.localBeat)].join(":"),
    );
  const measureCountMatches =
      reference.measures.length === (actual?.measures.length ?? 0),
    measureLengthsMatch =
      measureCountMatches &&
      reference.measures.every(
        (m, i) => Math.abs(m.duration - actual.measures[i].duration) <= EPS,
      );
  return {
    strict,
    barAligned,
    pitchByBar,
    ties,
    graces,
    measureCountMatches,
    measureLengthsMatch,
    expectedMeasures: reference.measures.length,
    actualMeasures: actual?.measures.length ?? 0,
    referenceTieProblems: ref.tieProblems,
    actualTieProblems: pred.tieProblems,
    fullExact:
      complete &&
      strict.fp === 0 &&
      strict.fn === 0 &&
      graces.fp === 0 &&
      graces.fn === 0 &&
      ties.fp === 0 &&
      ties.fn === 0 &&
      measureLengthsMatch,
  };
}
