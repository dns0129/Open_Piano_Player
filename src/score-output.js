import { $, $$, esc, icon } from "./ui.js";
import { exportMusicXML, exportMidi } from "../lib/exporters.mjs";
import { readScoreDocument } from "../lib/score-document.ts";
export function createScoreOutput({
  state,
  modal,
  closeModal,
  originalNotation,
  download,
  toast,
}) {
  function openPrintScore() {
    const score = structuredClone(state.score),
      sourceNotation = originalNotation();
    const initialMode =
      state.mode === "source" && sourceNotation
        ? "source"
        : state.mode === "numbered"
          ? "numbered"
          : "staff";
    modal(
      "打印乐谱",
      `<p class="form-note">整首乐谱按 A4 纵向分页，可直接下载 PDF 或使用打印机打印。导出保留当前移调和编配，速度采用乐谱原速。</p><label class="field">乐谱形式<select id="print-score-mode"><option value="staff">五线谱</option><option value="numbered">简谱</option>${sourceNotation ? '<option value="source">原图参考</option>' : ""}</select></label><p class="form-note">${esc(score.title)}${score.source?.reviewRequired || /draft|^audio-transcription$|^image-ai$|^full-score-model-reviewed$/.test(score.source?.kind || "") ? " · 待校对草稿，请核对后使用。" : ""}</p><div class="print-score-actions"><button class="button primary" data-score-output="pdf">${icon("download")}下载 PDF</button><button class="button secondary" data-score-output="print">${icon("printer")}打印乐谱</button></div><p id="print-score-status" class="form-note" role="status" aria-live="polite"></p>`,
    );
    const select = $("#print-score-mode"),
      status = $("#print-score-status"),
      buttons = $$("[data-score-output]");
    select.value = initialMode;
    buttons.forEach(
      (button) =>
        (button.onclick = async () => {
          buttons.forEach((b) => (b.disabled = true));
          select.disabled = true;
          status.textContent = "正在排版整首乐谱，请稍候…";
          try {
            const { createScorePages, scorePagesPDF, printScorePages } =
              await import("./score-print.js");
            const pages = await createScorePages(score, {
              mode: select.value,
              sourceNotation,
            });
            if (!status.isConnected) return;
            if (button.dataset.scoreOutput === "pdf") {
              const bytes = await scorePagesPDF(pages, score.title);
              if (!status.isConnected) return;
              download(
                bytes,
                score.title.replace(/[\\/:*?"<>|]/g, "_") + ".pdf",
                "application/pdf",
              );
              status.textContent = `PDF 已生成，共 ${pages.length} 页。`;
            } else {
              await printScorePages(pages, score.title);
              status.textContent = `已打开打印窗口，共 ${pages.length} 页。`;
            }
          } catch (error) {
            status.textContent = `导出失败：${error.message || "请重试"}`;
          } finally {
            buttons.forEach((b) => (b.disabled = false));
            select.disabled = false;
          }
        }),
    );
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
