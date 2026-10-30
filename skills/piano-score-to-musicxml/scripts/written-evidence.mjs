// Source spelling is evidence. Never repair sounding pitches by harmonic guess.
export function groupBy(values, key) {
  const groups = new Map();
  for (const value of values) {
    const k = key(value);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(value);
  }
  return groups;
}
const steps = "CDEFGAB",
  semitones = [0, 2, 4, 5, 7, 9, 11],
  EPS = 1e-5;
const accidentalNames = {
  "-2": "flat-flat",
  "-1": "flat",
  0: "natural",
  1: "sharp",
  2: "double-sharp",
};
const keyAlter = (step, fifths) =>
  (fifths >= 0 ? "FCGDAEB" : "BEADGCF")
    .slice(0, Math.abs(fifths))
    .includes(step)
    ? Math.sign(fifths)
    : 0;
export const writtenMidi = (p) =>
  (p.octave + 1) * 12 + semitones[steps.indexOf(p.step)] + p.alter;
const fail = (path, message) => {
  throw Object.assign(new Error(path + ": " + message), {
    code: "INVALID_COMPACT_REGION",
    expose: true,
    status: 422,
    issues: [{ code: "INVALID_NOTATION", path, message }],
  });
};
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
export const compareSourceEvents = (a, b) =>
  a.beat - b.beat || (a.order ?? 0) - (b.order ?? 0);
export function validateRecognitionEvidence(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.notes) ||
    value.notes.length > 10000 ||
    !Array.isArray(value.clefs) ||
    !Array.isArray(value.keys) ||
    !Array.isArray(value.voices) ||
    !Array.isArray(value.rests)
  )
    fail("notation", "缺少书写音名、谱号、调号、休止或声部清单");
  const ids = new Set();
  for (const [i, n] of value.notes.entries()) {
    if (
      !n ||
      typeof n.noteId !== "string" ||
      ids.has(n.noteId) ||
      ![1, 2].includes(n.staff) ||
      !steps.includes(n.step) ||
      n.step.length !== 1 ||
      !integer(n.octave, -1, 9) ||
      !integer(n.alter, -2, 2) ||
      !(n.printed === null || integer(n.printed, -2, 2)) ||
      !integer(n.shift ?? 0, -24, 24) ||
      (n.shift ?? 0) % 12 ||
      (n.position !== undefined &&
        n.position !== null &&
        !integer(n.position, -30, 40))
    )
      fail(`notation.notes[${i}]`, "书写音名、谱表、显式记号或八度移位无效");
    ids.add(n.noteId);
  }
  for (const [i, c] of value.clefs.entries())
    if (
      ![1, 2].includes(c.staff) ||
      !["G", "F", "C"].includes(c.sign) ||
      !integer(c.line, 1, 5) ||
      !integer(c.octaveChange ?? 0, -2, 2) ||
      !Number.isFinite(c.beat) ||
      c.beat < 0 ||
      (c.order !== undefined && !integer(c.order, 0, 255))
    )
      fail(`notation.clefs[${i}]`, "谱号或变化位置无效");
  for (const [i, k] of value.keys.entries())
    if (
      ![1, 2].includes(k.staff) ||
      !integer(k.fifths, -7, 7) ||
      !Number.isFinite(k.beat) ||
      k.beat < 0
    )
      fail(`notation.keys[${i}]`, "调号变化无效");
  for (const [i, v] of value.voices.entries())
    if (
      typeof v.voice !== "string" ||
      !["right", "left"].includes(v.hand) ||
      !Number.isFinite(v.from) ||
      !Number.isFinite(v.to) ||
      v.from < 0 ||
      v.to <= v.from
    )
      fail(`notation.voices[${i}]`, "声部活动范围须明确且时长为正");
  const restIds = new Set();
  for (const [i, r] of value.rests.entries()) {
    if (
      typeof r.restId !== "string" ||
      !r.restId ||
      restIds.has(r.restId) ||
      ![1, 2].includes(r.staff)
    )
      fail(`notation.rests[${i}]`, "休止引用或谱表无效或重复");
    restIds.add(r.restId);
  }
  for (const list of [value.clefs, value.keys]) {
    for (const events of groupBy(
      list,
      (e) => e.staff + ":" + e.beat,
    ).values()) {
      if (
        events.length > 1 &&
        (list !== value.clefs ||
          events.some((e) => e.order === undefined) ||
          new Set(events.map((e) => e.order)).size !== events.length)
      )
        fail(
          "notation",
          "同拍同谱表的谱号/调号重复；谱号须有原图明确的唯一order",
        );
    }
    for (const staff of [1, 2])
      if (!list.some((e) => e.staff === staff && e.beat === 0))
        fail("notation", "上下谱表均须有初始谱号和调号");
  }
  const normalized = structuredClone(value);
  normalized.clefs.sort(compareSourceEvents);
  return normalized;
}

