// Review editing in the full-PDF import dialog: note selection, moves with undo,
// manual crops, the notation preview and the full-page comparison workbench.
import {
  activeRegion,
  isRunning,
  pageInfo,
  scopeLocked,
  selectedRegions,
  setMessage,
} from "./full-score-import-context.js";
import {
  edited,
  errorText,
  finite,
  scopeLabel,
} from "./full-score-import-parts.js";
import {
  fullScoreRegionIssues,
  fullScoreReviewSummary,
} from "../lib/full-score-review.mjs";
import { normalizeCropRect } from "../lib/score-image-layout.mjs";
import { ensureRegionAsset, storeAsset } from "./full-score-import-pages.js";
import { validateScore } from "../lib/score.mjs";
import { mountRecognitionPageEditor } from "./recognition-page-editor.js";
import { refreshWrittenPitch } from "../lib/recognition-edit.mjs";
export function closePageWorkbench(ctx) {
  ctx.pageWorkbench?.destroy();
  ctx.pageWorkbench = null;
  ctx.pageWorkbenchHost?.remove();
  ctx.pageWorkbenchHost = null;
  ctx.restoreParentInert?.();
  ctx.restoreParentInert = null;
  if (!ctx.disposed) ctx.render();
}

export async function openPageWorkbench(ctx) {
  const { state, root, draft, assets, thumbnails } = ctx;
  if (isRunning(ctx) || state.importing || ctx.disposed) return;
  const regions = selectedRegions(ctx);
  for (const region of regions) await ensureRegionAsset(ctx, region);
  if (ctx.disposed) return;
  const modal = root.closest(".modal");
  const prior = modal?.inert;
  if (modal) {
    modal.inert = true;
    ctx.restoreParentInert = () => {
      modal.inert = prior;
    };
  }
  ctx.pageWorkbenchHost = document.createElement("div");
  document.body.append(ctx.pageWorkbenchHost);
  ctx.pageWorkbench = mountRecognitionPageEditor(ctx.pageWorkbenchHost, {
    draft,
    regions,
    assets,
    thumbnails,
    initialPage: state.activePage,
    onClose: () => closePageWorkbench(ctx),
  });
}

export function selectMapNote(ctx, noteId) {
  const { state, root } = ctx;
  state.selectedNoteId = noteId;
  state.selectedHeadIndex = null;
  for (const marker of root.querySelectorAll(
    "[data-source-note],[data-roll-note]",
  ))
    marker.classList.toggle(
      "is-selected",
      (marker.dataset.sourceNote || marker.dataset.rollNote) === noteId,
    );
  for (const row of root.querySelectorAll(".fsi-review-table tr"))
    row.classList.toggle(
      "is-selected",
      row.querySelector("[data-note-id]")?.dataset.noteId === noteId,
    );
  updatePositionMarker(ctx);
}

export function commitMove(ctx, region, note, values) {
  const { moveHistory, state } = ctx;
  const before = Object.fromEntries(
    Object.keys(values).map((key) => [key, note[key]]),
  );
  if (Object.keys(values).every((key) => values[key] === note[key]))
    return false;
  moveHistory.push({
    regionId: region.id,
    noteId: note.id,
    before,
    after: { ...values },
  });
  if (moveHistory.length > 100) moveHistory.shift();
  Object.assign(note, values);
  refreshWrittenPitch(region, note.id);
  edited(region);
  state.message = "已调整音符；可撤销，审核全部后保存到曲库。";
  ctx.render();
  return true;
}

export function undoMove(ctx) {
  const { moveHistory, draft, state } = ctx;
  const move = moveHistory.at(-1);
  if (!move) return;
  const region = draft.regions.find((r) => r.id === move.regionId);
  const note = region?.notes?.find((n) => n.id === move.noteId);
  if (
    !note ||
    !Object.keys(move.after).every((key) => note[key] === move.after[key])
  )
    throw new Error("此音符已被后续编辑或重新识别，无法撤销旧移动。");
  moveHistory.pop();
  Object.assign(note, move.before);
  edited(region);
  state.activeRegionId = region.id;
  state.activePage = region.page;
  state.stage = "review";
  state.selectedNoteId = note.id;
  state.message = "已撤销上次移动；请审核后保存。";
  ctx.render();
}

