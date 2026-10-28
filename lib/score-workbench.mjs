import { scoreMeasureBounds, midiName } from "./score.mjs";
import { spellMidi } from "./pitch-spelling.mjs";
import { detachInvalidTies } from "./note-effects.mjs";
const letters = "CDEFGAB",
  semitones = [0, 2, 4, 5, 7, 9, 11];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const pitchStep = (p) =>
  p.octave * 7 + letters.indexOf(p.step || p.letter);
export function staffPitch(step, alter = 0) {
  const octave = Math.floor(step / 7),
    i = ((step % 7) + 7) % 7;
  return {
    midi: (octave + 1) * 12 + semitones[i] + alter,
    pitch: { step: letters[i], octave, alter, provenance: "edited" },
  };
}
export function noteSpelling(note, key = 0) {
  return (
    note.pitch ||
    (() => {
      const p = spellMidi(note.midi, key);
      return { step: p.letter, octave: p.octave, alter: p.accidental };
    })()
  );
}

export function sliceScoreRange(score, start, end) {
  const overlaps = (n) =>
    n.beat < end - 1e-7 && n.beat + n.duration > start + 1e-7;
  const clip = (n) => ({
    ...n,
    beat: Math.max(start, n.beat) - start,
    duration: Math.min(end, n.beat + n.duration) - Math.max(start, n.beat),
    ...(n.beat < start || n.beat + n.duration > end
      ? { rhythm: undefined, fermata: undefined }
      : {}),
    sourcePositions: undefined,
  });
  const measureMap = [];
  let i = 0;
  for (
    ;
    i <
    (score.measureMap?.length ||
      Math.ceil(
        score.durationBeats /
          ((score.timeSignature[0] * 4) / score.timeSignature[1]),
      ));
    i++
  ) {
    const b = scoreMeasureBounds(score, i);
    if (b.start >= end - 1e-7) break;
    if (b.end <= start + 1e-7) continue;
    measureMap.push({
      ...score.measureMap?.[i],
      beat: Math.max(start, b.start) - start,
      duration: Math.min(end, b.end) - Math.max(start, b.start),
      timeSignature: b.timeSignature,
    });
  }
  const activeTempo = (score.tempoMap || [])
    .filter((t) => t.beat <= start)
    .at(-1);
  return {
    ...score,
    id: score.id + "-view",
    notes: detachInvalidTies(score.notes.filter(overlaps).map(clip)),
    rests: (score.rests || []).filter(overlaps).map(clip),
    recognitionEvidence: undefined,
    sourceNotation: undefined,
    tempo: activeTempo?.bpm || score.tempo,
    timeSignature: measureMap[0]?.timeSignature || score.timeSignature,
    measureMap,
    durationBeats: end - start,
    tempoMap: (score.tempoMap || [])
      .filter((t) => t.beat >= start && t.beat < end)
      .map((t) => ({ ...t, beat: t.beat - start })),
    fermatas: (score.fermatas || [])
      .filter((t) => t.beat > start && t.beat <= end)
      .map((t) => ({ ...t, beat: t.beat - start })),
  };
}

export function savedScorePages(score, notation) {
  if (notation?.systems?.length) {
    const grouped = new Map();
    for (const source of notation.systems) {
      const page = source.page || 1;
      if (!grouped.has(page)) grouped.set(page, []);
      const start =
          source.startBeat ??
          scoreMeasureBounds(score, Math.max(0, (source.firstMeasure || 1) - 1))
            .start,
        end =
          source.endBeat ??
          scoreMeasureBounds(
            score,
            Math.max(0, (source.lastMeasure || source.firstMeasure || 1) - 1),
          ).end;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        continue;
      grouped.get(page).push({
        id: source.id,
        page,
        startBeat: start,
        endBeat: end,
        score: sliceScoreRange(score, start, end),
        source: {
          ...source,
          evidence: score.recognitionEvidence,
          notes: (notation.notes || []).filter(
            (n) =>
              n.systemId === source.id ||
              (n.page === page && n.system === source.system),
          ),
        },
      });
    }
    return [...grouped]
      .sort((a, b) => a[0] - b[0])
      .map(([page, systems]) => ({
        page,
        ...notation.pages?.find((p) => p.page === page),
        systems: systems.sort((a, b) => a.startBeat - b.startBeat),
        previewScore: systems.length
          ? sliceScoreRange(
              score,
              Math.min(...systems.map((s) => s.startBeat)),
              Math.max(...systems.map((s) => s.endBeat)),
            )
          : undefined,
      }));
  }
  const count =
      score.measureMap?.length ||
      Math.ceil(
        score.durationBeats /
          ((score.timeSignature[0] * 4) / score.timeSignature[1]),
      ),
    pages = [];
  for (let first = 0; first < count; first += 8) {
    const systems = [];
    for (let bar = first; bar < Math.min(first + 8, count); bar += 2) {
      const start = scoreMeasureBounds(score, bar).start,
        end = scoreMeasureBounds(score, Math.min(bar + 1, count - 1)).end;
      systems.push({
        id: "digital-" + bar,
        startBeat: start,
        endBeat: end,
        score: sliceScoreRange(score, start, end),
      });
    }
    pages.push({
      page: pages.length + 1,
      systems,
      previewScore: sliceScoreRange(
        score,
        systems[0].startBeat,
        systems.at(-1).endBeat,
      ),
    });
  }
  return pages;
}

