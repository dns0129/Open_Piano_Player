import { detectScoreSystems, normalizeCropRect, planScoreImageChunks } from '../lib/score-image-layout.mjs';

const rectAtScale = (rect, sx, sy, width, height) => normalizeCropRect({ x: rect.x * sx, y: rect.y * sy, width: rect.width * sx, height: rect.height * sy }, width, height);
function cropCanvas(source, rect, maxWidth = Infinity) {
  const scale = Math.min(1, maxWidth / rect.width), canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width * scale)); canvas.height = Math.max(1, Math.round(rect.height * scale));
  const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function analyzeCanvas(canvas, options) {
  const scale = Math.min(1, 1600 / canvas.width, 6000 / canvas.height), detector = document.createElement('canvas');
  detector.width = Math.max(20, Math.round(canvas.width * scale)); detector.height = Math.max(20, Math.round(canvas.height * scale));
  try {
    const context = detector.getContext('2d', { willReadFrequently: true }); context.drawImage(canvas, 0, 0, detector.width, detector.height);
    return detectScoreSystems(context.getImageData(0, 0, detector.width, detector.height), options);
  } finally { detector.width = 0; detector.height = 0; }
}

/** Decode once, detect on a smaller canvas, and crop OCR inputs from the original pixels. */
export async function prepareScoreImage(input, { page = 1, maxDetectionDimension = 1600, pianoSourceVerified = false, sourceLabel = '' } = {}) {
  const ownedURL = input instanceof Blob ? URL.createObjectURL(input) : null;
  const sourceURL = ownedURL || String(input);
  let image;
  try { image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('谱面图片无法解码，请换用 PNG、JPG 或 WebP。')); img.src = sourceURL; }); }
  catch (error) { if (ownedURL) URL.revokeObjectURL(ownedURL); throw error; }
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!width || !height || width * height > 50000000) { if (ownedURL) URL.revokeObjectURL(ownedURL); throw new Error('图片尺寸过大，请先选择单页或裁剪后上传。'); }
  const source = document.createElement('canvas'); source.width = width; source.height = height;
  const context = source.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0);
  const scale = Math.min(1, maxDetectionDimension / width, 6000 / height);
  const detector = document.createElement('canvas'); detector.width = Math.max(20, Math.round(width * scale)); detector.height = Math.max(20, Math.round(height * scale));
  const detectorContext = detector.getContext('2d', { willReadFrequently: true }); detectorContext.drawImage(source, 0, 0, detector.width, detector.height);
  const detected = detectScoreSystems(detectorContext.getImageData(0, 0, detector.width, detector.height), { pianoSourceVerified, sourceLabel });
  const sx = width / detector.width, sy = height / detector.height;
  const mapStaff = staff => ({ ...staff, x: staff.x * sx, width: staff.width * sx, spacing: staff.spacing * sy, lines: staff.lines.map(y => y * sy) });
  const layout = { ...detected, width, height, staffs: detected.staffs.map(mapStaff), contextRect: detected.contextRect ? rectAtScale(detected.contextRect, sx, sy, width, height) : null,
    systems: detected.systems.map(system => ({ ...system, rect: rectAtScale(system.rect, sx, sy, width, height), staffs: system.staffs.map(mapStaff) })) };
  detector.width = 0; detector.height = 0;
  const previewUrl = sourceURL;
  const contextPreviewUrl = layout.contextRect ? cropCanvas(source, layout.contextRect, 900).toDataURL('image/png') : null;
  const systems = layout.systems.map(system => ({ ...system, previewUrl: cropCanvas(source, system.rect, 900).toDataURL('image/png') }));
  let destroyed = false;
  function selectionPlan({ selectedSystemIds, rect, mode = 'systems' } = {}) {
    if (mode === 'manual') {
      if (!rect) throw new Error('请在原图上拖动，框出完整小节和两只手。');
      return [{ id: 'manual', label: '手动选择的谱面区域', rect: normalizeCropRect(rect, width, height), systemIndices: [], warnings: [] }];
    }
    if (mode === 'page') return [{ id: 'page', label: `当前第 ${page} 页`, rect: { x: 0, y: 0, width, height }, systemIndices: layout.systems.map(s => s.index), warnings: [] }];
    const chunks = planScoreImageChunks(layout, { selectedSystemIds: selectedSystemIds === undefined ? systems.slice(0, 1).map(s => s.id) : selectedSystemIds });
    return !chunks.length && !systems.length && selectedSystemIds === undefined ? planScoreImageChunks(layout) : chunks;
  }
  function getAssessment(options = {}) {
    const blocked = (message, reasonCode) => ({ ...detected.assessment, pianoVerified: false, verification: 'none', canRequestOcr: false, canAutoRecognize: false, message, reasonCode });
    if (destroyed) return blocked('谱面预览已关闭，请重新选择图片。', 'IMAGE_DISPOSED');
    try {
      const chunks = selectionPlan(options);
      if (!chunks.length) return blocked('请至少选择一个完整谱行。', 'EMPTY_SELECTION');
      if (chunks.length > 4) return blocked('一次最多选择 4 个连续谱行。', 'TOO_MANY_REGIONS');
      let result;
      for (const chunk of chunks) {
        const canvas = cropCanvas(source, chunk.rect);
        try {
          const assessment = analyzeCanvas(canvas, { pianoSourceVerified, sourceLabel, confirmedPiano: options.confirmedPiano }).assessment;
          if (!assessment.canRequestOcr) return assessment;
          result = assessment;
        } finally { canvas.width = 0; canvas.height = 0; }
      }
      return result;
    } catch (error) { return blocked(error.message, 'INVALID_SELECTION'); }
  }
  const api = { width, height, page, layout, assessment: detected.assessment, previewUrl, contextPreviewUrl, systems,
    getAssessment,
    getSelection({ selectedSystemIds, rect, mode = 'systems', confirmedPiano = false } = {}) {
      if (destroyed) throw new Error('谱面预览已关闭，请重新选择图片。');
      const chunks = selectionPlan({ selectedSystemIds, rect, mode });
      return chunks.map(chunk => {
        // Do not append the first system or header to later crops: that duplicates source notes.
        // The caller can carry the first selected system's recognized key/meter as text context.
        const canvas = cropCanvas(source, chunk.rect);
        try {
          // Validate the actual crop: confirming a valid page cannot authorize a crop of its cover/title.
          const assessment = analyzeCanvas(canvas, { pianoSourceVerified, sourceLabel, confirmedPiano }).assessment;
          if (!assessment.canRequestOcr) throw Object.assign(new Error(assessment.message), { code: assessment.reasonCode, assessment });
          const dataURL = canvas.toDataURL('image/png');
          if ((dataURL.length - 22) * .75 > 4 * 1024 * 1024) throw new Error('所选区域超过 4 MB，请框选更少的完整小节后识别。');
          return { data: dataURL.split(',')[1], mimeType: 'image/png', previewUrl: dataURL, assessment,
            region: { page, label: chunk.label, rect: chunk.rect, systemIndices: chunk.systemIndices, contextRect: layout.contextRect, includesInitialSystem: chunk.systemIndices.includes(0), scope: mode === 'page' ? 'provided' : 'selection' }, warnings: chunk.warnings || [] };
        } finally { canvas.width = 0; canvas.height = 0; }
      });
    },
    destroy() { if (destroyed) return; destroyed = true; source.width = 0; source.height = 0; if (ownedURL) URL.revokeObjectURL(ownedURL); },
  };
  return api;
}

