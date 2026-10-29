// User input in the full-PDF import dialog: the data-action click table and
// the change/input handlers for scope, metadata and per-row review fields.
import { midiName } from "../lib/score.mjs";
import {
  refreshWrittenPitch,
  removeWrittenEvent,
} from "../lib/recognition-edit.mjs";
import { sourcePoint } from "../lib/recognition-review-actions.mjs";
import { applyWrittenEvidenceInput } from "./recognition-written-editor.js";
import { edited, errorText, numberValue } from "./full-score-import-parts.js";
import {
  activeRegion,
  pageInfo,
  requireApi,
  selectedRegions,
  setMessage,
} from "./full-score-import-context.js";
import {
  applySnapshot,
  approveAll,
  cancel,
  confirmRegion,
  retryEnlargedRegion,
  retryFailed,
  retryRegion,
  startRecognition,
} from "./full-score-import-jobs.js";
import { importReviewed, importUnreviewed } from "./full-score-import-save.js";
import {
  applyManualCrop,
  commitMove,
  openPageWorkbench,
  preview,
  selectMapNote,
  undoMove,
  updateReviewControls,
} from "./full-score-import-review.js";

/** Actions ignored while a request is in flight or the score is being saved. */
export const BUSY_BLOCKED_ACTIONS = new Set([
  "assess-source",
  "diagnose-source",
  "apply-revision",
  "undo-revision",
  "approve-all",
  "retry-failed",
  "import-draft",
  "undo-move",
  "add-note",
  "delete-note",
  "add-rest",
  "delete-rest",
  "clear-ties",
  "clear-internal-ties",
  "confirm-region",
  "retry-region",
  "retry-enlarged",
  "import",
  "add-crop",
  "replace-crop",
  "reset",
]);

const DIAGNOSIS_METHODS = {
  "assess-source": "assessRegion",
  "diagnose-source": "diagnoseRegion",
  "apply-revision": "applyRevision",
  "undo-revision": "undoRevision",
};

/** Source assessment, independent diagnosis and revision apply/undo for a row. */
async function runDiagnosisStep(ctx, kind) {
  const { state } = ctx;
  const region = activeRegion(ctx);
  const remote = state.job?.regions?.find((r) => r.id === region?.id);
  if (!remote || region.dirty)
    throw new Error("请先保存当前人工编辑，再继续诊断。");
  const method = DIAGNOSIS_METHODS[kind];
  const input =
    kind === "diagnose-source"
      ? { confirmed: true }
      : kind === "apply-revision"
        ? { confirmed: true, proposalId: remote.diagnosis?.id }
        : kind === "undo-revision"
          ? {
              revisionId: remote.revisionHistory
                ?.filter((h) => !h.undoneAt)
                .at(-1)?.id,
            }
          : {};
  state.busy = true;
  state.message =
    kind === "assess-source"
      ? "识谱智能体正在评估原谱疑点…"
      : kind === "diagnose-source"
        ? "已确认移交；独立诊断智能体正在准备方案，不会自动修改乐谱…"
        : "正在保存修订操作…";
  ctx.render();
  try {
    applySnapshot(
      ctx,
      await requireApi(ctx, method)(state.job.id, region.id, input),
    );
    state.message =
      kind === "assess-source"
        ? "概率与证据已更新；可确认移交独立诊断。"
        : kind === "diagnose-source"
          ? "诊断已完成，请查看修改前后差异并决定是否接受。"
          : kind === "apply-revision"
            ? "修订已应用并保留原版本；请对照检查此行后确认。"
            : "已撤销修订并恢复原版本。";
  } finally {
    state.busy = false;
    if (!ctx.disposed) ctx.render();
  }
}

/** Stops the job and returns every row to an unrecognized, editable scope. */
async function resetScope(ctx) {
  const { draft, state, remoteSignatures } = ctx;
  await cancel(ctx);
  state.job = null;
  state.progress = null;
  state.stage = "scope";
  draft.regions.forEach((region) => {
    region.status = "pending";
    region.reviewed = false;
    region.dirty = false;
    region.notes = undefined;
  });
  remoteSignatures.clear();
  state.message = "可重新选择页面与谱行；旧任务已停止。";
  ctx.render();
}

function showNextUnreviewed(ctx) {
  const { state } = ctx;
  const regions = selectedRegions(ctx),
    currentIndex = regions.findIndex(
      (region) => region.id === state.activeRegionId,
    ),
    next = [
      ...regions.slice(currentIndex + 1),
      ...regions.slice(0, currentIndex + 1),
    ].find((region) => !region.reviewed && region.notes);
  if (next) {
    state.activePage = next.page;
    state.activeRegionId = next.id;
    state.selectedNoteId = next.notes[0]?.id || "";
    state.selectedHeadIndex = null;
    state.stage = "review";
    ctx.render();
  } else
    setMessage(
      ctx,
      "当前没有已完成识别且待审核的谱行；请等待剩余任务或重试失败谱行。",
    );
}

