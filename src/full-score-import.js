import { assetURL } from '../lib/asset-url.mjs';
import { prepareScoreImage, mountScoreImageSelector } from './score-image.js';
import { normalizeCropRect } from '../lib/score-image-layout.mjs';
import { validateScore, midiName } from '../lib/score.mjs';
import { validateFullScorePdfUpload, completePianoSystemRects, normalizeFullScoreRegionResult, fullScoreRegionIssues, fullScoreScopeIssues, fullScoreReviewSummary, assembleFullScoreReview } from '../lib/full-score-review.mjs';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const numberValue = value => value === '' ? undefined : Number(value);
const blobFromImage = image => {
  const bytes = atob(image.data), data = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) data[index] = bytes.charCodeAt(index);
  return new Blob([data], { type: image.mimeType || 'image/png' });
};
const blobImage = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onerror = () => reject(new Error('文件读取失败。'));
  reader.onload = () => resolve({ data: String(reader.result).split(',')[1], mimeType: blob.type || 'image/png' }); reader.readAsDataURL(blob);
});
const canvasBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('谱面图片生成失败。')), 'image/png'));
const scopeLabel = region => `第 ${region.page} 页 · 第 ${region.system} 行`;

function internalTieCandidates(region) {
  const notes = region.notes || [], pairs = new Map();
  for (const tie of region.internalTies || []) if (tie) pairs.set(`${tie.fromNoteId}:${tie.toNoteId}`, { ...tie, checked: true });
  for (const from of notes) {
    const to = notes.find(note => note.id !== from.id && note.hand === from.hand && note.midi === from.midi && Math.abs(note.beat - from.beat - from.duration) < .00001);
    if (to) { const key = `${from.id}:${to.id}`; if (!pairs.has(key)) pairs.set(key, { fromNoteId: from.id, toNoteId: to.id, checked: false }); }
  }
  return [...pairs.values()].map(pair => ({ ...pair, from: notes.find(note => note.id === pair.fromNoteId), to: notes.find(note => note.id === pair.toNoteId) }));
}

const css = `
.full-score-import{font:12px/1.55 system-ui;color:#34483d;min-width:0;--fsi-green:#2b796b;--fsi-line:#dbe5d9}
.full-score-import *{box-sizing:border-box}.full-score-import button,.full-score-import input,.full-score-import select{font:inherit;color:inherit}
.full-score-import button{padding:7px 11px;border:1px solid var(--fsi-line);border-radius:7px;background:#fff;cursor:pointer}.full-score-import button:disabled{opacity:.45;cursor:not-allowed}.full-score-import .fsi-primary{background:var(--fsi-green);border-color:var(--fsi-green);color:#fff}.full-score-import .fsi-danger{color:#a45338}
.full-score-import input:not([type=checkbox]),.full-score-import select{border:1px solid var(--fsi-line);border-radius:6px;padding:7px 8px;background:#fff;min-width:0}.full-score-import input[type=checkbox]{accent-color:var(--fsi-green)}
.full-score-import .fsi-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.full-score-import h2{font-size:19px;margin:0 0 5px}.full-score-import h3{font-size:13px;margin:0 0 8px}.full-score-import p{margin:5px 0}.full-score-import .fsi-muted{color:#7c8c7d;font-size:11px}.full-score-import .fsi-meta{display:grid;grid-template-columns:minmax(130px,2fr) repeat(3,minmax(70px,1fr));gap:8px;margin:13px 0}.full-score-import .fsi-meta label{display:grid;gap:3px}.full-score-import .fsi-actions,.full-score-import .fsi-flags{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:9px 0}
.full-score-import .fsi-warning,.full-score-import .fsi-error{padding:9px 11px;border-radius:7px;background:#faf2df;color:#8c672c;margin:8px 0}.full-score-import .fsi-error{background:#fcf0e9;color:#9f533b}.full-score-import .fsi-status{padding:10px 12px;border:1px solid var(--fsi-line);border-radius:8px;background:#f6f8f2;margin:12px 0}.full-score-import progress{display:block;width:100%;height:7px;accent-color:var(--fsi-green);margin-top:7px}
.full-score-import .fsi-workspace{display:grid;grid-template-columns:176px minmax(0,1fr);gap:12px;min-height:380px}.full-score-import .fsi-pages{max-height:630px;overflow:auto;padding-right:5px}.full-score-import .fsi-page{border:1px solid var(--fsi-line);border-radius:7px;padding:7px;margin-bottom:8px;background:#fff}.full-score-import .fsi-page.is-current{border-color:#79a28a;background:#f1f6ed}.full-score-import .fsi-page img{display:block;width:100%;height:118px;object-fit:contain;object-position:center top;background:#fff;margin-bottom:5px}.full-score-import .fsi-page button{width:100%;padding:3px 4px;border:0;background:transparent}.full-score-import .fsi-page select{display:block;width:100%;font-size:10px;padding:4px;margin-top:4px}.full-score-import .fsi-region{display:flex;align-items:center;gap:6px;padding:7px 8px;border-bottom:1px solid #edf1e9}.full-score-import .fsi-region.is-current{background:#edf5e9}.full-score-import .fsi-region>button{flex:1;text-align:left;border:0;padding:3px;background:transparent}.full-score-import .fsi-region small{display:block;color:#7c8c7d}.full-score-import .fsi-regions{border:1px solid var(--fsi-line);border-radius:7px;overflow:auto;max-height:190px;margin:8px 0}.full-score-import .fsi-region select{max-width:135px;font-size:10px;padding:4px}.full-score-import .fsi-view{min-width:0}.full-score-import .fsi-original{position:relative;border:1px solid var(--fsi-line);background:#fff;overflow:auto;max-height:440px;margin:8px 0}.full-score-import .fsi-original img{display:block;width:100%;height:auto}.full-score-import .fsi-original.can-locate{cursor:crosshair}.full-score-import .fsi-position{position:absolute;border:2px solid #cb6f42;width:15px;height:15px;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;background:#ffdb9160}
.full-score-import .fsi-review-table{overflow:auto;max-height:290px;border:1px solid var(--fsi-line);border-radius:7px}.full-score-import table{border-collapse:collapse;width:100%;font-size:11px}.full-score-import th,.full-score-import td{padding:4px;border-bottom:1px solid #e9eee5;text-align:left;white-space:nowrap}.full-score-import th{position:sticky;top:0;background:#f4f7ef;z-index:1}.full-score-import td input{width:78px;padding:5px!important}.full-score-import td select{padding:5px!important}.full-score-import tr.is-selected{background:#f6efdc}.full-score-import .fsi-note-name{font-size:10px;color:#7b8d7b}.full-score-import .fsi-note-position{color:#9a6345}.full-score-import .fsi-note-position.is-mapped{color:#4d8464}.full-score-import .fsi-mini-notation{max-height:270px;overflow:auto;border:1px solid var(--fsi-line);border-radius:7px;padding:6px;background:#fff;margin:8px 0}.full-score-import .fsi-footer{border-top:1px solid var(--fsi-line);margin-top:12px;padding-top:11px;display:flex;align-items:center;justify-content:space-between;gap:12px}.full-score-import .fsi-footer p{font-size:11px}.full-score-import .fsi-checklist{max-height:95px;overflow:auto;font-size:11px;color:#9b603e;margin:7px 0;padding-left:18px}.full-score-import .score-image-confirmation{display:none}.full-score-import .fsi-selector{border:1px solid var(--fsi-line);border-radius:7px;padding:8px}.full-score-import [hidden]{display:none!important}
@media(max-width:720px){.full-score-import .fsi-workspace{grid-template-columns:112px minmax(0,1fr);gap:7px}.full-score-import .fsi-meta{grid-template-columns:1fr 1fr}.full-score-import .fsi-page img{height:90px}.full-score-import .fsi-pages{max-height:520px}.full-score-import .fsi-footer{align-items:flex-start;flex-direction:column}.full-score-import .fsi-region{flex-wrap:wrap}.full-score-import .fsi-region select{max-width:100%}}
`;

function installStyles() {
  if (document.getElementById('full-score-import-styles')) return;
  const style = document.createElement('style'); style.id = 'full-score-import-styles'; style.textContent = css; document.head.append(style);
}

function omrReviewMarkup(region) {
  const changes=region.corrections||[],audit=region.sourceHeadAudit;
  const records=changes.length?`<details class="fsi-advanced"><summary>自动校正记录（${changes.length}项，仍需对照原谱）</summary><ul>${changes.map(c=>`<li>${c.measure?`第${c.measure}小节：`:''}${escapeHTML(c.description)}<br><small>${escapeHTML(c.before)} → ${escapeHTML(c.after)}；依据：${escapeHTML(c.evidence)}</small></li>`).join('')}</ul></details>`:'';
  const heads=audit?.unmapped?.length?`<div class="fsi-warning"><strong>初次识别有${audit.unmapped.length}个未映射源音头${audit.reviewed?'（已核查）':'，需核查或补音'}</strong><p>以下保留原始识别的疑点记录。点击定位后对照原谱与已校对音符；可用“新增音符”补入漏音，或确认属于误检。</p><div>${audit.unmapped.map((head,index)=>`<button type="button" data-action="source-head" data-head-index="${index}">查看${head.staff===1?'右':'左'}谱表音头${index+1}</button>`).join('')}</div><label><input type="checkbox" data-head-reviewed ${audit.reviewed?'checked':''}> 已逐个检查，补入漏音或确认误检</label></div>`:audit?`<p class="fsi-muted">源音头覆盖：${audit.mapped} / ${audit.detected}，仍需对照音高、节奏与变音记号。</p>`:'';
  const ties=region.tieAudit?.unresolved?.length?`<div class="fsi-warning"><strong>初次识别有${region.tieAudit.unresolved.length}处延音疑点${region.tieAudit.reviewed?'（已核查）':'，音符已保留供编辑'}</strong><ul>${region.tieAudit.unresolved.map(item=>`<li>${escapeHTML(item.description)} ${item.noteIds.map(id=>`<button type="button" data-action="select-note" data-note-id="${escapeHTML(id)}">定位 ${escapeHTML(id)}</button>`).join('')}</li>`).join('')}</ul><p>以上为原始疑点记录；请在上方延音编辑区核对修正后的行内/跨行关系，普通乐句线应保留分次弹奏。</p><label><input type="checkbox" data-tie-reviewed ${region.tieAudit.reviewed?'checked':''}> 已按原谱修正并核对以上延音疑点</label></div>`:'';
  return records+heads+ties;
}