export function decodeWrittenNotation(raw, decoded, region) {
  if (raw.notation === undefined) return decoded;
  const r = raw.notation;
  if (
    !r ||
    r.version !== 1 ||
    !Array.isArray(r.notes) ||
    !Array.isArray(r.rests) ||
    !Array.isArray(r.clefs) ||
    !Array.isArray(r.voices)
  )
    fail("notation", "必须明确列出 notes/rests/clefs/voices");
  const byIndex = (index, path, max) => {
    if (!integer(index, 0, max - 1)) fail(path, "事件数组下标不存在");
    return index;
  };
  const notes = r.notes.map((n, i) => {
    const index = byIndex(
      n.index,
      `notation.notes[${i}].index`,
      raw.notes.length,
    );
    return {
      noteId: "n" + index,
      staff: n.staff,
      step: n.step,
      octave: n.octave,
      alter: n.alter,
      printed: n.printed,
      shift: n.shift ?? 0,
      ...(n.position !== undefined ? { position: n.position } : {}),
    };
  });
  if (new Set(notes.map((n) => n.noteId)).size !== raw.notes.length)
    fail("notation.notes", "每个主音与倚音都须恰有一条书写证据");
  const rests = r.rests.map((v, i) => {
    const index = byIndex(
      v.index,
      `notation.rests[${i}].index`,
      raw.rests.length,
    );
    return {
      restId: "rest-" + index,
      staff: v.staff,
      ...(v.x !== undefined && v.y !== undefined ? { x: v.x, y: v.y } : {}),
      ...(v.rhythm ? { rhythm: v.rhythm } : {}),
    };
  });
  if (new Set(rests.map((n) => n.restId)).size !== raw.rests.length)
    fail("notation.rests", "每个休止都须恰有一条原谱证据");
  const voices = r.voices.map((v) => {
    if (!integer(v.voice, -32, 32) || v.voice === 0)
      fail("notation.voices", "声部使用非零整数");
    return {
      voice: (v.voice > 0 ? "right-" : "left-") + Math.abs(v.voice),
      hand: v.voice > 0 ? "right" : "left",
      from: v.from,
      to: v.to,
    };
  });
  const evidence = validateRecognitionEvidence({
    version: 1,
    notes,
    rests,
    clefs: r.clefs,
    keys:
      r.keys ?? [1, 2].map((staff) => ({ staff, beat: 0, fifths: raw.key })),
    voices,
    source: {
      page: region.page,
      system: region.system,
      rect: region.rect,
      imageSha256: region.image?.sha256 ?? null,
    },
  });
  const byId = new Map(notes.map((n) => [n.noteId, n]));
  for (const n of decoded.score.notes) {
    const e = byId.get(n.id);
    n.staff = e.staff;
    const pos = decoded.positions.find((p) => p.noteId === n.id);
    if (pos)
      n.sourcePositions = [
        { page: region.page, system: region.system, x: pos.x, y: pos.y },
      ];
  }
  decoded.rests = decoded.rests.map((v, i) => {
    const e = rests.find((r) => r.restId === "rest-" + i);
    const positions =
      Number.isFinite(e.x) && Number.isFinite(e.y)
        ? [
            {
              page: region.page,
              system: region.system,
              x: region.rect.x + e.x * region.rect.width,
              y: region.rect.y + e.y * region.rect.height,
            },
          ]
        : [];
    if (positions.length && (e.x < 0 || e.x > 1 || e.y < 0 || e.y > 1))
      fail("notation.rests", "休止位置超出原图");
    return {
      ...v,
      id: e.restId,
      staff: e.staff,
      provenance: "source",
      ...(positions.length ? { sourcePositions: positions } : {}),
      ...(e.rhythm ? { rhythm: e.rhythm } : {}),
    };
  });
  decoded.score.recognitionEvidence = evidence;
  decoded.score.rests = decoded.rests;
  const boundaries = [];
  let barBeat = 0;
  for (const bar of raw.bars) {
    boundaries.push(barBeat);
    barBeat += bar;
  }
  if (
    evidence.clefs.some(
      (c) => !boundaries.some((b) => Math.abs(b - c.beat) < EPS),
    )
  )
    decoded.warnings.push(
      "小节中途谱号变化已保存在原谱证据；重绘按小节边界谱号排版，可在 MusicXML 编辑器调整。",
    );
  const main = new Map(decoded.score.notes.map((n) => [n.id, n]));
  // Grace metadata is kept in the same evidence, with a zero-time source head.
  evidence.graces = (raw.graces || []).map(([index, anchor]) => ({
    noteId: "n" + index,
    anchor: "n" + anchor,
    midi: raw.notes[index][0],
    beat: raw.notes[index][1],
    duration: 0,
    hand: raw.notes[index][3] > 0 ? "right" : "left",
    voice:
      (raw.notes[index][3] > 0 ? "right-" : "left-") +
      Math.abs(raw.notes[index][3]),
  }));
  const audit = auditWrittenNotation(
    decoded.score,
    decoded.coverage.measureDurations,
    decoded.internalTies,
    decoded.continuity,
  );
  for (const n of decoded.score.notes) {
    const e = byId.get(n.id),
      pitch = audit.pitches[n.id];
    if (pitch && writtenMidi(pitch) === n.midi)
      n.pitch = { ...pitch, provenance: "source" };
    if (e.printed !== null) n.accidental = accidentalNames[e.printed];
  }
  for (const [anchor, group] of groupBy(evidence.graces, (g) => g.anchor))
    group.forEach((g, i) => {
      const p = audit.pitches[g.noteId];
      if (p && writtenMidi(p) === g.midi)
        main.get(anchor).grace.notes[i].pitch = { ...p, provenance: "source" };
    });
  return decoded;
}