/** One handler per `data-action`, called with the context and the clicked element. */
export const clickActions = {
  close: async (ctx) => {
    const { onClose } = ctx;
    await cancel(ctx);
    onClose();
  },
  page: (ctx, action) => {
    const { draft, state } = ctx;
    state.activePage = Number(action.dataset.page);
    state.activeRegionId =
      draft.regions.find(
        (region) => region.page === state.activePage && region.selected,
      )?.id || "";
    state.selecting = false;
    ctx.render();
  },
  region: (ctx, action) => {
    const { draft, state } = ctx;
    state.selectedHeadIndex = null;
    const region = draft.regions.find(
      (candidate) => candidate.id === action.dataset.regionId,
    );
    state.activeRegionId = region.id;
    state.activePage = region.page;
    state.stage = region.notes ? "review" : "scope";
    state.selectedNoteId = region.notes?.[0]?.id || "";
    state.selecting = false;
    ctx.render();
  },
  scope: (ctx) => {
    const { state } = ctx;
    state.stage = "scope";
    state.selecting = false;
    ctx.render();
  },
  review: (ctx) => openPageWorkbench(ctx),
  "select-crop": (ctx) => {
    const { state } = ctx;
    state.selecting = true;
    state.stage = "scope";
    ctx.render();
  },
  "add-crop": (ctx) => applyManualCrop(ctx, false),
  "replace-crop": (ctx) => applyManualCrop(ctx, true),
  start: (ctx) => startRecognition(ctx),
  cancel: (ctx) => cancel(ctx),
  "page-workbench": (ctx) => openPageWorkbench(ctx),
  "approve-all": (ctx) => approveAll(ctx),
  "retry-failed": (ctx) => retryFailed(ctx),
  "retry-region": (ctx) => retryRegion(ctx),
  "retry-enlarged": (ctx) => retryEnlargedRegion(ctx),
  reset: (ctx) => resetScope(ctx),
  "select-note": (ctx, action) => {
    const { state } = ctx;
    state.selectedHeadIndex = null;
    state.selectedNoteId = action.dataset.noteId;
    ctx.render();
  },
  "source-head": (ctx, action) => {
    const { state } = ctx;
    state.selectedHeadIndex = Number(action.dataset.headIndex);
    state.selectedNoteId = "";
    ctx.render();
  },
  "add-note": (ctx) => {
    const { state } = ctx;
    state.selectedHeadIndex = null;
    const region = activeRegion(ctx);
    if (!region?.notes) return;
    const note = {
      id: `manual-${Date.now().toString(36)}-${++ctx.manualSequence}`,
      midi: 60,
      beat: 0,
      duration: 0.25,
      hand: "right",
      voice: "right-1",
      velocity: 0.75,
      x: null,
      y: null,
    };
    region.notes.push(note);
    state.selectedNoteId = note.id;
    edited(region);
    ctx.render();
  },
  "delete-note": (ctx, action) => {
    const region = activeRegion(ctx);
    removeWrittenEvent(region, "note", action.dataset.noteId);
    region.notes = region.notes.filter(
      (note) => note.id !== action.dataset.noteId,
    );
    edited(region);
    ctx.render();
  },
  "add-rest": (ctx) => {
    const region = activeRegion(ctx);
    region.rests ||= [];
    region.rests.push({
      beat: 0,
      duration: 0.5,
      hand: "left",
      voice: "left-1",
    });
    edited(region);
    ctx.render();
  },
  "delete-rest": (ctx, action) => {
    const region = activeRegion(ctx);
    removeWrittenEvent(
      region,
      "rest",
      region.rests[Number(action.dataset.restIndex)]?.id,
    );
    region.rests.splice(Number(action.dataset.restIndex), 1);
    edited(region);
    ctx.render();
  },
  "clear-ties": (ctx) => {
    const region = activeRegion(ctx);
    region.continuity = { tieIn: [], tieOut: [] };
    edited(region);
    ctx.render();
  },
  "clear-internal-ties": (ctx) => {
    const region = activeRegion(ctx);
    region.internalTies = [];
    edited(region);
    ctx.render();
  },
  "assess-source": (ctx) => runDiagnosisStep(ctx, "assess-source"),
  "diagnose-source": (ctx) => runDiagnosisStep(ctx, "diagnose-source"),
  "apply-revision": (ctx) => runDiagnosisStep(ctx, "apply-revision"),
  "undo-revision": (ctx) => runDiagnosisStep(ctx, "undo-revision"),
  "confirm-region": (ctx) => confirmRegion(ctx),
  "next-unreviewed": (ctx) => showNextUnreviewed(ctx),
  "undo-move": (ctx) => undoMove(ctx),
  preview: (ctx) => preview(ctx),
  import: (ctx) => importReviewed(ctx),
  "import-draft": (ctx) => importUnreviewed(ctx),
};

