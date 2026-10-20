import { createAudioWorkspace } from "./audio-workspace.js";
import { createSearchWorkspace } from "./search-workspace.js";
import { createScoreOutput } from "./score-output.js";
import { readScoreDocument, toPracticeScore } from "../lib/score-document.ts";
import { createLibraryPanel } from "./library-panel.js";
import { $, $$, esc, icon, refreshIcons, read } from "./ui.js";
import { capabilities, STATIC_NOTICE } from "./capabilities.js";
import { createApiClient } from "./api-client.js";
import { createLibraryClient, preserveOriginalFile } from "./library.js";
import { createTaskVault } from "./task-vault.js";
import { createFullScoreClient } from "./full-score-client.js";
import { starterScore } from "../lib/starter-score.mjs";
import { STATIC_SITE, assetURL } from "../lib/asset-url.mjs";
import { validateScore, transposeScore } from "../lib/score.mjs";
import { parseTempoInput } from "../lib/tempo.mjs";
import { importScore } from "../lib/importers.mjs";
import { renderNotation } from "./notation.js";
import { mountNoteEditor } from "./note-editor.js";
import { tonalityLabel } from "../lib/score-arrangement.mjs";
import { renderSourceNotation } from "./source-notation.js";
import { mountFullScoreImport } from "./full-score-import.js";
import { mountNeteaseImport } from "./netease-import.js";
import { sourceMatchesScore, releasePracticeSource } from "./source-library.js";
import { PianoPlayer } from "./audio.js";
import {
  PIANO_INSTRUMENTS,
  DEFAULT_PIANO_INSTRUMENT,
} from "../lib/piano-voices.mjs";
import { mountPracticeLayout, practiceKeyboard } from "./practice-layout.js";
import "./style.css";
import "./practice-layout.css";

const savedInstrument = read("qinban-instrument", DEFAULT_PIANO_INSTRUMENT);
const state = {
  instrument: PIANO_INSTRUMENTS.some((preset) => preset.id === savedInstrument)
    ? savedInstrument
    : DEFAULT_PIANO_INSTRUMENT,
  instrumentInfo: { status: "idle", progress: 0 },
  view: "practice",
  mode: "staff",
  score: starterScore,
  shared: [],
  cloudScores: [],
  cloudLoaded: false,
  cloudError: "",
  cloudBusy: false,
  libraryTab: read("qinban-library-tab", "local"),
  status: null,
  tempo: 80,
  volume: 0.65,
  rightEnabled: true,
  leftEnabled: true,
  metronome: false,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 16,
  follow: true,
  warnings: [],
  renderer: null,
  sourceRecord: null,
  beat: 0,
  busy: false,
  abort: null,
  searchQuery: "",
  searchResults: [],
  searchQueryPlan: null,
  searchNetwork: null,
  searchError: "",
  searching: false,
  searchAbort: null,
  searchFilter: "all",
  externalSearchUrl: "",
  searchProviders: [],
  searchSourcesCount: 0,
  searchLinks: [],
  audio: {
    file: null,
    url: null,
    meta: null,
    title: "",
    start: 0,
    end: 30,
    tempo: "",
    grid: "1/16",
    mode: "piano",
    sensitivity: "standard",
    status: "idle",
    progress: 0,
    message: "",
    error: "",
    abort: null,
    result: null,
    previewMode: "staff",
  },
};
const player = new PianoPlayer({
  instrument: state.instrument,
  onInstrumentState: (info) => {
    state.instrumentInfo = info;
    queueMicrotask(refreshInstrumentUI);
  },
  onFrame: updateFrame,
  onStateChange: updatePlayback,
});
const beatPerMeasure = () =>
  (state.score.timeSignature[0] * 4) / state.score.timeSignature[1];
const practiceMeasureMap = () =>
  state.score.measureMap || originalNotation()?.measureMap;
const measureCount = () =>
  practiceMeasureMap()?.length ||
  Math.ceil(state.score.durationBeats / beatPerMeasure());
const measureStart = (index) =>
  practiceMeasureMap()?.[index]?.beat ?? index * beatPerMeasure();
const measureEnd = (index) => {
  const item = practiceMeasureMap()?.[index];
  return item
    ? item.beat + item.duration
    : Math.min(state.score.durationBeats, (index + 1) * beatPerMeasure());
};
function measureIndexAtBeat(beat) {
  const map = practiceMeasureMap();
  if (!map?.length)
    return Math.min(measureCount() - 1, Math.floor(beat / beatPerMeasure()));
  let low = 0,
    high = map.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1,
      item = map[middle];
    if (beat < item.beat) high = middle - 1;
    else if (beat >= item.beat + item.duration) low = middle + 1;
    else return middle;
  }
  return Math.max(0, Math.min(map.length - 1, low));
}
const durationText = (beats) => {
  let seconds = Math.round(player.timeAtBeat(beats));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
function toast(text, error = false) {
  let area = $("#toast");
  area.textContent = text;
  area.classList.toggle("error", error);
  area.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => area.classList.remove("visible"), 5000);
}
function configuration() {
  return {
    tempo: state.tempo,
    volume: state.volume,
    rightEnabled: state.rightEnabled,
    leftEnabled: state.leftEnabled,
    metronome: state.metronome,
    loopEnabled: state.loopEnabled,
    loopStart: state.loopStart,
    loopEnd: state.loopEnd,
  };
}
function sourceLabel(score) {
  return score.source?.label || "本地乐谱";
}
function originalNotation(score = state.score) {
  if (state.notationScore === score) return state.currentNotation;
  const notation = sourceMatchesScore(score, state.sourceRecord)
    ? state.sourceRecord.notation
    : null;
  if (score === state.score) {
    state.notationScore = score;
    state.currentNotation = notation;
  }
  return notation;
}
let sourceLoadEpoch = 0;
function setScore(score, warnings = [], sourceRecord = null) {
  const epoch = ++sourceLoadEpoch;
  if ($("#modal-root")?.childElementCount) closeModal();
  player.stop();
  if (state.score?.id !== score.id) {
    releasePracticeSource(state.score.id);
    scoreLibrary.release(state.score.id);
  }
  state.document = readScoreDocument(score);
  state.score = toPracticeScore(state.document);
  try {
    localStorage.setItem("qinban-active-score", JSON.stringify(state.score.id));
  } catch {}
  state.sourceRecord = sourceRecord;
  state.notationScore = null;
  const preferred = read("qinban-mode", "staff");
  state.mode = ["staff", "numbered", "roll"].includes(preferred)
    ? preferred
    : "staff";
  state.tempo = state.score.tempo;
  state.beat = 0;
  state.warnings = warnings;
  state.loopEnabled = false;
  state.loopStart = 0;
  state.loopEnd = measureEnd(Math.min(3, measureCount() - 1));
  const initialLoopEnd = state.loopEnd;
  player.setScore(state.score);
  player.configure(configuration());
  state.view = "practice";
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (!originalNotation(state.score))
    loadAvailablePracticeSource(state.score)
      .then((record) => {
        if (epoch !== sourceLoadEpoch || !record) return;
        state.sourceRecord = record;
        state.notationScore = null;
        if (!state.warnings.length && Array.isArray(record.warnings))
          state.warnings = [...record.warnings];
        if (
          !state.loopEnabled &&
          state.loopStart === 0 &&
          state.loopEnd === initialLoopEnd
        ) {
          state.loopEnd = measureEnd(Math.min(3, measureCount() - 1));
          player.configure(configuration());
        }
        render();
      })
      .catch((error) => toast(error.message, true));
}

