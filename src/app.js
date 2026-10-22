import {createAccountClient,createHostedLibrary} from "./accounts/client.js";
import { createAudioWorkspace } from "./audio-workspace.js";
import { createSearchWorkspace } from "./search-workspace.js";
import { createScoreOutput } from "./score-output.js";
import { readScoreDocument, toPracticeScore } from "../lib/score-document.ts";
import { createLibraryPanel } from "./library-panel.js";
import { $, $$, esc, icon, refreshIcons, read } from "./ui.js";
import { capabilities, STATIC_NOTICE } from "./capabilities.js";
import { createApiClient } from "./api-client.js";
import { createLibraryClient } from "./library.js";
import { createTaskVault } from "./task-vault.js";
import { createFullScoreClient } from "./full-score-client.js";
import { starterScore } from "../lib/starter-score.mjs";
import { STATIC_SITE } from "../lib/asset-url.mjs";
import { transposeScore } from "../lib/score.mjs";
import { parseTempoInput } from "../lib/tempo.mjs";
import { renderNotation } from "./notation.js";
import { tonalityLabel } from "../lib/score-arrangement.mjs";
import { renderSourceNotation } from "./source-notation.js";
import { createModal } from "./modal.js";
import { createImportFlows } from "./import-flows.js";
import { sourceMatchesScore, releasePracticeSource } from "./source-library.js";
import { PianoPlayer } from "./audio.js";
import {
  PIANO_INSTRUMENTS,
  DEFAULT_PIANO_INSTRUMENT,
} from "../lib/piano-voices.mjs";
import { mountPracticeLayout, practiceKeyboard } from "./practice-layout.js";
import { scoreSection, sectionInstruments, defaultInstrument, sectionKey } from '../lib/instrument-sections.mjs';
import { guitarStarterScore } from '../lib/guitar.mjs';
import { renderGuitarTab, guitarFretboard } from './guitar-notation.js';
import "./style.css";
import "./practice-layout.css";
import "./guitar.css";