function handleClick(ctx, event) {
  const { state } = ctx;
  const image = event.target.closest("[data-original-image]");
  if (image && state.stage === "review" && !state.busy && !state.importing) {
    const region = activeRegion(ctx);
    const note = region?.notes?.find(
      (candidate) => candidate.id === state.selectedNoteId,
    );
    const point =
      region &&
      sourcePoint(
        region.rect,
        image.getBoundingClientRect(),
        event.clientX,
        event.clientY,
      );
    if (note && point) commitMove(ctx, region, note, point);
  }
  const mapNote = event.target.closest("[data-source-note],[data-roll-note]");
  if (mapNote)
    selectMapNote(ctx, mapNote.dataset.sourceNote || mapNote.dataset.rollNote);
  const action = event.target.closest("[data-action]");
  if (!action || action.disabled) return;
  const name = action.dataset.action;
  if ((state.busy || state.importing) && BUSY_BLOCKED_ACTIONS.has(name)) return;
  const run = Object.hasOwn(clickActions, name) ? clickActions[name] : null;
  void (async () => {
    state.error = "";
    await run?.(ctx, action);
  })().catch((error) => {
    if (!ctx.disposed) {
      state.busy = false;
      state.error = errorText(error);
      ctx.render();
    }
  });
}

function handleChange(ctx, event) {
  const { draft, state } = ctx;
  const input = event.target;
  if (input.dataset.meta) {
    if (input.dataset.meta === "title") draft.title = input.value;
    else if (input.dataset.meta === "timeSignature") {
      const match = input.value.trim().match(/^(\d{1,2})\s*\/\s*(1|2|4|8|16)$/);
      draft.timeSignature = match
        ? [Number(match[1]), Number(match[2])]
        : undefined;
      if (input.value && !match) state.error = "拍号应类似 2/4 或 6/8。";
    } else draft[input.dataset.meta] = numberValue(input.value);
  } else if (input.hasAttribute("data-retry-engine"))
    state.retryEngine = input.value;
  else if (input.hasAttribute("data-retry-enlarge"))
    state.retryEnlarge = input.checked;
  else if (input.hasAttribute("data-piano-confirmed"))
    state.pianoConfirmed = input.checked;
  else if (input.hasAttribute("data-tie-reviewed")) {
    const region = activeRegion(ctx);
    region.tieAudit.reviewed = input.checked;
    edited(region);
  } else if (input.hasAttribute("data-head-reviewed")) {
    const region = activeRegion(ctx);
    region.sourceHeadAudit.reviewed = input.checked;
    edited(region);
  } else if (input.hasAttribute("data-scope-reviewed"))
    state.scopeReviewed = input.checked;
  else if (input.hasAttribute("data-recognition-engine") && !state.job)
    state.engine = input.value === "deepseek" ? "deepseek" : "pi";
  else if (input.hasAttribute("data-risk-review") && !state.job)
    state.riskReview = input.checked;
  else if (input.hasAttribute("data-auto-continue"))
    state.autoContinue = input.checked;
  else if (input.dataset.pageDecision) {
    const page = pageInfo(ctx, Number(input.dataset.pageDecision));
    page.decision = ["include", "pending"].includes(input.value)
      ? input.value
      : "exclude";
    page.excludeReason = page.decision === "exclude" ? input.value : "";
  } else if (input.dataset.regionSelected) {
    const region = draft.regions.find(
      (candidate) => candidate.id === input.dataset.regionSelected,
    );
    region.selected = input.checked;
    region.excludeReason = "";
  } else if (input.dataset.regionReason)
    draft.regions.find(
      (region) => region.id === input.dataset.regionReason,
    ).excludeReason = input.value;
  else if (input.hasAttribute("data-region-duration")) {
    const region = activeRegion(ctx);
    region.durationBeats = numberValue(input.value);
    edited(region);
  } else if (input.hasAttribute("data-region-coverage")) {
    const region = activeRegion(ctx);
    region.coverageComplete = input.checked;
    edited(region);
  } else if (input.hasAttribute("data-measure-durations")) {
    const region = activeRegion(ctx);
    const values = input.value
      .trim()
      .split(/[,，\s]+/)
      .filter(Boolean)
      .map(Number);
    region.coverage ||= {};
    region.coverage.measureDurations = values;
    region.coverage.measureCount = values.length;
    edited(region);
  } else if (input.dataset.tieDirection) {
    const region = activeRegion(ctx);
    region.continuity ||= { tieIn: [], tieOut: [] };
    const direction = input.dataset.tieDirection;
    region.continuity[direction] = (region.continuity[direction] || []).filter(
      (tie) => tie?.noteId !== input.dataset.noteId,
    );
    if (input.checked)
      region.continuity[direction].push({ noteId: input.dataset.noteId });
    edited(region);
  } else if (input.hasAttribute("data-internal-tie")) {
    const region = activeRegion(ctx);
    region.internalTies = (region.internalTies || []).filter(
      (tie) =>
        tie.fromNoteId !== input.dataset.fromNote ||
        tie.toNoteId !== input.dataset.toNote,
    );
    if (input.checked)
      region.internalTies.push({
        fromNoteId: input.dataset.fromNote,
        toNoteId: input.dataset.toNote,
      });
    edited(region);
  } else if (input.hasAttribute("data-continuity")) {
    try {
      const value = JSON.parse(input.value);
      if (!Array.isArray(value.tieIn) || !Array.isArray(value.tieOut))
        throw new Error();
      const region = activeRegion(ctx);
      region.continuity = value;
      edited(region);
    } catch {
      state.error = "跨行延音须为含 tieIn、tieOut 两个数组的 JSON。";
    }
  }
  ctx.render();
}