let disposePracticeLayout;
function render() {
  disposePracticeLayout?.();
  if (state.mode === "source" && !originalNotation()) state.mode = "staff";
  $("#source-audio")?.pause();
  state.renderer?.destroy();
  state.audio.previewRenderer?.destroy();
  $("#app").innerHTML =
    `<div class="app-shell ${state.view === "practice" ? "has-practice" : ""}">
<header id="app-header" class="app-header"><a class="brand" href="#" aria-label="琴伴首页"><span class="brand-symbol">${icon("piano")}</span><span>琴伴<small>QINBAN</small></span></a>
<nav class="main-nav" aria-label="主导航"><button data-nav="practice" class="nav-tab ${state.view === "practice" ? "active" : ""}">${icon("music-2")}<span>练习室</span></button><button data-nav="library" class="nav-tab ${state.view === "library" ? "active" : ""}">${icon("book-open")}<span>我的曲库</span><small>${availableScores().length}</small></button><button data-nav="search" class="nav-tab ${state.view === "search" ? "active" : ""}">${icon("search")}<span>AI 找谱</span><small class="online-badge">联网</small></button><button data-nav="audio" class="nav-tab ${state.view === "audio" ? "active" : ""}">${icon("audio-lines")}<span>音频转谱</span></button></nav>
<div class="header-actions"><button class="button quiet" data-fullscore-jobs>识谱任务</button><button class="button quiet" data-upload aria-label="导入乐谱">${icon("upload")}<span>导入乐谱</span></button><button class="icon-button" data-settings aria-label="AI 与设置" title="AI 与设置">${icon("sliders-horizontal")}</button></div></header>
<main class="view-${state.view}">${state.view === "library" ? libraryView() : state.view === "search" ? searchView() : state.view === "audio" ? audioView() : practiceView()}</main>
<nav class="mobile-nav" aria-label="移动端主导航">${[
      ["practice", "music-2", "练习室"],
      ["library", "book-open", "曲库"],
      ["search", "search", "找谱"],
      ["audio", "audio-lines", "转谱"],
    ]
      .map(
        ([view, symbol, label]) =>
          `<button data-nav="${view}" class="${state.view === view ? "active" : ""}" ${state.view === view ? 'aria-current="page"' : ""}>${icon(symbol)}<span>${label}</span></button>`,
      )
      .join("")}</nav>
</div><div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div><input id="file-input" type="file" accept=".xml,.musicxml,.mxl,.mid,.midi,.json,.pdf,.png,.jpg,.jpeg,.webp" hidden><input id="audio-input" type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac,.webm" hidden>`;
  refreshIcons();
  bindCommon();
  if (state.view === "practice") {
    bindPractice();
    disposePracticeLayout = mountPracticeLayout($(".app-shell"));
    drawNotation();
    updateFrame(state.beat, []);
    updatePlayback(player.state);
    refreshInstrumentUI();
  } else if (state.view === "library") bindLibrary();
  else if (state.view === "audio") bindAudio();
  else bindSearch();
}
function practiceView() {
  const s = state.score;
  return `<div class="practice-layout-bar" aria-label="练习界面布局"><div class="practice-current"><span class="eyebrow">PRACTICE ROOM</span><span>${esc(s.title)}</span></div><div class="layout-buttons">
<button data-layout="topbar" aria-controls="app-header" aria-label="显示或收起顶栏" title="显示或收起顶栏">${icon("panel-top")}<span>顶栏</span></button>
<button data-layout="sidebar" aria-controls="practice-sidebar" aria-label="显示或收起练习设置" title="显示或收起练习设置">${icon("panel-left")}<span>侧栏</span></button>
<button data-layout="keyboard" aria-controls="practice-keyboard" aria-label="显示或收起键盘" title="显示或收起键盘">${icon("piano")}<span>键盘</span></button>
<button data-layout="focus" aria-label="进入专注模式" title="只显示乐谱和播放">${icon("maximize-2")}<span>专注</span></button></div></div>
<button class="sidebar-scrim" data-layout-close aria-label="关闭练习设置"></button>
<aside id="practice-sidebar" class="practice-sidebar" aria-label="练习设置"><div class="sidebar-heading"><h2>练习设置</h2><button class="icon-button" data-layout-close aria-label="收起练习设置">${icon("panel-left-close")}</button></div>
<button class="sidebar-piece" data-nav="library">${icon("file-music")}<span><strong>${esc(s.title)}</strong><small>${esc(s.composer || "钢琴练习曲")}</small></span>${icon("chevron-down")}</button>
<div class="sidebar-section"><h3>演奏速度</h3><div class="tempo-control"><label class="tempo-value"><input id="tempo-number" aria-label="输入练习速度 BPM" type="number" inputmode="numeric" min="20" max="300" step="1" value="${state.tempo}"><small>BPM</small></label><button class="original-speed" data-speed="1" title="恢复原速">原速</button></div><input id="tempo" aria-label="练习速度" type="range" min="20" max="300" step="1" value="${state.tempo}"></div>
<div class="sidebar-section"><h3>分手练习</h3><div class="hand-buttons"><button id="right-hand" aria-pressed="${state.rightEnabled}" class="hand-button right ${state.rightEnabled ? "enabled" : ""}">右手 ${icon("check")}</button><button id="left-hand" aria-pressed="${state.leftEnabled}" class="hand-button left ${state.leftEnabled ? "enabled" : ""}">左手 ${icon("check")}</button></div><label class="compact-toggle" for="metronome"><input id="metronome" type="checkbox" ${state.metronome ? "checked" : ""}>节拍器</label></div>
<div class="sidebar-section"><div class="sidebar-section-title"><h3>片段循环</h3><label class="compact-toggle" for="loop"><input id="loop" type="checkbox" ${state.loopEnabled ? "checked" : ""}>开启循环</label></div><div class="loop-controls"><input id="loop-start" aria-label="循环起始小节" type="number" min="1" max="${measureCount()}" value="${measureIndexAtBeat(state.loopStart) + 1}"><span>至</span><input id="loop-end" aria-label="循环结束小节" type="number" min="1" max="${measureCount()}" value="${measureIndexAtBeat(Math.max(0, state.loopEnd - 0.00001)) + 1}"><small>小节</small></div></div>
<div class="sidebar-section"><h3>乐谱显示</h3><div class="notation-switch">${originalNotation(s) ? `<button data-mode="source" class="${state.mode === "source" ? "selected" : ""}">原图参考</button>` : ""}<button data-mode="staff" class="${state.mode === "staff" ? "selected" : ""}">五线谱</button><button data-mode="numbered" class="${state.mode === "numbered" ? "selected" : ""}">简谱</button><button data-mode="roll" class="${state.mode === "roll" ? "selected" : ""}">钢琴卷帘</button></div><label class="compact-toggle" for="follow"><input id="follow" type="checkbox" ${state.follow ? "checked" : ""}>播放时自动跟随</label><div class="transpose-control"><span>移调</span><button id="transpose-down" aria-label="降低半音">−</button><span>${esc(s.mode ? tonalityLabel(s) : keyName(s.keySignature) + " 调")}</span><button id="transpose-up" aria-label="升高半音">＋</button></div></div>
<div class="sidebar-section sidebar-instrument"><h3>钢琴音色</h3>${instrumentControls()}<div class="volume-control">${icon("volume-2")}<input id="volume" aria-label="音量" type="range" min="0" max="1" step="0.01" value="${state.volume}"></div></div>
<div class="sidebar-footer"><button class="button secondary" data-edit-notes>编辑与改编</button><button class="icon-button" data-export aria-label="导出乐谱" title="导出乐谱">${icon("download")}</button></div></aside>
<section class="score-stage" aria-label="乐谱练习区域"><div class="score-document-heading"><div><h1>${esc(s.title)}</h1><p>${esc(s.composer || "钢琴谱")}<span>♩ = <b id="paper-tempo">${state.tempo}</b></span><span>${s.timeSignature.join("/")} 拍</span><span>${s.mode ? esc(tonalityLabel(s)) : keyName(s.keySignature) + " 调号"}</span></p></div><div class="score-provenance"><button class="button secondary" data-print-score>${icon("printer")}打印乐谱</button><span class="arrangement-tag">${s.source?.kind === "full-score-agent-approved" ? "已审核 · AI逐谱校对" : s.source?.kind === "full-score-model-reviewed" ? "AI全谱校对版 · 待人工确认" : s.source?.reviewRequired || s.source?.kind === "full-score-ai-draft" ? "数字谱 · 待校对" : s.source?.kind === "full-pdf-reviewed" ? "完整PDF · 已复核" : s.source?.kind === "pdf-transcription-checked" ? "7页全谱 · 已核对" : s.source?.kind === "audio-transcription" ? "音频转写 · 待校对" : s.source?.kind === "image-ai" ? "AI 识谱 · 待校对" : s.source?.kind === "public-domain-arrangement" ? "简易练习编配" : "钢琴乐谱"}</span><div class="source-line"><span>${esc(sourceLabel(s))}</span>${safeLink(s.source?.url, "来源")}${state.warnings.length ? `<button id="show-warnings">${state.warnings.length} 条提示</button>` : ""}</div></div></div><div id="notation" class="notation-area" aria-label="可点击定位的连续钢琴乐谱"></div><div class="score-status"><span>${icon("music-2")} ${measureCount()} 小节 · 点击音符定位</span><span>左右手同步播放 · 乐谱本地保存</span></div></section>
<section class="playback-dock" aria-label="播放控制"><div class="transport-group"><button id="restart" class="icon-button" aria-label="回到开头" title="回到开头">${icon("rotate-ccw")}</button><button id="prev-measure" class="icon-button" aria-label="上一小节" title="上一小节">${icon("skip-back")}</button><button id="play" class="play-button" aria-label="播放">${icon("play")}</button><div class="playback-status"><strong id="playback-label">准备练习</strong><span id="transport-position">第 1 / ${measureCount()} 小节</span></div></div><div class="progress-row"><span id="elapsed">0:00</span><input id="seek" type="range" aria-label="播放进度" min="0" max="${s.durationBeats}" step="0.01" value="${state.beat}"><span id="total-time">${durationText(s.durationBeats)}</span></div><div class="dock-tempo"><button class="icon-button" data-tempo-step="-4" aria-label="减慢速度">−</button><span><b data-tempo-display>${state.tempo}</b> BPM</span><button class="icon-button" data-tempo-step="4" aria-label="加快速度">＋</button></div><div class="dock-shortcuts"><button data-quick-hand="right" aria-pressed="${state.rightEnabled}">右手</button><button data-quick-hand="left" aria-pressed="${state.leftEnabled}">左手</button><button data-quick-loop aria-pressed="${state.loopEnabled}">${icon("repeat-2")}循环</button><button data-layout="sidebar" aria-controls="practice-sidebar" aria-label="打开练习设置">${icon("sliders-horizontal")}设置</button></div></section>
${practiceKeyboard()}<button class="layout-restore icon-button" data-layout="focus" aria-label="退出专注模式" title="退出专注模式">${icon("minimize-2")}</button>`;
}
function keyName(fifths = 0) {
  return (
    {
      "-7": "C♭",
      "-6": "G♭",
      "-5": "D♭",
      "-4": "A♭",
      "-3": "E♭",
      "-2": "B♭",
      "-1": "F",
      0: "C",
      1: "G",
      2: "D",
      3: "A",
      4: "E",
      5: "B",
      6: "F♯",
      7: "C♯",
    }[fifths] || "C"
  );
}
function safeLink(url, label) {
  try {
    const u = new URL(url);
    if (!["https:", "http:"].includes(u.protocol)) return "";
    return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}${icon("arrow-up-right")}</a>`;
  } catch {
    return "";
  }
}
function bindCommon() {
  $("[data-fullscore-jobs]")?.addEventListener("click", openFullScoreTasks);
  $$("[data-nav]").forEach(
    (b) =>
      (b.onclick = () => {
        player.pause();
        state.view = b.dataset.nav;
        render();
        if (state.view === "library") {
          void syncLocalLibrary().catch(() => {});
          if (state.libraryTab === "cloud") void syncCloudLibrary();
        }
      }),
  );
  $$("[data-upload]").forEach((b) => (b.onclick = openImportChooser));
  $$("[data-ai]").forEach((b) => (b.onclick = () => openSearch()));
  $$("[data-settings]").forEach((b) => (b.onclick = openSettings));
  $(".brand").onclick = (e) => {
    e.preventDefault();
    state.view = "practice";
    render();
  };
  $("#file-input").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) await receiveFile(f);
  };
  $("#audio-input").onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) receiveAudio(file);
  };
  document.ondragover = (e) => e.preventDefault();
  document.ondrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) {
      if (isAudioFile(f)) receiveAudio(f);
      else receiveFile(f);
    }
  };
}
function instrumentStatusText() {
  const info = state.instrumentInfo;
  if (info.status === "loading")
    return `正在准备 ${Math.round((info.progress || 0) * 100)}%`;
  if (info.status === "error") return "音色未就绪 · 请重试";
  if (info.status === "ready")
    return info.engine === "synth" ? "轻量合成" : "采样已就绪";
  return state.instrument === "synth" ? "轻量合成" : "首次播放时准备";
}
function instrumentControls() {
  return `<div class="instrument-control"><label for="piano-instrument">音色</label><select id="piano-instrument" aria-label="乐器音色">${PIANO_INSTRUMENTS.map((preset) => `<option value="${preset.id}" ${state.instrument === preset.id ? "selected" : ""}>${esc(preset.label)}</option>`).join("")}</select><button id="instrument-preview" class="instrument-preview" aria-label="试听当前音色的旋律" title="试听一小段旋律">${icon("volume-2")}<span>试听</span></button><span id="instrument-status" class="instrument-status" role="status" aria-live="polite">${instrumentStatusText()}</span></div>`;
}
function refreshInstrumentUI() {
  const select = $("#piano-instrument"),
    status = $("#instrument-status"),
    preview = $("#instrument-preview");
  if (!select) return;
  select.value = state.instrument;
  select.title =
    PIANO_INSTRUMENTS.find((preset) => preset.id === state.instrument)
      ?.description || "";
  if (status) {
    status.textContent = instrumentStatusText();
    status.classList.toggle("error", state.instrumentInfo.status === "error");
    status.title = state.instrumentInfo.message || status.textContent;
  }
  if (preview) preview.disabled = state.instrumentInfo.status === "loading";
  updatePlayback(player.state);
}
function bindPractice() {
  $("#piano-instrument").onchange = async (event) => {
    const id = event.target.value;
    state.instrument = id;
    refreshInstrumentUI();
    try {
      await player.setInstrument(id);
      if (state.instrument !== id) return;
      try {
        localStorage.setItem("qinban-instrument", JSON.stringify(id));
      } catch {
        /* playback remains available without persistent storage */
      }
      refreshInstrumentUI();
    } catch (error) {
      if (state.instrument === id)
        toast(
          error.message || "音色准备失败，请重试或选择轻量合成钢琴。",
          true,
        );
    }
  };
  $("#instrument-preview").onclick = async () => {
    try {
      await player.previewInstrument();
    } catch (error) {
      toast(error.message || "音色试听失败，请重试。", true);
    }
  };
  $$("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        state.mode = b.dataset.mode;
        if (state.mode !== "source")
          localStorage.setItem("qinban-mode", JSON.stringify(state.mode));
        render();
      }),
  );
  $("#play").onclick = togglePlay;
  $$("[data-tempo-step]").forEach(
    (button) =>
      (button.onclick = () =>
        setTempo(state.tempo + Number(button.dataset.tempoStep))),
  );
  $$("[data-quick-hand]").forEach(
    (button) =>
      (button.onclick = () =>
        $("#" + button.dataset.quickHand + "-hand").click()),
  );
  $("[data-quick-loop]").onclick = () => {
    $("#loop").checked = !state.loopEnabled;
    $("#loop").dispatchEvent(new Event("change"));
  };
  $("#restart").onclick = () => {
    player.stop();
    updateFrame(0, []);
    $("#notation").scrollTo({ top: 0, behavior: "instant" });
  };
  $("#prev-measure").onclick = () => {
    const index = measureIndexAtBeat(state.beat),
      atStart = Math.abs(state.beat - measureStart(index)) < 0.0001;
    player.seek(measureStart(Math.max(0, index - (atStart ? 1 : 0))));
  };
  $("#seek").oninput = (e) => player.seek(+e.target.value);
  $("#volume").oninput = (e) => {
    state.volume = +e.target.value;
    player.configure(configuration());
  };
  $("#tempo").oninput = (e) => setTempo(+e.target.value);
  const tempoInput = $("#tempo-number");
  const commitTempo = () => {
    try {
      setTempo(parseTempoInput(tempoInput.value));
    } catch (error) {
      tempoInput.value = state.tempo;
      toast(error.message);
    }
  };
  tempoInput.onchange = commitTempo;
  tempoInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTempo();
      tempoInput.blur();
    }
    if (e.key === "Escape") {
      tempoInput.value = state.tempo;
      tempoInput.blur();
    }
  };
  $$("[data-speed]").forEach(
    (b) =>
      (b.onclick = () =>
        setTempo(Math.round(state.score.tempo * +b.dataset.speed))),
  );
  for (const hand of ["right", "left"])
    $(`#${hand}-hand`).onclick = () => {
      state[hand + "Enabled"] = !state[hand + "Enabled"];
      player.configure(configuration());
      state.renderer?.setHands?.(configuration());
      const b = $(`#${hand}-hand`);
      b.classList.toggle("enabled", state[hand + "Enabled"]);
      b.setAttribute("aria-pressed", String(state[hand + "Enabled"]));
      $(`[data-quick-hand="${hand}"]`).setAttribute(
        "aria-pressed",
        String(state[hand + "Enabled"]),
      );
    };
  $("#metronome").onchange = (e) => {
    state.metronome = e.target.checked;
    player.configure(configuration());
  };
  $("#loop").onchange = (e) => {
    state.loopEnabled = e.target.checked;
    $("[data-quick-loop]").setAttribute(
      "aria-pressed",
      String(state.loopEnabled),
    );
    applyLoop();
  };
  $("#loop-start").onchange = applyLoop;
  $("#loop-end").onchange = applyLoop;
  $("#follow").onchange = (e) => {
    state.follow = e.target.checked;
    state.renderer?.destroy();
    drawNotation();
  };
  $("#transpose-up").onclick = () => transpose(1);
  $("#transpose-down").onclick = () => transpose(-1);
  $$("[data-midi]").forEach(
    (k) =>
      (k.onpointerdown = async () => {
        try {
          await player.notePreview(+k.dataset.midi);
          k.classList.add("preview");
          setTimeout(() => k.classList.remove("preview"), 300);
        } catch {
          toast("无法启动音频，请检查浏览器音频权限。", true);
        }
      }),
  );
  $("[data-export]").onclick = openExport;
  $("[data-print-score]").onclick = openPrintScore;
  $("[data-edit-notes]").onclick = openNoteEditor;
  $("#show-warnings")?.addEventListener("click", () =>
    modal(
      "导入提示",
      `<div class="notice-list">${state.warnings.map((w) => `<p>${esc(w)}</p>`).join("")}</div>`,
    ),
  );
}
function applyLoop() {
  let start = Math.max(
      1,
      Math.min(measureCount(), +$("#loop-start").value || 1),
    ),
    end = Math.max(
      start,
      Math.min(measureCount(), +$("#loop-end").value || start),
    );
  $("#loop-start").value = start;
  $("#loop-end").value = end;
  state.loopStart = measureStart(start - 1);
  state.loopEnd = measureEnd(end - 1);
  player.configure(configuration());
}
function setTempo(tempo) {
  if (!Number.isFinite(tempo)) return;
  state.tempo = Math.round(Math.max(20, Math.min(300, tempo)));
  player.configure(configuration());
  if ($("#tempo-number")) $("#tempo-number").value = state.tempo;
  if ($("#paper-tempo")) $("#paper-tempo").textContent = state.tempo;
  $$("[data-tempo-display]").forEach(
    (element) => (element.textContent = state.tempo),
  );
  $("#tempo").value = state.tempo;
  $("#total-time").textContent = durationText(state.score.durationBeats);
  $$("[data-speed]").forEach((b) =>
    b.classList.toggle(
      "active",
      Math.round(state.score.tempo * +b.dataset.speed) === state.tempo,
    ),
  );
}
function transpose(amount) {
  try {
    const s = transposeScore(state.score, amount);
    setScore(s, state.warnings);
    toast(`${amount > 0 ? "升高" : "降低"}半音，谱面与播放已同步。`);
  } catch (e) {
    toast(e.message, true);
  }
}
async function togglePlay() {
  try {
    if (player.state === "playing") player.pause();
    else await player.play();
  } catch (e) {
    toast(e.message || "音频播放失败", true);
  }
}
function updatePlayback(playState) {
  if (!$("#play")) return;
  const active = playState === "playing";
  const loading = state.instrumentInfo.status === "loading" && !active;
  $("#play").disabled = loading;
  $("#play").innerHTML = icon(
    loading ? "loader-circle" : active ? "pause" : "play",
    loading ? "spin" : "",
  );
  $("#play").setAttribute(
    "aria-label",
    loading ? "正在准备乐器音色" : active ? "暂停" : "播放",
  );
  $("#play").classList.toggle("playing", active);
  if ($("#playback-label"))
    $("#playback-label").textContent = loading
      ? "正在准备音色"
      : active
        ? "正在播放"
        : state.beat >= state.score.durationBeats - 0.00001
          ? "播放完成"
          : playState === "paused"
            ? "已暂停"
            : "准备练习";
  refreshIcons();
}
function updateFrame(beat, active = []) {
  state.beat = beat;
  if (!$("#seek")) return;
  $("#seek").value = beat;
  $("#elapsed").textContent =
    `${Math.floor(player.elapsedSeconds / 60)}:${String(Math.floor(player.elapsedSeconds) % 60).padStart(2, "0")}`;
  if (player.state !== "playing" && state.instrumentInfo.status !== "loading")
    $("#playback-label").textContent =
      beat >= state.score.durationBeats - 0.00001
        ? "播放完成"
        : player.state === "paused"
          ? "已暂停"
          : "准备练习";
  const measure = measureIndexAtBeat(beat) + 1;
  $("#transport-position").textContent =
    `第 ${measure} / ${measureCount()} 小节`;
  state.renderer?.setBeat(beat);
  const activeMap = new Map();
  for (const n of active) activeMap.set(n.midi, n.hand);
  $$("[data-midi]").forEach((k) => {
    const hand = activeMap.get(+k.dataset.midi);
    k.classList.toggle("active-right", hand === "right");
    k.classList.toggle("active-left", hand === "left");
  });
}
function drawNotation() {
  try {
    const renderScore =
      state.mode === "source" ? renderSourceNotation : renderNotation;
    state.renderer = renderScore($("#notation"), state.score, {
      mode: state.mode,
      sourceNotation: originalNotation(),
      autoScroll: state.follow,
      rightEnabled: state.rightEnabled,
      leftEnabled: state.leftEnabled,
      onSeek: (beat) => player.seek(beat),
    });
    state.renderer.setBeat(state.beat);
  } catch (e) {
    $("#notation").innerHTML =
      `<div class="empty-state">谱面暂时无法排版：${esc(e.message)}<p>可以切换简谱或导出 MusicXML 查看。</p></div>`;
    console.error(e);
  }
}
function openNoteEditor() {
  const originalId = state.score.id,
    baseRevision =
      scoreLibrary.records.find((r) => r.id === originalId)?.revision || 0;
  player.pause();
  modal(
    "编辑与改编乐谱",
    '<div id="note-editor-host"></div>',
    "音符、和弦与调式共同驱动谱面和播放。",
  );
  $(".modal").classList.add("note-editor-modal");
  const disposeEditor = mountNoteEditor($("#note-editor-host"), state.score, {
    initialBeat: state.beat,
    onPreview: (_midi, _duration, score, id) => player.previewNotes(score, id),
    onSave: async (score) => {
      await remember(score, undefined, undefined, {
        expectedRevision: score.id === originalId ? baseRevision : 0,
      });
      setScore(score);
      toast("修改已保存到曲库，五线谱、简谱与播放已更新。");
    },
  });
  modalCleanup = () => {
    disposeEditor();
    player.stopPreview();
  };
}
let modalCleanup = null;
let modalEpoch = 0;
function modal(title, body, subtitle = "") {
  modalEpoch++;
  modalCleanup?.();
  modalCleanup = null;
  player.pause();
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-heading"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div><button id="modal-close" class="icon-button" aria-label="关闭">${icon("x")}</button></div>${body}</section></div>`;
  refreshIcons();
  $("#modal-close").onclick = closeModal;
  $(".modal-backdrop").onclick = (e) => {
    if (e.target === e.currentTarget && !state.busy) closeModal();
  };
  setTimeout(
    () =>
      $(".modal input:not([type=hidden]),.modal select,.modal button")?.focus(),
    0,
  );
}
function closeModal() {
  modalEpoch++;
  modalCleanup?.();
  modalCleanup = null;
  if (state.busy) {
    state.abort?.abort();
    state.busy = false;
  }
  $("#modal-root").innerHTML = "";
}
const apiClient = createApiClient({
  capabilities,
  onStatus: (value) => {
    state.status = value;
  },
});
const api = (path, body, signal) => apiClient.json(path, body, signal);
const scoreLibrary = createLibraryClient({ capabilities, api: apiClient });
const taskVault = createTaskVault({ metadata: scoreLibrary.metadata });
const recognitionClient = createFullScoreClient({
  api: apiClient,
  vault: taskVault,
  onComplete: () => syncLocalLibrary(),
});
const {
  libraryView,
  bindLibrary,
  availableScores,
  remember,
  loadAvailablePracticeSource,
  syncLocalLibrary,
  syncCloudLibrary,
} = createLibraryPanel({
  state,
  client: scoreLibrary,
  api,
  capabilities,
  render,
  setScore,
  starterScore,
  keyName,
  toast,
  download,
  modal,
});
const { isAudioFile, audioView, receiveAudio, bindAudio } =
  createAudioWorkspace({
    state,
    player,
    render,
    toast,
    setScore,
    remember,
    download,
    keyName,
  });
