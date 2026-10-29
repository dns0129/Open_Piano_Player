import "./score-workbench.css";

import { applyWrittenEvidenceInput } from "./recognition-written-editor.js";
import {
  refreshWrittenPitch,
  removeWrittenEvent,
} from "../lib/recognition-edit.mjs";
import "./full-score-import.css";
import { sourcePoint } from "../lib/recognition-review-actions.mjs";

import { assetURL } from "../lib/asset-url.mjs";

import { midiName } from "../lib/score.mjs";
import { validateFullScorePdfUpload } from "../lib/full-score-review.mjs";

import { scanPage } from "./full-score-import-pages.js";
import { bindNoteDrag } from "./full-score-import-drag.js";
import { render } from "./full-score-import-view.js";
import {
  applySnapshot,
  approveAll,
  cancel,
  confirmRegion,
  poll,
  restoreScope,
  retryEnlargedRegion,
  retryFailed,
  retryRegion,
  startRecognition,
} from "./full-score-import-jobs.js";
import { importReviewed, importUnreviewed } from "./full-score-import-save.js";
import {
  activeRegion,
  createImportContext,
  pageInfo,
  requireApi,
  selectedRegions,
  setMessage,
} from "./full-score-import-context.js";
import {
  edited,
  errorText,
  numberValue,
  unwrap,
} from "./full-score-import-parts.js";
import {
  applyManualCrop,
  closePageWorkbench,
  commitMove,
  openPageWorkbench,
  preview,
  selectMapNote,
  undoMove,
  updateReviewControls,
} from "./full-score-import-review.js";

/**
 * Generic PDF -> all-page scope -> asynchronous recognition -> per-line review.
 * Returns immediately so a modal can clean up while PDF loading is in flight.
 * `api` is injected; this module never reads credentials or calls a model itself.
 */
