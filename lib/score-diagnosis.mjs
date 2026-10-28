import { createHash } from "node:crypto";
import { validateRegionResult } from "./score-region.mjs";
import { normalizeSourceAssessment } from "./source-assessment.mjs";
import { decodeCompactRegion } from "./recognition-wire.mjs";
const fail = (message) =>
  Object.assign(new Error(message), {
    code: "INVALID_SCORE_REVISION",
    expose: true,
    status: 422,
  });
export const revisionBaseHash = (region, metadata = {}) => {
  const r = region.result;
  // A review-status/provenance update is not a musical edit. Musical content,
  // source mapping, audits and user annotations must still fence stale proposals.
  const content = r
    ? {
        score: r.score,
        rests: r.rests,
        positions: r.positions,
        coverage: r.coverage,
        continuity: r.continuity,
        internalTies: r.internalTies,
        sourceHeadAudit: r.sourceHeadAudit,
        tieAudit: r.tieAudit,
        warnings: r.warnings,
      }
    : null;
  return createHash("sha256")
    .update(
      JSON.stringify([
        region.image?.sha256,
        region.rect,
        region.context,
        metadata,
        content,
      ]),
    )
    .digest("hex");
};
export function prepareScoreRevision(raw, region, metadata) {
  const assessment = normalizeSourceAssessment(raw?.assessment);
  if (
    !assessment ||
    typeof raw?.explanation !== "string" ||
    !Array.isArray(raw.edits) ||
    raw.edits.length > 64
  )
    throw fail("诊断结果不完整，未生成修订。");
  let candidate = structuredClone(region.result);
  const changes = [];
  if (!candidate && raw.sourceTranscription) {
    const read = decodeCompactRegion(raw.sourceTranscription, {
      region,
      metadata,
      pass: "recognize",
    });
    candidate = {
      ...read,
      ...validateRegionResult(read, region, metadata),
      engine: raw.engine || "diagnosis",
      model: raw.model || null,
      reasoningEffort: raw.reasoningEffort || null,
      promptVersion: "diagnosis-transcription-v1",
      requestAudit: raw.requestAudit || [],
      usage: raw.usage || null,
    };
    changes.push({
      op: "transcribe",
      before: null,
      after: {
        kind: "transcription",
        noteCount: candidate.score.notes.length,
        measureCount: candidate.coverage.measureCount,
      },
      reason:
        "独立智能体重新读取当前完整谱行；修订另列，接受前不覆盖失败记录。",
    });
  }
  if (raw.edits.length && !candidate)
    throw fail("此行尚无完整转写，且诊断未给出完整复读；不能应用修订。");
  const number = (v, min, max) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  for (const edit of raw.edits) {
    if (!edit || typeof edit.reason !== "string" || !edit.reason.trim())
      throw fail("每项修订须说明依据。");
    const fields = {};
    for (const key of ["beat", "duration", "midi", "hand", "voice"])
      if (edit[key] !== undefined) fields[key] = edit[key];
    if (
      fields.beat !== undefined &&
      !number(fields.beat, 0, candidate.score.durationBeats)
    )
      throw fail("修订拍位无效。");
    if (
      fields.duration !== undefined &&
      !number(fields.duration, 1 / 1024, 256)
    )
      throw fail("修订时值无效。");
    if (
      fields.midi !== undefined &&
      (!Number.isInteger(fields.midi) || !number(fields.midi, 21, 108))
    )
      throw fail("修订音高无效。");
    if (fields.hand !== undefined && !["right", "left"].includes(fields.hand))
      throw fail("修订手别无效。");
    if (
      fields.voice !== undefined &&
      (typeof fields.voice !== "string" ||
        !fields.voice ||
        fields.voice.length > 50)
    )
      throw fail("修订声部无效。");
    let before, after;
    if (["add-rest", "update-rest", "remove-rest"].includes(edit.op)) {
      if (fields.midi !== undefined) throw fail("休止不能包含音高。");
      candidate.rests ||= [];
      if (edit.op === "add-rest") {
        after = { ...fields };
        candidate.rests.push(after);
      } else {
        if (!Number.isInteger(edit.index) || !candidate.rests[edit.index])
          throw fail("休止索引已失效。");
        before = structuredClone(candidate.rests[edit.index]);
        if (edit.op === "remove-rest") candidate.rests.splice(edit.index, 1);
        else {
          after = { ...before, ...fields };
          candidate.rests[edit.index] = after;
        }
      }
    } else if (["add-note", "update-note", "remove-note"].includes(edit.op)) {
      if (edit.op === "add-note") {
        if (!number(edit.x, 0, 1) || !number(edit.y, 0, 1))
          throw fail("新增音符须标明原图音头位置。");
        const id = `revision-note-${candidate.score.notes.length}-${changes.length}`;
        if (candidate.score.notes.some((n) => n.id === id))
          throw fail("新增音符id冲突。");
        after = { id, velocity: 0.7, ...fields };
        candidate.score.notes.push(after);
        candidate.positions.push({
          noteId: id,
          x: region.rect.x + edit.x * region.rect.width,
          y: region.rect.y + edit.y * region.rect.height,
          coordinateSpace: "page",
        });
      } else {
        const index = candidate.score.notes.findIndex(
          (n) => n.id === edit.noteId,
        );
        if (index < 0) throw fail("修订音符id已失效。");
        before = structuredClone(candidate.score.notes[index]);
        if (edit.op === "remove-note") {
          candidate.score.notes.splice(index, 1);
          candidate.positions = candidate.positions.filter(
            (p) => p.noteId !== edit.noteId,
          );
        } else {
          after = { ...before, ...fields };
          candidate.score.notes[index] = after;
        }
      }
    } else throw fail("不支持的修订操作。");
    changes.push({
      op: edit.op,
      before: before || null,
      after: after || null,
      reason: edit.reason.slice(0, 600),
    });
  }
  let validated = null;
  if (candidate) {
    candidate.warnings = [
      ...(candidate.warnings || []),
      ...(changes.length
        ? ["人工修订候选：" + raw.explanation.slice(0, 240)]
        : []),
    ];
    validated = {
      ...candidate,
      ...validateRegionResult(candidate, region, metadata, {
        requirePositions: !candidate.positionlessSource,
      }),
    };
  }
  return {
    assessment,
    explanation: raw.explanation.slice(0, 2000),
    remainingDoubts: Array.isArray(raw.remainingDoubts)
      ? raw.remainingDoubts
          .filter((s) => typeof s === "string")
          .slice(0, 12)
          .map((s) => s.slice(0, 600))
      : [],
    changes,
    candidate: validated,
    canApply: changes.length > 0 && validated?.checks.passed === true,
  };
}
