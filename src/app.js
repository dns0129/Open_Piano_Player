import { hantingNotation, hantingNotationMatched } from '../lib/scores/hanting.mjs';
import {findReviewedPdf} from '../lib/reviewed-pdf-reuse.mjs';
import {
  createIcons,
  Music2,
  BookOpen,
  SlidersHorizontal,
  Upload,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  Volume2,
  ChevronDown,
  ArrowUpRight,
  Plus,
  X,
  Check,
  Search,
  Download,
  Repeat2,
  LoaderCircle,
  Headphones,
  Piano,
  ArrowLeft,
  ExternalLink,
  Trash2,
  FileMusic,
  CheckCircle2,
  CircleHelp,
  PanelLeftClose,
  AudioLines,
  FileAudio,
} from "lucide";
import { library } from "../lib/catalog.mjs";
import { STATIC_SITE } from "../lib/asset-url.mjs";
// 网页版没有本机服务：/api 请求统一返回说明，沿用各功能原有的错误提示。
const STATIC_NOTICE = "网页版只提供曲库练习、本地 MusicXML/MIDI/JSON 导入和音频转谱；联网找谱、图片/PDF识谱和网易云导入需要在本机运行琴伴。";
if (STATIC_SITE) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => String(typeof input === "string" ? input : input?.url || "").startsWith("/api/")
    ? Promise.resolve(new Response(JSON.stringify({ error: STATIC_NOTICE, code: "STATIC_SITE" }), { status: 503, headers: { "Content-Type": "application/json" } }))
    : nativeFetch(input, init);
}
import { validateScore, transposeScore } from "../lib/score.mjs";
import { importScore } from "../lib/importers.mjs";
import { exportMusicXML, exportMidi } from "../lib/exporters.mjs";
import { renderNotation } from "./notation.js";
import { mountNoteEditor } from "./note-editor.js";
import { renderSourceNotation } from "./source-notation.js";
import { mountFullScoreImport } from "./full-score-import.js";
import { decodeFullScoreRecovery } from "../lib/full-score-recovery.mjs";
import { mountSourceBrowser } from "./source-browser.js";
import { mountNeteaseImport } from "./netease-import.js";
import { savePracticeSource, loadPracticeSource, deletePracticeSource, sourceMatchesScore, releasePracticeSource } from "./source-library.js";
import { bumblebeeYeungNotation, sourceNotationMatched } from "../lib/scores/bumblebee-yeung-notation.mjs";
import { PianoPlayer } from "./audio.js";
import {
  PIANO_INSTRUMENTS,
  DEFAULT_PIANO_INSTRUMENT,
} from "../lib/piano-voices.mjs";
import "./style.css";

const icons = {
  Music2,
  BookOpen,
  SlidersHorizontal,
  Upload,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  Volume2,
  ChevronDown,
  ArrowUpRight,
  Plus,
  X,
  Check,
  Search,
  Download,
  Repeat2,
  LoaderCircle,
  Headphones,
  Piano,
  ArrowLeft,
  ExternalLink,
  Trash2,
  FileMusic,
  CheckCircle2,
  CircleHelp,
  PanelLeftClose,
  AudioLines,
  FileAudio,
};
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name, cls = "") => `<i data-lucide="${name}" class="${cls}"></i>`;
const refreshIcons = () =>
  createIcons({ icons, attrs: { "stroke-width": 1.7 } });