/**
 * Generic PDF -> all-page scope -> asynchronous recognition -> per-line review.
 * Returns immediately so a modal can clean up while PDF loading is in flight.
 * `api` is injected; this module never reads credentials or calls a model itself.
 */
export function mountFullScoreImport(host, { file, source = {}, resumeJob = null, onImport = () => {}, onClose = () => {}, api = {} } = {}) {
  source = source && typeof source === 'object' ? source : {};
  installStyles();
  const root = document.createElement('section'); root.className = 'full-score-import'; host.replaceChildren(root);
  const draft = { id: `pdf-${Date.now().toString(36)}`, title: (file?.name || source.songName || '钢琴谱').replace(/\.pdf$/i, ''), composer: '', source, totalPages: 0, pages: [], regions: [], tempo: undefined, timeSignature: undefined, keySignature: undefined };
  const state = { scanning: true, scannedPages: 0, busy: false, importing: false, activePage: 1, activeRegionId: '', selectedNoteId: '', selecting: false, stage: 'scope', pianoConfirmed: source.pianoSourceVerified === true, scopeReviewed: false, capabilities: null, engine: 'pi', retryEngine: 'current', retryEnlarge: true, pdfHash: null, selectedHeadIndex: null, autoContinue: true, job: null, error: '', message: '正在打开 PDF，随后逐页检查钢琴双手谱表。', uploaded: 0, progress: null };
  const assets = new Map(), thumbnails = new Map(), remoteSignatures = new Map();
  let documentTask, pdf, disposed = false, scanCancelled = false, operationCancelled = false, operationVersion = 0, pollTimer = 0, renderEpoch = 0, manualSequence = 0, previewRenderer, selector, activePrepared, preparedPromise, pdfQueue = Promise.resolve();
  let operationController = new AbortController();
  const selectedRegions = () => draft.regions.filter(region => region.selected && draft.pages.some(page => page.page === region.page && page.decision === 'include')).sort((a, b) => a.page - b.page || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const activeRegion = () => draft.regions.find(region => region.id === state.activeRegionId);
  const pageInfo = page => draft.pages.find(candidate => candidate.page === page);
  const isRunning = () => state.busy || state.job?.status === 'running';
  const scopeLocked = () => Boolean(state.job) || state.busy || state.scanning;
  const errorText = error => String(error?.message || error || '操作失败，请重试。');
  const unwrap = value => value?.snapshot || value?.job || value;
  const assertAlive = intent => { if (disposed || operationCancelled || intent !== undefined && intent !== operationVersion) throw new Error('操作已停止。'); };
  async function cancelLateResponse(response, fallbackId, intent) {
    if (!disposed && !operationCancelled && (intent === undefined || intent === operationVersion)) return false;
    // A later explicit restart owns the job now; an old response must neither
    // overwrite that state nor cancel the new user-authorized run.
    if (!disposed && !operationCancelled && intent !== operationVersion) return true;
    const id = unwrap(response)?.id || fallbackId;
    if (id && typeof api.cancelJob === 'function') await api.cancelJob(id).catch(() => {});
    return true;
  }
  const requireApi = name => { if (typeof api[name] !== 'function') throw new Error(`服务器尚未提供 ${name} 接口，请刷新后重试。`); return api[name]; };
  const setMessage = (message, error = '') => { state.message = message; state.error = error; render(); };

  function capability() {
    const raw = state.capabilities?.fullScore || state.capabilities || {};
    return { pi: raw.pi?.ready !== false && raw.pi?.available !== false, deepseek: raw.deepseek?.ready === true }; 
  }

  function render() {
    if (disposed) return;
    const focus = root.contains(document.activeElement) ? { noteId: document.activeElement.dataset.noteId, field: document.activeElement.dataset.noteField, meta: document.activeElement.dataset.meta, restField: document.activeElement.dataset.restField, restIndex: document.activeElement.dataset.restIndex, start: document.activeElement.selectionStart } : null;
    const advancedOpen = root.querySelector('.fsi-advanced')?.open;
    const epoch = ++renderEpoch; selector?.destroy(); selector = null; previewRenderer?.destroy(); previewRenderer = null;
    const summary = fullScoreReviewSummary(draft), regions = draft.regions.filter(region => region.page === state.activePage), current = activeRegion();
    const failedCount = (state.job?.regions || []).filter(region => region.status === 'failed' || region.status !== 'confirmed' && region.result?.checks?.passed === false).length;
    const completed = state.progress?.confirmed ?? summary.reviewedCount;
    const processed = state.progress ? (state.progress.needsReview || 0) + (state.progress.confirmed || 0) + (state.progress.failed || 0) : summary.recognizedCount;
    const total = state.progress?.total || selectedRegions().length;
    const pageCards = draft.pages.map(page => `<div class="fsi-page${page.page === state.activePage ? ' is-current' : ''}"><button type="button" data-action="page" data-page="${page.page}" aria-label="查看 PDF 第 ${page.page} 页"><img src="${escapeHTML(thumbnails.get(page.page)?.url || '')}" alt="第 ${page.page} 页原始 PDF 缩略图"><strong>第 ${page.page} 页</strong> · ${draft.regions.filter(region => region.page === page.page).length} 行</button><select aria-label="第 ${page.page} 页的处理方式" data-page-decision="${page.page}" ${scopeLocked() ? 'disabled' : ''}><option value="pending" ${page.decision === 'pending' ? 'selected' : ''}>需决定识别或排除</option><option value="include" ${page.decision === 'include' ? 'selected' : ''}>识别此页</option><option value="not-score" ${page.decision === 'exclude' && page.excludeReason === 'not-score' ? 'selected' : ''}>封面/空白/非谱面</option><option value="music" ${page.decision === 'exclude' && page.excludeReason === 'music' ? 'selected' : ''}>跳过谱页（仅片段）</option></select></div>`).join('');
    const regionRows = regions.map(region => `<div class="fsi-region${region.id === state.activeRegionId ? ' is-current' : ''}"><input type="checkbox" data-region-selected="${escapeHTML(region.id)}" aria-label="识别${scopeLabel(region)}" ${region.selected ? 'checked' : ''} ${scopeLocked() ? 'disabled' : ''}><button type="button" data-action="region" data-region-id="${escapeHTML(region.id)}">第 ${region.system} 行<small>${escapeHTML(region.reviewed ? '已审核' : region.status === 'failed' ? `失败：${region.error || '请重试'}` : region.status === 'complete' ? `${region.notes.length} 音符 · 待校对` : region.status === 'running' ? '识别中' : '等待识别')}</small></button>${!region.selected ? `<select data-region-reason="${escapeHTML(region.id)}" aria-label="第 ${region.system} 行排除原因" ${scopeLocked() ? 'disabled' : ''}><option value="" ${!region.excludeReason ? 'selected' : ''}>请选择排除原因</option><option value="not-score" ${region.excludeReason === 'not-score' ? 'selected' : ''}>非谱面/误检</option><option value="music" ${region.excludeReason === 'music' ? 'selected' : ''}>跳过音乐（仅片段）</option></select>` : ''}</div>`).join('');
    const notesTable = current?.notes?.length ? `<div class="fsi-review-table"><table><thead><tr><th>定位原图</th><th>MIDI 音高</th><th>起始拍</th><th>时值</th><th>手别</th><th>声部</th><th>删除</th></tr></thead><tbody>${current.notes.map((note, index) => `<tr class="${note.id === state.selectedNoteId ? 'is-selected' : ''}"><td><button type="button" data-action="select-note" data-note-id="${escapeHTML(note.id)}" aria-label="选中第 ${index + 1} 个音符并在原图定位">${index + 1} · <span class="fsi-note-position${finite(note.x) && finite(note.y) ? ' is-mapped' : ''}">${finite(note.x) && finite(note.y) ? '已有位置' : '需点图定位'}</span></button></td><td><input type="number" min="21" max="108" step="1" value="${escapeHTML(note.midi)}" data-note-field="midi" data-note-id="${escapeHTML(note.id)}" aria-label="第 ${index + 1} 个音符 MIDI 音高"><span class="fsi-note-name">${Number.isInteger(note.midi) && note.midi >= 21 && note.midi <= 108 ? midiName(note.midi) : ''}</span></td><td><input type="number" min="0" step="0.000001" value="${escapeHTML(note.beat)}" data-note-field="beat" data-note-id="${escapeHTML(note.id)}" aria-label="第 ${index + 1} 个音符起始拍"></td><td><input type="number" min="0.0009765625" max="256" step="0.000001" value="${escapeHTML(note.duration)}" data-note-field="duration" data-note-id="${escapeHTML(note.id)}" aria-label="第 ${index + 1} 个音符时值"></td><td><select data-note-field="hand" data-note-id="${escapeHTML(note.id)}" aria-label="第 ${index + 1} 个音符手别"><option value="right" ${note.hand === 'right' ? 'selected' : ''}>右手</option><option value="left" ${note.hand === 'left' ? 'selected' : ''}>左手</option></select></td><td><input data-note-field="voice" data-note-id="${escapeHTML(note.id)}" value="${escapeHTML(note.voice || `${note.hand}-1`)}" aria-label="第 ${index + 1} 个音符声部"></td><td><button type="button" class="fsi-danger" data-action="delete-note" data-note-id="${escapeHTML(note.id)}" aria-label="删除第 ${index + 1} 个音符">删</button></td></tr>`).join('')}</tbody></table></div>` : '';
    const reviewAdvanced = current?.notes ? `<details class="fsi-advanced"><summary>校正每小节拍数、休止与跨行延音</summary><p class="fsi-muted">弱起须填写实际拍数，例如 1, 4, 4；没有发声的时段也要以休止明确解释。独立声部请用不同 voice。</p><label>每小节实际拍数 <input data-measure-durations aria-label="当前谱行各小节实际拍数" value="${escapeHTML(current.coverage?.measureDurations?.join(', ') || '')}" placeholder="例如 1, 4, 4"></label><div class="fsi-review-table"><table><thead><tr><th>休止起始拍</th><th>时值</th><th>手别</th><th>声部</th><th>删除</th></tr></thead><tbody>${(current.rests || []).map((rest, index) => `<tr><td><input type="number" min="0" step="0.000001" data-rest-field="beat" data-rest-index="${index}" value="${escapeHTML(rest.beat)}" aria-label="第 ${index + 1} 个休止起始拍"></td><td><input type="number" min="0.000001" step="0.000001" data-rest-field="duration" data-rest-index="${index}" value="${escapeHTML(rest.duration)}" aria-label="第 ${index + 1} 个休止时值"></td><td><select data-rest-field="hand" data-rest-index="${index}" aria-label="第 ${index + 1} 个休止手别"><option value="right" ${rest.hand === 'right' ? 'selected' : ''}>右手</option><option value="left" ${rest.hand === 'left' ? 'selected' : ''}>左手</option></select></td><td><input data-rest-field="voice" data-rest-index="${index}" value="${escapeHTML(rest.voice || `${rest.hand}-1`)}" aria-label="第 ${index + 1} 个休止声部"></td><td><button type="button" data-action="delete-rest" data-rest-index="${index}" aria-label="删除第 ${index + 1} 个休止">删</button></td></tr>`).join('')}</tbody></table></div><div class="fsi-actions"><button type="button" data-action="add-rest">新增休止</button></div><p class="fsi-muted">行内延音：仅当原谱同音之间有延音线才勾选；重复击键不要勾选。全部音头位置会保留。</p><div class="fsi-review-table">${internalTieCandidates(current).map(pair => `<label class="fsi-actions"><input type="checkbox" data-internal-tie data-from-note="${escapeHTML(pair.fromNoteId)}" data-to-note="${escapeHTML(pair.toNoteId)}" ${pair.checked ? 'checked' : ''}>${pair.from && pair.to ? `${escapeHTML(midiName(pair.from.midi))} · ${pair.from.hand === 'right' ? '右手' : '左手'} · 第 ${escapeHTML(pair.from.beat)} → ${escapeHTML(pair.to.beat)} 拍` : '已失效的延音，请取消或清除'}</label>`).join('') || '<p class="fsi-muted">当前没有时间相接的同音候选。</p>'}</div><button type="button" data-action="clear-internal-ties">清除本行行内延音</button><p class="fsi-muted">跨行延音：只有本行开头或末尾的音符可以连接相邻行。勾选后不会重新触发同一持续音。</p><div class="fsi-review-table">${current.notes.filter(note => Math.abs(note.beat) < .00001 || Math.abs(note.beat + note.duration - current.durationBeats) < .00001).map(note => `<div class="fsi-actions"><span>${escapeHTML(Number.isInteger(note.midi) && note.midi >= 21 && note.midi <= 108 ? midiName(note.midi) : '待修正音符')} · ${note.hand === 'right' ? '右手' : '左手'} · 第 ${escapeHTML(note.beat)} 拍</span>${Math.abs(note.beat) < .00001 ? `<label><input type="checkbox" data-tie-direction="tieIn" data-note-id="${escapeHTML(note.id)}" ${current.continuity?.tieIn?.some(tie => tie?.noteId === note.id) ? 'checked' : ''}> 从上一行延续</label>` : ''}${Math.abs(note.beat + note.duration - current.durationBeats) < .00001 ? `<label><input type="checkbox" data-tie-direction="tieOut" data-note-id="${escapeHTML(note.id)}" ${current.continuity?.tieOut?.some(tie => tie?.noteId === note.id) ? 'checked' : ''}> 延续到下一行</label>` : ''}</div>`).join('')}</div><button type="button" data-action="clear-ties">清除本行跨行延音</button></details>` : '';
    const currentIssues = current?.status === 'complete' ? fullScoreRegionIssues(current) : [];
    const originalURL = current && state.stage === 'review' ? assets.get(current.id)?.url : thumbnails.get(state.activePage)?.url;
    root.innerHTML = `<div class="fsi-top"><div><h2>完整 PDF 识谱与校对</h2><p class="fsi-muted">所有页均需检查；逐行识别后，与原始钢琴谱逐行核对。失败或未审核的谱行会阻止完整导入。</p></div><button type="button" data-action="close" aria-label="关闭完整 PDF 识谱">关闭</button></div>
      <div class="fsi-meta"><label>乐谱名称<input data-meta="title" value="${escapeHTML(draft.title)}" maxlength="180" aria-label="完整乐谱名称"></label><label>速度 BPM<input data-meta="tempo" type="number" min="20" max="300" placeholder="自动识别" value="${draft.tempo ?? ''}" aria-label="全谱速度"></label><label>拍号<input data-meta="timeSignature" placeholder="例如 2/4" value="${draft.timeSignature?.join('/') || ''}" aria-label="全谱拍号"></label><label>调号<select data-meta="keySignature" aria-label="全谱调号"><option value="" ${draft.keySignature === undefined ? 'selected' : ''}>自动识别</option>${Array.from({ length: 15 }, (_, index) => index - 7).map(value => `<option value="${value}" ${draft.keySignature === value ? 'selected' : ''}>${value === 0 ? '无升降号' : value > 0 ? `${value} 个升号` : `${-value} 个降号`}</option>`).join('')}</select></label></div>
      <div class="fsi-flags"><label><input type="checkbox" data-piano-confirmed ${state.pianoConfirmed ? 'checked' : ''} ${state.scanning || isRunning() ? 'disabled' : ''}> 我已对照谱头/来源，确认这是钢琴双手五线谱</label></div>
      <div class="fsi-actions"><label>识谱服务商 <select data-recognition-engine ${state.job || isRunning() || state.scanning ? 'disabled' : ''}><option value="pi" ${state.engine==='pi'?'selected':''}>Pi Agent / ChatGPT</option><option value="deepseek" ${state.engine==='deepseek'?'selected':''}>DeepSeek · 按 API 用量计费</option></select></label><strong data-recognition-model>${state.engine==='deepseek'?'DeepSeek Flash':'GPT-6.1 Sol'} · ${state.job?.recognition?.reasoningEffort === 'low' ? 'low' : 'high'}</strong><label><input type="checkbox" data-auto-continue ${state.autoContinue ? 'checked' : ''} ${state.scanning || isRunning() ? 'disabled' : ''}> 自动继续全部谱行</label><button type="button" class="fsi-primary" data-action="start" ${state.scanning || state.busy || state.job?.status === 'running' || state.importing ? 'disabled' : ''}>${state.job ? '继续识别剩余谱行' : '一键识别全部选中谱行'}</button><button type="button" data-action="cancel" ${!state.scanning && !isRunning() ? 'disabled' : ''}>停止任务</button>${state.job ? '<button type="button" data-action="reset" ' + (isRunning() ? 'disabled' : '') + '>重新选择范围</button>' : ''}</div>
      <p class="fsi-muted">${selectedRegions().length} 个谱行全新识别基线为 ${state.engine==='deepseek'?'DeepSeek Flash':'GPT-6.1 Sol'} ${state.job?.recognition?.reasoningEffort === 'low' ? 'low' : 'high'} ${(state.job?.estimate?.modelCalls ?? state.job?.estimate?.piCalls ?? selectedRegions().length)} 次（每行仅首次识别）；重试另计，最多 100 行并行，可随时停止。相同原图复用已校对结果，中断保留已完成转写。${state.job?.calls ? `${state.job?.reuse?.hits ? ` 已复用 ${state.job.reuse.hits} 行，节省 ${state.job.reuse.savedCalls} 次模型调用。` : ''} ${state.job.reusedExactPdf ? '该任务历史' : '本任务'}已发起 ${state.engine==='deepseek'?'DeepSeek':'Pi'} 识别 ${state.job.calls.recognition || 0} 次。` : ''}</p>
      ${state.job ? `<div class="fsi-actions"><button type="button" class="fsi-primary" data-action="approve-all" ${isRunning() || state.importing || state.scanning || !state.scopeReviewed || !state.pianoConfirmed || selectedRegions().some(r => r.status !== 'complete') ? 'disabled' : ''}>一键审核通过并入库</button><label>重识别模型 <select data-retry-engine ${isRunning() || state.importing ? 'disabled' : ''}><option value="current" ${state.retryEngine === 'current' ? 'selected' : ''}>保持当前模型</option><option value="pi" ${state.retryEngine === 'pi' ? 'selected' : ''}>GPT-6.1 Sol · high</option><option value="deepseek" ${state.retryEngine === 'deepseek' ? 'selected' : ''}>DeepSeek Flash</option></select></label><label><input type="checkbox" data-retry-enlarge ${state.retryEnlarge ? 'checked' : ''} ${isRunning() || state.importing ? 'disabled' : ''}> 放大原图识别（最多 2 倍）</label><button type="button" data-action="retry-failed" ${isRunning() || state.importing || !failedCount ? 'disabled' : ''}>一键重新识别失败谱行（${failedCount}）</button></div><p class="fsi-muted">点击审核表示你已对照原谱检查全部结果；结构错误仍须修正。重识别仅处理失败或结构检查失败的谱行，保留其他结果；模型调用另计，换模型须先在 AI 设置连接对应服务。放大不会增加原图细节。</p>` : ''}
      <div class="fsi-status" role="status" aria-live="polite"><strong>${escapeHTML(state.message)}</strong><p>已检查 ${state.scannedPages} / ${draft.totalPages || '…'} 页 · ${processed} / ${total} 行已处理 · ${completed} 行已审核${state.busy && state.uploaded ? ` · 已上传 ${state.uploaded} 行` : ''}</p><progress max="${state.scanning ? draft.totalPages || 1 : total || 1}" value="${state.scanning ? state.scannedPages : processed}"></progress></div>
      ${state.error ? `<div class="fsi-error" role="alert">${escapeHTML(state.error)}</div>` : ''}
      <div class="fsi-workspace"><aside class="fsi-pages" aria-label="PDF 所有页面">${pageCards || '<p class="fsi-muted">正在读取页面…</p>'}</aside><main class="fsi-view"><div class="fsi-actions"><h3>第 ${state.activePage} 页${current ? ` · 第 ${current.system} 行` : ''}</h3><button type="button" data-action="scope" ${state.scanning || state.busy ? 'disabled' : ''}>页面与范围</button><button type="button" data-action="review" ${!current?.notes ? 'disabled' : ''}>逐音校对</button>${!scopeLocked() ? '<button type="button" data-action="select-crop">手动调整/补充谱行</button>' : ''}</div>
      ${pageInfo(state.activePage)?.assessment ? `<p class="fsi-muted">${escapeHTML(pageInfo(state.activePage).assessment.message)}</p>` : ''}
      <div class="fsi-regions" aria-label="当前页面全部谱行">${regionRows || '<p class="fsi-muted" style="padding:9px">此页未找到可用的双手谱行。请明确排除封面，或手动框选清晰双谱表。</p>'}</div>
      ${state.selecting ? '<div class="fsi-selector"><p>请切换“手动框选”，拖出完整的一行双手谱。添加/替换都必须包含谱号、上下加线及全部小节。</p><div data-crop-selector></div><div class="fsi-actions"><button type="button" data-action="add-crop">添加为新谱行</button><button type="button" data-action="replace-crop" ' + (!current ? 'disabled' : '') + '>替换当前谱行范围</button></div></div>' : `<div class="fsi-original${state.stage === 'review' && current?.notes ? ' can-locate' : ''}" data-original-frame>${originalURL ? `<img src="${escapeHTML(originalURL)}" alt="${state.stage === 'review' && current ? `${scopeLabel(current)}原始钢琴谱裁切；选中音符后可点击校准位置` : `PDF 第 ${state.activePage} 页原始谱面`}" data-original-image>` : '<p class="fsi-muted" style="padding:20px">正在准备原谱预览…</p>'}<span class="fsi-position" data-note-position hidden></span></div>`}
      ${state.stage === 'review' && current?.notes ? `<p class="fsi-muted">${current.positionlessSource ? '此结果未提供逐音原图坐标，审核后可使用数字乐谱，原图仅供对照。' : '选中某音符后在原图音头上点击，校准跟谱位置；新增音符必须定位。'}拍点以此行第 0 拍为起点。</p><div class="fsi-actions"><label>本行总拍数（含休止） <input type="number" min="0.0009765625" step="0.000001" data-region-duration value="${escapeHTML(current.durationBeats ?? '')}" aria-label="当前谱行总拍数" style="width:100px"></label><button type="button" data-action="add-note">新增音符</button><button type="button" data-action="preview">更新转写谱面预览</button><button type="button" data-action="retry-region" ${isRunning() ? 'disabled' : ''}>重新读取此行原图</button><button type="button" data-action="retry-enlarged" ${isRunning() || current.reviewed ? 'disabled' : ''}>放大／换模型重识别此行</button></div>${notesTable}${reviewAdvanced}${omrReviewMarkup(current)}<div class="fsi-mini-notation" data-notation-preview><p class="fsi-muted">点击“更新转写谱面预览”，与上方原始谱面对照。</p></div><label><input type="checkbox" data-region-coverage ${current.coverageComplete ? 'checked' : ''}> 已确认本行的全部小节、左右手及末尾休止均已转写</label>${current.warnings?.length ? `<div class="fsi-warning">${current.warnings.map(escapeHTML).join('<br>')}</div>` : ''}${currentIssues.length ? `<ul class="fsi-checklist">${currentIssues.slice(0, 8).map(issue => `<li>${escapeHTML(issue.message)}</li>`).join('')}</ul>` : ''}<div class="fsi-actions"><button type="button" class="fsi-primary" data-action="confirm-region" ${isRunning() || currentIssues.length ? 'disabled' : ''}>${current.reviewed ? '此行已审核；修改后需重新确认' : '确认此行已逐音校对'}</button><button type="button" data-action="next-unreviewed">下一个待校对谱行</button></div>` : current?.status === 'failed' ? `<div class="fsi-error">${escapeHTML(current.error || '此行识别失败，完整导入已被阻止。')}</div><button type="button" data-action="retry-region" ${isRunning() ? 'disabled' : ''}>重试此行</button><button type="button" data-action="retry-enlarged" ${isRunning() ? 'disabled' : ''}>放大原图后重试此行</button>` : ''}
      </main></div>
      <footer class="fsi-footer"><div><strong>${summary.reviewedCount} / ${summary.selectedCount} 行完成审核 · ${summary.noteCount} 音符</strong><p>${summary.musicExcluded ? '已排除含音乐的页面或谱行，导入名称会明确标注“所选谱段”。' : '仅全部选中谱行成功且逐行审核后，才能导入完整全谱。'}</p>${!summary.canImport && !state.scanning ? `<p class="fsi-muted">${escapeHTML(summary.issues[0]?.message || '')}</p>` : ''}</div><label><input type="checkbox" data-scope-reviewed ${state.scopeReviewed ? 'checked' : ''}> 我已确认全部页和谱行的处理范围，排除项均已检查</label><button type="button" class="fsi-primary" data-action="import" ${!summary.canImport || state.importing || isRunning() || !state.scopeReviewed ? 'disabled' : ''}>${state.importing ? '正在保存…' : summary.musicExcluded ? '审核后导入所选片段' : '审核后导入完整全谱'}</button>${state.job && state.job.regions.every(r=>r.result) ? `<button type="button" data-action="import-draft" ${state.importing || isRunning() || !state.scopeReviewed ? 'disabled' : ''}>导入AI草稿（待校对）</button>` : ''}</footer>`;
    if (state.busy || state.importing) for (const input of root.querySelectorAll('[data-note-field],[data-region-duration],[data-region-coverage],[data-rest-field],[data-measure-durations],[data-continuity],[data-tie-direction],[data-internal-tie]')) input.disabled = true;
    if (state.job) for (const input of root.querySelectorAll('[data-meta="timeSignature"],[data-meta="keySignature"]')) input.disabled = true;
    if (advancedOpen && root.querySelector('.fsi-advanced')) root.querySelector('.fsi-advanced').open = true;
    if (focus) {
      const input = focus.noteId && focus.field ? [...root.querySelectorAll('[data-note-field]')].find(element => element.dataset.noteId === focus.noteId && element.dataset.noteField === focus.field) : focus.meta ? [...root.querySelectorAll('[data-meta]')].find(element => element.dataset.meta === focus.meta) : focus.restField ? [...root.querySelectorAll('[data-rest-field]')].find(element => element.dataset.restField === focus.restField && element.dataset.restIndex === focus.restIndex) : null;
      input?.focus(); if (input?.type === 'text' && finite(focus.start)) input.setSelectionRange(focus.start, focus.start);
    }
    void renderActiveView(epoch).catch(error => { if (!disposed && epoch === renderEpoch) { state.error = errorText(error); const alert = document.createElement('p'); alert.className = 'fsi-error'; alert.setAttribute('role', 'alert'); alert.textContent = state.error; root.querySelector('.fsi-view')?.append(alert); } });
  }

  async function renderPage(pageNumber, targetWidth, { includePixels = false } = {}) {
    const work = pdfQueue.then(async () => {
      if (disposed) throw new Error('PDF 已关闭。');
      const page = await pdf.getPage(pageNumber), base = page.getViewport({ scale: 1 });
      let scale = Math.min(includePixels ? 3 : 2.5, targetWidth / base.width, 8000 / base.height);
      if (base.width * base.height * scale * scale > 20000000) scale *= Math.sqrt(20000000 / (base.width * base.height * scale * scale));
      const viewport = page.getViewport({ scale }), canvas = document.createElement('canvas');
      canvas.width = Math.max(20, Math.round(viewport.width)); canvas.height = Math.max(20, Math.round(viewport.height));
      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        return { blob: await canvasBlob(canvas), width: canvas.width, height: canvas.height, pdfWidth: base.width, pdfHeight: base.height, scale, ...(includePixels ? { pixels: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height) } : {}) };
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
    });
    pdfQueue = work.catch(() => {}); return work;
  }

  async function preparePage(pageNumber) {
    const rendered = await renderPage(pageNumber, 2200);
    return prepareScoreImage(rendered.blob, { page: pageNumber, pianoSourceVerified: source.pianoSourceVerified === true, sourceLabel: source.instrumentEvidence || source.label || '', maxDetectionDimension: 1600 });
  }

  async function ensurePrepared(pageNumber) {
    if (activePrepared?.page === pageNumber) return activePrepared;
    if (preparedPromise) { await preparedPromise; if (activePrepared?.page === pageNumber) return activePrepared; }
    const task = preparePage(pageNumber).then(prepared => {
      if (disposed) { prepared.destroy(); throw new Error('预览已关闭。'); }
      activePrepared?.destroy(); activePrepared = prepared; return prepared;
    });
    preparedPromise = task; try { return await task; } finally { if (preparedPromise === task) preparedPromise = null; }
  }

  async function renderActiveView(epoch) {
    const region = activeRegion();
    if (state.selecting) {
      const prepared = await ensurePrepared(state.activePage);
      if (disposed || epoch !== renderEpoch) return;
      const wrapped = { ...prepared, getAssessment: options => prepared.getAssessment({ ...options, confirmedPiano: state.pianoConfirmed || options?.confirmedPiano }), getSelection: options => prepared.getSelection({ ...options, confirmedPiano: state.pianoConfirmed || options?.confirmedPiano }) };
      selector = mountScoreImageSelector(root.querySelector('[data-crop-selector]'), wrapped);
    } else if (state.stage === 'review' && region?.notes) {
      if (!assets.has(region.id)) await ensureRegionAsset(region);
      if (disposed || epoch !== renderEpoch) return;
      const image = root.querySelector('[data-original-image]'); if (image) { image.addEventListener('load', updatePositionMarker, { once: true }); if (image.src !== assets.get(region.id).url) image.src = assets.get(region.id).url; }
      else { render(); return; }
      updatePositionMarker();
    }
  }

  function storeAsset(region, image, blob = blobFromImage(image)) {
    const previous = assets.get(region.id); if (previous?.url) URL.revokeObjectURL(previous.url);
    const value = { id: region.id, page: region.page, system: region.system, mimeType: blob.type || 'image/png', blob, url: URL.createObjectURL(blob) };
    assets.set(region.id, value); region.assetId = region.id; region.imageUrl = value.url; return value;
  }

  async function cropRegion(prepared, region) {
    const rect = normalizeCropRect(region.rect, prepared.width, prepared.height);
    const [image] = prepared.getSelection({ mode: 'manual', rect, confirmedPiano: state.pianoConfirmed });
    if (!image) throw new Error(`${scopeLabel(region)}未能生成谱面图片。`);
    storeAsset(region, image); return image;
  }

  async function ensureRegionAsset(region) {
    if (assets.has(region.id)) return assets.get(region.id);
    if (state.job?.regions?.find(candidate=>candidate.id===region.id)?.image && typeof api.readRegionImage === 'function') {
      try {
        const response = await api.readRegionImage(state.job.id, region.id);
        const image = response?.image || response;
        if (image instanceof Blob) return storeAsset(region, null, image);
        if (image?.data) return storeAsset(region, image);
      } catch { /* The original uploaded PDF remains the local source of truth. */ }
    }
    const prepared = await ensurePrepared(region.page); await cropRegion(prepared, region); return assets.get(region.id);
  }

  function updatePositionMarker() {
    const region = activeRegion(), note = state.selectedHeadIndex !== null ? region?.sourceHeadAudit?.unmapped?.[state.selectedHeadIndex] : region?.notes?.find(candidate => candidate.id === state.selectedNoteId), marker = root.querySelector('[data-note-position]');
    if (!marker) return;
    marker.hidden = !note || !finite(note.x) || !finite(note.y) || state.stage !== 'review';
    if (!marker.hidden) { const image = root.querySelector('[data-original-image]'); marker.style.left = `${(note.x - region.rect.x) / region.rect.width * (image?.clientWidth || 0)}px`; marker.style.top = `${(note.y - region.rect.y) / region.rect.height * (image?.clientHeight || 0)}px`; }
  }

  function edited(region) { region.reviewed = false; region.dirty = true; }

  function updateReviewControls() {
    const region = activeRegion(), confirm = root.querySelector('[data-action="confirm-region"]');
    if (confirm && region) confirm.disabled = isRunning() || fullScoreRegionIssues(region).length > 0;
    const button = root.querySelector('[data-action="import"]');
    if (button) button.disabled = state.importing || isRunning() || !state.scopeReviewed || !fullScoreReviewSummary(draft).canImport;
  }

  async function applyManualCrop(replace) {
    if (scopeLocked()) throw new Error('任务开始后不可更改源范围；请先停止并重新选择范围。');
    const options = selector?.getSelectionOptions();
    if (options?.mode !== 'manual' || !options.rect) throw new Error('请先切换“手动框选”，在原图上拖出完整的双手谱行。');
    const [image] = selector.getSelection();
    const page = pageInfo(state.activePage), current = activeRegion();
    if (replace && !current) throw new Error('请先选择要替换的谱行。');
    const rect = normalizeCropRect(image.region.rect, page.width, page.height);
    const region = replace ? current : { id: `p${page.page}-manual-${Date.now().toString(36)}-${++manualSequence}`, page: page.page, system: 1 };
    Object.assign(region, { rect, pageWidth: page.width, pageHeight: page.height, selected: true, excludeReason: '', status: 'pending', notes: undefined, reviewed: false, assetId: region.id });
    if (!replace) draft.regions.push(region);
    draft.regions.filter(candidate => candidate.page === page.page).sort((a, b) => a.rect.y - b.rect.y).forEach((candidate, index) => { candidate.system = index + 1; });
    storeAsset(region, image); page.decision = 'include'; state.activeRegionId = region.id; state.selecting = false;
    setMessage(`${scopeLabel(region)}已${replace ? '替换' : '添加'}；请确认没有重叠或漏掉其他谱行。`);
  }

  function applySnapshot(response) {
    const snapshot = unwrap(response); if (!snapshot?.id) return;
    state.job = { ...state.job, ...snapshot }; state.engine = snapshot.engine === 'deepseek' ? 'deepseek' : 'pi'; state.progress = snapshot.progress || state.progress;
    for (const remote of snapshot.regions || []) {
      const index = draft.regions.findIndex(region => region.id === remote.id); if (index < 0) continue;
      let local = draft.regions[index];
      if (remote.result) {
        const signature = JSON.stringify(remote.result);
        if (remoteSignatures.get(remote.id) !== signature && !local.dirty) {
          local = normalizeFullScoreRegionResult(local, remote.result); draft.regions[index] = local;
          remoteSignatures.set(remote.id, signature);
          if (!draft.tempo && remote.result.score?.tempo) draft.tempo = remote.result.score.tempo;
          if (!draft.timeSignature && remote.result.score?.timeSignature) draft.timeSignature = [...remote.result.score.timeSignature];
          if (draft.keySignature === undefined && finite(remote.result.score?.keySignature)) draft.keySignature = remote.result.score.keySignature;
        }
        if (remote.status === 'confirmed' || remote.result.reviewStatus === 'confirmed') local.reviewed = !local.dirty;
        local.status = 'complete';
      } else if (remote.status === 'failed') { local.status = 'failed'; local.error = typeof remote.error === 'object' ? remote.error.message : remote.error || '识别失败，请重试。'; }
      else if (['running', 'queued', 'pending'].includes(remote.status)) local.status = remote.status === 'running' ? 'running' : 'pending';
    }
    const firstReady = selectedRegions().find(region => region.notes && !region.reviewed);
    if (firstReady && (!activeRegion()?.notes || state.stage === 'scope')) { state.activePage = firstReady.page; state.activeRegionId = firstReady.id; state.selectedNoteId = firstReady.notes[0]?.id || ''; state.stage = 'review'; state.selecting = false; }
    state.message = snapshot.status === 'draft' ? '任务已创建，正在保存原谱，尚未开始识别。' : snapshot.status === 'running' ? '正在逐行识别；已完成的谱行现在可以开始校对。' : snapshot.status === 'paused' ? '任务已暂停；已识别结果保留，可校对或继续剩余谱行。' : snapshot.status === 'failed' ? '部分谱行失败，需重试或修正后才能完整导入。' : snapshot.status === 'cancelled' ? '任务已停止，已完成结果仍可查看。' : snapshot.status === 'complete' ? '所有谱行已通过审核，可导入练习。' : '识别结果已到达，请逐行对照原图审核。';
    render();
  }

  function poll() {
    clearTimeout(pollTimer);
    if (disposed || !state.job || state.job.status !== 'running') return;
    const intent = operationVersion, jobId = state.job.id;
    pollTimer = setTimeout(async () => {
      if (disposed) return;
      try { const response = await requireApi('getJob')(jobId); if (disposed || operationCancelled || intent !== operationVersion || jobId !== state.job?.id) return; applySnapshot(response); }
      catch (error) { if (!disposed && !operationCancelled && intent === operationVersion) { state.error = `读取任务进度失败：${errorText(error)}。识别结果不会当作已完成。`; render(); } }
      if (!disposed && state.job?.status === 'running') poll();
    }, 1500);
  }

  async function startRecognition() {
    if (state.scanning) throw new Error('请等待全部 PDF 页面检查完毕。');
    const issues = fullScoreScopeIssues(draft); if (issues.length) throw new Error(issues[0].message);
    if (!state.pianoConfirmed) throw new Error('请先对照谱头/来源，确认上传的是钢琴双手谱，而非照片或其他乐器谱。');
    const caps = capability(); if (!caps[state.engine]) throw new Error(state.engine==='deepseek'?'请先配置 DeepSeek API Key，并选择 deepseek-flash。':'Pi 识谱尚未连接，请先在 AI 设置中完成连接。');
    const skippedMusic = draft.regions.some(region => !region.selected && region.excludeReason === 'music' && pageInfo(region.page)?.decision === 'include');
    if (skippedMusic) throw new Error('当前整谱任务不能跳过同页中的音乐谱行。请保留这些行；封面和误检可明确排除。');
    const intent = ++operationVersion;
    operationCancelled = false; if (operationController.signal.aborted) operationController = new AbortController(); state.busy = true; state.uploaded = 0; state.error = ''; state.message = `正在准备全部谱行，随后使用 ${state.engine==='deepseek'?'DeepSeek Flash':'GPT-6.1 Sol'} high 首次识别。`; render();
    try {
      const regions = selectedRegions();
      if(!state.job && state.pdfHash && typeof api.findReviewedJob==='function'){
        const reused=await api.findReviewedJob(state.pdfHash,state.engine);assertAlive(intent);
        if(reused){restoreScope(reused);applySnapshot(reused);state.message='已复用同一服务商识别且已校对的相同 PDF，本次新增模型调用 0 次；请核对范围后导入。';render();return;}
      }
      if (!state.job) {
        const pageSystemCounts = new Map();
        const regionManifest = regions.map(region => { const system = (pageSystemCounts.get(region.page) || 0) + 1; pageSystemCounts.set(region.page, system); region.jobSystem = system; return { id: region.id, page: region.page, system, rect: region.rect, pageWidth: region.pageWidth, pageHeight: region.pageHeight, staffLines: region.staffLines, context: `${scopeLabel(region)}，仅识别此行完整双手小节；禁止补写前后谱行。`, ...(region.expectedMeasureCount ? { expectedMeasureCount: region.expectedMeasureCount } : {}) }; });
        const response = await requireApi('createJob')({ title: draft.title, composer: draft.composer || undefined, source, totalPages: draft.totalPages, pages: draft.pages.map(page => ({ page: page.page, width: page.width, height: page.height, pdfWidth: page.pdfWidth, pdfHeight: page.pdfHeight })), regions: regionManifest, excludedPages: draft.pages.filter(page => page.decision === 'exclude').map(page => ({ page: page.page, reason: page.excludeReason })), needsUserScopeConfirmation: true, engineChoice: state.engine, tempo: draft.tempo, timeSignature: draft.timeSignature, keySignature: draft.keySignature }, { signal: operationController.signal });
        if (await cancelLateResponse(response, undefined, intent)) return;
        assertAlive(intent); applySnapshot(response);
      }
      if (!state.job.originalPdf?.uploaded && !state.job.originalPdf?.bytes) {
        const upload = api.uploadDocument || api.uploadPdf;
        if (typeof upload !== 'function') throw new Error('服务器尚未提供原始 PDF 上传接口，无法保存可恢复的识谱任务。');
        state.message = '正在将原始 PDF 保存到本机任务，刷新后可以恢复；此步骤不调用模型。'; render();
        const image = await blobImage(file); assertAlive(intent); const response = await upload(state.job.id, { ...image, mimeType: 'application/pdf', name: file.name || 'score.pdf' });
        assertAlive(intent); applySnapshot(response);
      }
      // Upload every pending row for GPT; retain already recognized legacy rows.
      // Preparing missing images must never erase approved historical results.
      let prepared, preparedPage;
      try {
        for (const region of regions) {
          assertAlive(intent);
          const existing = state.job.regions?.find(candidate => candidate.id === region.id);
          if (existing?.image || existing?.result) { state.uploaded++; continue; }
          if (region.page !== preparedPage) { prepared?.destroy(); prepared = await preparePage(region.page); preparedPage = region.page; assertAlive(intent); }
          const image = assets.has(region.id) ? await blobImage(assets.get(region.id).blob) : await cropRegion(prepared, region);
          assertAlive(intent);
          // Revalidate every actual crop even when an earlier manual preview cached it.
          if (assets.has(region.id)) prepared.getSelection({ mode: 'manual', rect: region.rect, confirmedPiano: state.pianoConfirmed });
          await requireApi('uploadRegion')(state.job.id, region.id, { image: { data: image.data, mimeType: image.mimeType } }, { signal: operationController.signal });
          assertAlive(intent); state.uploaded++; state.message = `谱行已上传 ${state.uploaded} / ${regions.length}，全部源范围都保留在任务中。`; render();
        }
      } finally { prepared?.destroy(); }
      assertAlive(intent);
      const started = await requireApi('startJob')(state.job.id, { autoContinue: state.autoContinue, batchSize: 2, expectedVersion: state.job.runVersion }, { signal: operationController.signal });
      if (await cancelLateResponse(started, state.job.id, intent)) return;
      applySnapshot(started); poll();
    } catch (error) { if (disposed || operationCancelled || intent !== operationVersion) return; throw error; }
    finally { if (intent === operationVersion) { state.busy = false; if (!disposed) render(); } }
  }

  async function cancel() {
    scanCancelled = true; operationCancelled = true; operationVersion++; operationController.abort(); clearTimeout(pollTimer);
    if (state.job && (state.job.status === 'running' || state.busy) && typeof api.cancelJob === 'function') {
      try { applySnapshot(await api.cancelJob(state.job.id)); }
      catch (error) { if (!disposed) state.error = `停止请求失败：${errorText(error)}。请重试停止。`; }
    }
    if (!disposed) { state.busy = false; state.message = state.scanning ? '已停止继续扫描；尚未检查的页面会阻止完整导入。请关闭后重新导入以继续。' : '任务已停止，已完成的结果保留。'; render(); }
  }

  async function confirmRegion(region = activeRegion(), batch = false) {
    if (!region) return;
    if (state.job?.status === 'running') throw new Error('可以先编辑校对；请等待识别任务结束或停止后再提交此行审核。');
    const issues = fullScoreRegionIssues(region); if (issues.length) throw new Error(issues[0].message);
    if (!state.job) throw new Error('此谱行没有对应的服务器识别任务。');
    const rawScore = { ...region.score, title: `${draft.title} · ${scopeLabel(region)}`, durationBeats: region.durationBeats, notes: region.notes };
    const score = region.notes.length ? validateScore(rawScore) : { ...rawScore, notes: [] };
    const originals = new Map(region.notes.map(note => [note.id, note]));
    score.notes = score.notes.map(note => ({ ...note, voice: originals.get(note.id)?.voice || `${note.hand}-1` }));
    const editedResult = { score, positions: region.notes.filter(note => finite(note.x) && finite(note.y)).map(note => ({ noteId: note.id, x: note.x, y: note.y, coordinateSpace: 'page' })), rests: region.rests || [], coverage: { ...region.coverage, complete: region.coverageComplete }, continuity: region.continuity || {}, internalTies: region.internalTies || [], corrections: region.corrections || [], sourceHeadAudit: region.sourceHeadAudit, tieAudit: region.tieAudit, warnings: region.warnings || [] };
    state.busy = true; state.error = ''; state.message = `正在提交${scopeLabel(region)}的人工审核。`; render();
    try {
      const response = await requireApi('confirmRegion')(state.job.id, region.id, editedResult);
      region.reviewed = true; region.dirty = false; applySnapshot(response);
      const now = draft.regions.find(candidate => candidate.id === region.id); if (now) { now.reviewed = true; now.dirty = false; }
      state.message = `${scopeLabel(region)}已审核；音符修改后会要求重新确认。`;
    } finally { if (!batch) state.busy = false; if (!disposed) render(); }
  }

  async function approveAll() {
    if (!state.scopeReviewed || !state.pianoConfirmed) throw new Error('请先确认钢琴双手谱和全部页、谱行范围。');
    const regions = selectedRegions();
    if (!regions.length || isRunning()) return;
    for (const region of regions) {
      const issues = fullScoreRegionIssues(region);
      if (issues.length) { state.activeRegionId = region.id; state.activePage = region.page; state.stage = 'review'; throw new Error(`${scopeLabel(region)}：${issues[0].message}`); }
    }
    const checked = fullScoreReviewSummary({ ...draft, regions: draft.regions.map(r => ({ ...r, reviewed: true })) });
    if (checked.issues.length) throw new Error(checked.issues[0].message);
    const intent = ++operationVersion; operationCancelled = false; state.busy = true; render();
    try {
      for (const region of regions) { assertAlive(intent); if (!region.reviewed || region.dirty) await confirmRegion(draft.regions.find(r => r.id === region.id), true); }
      assertAlive(intent); await importReviewed();
    } finally { state.busy = false; if (!disposed) render(); }
  }

  async function importUnreviewed(){
    if(!state.scopeReviewed||!state.pianoConfirmed)throw new Error('请先确认钢琴谱身份和全部页、谱行范围。');
    state.importing=true;state.error='';render();
    try{const response=unwrap(await requireApi('exportDraft')(state.job.id,{scopeConfirmed:true})),final=response.result;if(!final?.score||!final.sourceNotation)throw new Error('整谱草稿尚未完整识别。');
      const score=validateScore({...final.score,title:draft.title+' · AI草稿（待校对）'}),selectedAssets=[];
      for(const region of selectedRegions()){const asset=await ensureRegionAsset(region);selectedAssets.push({id:region.id,page:region.page,system:region.system,blob:asset.blob,mimeType:asset.mimeType,rect:{...region.rect}});}
      const sourceNotation={...final.sourceNotation,title:score.title,scoreId:score.id,coordinateUnit:'page-image-pixels',systems:final.sourceNotation.systems.map(system=>({...system,assetId:system.id,imageUrl:assets.get(system.id).url}))};
      await onImport({score,sourceNotation,measureMap:final.measureMap,assets:selectedAssets,warnings:final.warnings,reviewStatus:{method:'ai-unreviewed',complete:false,humanConfirmed:false}});
    }finally{state.importing=false;if(!disposed)render();}
  }

  async function importReviewed() {
    const summary = fullScoreReviewSummary(draft); if (!summary.canImport) throw new Error(summary.issues[0]?.message || '尚未完成全部校对。');
    if (!state.scopeReviewed) throw new Error('请先确认已逐页核对全部谱行范围与排除项。');
    state.importing = true; state.error = ''; render();
    try {
      if (state.job) applySnapshot(await requireApi('confirmJob')(state.job.id, { scopeConfirmed: true }));
      const local = assembleFullScoreReview(draft), final = state.job?.result;
      if (!final?.score || !final.sourceNotation || state.job.status !== 'complete') throw new Error('服务器尚未确认所有谱行及跨行连续性；不会导入部分结果冒充全谱。');
      // The server merges cross-line ties and preserves the actual pickup and
      // measure map. Do not replace its timeline with fixed-length measures.
      const score = validateScore({ ...final.score, title: local.score.title, tempo: draft.tempo || final.score.tempo, source: local.score.source });
      const selectedAssets = [];
      for (const region of summary.selected) {
        const asset = await ensureRegionAsset(region);
        selectedAssets.push({ id: region.id, page: region.page, system: region.system, blob: asset.blob, mimeType: asset.mimeType, rect: { ...region.rect } });
      }
      const sourceNotation = { ...final.sourceNotation, title: score.title, scoreId: score.id, source: score.source, coordinateUnit: 'page-image-pixels', measureMap: final.measureMap || final.sourceNotation.measureMap, systems: final.sourceNotation.systems.map(system => { const region = summary.selected.find(candidate => candidate.id === system.id || candidate.page === system.page && (candidate.jobSystem || candidate.system) === system.system); return { ...system, assetId: region?.id || system.assetId || system.id, imageUrl: region ? assets.get(region.id).url : system.imageUrl }; }) };
      const warnings=[...new Set([...(final.warnings||[]),...summary.selected.flatMap(region=>region.warnings||[])])];
      await onImport({ score, sourceNotation, measureMap: final.measureMap || sourceNotation.measureMap, assets: selectedAssets, warnings, reviewStatus: { ...local.reviewStatus, method: final.reviewStatus || local.reviewStatus.method } });
      if (!disposed) { state.message = '已保存完整乐谱与原始谱行图片。'; render(); }
    } finally { state.importing = false; if (!disposed) render(); }
  }

  async function retryRegion(regionId = state.activeRegionId, phase = 'recognize') {
    const region = draft.regions.find(candidate => candidate.id === regionId); if (!region || !state.job) throw new Error('请先创建识别任务。');
    const intent = ++operationVersion; operationCancelled = false; if (operationController.signal.aborted) operationController = new AbortController();
    region.reviewed = false; region.dirty = false; remoteSignatures.delete(region.id);
    state.busy = true; state.error = ''; render();
    try {
      const saved=state.job.regions?.find(candidate=>candidate.id===region.id);
      if (!saved?.image) {
        const prepared=await ensurePrepared(region.page),image=await cropRegion(prepared,region);assertAlive(intent);
        const uploaded=await requireApi('uploadRegion')(state.job.id,region.id,{image:{data:image.data,mimeType:image.mimeType}},{signal:operationController.signal});assertAlive(intent);applySnapshot(uploaded);
      }
      const response = await requireApi('retryRegion')(state.job.id, region.id, { engine: retryEngine(), expectedVersion: state.job.runVersion, phase }, { signal: operationController.signal }); if (await cancelLateResponse(response, state.job.id, intent)) return; applySnapshot(response); poll();
    }
    catch (error) { if (disposed || operationCancelled || intent !== operationVersion) return; throw error; }
    finally { if (intent === operationVersion) { state.busy = false; if (!disposed) render(); } }
  }

  function retryEngine() {
    const engine = state.retryEngine === 'current' ? state.engine : state.retryEngine;
    if (!capability()[engine]) throw new Error(engine === 'deepseek' ? '请先在 AI 设置连接 DeepSeek。' : '请先在 AI 设置连接 Pi / ChatGPT。');
    return engine;
  }

  async function enlargeRegion(region, intent) {
    let bitmap, canvas;
    try {
      const original = await requireApi('readRegionImage')(state.job.id, region.id); assertAlive(intent);
      bitmap = await createImageBitmap(original); assertAlive(intent);
      const scale = Math.min(2, 4000 / bitmap.width, 4000 / bitmap.height, Math.sqrt(12000000 / (bitmap.width * bitmap.height)));
      // Images already at the size limit can still be reread or sent to another model.
      if (scale <= 1) return;
      canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas), image = await blobImage(blob); assertAlive(intent);
      const uploaded = await requireApi('uploadRegion')(state.job.id, region.id, { image }, { signal: operationController.signal }); assertAlive(intent);
      storeAsset(region, image, blob); remoteSignatures.delete(region.id); applySnapshot(uploaded);
    } finally { bitmap?.close(); if (canvas) { canvas.width = 0; canvas.height = 0; } }
  }

  async function retryFailed({ single = false, enlarge = state.retryEnlarge } = {}) {
    if (!state.job || isRunning()) return;
    const engine = retryEngine();
    const ids = single ? [state.activeRegionId] : state.job.regions.filter(r => r.status === 'failed' || r.status !== 'confirmed' && r.result?.checks?.passed === false).map(r => r.id);
    const regions = ids.map(id => draft.regions.find(r => r.id === id));
    if (!regions.length) throw new Error('没有需要重新识别的失败谱行。');
    if (regions.some(r => !r || r.reviewed)) throw new Error('已审核谱行请通过人工校对修改。');
    const intent = ++operationVersion; operationCancelled = false;
    if (operationController.signal.aborted) operationController = new AbortController();
    clearTimeout(pollTimer); state.busy = true; state.error = ''; state.message = `正在准备重新识别 ${ids.length} 个谱行。`; render();
    try {
      if (enlarge) for (const region of regions) { assertAlive(intent); await enlargeRegion(region, intent); }
      assertAlive(intent);
      const response = await requireApi('retryRegions')(state.job.id, { engine, regionIds: ids, expectedVersion: state.job.runVersion }, { signal: operationController.signal });
      if (await cancelLateResponse(response, state.job.id, intent)) return;
      for (const region of regions) { region.dirty = false; region.reviewed = false; remoteSignatures.delete(region.id); }
      applySnapshot(response); poll();
    } finally { if (intent === operationVersion) { state.busy = false; if (!disposed) render(); } }
  }

  async function retryEnlargedRegion() { await retryFailed({ single: true, enlarge: true }); }

  async function preview() {
    const region = activeRegion(), element = root.querySelector('[data-notation-preview]'); if (!region || !element) return;
    if (!region.notes?.length) { element.textContent = `此行为全休止谱行，共 ${region.durationBeats} 拍。请对照上方原图及休止表，确认两只手的全部休止时段。`; return; }
    try {
      const score = validateScore({ ...region.score, durationBeats: region.durationBeats, notes: region.notes });
      const { renderNotation } = await import('./notation.js'); if (disposed || !element.isConnected) return;
      previewRenderer?.destroy(); previewRenderer = renderNotation(element, score, { mode: 'staff', autoScroll: false, onSeek: beat => { state.selectedNoteId = region.notes.find(note => Math.abs(note.beat - beat) < .00001)?.id || state.selectedNoteId; updatePositionMarker(); } });
      previewRenderer.setBeat(0);
    } catch (error) { element.textContent = `当前修改尚不能排版：${errorText(error)}。请继续对照原图修正。`; }
  }

  root.addEventListener('click', event => {
    const action = event.target.closest('[data-action]');
    if (!action || action.disabled) return;
    if ((state.busy || state.importing) && ['approve-all', 'retry-failed', 'import-draft', 'add-note', 'delete-note', 'add-rest', 'delete-rest', 'clear-ties', 'clear-internal-ties', 'confirm-region', 'retry-region', 'retry-enlarged', 'import', 'add-crop', 'replace-crop', 'reset'].includes(action.dataset.action)) return;
    void (async () => {
      state.error = '';
      switch (action.dataset.action) {
        case 'close': await cancel(); onClose(); break;
        case 'page': state.activePage = Number(action.dataset.page); state.activeRegionId = draft.regions.find(region => region.page === state.activePage && region.selected)?.id || ''; state.selecting = false; render(); break;
        case 'region': { state.selectedHeadIndex = null; const region = draft.regions.find(candidate => candidate.id === action.dataset.regionId); state.activeRegionId = region.id; state.activePage = region.page; state.stage = region.notes ? 'review' : 'scope'; state.selectedNoteId = region.notes?.[0]?.id || ''; state.selecting = false; render(); break; }
        case 'scope': state.stage = 'scope'; state.selecting = false; render(); break;
        case 'review': state.stage = 'review'; state.selecting = false; render(); break;
        case 'select-crop': state.selecting = true; state.stage = 'scope'; render(); break;
        case 'add-crop': await applyManualCrop(false); break;
        case 'replace-crop': await applyManualCrop(true); break;
        case 'start': await startRecognition(); break;
        case 'cancel': await cancel(); break;
        case 'approve-all': await approveAll(); break;
        case 'retry-failed': await retryFailed(); break;
        case 'retry-region': await retryRegion(); break;
        case 'retry-enlarged': await retryEnlargedRegion(); break;
        case 'reset': await cancel(); state.job = null; state.progress = null; state.stage = 'scope'; draft.regions.forEach(region => { region.status = 'pending'; region.reviewed = false; region.dirty = false; region.notes = undefined; }); remoteSignatures.clear(); state.message = '可重新选择页面与谱行；旧任务已停止。'; render(); break;
        case 'select-note': state.selectedHeadIndex = null; state.selectedNoteId = action.dataset.noteId; render(); break;
        case 'source-head': state.selectedHeadIndex = Number(action.dataset.headIndex); state.selectedNoteId = ''; render(); break;
        case 'add-note': { state.selectedHeadIndex = null; const region = activeRegion(); if (!region?.notes) break; const note = { id: `manual-${Date.now().toString(36)}-${++manualSequence}`, midi: 60, beat: 0, duration: .25, hand: 'right', voice: 'right-1', velocity: .75, x: null, y: null }; region.notes.push(note); state.selectedNoteId = note.id; edited(region); render(); break; }
        case 'delete-note': { const region = activeRegion(); region.notes = region.notes.filter(note => note.id !== action.dataset.noteId); edited(region); render(); break; }
        case 'add-rest': { const region = activeRegion(); region.rests ||= []; region.rests.push({ beat: 0, duration: .5, hand: 'left', voice: 'left-1' }); edited(region); render(); break; }
        case 'delete-rest': { const region = activeRegion(); region.rests.splice(Number(action.dataset.restIndex), 1); edited(region); render(); break; }
        case 'clear-ties': { const region = activeRegion(); region.continuity = { tieIn: [], tieOut: [] }; edited(region); render(); break; }
        case 'clear-internal-ties': { const region = activeRegion(); region.internalTies = []; edited(region); render(); break; }
        case 'confirm-region': await confirmRegion(); break;
        case 'next-unreviewed': { const regions = selectedRegions(), currentIndex = regions.findIndex(region => region.id === state.activeRegionId), next = [...regions.slice(currentIndex + 1), ...regions.slice(0, currentIndex + 1)].find(region => !region.reviewed && region.notes); if (next) { state.activePage = next.page; state.activeRegionId = next.id; state.selectedNoteId = next.notes[0]?.id || ''; state.selectedHeadIndex = null; state.stage = 'review'; render(); } else setMessage('当前没有已完成识别且待审核的谱行；请等待剩余任务或重试失败谱行。'); break; }
        case 'preview': await preview(); break;
        case 'import': await importReviewed(); break;
        case 'import-draft': await importUnreviewed(); break;
      }
    })().catch(error => { if (!disposed) { state.busy = false; state.error = errorText(error); render(); } });
  });

  root.addEventListener('change', event => {
    const input = event.target;
    if (input.dataset.meta) {
      if (input.dataset.meta === 'title') draft.title = input.value;
      else if (input.dataset.meta === 'timeSignature') { const match = input.value.trim().match(/^(\d{1,2})\s*\/\s*(1|2|4|8|16)$/); draft.timeSignature = match ? [Number(match[1]), Number(match[2])] : undefined; if (input.value && !match) state.error = '拍号应类似 2/4 或 6/8。'; }
      else draft[input.dataset.meta] = numberValue(input.value);
    } else if (input.hasAttribute('data-retry-engine')) state.retryEngine = input.value;
    else if (input.hasAttribute('data-retry-enlarge')) state.retryEnlarge = input.checked;
    else if (input.hasAttribute('data-piano-confirmed')) state.pianoConfirmed = input.checked;
    else if (input.hasAttribute('data-tie-reviewed')) { const region = activeRegion(); region.tieAudit.reviewed = input.checked; edited(region); }
    else if (input.hasAttribute('data-head-reviewed')) { const region = activeRegion(); region.sourceHeadAudit.reviewed = input.checked; edited(region); }
    else if (input.hasAttribute('data-scope-reviewed')) state.scopeReviewed = input.checked;
    else if (input.hasAttribute('data-recognition-engine') && !state.job) state.engine = input.value === 'deepseek' ? 'deepseek' : 'pi';
    else if (input.hasAttribute('data-auto-continue')) state.autoContinue = input.checked;
    else if (input.dataset.pageDecision) { const page = pageInfo(Number(input.dataset.pageDecision)); page.decision = ['include', 'pending'].includes(input.value) ? input.value : 'exclude'; page.excludeReason = page.decision === 'exclude' ? input.value : ''; }
    else if (input.dataset.regionSelected) { const region = draft.regions.find(candidate => candidate.id === input.dataset.regionSelected); region.selected = input.checked; region.excludeReason = ''; }
    else if (input.dataset.regionReason) draft.regions.find(region => region.id === input.dataset.regionReason).excludeReason = input.value;
    else if (input.hasAttribute('data-region-duration')) { const region = activeRegion(); region.durationBeats = numberValue(input.value); edited(region); }
    else if (input.hasAttribute('data-region-coverage')) { const region = activeRegion(); region.coverageComplete = input.checked; edited(region); }
    else if (input.hasAttribute('data-measure-durations')) { const region = activeRegion(); const values = input.value.trim().split(/[,，\s]+/).filter(Boolean).map(Number); region.coverage ||= {}; region.coverage.measureDurations = values; region.coverage.measureCount = values.length; edited(region); }
    else if (input.dataset.tieDirection) { const region = activeRegion(); region.continuity ||= { tieIn: [], tieOut: [] }; const direction = input.dataset.tieDirection; region.continuity[direction] = (region.continuity[direction] || []).filter(tie => tie?.noteId !== input.dataset.noteId); if (input.checked) region.continuity[direction].push({ noteId: input.dataset.noteId }); edited(region); }
    else if (input.hasAttribute('data-internal-tie')) { const region = activeRegion(); region.internalTies = (region.internalTies || []).filter(tie => tie.fromNoteId !== input.dataset.fromNote || tie.toNoteId !== input.dataset.toNote); if (input.checked) region.internalTies.push({ fromNoteId: input.dataset.fromNote, toNoteId: input.dataset.toNote }); edited(region); }
    else if (input.hasAttribute('data-continuity')) { try { const value = JSON.parse(input.value); if (!Array.isArray(value.tieIn) || !Array.isArray(value.tieOut)) throw new Error(); const region = activeRegion(); region.continuity = value; edited(region); } catch { state.error = '跨行延音须为含 tieIn、tieOut 两个数组的 JSON。'; } }
    if (!input.dataset.noteField) render();
  });

  root.addEventListener('input', event => {
    const input = event.target;
    if (input.dataset.meta) {
      if (input.dataset.meta === 'title') draft.title = input.value;
      else if (input.dataset.meta === 'tempo') draft.tempo = numberValue(input.value);
      else if (input.dataset.meta === 'timeSignature') { const match = input.value.trim().match(/^(\d{1,2})\s*\/\s*(1|2|4|8|16)$/); if (match) draft.timeSignature = [Number(match[1]), Number(match[2])]; else if (!input.value) draft.timeSignature = undefined; }
      else if (input.dataset.meta === 'keySignature') draft.keySignature = numberValue(input.value);
      return;
    }
    if (input.hasAttribute('data-region-duration')) { const region = activeRegion(); region.durationBeats = numberValue(input.value); edited(region); updateReviewControls(); return; }
    if (input.hasAttribute('data-measure-durations')) { const region = activeRegion(); const values = input.value.trim().split(/[,，\s]+/).filter(Boolean).map(Number); region.coverage ||= {}; region.coverage.measureDurations = values; region.coverage.measureCount = values.length; edited(region); updateReviewControls(); return; }
    if (input.dataset.restField) { const region = activeRegion(), rest = region?.rests?.[Number(input.dataset.restIndex)]; if (rest) { rest[input.dataset.restField] = ['hand', 'voice'].includes(input.dataset.restField) ? input.value : numberValue(input.value); edited(region); updateReviewControls(); } return; }
    if (!input.dataset.noteField) return;
    const region = activeRegion(), note = region?.notes?.find(candidate => candidate.id === input.dataset.noteId); if (!note) return;
    note[input.dataset.noteField] = ['hand', 'voice'].includes(input.dataset.noteField) ? input.value : numberValue(input.value); edited(region);
    const name = input.parentElement.querySelector('.fsi-note-name'); if (name) name.textContent = Number.isInteger(note.midi) && note.midi >= 21 && note.midi <= 108 ? midiName(note.midi) : '';
    updateReviewControls();
  });

  root.addEventListener('pointerdown', event => {
    const image = event.target.closest('[data-original-image]'), region = activeRegion();
    if (!image || state.stage !== 'review' || !region?.notes || event.button !== 0 || state.busy || state.importing) return;
    const note = region.notes.find(candidate => candidate.id === state.selectedNoteId); if (!note) { setMessage('请先在下方表格选中一个音符，再点击它在原图上的音头位置。'); return; }
    const bounds = image.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
    note.x = region.rect.x + Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * region.rect.width;
    note.y = region.rect.y + Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) * region.rect.height;
    edited(region); render();
  });

  function restoreScope(saved) {
      const metadata = saved.metadata || {};
      draft.id = saved.id; draft.title = metadata.title || saved.title || draft.title; draft.composer = metadata.composer || draft.composer;
      draft.tempo = metadata.tempo; draft.timeSignature = metadata.timeSignature; draft.keySignature = metadata.keySignature;
      const excluded = new Map((saved.excludedPages || []).map(page => [page.page, page.reason]));
      for (const page of draft.pages) { page.decision = excluded.has(page.page) ? 'exclude' : 'include'; page.excludeReason = excluded.get(page.page) || ''; }
      const detected = new Map(draft.regions.map(region => [region.id, region]));
      draft.regions = (saved.regions || []).map(region => ({ ...detected.get(region.id), id: region.id, page: region.page, system: region.system, jobSystem: region.system, rect: { ...region.rect }, pageWidth: region.pageWidth || pageInfo(region.page)?.width, pageHeight: region.pageHeight || pageInfo(region.page)?.height, selected: true, excludeReason: '', status: 'pending', reviewed: false, assetId: region.id }));
      state.activeRegionId = draft.regions[0]?.id || ''; state.activePage = draft.regions[0]?.page || 1;
  }

  async function initialize() {
    await validateFullScorePdfUpload(file);
    let saved = unwrap(resumeJob);
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      state.pdfHash=hash;
      if (saved?.originalPdf?.sha256 && hash !== saved.originalPdf.sha256) throw new Error('恢复任务的 PDF 与原始文件不一致，不能复用先前音符与坐标。');
    }
    const [pdfjs, capabilities] = await Promise.all([import('pdfjs-dist'), typeof api.getCapabilities === 'function' ? Promise.resolve(api.getCapabilities()).catch(() => null) : Promise.resolve(null)]);
    if (disposed) return;
    state.capabilities = capabilities;
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    documentTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, wasmUrl: assetURL('/pdfjs/wasm/'), standardFontDataUrl: assetURL('/pdfjs/standard_fonts/'), cMapUrl: assetURL('/pdfjs/cmaps/'), cMapPacked: true });
    pdf = await documentTask.promise; if (disposed) return;
    if (pdf.numPages > 200) throw new Error('PDF 超过 200 页，请先提取明确的练习范围。不会截取前 200 页冒充全谱。');
    draft.totalPages = pdf.numPages; render();
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      if (disposed || scanCancelled) break;
      // An 800px preview can erase thin staff lines in image-only PDFs after
      // resampling. Detect at 1600px; pages are still processed sequentially.
      const low = await renderPage(pageNumber, 1600, { includePixels: true });
      if (disposed || scanCancelled) break;
      const prepared = await prepareScoreImage(low.blob, { page: pageNumber, pianoSourceVerified: source.pianoSourceVerified === true, sourceLabel: source.instrumentEvidence || source.label || '' });
      try {
        const highScale = Math.min(2.5, 2200 / low.pdfWidth, 8000 / low.pdfHeight);
        let safeScale = highScale; if (low.pdfWidth * low.pdfHeight * safeScale * safeScale > 20000000) safeScale *= Math.sqrt(20000000 / (low.pdfWidth * low.pdfHeight * safeScale * safeScale));
        const width = Math.max(20, Math.round(low.pdfWidth * safeScale)), height = Math.max(20, Math.round(low.pdfHeight * safeScale));
        const sx = width / prepared.width, sy = height / prepared.height;
        const completeRects = new Map(completePianoSystemRects(low.pixels, prepared.layout).map(system => [system.id, system.rect]));
        const page = { page: pageNumber, scanned: true, width, height, pdfWidth: low.pdfWidth, pdfHeight: low.pdfHeight, assessment: prepared.assessment, decision: prepared.assessment.hasGrandStaff ? 'include' : 'pending', excludeReason: '' };
        draft.pages.push(page); thumbnails.set(pageNumber, { blob: low.blob, url: URL.createObjectURL(low.blob) });
        for (const system of prepared.systems) {
          const completeRect = completeRects.get(system.id) || system.rect;
          const rect = normalizeCropRect({ x: completeRect.x * sx, y: completeRect.y * sy, width: completeRect.width * sx, height: completeRect.height * sy }, width, height);
          draft.regions.push({ id: `p${pageNumber}-s${system.index + 1}`, page: pageNumber, system: system.index + 1, rect, pageWidth: width, pageHeight: height, staffLines: { right: system.staffs[0]?.lines.map(y => y * sy) || [], left: system.staffs[1]?.lines.map(y => y * sy) || [] }, selected: system.staffs.length === 2 && prepared.assessment.hasGrandStaff, excludeReason: '', status: 'pending', reviewed: false, assetId: `p${pageNumber}-s${system.index + 1}` });
        }
        if (!state.activeRegionId) state.activeRegionId = draft.regions.find(region => region.selected)?.id || '';
      } finally { prepared.destroy(); }
      state.scannedPages = pageNumber; state.message = `正在逐页检查：第 ${pageNumber} / ${pdf.numPages} 页，发现 ${draft.regions.length} 个谱行候选。`; render();
    }
    state.scanning = false;
    if (!scanCancelled && saved?.id) {
      restoreScope(saved);
      applySnapshot(saved); state.message = saved.reusedExactPdf ? `已复用相同 PDF 的已校对全谱：${draft.totalPages} 页、${draft.regions.length} 行，本次新增模型调用 0 次。原图与校对结果保留，请确认范围后导入。` : `已恢复保存的任务：${draft.totalPages} 页、${draft.regions.length} 行。原图、已识别结果与审核状态保留；请再次核对范围确认。`;
      if (saved.status === 'running') poll();
      render(); return;
    }
    state.message = scanCancelled ? '扫描已停止；未检查页面会阻止完整导入。请关闭并重新上传继续。' : `全部 ${pdf.numPages} 页已检查。请排除封面/空白页，核对每个谱行是否完整包含两只手。`;
    render();
  }

  function destroy() {
    if (disposed) return;
    disposed = true; scanCancelled = true; operationCancelled = true; operationController.abort(); clearTimeout(pollTimer);
    if (state.job?.status === 'running' && typeof api.cancelJob === 'function') void api.cancelJob(state.job.id).catch(() => {});
    selector?.destroy(); previewRenderer?.destroy(); activePrepared?.destroy();
    for (const asset of assets.values()) URL.revokeObjectURL(asset.url);
    for (const thumbnail of thumbnails.values()) URL.revokeObjectURL(thumbnail.url);
    assets.clear(); thumbnails.clear(); void documentTask?.destroy(); root.remove();
  }

  render();
  const ready = initialize().catch(error => { if (!disposed) { state.scanning = false; state.error = errorText(error); state.message = 'PDF 尚未完成检查，无法启动完整识谱。'; render(); } });
  return { ready, destroy, cancel, getDraft: () => draft };
}
