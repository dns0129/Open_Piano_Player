import { $, $$, esc, icon, refreshIcons } from "./ui.js";
import { validateScore } from "../lib/score.mjs";
import { renderNotation } from "./notation.js";
import { exportMidi } from "../lib/exporters.mjs";
import { tonalityLabel } from "../lib/score-arrangement.mjs";
export function createAudioWorkspace({
  state,
  player,
  render,
  toast,
  setScore,
  remember,
  download,
  keyName,
}) {
  function isAudioFile(file) {
    return (
      /^audio\//.test(file.type) ||
      /\.(wav|mp3|m4a|aac|ogg|flac|webm)$/i.test(file.name)
    );
  }
  const secondsLabel = (value) => {
    const s = Math.max(0, Math.floor(value || 0));
    const decimal = Math.round(((value || 0) - s) * 10);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}${s < 10 && decimal > 0 && decimal < 10 ? "." + decimal : ""}`;
  };
  function audioView() {
    const a = state.audio,
      busy = ["analyzing", "transcribing"].includes(a.status),
      done = !!a.result;
    return `<section class="content-page audio-page"><div class="page-heading"><div><span class="eyebrow">AUDIO TO PIANO SCORE</span><h1>把听到的旋律，放进乐谱里。</h1><p>提交钢琴录音或单一乐器音源，识别成可播放的五线谱与简谱。</p></div><span class="local-processing-tag">${icon("headphones")}本机处理 · 音频不上传</span></div>
<div class="audio-flow"><span class="${a.file ? "complete" : "active"}"><b>1</b>提交音源</span><i>—</i><span class="${a.file && !done ? "active" : done ? "complete" : ""}"><b>2</b>选择片段与转写</span><i>—</i><span class="${done ? "active" : ""}"><b>3</b>试听、校对、练习</span></div>
<div class="audio-workspace"><section class="audio-input-panel"><button id="choose-audio" class="audio-dropzone ${a.file ? "has-file" : ""}" ${busy ? "disabled" : ""}>${icon("file-audio")}<strong>${a.file ? esc(a.file.name) : "选择音频，或拖放到这里"}</strong><span>${a.file ? "点击更换音源" : "MP3 / WAV / M4A / OGG / FLAC · 最大 50 MB"}</span></button>
${a.file ? `<div class="audio-source"><div class="audio-file-meta"><span>${icon("check-circle-2")}${a.meta ? `${secondsLabel(a.meta.duration)} · ${a.meta.channels || a.meta.numberOfChannels || 1} 声道` : "正在读取音频…"}</span><span>${(a.file.size / 1024 / 1024).toFixed(1)} MB</span></div>${a.meta?.waveform ? `<div class="audio-waveform" aria-label="音频振幅波形">${a.meta.waveform.map((v) => `<i style="height:${Math.max(3, Math.min(100, v * 100))}%"></i>`).join("")}</div>` : ""}<audio id="source-audio" controls preload="metadata" src="${a.url}" aria-label="原始音频试听"></audio></div>` : ""}
<form id="transcription-form"><label class="field">乐谱名称<input id="audio-title" value="${esc(a.title)}" maxlength="180" placeholder="例如：我的钢琴录音" ${busy ? "disabled" : ""} required></label><div class="audio-segment"><div class="audio-setting-label">选择转谱片段<span>单次最多 120 秒</span></div><div><label>开始（秒）<input id="audio-start" type="number" min="0" max="${a.meta?.duration || 0}" step="any" value="${a.start}" ${busy ? "disabled" : ""}></label><span>—</span><label>结束（秒）<input id="audio-end" type="number" min="0.1" max="${a.meta?.duration || 120}" step="any" value="${a.end}" ${busy ? "disabled" : ""}></label><button id="preview-segment" class="button secondary" type="button" ${!a.meta || busy ? "disabled" : ""}>${icon("play")}试听片段</button></div></div>
<div class="audio-options"><label class="field">节奏速度<input id="audio-tempo" type="number" min="20" max="240" value="${a.tempo}" placeholder="自动估计 BPM" ${busy ? "disabled" : ""}></label><label class="field">时值网格<select id="audio-grid" ${busy ? "disabled" : ""}><option value="1/16" ${a.grid === "1/16" ? "selected" : ""}>十六分音符</option><option value="1/8" ${a.grid === "1/8" ? "selected" : ""}>八分音符</option></select></label></div>
<label class="field">转谱内容<select id="audio-mode" ${busy ? "disabled" : ""}><option value="piano" ${a.mode === "piano" ? "selected" : ""}>钢琴 / 和弦音符（自动分左右手）</option><option value="melody" ${a.mode === "melody" ? "selected" : ""}>提取主旋律</option></select></label><label class="field">识别灵敏度<select id="audio-sensitivity" ${busy ? "disabled" : ""}><option value="standard" ${a.sensitivity === "standard" ? "selected" : ""}>标准（推荐）</option><option value="sensitive" ${a.sensitivity === "sensitive" ? "selected" : ""}>保留弱音 · 可能多出杂音</option><option value="strict" ${a.sensitivity === "strict" ? "selected" : ""}>减少杂音 · 可能遗漏弱音</option></select></label><div id="transcription-error" class="form-error" role="alert">${esc(a.error)}</div><button id="start-transcription" class="button primary full" type="submit" ${!a.meta || busy ? "disabled" : ""}>${icon(busy ? "loader-circle" : "audio-lines", busy ? "spin" : "")}${a.status === "analyzing" ? "正在读取音源" : a.status === "transcribing" ? "正在转谱…" : "开始音频转谱"}</button>${a.status === "transcribing" ? '<button id="cancel-transcription" class="text-button cancel-transcription" type="button">取消本次转谱</button>' : ""}</form><p class="audio-privacy">音符来自实际音高识别。钢琴与单一乐器录音更合适；多乐器混音、人声及噪声可能产生错音，需要试听校对。</p></section>
<section class="audio-output-panel">${done ? audioResultMarkup() : `<div class="audio-output-heading"><span>转谱预览</span><span>五线谱 / 简谱</span></div><div class="audio-output-empty"><div class="wave-symbol">${icon("audio-lines")}</div><h2>${a.status === "transcribing" ? "正在听辨音符与节奏" : "乐谱，会在这里出现。"}</h2><p>${a.status === "transcribing" ? "正在使用本机模型分析所选音频片段。" : "上传音源，选择想练的片段，<br>转写后即可试听、导出或进入练习室。"}</p><div id="transcription-progress-area" class="transcription-progress-area ${a.status === "transcribing" ? "visible" : ""}"><progress id="transcription-progress" max="1" value="${a.progress}"></progress><span id="transcription-percent">${Math.round(a.progress * 100)}%</span><p id="transcription-message">${esc(a.message)}</p></div></div><div class="audio-capability"><div>${icon("piano")}<span>可识别同时发声的音符<small>适合钢琴、旋律与简单和弦</small></span></div><div>${icon("sliders-horizontal")}<span>支持变速、分手播放<small>导入练习室后可放慢速度</small></span></div><div>${icon("download")}<span>可导出 MIDI 与乐谱<small>保存到曲库，继续慢练</small></span></div></div>`}</section></div></section>`;
  }
  function audioResultMarkup() {
    const a = state.audio,
      r = a.result,
      s = r.score;
    return `<div class="audio-output-heading"><span>${icon("check-circle-2")}转写完成</span><div class="notation-switch"><button data-audio-mode="staff" class="${a.previewMode === "staff" ? "selected" : ""}">五线谱</button><button data-audio-mode="numbered" class="${a.previewMode === "numbered" ? "selected" : ""}">简谱</button></div></div><div class="audio-result-title"><h2>${esc(s.title)}</h2><p>${s.notes.length} 个音符<span>${s.tempo} BPM</span><span>${s.mode ? esc(tonalityLabel(s)) : keyName(s.keySignature) + " 调号"}</span></p></div><div id="audio-score-preview" class="audio-score-preview" aria-label="音频转写乐谱预览"></div><div class="transcription-warnings">${(r.warnings || []).map((w) => `<p>${esc(w)}</p>`).join("")}</div><div class="audio-result-actions"><button id="practice-transcription" class="button primary">${icon("play")}导入练习室</button><button id="download-transcription" class="button secondary">${icon("download")}导出 MIDI</button></div><p class="audio-result-note">这是一份音频转写草稿。请对照原音试听，校对速度、时值和音区。</p>`;
  }
  async function receiveAudio(file) {
    const a = state.audio;
    if (a.status === "transcribing") {
      toast("请先取消或等待当前音频转谱完成。");
      return;
    }
    if (!isAudioFile(file)) return toast("请选择可解码的音频文件。", true);
    if (file.size > 50 * 1024 * 1024)
      return toast("音频超过 50 MB，请先剪辑后再导入。", true);
    player.pause();
    a.abort?.abort();
    if (a.url) URL.revokeObjectURL(a.url);
    a.file = file;
    a.url = URL.createObjectURL(file);
    a.title = file.name.replace(/\.[^.]+$/, "");
    a.meta = null;
    a.result = null;
    a.error = "";
    a.status = "analyzing";
    a.progress = 0;
    state.view = "audio";
    render();
    try {
      const { analyzeAudio } = await import("./audio-transcription.js");
      const meta = await analyzeAudio(file);
      if (a.file !== file) return;
      a.meta = meta;
      a.start = 0;
      a.end = Math.floor(Math.min(30, meta.duration) * 1000) / 1000;
      a.status = "ready";
      render();
    } catch (e) {
      if (a.file !== file) return;
      a.error = e.message || "当前浏览器无法解码此音频，请转换为 WAV 或 MP3。";
      a.status = "error";
      render();
    }
  }
  function bindAudio() {
    const a = state.audio;
    $("#choose-audio").onclick = () => $("#audio-input").click();
    const sync = () => {
      a.title = $("#audio-title").value;
      a.start = Number($("#audio-start").value) || 0;
      a.end = Number($("#audio-end").value) || 0;
      a.tempo = $("#audio-tempo").value;
      a.grid = $("#audio-grid").value;
      a.mode = $("#audio-mode").value;
      a.sensitivity = $("#audio-sensitivity").value;
    };
    for (const id of [
      "audio-title",
      "audio-start",
      "audio-end",
      "audio-tempo",
      "audio-grid",
      "audio-mode",
      "audio-sensitivity",
    ])
      $("#" + id).onchange = sync;
    $("#transcription-form").onsubmit = async (e) => {
      e.preventDefault();
      sync();
      await startTranscription();
    };
    $("#preview-segment").onclick = async () => {
      sync();
      const audio = $("#source-audio");
      if (!audio) return;
      try {
        audio.currentTime = Math.max(0, a.start);
        await audio.play();
      } catch {
        toast("音源暂时无法播放，请使用 WAV 或 MP3 重试。", true);
      }
    };
    if ($("#source-audio"))
      $("#source-audio").ontimeupdate = (event) => {
        const audio = event.currentTarget;
        if (audio.currentTime >= a.end) audio.pause();
      };
    $("#cancel-transcription")?.addEventListener("click", () => {
      a.abort?.abort();
      a.status = "ready";
      a.progress = 0;
      a.message = "";
      render();
      toast("已取消本次音频转谱");
    });
    if (a.result) {
      $$("[data-audio-mode]").forEach(
        (b) =>
          (b.onclick = () => {
            a.previewMode = b.dataset.audioMode;
            render();
          }),
      );
      $("#practice-transcription").onclick = async () => {
        await remember(a.result.score);
        setScore(a.result.score, a.result.warnings || []);
        toast("音频转写谱已保存到曲库");
      };
      $("#download-transcription").onclick = () =>
        download(
          exportMidi(a.result.score),
          a.result.score.title.replace(/[\\/:*?"<>|]/g, "_") + ".mid",
          "audio/midi",
        );
      try {
        a.previewRenderer = renderNotation(
          $("#audio-score-preview"),
          a.result.score,
          { mode: a.previewMode, autoScroll: false },
        );
        const help = $("#audio-score-preview .notation-help");
        if (help)
          help.textContent = help.textContent.replace(
            "点击音符定位。",
            "导入练习室后可试听与定位。",
          );
      } catch (e) {
        $("#audio-score-preview").textContent =
          "预览暂时不可用，可导出 MIDI 查看。";
      }
    }
  }
  async function startTranscription() {
    const a = state.audio;
    if (!a.file || !a.meta || a.status === "transcribing") return;
    if (
      a.start < 0 ||
      a.end > a.meta.duration + 0.01 ||
      a.end <= a.start ||
      a.end - a.start > 120
    ) {
      a.error = "请选择音频范围内、长度不超过 120 秒的有效片段。";
      $("#transcription-error").textContent = a.error;
      return;
    }
    a.status = "transcribing";
    a.error = "";
    a.result = null;
    a.progress = 0;
    a.message = "准备本机转谱模型…";
    const abort = new AbortController();
    a.abort = abort;
    $("#source-audio")?.pause();
    render();
    try {
      const { transcribeAudio } = await import("./audio-transcription.js");
      const result = await transcribeAudio(a.file, {
        title: a.title || a.file.name,
        tempo: a.tempo ? Number(a.tempo) : 0,
        grid: a.grid,
        mode: a.mode,
        onsetThreshold:
          a.sensitivity === "sensitive"
            ? 0.3
            : a.sensitivity === "strict"
              ? 0.7
              : 0.5,
        frameThreshold:
          a.sensitivity === "sensitive"
            ? 0.25
            : a.sensitivity === "strict"
              ? 0.4
              : 0.3,
        startSeconds: a.start,
        endSeconds: a.end,
        signal: abort.signal,
        onProgress: (p) => {
          if (abort.signal.aborted) return;
          a.progress = Math.max(0, Math.min(1, Number(p.progress) || 0));
          a.message = p.message || p.stage || "正在识别音符…";
          if (state.view === "audio") {
            const bar = $("#transcription-progress");
            if (bar) bar.value = a.progress;
            if ($("#transcription-percent"))
              $("#transcription-percent").textContent =
                Math.round(a.progress * 100) + "%";
            if ($("#transcription-message"))
              $("#transcription-message").textContent = a.message;
          }
        },
      });
      if (abort.signal.aborted) return;
      result.score = validateScore(result.score);
      a.result = result;
      a.status = "complete";
      a.progress = 1;
      if (state.view === "audio") render();
      else toast("音频转谱完成，可到音频转谱页查看");
    } catch (e) {
      if (abort.signal.aborted) return;
      a.error = e.message || "转谱未完成，请重试或更换清晰音源。";
      a.status = "error";
      if (state.view === "audio") render();
    } finally {
      if (a.abort === abort) a.abort = null;
    }
  }

  return { isAudioFile, audioView, receiveAudio, bindAudio };
}