const startupSection = read('qinban-section', 'piano') === 'guitar' ? 'guitar' : 'piano';
const savedInstrument = read("qinban-instrument", DEFAULT_PIANO_INSTRUMENT);
const state = {
  section: startupSection,
  instrument: PIANO_INSTRUMENTS.some((preset) => preset.id === savedInstrument)
    ? savedInstrument
    : DEFAULT_PIANO_INSTRUMENT,
  instrumentInfo: { status: "idle", progress: 0 },
  view: "practice",
  mode: "staff",
  score: startupSection === "guitar" ? guitarStarterScore : starterScore,
  shared: [],
  cloudScores: [],
  cloudLoaded: false,
  cloudError: "",
  cloudBusy: false,
  libraryTab: read(sectionKey("qinban-library-tab", startupSection), "local"),
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
if (state.section === 'guitar') state.instrument = defaultInstrument('guitar');
const lastSectionScores = new Map();
const sectionLabel = () => state.section === 'guitar' ? '吉他' : '钢琴';
function applySection(section) {
  const changed = state.section !== section;
  state.section = section;
  const selected = read(sectionKey('qinban-instrument', section), defaultInstrument(section));
  state.instrument = sectionInstruments(section).some(p => p.id === selected) ? selected : defaultInstrument(section);
  if (changed) {
    state.rightEnabled = true; state.leftEnabled = true;
    state.libraryTab = read(sectionKey('qinban-library-tab', section), 'local');
    state.cloudLibraryDraft = ''; state.cloudLibraryQuery = '';
  }
  try { localStorage.setItem('qinban-section', JSON.stringify(section)); } catch {}
  if (player.instrument !== state.instrument) {
    state.instrumentInfo = { status: 'idle', progress: 0 };
    void player.setInstrument(state.instrument).catch(error => toast(error.message, true));
  }
}
function switchSection(section) {
  if (section === state.section) return;
  const view = state.view === 'library' ? 'library' : 'practice';
  lastSectionScores.set(state.section, state.score);
  const id = capabilities.mode === 'hosted' ? null : read(sectionKey('qinban-active-score', section), null);
  const score = lastSectionScores.get(section) || scoreLibrary.scores.find(s => s.id === id && scoreSection(s) === section)
    || (section === 'guitar' ? guitarStarterScore : starterScore);
  setScore(score);
  state.view = view;
  render();
}
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
  lastSectionScores.set(state.section, state.score);
  applySection(scoreSection(score));
  state.document = readScoreDocument(score);
  state.score = toPracticeScore(state.document);
  try {
    if (capabilities.mode !== "hosted") localStorage.setItem(sectionKey("qinban-active-score", state.section), JSON.stringify(state.score.id));
  } catch {}
  state.sourceRecord = sourceRecord;
  state.notationScore = null;
  const preferred = read(sectionKey("qinban-mode", state.section), state.section === 'guitar' ? 'tab' : 'staff');
  const modes = state.section === 'guitar' ? ['tab', 'roll'] : ['staff', 'numbered', 'roll'];
  state.mode = modes.includes(preferred) ? preferred : modes[0];
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
  document.title = `琴伴 · ${sectionLabel()}练习室`;
  disposePracticeLayout?.();
  if (state.mode === "source" && !originalNotation()) state.mode = "staff";
  $("#source-audio")?.pause();
  state.renderer?.destroy();
  state.audio.previewRenderer?.destroy();
  $("#app").innerHTML =
    `<div data-section="${state.section}" class="app-shell ${state.view === "practice" ? "has-practice" : ""}">
<header id="app-header" class="app-header"><a class="brand" href="${capabilities.mode === "hosted" ? "/" : "#"}" aria-label="琴伴首页"><span class="brand-symbol">${icon("piano")}</span><span>琴伴<small>${capabilities.mode === "hosted" ? "商业版练习室" : capabilities.mode === "local" ? "开发者模式" : "公开练习版"}</small></span></a>
<div class="instrument-sections" role="group" aria-label="乐器分区"><button data-section="piano" aria-pressed="${state.section === 'piano'}" class="${state.section === 'piano' ? 'selected' : ''}">${icon('piano')}钢琴</button><button data-section="guitar" aria-pressed="${state.section === 'guitar'}" class="${state.section === 'guitar' ? 'selected' : ''}">${icon('guitar')}吉他</button></div>
<nav class="main-nav" aria-label="主导航"><button data-nav="practice" class="nav-tab ${state.view === "practice" ? "active" : ""}">${icon("music-2")}<span>练习室</span></button><button data-nav="library" class="nav-tab ${state.view === "library" ? "active" : ""}">${icon("book-open")}<span>我的曲库</span><small>${availableScores().length}</small></button>${!capabilities.coreOnly && state.section === "piano" ? `<button data-nav="search" class="nav-tab ${state.view === "search" ? "active" : ""}">${icon("search")}<span>AI 找谱</span><small class="online-badge">联网</small></button><button data-nav="audio" class="nav-tab ${state.view === "audio" ? "active" : ""}">${icon("audio-lines")}<span>音频转谱</span></button>` : ""}</nav>
<div class="header-actions">${capabilities.mode === "hosted" ? '<a class="button quiet" href="/">我的曲库</a><a class="button quiet" href="/recognition.html">上传识谱</a><a class="button quiet" href="/account.html">账号</a>' : ""}${capabilities.recognition && state.section === "piano" ? '<button class="button quiet" data-fullscore-jobs>识谱任务</button>' : ""}<button class="button quiet" data-upload aria-label="导入乐谱">${icon("upload")}<span>${capabilities.mode === "hosted" ? "导入数字谱" : "导入乐谱"}</span></button>${capabilities.recognition ? `<button class="icon-button" data-settings aria-label="AI 与设置" title="AI 与设置">${icon("sliders-horizontal")}</button>` : ""}</div></header>
<main class="view-${state.view}">${state.view === "library" ? libraryView() : state.view === "search" ? searchView() : state.view === "audio" ? audioView() : practiceView()}</main>
<nav class="mobile-nav" aria-label="移动端主导航">${[
      ["practice", "music-2", "练习室"],
      ["library", "book-open", "曲库"],
      ["search", "search", "找谱"],
      ["audio", "audio-lines", "转谱"],
    ]
      .filter(([view]) => !capabilities.coreOnly && state.section === "piano" || ["practice", "library"].includes(view))
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
<button data-layout="keyboard" aria-controls="practice-keyboard" aria-label="显示或收起${state.section === "guitar" ? "指板" : "键盘"}" title="显示或收起键盘">${icon(state.section === "guitar" ? "guitar" : "piano")}<span>${state.section === "guitar" ? "指板" : "键盘"}</span></button>
<button data-layout="focus" aria-label="进入专注模式" title="只显示乐谱和播放">${icon("maximize-2")}<span>专注</span></button></div></div>
<button class="sidebar-scrim" data-layout-close aria-label="关闭练习设置"></button>
<aside id="practice-sidebar" class="practice-sidebar" aria-label="练习设置"><div class="sidebar-heading"><h2>练习设置</h2><button class="icon-button" data-layout-close aria-label="收起练习设置">${icon("panel-left-close")}</button></div>
<button class="sidebar-piece" data-nav="library">${icon("file-music")}<span><strong>${esc(s.title)}</strong><small>${esc(s.composer || sectionLabel() + "练习曲")}</small></span>${icon("chevron-down")}</button>
<div class="sidebar-section"><h3>演奏速度</h3><div class="tempo-control"><label class="tempo-value"><input id="tempo-number" aria-label="输入练习速度 BPM" type="number" inputmode="numeric" min="20" max="300" step="1" value="${state.tempo}"><small>BPM</small></label><button class="original-speed" data-speed="1" title="恢复原速">原速</button></div><input id="tempo" aria-label="练习速度" type="range" min="20" max="300" step="1" value="${state.tempo}"></div>
<div class="sidebar-section"><h3>${state.section === "guitar" ? "播放设置" : "分手练习"}</h3><div class="hand-buttons" ${state.section === "guitar" ? "hidden" : ""}><button id="right-hand" aria-pressed="${state.rightEnabled}" class="hand-button right ${state.rightEnabled ? "enabled" : ""}">右手 ${icon("check")}</button><button id="left-hand" aria-pressed="${state.leftEnabled}" class="hand-button left ${state.leftEnabled ? "enabled" : ""}">左手 ${icon("check")}</button></div><label class="compact-toggle" for="metronome"><input id="metronome" type="checkbox" ${state.metronome ? "checked" : ""}>节拍器</label></div>
<div class="sidebar-section"><div class="sidebar-section-title"><h3>片段循环</h3><label class="compact-toggle" for="loop"><input id="loop" type="checkbox" ${state.loopEnabled ? "checked" : ""}>开启循环</label></div><div class="loop-controls"><input id="loop-start" aria-label="循环起始小节" type="number" min="1" max="${measureCount()}" value="${measureIndexAtBeat(state.loopStart) + 1}"><span>至</span><input id="loop-end" aria-label="循环结束小节" type="number" min="1" max="${measureCount()}" value="${measureIndexAtBeat(Math.max(0, state.loopEnd - 0.00001)) + 1}"><small>小节</small></div></div>
<div class="sidebar-section"><h3>乐谱显示</h3><div class="notation-switch">${originalNotation(s) ? `<button data-mode="source" class="${state.mode === "source" ? "selected" : ""}">原图参考</button>` : ""}${state.section === "guitar" ? `<button data-mode="tab" class="${state.mode === "tab" ? "selected" : ""}">六线谱</button>` : `<button data-mode="staff" class="${state.mode === "staff" ? "selected" : ""}">五线谱</button><button data-mode="numbered" class="${state.mode === "numbered" ? "selected" : ""}">简谱</button>`}<button data-mode="roll" class="${state.mode === "roll" ? "selected" : ""}">${state.section === "guitar" ? "音高卷帘" : "钢琴卷帘"}</button></div><label class="compact-toggle" for="follow"><input id="follow" type="checkbox" ${state.follow ? "checked" : ""}>播放时自动跟随</label><div class="transpose-control"><span>移调</span><button id="transpose-down" aria-label="降低半音">−</button><span>${esc(s.mode ? tonalityLabel(s) : keyName(s.keySignature) + " 调")}</span><button id="transpose-up" aria-label="升高半音">＋</button></div></div>
<div class="sidebar-section sidebar-instrument"><h3>${sectionLabel()}音色</h3>${instrumentControls()}<div class="volume-control">${icon("volume-2")}<input id="volume" aria-label="音量" type="range" min="0" max="1" step="0.01" value="${state.volume}"></div></div>
<div class="sidebar-footer"><button class="button secondary" data-edit-notes>编辑与改编</button><button class="icon-button" data-export aria-label="导出乐谱" title="导出乐谱">${icon("download")}</button></div></aside>
<section class="score-stage" aria-label="乐谱练习区域"><div class="score-document-heading"><div><h1>${esc(s.title)}</h1><p>${esc(s.composer || sectionLabel() + "谱")}<span>♩ = <b id="paper-tempo">${state.tempo}</b></span><span>${s.timeSignature.join("/")} 拍</span><span>${s.mode ? esc(tonalityLabel(s)) : keyName(s.keySignature) + " 调号"}</span></p></div><div class="score-provenance"><button class="button secondary" data-print-score>${icon("printer")}打印乐谱</button><span class="arrangement-tag">${capabilities.mode === "hosted" && scoreLibrary.records.some(r => r.id === s.id) ? "私有曲谱 · 请核对原谱" : s.source?.kind === "full-score-agent-approved" ? "已审核 · AI逐谱校对" : s.source?.kind === "full-score-model-reviewed" ? "AI全谱校对版 · 待人工确认" : s.source?.reviewRequired || s.source?.kind === "full-score-ai-draft" ? "数字谱 · 待校对" : s.source?.kind === "full-pdf-reviewed" ? "完整PDF · 已复核" : s.source?.kind === "pdf-transcription-checked" ? "7页全谱 · 已核对" : s.source?.kind === "audio-transcription" ? "音频转写 · 待校对" : s.source?.kind === "image-ai" ? "AI 识谱 · 待校对" : s.source?.kind === "public-domain-arrangement" ? "简易练习编配" : sectionLabel() + "乐谱"}</span><div class="source-line"><span>${esc(sourceLabel(s))}</span>${safeLink(s.source?.url, "来源")}${state.warnings.length ? `<button id="show-warnings">${state.warnings.length} 条提示</button>` : ""}</div></div></div><div id="notation" class="notation-area" aria-label="可点击定位的${sectionLabel()}乐谱"></div><div class="score-status"><span>${icon("music-2")} ${measureCount()} 小节 · 点击音符定位</span><span>${state.section === "guitar" ? "标准调弦 · 自动建议指法" : "左右手同步播放"} · ${capabilities.mode === "hosted" ? (scoreLibrary.records.some(r => r.id === s.id) ? "乐谱保存到账号" : "公开示例") : "乐谱本地保存"}</span></div></section>
<section class="playback-dock" aria-label="播放控制"><div class="transport-group"><button id="restart" class="icon-button" aria-label="回到开头" title="回到开头">${icon("rotate-ccw")}</button><button id="prev-measure" class="icon-button" aria-label="上一小节" title="上一小节">${icon("skip-back")}</button><button id="play" class="play-button" aria-label="播放">${icon("play")}</button><div class="playback-status"><strong id="playback-label">准备练习</strong><span id="transport-position">第 1 / ${measureCount()} 小节</span></div></div><div class="progress-row"><span id="elapsed">0:00</span><input id="seek" type="range" aria-label="播放进度" min="0" max="${s.durationBeats}" step="0.01" value="${state.beat}"><span id="total-time">${durationText(s.durationBeats)}</span></div><div class="dock-tempo"><button class="icon-button" data-tempo-step="-4" aria-label="减慢速度">−</button><span><b data-tempo-display>${state.tempo}</b> BPM</span><button class="icon-button" data-tempo-step="4" aria-label="加快速度">＋</button></div><div class="dock-shortcuts"><button ${state.section === "guitar" ? "hidden" : ""} data-quick-hand="right" aria-pressed="${state.rightEnabled}">右手</button><button ${state.section === "guitar" ? "hidden" : ""} data-quick-hand="left" aria-pressed="${state.leftEnabled}">左手</button><button data-quick-loop aria-pressed="${state.loopEnabled}">${icon("repeat-2")}循环</button><button data-layout="sidebar" aria-controls="practice-sidebar" aria-label="打开练习设置">${icon("sliders-horizontal")}设置</button></div></section>
${state.section === "guitar" ? guitarFretboard() : practiceKeyboard()}<button class="layout-restore icon-button" data-layout="focus" aria-label="退出专注模式" title="退出专注模式">${icon("minimize-2")}</button>`;
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
  $$("button[data-section]").forEach(button => button.onclick = () => switchSection(button.dataset.section));
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
    if (capabilities.mode === "hosted") return;
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
      if (isAudioFile(f) && state.section === "piano") receiveAudio(f);
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
    return info.engine === "pluck" ? "本机吉他合成已就绪" : info.engine === "synth" ? "轻量合成" : "采样已就绪";
  return state.instrument === "synth" ? "轻量合成" : "首次播放时准备";
}
function instrumentControls() {
  return `<div class="instrument-control"><label for="piano-instrument">音色</label><select id="piano-instrument" aria-label="乐器音色" aria-describedby="instrument-description">${sectionInstruments(state.section).map((preset) => `<option value="${preset.id}" ${state.instrument === preset.id ? "selected" : ""}>${esc(preset.label)}</option>`).join("")}</select><button id="instrument-preview" class="instrument-preview" aria-label="试听当前音色的旋律" title="试听一小段旋律">${icon("volume-2")}<span>试听</span></button><span id="instrument-status" class="instrument-status" role="status" aria-live="polite">${instrumentStatusText()}</span></div><p id="instrument-description" class="instrument-description">${instrumentDescription()}</p>`;
}
function instrumentDescription() {
  const preset = sectionInstruments(state.section).find(item => item.id === state.instrument);
  return `${esc(preset?.description || "")}${preset?.referenceURL ? ` <a href="${esc(preset.referenceURL)}" target="_blank" rel="noopener">参考视频</a>` : ""}`;
}
function refreshInstrumentUI() {
  const select = $("#piano-instrument"),
    status = $("#instrument-status"),
    preview = $("#instrument-preview");
  if (!select) return;
  select.value = state.instrument;
  const description = $("#instrument-description");
  if (description) description.innerHTML = instrumentDescription();
  select.title =
    sectionInstruments(state.section).find((preset) => preset.id === state.instrument)
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
        localStorage.setItem(sectionKey("qinban-instrument", state.section), JSON.stringify(id));
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
          localStorage.setItem(sectionKey("qinban-mode", state.section), JSON.stringify(state.mode));
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
      state.mode === "source" ? renderSourceNotation : state.mode === "tab" ? renderGuitarTab : renderNotation;
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
async function openNoteEditor() {
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
  const epoch = modalEpoch();
  const { mountNoteEditor } = await import("./note-editor.js");
  if (epoch !== modalEpoch()) return;
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
  setModalCleanup(() => {
    disposeEditor();
    player.stopPreview();
  });
}
const { modal, closeModal, requestCloseModal, modalEpoch, setModalCleanup } =
  createModal({ state, player });
const apiClient = createApiClient({
  capabilities,
  onStatus: (value) => {
    state.status = value;
  },
});
const api = (path, body, signal) => apiClient.json(path, body, signal);
const accountClient = capabilities.mode === "hosted" ? createAccountClient({onIdentityChange: () => {
  if (typeof scoreLibrary === "undefined") return;
  player.stop(); closeModal(); scoreLibrary.reset(); lastSectionScores.clear(); state.shared = []; state.sourceRecord = null; state.notationScore = null; sourceLoadEpoch++; setScore(state.section === "guitar" ? guitarStarterScore : starterScore); lastSectionScores.clear();
}}) : null;
const scoreLibrary = createLibraryClient({ capabilities, api: apiClient, ...(accountClient ? {hosted:createHostedLibrary(accountClient)} : {}) });
const taskVault = createTaskVault({ metadata: scoreLibrary.metadata, ...(capabilities.mode === "hosted" ? {storage:null} : {}) });
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
    openAI: (...args) => importFlows.openAI(...args),
    openFullPdf: (...args) => importFlows.openFullPdf(...args),
    modal,
    closeModal,
    setModalCleanup,
    setScore,
    remember,
    fileDataURL: (file) => importFlows.fileDataURL(file),
    safeLink,
    receiveFile: (...args) => importFlows.receiveFile(...args),
  });