const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
};
const savedInstrument = read("qinban-instrument", DEFAULT_PIANO_INSTRUMENT);
const state = {
  instrument: PIANO_INSTRUMENTS.some((preset) => preset.id === savedInstrument)
    ? savedInstrument
    : DEFAULT_PIANO_INSTRUMENT,
  instrumentInfo: { status: "idle", progress: 0 },
  view: "practice",
  mode: "source",
  score: library.find((score) => score.id === "bumblebee-yeung-complete") || library[0],
  saved: read("qinban-scores", []),
  shared: [],
  sharedJobs: new Map(),
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
state.saved = state.saved
  .map((s) => {
    try {
      return validateScore(s);
    } catch {
      return null;
    }
  })
  .filter(Boolean);
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
const measureCount = () => originalNotation()?.measureMap?.length || Math.ceil(state.score.durationBeats / beatPerMeasure());
const measureStart = index => originalNotation()?.measureMap?.[index]?.beat ?? index * beatPerMeasure();
const measureEnd = index => { const item=originalNotation()?.measureMap?.[index];return item?item.beat+item.duration:Math.min(state.score.durationBeats,(index+1)*beatPerMeasure()); };
function measureIndexAtBeat(beat) {
  const map=originalNotation()?.measureMap;
  if(!map?.length)return Math.min(measureCount()-1,Math.floor(beat/beatPerMeasure()));
  let low=0,high=map.length-1;
  while(low<=high){const middle=(low+high)>>1,item=map[middle];if(beat<item.beat)high=middle-1;else if(beat>=item.beat+item.duration)low=middle+1;else return middle;}
  return Math.max(0,Math.min(map.length-1,low));
}
const durationText = (beats, tempo = state.tempo) => {
  let seconds = Math.round((beats * 60) / tempo);
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
function saveLibrary() {
  try {
    localStorage.setItem("qinban-scores", JSON.stringify(state.saved));
    return true;
  } catch {
    toast("本机存储空间不足，请先导出乐谱。", true);
    return false;
  }
}
function remember(score) {
  const previous=state.saved;
  state.saved = state.saved.filter((s) => s.id !== score.id);
  state.saved.unshift(score);
  if(!saveLibrary()){
    state.saved=previous;
    throw new Error("本机曲库未能保存，请导出乐谱或释放浏览器存储后重试。");
  }
}
function availableScores() {
  const seen = new Set();
  return [...state.shared, ...state.saved, ...library].filter((score) => {
    if (seen.has(score.id)) return false;
    seen.add(score.id);
    return true;
  });
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
  if(state.notationScore===score)return state.currentNotation;
  const notation=sourceMatchesScore(score,state.sourceRecord)?state.sourceRecord.notation:hantingNotationMatched(score)?hantingNotation:sourceNotationMatched(score)?bumblebeeYeungNotation:sourceMatchesScore(score,state.sourceRecord)?state.sourceRecord.notation:null;
  if(score===state.score){state.notationScore=score;state.currentNotation=notation;}
  return notation;
}
let sourceLoadEpoch = 0;
function setScore(score, warnings = [], sourceRecord = null) {
  const epoch = ++sourceLoadEpoch;
  if($("#modal-root")?.childElementCount)closeModal();
  player.stop();
  if (state.score?.id !== score.id) releasePracticeSource(state.score.id);
  state.score = validateScore(score);
  try{localStorage.setItem("qinban-active-score",JSON.stringify(state.score.id));}catch{}
  state.sourceRecord = sourceRecord;
  state.notationScore = null;
  state.mode = originalNotation(state.score)
    ? "source"
    : read("qinban-mode", "staff") === "numbered" ? "numbered" : "staff";
  state.tempo = state.score.tempo;
  state.beat = 0;
  state.warnings = warnings;
  state.loopEnabled = false;
  state.loopStart = 0;
  state.loopEnd = measureEnd(Math.min(3,measureCount()-1));
  const initialLoopEnd=state.loopEnd;
  player.setScore(state.score);
  player.configure(configuration());
  state.view = "practice";
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (!originalNotation(state.score)) loadAvailablePracticeSource(state.score).then(record => {
    if (epoch !== sourceLoadEpoch || !record) return;
    state.sourceRecord = record;
    state.notationScore = null;
    state.mode = "source";
    if(!state.warnings.length&&Array.isArray(record.warnings))state.warnings=[...record.warnings];
    if(!state.loopEnabled&&state.loopStart===0&&state.loopEnd===initialLoopEnd){
      state.loopEnd=measureEnd(Math.min(3,measureCount()-1));
      player.configure(configuration());
    }
    render();
  }).catch(error => toast(error.message, true));
}

function render() {
  if (state.mode === "source" && !originalNotation()) state.mode = "staff";
  $("#source-audio")?.pause();
  state.renderer?.destroy();
  state.audio.previewRenderer?.destroy();
  $("#app").innerHTML = `<div class="app-shell">
<header class="app-header"><a class="brand" href="#" aria-label="琴伴首页"><span class="brand-symbol">${icon("piano")}</span><span>琴伴<small>QINBAN</small></span></a>
<nav class="main-nav" aria-label="主导航"><button data-nav="practice" class="nav-tab ${state.view === "practice" ? "active" : ""}">${icon("music-2")}<span>练习室</span></button><button data-nav="library" class="nav-tab ${state.view === "library" ? "active" : ""}">${icon("book-open")}<span>我的曲库</span><small>${availableScores().length}</small></button><button data-nav="search" class="nav-tab ${state.view === "search" ? "active" : ""}">${icon("search")}<span>AI 找谱</span><small class="online-badge">联网</small></button><button data-nav="audio" class="nav-tab ${state.view === "audio" ? "active" : ""}">${icon("audio-lines")}<span>音频转谱</span></button></nav>
<div class="header-actions"><button class="button quiet" data-fullscore-jobs>识谱任务</button><button class="button quiet" data-upload aria-label="导入乐谱">${icon("upload")}<span>导入乐谱</span></button><button class="icon-button" data-settings aria-label="AI 与设置" title="AI 与设置">${icon("sliders-horizontal")}</button></div></header>
<main class="view-${state.view}">${state.view === "library" ? libraryView() : state.view === "search" ? searchView() : state.view === "audio" ? audioView() : practiceView()}</main>
</div><div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div><input id="file-input" type="file" accept=".xml,.musicxml,.mxl,.mid,.midi,.json,.pdf,.png,.jpg,.jpeg,.webp" hidden><input id="audio-input" type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac,.webm" hidden>`;
  refreshIcons();
  bindCommon();
  if (state.view === "practice") {
    bindPractice();
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
  return `<section class="practice-console" aria-label="练习设置与播放状态">
<div class="console-row"><div class="transport-group"><button id="restart" class="icon-button" aria-label="回到开头" title="回到开头">${icon("rotate-ccw")}</button><button id="play" class="play-button" aria-label="播放">${icon("play")}</button><button id="prev-measure" class="icon-button" aria-label="上一小节" title="上一小节">${icon("skip-back")}</button><div class="playback-status"><strong id="playback-label">准备练习</strong><span id="transport-position">第 1 / ${measureCount()} 小节</span></div></div>
<div class="control-divider"></div><div class="tempo-control"><span class="control-caption">速度</span><input id="tempo" aria-label="练习速度" type="range" min="20" max="240" step="1" value="${state.tempo}"><span class="tempo-value"><b id="tempo-number">${state.tempo}</b><small>BPM</small></span><button class="original-speed" data-speed="1" title="恢复原速">原速</button></div>
<div class="hand-buttons"><button id="right-hand" aria-pressed="${state.rightEnabled}" class="hand-button right ${state.rightEnabled ? "enabled" : ""}">右手 ${icon("check")}</button><button id="left-hand" aria-pressed="${state.leftEnabled}" class="hand-button left ${state.leftEnabled ? "enabled" : ""}">左手 ${icon("check")}</button></div>
<label class="compact-toggle" for="metronome"><input id="metronome" type="checkbox" ${state.metronome ? "checked" : ""}>节拍器</label>
<div class="loop-controls"><label class="compact-toggle" for="loop"><input id="loop" type="checkbox" ${state.loopEnabled ? "checked" : ""}>${icon("repeat-2")}循环</label><input id="loop-start" aria-label="循环起始小节" type="number" min="1" max="${measureCount()}" value="${measureIndexAtBeat(state.loopStart) + 1}"><span>—</span><input id="loop-end" aria-label="循环结束小节" type="number" min="1" max="${measureCount()}" value="${measureIndexAtBeat(Math.max(0,state.loopEnd-0.00001)) + 1}"><small>小节</small></div>
<div class="console-spacer"></div><div class="volume-control">${icon("volume-2")}<input id="volume" aria-label="音量" type="range" min="0" max="1" step="0.01" value="${state.volume}"></div></div>
<div class="console-bottom">${instrumentControls()}<div class="progress-row"><span id="elapsed">0:00</span><input id="seek" type="range" aria-label="播放进度" min="0" max="${s.durationBeats}" step="0.01" value="${state.beat}"><span id="total-time">${durationText(s.durationBeats)}</span></div><span class="space-hint">空格 播放 / 暂停</span><div class="score-view-tools"><div class="notation-switch">${originalNotation(s) ? `<button data-mode="source" class="${state.mode === "source" ? "selected" : ""}">原谱</button>` : ""}<button data-mode="staff" class="${state.mode === "staff" ? "selected" : ""}">五线谱</button><button data-mode="numbered" class="${state.mode === "numbered" ? "selected" : ""}">简谱</button></div><label class="compact-toggle" for="follow"><input id="follow" type="checkbox" ${state.follow ? "checked" : ""}>跟随</label><div class="transpose-control"><button id="transpose-down" aria-label="降低半音">−</button><span>移调</span><button id="transpose-up" aria-label="升高半音">＋</button></div><button class="button secondary" data-edit-notes>修改音符</button><button class="icon-button" data-export aria-label="导出乐谱" title="导出乐谱">${icon("download")}</button></div></div>
</section><section class="score-stage" aria-label="乐谱练习区域"><div class="score-document-heading"><div><h1>${esc(s.title)}</h1><p>${esc(s.composer || "钢琴谱")}<span>♩ = <b id="paper-tempo">${state.tempo}</b></span><span>${s.timeSignature.join("/")} 拍</span><span>${keyName(s.keySignature)} 调号</span></p></div><div class="score-provenance"><span class="arrangement-tag">${hantingNotationMatched(s) ? "6页完整钢琴谱" : s.source?.kind === "full-score-ai-draft" ? "AI全谱 · 待校对" : s.source?.kind === "full-pdf-reviewed" ? "完整PDF · 已复核" : s.source?.kind === "pdf-transcription-checked" ? "7页全谱 · 已核对" : s.source?.kind === "audio-transcription" ? "音频转写 · 待校对" : s.source?.kind === "image-ai" ? "AI 识谱 · 待校对" : s.source?.kind === "public-domain-arrangement" ? "简易练习编配" : "钢琴乐谱"}</span><div class="source-line"><span>${esc(sourceLabel(s))}</span>${safeLink(s.source?.url, "来源")}${state.warnings.length ? `<button id="show-warnings">${state.warnings.length} 条提示</button>` : ""}</div></div></div><div id="notation" class="notation-area" aria-label="可点击定位的连续钢琴乐谱"></div><div class="score-status"><span>${icon("music-2")} ${measureCount()} 小节 · 点击音符定位</span><span>左右手同步播放 · 乐谱本地保存</span></div></section>`;
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
function libraryView() {
  return `<section class="content-page"><div class="page-heading"><div><span class="eyebrow">YOUR MUSIC LIBRARY</span><h1>我的曲库</h1><p>收藏的曲谱，都在这里。选择一首，开始练习。</p></div><button class="button primary" data-ai>${icon("search")}按歌名找谱</button></div><div class="library-filter search-input">${icon("search")}<input id="library-query" aria-label="搜索我的曲库" placeholder="搜索已保存的歌名、作曲家…"><span>${availableScores().length} 份乐谱</span></div><div class="library-grid" id="library-grid">${scoreCards(availableScores())}</div></section>`;
}
function scoreCards(scores) {
  return scores
    .map(
      (s, i) =>
        `<article class="score-card" data-card="${esc(s.id)}"><div class="card-art tone-${i % 4}"><span class="card-note">${["𝄞", "♫", "♩", "♬"][i % 4]}</span><span class="card-type">${hantingNotationMatched(s) ? "6页完整钢琴谱" : s.source?.kind === "full-score-ai-draft" ? "AI全谱 · 待校对" : s.source?.kind === "full-pdf-reviewed" ? "完整PDF钢琴谱" : s.source?.kind === "pdf-transcription-checked" ? "7页完整钢琴谱" : library.some((x) => x.id === s.id) ? "精选练习曲" : "我的乐谱"}</span><button data-open="${esc(s.id)}" class="card-play" aria-label="打开 ${esc(s.title)}">${icon("play")}</button></div><div class="card-info"><h3>${esc(s.title)}</h3><p>${esc(s.composer || "钢琴练习曲")}</p><div class="card-details"><span>${keyName(s.keySignature)} 调 · ${s.timeSignature.join("/")}</span><span>${s.tempo} BPM</span></div></div>${!state.sharedJobs.has(s.id) && !library.some((x) => x.id === s.id) ? `<button class="delete-score" data-delete="${esc(s.id)}" aria-label="删除 ${esc(s.title)}">${icon("trash-2")}</button>` : ""}</article>`,
    )
    .join("");
}
function bindCommon() {
  $("[data-fullscore-jobs]")?.addEventListener("click",openFullScoreTasks);
  $$("[data-nav]").forEach(
    (b) =>
      (b.onclick = () => {
        player.pause();
        state.view = b.dataset.nav;
        render();
        if(state.view === "library")void syncLocalLibrary();
      }),
  );
  $$("[data-upload]").forEach(
    (b) => (b.onclick = openImportChooser),
  );
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
  return `<div class="instrument-control"><label for="piano-instrument">音色</label><select id="piano-instrument" aria-label="钢琴音色">${PIANO_INSTRUMENTS.map((preset) => `<option value="${preset.id}" ${state.instrument === preset.id ? "selected" : ""}>${esc(preset.label)}</option>`).join("")}</select><button id="instrument-preview" class="instrument-preview" aria-label="试听钢琴音色" title="试听中央 C">${icon("volume-2")}</button><span id="instrument-status" class="instrument-status" role="status" aria-live="polite">${instrumentStatusText()}</span></div>`;
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
    player.pause();
    try {
      await player.notePreview(60, 0.75);
    } catch (error) {
      toast(error.message || "音色试听失败，请重试。", true);
    }
  };
  $$("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        state.mode = b.dataset.mode;
        localStorage.setItem("qinban-mode", JSON.stringify(state.mode));
        render();
      }),
  );
  $("#play").onclick = togglePlay;
  $("#restart").onclick = () => {
    player.stop();
    updateFrame(0, []);
    $("#notation").scrollTo({ top: 0, behavior: "instant" });
  };
  $("#prev-measure").onclick = () => {
    const index=measureIndexAtBeat(state.beat),atStart=Math.abs(state.beat-measureStart(index))<0.0001;
    player.seek(measureStart(Math.max(0,index-(atStart?1:0))));
  };
  $("#seek").oninput = (e) => player.seek(+e.target.value);
  $("#volume").oninput = (e) => {
    state.volume = +e.target.value;
    player.configure(configuration());
  };
  $("#tempo").oninput = (e) => setTempo(+e.target.value);
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
    };
  $("#metronome").onchange = (e) => {
    state.metronome = e.target.checked;
    player.configure(configuration());
  };
  $("#loop").onchange = (e) => {
    state.loopEnabled = e.target.checked;
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
  state.tempo = Math.max(20, Math.min(240, tempo));
  player.configure(configuration());
  for (const sel of ["#tempo-number", "#paper-tempo"])
    if ($(sel)) $(sel).textContent = state.tempo;
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
    loading ? "正在准备钢琴音色" : active ? "暂停" : "播放",
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
  $("#elapsed").textContent = durationText(beat);
  if (player.state !== "playing" && state.instrumentInfo.status !== "loading")
    $("#playback-label").textContent = beat >= state.score.durationBeats - 0.00001
      ? "播放完成" : player.state === "paused" ? "已暂停" : "准备练习";
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
    const renderScore = state.mode === "source" ? renderSourceNotation : renderNotation;
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
  modal("修改音符", '<div id="note-editor-host"></div>', "识别完成后，也能随时回来修改。");
  $(".modal").classList.add("note-editor-modal");
  modalCleanup = mountNoteEditor($("#note-editor-host"), state.score, {
    initialBeat: state.beat,
    onPreview: midi => player.notePreview(midi, 0.7),
    onSave: score => {
      remember(score);
      setScore(score);
      toast("修改已保存到曲库，五线谱、简谱与播放已更新。");
    },
  });
}
function openSearch(query = "") {
  player.pause();
  state.view = "search";
  if (query) state.searchQuery = query;
  render();
  $("#song-query")?.focus();
  if (query) searchOnline();
}
function searchView() {
  return `<section class="content-page search-page"><div class="page-heading"><div><span class="eyebrow">FIND THE ORIGINAL SCORE</span><h1>输入歌名，找到它的乐谱。</h1><p>联网查找原曲五线谱、简谱和钢琴谱，选择版本后导入练习室。</p></div><span class="search-live-tag"><span class="status-dot"></span>实时互联网检索</span></div><form id="song-search-form" class="song-search-form"><div class="song-search-box">${icon("search")}<input id="song-query" aria-label="歌曲名称" placeholder="输入任意歌名，可加歌手，例如：晴天 周杰伦" maxlength="100" value="${esc(state.searchQuery)}" required><button class="button primary" type="submit" ${state.searching ? "disabled" : ""}>${icon(state.searching ? "loader-circle" : "search", state.searching ? "spin" : "")}${state.searching ? "正在搜索" : "搜索乐谱"}</button></div><div class="search-examples"><span>试试</span>${["野蜂飞舞", "青花瓷", "晴天 周杰伦", "致爱丽丝", "卡农"].map((q) => `<button type="button" data-example="${q}">${q}</button>`).join("")}<span class="search-scope">搜索真实谱源 · 保留原始来源</span></div></form><div id="online-results">${onlineResultsMarkup()}</div></section>`;
}
function formatLabel(format) {
  return (
    {
      musicxml: "MusicXML",
      mxl: "MusicXML",
      midi: "MIDI",
      pdf: "PDF 谱面",
      image: "图片 · 待核验",
      web: "谱源网页",
    }[format] || "谱源网页"
  );
}
function resultMarkup(r, i, nested = false) {
  const file = r.importable && r.format !== "web";
  const ready = ["midi", "mxl", "musicxml"].includes(r.format);
  const providerNames = [
    ...new Set((r.providers || []).map((p) => p.name || p.id)),
  ].filter((name) => name !== r.source);
  return `<article class="online-result ${nested ? "nested" : ""}"><div class="result-type ${ready ? "direct" : ""}">${icon(ready ? "file-music" : "external-link")}<small>${formatLabel(r.format)}</small></div><div class="result-copy"><h3><button class="result-title-button" data-online-browse="${i}">${esc(r.title || state.searchQuery)}</button></h3><p><span>${esc(r.source || "互联网谱源")}</span>${providerNames.length ? `<span class="result-provider">${providerNames.map(esc).join(" · ")}</span>` : ""}${r.composer ? ` · ${esc(r.composer)}` : ""}</p>${ready ? `<div class="score-route-badge">${icon("check-circle-2")}${r.verified ? "已下载解析验证" : "结构化谱文件"} · 无需 AI 识图${r.noteCount ? ` · ${r.noteCount} 个音符` : ""}${r.instrumentation === "piano" ? " · 钢琴 MIDI" : r.instrumentation === "ensemble" ? " · 合奏 MIDI，转钢琴需校对" : ""}</div>` : ""}${!ready && r.pianoSourceVerified ? `<div class="score-route-badge">${icon("piano")}钢琴独奏版本 · 原站乐器标注 · 图像待核验</div>` : ""}${r.description || r.snippet ? `<p class="result-snippet">${esc(r.description || r.snippet)}</p>` : ""}</div><div class="result-actions">${file ? `<button class="button ${ready ? "primary" : "secondary"}" data-online-import="${i}">${icon(ready ? "play" : "file-music")}${ready ? "直接导入练习" : "预览并核验钢琴谱"}</button>` : `<button class="button secondary" data-online-resolve="${i}">${icon("file-music")}打开并筛选谱面</button>`}${file ? `<button class="button quiet" data-online-browse="${i}">打开并筛选</button>` : ""}${safeLink(r.sourceUrl || r.url, "查看原站")}</div><div class="resolved-files" id="resolved-${i}"></div></article>`;
}
function onlineResultsMarkup() {
  if (state.searching)
    return `<div class="search-loading">${icon("loader-circle", "spin")}<strong>正在网上查找「${esc(state.searchQuery)}」的曲谱</strong><p>正在查找可直接导入的 MIDI / MusicXML，同时汇总图片与网页谱源…</p></div>`;
  if (!state.searchNetwork && !state.searchError)
    return `<div class="search-intro"><div>${icon("search")}<h3>搜索歌名</h3><p>支持中文、英文曲名<br>加上歌手可减少重名结果</p></div><span>→</span><div>${icon("file-music")}<h3>选择谱源</h3><p>打开来源并筛选版本<br>预览可公开下载的谱面</p></div><span>→</span><div>${icon("play")}<h3>导入练习</h3><p>MIDI / MusicXML 无需识图<br>PDF 全页识别，校对后跟谱</p></div></div>`;
  const n = state.searchNetwork,
    rows = state.searchResults;
  const indexed = rows.map((r,i)=>({r,i})).filter(({r})=>
    (state.searchFilter === "all" || state.searchFilter === "structured" && ["midi","mxl","musicxml"].includes(r.format) || r.format === state.searchFilter)
    && (!state.searchOnlyPiano || r.pianoSourceVerified || r.instrumentation === "piano")
    && (!state.searchProvider || state.searchProvider === "all" || r.source === state.searchProvider));
  const structured = indexed.filter(({r})=>["midi","mxl","musicxml"].includes(r.format));
  const visual = indexed.filter(({r})=>!["midi","mxl","musicxml"].includes(r.format)).sort((a,b)=>Number(Boolean(b.r.pianoSourceVerified))-Number(Boolean(a.r.pianoSourceVerified)));
  const filters = `<div class="search-result-filters"><label>文件类型 <select id="search-format-filter" aria-label="筛选搜索文件类型">${[["all","全部类型"],["pdf","PDF"],["image","图片谱面"],["structured","MIDI / MusicXML"],["web","谱源网页"]].map(([value,label])=>`<option value="${value}" ${state.searchFilter===value?"selected":""}>${label}</option>`).join("")}</select></label><label>来源 <select id="search-provider-filter" aria-label="筛选搜索来源"><option value="all">全部来源</option>${[...new Set(rows.map(r=>r.source).filter(Boolean))].map(value=>`<option value="${esc(value)}" ${state.searchProvider===value?"selected":""}>${esc(value)}</option>`).join("")}</select></label><label><input id="search-piano-filter" type="checkbox" ${state.searchOnlyPiano?"checked":""}> 仅钢琴来源明确</label><span>${indexed.length} / ${rows.length} 条结果</span></div>`;
  const grouped = indexed.length ? `${structured.length ? `<section class="score-result-section"><div class="score-result-section-title"><h3>可直接导入的乐谱 <span>${structured.length}</span></h3><p>读取文件中的音高与节奏，优先使用此类结果。</p></div>${structured.map(({r,i})=>resultMarkup(r,i)).join("")}</section>` : ""}${visual.length ? `<section class="score-result-section"><div class="score-result-section-title"><h3>谱面网页与图片 <span>${visual.length}</span></h3><p>先核验钢琴谱图片，再选择清晰谱行识别。照片、封面及其他乐器分谱不进入钢琴识谱。</p></div>${visual.map(({r,i})=>resultMarkup(r,i)).join("")}</section>` : ""}` : '<div class="empty-state">暂未找到匹配的公开谱源。试试加入歌手名或更换中英文曲名。</div>';
  const providers = state.searchProviders,
    success = providers.filter((p) => p.status === "ok").length;
  const providerMarkup = providers.length
    ? `<div class="search-channel-status" aria-label="搜索渠道状态">${providers.map((p) => `<span class="channel-chip ${p.status}" title="${esc(p.message || "")}"><span class="status-dot"></span>${esc(p.name)}<small>${p.status === "ok" ? p.count + " 条" + (p.cached ? " · 缓存" : "") : p.status === "blocked" ? "暂受限" : p.status === "empty" ? "无匹配" : "暂不可用"}</small></span>`).join("")}</div>`
    : "";
  const queryPlan=state.searchQueryPlan;
  const translationMarkup=queryPlan?.matchedWork ? `<div class="search-query-plan"><span>外文曲名</span><strong>${esc(queryPlan.matchedWork.title)}</strong><small>${esc(queryPlan.matchedWork.creator)} · 联合检索原曲名与外文曲名</small></div>` : "";
  return `${translationMarkup}<div class="results-heading"><h2>找到的谱源 <span>${rows.length}</span></h2><span>${n?.ok ? (providers.length ? `${success} / ${providers.length} 个渠道返回结果` : "已实时联网检索") : n?.attempted ? "在线渠道暂不可用" : "曲谱目录"}</span></div>${providerMarkup}${filters}${state.searchError || (!n?.ok && n?.message) ? `<div class="search-notice">${esc(state.searchError || n.message)}</div>` : ""}<div class="online-result-list">${grouped}</div><div class="search-footer"><p>网页结果可能需要在原站登录或购买。找到可公开获取的谱面后，才能导入练习。</p>${externalSearchMarkup()}</div>`;
}
function externalSearchMarkup() {
  const links = state.searchLinks.length
    ? [...state.searchLinks]
    : [
        {
          name: "必应",
          url:
            "https://www.bing.com/search?q=" +
            encodeURIComponent(state.searchQuery + " 钢琴谱"),
        },
        {
          name: "百度",
          url:
            "https://www.baidu.com/s?wd=" +
            encodeURIComponent(state.searchQuery + " 钢琴谱"),
        },
        {
          name: "搜狗",
          url:
            "https://www.sogou.com/web?query=" +
            encodeURIComponent(state.searchQuery + " 钢琴谱"),
        },
      ];
  if (state.searchQueryPlan?.matchedWork) links.push({name:"英文找谱",url:"https://www.bing.com/search?q="+encodeURIComponent(state.searchQueryPlan.queries[0])},{name:"IMSLP",url:"https://imslp.org/index.php?search="+encodeURIComponent(state.searchQueryPlan.matchedWork.title)});
  return `<div class="external-search-links"><span>也可在原站搜索</span>${links.map((l) => safeLink(l.url, l.name || l.label || "打开搜索")).join("")}</div>`;
}
function bindSearch() {
  $("#song-search-form").onsubmit = (e) => {
    e.preventDefault();
    state.searchQuery = $("#song-query").value.trim();
    searchOnline();
  };
  $$("[data-example]").forEach(
    (b) =>
      (b.onclick = () => {
        state.searchQuery = b.dataset.example;
        $("#song-query").value = state.searchQuery;
        searchOnline();
      }),
  );
  bindOnlineResults();
}
function bindOnlineResults() {
  const updateFilters=()=>{ $("#online-results").innerHTML=onlineResultsMarkup();bindOnlineResults();refreshIcons(); };
  $("#search-format-filter")?.addEventListener("change",event=>{state.searchFilter=event.target.value;updateFilters();});
  $("#search-provider-filter")?.addEventListener("change",event=>{state.searchProvider=event.target.value;updateFilters();});
  $("#search-piano-filter")?.addEventListener("change",event=>{state.searchOnlyPiano=event.target.checked;updateFilters();});
  $$("[data-online-browse]").forEach(button => button.onclick=()=>openSourceBrowser(state.searchResults[+button.dataset.onlineBrowse]));
  $$("[data-online-import]").forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        b.innerHTML = icon("loader-circle", "spin") + "导入中";
        refreshIcons();
        try {
          await loadOnlineEntry(state.searchResults[+b.dataset.onlineImport]);
        } catch (e) {
          toast(e.message, true);
          b.disabled = false;
          b.innerHTML = "重试导入";
        }
      }),
  );
  $$("[data-online-resolve]").forEach(
    (b) => (b.onclick = () => openSourceBrowser(state.searchResults[+b.dataset.onlineResolve])),
  );
}
function openSourceBrowser(entry) {
  modal("筛选谱源与版本",'<div id="source-browser-host"></div>',entry.title||state.searchQuery);
  $(".modal").classList.add("source-browser-modal");
  const browser=mountSourceBrowser($("#source-browser-host"),{
    entry,
    resolve: value=>api(value.resolveUrl||"/api/resolve-score?id="+encodeURIComponent(value.id)),
    onSelect: async value=>{
      try{await loadOnlineEntry(value);}catch(error){toast(error.message,true);throw error;}
    },
    onClose:closeModal,
  });
  modalCleanup=()=>browser.destroy();
}
async function searchOnline() {
  const query = state.searchQuery.trim();
  if (!query) return;
  state.searchAbort?.abort();
  const abort = new AbortController();
  state.searchAbort = abort;
  state.searching = true;
  state.searchFilter = "all";state.searchProvider = "all";state.searchOnlyPiano = false;
  state.searchError = "";
  state.searchResults = [];
  state.searchQueryPlan = null;
  state.searchNetwork = null;
  state.searchProviders = [];
  state.searchSourcesCount = 0;
  state.searchLinks = [];
  if (state.view === "search") render();
  try {
    const data = await api(
      "/api/search?q=" + encodeURIComponent(query),
      null,
      abort.signal,
    );
    if (abort.signal.aborted) return;
    state.searchResults = data.results || [];
    state.searchQueryPlan = data.queryPlan || null;
    state.searchNetwork = data.network || {
      attempted: false,
      ok: false,
      message: data.warning || "",
    };
    state.externalSearchUrl = data.externalSearchUrl || "";
    state.searchProviders =
      data.providerStatuses || data.network?.providerStatuses || [];
    state.searchSourcesCount =
      data.sourcesCount ||
      state.searchProviders.filter((p) => p.status === "ok").length;
    state.searchLinks = data.searchLinks || data.externalSearchLinks || [];
  } catch (e) {
    if (e.name === "AbortError") return;
    state.searchError = e.message;
    state.searchNetwork = { attempted: true, ok: false };
  } finally {
    if (state.searchAbort === abort) {
      state.searching = false;
      if (state.view === "search") render();
    }
  }
}
async function loadOnlineEntry(entry) {
  if (!state.status) await refreshStatus();
  const url =
    entry.downloadUrl ||
    (entry.id
      ? "/api/import-score?id=" + encodeURIComponent(entry.id)
      : "/api/public-score?path=" + encodeURIComponent(entry.path));
  const response = await fetch(url);
  if (!response.ok) {
    let message = "谱面下载失败，请稍后重试";
    try {
      message = (await response.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  const data = await response.arrayBuffer(),
    format =
      response.headers.get("x-score-format") ||
      entry.format ||
      (entry.path ? "mxl" : "");
  let filename = response.headers.get("x-score-filename");
  try {
    filename = filename ? decodeURIComponent(filename) : null;
  } catch {
    filename = null;
  }
  filename ||=
    entry.path ||
    (entry.title || state.searchQuery) +
      "." +
      ({
        musicxml: "musicxml",
        mxl: "mxl",
        midi: "mid",
        pdf: "pdf",
        image: "jpg",
      }[format] || "musicxml");
  const source = {
    kind: "web-score",
    songName: state.searchQuery,
    page: entry.page,
    preview: Boolean(entry.preview),
    pianoSourceVerified: entry.pianoSourceVerified === true,
    instrumentEvidence: entry.instrumentEvidence || "",
    label:
      (entry.title || state.searchQuery) + " · " + (entry.source || "网络乐谱"),
    url: entry.sourceUrl || entry.url,
    license: entry.license || "以原站和具体谱面标注为准",
  };
  if (["pdf", "image"].includes(format)) {
    const mime =
      format === "pdf"
        ? "application/pdf"
        : response.headers.get("content-type") || "image/jpeg";
    await receiveFile(new File([data], filename, { type: mime }), source);
    return;
  }
  const { score, warnings } = await importScore(data, filename);
  if (entry.pianoSourceVerified && entry.title && /^(?:control track|untitled|track\s*\d*|midi(?: file)?)$/i.test(score.title.trim())) score.title = entry.title;
  if (score.composer === "MIDI 导入" && entry.composer) score.composer = entry.composer;
  score.source = source;
  warnings.unshift(...(entry.warnings || []).filter(w => !warnings.includes(w)));
  if (entry.instrumentation === "ensemble") warnings.unshift("来源是合奏 MIDI，当前使用钢琴音色播放，各声部与左右手分配需要校对。");
  remember(score);
  closeModal();
  setScore(score, warnings);
  toast("原曲乐谱已导入练习室");
}
function bindLibrary() {
  $$("[data-open]").forEach(
    (b) =>
      (b.onclick = () => {
        const score = availableScores().find(
          (s) => s.id === b.dataset.open,
        );
        if (score) setScore(score);
      }),
  );
  $$("[data-delete]").forEach(
    (b) =>
      (b.onclick = () => {
        void deletePracticeSource(b.dataset.delete).catch(error=>toast(error.message,true));
        state.saved = state.saved.filter((s) => s.id !== b.dataset.delete);
        saveLibrary();
        render();
        toast("已从本机曲库移除");
      }),
  );
  $("#library-query").oninput = (e) => {
    const query = e.target.value.toLowerCase();
    $$("[data-card]").forEach(
      (card) => (card.hidden = !card.textContent.toLowerCase().includes(query)),
    );
  };
}
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
  return `<div class="audio-output-heading"><span>${icon("check-circle-2")}转写完成</span><div class="notation-switch"><button data-audio-mode="staff" class="${a.previewMode === "staff" ? "selected" : ""}">五线谱</button><button data-audio-mode="numbered" class="${a.previewMode === "numbered" ? "selected" : ""}">简谱</button></div></div><div class="audio-result-title"><h2>${esc(s.title)}</h2><p>${s.notes.length} 个音符<span>${s.tempo} BPM</span><span>${keyName(s.keySignature)} 调号</span></p></div><div id="audio-score-preview" class="audio-score-preview" aria-label="音频转写乐谱预览"></div><div class="transcription-warnings">${(r.warnings || []).map((w) => `<p>${esc(w)}</p>`).join("")}</div><div class="audio-result-actions"><button id="practice-transcription" class="button primary">${icon("play")}导入练习室</button><button id="download-transcription" class="button secondary">${icon("download")}导出 MIDI</button></div><p class="audio-result-note">这是一份音频转写草稿。请对照原音试听，校对速度、时值和音区。</p>`;
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
    $("#practice-transcription").onclick = () => {
      remember(a.result.score);
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
async function api(path, body, signal, recovered = false) {
  if (path !== "/api/status" && !state.status) await refreshStatus();
  const opts = { signal };
  if (body) {
    if (!state.status) await refreshStatus();
    opts.method = "POST";
    opts.headers = {
      "Content-Type": "application/json",
      "X-CSRF-Token": state.status?.csrfToken || "",
    };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const data = await res.json();
  if(res.status===403&&!recovered&&path!=="/api/status"&&["CSRF","SESSION_REQUIRED"].includes(data.code)){
    await refreshStatus();return api(path,body,signal,true);
  }
  if (!res.ok) throw Object.assign(new Error(data.error || data.message || "请求失败"),{code:data.code,status:res.status});
  return data;
}
async function loadAvailablePracticeSource(score) {
  const jobId=state.sharedJobs.get(score.id);
  if(!jobId)return loadPracticeSource(score);
  const result=await api(`/api/local-library/${jobId}`);
  const reference={id:result.score.id,durationBeats:result.score.durationBeats,keySignature:result.score.keySignature,
    timeSignature:[...result.score.timeSignature],notes:result.score.notes.map(n=>[n.id,n.beat,n.duration,n.midi,n.hand]).sort((a,b)=>a[0].localeCompare(b[0]))};
  return {id:score.id,reference,notation:result.notation,warnings:result.warnings};
}
let librarySync;
function syncLocalLibrary() {
  if(STATIC_SITE)return Promise.resolve();
  if(librarySync)return librarySync;
  librarySync=(async()=>{
    try {
      const data=await api('/api/local-library');
      state.shared=data.scores.map(entry=>validateScore(entry.score));
      state.sharedJobs=new Map(data.scores.map(entry=>[entry.score.id,entry.jobId]));
      if(state.view==='library') {
        const query=$('#library-query')?.value||'';
        render();
        if(query&&$('#library-query')) {$('#library-query').value=query;$('#library-query').dispatchEvent(new Event('input'));}
      }
      if(data.warnings?.length)toast(data.warnings[0],true);
    }catch(error){toast('本机曲库同步失败：'+error.message,true);}
    finally{librarySync=null;}
  })();
  return librarySync;
}
async function refreshStatus() {
  try {
    state.status = await api("/api/status");
  } catch {
    state.status = null;
  }
  return state.status;
}
function providerOptions() {
  return `<option value="pi">GPT-6.1 Sol high · ChatGPT 订阅</option><option value="deepseek">DeepSeek Flash high · API</option>`;
}
async function openAI(attachment = null) {
  if (!attachment) return openSearch();
  modal("选择识谱范围", '<p class="form-note">正在读取原图、检测双手谱行…</p>');
  const openingEpoch = modalEpoch;
  let selector = null, currentPage = 0, pageLoading = false, disposed = false;
  const preparedPages = new Map();
  const cleanup = () => {
    disposed = true;
    selector?.destroy();
    for (const prepared of preparedPages.values()) prepared.destroy();
    attachment.destroy?.();
  };
  modalCleanup = cleanup;
  try {
    const { prepareScoreImage, mountScoreImageSelector } = await import("./score-image.js");
    const totalPages = attachment.totalPages || attachment.images.length;
    const pageNumber = index => totalPages === 1 ? (attachment.source?.page || 1) : index + 1;
    const preparePage = async index => {
      if (preparedPages.has(index)) return preparedPages.get(index);
      const image = attachment.images[index] || await attachment.loadPage(index + 1);
      const prepared = await prepareScoreImage(`data:${image.mimeType};base64,${image.data}`, { page: pageNumber(index), pianoSourceVerified: attachment.source?.pianoSourceVerified === true, sourceLabel: attachment.source?.instrumentEvidence || attachment.source?.label || "" });
      if (disposed) { prepared.destroy(); return null; }
      preparedPages.set(index, prepared);
      return prepared;
    };
    const first = await preparePage(0);
    if (disposed || openingEpoch !== modalEpoch) return;
    // Replace only the loading body, retaining its cleanup ownership.
    const section = $(".modal");
    section.innerHTML = `<div class="modal-heading"><div><h2>选择识谱范围</h2><p>先识别清楚的小节，再导入练习。</p></div><button id="modal-close" class="icon-button" aria-label="关闭">${icon("x")}</button></div><form id="ai-form"><div class="ocr-file-heading"><strong>${esc(attachment.name)}</strong>${attachment.source ? safeLink(attachment.source.url, "原始来源") : ""}</div>${totalPages > 1 ? `<label class="field ocr-page-picker">谱面页<select id="ocr-page" aria-label="谱面页">${Array.from({length: totalPages}, (_,i) => `<option value="${i}">第 ${i + 1} 页 / 共 ${totalPages} 页</option>`).join("")}</select></label>` : ""}<div id="score-image-host"></div><p id="ocr-scope-summary" class="ocr-scope-summary" role="status"></p><label class="field">乐谱名称<input name="title" maxlength="150" value="${esc(attachment.source?.songName || attachment.name.replace(/\.[^.]+$/, ""))}" required></label><label class="field">识谱说明<textarea name="prompt" rows="2" maxlength="3000" placeholder="保留两只手和原谱节奏；后续谱行可补充调号、拍号、速度。"></textarea></label><label class="field">识谱服务<select name="provider">${providerOptions()}</select></label><p class="form-note">仅转写选定范围，不补写缺页。框选时请包含完整小节、两只手与谱号。AI 结果仍需对照原图校对。</p><div id="ai-error" class="form-error" role="alert"></div><button class="button primary full" type="submit">${icon("file-music")}识别选段并导入</button></form>`;
    $("#modal-close").onclick = closeModal;
    function updateScope(options = selector?.getSelectionOptions()) {
      const info = $("#ocr-scope-summary");
      if (!options || !info) return;
      const submit = $("#ai-form button[type=submit]");
      if (submit) submit.disabled = state.busy || pageLoading || !options.canRequestOcr;
      info.textContent = `第 ${pageNumber(currentPage)} 页 · ${options.mode === "page" ? "当前整页" : options.mode === "manual" ? "手动选段" : `${options.selectedSystemIds.length} 行`} · ${options.canRequestOcr ? "钢琴谱结构已核验 · 导入后标注为片段" : "素材待核验"}`;
    }
    function mount(prepared) {
      selector?.destroy();
      selector = mountScoreImageSelector($("#score-image-host"), prepared, { onChange: updateScope });
      updateScope();
    }
    mount(first);
    refreshIcons();
    $("#ocr-page")?.addEventListener("change", async e => {
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
        for (const [key, cached] of preparedPages) if (key !== index) { cached.destroy(); preparedPages.delete(key); }
      } catch (error) {
        if (!disposed) { $("#ai-error").textContent = error.message; e.target.value = currentPage; }
      } finally {
        pageLoading = false;
        if (!disposed) { e.target.disabled = false; updateScope(); }
      }
    });
    $("#ai-form").onsubmit = async e => {
      e.preventDefault();
      if (state.busy || pageLoading) return;
      const fd = new FormData(e.target), button = $("#ai-form button[type=submit]");
      $("#ai-error").textContent = "";
      try {
        const chunks = selector.getSelection();
        if (!chunks.length) throw new Error("请至少选择一个完整谱行或手动框选小节。");
        if (chunks.length > 4) throw new Error("一次最多选择 4 个谱行，建议从一行开始识别。");
        const indices = chunks.flatMap(c => c.region.systemIndices).sort((a,b) => a-b);
        if (indices.some((n,i) => i > 0 && n !== indices[i-1] + 1)) throw new Error("请选择连续的谱行，避免把跳过的小节拼成连续乐谱。");
        const selection = selector.getSelectionOptions();
        const scopeLabel = `第 ${pageNumber(currentPage)} 页 · ${selection.mode === "page" ? "当前整页" : selection.mode === "manual" ? "手动选段" : `第 ${indices.map(i => i+1).join("、")} 行`}`;
        state.busy = true;
        state.abort = new AbortController();
        button.innerHTML = icon("loader-circle", "spin") + "正在识别选定范围…";
        button.disabled = true;
        $("#ocr-page")?.setAttribute("disabled", "");
        $("#score-image-host").inert = true;
        refreshIcons();
        const result = await api("/api/generate", {
          provider: fd.get("provider"), mode: "ocr", scope: "selection", scopeLabel,
          title: `${String(fd.get("title")).trim()} · ${scopeLabel}`,
          prompt: String(fd.get("prompt") || "忠实识别选定范围中的完整小节，保留两只手和原谱节奏，不补写其他页面。"),
          images: chunks.map(({data,mimeType}) => ({data,mimeType})),
        }, state.abort.signal);
        if (disposed) return;
        const score = validateScore(result.score);
        // The excerpt scope is visible even if a model returns only the song title.
        score.title = `${String(fd.get("title")).trim()} · ${scopeLabel}`;
        if (attachment.source) score.source = { ...attachment.source, kind: "image-ai", label: `${attachment.source.label} · ${scopeLabel} · AI 识谱，需校对` };
        remember(score);
        state.busy = false;
        closeModal();
        setScore(score, [...chunks.flatMap(c => c.warnings), ...(result.warnings || [])]);
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
    `<div class="provider-card"><div class="provider-heading"><span class="provider-logo">π</span><div><h3>Pi Agent / ChatGPT</h3><p>${pi?.available ? "已发现本机登录 · 可发起请求验证" : "尚未发现可用本机登录"}</p></div><span class="connection-dot ${pi?.available ? "connected" : ""}"></span></div><p class="form-note">复用本机 Pi / Codex 的登录。登录凭据仅在本机服务端使用，实际可用额度由账户决定。</p></div><form id="settings-form"><label class="field">谱面识别模型<input name="piModel" value="gpt-6.1-sol" readonly aria-label="固定识谱模型"></label><p class="form-note">GPT-6.1 Sol · high。识别与独立核对均使用此模型，通过 Pi Agent 使用你的 ChatGPT 订阅额度。</p><div class="provider-card"><div class="provider-heading"><span class="provider-logo deepseek">D</span><div><h3>DeepSeek</h3><p>${ds?.configured ? "已配置 API Key" : "等待配置 API Key"}</p></div></div><label class="field">API Key<input type="password" name="deepseekApiKey" placeholder="${ds?.configured ? "留空保留已保存的密钥" : "输入你的 DeepSeek API Key"}" autocomplete="off"></label><label class="field">模型<input name="deepseekModel" value="${esc(ds?.model || "deepseek-flash")}" maxlength="120"></label><p class="form-note">密钥保存在本机私有配置中，不写入浏览器存储。DeepSeek Flash high 与 Pi 共用识谱、独立核对与人工校对流程；DeepSeek 使用 API 余额。</p>${ds?.configured ? '<button id="clear-key" class="text-button danger" type="button">移除已保存的 Key</button>' : ""}</div><div id="settings-error" class="form-error"></div><button class="button primary full" type="submit">${icon("check")}保存设置</button></form><div class="piano-credit"><strong>钢琴采样</strong><p>Salamander Grand Piano · Alexander Holm</p><p>标准、柔和、明亮共用同一录音采样，按听感调整。<a href="/audio/piano/ATTRIBUTION.txt" target="_blank" rel="noopener">音源说明</a> · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a></p></div>`,
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
  modal("导入乐谱",'<div class="import-choices"><button class="import-choice" data-import-local><strong>上传本地乐谱</strong><span>PDF、乐谱图片、MusicXML 或 MIDI</span></button><button class="import-choice" data-import-netease><strong>粘贴网易云分享链接</strong><span>查看谱页与总页数，核验后进入整谱识别</span></button></div>',"选择乐谱来源");
  $("[data-import-local]").onclick=()=>{closeModal();$("#file-input").click();};
  $("[data-import-netease]").onclick=()=>openNeteaseImport();
}
function openNeteaseImport() {
  modal("网易云乐谱导入",'<div id="netease-import-host"></div>',"粘贴分享链接 → 获取全部谱页 → 整谱识别、校对与练习");
  $(".modal").classList.add("netease-modal");
  async function request(path,body,options={}){
    if(!options.binary)return api(path,body,options.signal);
    if(!state.status)await refreshStatus();
    const response=await fetch(path,{method:'POST',signal:options.signal,headers:{'content-type':'application/json','x-csrf-token':state.status?.csrfToken||''},body:JSON.stringify(body)});
    if(!response.ok){const error=await response.json();throw Object.assign(new Error(error.error||'谱页导入失败'),{code:error.code});}
    return {blob:await response.blob(),filename:decodeURIComponent(response.headers.get('x-score-filename')||'netease-score.pdf'),source:JSON.parse(decodeURIComponent(response.headers.get('x-score-source')||'%7B%7D'))};
  }
  const view=mountNeteaseImport($("#netease-import-host"),{request,onImport:(file,source)=>openFullPdf(file,source),onLocalFile:()=>{closeModal();$("#file-input").click();}});
  modalCleanup=()=>view.destroy();
}
async function receiveFile(file, source = null) {
  if (isAudioFile(file)) return receiveAudio(file);
  const maxMb=/\.pdf$/i.test(file.name)?50:20;
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
        images: [{data: data.split(",")[1], mimeType: file.type || "image/png"}],
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
    remember(score);
    setScore(score, warnings);
    toast("乐谱已导入，点击播放即可练习。");
  } catch (e) {
    toast(e.message || "无法读取乐谱", true);
  }
}
function fullScoreApi() {
  const tokens=read("qinban-fullscore-jobs",{});
  const route=(id,action="",region="")=>`/api/full-score-jobs/${encodeURIComponent(id)}${action?"/"+action:""}${region?"/"+encodeURIComponent(region):""}`;
  async function request(path,body,id,requestOptions={},recovered=false){
    requestOptions.signal?.throwIfAborted();
    if(!state.status)await refreshStatus();
    const headers={};if(id&&tokens[id])headers["X-Fullscore-Token"]=tokens[id];
    const options={headers,signal:requestOptions.signal};
    if(body!==undefined){options.method="POST";headers["Content-Type"]="application/json";headers["X-CSRF-Token"]=state.status?.csrfToken||"";options.body=JSON.stringify(body);}
    const response=await fetch(path,options),data=await response.json();
    if(!response.ok){
      if(!recovered&&response.status===403&&["SESSION_REQUIRED","CSRF"].includes(data.code)){
        await refreshStatus();return request(path,body,id,requestOptions,true);
      }
      throw Object.assign(new Error(data.error||"整谱识别请求失败。"),{code:data.code});
    }
    return data;
  }
  return {
    findReviewedJob:(hash,engine='pi')=>findReviewedPdf(hash,Object.keys(tokens).slice(-30).reverse(),id=>request(route(id),undefined,id),engine),
    getCapabilities:async()=>{await refreshStatus();return state.status?.fullScore||{};},
    createJob:async(raw,options={})=>{const data=await request("/api/full-score-jobs",raw,undefined,options);tokens[data.id]=data.token;try{localStorage.setItem("qinban-fullscore-jobs",JSON.stringify(tokens));}catch{}return {...data.snapshot,id:data.id,token:data.token,snapshot:data.snapshot};},
    uploadRegion:(id,regionId,input,options={})=>request(route(id,"region",regionId),input,id,options),
    uploadDocument:(id,input,options={})=>request(route(id,"document"),input,id,options),
    startJob:(id,input={},options={})=>request(route(id,"start"),input,id,options),
    getJob:(id,options={})=>request(route(id),undefined,id,options),
    restoreJob:async code=>{
      const {id,token}=decodeFullScoreRecovery(code),previous=tokens[id];tokens[id]=token;
      try{const job=await request(route(id),undefined,id);try{localStorage.setItem("qinban-fullscore-jobs",JSON.stringify(tokens));}catch{}return job;}
      catch(error){if(previous)tokens[id]=previous;else delete tokens[id];throw error;}
    },
    readRegionImage:async(id,regionId)=>{
      const response=await fetch(route(id,"region",regionId),{headers:{"X-Fullscore-Token":tokens[id]||""}});
      if(!response.ok)throw new Error("原谱图片读取失败。");return response.blob();
    },
    readDocument:async id=>{
      if(!state.status)await refreshStatus();
      const response=await fetch(route(id,"document"),{headers:{"X-Fullscore-Token":tokens[id]||""}});
      if(!response.ok)throw new Error("原始PDF读取失败，请重新上传。");return response.blob();
    },
    retryRegion:(id,regionId,input={},options={})=>request(route(id,"retry",regionId),input,id,options),
    cancelJob:id=>request(route(id,"cancel"),{},id),
    confirmRegion:async(id,regionId,result)=>{const job=await request(route(id,"confirm-region",regionId),{result},id);if(job.status==="complete")await syncLocalLibrary();return job;},
    exportDraft:(id,input={})=>request(route(id,"draft"),input,id),
    confirmJob:async(id,input={})=>{const job=await request(route(id,"confirm"),input,id);if(job.status==="complete")await syncLocalLibrary();return job;},
  };
}
async function openFullScoreTasks() {
  modal("整谱识别任务",'<div id="full-score-tasks"><p>正在读取本机保存的任务…</p></div>',"已完成的谱行会保留；关闭或重启后可继续校对。");
  const host=$("#full-score-tasks"),epoch=modalEpoch,service=fullScoreApi(),ids=Object.keys(read("qinban-fullscore-jobs",{})).slice(-30).reverse();
  await refreshStatus();
  if(epoch!==modalEpoch)return;
  const reports=await Promise.allSettled(ids.map(id=>service.getJob(id)));
  if(epoch!==modalEpoch)return;
  const jobs=reports.filter(r=>r.status==="fulfilled").map(r=>r.value);
  const failures=reports.filter(r=>r.status==="rejected");
  host.innerHTML=(jobs.length?jobs.map((job,index)=>`<article class="task-list-row"><div><strong>${esc(job.title)}</strong><p>${job.totalPages}页 · ${job.progress.confirmed}/${job.progress.total}行已确认 · ${job.status==="running"?"识别中":job.status==="complete"?"已校对完成":job.status==="failed"?"需要重试":"待继续"}</p></div><button class="button secondary" data-resume-fullscore="${index}">继续查看与校对</button></article>`).join(""):!ids.length?'<p class="form-note">还没有整谱识别任务。上传一份多页钢琴谱PDF即可开始。</p>':'')+(failures.length?`<p class="form-note">${failures.length}个任务未能读取：${esc(failures[0].reason?.message||"请检查本机服务并重试")}</p>`:'')+'<details><summary>用恢复码打开本机任务</summary><p class="form-note">用于恢复已保存在这台电脑上的原谱和校对结果。恢复码含任务访问凭据，请仅在本机使用。</p><label class="form-label">任务恢复码<input class="form-input" type="password" autocomplete="off" aria-label="任务恢复码" data-fullscore-recovery></label><button class="button secondary" data-restore-fullscore>恢复识谱任务</button><p class="form-note" role="status" data-recovery-status></p></details>';
  $("[data-restore-fullscore]").onclick=async()=>{
    const button=$("[data-restore-fullscore]"),input=$("[data-fullscore-recovery]"),message=$("[data-recovery-status]"),code=input.value;
    button.disabled=true;input.value="";message.textContent="正在读取本机保存的任务…";
    try{const job=await service.restoreJob(code);const blob=await service.readDocument(job.id);if(epoch!==modalEpoch)return;openFullPdf(new File([blob],job.originalPdf?.name||job.title+".pdf",{type:"application/pdf"}),job.metadata.source,job);}
    catch(error){if(epoch===modalEpoch){message.textContent=error.message;button.disabled=false;}}
  };
  for(const button of host.querySelectorAll('[data-resume-fullscore]'))button.onclick=async()=>{
    const job=jobs[Number(button.dataset.resumeFullscore)];button.disabled=true;button.textContent="正在读取原谱…";
    try{const blob=await service.readDocument(job.id);if(epoch!==modalEpoch)return;openFullPdf(new File([blob],job.originalPdf?.name||job.title+".pdf",{type:"application/pdf"}),job.metadata.source,job);}
    catch(error){toast(error.message,true);button.disabled=false;button.textContent="重试打开";}
  };
}
function openFullPdf(file,source,resumeJob=null) {
  modal("完整钢琴谱导入",'<div id="full-score-host"></div>',"检查全部页面 → 自动识谱 → 对照校对 → 导入练习");
  $(".modal").classList.add("full-score-modal");
  const controller=mountFullScoreImport($("#full-score-host"),{
    file,source:source||{},resumeJob,api:fullScoreApi(),onClose:closeModal,
    onImport:async result=>{
      const score=validateScore({...result.score,source:{...result.score.source,kind:result.reviewStatus?.method==="ai-unreviewed"?"full-score-ai-draft":result.reviewStatus?.complete===false?"pdf-excerpt-reviewed":"full-pdf-reviewed"}});
      await syncLocalLibrary();
      const sourceRecord=await savePracticeSource({...result,score});
      remember(score);setScore(score,result.warnings||[],sourceRecord);
      toast(`${result.reviewStatus?.method==="ai-unreviewed"?"AI草稿已导入（待校对）":"完整谱已导入"}：${sourceRecord.notation.systems.length}行、${score.notes.length}个音符，支持原谱跟随。`);
    },
  });
  modalCleanup=()=>controller.destroy();
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
function openExport() {
  modal(
    "带走你的练习谱",
    `<p class="form-note">导出当前调式与编配。MusicXML 可在 MuseScore 等软件继续编辑。</p><div class="export-options"><button data-format="xml">${icon("file-music")}<span>MusicXML<small>双手五线谱 · 可编辑</small></span>${icon("download")}</button><button data-format="midi">${icon("piano")}<span>MIDI<small>钢琴音轨 · 原谱速度</small></span>${icon("download")}</button><button data-format="json">${icon("book-open")}<span>琴伴乐谱 JSON<small>完整备份 · 可重新导入</small></span>${icon("download")}</button><button data-format="print">${icon("download")}<span>打印 / 保存 PDF<small>当前五线谱或简谱</small></span>${icon("arrow-up-right")}</button></div>`,
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
              JSON.stringify(state.score, null, 2),
              name + ".json",
              "application/json",
            );
          if (format === "print") {
            closeModal();
            window.print();
          } else toast("已导出乐谱");
        } catch (e) {
          toast(e.message, true);
        }
      }),
  );
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
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
const startupActiveId=read("qinban-active-score",null);
const restoredScore=availableScores().find(score=>score.id===startupActiveId);
setScore(restoredScore||state.score);
void syncLocalLibrary().then(()=>{
  const restored=state.shared.find(score=>score.id===startupActiveId);
  if(restored&&state.score.id===(restoredScore||library.find(score=>score.id==="bumblebee-yeung-complete")||library[0]).id)setScore(restored);
});
window.addEventListener('focus',()=>void syncLocalLibrary());
if(STATIC_SITE)toast(STATIC_NOTICE);
