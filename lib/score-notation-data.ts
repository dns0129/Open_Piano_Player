import type {
  WrittenPitch,
  SourcePosition,
  ScoreRest,
  Lineage,
  SourceNotation,
} from "./score-types.ts";

const natural: Record<WrittenPitch["step"], number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
export function pitchMidi(pitch: WrittenPitch): number {
  return (pitch.octave + 1) * 12 + natural[pitch.step] + pitch.alter;
}
export function validateWrittenPitch(
  value: unknown,
  midi: number,
): WrittenPitch {
  const p = value as WrittenPitch;
  if (
    !p ||
    !Object.hasOwn(natural, p.step) ||
    !Number.isInteger(p.alter) ||
    Math.abs(p.alter) > 2 ||
    !Number.isInteger(p.octave) ||
    !["source", "inferred", "edited"].includes(p.provenance) ||
    pitchMidi(p) !== midi
  )
    throw new Error("书写音名、升降记号与实际音高不一致。");
  return {
    step: p.step,
    alter: p.alter,
    octave: p.octave,
    provenance: p.provenance,
  };
}
export function validatePositions(value: unknown): SourcePosition[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("原谱音符定位无效。");
  return value.map((p) => {
    if (
      !p ||
      !Number.isInteger(p.page) ||
      p.page < 1 ||
      !Number.isInteger(p.system) ||
      p.system < 1 ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x < 0 ||
      p.y < 0
    )
      throw new Error("原谱音符坐标无效。");
    return { page: p.page, system: p.system, x: p.x, y: p.y };
  });
}
export function writtenNoteFields(
  note: Record<string, unknown>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (note.pitch !== undefined)
    fields.pitch = validateWrittenPitch(note.pitch, note.midi as number);
  if (note.staff !== undefined) {
    if (
      !Number.isInteger(note.staff) ||
      (note.staff as number) < 1 ||
      (note.staff as number) > 2
    )
      throw new Error("钢琴谱表必须是 1 或 2。");
    fields.staff = note.staff;
  }
  if (note.accidental !== undefined) {
    if (
      ![
        "natural",
        "sharp",
        "flat",
        "double-sharp",
        "flat-flat",
        "natural-sharp",
        "natural-flat",
      ].includes(note.accidental as string)
    )
      throw new Error("书写升降记号无效。");
    fields.accidental = note.accidental;
  }
  if (note.sourcePositions !== undefined)
    fields.sourcePositions = validatePositions(note.sourcePositions);
  return fields;
}
export function validateRests(value: unknown, duration: number): ScoreRest[] {
  if (!Array.isArray(value) || value.length > 20000)
    throw new Error("休止符列表无效。");
  const ids = new Set();
  return value.map((r, i) => {
    if (
      !r ||
      typeof r.id !== "string" ||
      !r.id ||
      ids.has(r.id) ||
      r.id.length > 100 ||
      !Number.isFinite(r.beat) ||
      r.beat < 0 ||
      !Number.isFinite(r.duration) ||
      r.duration <= 0 ||
      r.beat + r.duration > duration + 1e-4 ||
      ![1, 2].includes(r.staff) ||
      typeof r.voice !== "string" ||
      !r.voice ||
      r.voice.length > 80 ||
      !["right", "left"].includes(r.hand) ||
      !["source", "inferred", "edited"].includes(r.provenance)
    )
      throw new Error("第 " + (i + 1) + " 个休止符无效。");
    ids.add(r.id);
    return {
      id: r.id,
      beat: r.beat,
      duration: r.duration,
      staff: r.staff,
      voice: r.voice,
      hand: r.hand,
      provenance: r.provenance,
      ...(r.sourcePositions
        ? { sourcePositions: validatePositions(r.sourcePositions) }
        : {}),
    };
  });
}
export function validateLineage(value: unknown): Lineage {
  const raw = value as Record<string, unknown>,
    result: Record<string, string> = {};
  if (!raw || typeof raw !== "object") throw new Error("乐谱版本关系无效。");
  for (const key of ["originalId", "parentId", "publishedFromId"])
    if (raw[key] !== undefined) {
      if (
        typeof raw[key] !== "string" ||
        !raw[key] ||
        raw[key].length > 100 ||
        /[\u0000-\u001f]/.test(raw[key])
      )
        throw new Error("乐谱版本引用无效。");
      result[key] = raw[key];
    }
  if (!result.originalId) throw new Error("乐谱缺少原始版本引用。");
  return result as unknown as Lineage;
}

export function validateNotationInference(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((v) => !["pitch", "staff", "voice", "rests"].includes(v))
  )
    throw new Error("记谱推断标记无效。");
  return [...new Set(value)];
}

export function validateSourceNotation(value: unknown): SourceNotation {
  const raw = value as Record<string, unknown>;
  if (
    !raw ||
    !Array.isArray(raw.systems) ||
    raw.systems.length > 1000 ||
    !Array.isArray(raw.notes) ||
    raw.notes.length > 40000
  )
    throw new Error("原谱定位文档无效。");
  const systems = raw.systems.map((s) => {
    if (!s || typeof s.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(s.id))
      throw new Error("原谱谱行引用无效。");
    const out: Record<string, unknown> & { id: string } = { id: s.id };
    for (const key of ["assetId", "imageUrl"])
      if (typeof s[key] === "string") out[key] = s[key].slice(0, 4000);
    for (const key of [
      "page",
      "system",
      "firstMeasure",
      "lastMeasure",
      "startBeat",
      "endBeat",
    ])
      if (s[key] !== undefined) {
        if (!Number.isFinite(s[key]) || s[key] < 0)
          throw new Error("原谱谱行范围无效。");
        out[key] = s[key];
      }
    if (s.rect !== undefined) {
      if (
        !s.rect ||
        !["x", "y", "width", "height"].every(
          (k) => Number.isFinite(s.rect[k]) && s.rect[k] >= 0,
        )
      )
        throw new Error("原谱裁切范围无效。");
      out.rect = {
        x: s.rect.x,
        y: s.rect.y,
        width: s.rect.width,
        height: s.rect.height,
      };
    }
    return out;
  });
  if (new Set(systems.map((s) => s.id)).size !== systems.length)
    throw new Error("原谱谱行 ID 重复。");
  const notes = raw.notes.map((n) => {
    if (!n || typeof n.noteId !== "string" || n.noteId.length > 100)
      throw new Error("原谱音头引用无效。");
    const [position] = validatePositions([n]),
      out: Record<string, unknown> & { noteId: string } = {
        noteId: n.noteId,
        ...position,
      };
    for (const key of ["beat", "duration", "midi"])
      if (n[key] !== undefined) {
        if (!Number.isFinite(n[key]))
          throw new Error("原谱音头时间或音高无效。");
        out[key] = n[key];
      }
    if (["right", "left"].includes(n.hand)) out.hand = n.hand;
    return out;
  });
  return {
    version: 1,
    coordinateSpace:
      typeof raw.coordinateSpace === "string" ? raw.coordinateSpace : "page",
    scoreId: typeof raw.scoreId === "string" ? raw.scoreId : "",
    systems,
    notes,
    ...(Array.isArray(raw.measureMap)
      ? { measureMap: structuredClone(raw.measureMap) }
      : {}),
  };
}