function handleInput(ctx, event) {
  const { draft } = ctx;
  const input = event.target;
  if (input.dataset.meta) {
    if (input.dataset.meta === "title") draft.title = input.value;
    else if (input.dataset.meta === "tempo")
      draft.tempo = numberValue(input.value);
    else if (input.dataset.meta === "timeSignature") {
      const match = input.value.trim().match(/^(\d{1,2})\s*\/\s*(1|2|4|8|16)$/);
      if (match) draft.timeSignature = [Number(match[1]), Number(match[2])];
      else if (!input.value) draft.timeSignature = undefined;
    } else if (input.dataset.meta === "keySignature")
      draft.keySignature = numberValue(input.value);
    return;
  }
  if (input.hasAttribute("data-region-duration")) {
    const region = activeRegion(ctx);
    region.durationBeats = numberValue(input.value);
    edited(region);
    updateReviewControls(ctx);
    return;
  }
  if (input.hasAttribute("data-measure-durations")) {
    const region = activeRegion(ctx);
    const values = input.value
      .trim()
      .split(/[,，\s]+/)
      .filter(Boolean)
      .map(Number);
    region.coverage ||= {};
    region.coverage.measureDurations = values;
    region.coverage.measureCount = values.length;
    edited(region);
    updateReviewControls(ctx);
    return;
  }
  if (input.dataset.restField) {
    const region = activeRegion(ctx),
      rest = region?.rests?.[Number(input.dataset.restIndex)];
    if (rest) {
      rest[input.dataset.restField] = ["hand", "voice"].includes(
        input.dataset.restField,
      )
        ? input.value
        : numberValue(input.value);
      edited(region);
      updateReviewControls(ctx);
    }
    return;
  }
  if (input.dataset.writtenKind) {
    const region = activeRegion(ctx);
    if (region && applyWrittenEvidenceInput(input, region)) {
      edited(region);
      updateReviewControls(ctx);
    }
    return;
  }
  if (!input.dataset.noteField) return;
  const region = activeRegion(ctx),
    note = region?.notes?.find(
      (candidate) => candidate.id === input.dataset.noteId,
    );
  if (!note) return;
  note[input.dataset.noteField] = ["hand", "voice"].includes(
    input.dataset.noteField,
  )
    ? input.value
    : numberValue(input.value);
  if (input.dataset.noteField === "midi") refreshWrittenPitch(region, note.id);
  edited(region);
  const name = input.parentElement.querySelector(".fsi-note-name");
  if (name)
    name.textContent =
      Number.isInteger(note.midi) && note.midi >= 21 && note.midi <= 108
        ? midiName(note.midi)
        : "";
  updateReviewControls(ctx);
}

export function bindActions(ctx) {
  const { root } = ctx;
  root.addEventListener("click", (event) => handleClick(ctx, event));
  root.addEventListener("change", (event) => handleChange(ctx, event));
  root.addEventListener("input", (event) => handleInput(ctx, event));
}