const importFlows = createImportFlows({
  state,
  capabilities,
  player,
  api,
  apiClient,
  modal,
  closeModal,
  requestCloseModal,
  modalEpoch,
  setModalCleanup,
  toast,
  remember,
  setScore,
  refreshStatus,
  syncLocalLibrary,
  taskVault,
  recognitionClient,
  isAudioFile,
  receiveAudio,
  openSearch,
  safeLink,
});
const {
  openSettings,
  openImportChooser,
  receiveFile,
  openFullScoreTasks,
} = importFlows;
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
    if (!$(".modal")) return;
    e.stopImmediatePropagation();
    requestCloseModal();
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
const startupActiveId = capabilities.mode === "hosted" ? null : read(sectionKey("qinban-active-score", startupSection), null);
const restoredScore = availableScores().find(
  (score) => score.id === startupActiveId,
);
setScore(restoredScore || state.score);
void Promise.all([syncLocalLibrary(), taskVault.initialize()])
  .then(() => {
    const entryId = capabilities.mode === "hosted" ? new URL(location.href).searchParams.get("entry") : null;
    const chosen = entryId && scoreLibrary.records.find(r => r.entryId === entryId);
    const restored = state.shared.find((score) => score.id === (chosen?.id || startupActiveId));
    if (restored && state.section === startupSection && state.score.id === (restoredScore || (startupSection === "guitar" ? guitarStarterScore : starterScore)).id)
      setScore(restored);
  })
  .catch((error) => toast(error.message, true));
window.addEventListener("focus", () => void syncLocalLibrary().catch(() => {}));
if (STATIC_SITE) toast(STATIC_NOTICE);
if (accountClient) window.addEventListener("focus", () => void accountClient.initialize().catch(() => {}));
if (accountClient) {
  window.addEventListener("pagehide", () => accountClient.clearLocal());
  window.addEventListener("pageshow", event => { if (event.persisted) void accountClient.initialize().then(syncLocalLibrary).catch(() => {}); });
}