// Both engraved notes and source-image targets use this same musical lattice.
export function snapStaffTarget({
  note,
  bar,
  x,
  y,
  staffs,
  step = 0.25,
  endBeat,
  existingBeats = [],
  notes = [],
}) {
  if (!staffs?.length || !Number.isFinite(x) || !Number.isFinite(y))
    return null;
  const staff = staffs.reduce((a, b) =>
    Math.abs(y - (a.bottomY - 2 * a.spacing)) <=
    Math.abs(y - (b.bottomY - 2 * b.spacing))
      ? a
      : b,
  );
  const unit = staff.spacing / 2,
    spelling = noteSpelling(note, bar.keySignature || 0);
  if (!Number.isFinite(unit) || unit <= 0) return null;
  const from = bar.start ?? bar.beat ?? 0,
    to = bar.end ?? from + bar.duration;

  const atX = (beat) => {
    const anchors = bar.anchors;
    if (!anchors?.length)
      return bar.left + ((beat - from) / (to - from)) * (bar.right - bar.left);
    const right = anchors.findIndex((a) => a.beat >= beat);
    if (right < 0) return anchors.at(-1).x;
    if (right === 0) return anchors[0].x;
    const a = anchors[right - 1],
      b = anchors[right];
    return a.x + ((beat - a.beat) / (b.beat - a.beat)) * (b.x - a.x);
  };
  const voice =
    staff.hand === note.hand
      ? voiceOf(note)
      : voiceOf(
          notes.find((n) => n.hand === staff.hand) || { hand: staff.hand },
        );
  const candidates = [
    from,
    ...existingBeats.filter((b) => b >= from && b < to),
    ...Array.from(
      { length: Math.ceil((to - from) / step) },
      (_, i) => from + i * step,
    ),
  ].filter(
    (b) =>
      b < to - 1e-7 &&
      b >= 0 &&
      b + note.duration <= (endBeat ?? to) + 1e-7 &&
      gridSlotAvailable(note, notes, staff.hand, voice, b, note.duration),
  );
  if (!candidates.length) return null;
  const beat = candidates.reduce((a, b) =>
    Math.abs(atX(a) - x) <= Math.abs(atX(b) - x) ? a : b,
  );
  const bottomStep = staff.bottomStepAtBeat?.(beat) ?? staff.bottomStep;
  const bounds = [
    Math.max(
      5,
      staff.minY !== undefined
        ? Math.ceil(bottomStep - (staff.maxY - staff.bottomY) / unit)
        : (staff.minStep ?? 5),
    ),
    Math.min(
      56,
      staff.minY !== undefined
        ? Math.floor(bottomStep + (staff.bottomY - staff.minY) / unit)
        : (staff.maxStep ?? 56),
    ),
  ];
  if (bounds[0] > bounds[1]) return null;
  const p = staffPitch(
    clamp(bottomStep + Math.round((staff.bottomY - y) / unit), ...bounds),
    spelling.alter || 0,
  );
  if (p.midi < 21 || p.midi > 108) return null;
  const patch = {
    midi: p.midi,
    beat,
    hand: staff.hand,
    staff: staff.hand === "left" ? 2 : 1,
    pitch: p.pitch,
    accidental: {
      "-2": "flat-flat",
      "-1": "flat",
      0: "natural",
      1: "sharp",
      2: "double-sharp",
    }[p.pitch.alter],
    ...(staff.hand !== note.hand ? { voice } : {}),
  };
  return {
    patch,
    x: atX(beat),
    y: staff.bottomY - (pitchStep(p.pitch) - bottomStep) * unit,
    label: `${midiName(p.midi)} · 第 ${Number((beat + 1).toFixed(4))} 拍 · ${staff.hand === "left" ? "左手" : "右手"}`,
  };
}

