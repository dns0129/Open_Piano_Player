// Markup for the full-PDF import dialog. Pure: it reads only the view model
// built by full-score-import-view.js and returns an HTML string.
import { midiName } from "../lib/score.mjs";
import { rollRange } from "../lib/recognition-review-actions.mjs";
import { escapeHTML } from "./html.js";
import { writtenEvidenceEditor } from "./recognition-written-editor.js";
import { scoreDiagnosisCard } from "./score-diagnosis-card.js";
import {
  finite,
  internalTieCandidates,
  omrReviewMarkup,
  scopeLabel,
} from "./full-score-import-parts.js";

/** Numbered markers for each located note and rest on the original crop. */
function sourceMarkers(region, state) {
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

/** The pitch/beat roll whose blocks are dragged to fix pitch and onset. */
function noteRoll(region, state) {
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

/** The whole dialog body for one render. */
export function fullScoreImportMarkup({
  draft,
  state,
  summary,
  pageRegions: regions,
  current,
  selected,
  failedCount,
  processed,
  total,
  running,
  locked,
  currentIssues,
  originalURL,
  thumbnailURL,
  activePageInfo,
  undoableMoves,
}) {
  const completed = summary.reviewedCount;
  const pageCards = draft.pages
    .map(
      (page) =>
        `<div class="fsi-page${page.page === state.activePage ? " is-current" : ""}"><button type="button" data-action="page" data-page="${page.page}" aria-label="查看 PDF 第 ${page.page} 页"><img src="${escapeHTML(thumbnailURL.get(page.page) || "")}" alt="第 ${page.page} 页原始 PDF 缩略图"><strong>第 ${page.page} 页</strong> · ${draft.regions.filter((region) => region.page === page.page).length} 行</button><select aria-label="第 ${page.page} 页的处理方式" data-page-decision="${page.page}" ${locked ? "disabled" : ""}><option value="pending" ${page.decision === "pending" ? "selected" : ""}>需决定识别或排除</option><option value="include" ${page.decision === "include" ? "selected" : ""}>识别此页</option><option value="not-score" ${page.decision === "exclude" && page.excludeReason === "not-score" ? "selected" : ""}>封面/空白/非谱面</option><option value="music" ${page.decision === "exclude" && page.excludeReason === "music" ? "selected" : ""}>跳过谱页（仅片段）</option></select></div>`,
    )
    .join("");
  const regionRows = regions
    .map(
      (region) =>
        `<div class="fsi-region${region.id === state.activeRegionId ? " is-current" : ""}"><input type="checkbox" data-region-selected="${escapeHTML(region.id)}" aria-label="识别${scopeLabel(region)}" ${region.selected ? "checked" : ""} ${locked ? "disabled" : ""}><button type="button" data-action="region" data-region-id="${escapeHTML(region.id)}">第 ${region.system} 行<small>${escapeHTML(region.reviewed ? "已审核" : region.status === "failed" ? `失败：${region.error || "请重试"}` : region.status === "complete" ? `${region.notes.length} 音符 · 待校对` : region.status === "running" ? "识别中" : "等待识别")}</small></button>${!region.selected ? `<select data-region-reason="${escapeHTML(region.id)}" aria-label="第 ${region.system} 行排除原因" ${locked ? "disabled" : ""}><option value="" ${!region.excludeReason ? "selected" : ""}>请选择排除原因</option><option value="not-score" ${region.excludeReason === "not-score" ? "selected" : ""}>非谱面/误检</option><option value="music" ${region.excludeReason === "music" ? "selected" : ""}>跳过音乐（仅片段）</option></select>` : ""}</div>`,
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
  return `<div class="fsi-top"><div><h2>完整 PDF 识谱与校对</h2><p class="fsi-muted">识别后可一键审核全部；只需打开有问题的谱行，用拖拽校准位置、音高和拍点。</p></div><button type="button" data-action="close" aria-label="关闭完整 PDF 识谱">关闭</button></div>
      <div class="fsi-meta"><label>乐谱名称<input data-meta="title" value="${escapeHTML(draft.title)}" maxlength="180" aria-label="完整乐谱名称"></label><label>速度 BPM<input data-meta="tempo" type="number" min="20" max="300" placeholder="自动识别" value="${draft.tempo ?? ""}" aria-label="全谱速度"></label><label>拍号<input data-meta="timeSignature" placeholder="例如 2/4" value="${draft.timeSignature?.join("/") || ""}" aria-label="全谱拍号"></label><label>调号<select data-meta="keySignature" aria-label="全谱调号"><option value="" ${draft.keySignature === undefined ? "selected" : ""}>自动识别</option>${Array.from(
        { length: 15 },
        (_, index) => index - 7,
      )
        .map(
          (value) =>
            `<option value="${value}" ${draft.keySignature === value ? "selected" : ""}>${value === 0 ? "无升降号" : value > 0 ? `${value} 个升号` : `${-value} 个降号`}</option>`,
        )
        .join("")}</select></label></div>
      <details class="fsi-job-settings" ${!state.job || state.job.status === "running" || !state.pianoConfirmed ? "open" : ""}><summary>识别设置与任务控制</summary><div class="fsi-flags"><label><input type="checkbox" data-piano-confirmed ${state.pianoConfirmed ? "checked" : ""} ${state.scanning || running ? "disabled" : ""}> 我已对照谱头/来源，确认这是钢琴双手五线谱</label></div>
      <div class="fsi-actions"><label>识谱服务商 <select data-recognition-engine ${state.job || running || state.scanning ? "disabled" : ""}><option value="pi" ${state.engine === "pi" ? "selected" : ""}>Pi Agent / ChatGPT</option><option value="deepseek" ${state.engine === "deepseek" ? "selected" : ""}>DeepSeek（实验 / 第二意见）· API 计费</option></select></label><strong data-recognition-model>${state.engine === "deepseek" ? "DeepSeek Flash" : "GPT-6.1 Sol"} · ${state.job?.recognition?.reasoningEffort === "low" ? "low" : "high"}</strong><label><input type="checkbox" data-auto-continue ${state.autoContinue ? "checked" : ""} ${state.scanning || running ? "disabled" : ""}> 自动继续全部谱行</label><label><input type="checkbox" data-risk-review ${state.riskReview ? "checked" : ""} ${state.job || running ? "disabled" : ""}> 复读高风险谱行（实验，可能增加一次调用）</label><button type="button" class="fsi-primary" data-action="start" ${state.scanning || state.busy || state.job?.status === "running" || state.importing ? "disabled" : ""}>${state.job ? "继续识别剩余谱行" : "一键识别全部选中谱行"}</button><button type="button" data-action="cancel" ${!state.scanning && !running ? "disabled" : ""}>停止任务</button>${state.job ? '<button type="button" data-action="reset" ' + (running ? "disabled" : "") + ">重新选择范围</button>" : ""}</div>
      <p class="fsi-muted">${selected.length} 个谱行全新识别基线为 ${state.engine === "deepseek" ? "DeepSeek Flash" : "GPT-6.1 Sol"} ${state.job?.recognition?.reasoningEffort === "low" ? "low" : "high"} ${state.job?.estimate?.modelCalls ?? state.job?.estimate?.piCalls ?? selected.length} 次（每行仅首次识别）；重试另计，最多 100 行并行，可随时停止。相同原图复用已校对结果，中断保留已完成转写。${state.job?.calls ? `${state.job?.reuse?.hits ? ` 已复用 ${state.job.reuse.hits} 行，节省 ${state.job.reuse.savedCalls} 次模型调用。` : ""} ${state.job.reusedExactPdf ? "该任务历史" : "本任务"}已发起 ${state.engine === "deepseek" ? "DeepSeek" : "Pi"} 识别 ${state.job.calls.recognition || 0} 次。` : ""}</p>
      </details>${state.job ? `<div class="fsi-batch-bar"><div class="fsi-actions"><button type="button" class="fsi-primary" data-action="page-workbench" ${running || state.importing || state.scanning || !selected.some((r) => r.notes?.length) ? "disabled" : ""}>整页左右对照修改</button><button type="button" class="fsi-primary" data-action="approve-all" ${running || state.importing || state.scanning || !state.pianoConfirmed || !selected.length || selected.some((r) => r.status !== "complete") ? "disabled" : ""}>一键审核全部</button><strong>${summary.reviewedCount} / ${summary.selectedCount} 行已审核</strong><details class="fsi-retry-options"><summary>重试选项（${failedCount} 行失败）</summary><div class="fsi-actions"><label>重识别模型 <select data-retry-engine ${running || state.importing ? "disabled" : ""}><option value="current" ${state.retryEngine === "current" ? "selected" : ""}>保持当前模型</option><option value="pi" ${state.retryEngine === "pi" ? "selected" : ""}>GPT-6.1 Sol · high</option><option value="deepseek" ${state.retryEngine === "deepseek" ? "selected" : ""}>DeepSeek Flash（实验）</option></select></label><label><input type="checkbox" data-retry-enlarge ${state.retryEnlarge ? "checked" : ""} ${running || state.importing ? "disabled" : ""}> 放大原图识别（最多 2 倍）</label><button type="button" data-action="retry-failed" ${running || state.importing || !failedCount ? "disabled" : ""}>一键重新识别失败谱行（${failedCount}）</button></div><p class="fsi-muted">重识别保留成功结果；额外模型调用另计。放大不会增加原图细节。</p></details></div><p class="fsi-muted">一键审核会确认全部所选谱行、覆盖范围及识别疑点，无需逐行勾选；审核后仍可编辑，再点击“保存到曲库”。结构错误会定位到对应谱行。</p></div>` : ""}
      <div class="fsi-status" role="status" aria-live="polite"><strong>${escapeHTML(state.message)}</strong><p>已检查 ${state.scannedPages} / ${draft.totalPages || "…"} 页 · ${processed} / ${total} 行已处理 · ${completed} 行已审核${state.busy && state.uploaded ? ` · 已上传 ${state.uploaded} 行` : ""}</p><progress max="${state.scanning ? draft.totalPages || 1 : total || 1}" value="${state.scanning ? state.scannedPages : processed}"></progress></div>
      ${state.error ? `<div class="fsi-error" role="alert">${escapeHTML(state.error)}</div>` : ""}
      <div class="fsi-workspace"><aside class="fsi-pages" aria-label="PDF 所有页面">${pageCards || '<p class="fsi-muted">正在读取页面…</p>'}</aside><section class="fsi-view" aria-label="当前谱行校对"><div class="fsi-actions"><h3>第 ${state.activePage} 页${current ? ` · 第 ${current.system} 行` : ""}</h3><button type="button" data-action="scope" ${state.scanning || state.busy ? "disabled" : ""}>页面与范围</button><button type="button" data-action="review" ${!current?.notes ? "disabled" : ""}>整页对照修改</button>${!locked ? '<button type="button" data-action="select-crop">手动调整/补充谱行</button>' : ""}</div>
      ${activePageInfo?.assessment ? `<p class="fsi-muted">${escapeHTML(activePageInfo.assessment.message)}</p>` : ""}
      <div class="fsi-regions" aria-label="当前页面全部谱行">${regionRows || '<p class="fsi-muted" style="padding:9px">此页未找到可用的双手谱行。请明确排除封面，或手动框选清晰双谱表。</p>'}</div>
      ${state.selecting ? '<div class="fsi-selector"><p>请切换“手动框选”，拖出完整的一行双手谱。添加/替换都必须包含谱号、上下加线及全部小节。</p><div data-crop-selector></div><div class="fsi-actions"><button type="button" data-action="add-crop">添加为新谱行</button><button type="button" data-action="replace-crop" ' + (!current ? "disabled" : "") + ">替换当前谱行范围</button></div></div>" : `<div class="fsi-original${state.stage === "review" && current?.notes ? " can-locate" : ""}" data-original-frame><div class="fsi-source-canvas">${originalURL ? `<img src="${escapeHTML(originalURL)}" alt="${state.stage === "review" && current ? `${scopeLabel(current)}原始钢琴谱裁切；选中音符后可点击校准位置` : `PDF 第 ${state.activePage} 页原始谱面`}" data-original-image>${sourceMarkers(current, state)}` : '<p class="fsi-muted" style="padding:20px">正在准备原谱预览…</p>'}<span class="fsi-position" data-note-position hidden></span></div></div>`}
      ${
        state.stage === "review" && current?.notes
          ? `<p class="fsi-muted">${current.positionlessSource ? "此结果未提供逐音原图坐标，可选中音符后点击原图补充定位。" : "拖动原图上的编号圆点，校准跟谱位置；也可在下表选中音符后点击音头定位。"}拍点以此行第 0 拍为起点。</p><div class="fsi-actions"><button type="button" data-action="undo-move" ${!undoableMoves || state.busy || state.importing ? "disabled" : ""}>撤销上次拖拽／定位</button></div>${noteRoll(current, state)}<details class="fsi-note-details"><summary>音符明细与精确修改（${current.notes.length} 音符）</summary><div class="fsi-actions"><label>本行总拍数（含休止） <input type="number" min="0.0009765625" step="0.000001" data-region-duration value="${escapeHTML(current.durationBeats ?? "")}" aria-label="当前谱行总拍数" style="width:100px"></label><button type="button" data-action="add-note">新增音符</button><button type="button" data-action="preview">更新转写谱面预览</button><button type="button" data-action="retry-region" ${running ? "disabled" : ""}>重新读取此行原图</button><button type="button" data-action="retry-enlarged" ${running || current.reviewed ? "disabled" : ""}>放大／换模型重识别此行</button></div>${notesTable}${writtenEvidenceEditor(current)}</details>${reviewAdvanced}${omrReviewMarkup(current)}<div class="fsi-mini-notation" data-notation-preview><p class="fsi-muted">点击“更新转写谱面预览”，与上方原始谱面对照。</p></div><label><input type="checkbox" data-region-coverage ${current.coverageComplete ? "checked" : ""}> 已确认本行的全部小节、左右手及末尾休止均已转写</label>${current.warnings?.length ? `<div class="fsi-warning">${current.warnings.map(escapeHTML).join("<br>")}</div>` : ""}${
              currentIssues.length
                ? `<ul class="fsi-checklist">${currentIssues
                    .slice(0, 8)
                    .map((issue) => `<li>${escapeHTML(issue.message)}</li>`)
                    .join("")}</ul>`
                : ""
            }<div class="fsi-actions"><button type="button" class="fsi-primary" data-action="confirm-region" ${running || currentIssues.length ? "disabled" : ""}>${current.reviewed ? "此行已审核；修改后需重新确认" : "仅审核当前行（可选）"}</button><button type="button" data-action="next-unreviewed">下一个待校对谱行</button></div>`
          : current?.status === "failed"
            ? `<div class="fsi-error">${escapeHTML(current.error || "此行识别失败，完整导入已被阻止。")}</div><button type="button" data-action="retry-region" ${running ? "disabled" : ""}>重试此行</button><button type="button" data-action="retry-enlarged" ${running ? "disabled" : ""}>放大原图后重试此行</button>`
            : ""
      }
      ${
        state.job && current
          ? scoreDiagnosisCard(
              state.job.regions?.find((r) => r.id === current.id),
              {
                busy: state.busy || running || state.importing,
                dirty: current.dirty,
              },
            )
          : ""
      }
      </section></div>
      <footer class="fsi-footer"><div><strong>${summary.reviewedCount} / ${summary.selectedCount} 行完成审核 · ${summary.noteCount} 音符</strong><p>${summary.musicExcluded ? "已排除含音乐的页面或谱行，导入名称会明确标注“所选谱段”。" : "可一键审核全部，也可单独审核当前行；修改过的谱行需要重新审核。"}</p>${!summary.canImport && !state.scanning ? `<p class="fsi-muted">${escapeHTML(summary.issues[0]?.message || "")}</p>` : ""}</div><label><input type="checkbox" data-scope-reviewed ${state.scopeReviewed ? "checked" : ""}> 我已确认全部页和谱行的处理范围，排除项均已检查</label><button type="button" class="fsi-primary" data-action="import" ${!summary.canImport || state.importing || running || !state.scopeReviewed ? "disabled" : ""}>${state.importing ? "正在保存…" : summary.musicExcluded ? "保存所选片段到曲库" : "保存到曲库"}</button>${state.job && state.job.regions.every((r) => r.result) ? `<button type="button" data-action="import-draft" ${state.importing || running || !state.scopeReviewed ? "disabled" : ""}>导入AI草稿（待校对）</button>` : ""}</footer>`;
}
