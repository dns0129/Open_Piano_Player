import { validateTempoEvidence } from './recognition-tempo.mjs';
import {
  writtenNoteFields,
  validateRests,
  validateLineage,
  validateSourceNotation,
  validateNotationInference,
} from "./score-notation-data.ts";
import {
  DYNAMICS,
  normalizeNoteEffects,
  synchronizeArpeggios,
  validateTies,
  validateOrnaments,
} from "./note-effects.mjs";
import { normalizeScoreTiming } from "./score-timing.mjs";
/** All score time is measured in quarter-note beats, independent of tempo. */
export const KEY_NAMES = [
  "Cb",
  "Gb",
  "Db",
  "Ab",
  "Eb",
  "Bb",
  "F",
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
];
const text = (value, fallback, max = 200) =>
  String(value ?? fallback)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .slice(0, max);
const number = (value, name, min, max) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${name} 必须在 ${min}–${max} 之间。`);
  return value;
};

export function validatePracticeScore(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("乐谱内容必须是一个对象。");
  if (raw.version !== undefined && raw.version !== 1)
    throw new Error("目前只支持 version: 1 的练习乐谱。");
  if (
    !Array.isArray(raw.notes) ||
    (!raw.notes.length && !raw.rests?.length) ||
    raw.notes.length > 10000
  )
    throw new Error("乐谱须包含 1–10000 个音符。");
  if (raw.instrument !== undefined && !['piano', 'guitar'].includes(raw.instrument))
    throw new Error('乐谱乐器须为 piano 或 guitar。');
  const tempo = number(raw.tempo ?? 90, "速度", 20, 300);
  const ts = raw.timeSignature ?? [4, 4];
  if (
    !Array.isArray(ts) ||
    ts.length !== 2 ||
    !Number.isInteger(ts[0]) ||
    ts[0] < 1 ||
    ts[0] > 16 ||
    ![1, 2, 4, 8, 16].includes(ts[1])
  )
    throw new Error("拍号格式无效，例如 [4,4] 或 [6,8]。");
  const keySignature = number(raw.keySignature ?? 0, "调号", -7, 7);
  if (!Number.isInteger(keySignature))
    throw new Error("调号必须为 -7 到 7 的整数（降号为负，升号为正）。");
  if (raw.mode !== undefined && !["major", "minor"].includes(raw.mode))
    throw new Error("调式必须为 major 或 minor。");
  const ids = new Set();
  const notes = synchronizeArpeggios(
    raw.notes
      .map((note, index) => {
        if (!note || typeof note !== "object")
          throw new Error(`第 ${index + 1} 个音符格式无效。`);
        const midi = number(
          note.midi,
          `第 ${index + 1} 个音符的 MIDI 音高`,
          21,
          108,
        );
        if (!Number.isInteger(midi))
          throw new Error("音高必须为 MIDI 整数。");
        const beat = number(note.beat, "起始拍", 0, 20000);
        const duration = number(note.duration, "时值", 1 / 1024, 256);
        if (beat + duration > 20000)
          throw new Error("乐谱总长度不能超过 20000 拍。");
        if (!["right", "left"].includes(note.hand))
          throw new Error("音符 hand 必须是 right 或 left。");
        let id = text(note.id, `n${index}`, 80);
        if (!id || ids.has(id)) id = `note-${index}-${ids.size}`;
        ids.add(id);
        return {
          id,
          beat,
          duration,
          midi,
          hand: note.hand,
          ...(note.voice !== undefined
            ? { voice: text(note.voice, "", 80) }
            : {}),
          velocity: number(
            note.velocity ??
              DYNAMICS.find((d) => d.id === note.dynamic)?.velocity ??
              (note.hand === "left" ? 0.55 : 0.78),
            "力度",
            0,
            1,
          ),
          ...normalizeNoteEffects(note),
          ...writtenNoteFields(note),
        };
      })
      .sort((a, b) => a.beat - b.beat || a.midi - b.midi),
  );
  validateTies(notes);
  validateOrnaments(notes, keySignature);
  const end = Math.max(
    0,
    ...notes.map((n) => n.beat + n.duration),
    ...(raw.rests || []).map((r) => Number(r.beat) + Number(r.duration)),
  );
  // Adding a rational tuplet to a row offset can differ from its total by a few
  // machine ulps. Preserve the declared bar length; real overruns still fail.
  const durationTolerance = Number.EPSILON * Math.max(1, end) * 8;
  const durationBeats =
    raw.durationBeats === undefined
      ? end
      : number(
          raw.durationBeats,
          "乐谱总拍数",
          Math.max(0, end - durationTolerance),
          20000,
        );
  const source = raw.source && typeof raw.source === "object" ? raw.source : {};
  const normalizedSource = {
    kind: text(source.kind, "imported", 40),
    label: text(source.label, "用户导入"),
  };
  if (source.url && /^https?:\/\//i.test(source.url))
    normalizedSource.url = text(source.url, "", 2000);
  if (source.license) normalizedSource.license = text(source.license, "", 300);
  if (
    source.reviewRequired === true ||
    /ai-draft|image-ai|audio-transcription/.test(source.kind || "")
  )
    normalizedSource.reviewRequired = true;
  let measureMap;
  if (raw.measureMap !== undefined) {
    if (
      !Array.isArray(raw.measureMap) ||
      !raw.measureMap.length ||
      raw.measureMap.length > 10000
    )
      throw new Error("小节时间轴无效。");
    let cursor = 0;
    measureMap = raw.measureMap.map((bar, index) => {
      const beat = number(bar.beat, "小节起拍", 0, 20000),
        duration = number(bar.duration, "小节时长", 1 / 1024, 256),
        meter = bar.timeSignature || ts;
      if (
        Math.abs(beat - cursor) > 1e-4 ||
        !Array.isArray(meter) ||
        meter.length !== 2 ||
        !Number.isInteger(meter[0]) ||
        meter[0] < 1 ||
        meter[0] > 16 ||
        ![1, 2, 4, 8, 16].includes(meter[1]) ||
        duration > (meter[0] * 4) / meter[1] + 1e-4
      )
        throw new Error("小节时间轴或拍号不连续。");
      cursor = beat + duration;
      return {
        ...bar,
        measure: index + 1,
        beat,
        duration,
        timeSignature: [...meter],
      };
    });
    if (Math.abs(cursor - durationBeats) > 1e-4)
      throw new Error("小节时间轴未覆盖完整乐谱。");
    for (const bar of measureMap)
      if (
        bar.keySignature !== undefined &&
        (!Number.isInteger(bar.keySignature) || Math.abs(bar.keySignature) > 7)
      )
        throw new Error("小节调号必须为 -7 到 7 的整数。");
  }
  return {
    ...(raw.notationInference !== undefined
      ? { notationInference: validateNotationInference(raw.notationInference) }
      : {}),
    ...(raw.rests !== undefined
      ? { rests: validateRests(raw.rests, durationBeats) }
      : {}),
    ...(raw.lineage ? { lineage: validateLineage(raw.lineage) } : {}),
    ...(raw.sourceNotation
      ? { sourceNotation: validateSourceNotation(raw.sourceNotation) }
      : {}),
    ...normalizeScoreTiming(raw, durationBeats),
    ...(measureMap ? { measureMap } : {}),
    ...(raw.mode ? { mode: raw.mode } : {}),
    ...(raw.instrument ? { instrument: raw.instrument } : {}),
    version: 1,
    id: text(raw.id, `score-${Date.now().toString(36)}`, 100),
    title: text(raw.title, "未命名乐谱"),
    composer: text(raw.composer, "未知"),
    tempo,
    ...(raw.tempoEvidence ? {tempoEvidence: validateTempoEvidence(raw.tempoEvidence)} : {}),
    timeSignature: [...ts],
    keySignature,
    source: normalizedSource,
    notes,
    durationBeats,
  };
}