export function sourceGrid(system, staffLines, noteId) {
  const s = system.source,
    r = s?.rect;
  if (!r || staffLines?.right?.length !== 5 || staffLines?.left?.length !== 5)
    return null;
  const notes = (s.notes || []).filter(
    (n) => Number.isFinite(n.x) && Number.isFinite(n.beat),
  );
  const beats = [...new Set(notes.map((n) => n.beat - system.startBeat))].sort(
    (a, b) => a - b,
  );
  const anchors = [];
  for (const beat of beats) {
    const xs = notes
        .filter((n) => Math.abs(n.beat - system.startBeat - beat) < 1e-6)
        .map((n) => n.x)
        .sort((a, b) => a - b),
      x = xs[Math.floor(xs.length / 2)];
    if (
      beat >= 0 &&
      beat < system.score.durationBeats &&
      (!anchors.length || x > anchors.at(-1).x)
    )
      anchors.push({ beat, x });
  }
  if (anchors[0]?.beat > 0) {
    const first = anchors[0];
    anchors.unshift({
      beat: 0,
      x: Math.max(
        r.x,
        first.x -
          Math.max(
            8,
            (r.width * 0.8 * first.beat) / system.score.durationBeats,
          ),
      ),
    });
  }
  if (anchors.length)
    anchors.push({
      beat: system.score.durationBeats,
      x: Math.max(r.x + r.width * 0.98, anchors.at(-1).x + 1),
    });
  return {
    bar: {
      start: 0,
      end: system.score.durationBeats,
      left: anchors[0]?.x ?? r.x + r.width * 0.12,
      right: r.x + r.width * 0.98,
      keySignature: system.score.keySignature,
      anchors,
    },
    staffs: ["right", "left"].map((hand) => {
      const lines = staffLines[hand],
        staff = hand === "left" ? 2 : 1,
        e = s.evidence || s.score?.recognitionEvidence;
      const anchorAt = (beat) => {
        const c = e?.clefs
            ?.filter(
              (c) => c.staff === staff && c.beat <= system.startBeat + beat,
            )
            .sort((a, b) => a.beat - b.beat)
            .at(-1),
          shift = e?.notes?.find((n) => n.noteId === noteId)?.shift || 0,
          anchor =
            c?.sign === "C"
              ? 28
              : c?.sign === "F"
                ? 24
                : c?.sign === "G"
                  ? 32
                  : hand === "left"
                    ? 24
                    : 32;
        return (
          anchor -
          2 * ((c?.line ?? (hand === "left" ? 4 : 2)) - 1) +
          ((c?.octaveChange || 0) + shift / 12) * 7
        );
      };
      return {
        hand,
        bottomY: lines[4],
        spacing: (lines[4] - lines[0]) / 4,
        bottomStep: anchorAt(0),
        bottomStepAtBeat: anchorAt,
        minY: r.y,
        maxY: r.y + r.height,
      };
    }),
  };
}

export function editedSourceRecord(score, record) {
  if (!record?.notation) return undefined;
  const ids = new Map(score.notes.map((n) => [n.id, n]));
  const notation = {
    ...record.notation,
    scoreId: score.id,
    title: score.title,
    durationBeats: score.durationBeats,
    notePositionsComplete: score.notes.every((n) =>
      (record.notation.notes || []).some((p) => p.noteId === n.id),
    ),
    notes: (record.notation.notes || [])
      .filter((p) => ids.has(p.noteId))
      .map((p) => {
        const n = ids.get(p.noteId),
          position = n.sourcePositions?.find(
            (s) => s.page === p.page && s.system === p.system,
          );
        return {
          ...p,
          ...position,
          beat: n.beat,
          duration: n.duration,
          midi: n.midi,
          hand: n.hand,
        };
      }),
  };
  return {
    ...record,
    notation,
    reference: {
      id: score.id,
      durationBeats: score.durationBeats,
      keySignature: score.keySignature,
      timeSignature: [...score.timeSignature],
      notes: score.notes
        .map((n) => [n.id, n.beat, n.duration, n.midi, n.hand])
        .sort((a, b) => a[0].localeCompare(b[0])),
    },
    reviewStatus: {
      ...record.reviewStatus,
      humanConfirmed: false,
      method: "user-edited",
      reviewRequired: true,
    },
  };
}