export function mountFullScoreImport(
  host,
  {
    file,
    source = {},
    resumeJob = null,
    onImport = () => {},
    onClose = () => {},
    api = {},
  } = {},
) {
  const root = document.createElement("section");
  root.className = "full-score-import";
  host.replaceChildren(root);
  const ctx = createImportContext({
    root,
    file,
    source,
    resumeJob,
    onImport,
    onClose,
    api,
  });
  const { draft, state, assets, thumbnails, remoteSignatures } = ctx;
  source = ctx.source;
  ctx.render = () => render(ctx);
  root.addEventListener("click", (event) => {
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
      selectMapNote(
        ctx,
        mapNote.dataset.sourceNote || mapNote.dataset.rollNote,
      );
    const action = event.target.closest("[data-action]");
    if (!action || action.disabled) return;
    if (
      (state.busy || state.importing) &&
      [
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
      ].includes(action.dataset.action)
    )
      return;
    void (async () => {
      state.error = "";
      switch (action.dataset.action) {
        case "close":
          await cancel(ctx);
          onClose();
          break;
        case "page":
          state.activePage = Number(action.dataset.page);
          state.activeRegionId =
            draft.regions.find(
              (region) => region.page === state.activePage && region.selected,
            )?.id || "";
          state.selecting = false;
          ctx.render();
          break;
        case "region": {
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
          break;
        }
        case "scope":
          state.stage = "scope";
          state.selecting = false;
          ctx.render();
          break;
        case "review":
          await openPageWorkbench(ctx);
          break;
        case "select-crop":
          state.selecting = true;
          state.stage = "scope";
          ctx.render();
          break;
        case "add-crop":
          await applyManualCrop(ctx, false);
          break;
        case "replace-crop":
          await applyManualCrop(ctx, true);
          break;
        case "start":
          await startRecognition(ctx);
          break;
        case "cancel":
          await cancel(ctx);
          break;
        case "page-workbench":
          await openPageWorkbench(ctx);
          break;
        case "approve-all":
          await approveAll(ctx);
          break;
        case "retry-failed":
          await retryFailed(ctx);
          break;
        case "retry-region":
          await retryRegion(ctx);
          break;
        case "retry-enlarged":
          await retryEnlargedRegion(ctx);
          break;
        case "reset":
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
          break;
        case "select-note":
          state.selectedHeadIndex = null;
          state.selectedNoteId = action.dataset.noteId;
          ctx.render();
          break;
        case "source-head":
          state.selectedHeadIndex = Number(action.dataset.headIndex);
          state.selectedNoteId = "";
          ctx.render();
          break;
        case "add-note": {
          state.selectedHeadIndex = null;
          const region = activeRegion(ctx);
          if (!region?.notes) break;
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
          break;
        }
        case "delete-note": {
          const region = activeRegion(ctx);
          removeWrittenEvent(region, "note", action.dataset.noteId);
          region.notes = region.notes.filter(
            (note) => note.id !== action.dataset.noteId,
          );
          edited(region);
          ctx.render();
          break;
        }
        case "add-rest": {
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
          break;
        }
        case "delete-rest": {
          const region = activeRegion(ctx);
          removeWrittenEvent(
            region,
            "rest",
            region.rests[Number(action.dataset.restIndex)]?.id,
          );
          region.rests.splice(Number(action.dataset.restIndex), 1);
          edited(region);
          ctx.render();
          break;
        }
        case "clear-ties": {
          const region = activeRegion(ctx);
          region.continuity = { tieIn: [], tieOut: [] };
          edited(region);
          ctx.render();
          break;
        }
        case "clear-internal-ties": {
          const region = activeRegion(ctx);
          region.internalTies = [];
          edited(region);
          ctx.render();
          break;
        }
        case "assess-source":
        case "diagnose-source":
        case "apply-revision":
        case "undo-revision": {
          const region = activeRegion(ctx);
          const remote = state.job?.regions?.find((r) => r.id === region?.id);
          if (!remote || region.dirty)
            throw new Error("请先保存当前人工编辑，再继续诊断。");
          const kind = action.dataset.action;
          const method = {
            "assess-source": "assessRegion",
            "diagnose-source": "diagnoseRegion",
            "apply-revision": "applyRevision",
            "undo-revision": "undoRevision",
          }[kind];
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
          break;
        }
        case "confirm-region":
          await confirmRegion(ctx);
          break;
        case "next-unreviewed": {
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
          break;
        }
        case "undo-move":
          undoMove(ctx);
          break;
        case "preview":
          await preview(ctx);
          break;
        case "import":
          await importReviewed(ctx);
          break;
        case "import-draft":
          await importUnreviewed(ctx);
          break;
      }
    })().catch((error) => {
      if (!ctx.disposed) {
        state.busy = false;
        state.error = errorText(error);
        ctx.render();
      }
    });
  });

  root.addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.meta) {
      if (input.dataset.meta === "title") draft.title = input.value;
      else if (input.dataset.meta === "timeSignature") {
        const match = input.value
          .trim()
          .match(/^(\d{1,2})\s*\/\s*(1|2|4|8|16)$/);
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
      region.continuity[direction] = (
        region.continuity[direction] || []
      ).filter((tie) => tie?.noteId !== input.dataset.noteId);
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
  });

  root.addEventListener("input", (event) => {
    const input = event.target;
    if (input.dataset.meta) {
      if (input.dataset.meta === "title") draft.title = input.value;
      else if (input.dataset.meta === "tempo")
        draft.tempo = numberValue(input.value);
      else if (input.dataset.meta === "timeSignature") {
        const match = input.value
          .trim()
          .match(/^(\d{1,2})\s*\/\s*(1|2|4|8|16)$/);
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
    if (input.dataset.noteField === "midi")
      refreshWrittenPitch(region, note.id);
    edited(region);
    const name = input.parentElement.querySelector(".fsi-note-name");
    if (name)
      name.textContent =
        Number.isInteger(note.midi) && note.midi >= 21 && note.midi <= 108
          ? midiName(note.midi)
          : "";
    updateReviewControls(ctx);
  });
  bindNoteDrag(ctx);

  async function initialize() {
    await validateFullScorePdfUpload(file);
    let saved = unwrap(resumeJob);
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      const hash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      state.pdfHash = hash;
      if (saved?.originalPdf?.sha256 && hash !== saved.originalPdf.sha256)
        throw new Error(
          "恢复任务的 PDF 与原始文件不一致，不能复用先前音符与坐标。",
        );
    }
    const [pdfjs, capabilities] = await Promise.all([
      import("pdfjs-dist"),
      typeof api.getCapabilities === "function"
        ? Promise.resolve(api.getCapabilities()).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (ctx.disposed) return;
    state.capabilities = capabilities;
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
    ctx.documentTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      wasmUrl: assetURL("/pdfjs/wasm/"),
      standardFontDataUrl: assetURL("/pdfjs/standard_fonts/"),
      cMapUrl: assetURL("/pdfjs/cmaps/"),
      cMapPacked: true,
    });
    ctx.pdf = await ctx.documentTask.promise;
    if (ctx.disposed) return;
    if (ctx.pdf.numPages > 200)
      throw new Error(
        "PDF 超过 200 页，请先提取明确的练习范围。不会截取前 200 页冒充全谱。",
      );
    draft.totalPages = ctx.pdf.numPages;
    ctx.render();
    for (let pageNumber = 1; pageNumber <= ctx.pdf.numPages; pageNumber++) {
      if (ctx.disposed || ctx.scanCancelled) break;
      if (!(await scanPage(ctx, pageNumber))) break;
      state.scannedPages = pageNumber;
      state.message = `正在逐页检查：第 ${pageNumber} / ${ctx.pdf.numPages} 页，发现 ${draft.regions.length} 个谱行候选。`;
      ctx.render();
    }
    state.scanning = false;
    if (!ctx.scanCancelled && saved?.id) {
      restoreScope(ctx, saved);
      applySnapshot(ctx, saved);
      state.message = saved.reusedExactPdf
        ? `已复用相同 PDF 的已校对全谱：${draft.totalPages} 页、${draft.regions.length} 行，本次新增模型调用 0 次。原图与校对结果保留，请确认范围后导入。`
        : `已恢复保存的任务：${draft.totalPages} 页、${draft.regions.length} 行。原图、已识别结果与审核状态保留；请再次核对范围确认。`;
      if (saved.status === "running") poll(ctx);
      ctx.render();
      return;
    }
    state.message = ctx.scanCancelled
      ? "扫描已停止；未检查页面会阻止完整导入。请关闭并重新上传继续。"
      : `全部 ${ctx.pdf.numPages} 页已检查。请排除封面/空白页，核对每个谱行是否完整包含两只手。`;
    ctx.render();
  }

  function destroy() {
    if (ctx.disposed) return;
    ctx.disposed = true;
    closePageWorkbench(ctx);
    ctx.scanCancelled = true;
    ctx.operationCancelled = true;
    ctx.operationController.abort();
    clearTimeout(ctx.pollTimer);
    if (state.job?.status === "running" && typeof api.cancelJob === "function")
      void api.cancelJob(state.job.id).catch(() => {});
    ctx.selector?.destroy();
    ctx.previewRenderer?.destroy();
    ctx.activePrepared?.destroy();
    for (const asset of assets.values()) URL.revokeObjectURL(asset.url);
    for (const thumbnail of thumbnails.values())
      URL.revokeObjectURL(thumbnail.url);
    assets.clear();
    thumbnails.clear();
    void ctx.documentTask?.destroy();
    root.remove();
  }

  ctx.render();
  const ready = initialize().catch((error) => {
    if (!ctx.disposed) {
      state.scanning = false;
      state.error = errorText(error);
      state.message = "PDF 尚未完成检查，无法启动完整识谱。";
      ctx.render();
    }
  });
  return { ready, destroy, cancel: () => cancel(ctx), getDraft: () => draft };
}