export function auditWrittenNotation(
  score,
  bars,
  ties = [],
  continuity = { tieIn: [] },
) {
  const e = score.recognitionEvidence;
  if (!e) return { issues: [], pitches: {} };
  validateRecognitionEvidence(e);
  const issues = [],
    pitches = {},
    events = [...score.notes, ...(e.graces || [])],
    byId = new Map(events.map((n) => [n.id ?? n.noteId, n]));
  const add = (code, message, n, extra = {}) =>
    issues.push({
      code,
      message,
      ...(n ? { noteId: n.noteId } : {}),
      ...extra,
    });
  const starts = [];
  let end = 0;
  for (const b of bars) {
    starts.push(end);
    end += b;
  }
  const measureAt = (beat) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > beat + EPS) i--;
    return i;
  };
  const clefAt = (staff, beat) =>
    e.clefs
      .filter((c) => c.staff === staff && c.beat <= beat + EPS)
      .sort(compareSourceEvents)
      .at(-1);
  const keyAt = (staff, beat) =>
    e.keys
      .filter((c) => c.staff === staff && c.beat <= beat + EPS)
      .sort((a, b) => a.beat - b.beat)
      .at(-1);
  for (const c of [...e.clefs, ...e.keys])
    if (c.beat >= end) add("NOTATION_BOUNDS", "谱号或调号变化在谱行范围外");
  const incoming = new Map(ties.map((t) => [t.toNoteId, t.fromNoteId])),
    external = new Set((continuity.tieIn || []).map((t) => t.noteId));
  const state = new Map(),
    valid = e.notes.filter((n) => {
      if (!byId.has(n.noteId)) {
        add("SOURCE_EVENT_MISSING", "书写证据对应的事件已删除", n);
        return false;
      }
      return true;
    });
  for (const n of events)
    if (!e.notes.some((x) => x.noteId === (n.id ?? n.noteId)))
      add("WRITTEN_EVIDENCE_MISSING", "音符缺少当前原谱书写证据", {
        noteId: n.id ?? n.noteId,
      });
  const groups = groupBy(valid, (n) => byId.get(n.noteId).beat);
  for (const [beat, group] of [...groups].sort((a, b) => a[0] - b[0])) {
    const explicit = new Map();
    for (const n of group) {
      const key = keyAt(n.staff, beat),
        m = measureAt(beat),
        k = [m, n.staff, key?.beat, n.step, n.octave].join(":");
      if (n.printed !== null) {
        if (!explicit.has(k)) explicit.set(k, new Set());
        explicit.get(k).add(n.printed);
      }
    }
    for (const n of group) {
      const event = byId.get(n.noteId),
        key = keyAt(n.staff, beat),
        clef = clefAt(n.staff, beat),
        m = measureAt(beat),
        k = [m, n.staff, key?.beat, n.step, n.octave].join(":"),
        values = explicit.get(k);
      if (values?.size > 1)
        add(
          "SIMULTANEOUS_ACCIDENTAL_CONFLICT",
          "同拍同名同八度的显式记号矛盾，不能按数组顺序裁决",
          n,
          { measure: m + 1 },
        );
      const expected =
        n.printed !== null
          ? n.printed
          : values?.size === 1
            ? [...values][0]
            : state.has(k)
              ? state.get(k)
              : keyAlter(n.step, key?.fifths ?? score.keySignature);
      if (
        !incoming.has(n.noteId) &&
        !external.has(n.noteId) &&
        n.alter !== expected
      )
        add("ACCIDENTAL_STATE", "书写升降值与调号/本小节临时记号不一致", n, {
          measure: m + 1,
          expected,
          actual: n.alter,
        });
      if (n.position !== null && n.position !== undefined && clef) {
        const anchor =
          clef.sign === "G" ? 4 * 7 + 4 : clef.sign === "F" ? 3 * 7 + 3 : 4 * 7;
        if (
          anchor + n.position - 2 * (clef.line - 1) !==
          n.octave * 7 + steps.indexOf(n.step)
        )
          add("STAFF_POSITION", "音头线间位置与谱号推导的字母/八度不一致", n, {
            measure: m + 1,
          });
      }
      const shift = (n.shift ?? 0) + (clef?.octaveChange ?? 0) * 12,
        pitch = { step: n.step, alter: n.alter, octave: n.octave + shift / 12 };
      pitches[n.noteId] = pitch;
      if (writtenMidi(pitch) !== event.midi)
        add(
          "PITCH_DISAGREEMENT",
          "模型 MIDI 与原谱音名推导矛盾；已保留两者，请按原图裁决",
          n,
          {
            measure: m + 1,
            computedMidi: writtenMidi(pitch),
            modelMidi: event.midi,
          },
        );
      const from = incoming.get(n.noteId);
      if (from && byId.get(from)?.midi !== event.midi)
        add("TIED_PITCH", "跨小节延音的实际音高不一致", n, { measure: m + 1 });
    }
    for (const [k, values] of explicit)
      if (values.size === 1) state.set(k, [...values][0]);
  }
  return { issues, pitches };
}