export function pagePlayback(page) {
  if (page.previewScore)
    return { ...page.previewScore, id: "page-preview", title: "当前页试听" };
  let offset = 0;
  const notes = [],
    rests = [],
    measureMap = [],
    tempoMap = [],
    fermatas = [];
  const first = page.systems.find((s) => s.score)?.score;
  for (const system of page.systems) {
    const s = system.score;
    if (!s) continue;
    const id = (n) => system.id + ":" + n;
    notes.push(
      ...s.notes.map((n) => ({
        ...n,
        id: id(n.id),
        beat: n.beat + offset,
        ...(n.tieTo ? { tieTo: id(n.tieTo) } : {}),
      })),
    );
    rests.push(
      ...(s.rests || []).map((r) => ({ ...r, beat: r.beat + offset })),
    );
    for (
      let i = 0;
      i <
      (s.measureMap?.length ||
        Math.ceil(
          s.durationBeats / ((s.timeSignature[0] * 4) / s.timeSignature[1]),
        ));
      i++
    ) {
      const b = scoreMeasureBounds(s, i);
      measureMap.push({
        beat: offset + b.start,
        duration: b.length,
        timeSignature: b.timeSignature,
      });
    }
    tempoMap.push(
      ...(s.tempoMap || []).map((t) => ({ ...t, beat: t.beat + offset })),
    );
    fermatas.push(
      ...(s.fermatas || []).map((t) => ({ ...t, beat: t.beat + offset })),
    );
    offset += s.durationBeats;
  }
  return {
    ...first,
    id: "page-preview",
    title: "当前页试听",
    notes,
    rests,
    measureMap,
    tempoMap,
    fermatas,
    durationBeats: offset,
    recognitionEvidence: undefined,
    sourceNotation: undefined,
  };
}

const voiceOf = (n) => n.voice || n.hand + "-1";
export function gridSlotAvailable(note, notes, hand, voice, beat, duration) {
  return !notes.some(
    (n) =>
      n.id !== note.id &&
      n.hand === hand &&
      voiceOf(n) === voice &&
      n.beat < beat + duration - 1e-7 &&
      n.beat + n.duration > beat + 1e-7 &&
      !(
        Math.abs(n.beat - beat) < 1e-7 && Math.abs(n.duration - duration) < 1e-7
      ),
  );
}
/** Relocating a note consumes the destination rest and leaves a rest in its old slot. */
export function moveGridNote(score, id, patch) {
  const before = score.notes.find((n) => n.id === id);
  if (!before) throw new Error("请选择音符。");
  const next = {
    ...before,
    ...patch,
    ...(patch.duration !== undefined && patch.duration !== before.duration
      ? { rhythm: undefined }
      : {}),
  };
  if (
    !gridSlotAvailable(
      before,
      score.notes,
      next.hand,
      voiceOf(next),
      next.beat,
      next.duration,
    )
  )
    throw new Error(
      "目标格与同声部的音符冲突，请选择空格或相同时值的和弦位置。",
    );
  let sequence = 0;
  const ids = new Set(
    [...score.notes, ...(score.rests || [])].map((n) => n.id),
  );
  const restId = () => {
    let id;
    do {
      id = "grid-rest-" + sequence++;
    } while (ids.has(id));
    ids.add(id);
    return id;
  };
  const notes = detachInvalidTies(
    score.notes.map((n) => (n.id === id ? next : n)),
  );
  const rests = (score.rests || []).flatMap((r) => {
    if (
      r.hand !== next.hand ||
      voiceOf(r) !== voiceOf(next) ||
      r.beat >= next.beat + next.duration - 1e-7 ||
      r.beat + r.duration <= next.beat + 1e-7
    )
      return [r];
    const parts = [];
    if (r.beat < next.beat - 1e-7)
      parts.push({ beat: r.beat, duration: next.beat - r.beat });
    if (r.beat + r.duration > next.beat + next.duration + 1e-7)
      parts.push({
        beat: next.beat + next.duration,
        duration: r.beat + r.duration - next.beat - next.duration,
      });
    return parts.map((p) => ({
      ...r,
      ...p,
      id: restId(),
      rhythm: undefined,
      sourcePositions: undefined,
      provenance: "edited",
    }));
  });
  const occupied = [...notes, ...rests]
    .filter((n) => n.hand === before.hand && voiceOf(n) === voiceOf(before))
    .sort((a, b) => a.beat - b.beat);
  let cursor = before.beat;
  const end = before.beat + before.duration;
  const add = (start, end) => {
    if (end - start > 1e-7)
      rests.push({
        id: restId(),
        beat: start,
        duration: end - start,
        hand: before.hand,
        staff: before.staff || (before.hand === "left" ? 2 : 1),
        voice: voiceOf(before),
        provenance: "edited",
      });
  };
  for (const n of occupied) {
    if (n.beat >= end) break;
    if (n.beat + n.duration <= cursor) continue;
    if (n.beat > cursor) add(cursor, Math.min(n.beat, end));
    cursor = Math.max(cursor, n.beat + n.duration);
    if (cursor >= end) break;
  }
  if (cursor < end) add(cursor, end);
  const recognitionEvidence = score.recognitionEvidence
    ? structuredClone(score.recognitionEvidence)
    : undefined;
  if (recognitionEvidence) {
    recognitionEvidence.rests = rests.map(
      (r) =>
        recognitionEvidence.rests?.find((e) => e.restId === r.id) || {
          restId: r.id,
          staff: r.staff || (r.hand === "left" ? 2 : 1),
        },
    );
  }
  return { ...score, notes, rests, recognitionEvidence };
}