export function updatePositionMarker(ctx) {
  const { state, root } = ctx;
  const region = activeRegion(ctx),
    note =
      state.selectedHeadIndex !== null
        ? region?.sourceHeadAudit?.unmapped?.[state.selectedHeadIndex]
        : region?.notes?.find(
            (candidate) => candidate.id === state.selectedNoteId,
          ),
    marker = root.querySelector("[data-note-position]");
  if (!marker) return;
  marker.hidden =
    !note || !finite(note.x) || !finite(note.y) || state.stage !== "review";
  if (!marker.hidden) {
    marker.style.left = `${((note.x - region.rect.x) / region.rect.width) * 100}%`;
    marker.style.top = `${((note.y - region.rect.y) / region.rect.height) * 100}%`;
  }
}

export function updateReviewControls(ctx) {
  const { root, state, draft } = ctx;
  const region = activeRegion(ctx),
    confirm = root.querySelector('[data-action="confirm-region"]');
  if (confirm && region)
    confirm.disabled =
      isRunning(ctx) || fullScoreRegionIssues(region).length > 0;
  const button = root.querySelector('[data-action="import"]');
  if (button)
    button.disabled =
      state.importing ||
      isRunning(ctx) ||
      !state.scopeReviewed ||
      !fullScoreReviewSummary(draft).canImport;
}

export async function applyManualCrop(ctx, replace) {
  const { state, draft } = ctx;
  if (scopeLocked(ctx))
    throw new Error("任务开始后不可更改源范围；请先停止并重新选择范围。");
  const options = ctx.selector?.getSelectionOptions();
  if (options?.mode !== "manual" || !options.rect)
    throw new Error("请先切换“手动框选”，在原图上拖出完整的双手谱行。");
  const [image] = ctx.selector.getSelection();
  const page = pageInfo(ctx, state.activePage),
    current = activeRegion(ctx);
  if (replace && !current) throw new Error("请先选择要替换的谱行。");
  const rect = normalizeCropRect(image.region.rect, page.width, page.height);
  const region = replace
    ? current
    : {
        id: `p${page.page}-manual-${Date.now().toString(36)}-${++ctx.manualSequence}`,
        page: page.page,
        system: 1,
      };
  Object.assign(region, {
    rect,
    pageWidth: page.width,
    pageHeight: page.height,
    selected: true,
    excludeReason: "",
    status: "pending",
    notes: undefined,
    reviewed: false,
    assetId: region.id,
  });
  if (!replace) draft.regions.push(region);
  draft.regions
    .filter((candidate) => candidate.page === page.page)
    .sort((a, b) => a.rect.y - b.rect.y)
    .forEach((candidate, index) => {
      candidate.system = index + 1;
    });
  storeAsset(ctx, region, image);
  page.decision = "include";
  state.activeRegionId = region.id;
  state.selecting = false;
  setMessage(
    ctx,
    `${scopeLabel(region)}已${replace ? "替换" : "添加"}；请确认没有重叠或漏掉其他谱行。`,
  );
}

export async function preview(ctx) {
  const { root, state } = ctx;
  const region = activeRegion(ctx),
    element = root.querySelector("[data-notation-preview]");
  if (!region || !element) return;
  if (!region.notes?.length) {
    element.textContent = `此行为全休止谱行，共 ${region.durationBeats} 拍。请对照上方原图及休止表，确认两只手的全部休止时段。`;
    return;
  }
  try {
    const score = validateScore({
      ...region.score,
      durationBeats: region.durationBeats,
      notes: region.notes,
    });
    const { renderNotation } = await import("./notation.js");
    if (ctx.disposed || !element.isConnected) return;
    ctx.previewRenderer?.destroy();
    ctx.previewRenderer = renderNotation(element, score, {
      mode: "staff",
      autoScroll: false,
      onSeek: (beat) => {
        state.selectedNoteId =
          region.notes.find((note) => Math.abs(note.beat - beat) < 0.00001)
            ?.id || state.selectedNoteId;
        updatePositionMarker(ctx);
      },
    });
    ctx.previewRenderer.setBeat(0);
  } catch (error) {
    element.textContent = `当前修改尚不能排版：${errorText(error)}。请继续对照原图修正。`;
  }
}
