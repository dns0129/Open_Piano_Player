import "./score-workbench.css";
import { mountRecognitionPageEditor } from "./recognition-page-editor.js";
import {
  writtenEvidenceEditor,
  applyWrittenEvidenceInput,
} from "./recognition-written-editor.js";
import {
  refreshWrittenPitch,
  removeWrittenEvent,
} from "../lib/recognition-edit.mjs";
import "./full-score-import.css";
import {
  prepareBulkReview,
  sourcePoint,
  rollRange,
  rollMove,
} from "../lib/recognition-review-actions.mjs";
import { scoreDiagnosisCard } from "./score-diagnosis-card.js";
import { assetURL } from "../lib/asset-url.mjs";
import { mountScoreImageSelector } from "./score-image.js";
import { normalizeCropRect } from "../lib/score-image-layout.mjs";
import { validateScore, midiName } from "../lib/score.mjs";
import {
  validateFullScorePdfUpload,
  normalizeFullScoreRegionResult,
  fullScoreRegionIssues,
  fullScoreScopeIssues,
  fullScoreReviewSummary,
  assembleFullScoreReview,
} from "../lib/full-score-review.mjs";
import { escapeHTML } from "./html.js";
import {
  cropRegion,
  ensurePrepared,
  ensureRegionAsset,
  preparePage,
  scanPage,
  storeAsset,
} from "./full-score-import-pages.js";
import {
  activeRegion,
  assertAlive,
  beginOperation,
  cancelLateResponse,
  capability,
  createImportContext,
  isRunning,
  pageInfo,
  requireApi,
  retryEngine,
  scopeLocked,
  selectedRegions,
  setMessage,
} from "./full-score-import-context.js";
import {
  blobImage,
  canvasBlob,
  edited,
  errorText,
  internalTieCandidates,
  omrReviewMarkup,
  scopeLabel,
  unwrap,
} from "./full-score-import-parts.js";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const numberValue = (value) => (value === "" ? undefined : Number(value));
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
  const { draft, state, assets, thumbnails, remoteSignatures, moveHistory } =
    ctx;
  source = ctx.source;
  ctx.render = render;
  function closePageWorkbench() {
    ctx.pageWorkbench?.destroy();
    ctx.pageWorkbench = null;
    ctx.pageWorkbenchHost?.remove();
    ctx.pageWorkbenchHost = null;
    ctx.restoreParentInert?.();
    ctx.restoreParentInert = null;
    if (!ctx.disposed) render();
  }
  async function openPageWorkbench() {
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
      onClose: closePageWorkbench,
    });
  }
  function render() {
    if (ctx.disposed) return;
    const sameRegion = root.dataset.viewRegion === state.activeRegionId;
    const scrollPositions = sameRegion
      ? [
          ".fsi-original",
          ".fsi-roll-scroll",
          ".fsi-review-table",
          ".fsi-pages",
        ].map((selector) => {
          const element = root.querySelector(selector);
          return {
            selector,
            top: element?.scrollTop || 0,
            left: element?.scrollLeft || 0,
          };
        })
      : [];
    const jobSettingsOpen =
      root.dataset.jobId === (state.job?.id || "") &&
      root.querySelector(".fsi-job-settings")?.open;
    root.dataset.jobId = state.job?.id || "";
    const noteDetailsOpen =
      sameRegion && root.querySelector(".fsi-note-details")?.open;
    const writtenOpen =
      sameRegion && root.querySelector(".fsi-written-evidence")?.open;
    root.dataset.viewRegion = state.activeRegionId;
    const focus = root.contains(document.activeElement)
      ? {
          noteId: document.activeElement.dataset.noteId,
          field: document.activeElement.dataset.noteField,
          meta: document.activeElement.dataset.meta,
          restField: document.activeElement.dataset.restField,
          restIndex: document.activeElement.dataset.restIndex,
          start: document.activeElement.selectionStart,
        }
      : null;
    const advancedOpen = root.querySelector(".fsi-advanced")?.open;
    const epoch = ++ctx.renderEpoch;
    ctx.selector?.destroy();
    ctx.selector = null;
    ctx.previewRenderer?.destroy();
    ctx.previewRenderer = null;
    const summary = fullScoreReviewSummary(draft),
      regions = draft.regions.filter(
        (region) => region.page === state.activePage,
      ),
      current = activeRegion(ctx);
    const failedCount = (state.job?.regions || []).filter(
      (region) =>
        region.status === "failed" ||
        (region.status !== "confirmed" &&
          region.result?.checks?.passed === false),
    ).length;
    const completed = summary.reviewedCount;
    const processed = state.progress
      ? (state.progress.needsReview || 0) +
        (state.progress.confirmed || 0) +
        (state.progress.failed || 0)
      : summary.recognizedCount;
    const total = state.progress?.total || selectedRegions(ctx).length;
    const pageCards = draft.pages
      .map(
        (page) =>
          `<div class="fsi-page${page.page === state.activePage ? " is-current" : ""}"><button type="button" data-action="page" data-page="${page.page}" aria-label="查看 PDF 第 ${page.page} 页"><img src="${escapeHTML(thumbnails.get(page.page)?.url || "")}" alt="第 ${page.page} 页原始 PDF 缩略图"><strong>第 ${page.page} 页</strong> · ${draft.regions.filter((region) => region.page === page.page).length} 行</button><select aria-label="第 ${page.page} 页的处理方式" data-page-decision="${page.page}" ${scopeLocked(ctx) ? "disabled" : ""}><option value="pending" ${page.decision === "pending" ? "selected" : ""}>需决定识别或排除</option><option value="include" ${page.decision === "include" ? "selected" : ""}>识别此页</option><option value="not-score" ${page.decision === "exclude" && page.excludeReason === "not-score" ? "selected" : ""}>封面/空白/非谱面</option><option value="music" ${page.decision === "exclude" && page.excludeReason === "music" ? "selected" : ""}>跳过谱页（仅片段）</option></select></div>`,
      )
      .join("");
    const regionRows = regions
      .map(
        (region) =>
          `<div class="fsi-region${region.id === state.activeRegionId ? " is-current" : ""}"><input type="checkbox" data-region-selected="${escapeHTML(region.id)}" aria-label="识别${scopeLabel(region)}" ${region.selected ? "checked" : ""} ${scopeLocked(ctx) ? "disabled" : ""}><button type="button" data-action="region" data-region-id="${escapeHTML(region.id)}">第 ${region.system} 行<small>${escapeHTML(region.reviewed ? "已审核" : region.status === "failed" ? `失败：${region.error || "请重试"}` : region.status === "complete" ? `${region.notes.length} 音符 · 待校对` : region.status === "running" ? "识别中" : "等待识别")}</small></button>${!region.selected ? `<select data-region-reason="${escapeHTML(region.id)}" aria-label="第 ${region.system} 行排除原因" ${scopeLocked(ctx) ? "disabled" : ""}><option value="" ${!region.excludeReason ? "selected" : ""}>请选择排除原因</option><option value="not-score" ${region.excludeReason === "not-score" ? "selected" : ""}>非谱面/误检</option><option value="music" ${region.excludeReason === "music" ? "selected" : ""}>跳过音乐（仅片段）</option></select>` : ""}</div>`,
      )
      .join("");
    const notesTable = current?.notes?.length
      ? `<div class="fsi-review-table"><table><thead><tr><th>定位原图</th><th>MIDI 音高</th><th>起始拍</th><th>时值</th><th>手别</th><th>声部</th><th>删除</th></tr></thead><tbody>${current.notes.map((note, index) => `<tr class="${note.id === state.selectedNoteId ? "is-selected" : ""}"><td><button type="button" data-action="select-note" data-note-id="${escapeHTML(note.id)}" aria-label="选中第 ${index + 1} 个音符并在原图定位">${index + 1} · <span class="fsi-note-position${finite(note.x) && finite(note.y) ? " is-mapped" : ""}">${finite(note.x) && finite(note.y) ? "已有位置" : "需点图定位"}</span></button></td><td><input type="number" min="21" max="108" step="1" value="${escapeHTML(note.midi)}" data-note-field="midi" data-note-id="${escapeHTML(note.id)}" aria-label="第 ${index + 1} 个音符 MIDI 音高"><span class="fsi-note-name">${Number.isInteger(note.midi) && note.midi >= 21 && note.midi <= 108 ? midiName(note.midi) : ""}</span></td><td><input type="number" min="0" step="0.000001" value="${escapeHTML(note.beat)}" data-note-field="beat" data-note-id="${escapeHTML(note.id)}" aria-label="第 ${index + 1} 个音符起始拍"></td><td><input type="number" min="0.0009765625" max="256" step="0.000001" value="${escapeHTML(note.duration)}" data-note-field="duration" data-note-id="${escapeHTML(note.id)}" aria-label="第 ${index + 1} 个音符时值"></td><td><select data-note-field="hand" data-note-id="${escapeHTML(note.id)}" aria-label="第 ${index + 1} 个音符手别"><option value="right" ${note.hand === "right" ? "selected" : ""}>右手</option><option value="left" ${note.hand === "left" ? "selected" : ""}>左手</option></select></td><td><input data-note-field="voice" data-note-id="${escapeHTML(note.id)}" value="${escapeHTML(note.voice || `${note.hand}-1`)}" aria-label="第 ${index + 1} 个音符声部"></td><td><button type="button" class="fsi-danger" data-action="delete-note" data-note-id="${escapeHTML(note.id)}" aria-label="删除第 ${index + 1} 个音符">删</button></td></tr>`).join("")}</tbody></table></div>`
      : "";
    const reviewAdvanced = current?.notes
      ? `<details class="fsi-advanced"><summary>校正每小节拍数、休止与跨行延音</summary><p class="fsi-muted">弱起须填写实际拍数，例如 1, 4, 4；没有发声的时段也要以休止明确解释。独立声部请用不同 voice。</p><label>每小节实际拍数 <input data-measure-durations aria-label="当前谱行各小节实际拍数" value="${escapeHTML(current.coverage?.measureDurations?.join(", ") || "")}" placeholder="例如 1, 4, 4"></label><div class="fsi-review-table"><table><thead><tr><th>休止起始拍</th><th>时值</th><th>手别</th><th>声部</th><th>删除</th></tr></thead><tbody>${(current.rests || []).map((rest, index) => `<tr><td><input type="number" min="0" step="0.000001" data-rest-field="beat" data-rest-index="${index}" value="${escapeHTML(rest.beat)}" aria-label="第 ${index + 1} 个休止起始拍"></td><td><input type="number" min="0.000001" step="0.000001" data-rest-field="duration" data-rest-index="${index}" value="${escapeHTML(rest.duration)}" aria-label="第 ${index + 1} 个休止时值"></td><td><select data-rest-field="hand" data-rest-index="${index}" aria-label="第 ${index + 1} 个休止手别"><option value="right" ${rest.hand === "right" ? "selected" : ""}>右手</option><option value="left" ${rest.hand === "left" ? "selected" : ""}>左手</option></select></td><td><input data-rest-field="voice" data-rest-index="${index}" value="${escapeHTML(rest.voice || `${rest.hand}-1`)}" aria-label="第 ${index + 1} 个休止声部"></td><td><button type="button" data-action="delete-rest" data-rest-index="${index}" aria-label="删除第 ${index + 1} 个休止">删</button></td></tr>`).join("")}</tbody></table></div><div class="fsi-actions"><button type="button" data-action="add-rest">新增休止</button></div><p class="fsi-muted">行内延音：仅当原谱同音之间有延音线才勾选；重复击键不要勾选。全部音头位置会保留。</p><div class="fsi-review-table">${
          internalTieCandidates(current)
            .map(
              (pair) =>
                `<label class="fsi-actions"><input type="checkbox" data-internal-tie data-from-note="${escapeHTML(pair.fromNoteId)}" data-to-note="${escapeHTML(pair.toNoteId)}" ${pair.checked ? "checked" : ""}>${pair.from && pair.to ? `${escapeHTML(midiName(pair.from.midi))} · ${pair.from.hand === "right" ? "右手" : "左手"} · 第 ${escapeHTML(pair.from.beat)} → ${escapeHTML(pair.to.beat)} 拍` : "已失效的延音，请取消或清除"}</label>`,
            )
            .join("") || '<p class="fsi-muted">当前没有时间相接的同音候选。</p>'
        }</div><button type="button" data-action="clear-internal-ties">清除本行行内延音</button><p class="fsi-muted">跨行延音：只有本行开头或末尾的音符可以连接相邻行。勾选后不会重新触发同一持续音。</p><div class="fsi-review-table">${current.notes
          .filter(
            (note) =>
              Math.abs(note.beat) < 0.00001 ||
              Math.abs(note.beat + note.duration - current.durationBeats) <
                0.00001,
          )
          .map(
            (note) =>
              `<div class="fsi-actions"><span>${escapeHTML(Number.isInteger(note.midi) && note.midi >= 21 && note.midi <= 108 ? midiName(note.midi) : "待修正音符")} · ${note.hand === "right" ? "右手" : "左手"} · 第 ${escapeHTML(note.beat)} 拍</span>${Math.abs(note.beat) < 0.00001 ? `<label><input type="checkbox" data-tie-direction="tieIn" data-note-id="${escapeHTML(note.id)}" ${current.continuity?.tieIn?.some((tie) => tie?.noteId === note.id) ? "checked" : ""}> 从上一行延续</label>` : ""}${Math.abs(note.beat + note.duration - current.durationBeats) < 0.00001 ? `<label><input type="checkbox" data-tie-direction="tieOut" data-note-id="${escapeHTML(note.id)}" ${current.continuity?.tieOut?.some((tie) => tie?.noteId === note.id) ? "checked" : ""}> 延续到下一行</label>` : ""}</div>`,
          )
          .join(
            "",
          )}</div><button type="button" data-action="clear-ties">清除本行跨行延音</button></details>`
      : "";
    const currentIssues =
      current?.status === "complete" ? fullScoreRegionIssues(current) : [];
    const originalURL =
      current && state.stage === "review"
        ? assets.get(current.id)?.url
        : thumbnails.get(state.activePage)?.url;
    root.innerHTML = `<div class="fsi-top"><div><h2>完整 PDF 识谱与校对</h2><p class="fsi-muted">识别后可一键审核全部；只需打开有问题的谱行，用拖拽校准位置、音高和拍点。</p></div><button type="button" data-action="close" aria-label="关闭完整 PDF 识谱">关闭</button></div>
      <div class="fsi-meta"><label>乐谱名称<input data-meta="title" value="${escapeHTML(draft.title)}" maxlength="180" aria-label="完整乐谱名称"></label><label>速度 BPM<input data-meta="tempo" type="number" min="20" max="300" placeholder="自动识别" value="${draft.tempo ?? ""}" aria-label="全谱速度"></label><label>拍号<input data-meta="timeSignature" placeholder="例如 2/4" value="${draft.timeSignature?.join("/") || ""}" aria-label="全谱拍号"></label><label>调号<select data-meta="keySignature" aria-label="全谱调号"><option value="" ${draft.keySignature === undefined ? "selected" : ""}>自动识别</option>${Array.from(
        { length: 15 },
        (_, index) => index - 7,
      )
        .map(
          (value) =>
            `<option value="${value}" ${draft.keySignature === value ? "selected" : ""}>${value === 0 ? "无升降号" : value > 0 ? `${value} 个升号` : `${-value} 个降号`}</option>`,
        )
        .join("")}</select></label></div>
      <details class="fsi-job-settings" ${!state.job || state.job.status === "running" || !state.pianoConfirmed ? "open" : ""}><summary>识别设置与任务控制</summary><div class="fsi-flags"><label><input type="checkbox" data-piano-confirmed ${state.pianoConfirmed ? "checked" : ""} ${state.scanning || isRunning(ctx) ? "disabled" : ""}> 我已对照谱头/来源，确认这是钢琴双手五线谱</label></div>
      <div class="fsi-actions"><label>识谱服务商 <select data-recognition-engine ${state.job || isRunning(ctx) || state.scanning ? "disabled" : ""}><option value="pi" ${state.engine === "pi" ? "selected" : ""}>Pi Agent / ChatGPT</option><option value="deepseek" ${state.engine === "deepseek" ? "selected" : ""}>DeepSeek（实验 / 第二意见）· API 计费</option></select></label><strong data-recognition-model>${state.engine === "deepseek" ? "DeepSeek Flash" : "GPT-6.1 Sol"} · ${state.job?.recognition?.reasoningEffort === "low" ? "low" : "high"}</strong><label><input type="checkbox" data-auto-continue ${state.autoContinue ? "checked" : ""} ${state.scanning || isRunning(ctx) ? "disabled" : ""}> 自动继续全部谱行</label><label><input type="checkbox" data-risk-review ${state.riskReview ? "checked" : ""} ${state.job || isRunning(ctx) ? "disabled" : ""}> 复读高风险谱行（实验，可能增加一次调用）</label><button type="button" class="fsi-primary" data-action="start" ${state.scanning || state.busy || state.job?.status === "running" || state.importing ? "disabled" : ""}>${state.job ? "继续识别剩余谱行" : "一键识别全部选中谱行"}</button><button type="button" data-action="cancel" ${!state.scanning && !isRunning(ctx) ? "disabled" : ""}>停止任务</button>${state.job ? '<button type="button" data-action="reset" ' + (isRunning(ctx) ? "disabled" : "") + ">重新选择范围</button>" : ""}</div>
      <p class="fsi-muted">${selectedRegions(ctx).length} 个谱行全新识别基线为 ${state.engine === "deepseek" ? "DeepSeek Flash" : "GPT-6.1 Sol"} ${state.job?.recognition?.reasoningEffort === "low" ? "low" : "high"} ${state.job?.estimate?.modelCalls ?? state.job?.estimate?.piCalls ?? selectedRegions(ctx).length} 次（每行仅首次识别）；重试另计，最多 100 行并行，可随时停止。相同原图复用已校对结果，中断保留已完成转写。${state.job?.calls ? `${state.job?.reuse?.hits ? ` 已复用 ${state.job.reuse.hits} 行，节省 ${state.job.reuse.savedCalls} 次模型调用。` : ""} ${state.job.reusedExactPdf ? "该任务历史" : "本任务"}已发起 ${state.engine === "deepseek" ? "DeepSeek" : "Pi"} 识别 ${state.job.calls.recognition || 0} 次。` : ""}</p>
      </details>${state.job ? `<div class="fsi-batch-bar"><div class="fsi-actions"><button type="button" class="fsi-primary" data-action="page-workbench" ${isRunning(ctx) || state.importing || state.scanning || !selectedRegions(ctx).some((r) => r.notes?.length) ? "disabled" : ""}>整页左右对照修改</button><button type="button" class="fsi-primary" data-action="approve-all" ${isRunning(ctx) || state.importing || state.scanning || !state.pianoConfirmed || !selectedRegions(ctx).length || selectedRegions(ctx).some((r) => r.status !== "complete") ? "disabled" : ""}>一键审核全部</button><strong>${summary.reviewedCount} / ${summary.selectedCount} 行已审核</strong><details class="fsi-retry-options"><summary>重试选项（${failedCount} 行失败）</summary><div class="fsi-actions"><label>重识别模型 <select data-retry-engine ${isRunning(ctx) || state.importing ? "disabled" : ""}><option value="current" ${state.retryEngine === "current" ? "selected" : ""}>保持当前模型</option><option value="pi" ${state.retryEngine === "pi" ? "selected" : ""}>GPT-6.1 Sol · high</option><option value="deepseek" ${state.retryEngine === "deepseek" ? "selected" : ""}>DeepSeek Flash（实验）</option></select></label><label><input type="checkbox" data-retry-enlarge ${state.retryEnlarge ? "checked" : ""} ${isRunning(ctx) || state.importing ? "disabled" : ""}> 放大原图识别（最多 2 倍）</label><button type="button" data-action="retry-failed" ${isRunning(ctx) || state.importing || !failedCount ? "disabled" : ""}>一键重新识别失败谱行（${failedCount}）</button></div><p class="fsi-muted">重识别保留成功结果；额外模型调用另计。放大不会增加原图细节。</p></details></div><p class="fsi-muted">一键审核会确认全部所选谱行、覆盖范围及识别疑点，无需逐行勾选；审核后仍可编辑，再点击“保存到曲库”。结构错误会定位到对应谱行。</p></div>` : ""}
      <div class="fsi-status" role="status" aria-live="polite"><strong>${escapeHTML(state.message)}</strong><p>已检查 ${state.scannedPages} / ${draft.totalPages || "…"} 页 · ${processed} / ${total} 行已处理 · ${completed} 行已审核${state.busy && state.uploaded ? ` · 已上传 ${state.uploaded} 行` : ""}</p><progress max="${state.scanning ? draft.totalPages || 1 : total || 1}" value="${state.scanning ? state.scannedPages : processed}"></progress></div>
      ${state.error ? `<div class="fsi-error" role="alert">${escapeHTML(state.error)}</div>` : ""}
      <div class="fsi-workspace"><aside class="fsi-pages" aria-label="PDF 所有页面">${pageCards || '<p class="fsi-muted">正在读取页面…</p>'}</aside><section class="fsi-view" aria-label="当前谱行校对"><div class="fsi-actions"><h3>第 ${state.activePage} 页${current ? ` · 第 ${current.system} 行` : ""}</h3><button type="button" data-action="scope" ${state.scanning || state.busy ? "disabled" : ""}>页面与范围</button><button type="button" data-action="review" ${!current?.notes ? "disabled" : ""}>整页对照修改</button>${!scopeLocked(ctx) ? '<button type="button" data-action="select-crop">手动调整/补充谱行</button>' : ""}</div>
      ${pageInfo(ctx, state.activePage)?.assessment ? `<p class="fsi-muted">${escapeHTML(pageInfo(ctx, state.activePage).assessment.message)}</p>` : ""}
      <div class="fsi-regions" aria-label="当前页面全部谱行">${regionRows || '<p class="fsi-muted" style="padding:9px">此页未找到可用的双手谱行。请明确排除封面，或手动框选清晰双谱表。</p>'}</div>
      ${state.selecting ? '<div class="fsi-selector"><p>请切换“手动框选”，拖出完整的一行双手谱。添加/替换都必须包含谱号、上下加线及全部小节。</p><div data-crop-selector></div><div class="fsi-actions"><button type="button" data-action="add-crop">添加为新谱行</button><button type="button" data-action="replace-crop" ' + (!current ? "disabled" : "") + ">替换当前谱行范围</button></div></div>" : `<div class="fsi-original${state.stage === "review" && current?.notes ? " can-locate" : ""}" data-original-frame><div class="fsi-source-canvas">${originalURL ? `<img src="${escapeHTML(originalURL)}" alt="${state.stage === "review" && current ? `${scopeLabel(current)}原始钢琴谱裁切；选中音符后可点击校准位置` : `PDF 第 ${state.activePage} 页原始谱面`}" data-original-image>${sourceMarkers(current)}` : '<p class="fsi-muted" style="padding:20px">正在准备原谱预览…</p>'}<span class="fsi-position" data-note-position hidden></span></div></div>`}
      ${
        state.stage === "review" && current?.notes
          ? `<p class="fsi-muted">${current.positionlessSource ? "此结果未提供逐音原图坐标，可选中音符后点击原图补充定位。" : "拖动原图上的编号圆点，校准跟谱位置；也可在下表选中音符后点击音头定位。"}拍点以此行第 0 拍为起点。</p><div class="fsi-actions"><button type="button" data-action="undo-move" ${!moveHistory.length || state.busy || state.importing ? "disabled" : ""}>撤销上次拖拽／定位</button></div>${noteRoll(current)}<details class="fsi-note-details"><summary>音符明细与精确修改（${current.notes.length} 音符）</summary><div class="fsi-actions"><label>本行总拍数（含休止） <input type="number" min="0.0009765625" step="0.000001" data-region-duration value="${escapeHTML(current.durationBeats ?? "")}" aria-label="当前谱行总拍数" style="width:100px"></label><button type="button" data-action="add-note">新增音符</button><button type="button" data-action="preview">更新转写谱面预览</button><button type="button" data-action="retry-region" ${isRunning(ctx) ? "disabled" : ""}>重新读取此行原图</button><button type="button" data-action="retry-enlarged" ${isRunning(ctx) || current.reviewed ? "disabled" : ""}>放大／换模型重识别此行</button></div>${notesTable}${writtenEvidenceEditor(current)}</details>${reviewAdvanced}${omrReviewMarkup(current)}<div class="fsi-mini-notation" data-notation-preview><p class="fsi-muted">点击“更新转写谱面预览”，与上方原始谱面对照。</p></div><label><input type="checkbox" data-region-coverage ${current.coverageComplete ? "checked" : ""}> 已确认本行的全部小节、左右手及末尾休止均已转写</label>${current.warnings?.length ? `<div class="fsi-warning">${current.warnings.map(escapeHTML).join("<br>")}</div>` : ""}${
              currentIssues.length
                ? `<ul class="fsi-checklist">${currentIssues
                    .slice(0, 8)
                    .map((issue) => `<li>${escapeHTML(issue.message)}</li>`)
                    .join("")}</ul>`
                : ""
            }<div class="fsi-actions"><button type="button" class="fsi-primary" data-action="confirm-region" ${isRunning(ctx) || currentIssues.length ? "disabled" : ""}>${current.reviewed ? "此行已审核；修改后需重新确认" : "仅审核当前行（可选）"}</button><button type="button" data-action="next-unreviewed">下一个待校对谱行</button></div>`
          : current?.status === "failed"
            ? `<div class="fsi-error">${escapeHTML(current.error || "此行识别失败，完整导入已被阻止。")}</div><button type="button" data-action="retry-region" ${isRunning(ctx) ? "disabled" : ""}>重试此行</button><button type="button" data-action="retry-enlarged" ${isRunning(ctx) ? "disabled" : ""}>放大原图后重试此行</button>`
            : ""
      }
      ${
        state.job && current
          ? scoreDiagnosisCard(
              state.job.regions?.find((r) => r.id === current.id),
              {
                busy: state.busy || isRunning(ctx) || state.importing,
                dirty: current.dirty,
              },
            )
          : ""
      }
      </section></div>
      <footer class="fsi-footer"><div><strong>${summary.reviewedCount} / ${summary.selectedCount} 行完成审核 · ${summary.noteCount} 音符</strong><p>${summary.musicExcluded ? "已排除含音乐的页面或谱行，导入名称会明确标注“所选谱段”。" : "可一键审核全部，也可单独审核当前行；修改过的谱行需要重新审核。"}</p>${!summary.canImport && !state.scanning ? `<p class="fsi-muted">${escapeHTML(summary.issues[0]?.message || "")}</p>` : ""}</div><label><input type="checkbox" data-scope-reviewed ${state.scopeReviewed ? "checked" : ""}> 我已确认全部页和谱行的处理范围，排除项均已检查</label><button type="button" class="fsi-primary" data-action="import" ${!summary.canImport || state.importing || isRunning(ctx) || !state.scopeReviewed ? "disabled" : ""}>${state.importing ? "正在保存…" : summary.musicExcluded ? "保存所选片段到曲库" : "保存到曲库"}</button>${state.job && state.job.regions.every((r) => r.result) ? `<button type="button" data-action="import-draft" ${state.importing || isRunning(ctx) || !state.scopeReviewed ? "disabled" : ""}>导入AI草稿（待校对）</button>` : ""}</footer>`;
    if (state.busy || state.importing)
      for (const input of root.querySelectorAll(
        "[data-note-field],[data-written-kind],[data-region-duration],[data-region-coverage],[data-rest-field],[data-measure-durations],[data-continuity],[data-tie-direction],[data-internal-tie],[data-head-reviewed],[data-tie-reviewed],[data-scope-reviewed],[data-source-note],[data-roll-note]",
      ))
        input.disabled = true;
    if (state.job)
      for (const input of root.querySelectorAll(
        '[data-meta="timeSignature"],[data-meta="keySignature"]',
      ))
        input.disabled = true;
    if (advancedOpen && root.querySelector(".fsi-advanced"))
      root.querySelector(".fsi-advanced").open = true;
    if (jobSettingsOpen && root.querySelector(".fsi-job-settings"))
      root.querySelector(".fsi-job-settings").open = true;
    if (noteDetailsOpen && root.querySelector(".fsi-note-details"))
      root.querySelector(".fsi-note-details").open = true;
    if (writtenOpen && root.querySelector(".fsi-written-evidence"))
      root.querySelector(".fsi-written-evidence").open = true;
    for (const { selector, top, left } of scrollPositions) {
      const element = root.querySelector(selector);
      if (element) {
        element.scrollTop = top;
        element.scrollLeft = left;
      }
    }
    if (focus) {
      const input =
        focus.noteId && focus.field
          ? [...root.querySelectorAll("[data-note-field]")].find(
              (element) =>
                element.dataset.noteId === focus.noteId &&
                element.dataset.noteField === focus.field,
            )
          : focus.meta
            ? [...root.querySelectorAll("[data-meta]")].find(
                (element) => element.dataset.meta === focus.meta,
              )
            : focus.restField
              ? [...root.querySelectorAll("[data-rest-field]")].find(
                  (element) =>
                    element.dataset.restField === focus.restField &&
                    element.dataset.restIndex === focus.restIndex,
                )
              : null;
      input?.focus();
      if (input?.type === "text" && finite(focus.start))
        input.setSelectionRange(focus.start, focus.start);
    }
    void renderActiveView(epoch).catch((error) => {
      if (!ctx.disposed && epoch === ctx.renderEpoch) {
        state.error = errorText(error);
        const alert = document.createElement("p");
        alert.className = "fsi-error";
        alert.setAttribute("role", "alert");
        alert.textContent = state.error;
        root.querySelector(".fsi-view")?.append(alert);
      }
    });
  }

  async function renderActiveView(epoch) {
    const region = activeRegion(ctx);
    if (state.selecting) {
      const prepared = await ensurePrepared(ctx, state.activePage);
      if (ctx.disposed || epoch !== ctx.renderEpoch) return;
      const wrapped = {
        ...prepared,
        getAssessment: (options) =>
          prepared.getAssessment({
            ...options,
            confirmedPiano: state.pianoConfirmed || options?.confirmedPiano,
          }),
        getSelection: (options) =>
          prepared.getSelection({
            ...options,
            confirmedPiano: state.pianoConfirmed || options?.confirmedPiano,
          }),
      };
      ctx.selector = mountScoreImageSelector(
        root.querySelector("[data-crop-selector]"),
        wrapped,
      );
    } else if (state.stage === "review" && region?.notes) {
      if (!assets.has(region.id)) await ensureRegionAsset(ctx, region);
      if (ctx.disposed || epoch !== ctx.renderEpoch) return;
      const image = root.querySelector("[data-original-image]");
      if (image) {
        image.addEventListener("load", updatePositionMarker, { once: true });
        if (image.src !== assets.get(region.id).url)
          image.src = assets.get(region.id).url;
      } else {
        render();
        return;
      }
      updatePositionMarker();
    }
  }

  function sourceMarkers(region) {
    if (state.stage !== "review" || !region?.notes) return "";
    const notes = region.notes
      .map((note, index) => {
        if (!finite(note.x) || !finite(note.y)) return "";
        return `<button type="button" class="fsi-source-note${note.id === state.selectedNoteId ? " is-selected" : ""}" data-source-note="${escapeHTML(note.id)}" style="left:${((note.x - region.rect.x) / region.rect.width) * 100}%;top:${((note.y - region.rect.y) / region.rect.height) * 100}%" aria-label="音符 ${index + 1} 原图位置，拖拽或方向键调整" title="${index + 1} · ${escapeHTML(midiName(note.midi))} · 拖拽校准原图位置">${index + 1}</button>`;
      })
      .join("");
    const rests = (region.rests || [])
      .flatMap((rest, index) =>
        (rest.sourcePositions || [])
          .filter((p) => finite(p.x) && finite(p.y))
          .map(
            (p) =>
              `<span class="fsi-source-note" data-source-rest="${escapeHTML(rest.id)}" style="pointer-events:none;background:#8a4b08;left:${((p.x - region.rect.x) / region.rect.width) * 100}%;top:${((p.y - region.rect.y) / region.rect.height) * 100}%" title="原谱休止 ${index + 1}，声部 ${escapeHTML(rest.voice)}，第 ${rest.beat} 拍" aria-label="原谱休止 ${index + 1}">休${index + 1}</span>`,
          ),
      )
      .join("");
    return notes + rests;
  }

  function noteRoll(region) {
    if (
      !region.notes.length ||
      !finite(region.durationBeats) ||
      region.durationBeats <= 0 ||
      region.notes.some(
        (n) => !finite(n.midi) || !finite(n.beat) || !finite(n.duration),
      )
    )
      return "";
    const range = rollRange(region),
      rows = range.max - range.min + 1;
    const width = Math.max(560, Math.min(3600, region.durationBeats * 52));
    const ticks = Math.min(80, Math.ceil(region.durationBeats));
    return `<div class="fsi-roll-heading"><strong>拖拽调整音高与拍点</strong><span class="fsi-muted">绿：右手 · 蓝：左手</span></div><p class="fsi-muted">上下每格一个半音，左右吸附到 1/4 拍（按住 Alt 精调到 1/16 拍）。方向键也可调整，Shift + 左右移动 1 拍。原图定位单独保留。</p><div class="fsi-roll-scroll"><div class="fsi-roll" data-note-roll style="width:${width}px;height:${rows * 20}px;--roll-beats:${region.durationBeats}">${Array.from({ length: ticks }, (_, i) => `<span class="fsi-roll-beat" style="left:${(i / region.durationBeats) * 100}%">${i} 拍</span>`).join("")}${region.notes.map((note, index) => `<button type="button" class="fsi-roll-note${note.hand === "left" ? " is-left" : ""}${note.id === state.selectedNoteId ? " is-selected" : ""}" data-roll-note="${escapeHTML(note.id)}" style="left:${(note.beat / region.durationBeats) * 100}%;top:${(range.max - note.midi) * 20}px;width:${(note.duration / region.durationBeats) * 100}%" aria-label="音符 ${index + 1} ${escapeHTML(midiName(note.midi))}，第 ${note.beat} 拍，拖拽或方向键调整" title="${index + 1} · ${escapeHTML(midiName(note.midi))} · ${note.beat} 拍">${index + 1} ${escapeHTML(midiName(note.midi))}</button>`).join("")}</div></div>`;
  }

  function selectMapNote(noteId) {
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
    updatePositionMarker();
  }

  function commitMove(region, note, values) {
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
    render();
    return true;
  }

  function undoMove() {
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
    render();
  }

  function updatePositionMarker() {
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

  function updateReviewControls() {
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

  async function applyManualCrop(replace) {
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

  function applySnapshot(response) {
    const snapshot = unwrap(response);
    if (!snapshot?.id) return;
    state.job = { ...state.job, ...snapshot };
    state.engine = snapshot.engine === "deepseek" ? "deepseek" : "pi";
    state.riskReview = snapshot.metadata?.recognitionPlan?.review === "risk";
    state.progress = snapshot.progress || state.progress;
    for (const remote of snapshot.regions || []) {
      const index = draft.regions.findIndex(
        (region) => region.id === remote.id,
      );
      if (index < 0) continue;
      let local = draft.regions[index];
      if (remote.result) {
        const signature = JSON.stringify(remote.result);
        if (remoteSignatures.get(remote.id) !== signature && !local.dirty) {
          local = normalizeFullScoreRegionResult(local, remote.result);
          draft.regions[index] = local;
          remoteSignatures.set(remote.id, signature);
          if (!draft.tempo && remote.result.score?.tempo)
            draft.tempo = remote.result.score.tempo;
          if (!draft.timeSignature && remote.result.score?.timeSignature)
            draft.timeSignature = [...remote.result.score.timeSignature];
          if (
            draft.keySignature === undefined &&
            finite(remote.result.score?.keySignature)
          )
            draft.keySignature = remote.result.score.keySignature;
        }
        if (
          remote.status === "confirmed" ||
          remote.result.reviewStatus === "confirmed"
        )
          local.reviewed = !local.dirty;
        local.status = "complete";
      } else if (remote.status === "failed") {
        delete local.notes;
        delete local.score;
        local.reviewed = false;
        remoteSignatures.delete(remote.id);
        local.status = "failed";
        local.error =
          typeof remote.error === "object"
            ? remote.error.message
            : remote.error || "识别失败，请重试。";
      } else if (["running", "queued", "pending"].includes(remote.status))
        local.status = remote.status === "running" ? "running" : "pending";
    }
    const firstReady = selectedRegions(ctx).find(
      (region) => region.notes && !region.reviewed,
    );
    if (firstReady && (!activeRegion(ctx)?.notes || state.stage === "scope")) {
      state.activePage = firstReady.page;
      state.activeRegionId = firstReady.id;
      state.selectedNoteId = firstReady.notes[0]?.id || "";
      state.stage = "review";
      state.selecting = false;
    }
    state.message =
      snapshot.status === "draft"
        ? "任务已创建，正在保存原谱，尚未开始识别。"
        : snapshot.status === "running"
          ? "正在逐行识别；已完成的谱行现在可以开始校对。"
          : snapshot.status === "paused"
            ? "任务已暂停；已识别结果保留，可校对或继续剩余谱行。"
            : snapshot.status === "failed"
              ? "部分谱行失败，需重试或修正后才能完整导入。"
              : snapshot.status === "cancelled"
                ? "任务已停止，已完成结果仍可查看。"
                : snapshot.status === "complete"
                  ? "所有谱行已通过审核，可导入练习。"
                  : "识别结果已到达，可一键审核全部，或先拖拽修正有问题的音符。";
    render();
  }

  function poll() {
    clearTimeout(ctx.pollTimer);
    if (ctx.disposed || !state.job || state.job.status !== "running") return;
    const intent = ctx.operationVersion,
      jobId = state.job.id;
    ctx.pollTimer = setTimeout(async () => {
      if (ctx.disposed) return;
      try {
        const response = await requireApi(ctx, "getJob")(jobId);
        if (
          ctx.disposed ||
          ctx.operationCancelled ||
          intent !== ctx.operationVersion ||
          jobId !== state.job?.id
        )
          return;
        applySnapshot(response);
      } catch (error) {
        if (
          !ctx.disposed &&
          !ctx.operationCancelled &&
          intent === ctx.operationVersion
        ) {
          state.error = `读取任务进度失败：${errorText(error)}。识别结果不会当作已完成。`;
          render();
        }
      }
      if (!ctx.disposed && state.job?.status === "running") poll();
    }, 1500);
  }

  async function startRecognition() {
    if (state.scanning) throw new Error("请等待全部 PDF 页面检查完毕。");
    const issues = fullScoreScopeIssues(draft);
    if (issues.length) throw new Error(issues[0].message);
    if (!state.pianoConfirmed)
      throw new Error(
        "请先对照谱头/来源，确认上传的是钢琴双手谱，而非照片或其他乐器谱。",
      );
    const caps = capability(ctx);
    if (!caps[state.engine])
      throw new Error(
        state.engine === "deepseek"
          ? "请先配置 DeepSeek API Key，并选择 deepseek-flash。"
          : "Pi 识谱尚未连接，请先在 AI 设置中完成连接。",
      );
    const skippedMusic = draft.regions.some(
      (region) =>
        !region.selected &&
        region.excludeReason === "music" &&
        pageInfo(ctx, region.page)?.decision === "include",
    );
    if (skippedMusic)
      throw new Error(
        "当前整谱任务不能跳过同页中的音乐谱行。请保留这些行；封面和误检可明确排除。",
      );
    const intent = beginOperation(ctx);
    state.busy = true;
    state.uploaded = 0;
    state.error = "";
    state.message = `正在准备全部谱行，随后使用 ${state.engine === "deepseek" ? "DeepSeek Flash" : "GPT-6.1 Sol"} high 首次识别。`;
    render();
    try {
      const regions = selectedRegions(ctx);
      if (
        !state.job &&
        !state.riskReview &&
        state.pdfHash &&
        typeof api.findReviewedJob === "function"
      ) {
        const reused = await api.findReviewedJob(state.pdfHash, state.engine);
        assertAlive(ctx, intent);
        if (reused) {
          restoreScope(reused);
          applySnapshot(reused);
          state.message =
            "已复用同一服务商识别且已校对的相同 PDF，本次新增模型调用 0 次；请核对范围后导入。";
          render();
          return;
        }
      }
      if (!state.job) {
        const pageSystemCounts = new Map();
        const regionManifest = regions.map((region) => {
          const system = (pageSystemCounts.get(region.page) || 0) + 1;
          pageSystemCounts.set(region.page, system);
          region.jobSystem = system;
          return {
            id: region.id,
            page: region.page,
            system,
            rect: region.rect,
            pageWidth: region.pageWidth,
            pageHeight: region.pageHeight,
            staffLines: region.staffLines,
            context: `${scopeLabel(region)}，仅识别此行完整双手小节；禁止补写前后谱行。`,
            ...(region.expectedMeasureCount
              ? { expectedMeasureCount: region.expectedMeasureCount }
              : {}),
          };
        });
        const response = await requireApi(ctx, "createJob")(
          {
            title: draft.title,
            composer: draft.composer || undefined,
            source,
            totalPages: draft.totalPages,
            pages: draft.pages.map((page) => ({
              page: page.page,
              width: page.width,
              height: page.height,
              pdfWidth: page.pdfWidth,
              pdfHeight: page.pdfHeight,
            })),
            regions: regionManifest,
            excludedPages: draft.pages
              .filter((page) => page.decision === "exclude")
              .map((page) => ({ page: page.page, reason: page.excludeReason })),
            needsUserScopeConfirmation: true,
            engineChoice: state.engine,
            recognitionPlan: {
              review: state.riskReview ? "risk" : "off",
              maxCalls: 2,
              recover: true,
            },
            tempo: draft.tempo,
            timeSignature: draft.timeSignature,
            keySignature: draft.keySignature,
          },
          { signal: ctx.operationController.signal },
        );
        if (await cancelLateResponse(ctx, response, undefined, intent)) return;
        assertAlive(ctx, intent);
        applySnapshot(response);
      }
      if (!state.job.originalPdf?.uploaded && !state.job.originalPdf?.bytes) {
        const upload = api.uploadDocument || api.uploadPdf;
        if (typeof upload !== "function")
          throw new Error(
            "服务器尚未提供原始 PDF 上传接口，无法保存可恢复的识谱任务。",
          );
        state.message =
          "正在将原始 PDF 保存到本机任务，刷新后可以恢复；此步骤不调用模型。";
        render();
        const image = await blobImage(file);
        assertAlive(ctx, intent);
        const response = await upload(state.job.id, {
          ...image,
          mimeType: "application/pdf",
          name: file.name || "score.pdf",
        });
        assertAlive(ctx, intent);
        applySnapshot(response);
      }
      // Upload every pending row for GPT; retain already recognized legacy rows.
      // Preparing missing images must never erase approved historical results.
      let prepared, preparedPage;
      try {
        for (const region of regions) {
          assertAlive(ctx, intent);
          const existing = state.job.regions?.find(
            (candidate) => candidate.id === region.id,
          );
          if (existing?.image || existing?.result) {
            state.uploaded++;
            continue;
          }
          if (region.page !== preparedPage) {
            prepared?.destroy();
            prepared = await preparePage(ctx, region.page);
            preparedPage = region.page;
            assertAlive(ctx, intent);
          }
          const image = assets.has(region.id)
            ? await blobImage(assets.get(region.id).blob)
            : await cropRegion(ctx, prepared, region);
          assertAlive(ctx, intent);
          // Revalidate every actual crop even when an earlier manual preview cached it.
          if (assets.has(region.id))
            prepared.getSelection({
              mode: "manual",
              rect: region.rect,
              confirmedPiano: state.pianoConfirmed,
            });
          await requireApi(ctx, "uploadRegion")(
            state.job.id,
            region.id,
            { image: { data: image.data, mimeType: image.mimeType } },
            { signal: ctx.operationController.signal },
          );
          assertAlive(ctx, intent);
          state.uploaded++;
          state.message = `谱行已上传 ${state.uploaded} / ${regions.length}，全部源范围都保留在任务中。`;
          render();
        }
      } finally {
        prepared?.destroy();
      }
      assertAlive(ctx, intent);
      const started = await requireApi(ctx, "startJob")(
        state.job.id,
        {
          autoContinue: state.autoContinue,
          batchSize: 2,
          expectedVersion: state.job.runVersion,
        },
        { signal: ctx.operationController.signal },
      );
      if (await cancelLateResponse(ctx, started, state.job.id, intent)) return;
      applySnapshot(started);
      poll();
    } catch (error) {
      if (
        ctx.disposed ||
        ctx.operationCancelled ||
        intent !== ctx.operationVersion
      )
        return;
      throw error;
    } finally {
      if (intent === ctx.operationVersion) {
        state.busy = false;
        if (!ctx.disposed) render();
      }
    }
  }

  async function cancel() {
    ctx.scanCancelled = true;
    ctx.operationCancelled = true;
    ctx.operationVersion++;
    ctx.operationController.abort();
    clearTimeout(ctx.pollTimer);
    if (
      state.job &&
      (state.job.status === "running" || state.busy) &&
      typeof api.cancelJob === "function"
    ) {
      try {
        applySnapshot(await api.cancelJob(state.job.id));
      } catch (error) {
        if (!ctx.disposed)
          state.error = `停止请求失败：${errorText(error)}。请重试停止。`;
      }
    }
    if (!ctx.disposed) {
      state.busy = false;
      state.message = state.scanning
        ? "已停止继续扫描；尚未检查的页面会阻止完整导入。请关闭后重新导入以继续。"
        : "任务已停止，已完成的结果保留。";
      render();
    }
  }

  async function confirmRegion(region = activeRegion(ctx), batch = false) {
    if (!region) return;
    if (state.job?.status === "running")
      throw new Error(
        "可以先编辑校对；请等待识别任务结束或停止后再提交此行审核。",
      );
    const issues = fullScoreRegionIssues(region);
    if (issues.length) throw new Error(issues[0].message);
    if (!state.job) throw new Error("此谱行没有对应的服务器识别任务。");
    const rawScore = {
      ...region.score,
      title: `${draft.title} · ${scopeLabel(region)}`,
      durationBeats: region.durationBeats,
      notes: region.notes,
      ...(region.score?.recognitionEvidence ? { rests: region.rests } : {}),
    };
    const score = region.notes.length
      ? validateScore(rawScore)
      : { ...rawScore, notes: [] };
    const originals = new Map(region.notes.map((note) => [note.id, note]));
    score.notes = score.notes.map((note) => ({
      ...note,
      voice: originals.get(note.id)?.voice || `${note.hand}-1`,
    }));
    const editedResult = {
      score,
      positions: region.notes
        .filter((note) => finite(note.x) && finite(note.y))
        .map((note) => ({
          noteId: note.id,
          x: note.x,
          y: note.y,
          coordinateSpace: "page",
        })),
      rests: region.rests || [],
      coverage: { ...region.coverage, complete: region.coverageComplete },
      continuity: region.continuity || {},
      internalTies: region.internalTies || [],
      corrections: region.corrections || [],
      sourceHeadAudit: region.sourceHeadAudit,
      tieAudit: region.tieAudit,
      warnings: region.warnings || [],
    };
    state.busy = true;
    state.error = "";
    state.message = `正在提交${scopeLabel(region)}的人工审核。`;
    render();
    try {
      const response = await requireApi(ctx, "confirmRegion")(
        state.job.id,
        region.id,
        editedResult,
      );
      region.reviewed = true;
      region.dirty = false;
      applySnapshot(response);
      const now = draft.regions.find((candidate) => candidate.id === region.id);
      if (now) {
        now.reviewed = true;
        now.dirty = false;
      }
      state.message = `${scopeLabel(region)}已审核；音符修改后会要求重新确认。`;
    } finally {
      if (!batch) state.busy = false;
      if (!ctx.disposed) render();
    }
  }

  async function approveAll() {
    if (!state.pianoConfirmed) throw new Error("请先确认这是钢琴双手五线谱。");
    if (isRunning(ctx) || state.importing || state.scanning) return;
    const { summary } = prepareBulkReview(draft);
    if (!summary.canImport) {
      const issue = summary.issues[0];
      const region = draft.regions.find((r) => r.id === issue?.regionId);
      if (region) {
        state.activeRegionId = region.id;
        state.activePage = region.page;
        state.stage = "review";
      }
      throw new Error(
        `${region ? scopeLabel(region) + "：" : ""}${issue?.message || "没有可审核的谱行。"}`,
      );
    }
    const intent = beginOperation(ctx);
    // The action itself acknowledges scope and per-row review flags.
    state.scopeReviewed = true;
    for (const candidate of summary.selected) {
      const local = draft.regions.find((r) => r.id === candidate.id);
      if (
        !local.coverageComplete ||
        local.sourceHeadAudit?.reviewed === false ||
        local.tieAudit?.reviewed === false
      )
        edited(local);
      Object.assign(local, {
        coverageComplete: true,
        ...(candidate.sourceHeadAudit
          ? { sourceHeadAudit: candidate.sourceHeadAudit }
          : {}),
        ...(candidate.tieAudit ? { tieAudit: candidate.tieAudit } : {}),
      });
    }
    state.busy = true;
    render();
    try {
      for (const candidate of summary.selected) {
        assertAlive(ctx, intent);
        const region = draft.regions.find((r) => r.id === candidate.id);
        if (!region.reviewed || region.dirty) await confirmRegion(region, true);
      }
      assertAlive(ctx, intent);
      applySnapshot(
        await requireApi(ctx, "confirmJob")(state.job.id, {
          scopeConfirmed: true,
        }),
      );
      state.message = `已审核全部 ${summary.selectedCount} 行。可继续修正音符，或点击“保存到曲库”。`;
    } finally {
      state.busy = false;
      if (!ctx.disposed) render();
    }
  }

  function retainOriginalPages(notation, selectedAssets) {
    notation.pages = draft.pages
      .filter((p) => p.decision === "include" && thumbnails.has(p.page))
      .map((p) => {
        const id = `original-page-${p.page}`,
          image = thumbnails.get(p.page);
        selectedAssets.push({
          id,
          page: p.page,
          blob: image.blob,
          mimeType: image.blob.type,
        });
        return {
          page: p.page,
          assetId: id,
          width: p.width,
          height: p.height,
          imageUrl: image.url,
        };
      });
  }

  async function importUnreviewed() {
    if (!state.scopeReviewed || !state.pianoConfirmed)
      throw new Error("请先确认钢琴谱身份和全部页、谱行范围。");
    state.importing = true;
    state.error = "";
    render();
    try {
      const response = unwrap(
          await requireApi(ctx, "exportDraft")(state.job.id, {
            scopeConfirmed: true,
          }),
        ),
        final = response.result;
      if (!final?.score || !final.sourceNotation)
        throw new Error("整谱草稿尚未完整识别。");
      const score = validateScore({
          ...final.score,
          title: draft.title + " · AI草稿（待校对）",
        }),
        selectedAssets = [];
      for (const region of selectedRegions(ctx)) {
        const asset = await ensureRegionAsset(ctx, region);
        selectedAssets.push({
          id: region.id,
          page: region.page,
          system: region.system,
          blob: asset.blob,
          mimeType: asset.mimeType,
          rect: { ...region.rect },
        });
      }
      const sourceNotation = {
        ...final.sourceNotation,
        title: score.title,
        scoreId: score.id,
        coordinateUnit: "page-image-pixels",
        systems: final.sourceNotation.systems.map((system) => ({
          ...system,
          assetId: system.id,
          imageUrl: assets.get(system.id).url,
          staffLines: draft.regions.find((r) => r.id === system.id)?.staffLines,
        })),
      };
      retainOriginalPages(sourceNotation, selectedAssets);
      await onImport({
        score,
        sourceNotation,
        measureMap: final.measureMap,
        assets: selectedAssets,
        warnings: final.warnings,
        reviewStatus: {
          method: "ai-unreviewed",
          complete: false,
          humanConfirmed: false,
        },
      });
    } finally {
      state.importing = false;
      if (!ctx.disposed) render();
    }
  }

  async function importReviewed() {
    const summary = fullScoreReviewSummary(draft);
    if (!summary.canImport)
      throw new Error(summary.issues[0]?.message || "尚未完成全部校对。");
    if (!state.scopeReviewed)
      throw new Error("请先确认已逐页核对全部谱行范围与排除项。");
    state.importing = true;
    state.error = "";
    render();
    try {
      if (state.job)
        applySnapshot(
          await requireApi(ctx, "confirmJob")(state.job.id, {
            scopeConfirmed: true,
          }),
        );
      const local = assembleFullScoreReview(draft),
        final = state.job?.result;
      if (
        !final?.score ||
        !final.sourceNotation ||
        state.job.status !== "complete"
      )
        throw new Error(
          "服务器尚未确认所有谱行及跨行连续性；不会导入部分结果冒充全谱。",
        );
      // The server merges cross-line ties and preserves the actual pickup and
      // measure map. Do not replace its timeline with fixed-length measures.
      const score = validateScore({
        ...final.score,
        title: local.score.title,
        tempo: draft.tempo || final.score.tempo,
        source: local.score.source,
      });
      const selectedAssets = [];
      for (const region of summary.selected) {
        const asset = await ensureRegionAsset(ctx, region);
        selectedAssets.push({
          id: region.id,
          page: region.page,
          system: region.system,
          blob: asset.blob,
          mimeType: asset.mimeType,
          rect: { ...region.rect },
        });
      }
      const sourceNotation = {
        ...final.sourceNotation,
        title: score.title,
        scoreId: score.id,
        source: score.source,
        coordinateUnit: "page-image-pixels",
        measureMap: final.measureMap || final.sourceNotation.measureMap,
        systems: final.sourceNotation.systems.map((system) => {
          const region = summary.selected.find(
            (candidate) =>
              candidate.id === system.id ||
              (candidate.page === system.page &&
                (candidate.jobSystem || candidate.system) === system.system),
          );
          return {
            ...system,
            assetId: region?.id || system.assetId || system.id,
            imageUrl: region ? assets.get(region.id).url : system.imageUrl,
            staffLines: region?.staffLines || system.staffLines,
            pageWidth: region?.pageWidth || system.pageWidth,
            pageHeight: region?.pageHeight || system.pageHeight,
          };
        }),
      };
      const warnings = [
        ...new Set([
          ...(final.warnings || []),
          ...summary.selected.flatMap((region) => region.warnings || []),
        ]),
      ];
      retainOriginalPages(sourceNotation, selectedAssets);
      await onImport({
        score,
        sourceNotation,
        measureMap: final.measureMap || sourceNotation.measureMap,
        assets: selectedAssets,
        warnings,
        reviewStatus: {
          ...local.reviewStatus,
          method: final.reviewStatus || local.reviewStatus.method,
        },
      });
      if (!ctx.disposed) {
        state.message = "已保存完整乐谱与原始谱行图片。";
        render();
      }
    } finally {
      state.importing = false;
      if (!ctx.disposed) render();
    }
  }

  async function retryRegion(
    regionId = state.activeRegionId,
    phase = "recognize",
  ) {
    const region = draft.regions.find((candidate) => candidate.id === regionId);
    if (!region || !state.job) throw new Error("请先创建识别任务。");
    const intent = beginOperation(ctx);
    region.reviewed = false;
    region.dirty = false;
    remoteSignatures.delete(region.id);
    state.busy = true;
    state.error = "";
    render();
    try {
      const saved = state.job.regions?.find(
        (candidate) => candidate.id === region.id,
      );
      if (!saved?.image) {
        const prepared = await ensurePrepared(ctx, region.page),
          image = await cropRegion(ctx, prepared, region);
        assertAlive(ctx, intent);
        const uploaded = await requireApi(ctx, "uploadRegion")(
          state.job.id,
          region.id,
          { image: { data: image.data, mimeType: image.mimeType } },
          { signal: ctx.operationController.signal },
        );
        assertAlive(ctx, intent);
        applySnapshot(uploaded);
      }
      const response = await requireApi(ctx, "retryRegion")(
        state.job.id,
        region.id,
        {
          engine: retryEngine(ctx),
          expectedVersion: state.job.runVersion,
          phase,
        },
        { signal: ctx.operationController.signal },
      );
      if (await cancelLateResponse(ctx, response, state.job.id, intent)) return;
      applySnapshot(response);
      poll();
    } catch (error) {
      if (
        ctx.disposed ||
        ctx.operationCancelled ||
        intent !== ctx.operationVersion
      )
        return;
      throw error;
    } finally {
      if (intent === ctx.operationVersion) {
        state.busy = false;
        if (!ctx.disposed) render();
      }
    }
  }

  async function enlargeRegion(region, intent) {
    let bitmap, canvas;
    try {
      const original = await requireApi(ctx, "readRegionImage")(
        state.job.id,
        region.id,
      );
      assertAlive(ctx, intent);
      bitmap = await createImageBitmap(original);
      assertAlive(ctx, intent);
      const scale = Math.min(
        2,
        4000 / bitmap.width,
        4000 / bitmap.height,
        Math.sqrt(12000000 / (bitmap.width * bitmap.height)),
      );
      // Images already at the size limit can still be reread or sent to another model.
      if (scale <= 1) return;
      canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas),
        image = await blobImage(blob);
      assertAlive(ctx, intent);
      const uploaded = await requireApi(ctx, "uploadRegion")(
        state.job.id,
        region.id,
        { image },
        { signal: ctx.operationController.signal },
      );
      assertAlive(ctx, intent);
      storeAsset(ctx, region, image, blob);
      remoteSignatures.delete(region.id);
      applySnapshot(uploaded);
    } finally {
      bitmap?.close();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  }

  async function retryFailed({
    single = false,
    enlarge = state.retryEnlarge,
  } = {}) {
    if (!state.job || isRunning(ctx)) return;
    const engine = retryEngine(ctx);
    const ids = single
      ? [state.activeRegionId]
      : state.job.regions
          .filter(
            (r) =>
              r.status === "failed" ||
              (r.status !== "confirmed" && r.result?.checks?.passed === false),
          )
          .map((r) => r.id);
    const regions = ids.map((id) => draft.regions.find((r) => r.id === id));
    if (!regions.length) throw new Error("没有需要重新识别的失败谱行。");
    if (regions.some((r) => !r || r.reviewed))
      throw new Error("已审核谱行请通过人工校对修改。");
    const intent = beginOperation(ctx);
    clearTimeout(ctx.pollTimer);
    state.busy = true;
    state.error = "";
    state.message = `正在准备重新识别 ${ids.length} 个谱行。`;
    render();
    try {
      if (enlarge)
        for (const region of regions) {
          assertAlive(ctx, intent);
          await enlargeRegion(region, intent);
        }
      assertAlive(ctx, intent);
      const response = await requireApi(ctx, "retryRegions")(
        state.job.id,
        { engine, regionIds: ids, expectedVersion: state.job.runVersion },
        { signal: ctx.operationController.signal },
      );
      if (await cancelLateResponse(ctx, response, state.job.id, intent)) return;
      for (const region of regions) {
        region.dirty = false;
        region.reviewed = false;
        remoteSignatures.delete(region.id);
      }
      applySnapshot(response);
      poll();
    } finally {
      if (intent === ctx.operationVersion) {
        state.busy = false;
        if (!ctx.disposed) render();
      }
    }
  }

  async function retryEnlargedRegion() {
    await retryFailed({ single: true, enlarge: true });
  }

  async function preview() {
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
          updatePositionMarker();
        },
      });
      ctx.previewRenderer.setBeat(0);
    } catch (error) {
      element.textContent = `当前修改尚不能排版：${errorText(error)}。请继续对照原图修正。`;
    }
  }

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
      if (note && point) commitMove(region, note, point);
    }
    const mapNote = event.target.closest("[data-source-note],[data-roll-note]");
    if (mapNote)
      selectMapNote(mapNote.dataset.sourceNote || mapNote.dataset.rollNote);
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
          await cancel();
          onClose();
          break;
        case "page":
          state.activePage = Number(action.dataset.page);
          state.activeRegionId =
            draft.regions.find(
              (region) => region.page === state.activePage && region.selected,
            )?.id || "";
          state.selecting = false;
          render();
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
          render();
          break;
        }
        case "scope":
          state.stage = "scope";
          state.selecting = false;
          render();
          break;
        case "review":
          await openPageWorkbench();
          break;
        case "select-crop":
          state.selecting = true;
          state.stage = "scope";
          render();
          break;
        case "add-crop":
          await applyManualCrop(false);
          break;
        case "replace-crop":
          await applyManualCrop(true);
          break;
        case "start":
          await startRecognition();
          break;
        case "cancel":
          await cancel();
          break;
        case "page-workbench":
          await openPageWorkbench();
          break;
        case "approve-all":
          await approveAll();
          break;
        case "retry-failed":
          await retryFailed();
          break;
        case "retry-region":
          await retryRegion();
          break;
        case "retry-enlarged":
          await retryEnlargedRegion();
          break;
        case "reset":
          await cancel();
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
          render();
          break;
        case "select-note":
          state.selectedHeadIndex = null;
          state.selectedNoteId = action.dataset.noteId;
          render();
          break;
        case "source-head":
          state.selectedHeadIndex = Number(action.dataset.headIndex);
          state.selectedNoteId = "";
          render();
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
          render();
          break;
        }
        case "delete-note": {
          const region = activeRegion(ctx);
          removeWrittenEvent(region, "note", action.dataset.noteId);
          region.notes = region.notes.filter(
            (note) => note.id !== action.dataset.noteId,
          );
          edited(region);
          render();
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
          render();
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
          render();
          break;
        }
        case "clear-ties": {
          const region = activeRegion(ctx);
          region.continuity = { tieIn: [], tieOut: [] };
          edited(region);
          render();
          break;
        }
        case "clear-internal-ties": {
          const region = activeRegion(ctx);
          region.internalTies = [];
          edited(region);
          render();
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
          render();
          try {
            applySnapshot(
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
            if (!ctx.disposed) render();
          }
          break;
        }
        case "confirm-region":
          await confirmRegion();
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
            render();
          } else
            setMessage(
              ctx,
              "当前没有已完成识别且待审核的谱行；请等待剩余任务或重试失败谱行。",
            );
          break;
        }
        case "undo-move":
          undoMove();
          break;
        case "preview":
          await preview();
          break;
        case "import":
          await importReviewed();
          break;
        case "import-draft":
          await importUnreviewed();
          break;
      }
    })().catch((error) => {
      if (!ctx.disposed) {
        state.busy = false;
        state.error = errorText(error);
        render();
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
    render();
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
      updateReviewControls();
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
      updateReviewControls();
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
        updateReviewControls();
      }
      return;
    }
    if (input.dataset.writtenKind) {
      const region = activeRegion(ctx);
      if (region && applyWrittenEvidenceInput(input, region)) {
        edited(region);
        updateReviewControls();
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
    updateReviewControls();
  });

  root.addEventListener("pointerdown", (event) => {
    const marker = event.target.closest("[data-source-note],[data-roll-note]");
    const image = root.querySelector("[data-original-image]");
    const region = activeRegion(ctx);
    if (
      event.button !== 0 ||
      state.stage !== "review" ||
      !region?.notes ||
      state.busy ||
      state.importing
    )
      return;
    if (!marker) return;
    const noteId =
      marker?.dataset.sourceNote ||
      marker?.dataset.rollNote ||
      state.selectedNoteId;
    const note = region.notes.find((n) => n.id === noteId);
    if (!note) return;
    selectMapNote(note.id);
    event.preventDefault();
    const mode = marker.hasAttribute("data-roll-note") ? "roll" : "source";
    const bounds = (
      mode === "roll" ? root.querySelector("[data-note-roll]") : image
    )?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    ctx.noteDrag = {
      pointerId: event.pointerId,
      region,
      note,
      marker,
      mode,
      bounds,
      range: rollRange(region),
      startX: event.clientX,
      startY: event.clientY,
      values: null,
    };
    root.setPointerCapture?.(event.pointerId);
    marker.focus({ preventScroll: true });
  });

  root.addEventListener("pointermove", (event) => {
    const drag = ctx.noteDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - drag.startX,
      dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) < 3 && !drag.values) return;
    drag.values =
      drag.mode === "source"
        ? {
            x: Math.max(
              drag.region.rect.x,
              Math.min(
                drag.region.rect.x + drag.region.rect.width,
                drag.note.x + (dx / drag.bounds.width) * drag.region.rect.width,
              ),
            ),
            y: Math.max(
              drag.region.rect.y,
              Math.min(
                drag.region.rect.y + drag.region.rect.height,
                drag.note.y +
                  (dy / drag.bounds.height) * drag.region.rect.height,
              ),
            ),
          }
        : rollMove(
            drag.note,
            drag.region,
            drag.range,
            drag.bounds,
            dx,
            dy,
            event.altKey ? 1 / 16 : 1 / 4,
          );
    if (!drag.values) return;
    if (drag.mode === "source") {
      drag.marker.style.left = `${((drag.values.x - drag.region.rect.x) / drag.region.rect.width) * 100}%`;
      drag.marker.style.top = `${((drag.values.y - drag.region.rect.y) / drag.region.rect.height) * 100}%`;
    } else {
      drag.marker.style.left = `${(drag.values.beat / drag.region.durationBeats) * 100}%`;
      drag.marker.style.top = `${(drag.range.max - drag.values.midi) * 20}px`;
      drag.marker.textContent = `${midiName(drag.values.midi)} · ${drag.values.beat} 拍`;
    }
  });

  function finishNoteDrag(event) {
    const drag = ctx.noteDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    ctx.noteDrag = null;
    if (root.hasPointerCapture?.(event.pointerId))
      root.releasePointerCapture(event.pointerId);
    if (
      event.type === "pointerup" &&
      drag.values &&
      !state.busy &&
      !state.importing &&
      drag.region === activeRegion(ctx)
    )
      commitMove(drag.region, drag.note, drag.values);
    else render();
  }
  root.addEventListener("pointerup", finishNoteDrag);
  root.addEventListener("pointercancel", finishNoteDrag);
  root.addEventListener("lostpointercapture", finishNoteDrag);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ctx.noteDrag) {
      event.stopPropagation();
      finishNoteDrag({
        ...event,
        pointerId: ctx.noteDrag.pointerId,
        type: "pointercancel",
      });
      return;
    }
    const marker = event.target.closest("[data-source-note],[data-roll-note]");
    if (
      !marker ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
        event.key,
      ) ||
      state.busy ||
      state.importing
    )
      return;
    event.preventDefault();
    const region = activeRegion(ctx),
      id = marker.dataset.sourceNote || marker.dataset.rollNote;
    const note = region?.notes.find((n) => n.id === id);
    if (!note) return;
    selectMapNote(id);
    const dx =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const step = event.shiftKey ? 10 : 1;
    const values = marker.hasAttribute("data-source-note")
      ? {
          x: Math.max(
            region.rect.x,
            Math.min(region.rect.x + region.rect.width, note.x + dx * step),
          ),
          y: Math.max(
            region.rect.y,
            Math.min(region.rect.y + region.rect.height, note.y + dy * step),
          ),
        }
      : {
          beat: Math.max(
            0,
            Math.min(
              Math.max(0, region.durationBeats - note.duration),
              note.beat +
                dx * (event.shiftKey ? 1 : event.altKey ? 1 / 16 : 1 / 4),
            ),
          ),
          midi: Math.max(21, Math.min(108, note.midi - dy)),
        };
    commitMove(region, note, values);
    const key = marker.hasAttribute("data-source-note")
      ? "sourceNote"
      : "rollNote";
    [...root.querySelectorAll("[data-source-note],[data-roll-note]")]
      .find((el) => el.dataset[key] === id)
      ?.focus({ preventScroll: true });
  });

  function restoreScope(saved) {
    const metadata = saved.metadata || {};
    draft.id = saved.id;
    draft.title = metadata.title || saved.title || draft.title;
    draft.composer = metadata.composer || draft.composer;
    draft.tempo = metadata.tempo;
    draft.timeSignature = metadata.timeSignature;
    draft.keySignature = metadata.keySignature;
    const excluded = new Map(
      (saved.excludedPages || []).map((page) => [page.page, page.reason]),
    );
    for (const page of draft.pages) {
      page.decision = excluded.has(page.page) ? "exclude" : "include";
      page.excludeReason = excluded.get(page.page) || "";
    }
    const detected = new Map(
      draft.regions.map((region) => [region.id, region]),
    );
    draft.regions = (saved.regions || []).map((region) => ({
      ...detected.get(region.id),
      id: region.id,
      page: region.page,
      system: region.system,
      jobSystem: region.system,
      rect: { ...region.rect },
      pageWidth: region.pageWidth || pageInfo(ctx, region.page)?.width,
      pageHeight: region.pageHeight || pageInfo(ctx, region.page)?.height,
      selected: true,
      excludeReason: "",
      status: "pending",
      reviewed: false,
      assetId: region.id,
    }));
    state.activeRegionId = draft.regions[0]?.id || "";
    state.activePage = draft.regions[0]?.page || 1;
  }

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
    render();
    for (let pageNumber = 1; pageNumber <= ctx.pdf.numPages; pageNumber++) {
      if (ctx.disposed || ctx.scanCancelled) break;
      if (!(await scanPage(ctx, pageNumber))) break;
      state.scannedPages = pageNumber;
      state.message = `正在逐页检查：第 ${pageNumber} / ${ctx.pdf.numPages} 页，发现 ${draft.regions.length} 个谱行候选。`;
      render();
    }
    state.scanning = false;
    if (!ctx.scanCancelled && saved?.id) {
      restoreScope(saved);
      applySnapshot(saved);
      state.message = saved.reusedExactPdf
        ? `已复用相同 PDF 的已校对全谱：${draft.totalPages} 页、${draft.regions.length} 行，本次新增模型调用 0 次。原图与校对结果保留，请确认范围后导入。`
        : `已恢复保存的任务：${draft.totalPages} 页、${draft.regions.length} 行。原图、已识别结果与审核状态保留；请再次核对范围确认。`;
      if (saved.status === "running") poll();
      render();
      return;
    }
    state.message = ctx.scanCancelled
      ? "扫描已停止；未检查页面会阻止完整导入。请关闭并重新上传继续。"
      : `全部 ${ctx.pdf.numPages} 页已检查。请排除封面/空白页，核对每个谱行是否完整包含两只手。`;
    render();
  }

  function destroy() {
    if (ctx.disposed) return;
    ctx.disposed = true;
    closePageWorkbench();
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

  render();
  const ready = initialize().catch((error) => {
    if (!ctx.disposed) {
      state.scanning = false;
      state.error = errorText(error);
      state.message = "PDF 尚未完成检查，无法启动完整识谱。";
      render();
    }
  });
  return { ready, destroy, cancel, getDraft: () => draft };
}
