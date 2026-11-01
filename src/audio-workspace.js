import { $, $$, esc, icon } from "./ui.js";
import { validateScore } from "../lib/score.mjs";
import { renderNotation } from "./notation.js";
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
  api,
  requestResponse,
  capabilities,
}) {
  function isAudioFile(file) {
    return (
      !!file &&
      (/^(audio|video)\//.test(file.type) ||
        /\.(wav|mp3|m4a|aac|ogg|flac|webm|mp4|mov|m4v|mkv)$/i.test(file.name))
    );
  }
  const secondsLabel = (value) => {
    const seconds = Math.max(0, Math.floor(value || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  function audioView() {
    const a = state.audio,
      busy = ["loading", "analyzing", "transcribing"].includes(a.status),
      done = !!a.result;
    const available = capabilities.localServer;
    return `<section class="content-page audio-page"><div class="page-heading"><div><span class="eyebrow">AUDIO TO PIANO SCORE</span><h1>把听到的旋律，放进乐谱里。</h1><p>上传音频、视频或直接文件链接，生成可以练习的乐谱草稿。</p></div><span class="local-processing-tag">${icon("headphones")}Pi Agent · GPT-6.1 Sol high</span></div>
<div class="audio-flow"><span class="${a.file ? "complete" : "active"}"><b>1</b>提交音源</span><i>—</i><span class="${a.file && !done ? "active" : done ? "complete" : ""}"><b>2</b>选择片段与转写</span><i>—</i><span class="${done ? "active" : ""}"><b>3</b>试听、校对、练习</span></div>
<div class="audio-workspace"><section class="audio-input-panel">${!available ? '<p class="form-note">Pi 音频转谱需要在本机运行琴伴，并登录 Pi 或 Codex。</p>' : ""}<button id="choose-audio" type="button" class="audio-dropzone ${a.file ? "has-file" : ""}" ${busy ? "disabled" : ""}>${icon("file-audio")}<strong>${a.file ? esc(a.file.name) : "选择音视频文件，或拖放到这里"}</strong><span>${a.file ? "点击更换音源" : "音频 / MP4 / MOV / WebM 等 · 最大 50 MB"}</span></button>
<div class="audio-link"><label class="field">或粘贴公开音视频文件链接<input id="audio-link" type="url" value="${esc(a.sourceLink || "")}" placeholder="https://…/music.mp3" ${busy || !available ? "disabled" : ""}></label><button id="load-audio-link" class="button secondary" type="button" ${busy || !available ? "disabled" : ""}>读取链接</button><p class="form-note">支持可直接下载的媒体链接；视频平台网页请先下载文件后上传。</p></div>
${a.file ? `<div class="audio-source"><div class="audio-file-meta"><span>${icon("check-circle-2")}${a.meta ? `${secondsLabel(a.meta.duration)} · ${a.meta.channels || a.meta.numberOfChannels || 1} 声道` : "正在读取音轨…"}</span><span>${(a.file.size / 1024 / 1024).toFixed(1)} MB</span></div>${a.meta?.waveform ? `<div class="audio-waveform" aria-label="音频振幅波形">${a.meta.waveform.map((v) => `<i style="height:${Math.max(3, Math.min(100, v * 100))}%"></i>`).join("")}</div>` : ""}${a.url ? `<audio id="source-audio" controls preload="metadata" src="${a.url}" aria-label="原始音频试听"></audio>` : ""}</div>` : ""}
<form id="transcription-form"><label class="field">乐谱名称<input id="audio-title" value="${esc(a.title)}" maxlength="180" placeholder="例如：我的钢琴录音" ${busy ? "disabled" : ""} required></label><div class="audio-segment"><div class="audio-setting-label">选择转谱片段<span>单次最多 120 秒</span></div><div><label>开始（秒）<input id="audio-start" type="number" min="0" max="${a.meta?.duration || 0}" step="any" value="${a.start}" ${busy ? "disabled" : ""}></label><span>—</span><label>结束（秒）<input id="audio-end" type="number" min="0.1" max="${a.meta?.duration || 120}" step="any" value="${a.end}" ${busy ? "disabled" : ""}></label><button id="preview-segment" class="button secondary" type="button" ${!a.meta || busy ? "disabled" : ""}>${icon("play")}试听片段</button></div></div>
<div class="audio-options"><label class="field">速度（BPM）<input id="audio-tempo" type="number" min="20" max="240" value="${esc(a.tempo)}" placeholder="由 Pi 估计" ${busy ? "disabled" : ""}></label><label class="field">时值网格<select id="audio-grid" ${busy ? "disabled" : ""}><option value="1/16" ${a.grid === "1/16" ? "selected" : ""}>十六分音符</option><option value="1/8" ${a.grid === "1/8" ? "selected" : ""}>八分音符</option></select></label></div>
<label class="field">转谱内容<select id="audio-mode" ${busy ? "disabled" : ""}><option value="piano" ${a.mode === "piano" ? "selected" : ""}>钢琴 / 可辨识的同时发声音符</option><option value="melody" ${a.mode === "melody" ? "selected" : ""}>提取主旋律</option></select></label><div id="transcription-error" class="form-error" role="alert">${esc(a.error)}</div><button id="start-transcription" class="button primary full" type="submit" ${!a.meta || busy || !available ? "disabled" : ""}>${icon(busy ? "loader-circle" : "audio-lines", busy ? "spin" : "")}${a.status === "loading" ? "正在读取链接" : a.status === "analyzing" ? "正在读取音源" : a.status === "transcribing" ? "正在转谱…" : "开始 Pi 转谱"}</button>${a.status === "transcribing" ? '<button id="cancel-transcription" class="text-button cancel-transcription" type="button">取消本次转谱</button>' : ""}</form><p class="audio-privacy">音频在本机转换成频谱，频谱会发送给 GPT-6.1 Sol high；模型不直接接收声音。频谱转谱为实验功能，多声部、混音和人声可能出现错音或漏音，请对照原音校对。</p></section>
<section class="audio-output-panel">${done ? audioResultMarkup() : `<div class="audio-output-heading"><span>转谱预览</span><span>五线谱 / 简谱</span></div><div class="audio-output-empty"><div class="wave-symbol">${icon("audio-lines")}</div><h2>${a.status === "transcribing" ? "正在分析频谱与节奏" : "乐谱，会在这里出现。"}</h2><p>${a.status === "transcribing" ? "Pi 正在根据频谱推断音符。" : "上传音源，选择想练的片段，<br>转写后即可试听、导出或进入练习室。"}</p><div id="transcription-progress-area" class="transcription-progress-area ${a.status === "transcribing" ? "visible" : ""}"><progress id="transcription-progress" max="1" value="${a.progress}"></progress><p id="transcription-message">${esc(a.message)}</p></div></div><div class="audio-capability"><div>${icon("piano")}<span>推断音符与节奏<small>钢琴或单一乐器录音更适合</small></span></div><div>${icon("sliders-horizontal")}<span>支持变速、分手播放<small>导入练习室后可放慢速度</small></span></div><div>${icon("download")}<span>可导出 MIDI 与 MusicXML<small>保存到曲库，继续慢练</small></span></div></div>`}</section></div></section>`;
  }
  function audioResultMarkup() {
    const a = state.audio,
      r = a.result,
      s = r.score;
    return `<div class="audio-output-heading"><span>${icon("check-circle-2")}转写完成 · 待校对</span><div class="notation-switch"><button data-audio-mode="staff" class="${a.previewMode === "staff" ? "selected" : ""}">五线谱</button><button data-audio-mode="numbered" class="${a.previewMode === "numbered" ? "selected" : ""}">简谱</button></div></div><div class="audio-result-title"><h2>${esc(s.title)}</h2><p>${s.notes.length} 个音符<span>${s.tempo} BPM</span><span>${r.analysis?.keyKnown === false ? "调号待确认" : s.mode ? esc(tonalityLabel(s)) : keyName(s.keySignature) + " 调号"}</span></p></div><div id="audio-score-preview" class="audio-score-preview" aria-label="音频转写乐谱预览"></div><div class="transcription-warnings">${(r.warnings || []).map((w) => `<p>${esc(w)}</p>`).join("")}</div><div class="audio-result-actions"><button id="practice-transcription" class="button primary">${icon("play")}导入练习室</button><button id="download-transcription" class="button secondary">${icon("download")}MIDI</button><button id="download-transcription-xml" class="button secondary">${icon("download")}MusicXML</button></div><p class="audio-result-note">可在练习室试听、编辑和打印。请对照原音校对速度、时值和音区。</p>`;
  }
  const fileBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("无法读取音视频文件。"));
      reader.readAsDataURL(file);
    });
  async function receiveAudio(file, { fromLink = false } = {}) {
    const a = state.audio;
    if (a.status === "transcribing")
      return toast("请先取消或等待当前转谱完成。");
    if (!fromLink && !isAudioFile(file))
      return toast("请选择音频或视频文件。", true);
    if (file.size > 50 * 1024 * 1024)
      return toast("文件超过 50 MB，请先剪辑后再导入。", true);
    player.pause();
    a.abort?.abort();
    if (a.url) URL.revokeObjectURL(a.url);
    a.file = file;
    a.decodedFile = file;
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
      let meta;
      try {
        meta = await analyzeAudio(file);
      } catch (error) {
        if (!capabilities.localServer) throw error;
        const data = await fileBase64(file);
        const response = await requestResponse("/api/audio/decode", {
          body: { data },
          timeoutMs: 120000,
        });
        const converted = new File([await response.blob()], "audio.wav", {
          type: "audio/wav",
        });
        meta = await analyzeAudio(converted);
        if (a.file !== file) return;
        a.decodedFile = converted;
        URL.revokeObjectURL(a.url);
        a.url = URL.createObjectURL(converted);
      }
      if (a.file !== file) return;
      a.meta = meta;
      a.start = 0;
      a.end = Math.floor(Math.min(120, meta.duration) * 1000) / 1000;
      a.status = "ready";
      render();
    } catch (error) {
      if (a.file !== file) return;
      a.error = error.message || "无法读取音轨，请更换音视频文件。";
      a.status = "error";
      render();
    }
  }
  async function receiveLink() {
    const a = state.audio;
    const url = a.sourceLink?.trim();
    if (!url) {
      a.error = "请输入公开音视频文件链接。";
      render();
      return;
    }
    a.status = "loading";
    a.error = "";
    render();
    try {
      const response = await requestResponse("/api/audio/source", {
        body: { url },
        timeoutMs: 120000,
      });
      const blob = await response.blob();
      let name = "链接音源";
      try {
        name =
          decodeURIComponent(new URL(url).pathname.split("/").pop()) || name;
      } catch {
        /* Server validates the URL. */
      }
      a.status = "idle";
      await receiveAudio(new File([blob], name, { type: blob.type }), {
        fromLink: true,
      });
    } catch (error) {
      a.error = error.message || "无法读取这个链接。";
      a.status = "error";
      render();
    }
  }
  function bindAudio() {
    const a = state.audio;
    $("#choose-audio").onclick = () => $("#audio-input").click();
    $("#audio-link").oninput = (event) => {
      a.sourceLink = event.target.value;
    };
    $("#load-audio-link").onclick = receiveLink;
    const sync = () => {
      a.title = $("#audio-title").value;
      a.start = Number($("#audio-start").value);
      a.end = Number($("#audio-end").value);
      a.tempo = $("#audio-tempo").value;
      a.grid = $("#audio-grid").value;
      a.mode = $("#audio-mode").value;
    };
    for (const id of [
      "audio-title",
      "audio-start",
      "audio-end",
      "audio-tempo",
      "audio-grid",
      "audio-mode",
    ])
      $("#" + id).onchange = sync;
    $("#transcription-form").onsubmit = async (event) => {
      event.preventDefault();
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
        toast("音源暂时无法播放。", true);
      }
    };
    if ($("#source-audio"))
      $("#source-audio").ontimeupdate = (event) => {
        if (event.currentTarget.currentTime >= a.end)
          event.currentTarget.pause();
      };
    $("#cancel-transcription")?.addEventListener("click", () => {
      a.abort?.abort();
      a.status = "ready";
      a.progress = 0;
      a.message = "";
      render();
      toast("已取消本次音频转谱");
    });
    if (!a.result) return;
    $$("[data-audio-mode]").forEach((button) => {
      button.onclick = () => {
        a.previewMode = button.dataset.audioMode;
        render();
      };
    });
    $("#practice-transcription").onclick = async () => {
      await remember(a.result.score);
      setScore(a.result.score, a.result.warnings || []);
      toast("音频转写谱已保存到曲库");
    };
    const exportFile = async (kind) => {
      try {
        const { exportMidi, exportMusicXML } =
          await import("../lib/exporters.mjs");
        const name = a.result.score.title.replace(/[\\/:*?"<>|]/g, "_");
        download(
          kind === "midi"
            ? exportMidi(a.result.score)
            : exportMusicXML(a.result.score),
          `${name}.${kind === "midi" ? "mid" : "musicxml"}`,
          kind === "midi"
            ? "audio/midi"
            : "application/vnd.recordare.musicxml+xml",
        );
      } catch (error) {
        toast(error.message, true);
      }
    };
    $("#download-transcription").onclick = () => exportFile("midi");
    $("#download-transcription-xml").onclick = () => exportFile("xml");
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
    } catch {
      $("#audio-score-preview").textContent =
        "预览暂时不可用，可导出 MIDI 查看。";
    }
  }
  async function startTranscription() {
    const a = state.audio;
    if (
      !a.file ||
      !a.meta ||
      a.status === "transcribing" ||
      !capabilities.localServer
    )
      return;
    if (
      !Number.isFinite(a.start) ||
      !Number.isFinite(a.end) ||
      a.start < 0 ||
      a.end > a.meta.duration + 0.01 ||
      a.end - a.start < 0.25 ||
      a.end - a.start > 120
    ) {
      a.error = "请选择音频范围内、长度为 0.25–120 秒的片段。";
      $("#transcription-error").textContent = a.error;
      return;
    }
    if (a.tempo && (Number(a.tempo) < 20 || Number(a.tempo) > 240)) {
      a.error = "速度须为 20–240 BPM，或留空由 Pi 估计。";
      $("#transcription-error").textContent = a.error;
      return;
    }
    a.status = "transcribing";
    a.error = "";
    a.result = null;
    a.progress = 0;
    a.message = "正在准备频谱…";
    const abort = new AbortController();
    a.abort = abort;
    $("#source-audio")?.pause();
    render();
    try {
      const { transcribeWithPi } = await import("./pi-audio-transcription.js");
      const result = await transcribeWithPi(
        a.decodedFile || a.file,
        {
          title: a.title || a.file.name,
          tempo: a.tempo ? Number(a.tempo) : 0,
          grid: a.grid,
          mode: a.mode,
          startSeconds: a.start,
          endSeconds: a.end,
          signal: abort.signal,
          onProgress: (p) => {
            if (abort.signal.aborted) return;
            a.progress = Math.max(0, Math.min(1, Number(p.progress) || 0));
            a.message = p.message || "正在识别音符…";
            if (state.view === "audio") {
              if ($("#transcription-progress"))
                $("#transcription-progress").value = a.progress;
              if ($("#transcription-message"))
                $("#transcription-message").textContent = a.message;
            }
          },
        },
        api,
      );
      if (abort.signal.aborted) return;
      result.score = validateScore(result.score);
      a.result = result;
      a.status = "complete";
      a.progress = 1;
      if (state.view === "audio") render();
      else toast("音频转谱完成，可到音频转谱页查看");
    } catch (error) {
      if (abort.signal.aborted) return;
      a.error = error.message || "转谱未完成，请重试或更换清晰音源。";
      a.status = "error";
      if (state.view === "audio") render();
    } finally {
      if (a.abort === abort) a.abort = null;
    }
  }
  return { isAudioFile, audioView, receiveAudio, bindAudio };
}
