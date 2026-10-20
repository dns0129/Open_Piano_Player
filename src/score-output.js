import { $, $$, esc, icon, read } from "./ui.js";
import { exportMusicXML, exportMidi } from "../lib/exporters.mjs";
import { readScoreDocument } from "../lib/score-document.ts";
import { normalizePrintStyle, printStylePreferences, PRINT_DEFAULTS, PRINT_TEXT_FONTS, PRINT_MUSIC_FONTS, PRINT_PAGE_STYLES } from '../lib/score-print-style.mjs';
export function createScoreOutput({
  state,
  modal,
  closeModal,
  originalNotation,
  download,
  toast,
}) {
  function openPrintScore() {
    const score = structuredClone(state.score), sourceNotation = originalNotation();
    const appearance = normalizePrintStyle(read('qinban-print-appearance-v1', {}), score);
    const options = values => Object.entries(values).map(([value, label]) => `<option value="${esc(value)}">${esc(typeof label === 'object' ? label.label : label)}</option>`).join('');
    const field = (label, name, values) => `<label class="field">${label}<select data-print-setting="${name}" aria-label="${label}">${options(values)}</select></label>`;
    const input = (label, name, max) => `<label class="field print-wide">${label}<input data-print-setting="${name}" aria-label="${label}" maxlength="${max}"></label>`;
    const number = (label, name, min, max) => `<label class="field">${label}<input type="number" data-print-setting="${name}" aria-label="${label}" min="${min}" max="${max}" step="1"></label>`;
    modal('打印乐谱', `<p class="form-note">自定义整首乐谱的外观，预览首页后下载 PDF 或打印。导出保留当前移调和编配。</p><div class="score-print-workspace"><div class="score-print-controls"><div class="print-settings-grid">
<label class="field">乐谱形式<select id="print-score-mode"><option value="staff">五线谱</option><option value="numbered">简谱</option>${sourceNotation ? '<option value="source">原图参考</option>' : ''}</select></label>
${field('谱面样式', 'pageStyle', PRINT_PAGE_STYLES)}
${field('标题与文字字体', 'textFont', PRINT_TEXT_FONTS)}${field('五线谱符号字体', 'musicFont', PRINT_MUSIC_FONTS)}
${input('抬头标题', 'title', 140)}${input('副标题（可留空）', 'subtitle', 140)}
${field('抬头格式', 'headerFormat', { center: '居中抬头', left: '左对齐抬头', framed: '边框抬头' })}${number('标题字号', 'titleSize', 18, 34)}
${input('作谱人署名', 'credit', 120)}
<label class="field">署名标签<input data-print-setting="creditLabel" aria-label="署名标签" maxlength="16" placeholder="作曲 / 编配 / 制谱"></label>
${field('作谱人位置', 'creditPosition', { right: '右侧', left: '左侧', center: '居中', 'under-title': '标题下方', hidden: '隐藏署名' })}
${number('页边距（mm）', 'marginMM', 10, 24)}${number('谱面大小（%）', 'scoreScale', 80, 120)}
<label class="compact-toggle"><input type="checkbox" data-print-setting="showDetails">显示拍号与速度</label><label class="compact-toggle"><input type="checkbox" data-print-setting="showPageNumbers">显示页码</label>
</div><p id="print-source-note" class="form-note" hidden>原图参考会保留图片内的音符、文字和署名；字体与抬头设置用于新页眉，符号字体用于五线谱，谱面大小用于数字谱。</p><p class="form-note">外观选项会记住；标题和署名仅用于本次导出。文字字体使用设备字体，缺少时采用同类回退。${score.source?.reviewRequired || /draft|^audio-transcription$|^image-ai$|^full-score-model-reviewed$/.test(score.source?.kind || '') ? ' 当前乐谱为待校对草稿，请核对后使用。' : ''}</p><button type="button" class="text-button" id="print-reset">恢复默认外观</button></div><div class="score-print-preview"><div class="print-preview-caption"><strong>首页预览</strong><span id="print-preview-status" role="status" aria-live="polite">正在排版…</span></div><div id="print-preview-paper" aria-label="乐谱打印首页预览"></div><p class="form-note">完整 PDF 会自动分页，保持每个谱行完整。</p></div></div><div class="print-score-actions"><button class="button primary" data-score-output="pdf">${icon('download')}下载 PDF</button><button class="button secondary" data-score-output="print">${icon('printer')}打印乐谱</button></div><p id="print-score-status" class="form-note" role="status" aria-live="polite"></p>`);
    const select = $('#print-score-mode'), status = $('#print-score-status'), previewStatus = $('#print-preview-status'), paper = $('#print-preview-paper');
    const controls = $$('[data-print-setting]'), buttons = $$('[data-score-output]');
    const reset = $('#print-reset'), sourceNote = $('#print-source-note');
    status.closest('.modal').classList.add('score-print-modal');
    select.value = state.mode === 'source' && sourceNotation ? 'source' : state.mode === 'numbered' ? 'numbered' : 'staff';
    function apply(values) { controls.forEach(control => { const value = values[control.dataset.printSetting]; if (control.type === 'checkbox') control.checked = value; else control.value = value; }); }
    function settings() { return normalizePrintStyle(Object.fromEntries(controls.map(control => [control.dataset.printSetting, control.type === 'checkbox' ? control.checked : control.value])), score); }
    function savePreferences() { try { localStorage.setItem('qinban-print-appearance-v1', JSON.stringify(printStylePreferences(settings()))); } catch { /* Export still works when preference storage is unavailable. */ } }
    function sourceControls() {
      const source = select.value === 'source';
      controls.forEach(control => { if (control.dataset.printSetting === 'musicFont') control.disabled = select.value !== 'staff'; if (control.dataset.printSetting === 'scoreScale') control.disabled = source; });
      sourceNote.hidden = !source;
    }
    apply(appearance); sourceControls();
    let revision = 0, timer, working = false, again = false, busy = false;
    async function updatePreview() {
      if (!status.isConnected || busy) return;
      if (working) { again = true; return; }
      working = true; const epoch = revision;
      previewStatus.textContent = '正在排版…';
      try {
        const { createScorePages } = await import('./score-print.js');
        const pages = await createScorePages(score, { mode: select.value, sourceNotation, appearance: settings(), preview: true });
        if (!status.isConnected || epoch !== revision || busy) return;
        const canvas = pages[0]; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '自定义乐谱首页');
        paper.replaceChildren(canvas); previewStatus.textContent = '已更新';
      } catch (error) { if (status.isConnected && epoch === revision && !busy) { paper.replaceChildren(); previewStatus.textContent = `预览失败：${error.message || '请重试'}`; } }
      finally { working = false; if (again) { again = false; void updatePreview(); } }
    }
    function changed() { revision++; clearTimeout(timer); status.textContent = ''; previewStatus.textContent = '等待更新…'; savePreferences(); timer = setTimeout(updatePreview, 450); }
    controls.forEach(control => { control.oninput = changed; control.onchange = () => { if (control.type === 'number') control.value = settings()[control.dataset.printSetting]; changed(); }; });
    select.onchange = () => { sourceControls(); changed(); };
    reset.onclick = () => { const current = settings(); apply(normalizePrintStyle({ ...PRINT_DEFAULTS, title: current.title, subtitle: current.subtitle, credit: current.credit, creditLabel: current.creditLabel }, score)); sourceControls(); changed(); };
    void updatePreview();
    buttons.forEach(button => button.onclick = async () => {
      busy = true; revision++; clearTimeout(timer);
      [...buttons, ...controls, select, reset].forEach(control => control.disabled = true);
      status.textContent = '正在排版整首乐谱，请稍候…';
      const appearance = settings();
      try {
        const { createScorePages, scorePagesPDF, printScorePages } = await import('./score-print.js');
        const pages = await createScorePages(score, { mode: select.value, sourceNotation, appearance });
        if (!status.isConnected) return;
        pages[0].setAttribute('role', 'img'); pages[0].setAttribute('aria-label', '自定义乐谱首页');
        paper.replaceChildren(pages[0]); previewStatus.textContent = '已更新';
        if (button.dataset.scoreOutput === 'pdf') {
          const bytes = await scorePagesPDF(pages, appearance.title);
          if (!status.isConnected) return;
          download(bytes, appearance.title.replace(/[\\/:*?"<>|]/g, '_') + '.pdf', 'application/pdf');
          status.textContent = `PDF 已生成，共 ${pages.length} 页。`;
        } else {
          await printScorePages(pages, appearance.title);
          status.textContent = `已打开打印窗口，共 ${pages.length} 页。`;
        }
      } catch (error) { status.textContent = `导出失败：${error.message || '请重试'}`; }
      finally {
        busy = false;
        [...buttons, ...controls, select, reset].forEach(control => control.disabled = false); sourceControls();
        if (status.isConnected && ['正在排版…', '等待更新…'].includes(previewStatus.textContent)) void updatePreview();
      }
    });
  }
  function openExport() {
    modal(
      "带走你的练习谱",
      `<p class="form-note">导出当前调式与编配。MusicXML 可在 MuseScore 等软件继续编辑。</p><div class="export-options"><button data-format="xml">${icon("file-music")}<span>MusicXML<small>双手五线谱 · 可编辑</small></span>${icon("download")}</button><button data-format="midi">${icon("piano")}<span>MIDI<small>钢琴音轨 · 原谱速度</small></span>${icon("download")}</button><button data-format="json">${icon("book-open")}<span>琴伴乐谱 JSON<small>完整备份 · 可重新导入</small></span>${icon("download")}</button><button data-format="print">${icon("download")}<span>打印 / 保存 PDF<small>A4 分页 · 五线谱 / 简谱 / 原谱</small></span>${icon("arrow-up-right")}</button></div>`,
    );
    $$("[data-format]").forEach(
      (b) =>
        (b.onclick = () => {
          try {
            const name = state.score.title.replace(/[\\/:*?"<>|]/g, "_"),
              format = b.dataset.format;
            if (format === "xml")
              download(
                exportMusicXML(state.score),
                name + ".musicxml",
                "application/vnd.recordare.musicxml+xml",
              );
            if (format === "midi")
              download(exportMidi(state.score), name + ".mid", "audio/midi");
            if (format === "json")
              download(
                JSON.stringify(readScoreDocument(state.score), null, 2),
                name + ".json",
                "application/json",
              );
            if (format === "print") {
              openPrintScore();
            } else toast("已导出乐谱");
          } catch (e) {
            toast(e.message, true);
          }
        }),
    );
  }

  return { openExport, openPrintScore };
}