const { openSearch, searchView, bindSearch, loadOnlineEntry } =
  createSearchWorkspace({
    state,
    player,
    render,
    toast,
    api,
    requestResponse: apiClient.response,
    refreshStatus,
    capabilities,
    openAI,
    openFullPdf,
    modal,
    closeModal,
    setModalCleanup: (cleanup) => {
      modalCleanup = cleanup;
    },
    setScore,
    remember,
    fileDataURL,
    safeLink,
    receiveFile,
  });
const { openExport, openPrintScore } = createScoreOutput({
  state,
  modal,
  closeModal,
  originalNotation,
  download,
  toast,
});
async function refreshStatus() {
  if (!capabilities.localServer) return null;
  try {
    return await apiClient.refreshStatus();
  } catch {
    state.status = null;
    return null;
  }
}
function providerOptions() {
  return `<option value="pi">GPT-6.1 Sol high · ChatGPT 订阅</option><option value="deepseek">DeepSeek Flash high · API</option>`;
}
async function openAI(attachment = null) {
  if (!capabilities.recognition) {
    toast(STATIC_NOTICE, true);
    return;
  }
  if (!attachment) return openSearch();
  modal("选择识谱范围", '<p class="form-note">正在读取原图、检测双手谱行…</p>');
  const openingEpoch = modalEpoch;
  let selector = null,
    currentPage = 0,
    pageLoading = false,
    disposed = false;
  const preparedPages = new Map();
  const cleanup = () => {
    disposed = true;
    selector?.destroy();
    for (const prepared of preparedPages.values()) prepared.destroy();
    attachment.destroy?.();
  };
  modalCleanup = cleanup;
  try {
    const { prepareScoreImage, mountScoreImageSelector } = await import(
      "./score-image.js"
    );
    const totalPages = attachment.totalPages || attachment.images.length;
    const pageNumber = (index) =>
      totalPages === 1 ? attachment.source?.page || 1 : index + 1;
    const preparePage = async (index) => {
      if (preparedPages.has(index)) return preparedPages.get(index);
      const image =
        attachment.images[index] || (await attachment.loadPage(index + 1));
      const prepared = await prepareScoreImage(
        `data:${image.mimeType};base64,${image.data}`,
        {
          page: pageNumber(index),
          pianoSourceVerified: attachment.source?.pianoSourceVerified === true,
          sourceLabel:
            attachment.source?.instrumentEvidence ||
            attachment.source?.label ||
            "",
        },
      );
      if (disposed) {
        prepared.destroy();
        return null;
      }
      preparedPages.set(index, prepared);
      return prepared;
    };
    const first = await preparePage(0);
    if (disposed || openingEpoch !== modalEpoch) return;
    // Replace only the loading body, retaining its cleanup ownership.
    const section = $(".modal");
    section.innerHTML = `<div class="modal-heading"><div><h2>选择识谱范围</h2><p>先识别清楚的小节，再导入练习。</p></div><button id="modal-close" class="icon-button" aria-label="关闭">${icon("x")}</button></div><form id="ai-form"><div class="ocr-file-heading"><strong>${esc(attachment.name)}</strong>${attachment.source ? safeLink(attachment.source.url, "原始来源") : ""}</div>${totalPages > 1 ? `<label class="field ocr-page-picker">谱面页<select id="ocr-page" aria-label="谱面页">${Array.from({ length: totalPages }, (_, i) => `<option value="${i}">第 ${i + 1} 页 / 共 ${totalPages} 页</option>`).join("")}</select></label>` : ""}<div id="score-image-host"></div><p id="ocr-scope-summary" class="ocr-scope-summary" role="status"></p><label class="field">乐谱名称<input name="title" maxlength="150" value="${esc(attachment.source?.songName || attachment.name.replace(/\.[^.]+$/, ""))}" required></label><label class="field">识谱说明<textarea name="prompt" rows="2" maxlength="3000" placeholder="保留两只手和原谱节奏；后续谱行可补充调号、拍号、速度。"></textarea></label><label class="field">识谱服务<select name="provider">${providerOptions()}</select></label><p class="form-note">仅转写选定范围，不补写缺页。框选时请包含完整小节、两只手与谱号。AI 结果仍需对照原图校对。</p><div id="ai-error" class="form-error" role="alert"></div><button class="button primary full" type="submit">${icon("file-music")}识别选段并导入</button></form>`;
    $("#modal-close").onclick = closeModal;
    function updateScope(options = selector?.getSelectionOptions()) {
      const info = $("#ocr-scope-summary");
      if (!options || !info) return;
      const submit = $("#ai-form button[type=submit]");
      if (submit)
        submit.disabled = state.busy || pageLoading || !options.canRequestOcr;
      info.textContent = `第 ${pageNumber(currentPage)} 页 · ${options.mode === "page" ? "当前整页" : options.mode === "manual" ? "手动选段" : `${options.selectedSystemIds.length} 行`} · ${options.canRequestOcr ? "钢琴谱结构已核验 · 导入后标注为片段" : "素材待核验"}`;
    }
    function mount(prepared) {
      selector?.destroy();
      selector = mountScoreImageSelector($("#score-image-host"), prepared, {
        onChange: updateScope,
      });
      updateScope();
    }
    mount(first);
    refreshIcons();
    $("#ocr-page")?.addEventListener("change", async (e) => {
      const index = Number(e.target.value);
      pageLoading = true;
      e.target.disabled = true;
      $("#ai-form button[type=submit]").disabled = true;
      $("#ai-error").textContent = "";
      try {
        const prepared = await preparePage(index);
        if (disposed) return;
        currentPage = index;
        mount(prepared);
        for (const [key, cached] of preparedPages)
          if (key !== index) {
            cached.destroy();
            preparedPages.delete(key);
          }
      } catch (error) {
        if (!disposed) {
          $("#ai-error").textContent = error.message;
          e.target.value = currentPage;
        }
      } finally {
        pageLoading = false;
        if (!disposed) {
          e.target.disabled = false;
          updateScope();
        }
      }
    });
    $("#ai-form").onsubmit = async (e) => {
      e.preventDefault();
      if (state.busy || pageLoading) return;
      const fd = new FormData(e.target),
        button = $("#ai-form button[type=submit]");
      $("#ai-error").textContent = "";
      try {
        const chunks = selector.getSelection();
        if (!chunks.length)
          throw new Error("请至少选择一个完整谱行或手动框选小节。");
        if (chunks.length > 4)
          throw new Error("一次最多选择 4 个谱行，建议从一行开始识别。");
        const indices = chunks
          .flatMap((c) => c.region.systemIndices)
          .sort((a, b) => a - b);
        if (indices.some((n, i) => i > 0 && n !== indices[i - 1] + 1))
          throw new Error("请选择连续的谱行，避免把跳过的小节拼成连续乐谱。");
        const selection = selector.getSelectionOptions();
        const scopeLabel = `第 ${pageNumber(currentPage)} 页 · ${selection.mode === "page" ? "当前整页" : selection.mode === "manual" ? "手动选段" : `第 ${indices.map((i) => i + 1).join("、")} 行`}`;
        state.busy = true;
        state.abort = new AbortController();
        button.innerHTML = icon("loader-circle", "spin") + "正在识别选定范围…";
        button.disabled = true;
        $("#ocr-page")?.setAttribute("disabled", "");
        $("#score-image-host").inert = true;
        refreshIcons();
        const result = await api(
          "/api/generate",
          {
            provider: fd.get("provider"),
            mode: "ocr",
            scope: "selection",
            scopeLabel,
            title: `${String(fd.get("title")).trim()} · ${scopeLabel}`,
            prompt: String(
              fd.get("prompt") ||
                "忠实识别选定范围中的完整小节，保留两只手和原谱节奏，不补写其他页面。",
            ),
            images: chunks.map(({ data, mimeType }) => ({ data, mimeType })),
          },
          state.abort.signal,
        );
        if (disposed) return;
        const score = validateScore(result.score);
        // The excerpt scope is visible even if a model returns only the song title.
        score.title = `${String(fd.get("title")).trim()} · ${scopeLabel}`;
        if (attachment.source)
          score.source = {
            ...attachment.source,
            kind: "image-ai",
            label: `${attachment.source.label} · ${scopeLabel} · AI 识谱，需校对`,
          };
        await remember(score);
        state.busy = false;
        closeModal();
        setScore(score, [
          ...chunks.flatMap((c) => c.warnings),
          ...(result.warnings || []),
        ]);
        toast("选段已导入练习室，请对照原图试听校对。");
      } catch (error) {
        state.busy = false;
        if (disposed || error.name === "AbortError") return;
        $("#ai-error").textContent = error.message;
        button.innerHTML = icon("file-music") + "重新识别选段";
        updateScope();
        $("#ocr-page")?.removeAttribute("disabled");
        $("#score-image-host").inert = false;
        refreshIcons();
      }
    };
  } catch (error) {
    if (disposed) return;
    closeModal();
    toast(error.message || "无法读取谱面图片", true);
  }
}