const styleText = `.score-image-selector{font:12px/1.55 system-ui;color:#34463a}.score-image-selector button{font:inherit;padding:6px 10px;border:1px solid #dce4d8;border-radius:6px;background:white;color:inherit;cursor:pointer}.score-image-selector button[aria-pressed=true]{background:#eaf2e6;border-color:#8caa82}.score-image-modes{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.score-image-options{display:grid;gap:8px;max-height:330px;overflow:auto}.score-image-option{display:block;padding:8px;border:1px solid #e0e7dc;border-radius:6px;cursor:pointer}.score-image-option:has(input:checked){background:#f0f6ec;border-color:#93ad87}.score-image-option img{display:block;width:100%;height:auto;max-height:150px;object-fit:contain;object-position:left center;margin-top:5px}.score-image-notice{color:#7c8976;font-size:11px;margin:6px 0}.score-image-manual{position:relative;max-height:420px;overflow:auto;border:1px solid #dde5d8;touch-action:none;user-select:none}.score-image-manual img{display:block;width:100%;height:auto;pointer-events:none}.score-image-selection{position:absolute;border:2px solid #427d43;background:#91bd722a;pointer-events:none;box-sizing:border-box}.score-image-selector[hidden],.score-image-selector [hidden]{display:none!important}`;