// Shared by browser preflight and server acceptance. Layout-created rests can
// never turn missing source time into recognized evidence.
export function auditWrittenCoverage(score, rests = score.rests || []) {
  const e = score.recognitionEvidence;
  if (!e) return [];
  const issues = [],
    add = (code, message, details = {}) =>
      issues.push({ code, message, ...details });
  for (const scope of e.voices) {
    if (scope.to > score.durationBeats + EPS)
      add("VOICE_SCOPE", "声部活动区间超出谱行。", { voice: scope.voice });
    const events = [
      ...score.notes,
      ...rests.filter((r) => r.provenance !== "inferred"),
    ].filter((n) => n.hand === scope.hand && n.voice === scope.voice);
    let cursor = scope.from;
    for (const n of events
      .filter(
        (n) =>
          n.beat < scope.to - EPS && n.beat + n.duration > scope.from + EPS,
      )
      .sort((a, b) => a.beat - b.beat)) {
      if (n.beat > cursor + EPS)
        add("VOICE_GAP", "独立声部有未以原谱音符或休止解释的空缺。", {
          voice: scope.voice,
          hand: scope.hand,
          beat: cursor,
          endBeat: Math.min(n.beat, scope.to),
        });
      cursor = Math.max(cursor, n.beat + n.duration);
    }
    if (cursor < scope.to - EPS)
      add("VOICE_GAP", "独立声部末尾存在未解释空缺。", {
        voice: scope.voice,
        hand: scope.hand,
        beat: cursor,
        endBeat: scope.to,
      });
  }
  for (const n of [...score.notes, ...rests])
    if (
      !e.voices.some(
        (v) =>
          v.hand === n.hand &&
          v.voice === n.voice &&
          n.beat >= v.from - EPS &&
          n.beat + n.duration <= v.to + EPS,
      )
    )
      add("VOICE_SCOPE", "音符或休止不属于已声明的活动声部。", {
        noteId: n.id,
        voice: n.voice,
      });
  for (const r of e.rests)
    if (!rests.some((x) => x.id === r.restId))
      add("SOURCE_REST_MISSING", "原谱休止证据对应的休止已删除。", {
        restId: r.restId,
      });
  const ids = new Set();
  for (const r of rests) {
    if (
      !r.id ||
      ids.has(r.id) ||
      r.provenance === "inferred" ||
      !e.rests.some((x) => x.restId === r.id && x.staff === r.staff)
    )
      add(
        "SOURCE_REST_EVIDENCE_MISSING",
        "休止须有唯一事件编号和明确的原谱谱表证据；排版推断不能代替原谱休止。",
        { restId: r.id },
      );
    ids.add(r.id);
  }
  return issues;
}
