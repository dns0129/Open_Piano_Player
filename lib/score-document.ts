import { validatePracticeScore } from "./score-validation.mjs";
import { spellMidi } from "./pitch-spelling.mjs";
import {
  validateLineage,
  validateSourceNotation,
} from "./score-notation-data.ts";
import type {
  ScoreDocument,
  PracticeScore,
  WrittenNote,
  WrittenPitch,
  ScoreRest,
  SourceNotation,
  Meter,
} from "./score-types.ts";

export const SCORE_DOCUMENT_VERSION = 2;
function legacyIdentifier(raw: unknown): string {
  const text = JSON.stringify(raw);
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 3266489917);
  }
  return (
    "migrated-v1-" +
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}

function inferRests(
  notes: WrittenNote[],
  explicit: ScoreRest[],
  duration: number,
): ScoreRest[] {
  const groups = new Map<string, WrittenNote[]>();
  for (const n of notes) {
    const key = n.staff + ":" + n.voice;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }
  const rests = [...explicit];
  for (const [key, group] of groups) {
    const first = group[0],
      intervals = [
        ...group,
        ...explicit.filter(
          (r) => r.staff === first.staff && r.voice === first.voice,
        ),
      ]
        .map((n) => ({ start: n.beat, end: n.beat + n.duration }))
        .sort((a, b) => a.start - b.start);
    let cursor = 0,
      index = 0;
    const add = (end: number) => {
      if (end - cursor > 1e-7)
        rests.push({
          id: "inferred-rest-" + key.replace(":", "-") + "-" + index++,
          beat: cursor,
          duration: end - cursor,
          staff: first.staff,
          voice: first.voice,
          hand: first.hand,
          provenance: "inferred",
        });
    };
    for (const span of intervals) {
      add(span.start);
      cursor = Math.max(cursor, span.end);
    }
    add(duration);
  }
  return rests.sort((a, b) => a.beat - b.beat || a.staff - b.staff);
}

function documentFromPractice(
  score: PracticeScore,
  notation?: SourceNotation,
): ScoreDocument {
  const inferred = new Set<string>(score.notationInference || []);
  const notes: WrittenNote[] = score.notes.map((n) => {
    let pitch = n.pitch;
    if (!pitch) {
      const key =
        score.measureMap
          ?.filter((b) => b.beat <= n.beat && b.keySignature !== undefined)
          .at(-1)?.keySignature ?? score.keySignature;
      const spelling = spellMidi(n.midi, key);
      pitch = {
        step: spelling.letter as WrittenPitch["step"],
        alter: spelling.accidental,
        octave: spelling.octave,
        provenance: "inferred",
      };
    }
    if (!n.pitch) inferred.add("pitch");
    if (!n.staff) inferred.add("staff");
    if (!n.voice) inferred.add("voice");
    const sourcePositions =
      n.sourcePositions ||
      notation?.notes
        .filter((p) => p.noteId === n.id)
        .map((p) => ({
          page: p.page as number,
          system: p.system as number,
          x: p.x as number,
          y: p.y as number,
        }));
    return {
      ...n,
      staff: n.staff || (n.hand === "left" ? 2 : 1),
      voice: n.voice || "1",
      pitch,
      ...(sourcePositions?.length ? { sourcePositions } : {}),
    };
  });
  const explicit = (score.rests || []).filter(
    (r) => r.provenance !== "inferred",
  );
  const rests = inferRests(notes, explicit, score.durationBeats);
  if (rests.some((r) => r.provenance === "inferred")) inferred.add("rests");
  const measureMap =
    score.measureMap ||
    Array.from(
      {
        length: Math.ceil(
          score.durationBeats /
            ((score.timeSignature[0] * 4) / score.timeSignature[1]),
        ),
      },
      (_, i) => {
        const length = (score.timeSignature[0] * 4) / score.timeSignature[1],
          beat = i * length;
        return {
          measure: i + 1,
          beat,
          duration: Math.min(length, score.durationBeats - beat),
          timeSignature: [...score.timeSignature] as Meter,
        };
      },
    );
  const { notationInference, ...base } = score;
  return {
    ...base,
    schema: "qinban.score",
    version: 2,
    notes,
    rests,
    measureMap,
    lineage: score.lineage || { originalId: score.id },
    ...(notation ? { sourceNotation: notation } : {}),
    migration: { fromVersion: 1, inferred: [...inferred].sort() },
  };
}

/** V1 contains sounding pitches, not authoritative spellings. Never claim that
 * inferred rests, voices or enharmonic spellings were recovered from the source.
 * Source files are not rewritten by this pure migration.
 */
export function migrateScoreV1(
  input: unknown,
  options: { sourceNotation?: unknown } = {},
): ScoreDocument {
  const raw = input as Record<string, unknown>;
  if (!raw || (raw.version !== undefined && raw.version !== 1))
    throw new Error("迁移输入必须是 v1 乐谱。");
  const score = validatePracticeScore(
    raw.id === undefined || raw.id === ""
      ? { ...raw, id: legacyIdentifier(raw) }
      : raw,
  ) as PracticeScore;
  const notation =
    options.sourceNotation !== undefined
      ? validateSourceNotation(options.sourceNotation)
      : score.sourceNotation;
  return documentFromPractice(score, notation);
}

export function validateScoreDocument(input: unknown): ScoreDocument {
  const raw = input as Record<string, unknown>;
  if (!raw || raw.version !== 2 || raw.schema !== "qinban.score")
    throw new Error("不支持的乐谱文档版本或 schema。");
  if (typeof raw.id !== "string" || !raw.id || raw.id.length > 100)
    throw new Error("v2 文档须有稳定的乐谱 ID。");
  if (
    !Array.isArray(raw.notes) ||
    raw.notes.some((n) => !n.pitch || !n.staff || !n.voice) ||
    !Array.isArray(raw.rests)
  )
    throw new Error("v2 乐谱须明确保存音名、谱表、声部和休止列表。");
  if (
    raw.notes.some((n) => typeof n.id !== "string" || !n.id) ||
    new Set(raw.notes.map((n) => n.id)).size !== raw.notes.length
  )
    throw new Error("v2 音符 ID 缺失或重复。");
  const score = validatePracticeScore({ ...raw, version: 1 }) as PracticeScore;
  const document = documentFromPractice(score, score.sourceNotation);
  document.lineage = validateLineage(raw.lineage);
  if (raw.migration !== undefined) {
    const migration = raw.migration as Record<string, unknown>;
    if (
      migration.fromVersion !== 1 ||
      !Array.isArray(migration.inferred) ||
      migration.inferred.some(
        (x) => !["pitch", "staff", "voice", "rests"].includes(x),
      )
    )
      throw new Error("迁移来源标记无效。");
    document.migration = {
      fromVersion: 1,
      inferred: [...migration.inferred] as string[],
    };
  } else delete document.migration;
  return document;
}

export function readScoreDocument(
  input: unknown,
  options: { sourceNotation?: unknown } = {},
): ScoreDocument {
  const raw = input as Record<string, unknown>;
  const document =
    raw?.version === 2
      ? validateScoreDocument(input)
      : migrateScoreV1(input, options);
  if (options.sourceNotation !== undefined)
    document.sourceNotation = validateSourceNotation(options.sourceNotation);
  return document;
}

/** Compatibility projection for existing VexFlow/editor/transport callers.
 * Written metadata remains attached; no reconstruction from performance events.
 */
export function toPracticeScore(input: ScoreDocument): PracticeScore {
  const doc = validateScoreDocument(input);
  const { schema, migration, ...rest } = doc;
  return { ...rest, version: 1, notationInference: migration?.inferred || [] };
}