async function openSettings() {
  await refreshStatus();
  const pi = state.status?.pi,
    ds = state.status?.deepseek;
  modal(
    "AI 与设置",
    `<div class="provider-card"><div class="provider-heading"><span class="provider-logo">π</span><div><h3>Pi Agent / ChatGPT</h3><p>${pi?.available ? "已发现本机登录 · 可发起请求验证" : "尚未发现可用本机登录"}</p></div><span class="connection-dot ${pi?.available ? "connected" : ""}"></span></div><p class="form-note">复用本机 Pi / Codex 的登录。登录凭据仅在本机服务端使用，实际可用额度由账户决定。</p></div><form id="settings-form"><label class="field">谱面识别模型<input name="piModel" value="gpt-6.1-sol" readonly aria-label="固定识谱模型"></label><p class="form-note">GPT-6.1 Sol · high。识别与独立核对均使用此模型，通过 Pi Agent 使用你的 ChatGPT 订阅额度。</p><div class="provider-card"><div class="provider-heading"><span class="provider-logo deepseek">D</span><div><h3>DeepSeek</h3><p>${ds?.configured ? "已配置 API Key" : "等待配置 API Key"}</p></div></div><label class="field">API Key<input type="password" name="deepseekApiKey" placeholder="${ds?.configured ? "留空保留已保存的密钥" : "输入你的 DeepSeek API Key"}" autocomplete="off"></label><label class="field">模型<input name="deepseekModel" value="${esc(ds?.model || "deepseek-flash")}" maxlength="120"></label><p class="form-note">密钥保存在本机私有配置中，不写入浏览器存储。DeepSeek Flash high 与 Pi 共用识谱、独立核对与人工校对流程；DeepSeek 使用 API 余额。</p>${ds?.configured ? '<button id="clear-key" class="text-button danger" type="button">移除已保存的 Key</button>' : ""}</div><div id="settings-error" class="form-error"></div><button class="button primary full" type="submit">${icon("check")}保存设置</button></form><div class="piano-credit"><strong>乐器音源</strong><p>钢琴：Salamander Grand Piano · Alexander Holm · CC BY 3.0。醇厚预设参考 Steinway 听感，以温暖共鸣和圆润触键调音。<a href="${assetURL("/audio/piano/ATTRIBUTION.txt")}" target="_blank" rel="noopener">钢琴音源说明</a></p><p>小提琴与弦乐合奏：VSCO 2 Community Edition · Sam Gossner / Simon Dalzell · CC0。<a href="${assetURL("/audio/violin/ATTRIBUTION.txt")}" target="_blank" rel="noopener">小提琴说明</a> · <a href="${assetURL("/audio/strings/ATTRIBUTION.txt")}" target="_blank" rel="noopener">弦乐说明</a></p></div>`,
  );
  $("#settings-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const body = {
        piModel: fd.get("piModel"),
        deepseekModel: fd.get("deepseekModel"),
      };
      if (String(fd.get("deepseekApiKey")).trim())
        body.deepseekApiKey = String(fd.get("deepseekApiKey")).trim();
      await api("/api/settings", body);
      await refreshStatus();
      closeModal();
      toast("AI 设置已保存");
    } catch (err) {
      $("#settings-error").textContent = err.message;
    }
  };
  $("#clear-key")?.addEventListener("click", async () => {
    try {
      await api("/api/settings", { clearDeepseekApiKey: true });
      await refreshStatus();
      openSettings();
      toast("已移除 DeepSeek Key");
    } catch (e) {
      toast(e.message, true);
    }
  });
}
function openImportChooser() {
  modal(
    "导入乐谱",
    '<div class="import-choices"><button class="import-choice" data-import-local><strong>上传本地乐谱</strong><span>PDF、乐谱图片、MusicXML 或 MIDI</span></button><button class="import-choice" data-import-netease><strong>粘贴网易云分享链接</strong><span>查看谱页与总页数，核验后进入整谱识别</span></button></div>',
    "选择乐谱来源",
  );
  $("[data-import-local]").onclick = () => {
    closeModal();
    $("#file-input").click();
  };
  $("[data-import-netease]").onclick = () => openNeteaseImport();
}
function openNeteaseImport() {
  if (!capabilities.netease) {
    toast(STATIC_NOTICE, true);
    return;
  }
  modal(
    "网易云乐谱导入",
    '<div id="netease-import-host"></div>',
    "粘贴分享链接 → 获取全部谱页 → 整谱识别、校对与练习",
  );
  $(".modal").classList.add("netease-modal");
  async function request(path, body, options = {}) {
    if (!options.binary) return api(path, body, options.signal);
    const response = await apiClient.response(path, {
      body,
      signal: options.signal,
    });
    return {
      blob: await response.blob(),
      filename: decodeURIComponent(
        response.headers.get("x-score-filename") || "netease-score.pdf",
      ),
      source: JSON.parse(
        decodeURIComponent(response.headers.get("x-score-source") || "%7B%7D"),
      ),
    };
  }
  const view = mountNeteaseImport($("#netease-import-host"), {
    request,
    onImport: (file, source) => openFullPdf(file, source),
    onLocalFile: () => {
      closeModal();
      $("#file-input").click();
    },
  });
  modalCleanup = () => view.destroy();
}
async function receiveFile(file, source = null) {
  if (isAudioFile(file)) return receiveAudio(file);
  const maxMb = /\.pdf$/i.test(file.name) ? 50 : 20;
  if (file.size > maxMb * 1024 * 1024)
    return toast(`文件超过 ${maxMb} MB，请压缩或拆分后导入。`, true);
  player.pause();
  try {
    const ext = file.name.split(".").pop().toLowerCase();
    if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      const data = await fileDataURL(file);
      openAI({
        name: file.name,
        source,
        images: [
          { data: data.split(",")[1], mimeType: file.type || "image/png" },
        ],
      });
      return;
    }
    if (ext === "pdf") {
      toast("正在读取 PDF 乐谱…");
      openFullPdf(file, source);
      return;
    }
    toast("正在读取乐谱…");
    const { score, warnings } = await importScore(
      await file.arrayBuffer(),
      file.name,
    );
    await remember(score, undefined, await preserveOriginalFile(file));
    setScore(score, warnings);
    toast("乐谱已导入，点击播放即可练习。");
  } catch (e) {
    toast(e.message || "无法读取乐谱", true);
  }
}
const fullScoreApi = () => recognitionClient;
async function openFullScoreTasks() {
  if (!capabilities.recognition) {
    toast(STATIC_NOTICE, true);
    return;
  }
  await taskVault.initialize();
  modal(
    "整谱识别任务",
    '<div id="full-score-tasks"><p>正在读取本机保存的任务…</p></div>',
    "已完成的谱行会保留；关闭或重启后可继续校对。",
  );
  const host = $("#full-score-tasks"),
    epoch = modalEpoch,
    service = fullScoreApi(),
    ids = taskVault.ids().slice(-30).reverse();
  await refreshStatus();
  if (epoch !== modalEpoch) return;
  const reports = await Promise.allSettled(ids.map((id) => service.getJob(id)));
  if (epoch !== modalEpoch) return;
  const jobs = reports
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  const failures = reports.filter((r) => r.status === "rejected");
  host.innerHTML =
    (jobs.length
      ? jobs
          .map(
            (job, index) =>
              `<article class="task-list-row"><div><strong>${esc(job.title)}</strong><p>${job.totalPages}页 · ${job.progress.confirmed}/${job.progress.total}行已确认 · ${job.status === "running" ? "识别中" : job.status === "complete" ? "已校对完成" : job.status === "failed" ? "需要重试" : "待继续"}</p></div><button class="button secondary" data-resume-fullscore="${index}">继续查看与校对</button></article>`,
          )
          .join("")
      : !ids.length
        ? '<p class="form-note">还没有整谱识别任务。上传一份多页钢琴谱PDF即可开始。</p>'
        : "") +
    (failures.length
      ? `<p class="form-note">${failures.length}个任务未能读取：${esc(failures[0].reason?.message || "请检查本机服务并重试")}</p>`
      : "") +
    '<details><summary>用恢复码打开本机任务</summary><p class="form-note">用于恢复已保存在这台电脑上的原谱和校对结果。恢复码含任务访问凭据，请仅在本机使用。</p><label class="form-label">任务恢复码<input class="form-input" type="password" autocomplete="off" aria-label="任务恢复码" data-fullscore-recovery></label><button class="button secondary" data-restore-fullscore>恢复识谱任务</button><p class="form-note" role="status" data-recovery-status></p></details>';
  $("[data-restore-fullscore]").onclick = async () => {
    const button = $("[data-restore-fullscore]"),
      input = $("[data-fullscore-recovery]"),
      message = $("[data-recovery-status]"),
      code = input.value;
    button.disabled = true;
    input.value = "";
    message.textContent = "正在读取本机保存的任务…";
    try {
      const job = await service.restoreJob(code);
      const blob = await service.readDocument(job.id);
      if (epoch !== modalEpoch) return;
      openFullPdf(
        new File([blob], job.originalPdf?.name || job.title + ".pdf", {
          type: "application/pdf",
        }),
        job.metadata.source,
        job,
      );
    } catch (error) {
      if (epoch === modalEpoch) {
        message.textContent = error.message;
        button.disabled = false;
      }
    }
  };
  for (const button of host.querySelectorAll("[data-resume-fullscore]"))
    button.onclick = async () => {
      const job = jobs[Number(button.dataset.resumeFullscore)];
      button.disabled = true;
      button.textContent = "正在读取原谱…";
      try {
        const blob = await service.readDocument(job.id);
        if (epoch !== modalEpoch) return;
        openFullPdf(
          new File([blob], job.originalPdf?.name || job.title + ".pdf", {
            type: "application/pdf",
          }),
          job.metadata.source,
          job,
        );
      } catch (error) {
        toast(error.message, true);
        button.disabled = false;
        button.textContent = "重试打开";
      }
    };
}
function openFullPdf(file, source, resumeJob = null) {
  if (!capabilities.recognition) {
    toast(STATIC_NOTICE, true);
    return;
  }
  modal(
    "完整钢琴谱导入",
    '<div id="full-score-host"></div>',
    "检查全部页面 → 自动识谱 → 对照校对 → 导入练习",
  );
  $(".modal").classList.add("full-score-modal");
  const controller = mountFullScoreImport($("#full-score-host"), {
    file,
    source: source || {},
    resumeJob,
    api: fullScoreApi(),
    onClose: closeModal,
    onImport: async (result) => {
      const score = validateScore({
        ...result.score,
        source: {
          ...result.score.source,
          kind:
            result.reviewStatus?.method === "ai-unreviewed"
              ? "full-score-ai-draft"
              : result.reviewStatus?.complete === false
                ? "pdf-excerpt-reviewed"
                : "full-pdf-reviewed",
        },
      });
      await syncLocalLibrary();
      const sourceRecord = {
        reference: {
          id: score.id,
          durationBeats: score.durationBeats,
          keySignature: score.keySignature,
          timeSignature: score.timeSignature,
          notes: score.notes
            .map((n) => [n.id, n.beat, n.duration, n.midi, n.hand])
            .sort((a, b) => a[0].localeCompare(b[0])),
        },
        notation: result.sourceNotation,
        warnings: result.warnings,
        reviewStatus: result.reviewStatus,
      };
      const links = new Map(
        result.assets.map((a) => [a.id, URL.createObjectURL(a.blob)]),
      );
      try {
        sourceRecord.notation = {
          ...sourceRecord.notation,
          systems: sourceRecord.notation.systems.map((system) => ({
            ...system,
            imageUrl: links.get(system.assetId || system.id),
          })),
        };
        await remember(score, sourceRecord);
      } finally {
        for (const url of links.values()) URL.revokeObjectURL(url);
      }
      setScore(score, result.warnings || []);
      toast(
        `${result.reviewStatus?.method === "ai-unreviewed" ? "AI草稿已导入（待校对）" : "完整谱已导入"}：${score.notes.length}个音符，已重排为可编辑数字谱。`,
      );
    },
  });
  modalCleanup = () => controller.destroy();
}
function fileDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if ($(".modal")) e.stopImmediatePropagation();
    closeModal();
    return;
  }
  if (
    e.code === "Space" &&
    !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
      document.activeElement.tagName,
    ) &&
    !$(".modal")
  ) {
    e.preventDefault();
    if (state.view === "practice") togglePlay();
  }
});
const startupActiveId = read("qinban-active-score", null);
const restoredScore = availableScores().find(
  (score) => score.id === startupActiveId,
);
setScore(restoredScore || state.score);
void Promise.all([syncLocalLibrary(), taskVault.initialize()])
  .then(() => {
    const restored = state.shared.find((score) => score.id === startupActiveId);
    if (restored && state.score.id === (restoredScore || starterScore).id)
      setScore(restored);
  })
  .catch((error) => toast(error.message, true));
window.addEventListener("focus", () => void syncLocalLibrary().catch(() => {}));
if (STATIC_SITE) toast(STATIC_NOTICE);