/** Small optional UI. Default is the first complete detected piano system, never the whole song. */
export function mountScoreImageSelector(container, prepared, { onChange = () => {} } = {}) {
  if (!document.getElementById('score-image-selector-styles')) { const style = document.createElement('style'); style.id = 'score-image-selector-styles'; style.textContent = styleText; document.head.append(style); }
  const root = document.createElement('section'); root.className = 'score-image-selector';
  const modes = document.createElement('div'); modes.className = 'score-image-modes';
  const automatic = document.createElement('div'); automatic.className = 'score-image-options';
  const manual = document.createElement('div'); manual.className = 'score-image-manual'; manual.hidden = true;
  const image = document.createElement('img'); image.src = prepared.previewUrl; image.alt = '拖动框选完整小节，保留高低音谱表和谱号'; image.draggable = false;
  const selection = document.createElement('div'); selection.className = 'score-image-selection'; selection.hidden = true; manual.append(image, selection);
  const notice = document.createElement('p'); notice.className = 'score-image-notice';
  notice.textContent = ['not-score', 'non-piano-notation'].includes(prepared.assessment.classification)
    ? '此素材不符合钢琴谱要求，请更换清晰的钢琴双手谱图片；PDF 可以切换到实际谱页。'
    : prepared.systems.length ? '默认只识别第 1 行。请检查两只手是否齐全；整页过密时，可框选少量完整小节。' : '未确认完整双手谱表，请更换清晰的钢琴谱图片。';
  const assessmentNotice = document.createElement('p'); assessmentNotice.className = 'score-image-notice'; assessmentNotice.dataset.scoreAssessment = prepared.assessment.classification; assessmentNotice.textContent = prepared.assessment.message;
  const confirmationLabel = document.createElement('label'); confirmationLabel.className = 'score-image-confirmation';
  const confirmation = document.createElement('input'); confirmation.type = 'checkbox'; confirmation.dataset.confirmPiano = 'true';
  confirmationLabel.append(confirmation, document.createTextNode(' 我已对照谱头和来源，确认这是钢琴双手谱。'));
  confirmationLabel.hidden = prepared.assessment.verification === 'source' || !prepared.assessment.hasGrandStaff;
  const scopeLabel = document.createElement('p'); scopeLabel.className = 'score-image-notice';
  root.append(modes, notice, assessmentNotice, confirmationLabel, automatic, manual, scopeLabel); container.replaceChildren(root);
  const selected = new Set(prepared.systems.slice(0, 1).map(s => s.id));
  let mode = prepared.systems.length ? 'systems' : 'manual', cropRect = null, start = null, disposed = false;
  const buttons = new Map();
  let assessmentCacheKey = '', assessmentCache = prepared.assessment;
  function getSelectionOptions() {
    const options = { mode, selectedSystemIds: [...selected], confirmedPiano: confirmation.checked, ...(mode === 'manual' ? { rect: cropRect } : {}) };
    const key = JSON.stringify(options);
    if (key !== assessmentCacheKey) { assessmentCache = prepared.getAssessment(options); assessmentCacheKey = key; }
    return { ...options, assessment: assessmentCache, canRequestOcr: assessmentCache.canRequestOcr };
  }
  function changed() {
    if (disposed) return;
    for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(mode === key));
    automatic.hidden = mode !== 'systems'; manual.hidden = mode !== 'manual';
    scopeLabel.textContent = mode === 'page' ? `范围：仅当前第 ${prepared.page} 页，不补写其他页。` : mode === 'manual' ? cropRect ? `范围：手动框选 ${Math.round(cropRect.width)} × ${Math.round(cropRect.height)} 像素。请保留谱号；若没有拍号，需补充拍号说明。` : '请在原图上拖动框选完整小节，包含两只手和相应谱号。' : `范围：${selected.size} 个选中谱行，不补写未选中内容。`;
    onChange(getSelectionOptions());
  }
  for (const [key, label] of [['systems', '按谱行选择'], ['manual', '手动框选'], ['page', '当前整页']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.selectionMode = key;
    if (key === 'systems' && !prepared.systems.length) button.disabled = true;
    button.addEventListener('click', () => { mode = key; changed(); }); buttons.set(key, button); modes.append(button);
  }
  confirmation.addEventListener('change', changed);
  for (const system of prepared.systems) {
    const label = document.createElement('label'); label.className = 'score-image-option'; label.dataset.systemId = system.id;
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(system.id); checkbox.value = system.id;
    const text = document.createElement('span'); text.textContent = ` 第 ${system.index + 1} 行 · ${system.staffs.length > 1 ? '双手谱表' : '单谱表，请核对'} `;
    const thumbnail = document.createElement('img'); thumbnail.src = system.previewUrl; thumbnail.alt = `第 ${system.index + 1} 行裁切预览`;
    checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(system.id) : selected.delete(system.id); changed(); }); label.append(checkbox, text, thumbnail); automatic.append(label);
  }
  const point = event => { const bounds = image.getBoundingClientRect(); return { x: Math.max(0, Math.min(prepared.width, (event.clientX - bounds.left) / bounds.width * prepared.width)), y: Math.max(0, Math.min(prepared.height, (event.clientY - bounds.top) / bounds.height * prepared.height)) }; };
  function displayRect() {
    if (!cropRect) return; selection.hidden = false;
    selection.style.left = `${cropRect.x / prepared.width * 100}%`; selection.style.top = `${cropRect.y / prepared.height * image.clientHeight}px`;
    selection.style.width = `${cropRect.width / prepared.width * 100}%`; selection.style.height = `${cropRect.height / prepared.height * image.clientHeight}px`;
  }
  manual.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); start = point(event); manual.setPointerCapture(event.pointerId); cropRect = null; selection.hidden = true; });
  manual.addEventListener('pointermove', event => { if (!start) return; const end = point(event); cropRect = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }; displayRect(); });
  const finish = () => { if (!start) return; start = null; if (!cropRect || cropRect.width < 20 || cropRect.height < 20) { cropRect = null; selection.hidden = true; } else cropRect = normalizeCropRect(cropRect, prepared.width, prepared.height); changed(); };
  manual.addEventListener('pointerup', finish); manual.addEventListener('pointercancel', finish);
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(displayRect); resizeObserver?.observe(image);
  changed();
  return { getSelectionOptions, getAssessment: () => getSelectionOptions().assessment, getSelection: () => prepared.getSelection(getSelectionOptions()), destroy() { disposed = true; resizeObserver?.disconnect(); root.remove(); } };
}
