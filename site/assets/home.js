import { PracticeAudio } from "./practice-audio.js";
import { PracticeScore } from "./practice-score.js";
import {
  ODE_SCORE,
  BACH_LINES,
  SOURCE_INFO,
  BACH_CORRECTION,
} from "./practice-data.js";
import { initPencilTrail } from "./pencil-trail.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clone = (value) => structuredClone(value);
const noteNames = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
const noteName = (midi) =>
  `${noteNames[midi % 12]}${Math.floor(midi / 12) - 1}`;
const audio = new PracticeAudio();
const heroId = ODE_SCORE.id;
let heroView, bachView, arrangeView, printView;
let currentView = "staff";
let selectedLine = 0;
let corrected = false;
let arranged = false;
let arrangementPreview = "after";
let lastAction = "hero";
let heroMemory = {
  beat: 0,
  bpm: ODE_SCORE.bpm,
  hand: "both",
  loop: null,
  ended: false,
};
let lastState = audio.getSnapshot();
const mainNote = ODE_SCORE.notes.find(
  (note) => note.beat === 0 && note.hand === "right",
);
const silent = {
  playing: false,
  activeNotes: [],
  hand: "both",
  loop: null,
  beat: 0,
};

function text(selector, value) {
  const element = $(selector);
  if (element && element.textContent !== value) element.textContent = value;
}
function announce(value) {
  text("#page-announcement", value);
}
function setPlayButton(button, on, idle, active = "暂停") {
  const span = button.querySelector("span");
  if (span) {
    if (span.textContent !== (on ? active : idle))
      span.textContent = on ? active : idle;
  } else if (button.textContent !== (on ? active : idle))
    button.textContent = on ? active : idle;
  button.classList.toggle("is-playing", on);
  button.setAttribute("aria-pressed", String(on));
  const path = button.querySelector("svg path");
  if (path) {
    const shape = on ? "M8 5v14M16 5v14" : "m9 5 11 7-11 7Z";
    if (path.getAttribute("d") !== shape) path.setAttribute("d", shape);
  }
}

function activateHero() {
  if (audio.getSnapshot().scoreId === heroId) return;
  const memory = { ...heroMemory };
  audio.setScore(ODE_SCORE);
  audio.setTempo(memory.bpm);
  audio.setHand(memory.hand);
  audio.setLoop(memory.loop);
  audio.seek(memory.ended ? 0 : Math.min(memory.beat, ODE_SCORE.beats));
}
async function toggleHero() {
  lastAction = "hero";
  activateHero();
  const state = audio.getSnapshot();
  if (state.playing || state.loading) audio.pause();
  else await audio.play();
}

function createKeyboard() {
  const root = $("#hero-keyboard");
  const whiteNotes = [];
  for (let midi = 43; midi <= 79; midi++)
    if (![1, 3, 6, 8, 10].includes(midi % 12)) whiteNotes.push(midi);
  root.replaceChildren();
  whiteNotes.forEach((midi) => {
    const key = document.createElement("span");
    key.className = "piano-key";
    key.dataset.midi = midi;
    key.setAttribute("aria-hidden", "true");
    if (midi % 12 === 0) key.textContent = noteName(midi);
    root.append(key);
  });
  let whiteCount = 0;
  for (let midi = 43; midi <= 79; midi++) {
    if (![1, 3, 6, 8, 10].includes(midi % 12)) {
      whiteCount++;
      continue;
    }
    const key = document.createElement("span");
    key.className = "piano-key black";
    key.dataset.midi = midi;
    key.style.left = `${(whiteCount / whiteNotes.length) * 100}%`;
    key.setAttribute("aria-hidden", "true");
    root.append(key);
  }
}
function updateKeyboard(notes) {
  const active = new Map();
  for (const note of notes) {
    const hands = active.get(note.midi) || new Set();
    hands.add(note.hand);
    active.set(note.midi, hands);
  }
  $$("#hero-keyboard .piano-key").forEach((key) => {
    const hands = active.get(Number(key.dataset.midi));
    key.classList.toggle("active-right", Boolean(hands?.has("right")));
    key.classList.toggle("active-left", Boolean(hands?.has("left")));
    key.classList.toggle("active-both", hands?.size === 2);
  });
  $("#hero-keyboard").setAttribute(
    "aria-label",
    notes.length
      ? `正在发声的琴键：${notes.map((n) => `${n.hand === "left" ? "左手" : "右手"} ${noteName(n.midi)}`).join("、")}`
      : "随乐谱发声的琴键",
  );
}

function bachScore() {
  const score = clone(BACH_LINES[selectedLine].score);
  if (!corrected && selectedLine === 0) {
    const note = score.notes.find((n) => n.id === BACH_CORRECTION.noteId);
    note.midi = BACH_CORRECTION.wrongMidi;
    delete note.pitch;
  }
  return score;
}
function setWorkflowStep(step) {
  $$("[data-step]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.step === step)),
  );
}
function updateReviewCopy() {
  const line = BACH_LINES[selectedLine];
  text(
    "#digital-row-label",
    `第 ${selectedLine + 1} 行 · 第 ${line.measures[0]}–${line.measures.at(-1)} 小节`,
  );
  text(
    "#selected-source-caption",
    `已选第 ${selectedLine + 1} 行 · 第 ${line.measures[0]}–${line.measures.at(-1)} 小节`,
  );
  $$(".source-row").forEach((button, i) =>
    button.setAttribute("aria-pressed", String(i === selectedLine)),
  );
  const isClear = corrected || selectedLine !== 0;
  $("#correction-card").classList.toggle("is-correct", isClear);
  $("#review-state").classList.toggle("correct", isClear);
  text(
    "#review-state",
    selectedLine === 0
      ? corrected
        ? "示例疑点已修正"
        : "1 处示例疑点"
      : "对应第 2 行原谱",
  );
  if (selectedLine === 0) {
    text(
      "#correction-title",
      corrected ? "这个音，现在对上了。" : "这里应该是 E5，不是 F5。",
    );
    text(
      "#correction-detail",
      corrected
        ? "已将右手第 2 拍从 F5 修正为 E5。听听它的变化。"
        : "这是一处特意设置的疑点。对照原谱，试着修正它。",
    );
    text("#correct-note", corrected ? "已修正 E5" : "修正为 E5");
    $("#correct-note").disabled = corrected;
  } else {
    text("#correction-title", "同一页，换一行继续看。");
    text("#correction-detail", "这里是原谱第 4–6 小节。示例疑点设在第 1 行。");
    text("#correct-note", "回看第 1 行");
    $("#correct-note").disabled = false;
  }
  text("#correction-card .correction-mark", isClear ? "✓" : "?");
  setPlayButton(
    $("#bach-play"),
    lastState.playing && lastState.scoreId === line.score.id,
    corrected || selectedLine !== 0 ? "听校对后的片段" : "听当前片段",
  );
}
function selectSourceLine(index, { focus = false } = {}) {
  audio.pause();
  selectedLine = index;
  bachView.setScore(bachScore());
  bachView.selectNote(index === 0 ? BACH_CORRECTION.noteId : null, {
    corrected,
  });
  bachView.update(silent);
  updateReviewCopy();
  setWorkflowStep("source");
  text(
    "#review-status",
    `已对上原谱第 ${index + 1} 行。${index === 0 && !corrected ? "红色标记是可重置的示例疑点。" : "可以试听这一行的数字谱。"}`,
  );
  if (focus)
    $(`.source-row[data-line="${index}"]`)?.focus({ preventScroll: true });
}
function correctNote() {
  if (selectedLine !== 0) {
    selectSourceLine(0);
    return;
  }
  if (corrected) return;
  const snapshot = audio.getSnapshot();
  audio.pause();
  corrected = true;
  bachView.setScore(bachScore());
  bachView.selectNote(BACH_CORRECTION.noteId, { corrected: true });
  bachView.flashNotes([BACH_CORRECTION.noteId]);
  if (snapshot.scoreId === BACH_LINES[0].score.id) {
    audio.setScore(bachScore());
    audio.seek(snapshot.beat);
  }
  updateReviewCopy();
  setWorkflowStep("review");
  text("#review-status", "已修正：F5 → E5。数字谱和试听都已更新，现在听一遍。");
  announce("示例疑点已修正为 E5。");
}
async function toggleBach() {
  lastAction = "bach";
  const score = bachScore();
  const snapshot = audio.getSnapshot();
  if (snapshot.scoreId === score.id && (snapshot.playing || snapshot.loading)) {
    audio.pause();
    return;
  }
  if (snapshot.scoreId !== score.id) audio.setScore(score);
  setWorkflowStep("listen");
  text(
    "#review-status",
    selectedLine === 0 && !corrected
      ? "正在试听含示例疑点的版本；修正后可以对比。"
      : "正在试听与当前数字谱对应的片段。",
  );
  await audio.play();
}

function arrangementScore({ full = false, modified = arranged, id } = {}) {
  const score = clone(ODE_SCORE);
  score.id = id || (modified ? "arrangement-after" : "arrangement-before");
  if (!full) {
    score.notes = score.notes.filter((n) => n.beat < 4);
    score.beats = 4;
  }
  if (modified)
    for (const [suffix, midi] of [
      ["c", 60],
      ["g", 67],
    ]) {
      const note = {
        ...clone(mainNote),
        id: `${mainNote.id}-chord-${suffix}`,
        midi,
      };
      delete note.pitch;
      score.notes.push(note);
    }
  score.notes.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  return score;
}
function updateArrangement({ flash = false } = {}) {
  arrangementPreview = "after";
  arrangeView.setScore(arrangementScore());
  arrangeView.selectNote(mainNote.id, { corrected: arranged });
  printView.setScore(arrangementScore({ full: true }));
  $("#undo-arrange").disabled = !arranged;
  $("#hear-after").disabled = !arranged;
  $("#make-chord").disabled = arranged;
  $("#make-chord").classList.toggle("is-changed", arranged);
  text(
    "#make-chord span:last-child",
    arranged ? "已改为 C4 · E4 · G4" : "把 E4 改为 C 大三和弦",
  );
  text("#edition-state", arranged ? "我的改编版本" : "原始版本");
  text(
    "#print-edition",
    arranged ? "主题前四小节 · 第一拍三和弦练习版" : "主题前四小节 · 原始版本",
  );
  if (flash) {
    const ids = [
      mainNote.id,
      `${mainNote.id}-chord-c`,
      `${mainNote.id}-chord-g`,
    ];
    arrangeView.flashNotes(ids);
    printView.flashNotes(ids);
  }
}
async function playArrangement(which) {
  lastAction = which === "before" ? "arrange-before" : "arrange-after";
  const score = arrangementScore({
    modified: which === "after" && arranged,
    id: `arrangement-${which}`,
  });
  const snapshot = audio.getSnapshot();
  if (snapshot.scoreId === score.id && (snapshot.playing || snapshot.loading)) {
    audio.pause();
    return;
  }
  arrangementPreview = which;
  arrangeView.setScore(score);
  arrangeView.selectNote(mainNote.id, {
    corrected: which === "after" && arranged,
  });
  audio.setScore(score);
  text(
    "#arrange-status",
    which === "before"
      ? "正在试听修改前：第一拍只有右手 E4。"
      : "正在试听修改后：第一拍右手 C4、E4、G4 同时发声。",
  );
  await audio.play();
}

function onAudioState(state) {
  lastState = state;
  const isHero = state.scoreId === heroId;
  if (isHero)
    heroMemory = {
      beat: state.beat,
      bpm: state.bpm,
      hand: state.hand,
      loop: state.loop,
      ended: state.ended,
    };
  const heroState = isHero ? state : { ...silent, ...heroMemory };
  heroView?.update(heroState);
  const heroActive = isHero && (state.playing || state.loading);
  $("#practice").classList.toggle("is-playing", isHero && state.playing);
  setPlayButton(
    $("#hero-play"),
    heroActive,
    state.ended && isHero ? "再听一遍" : "听这段谱",
  );
  setPlayButton(
    $("#transport-play"),
    heroActive,
    state.ended && isHero ? "重播" : "播放",
  );
  $("#transport-play").setAttribute(
    "aria-label",
    heroActive ? "暂停欢乐颂" : "播放欢乐颂",
  );
  const bar = Math.min(3, Math.floor(heroMemory.beat / 4));
  const beat = Math.min(4, Math.floor(heroMemory.beat % 4) + 1);
  text(
    "#position-label",
    heroMemory.ended ? "四小节已听完" : `第 ${bar + 1} 小节 · 第 ${beat} 拍`,
  );
  $("#play-progress").style.width =
    `${Math.min(100, (heroMemory.beat / 16) * 100)}%`;
  text("#tempo-readout .tempo-value", String(heroMemory.bpm));
  text("#score-tempo", `C 大调 · 4/4 · ♩ = ${heroMemory.bpm}`);
  const hands = { both: "双手", right: "右手", left: "左手" };
  text(
    "#settings-summary",
    `${hands[heroMemory.hand]} · ${heroMemory.bpm === ODE_SCORE.bpm ? "原速" : "慢练"}${heroMemory.loop ? " · 2–3 循环" : ""}`,
  );
  $$("button[data-hand]").forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.hand === heroMemory.hand),
    ),
  );
  $$("[data-speed]").forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.speed) === heroMemory.bpm),
    ),
  );
  $("#loop-toggle").setAttribute(
    "aria-pressed",
    String(Boolean(heroMemory.loop)),
  );
  text(
    "#loop-label",
    heroMemory.loop ? "第 2–3 小节循环中" : "从哪一小节开始，都可以。",
  );
  $$("[data-measure]").forEach((button) => {
    const number = Number(button.dataset.measure);
    button.setAttribute("aria-current", String(number === bar));
    button.classList.toggle(
      "in-loop",
      Boolean(heroMemory.loop) && number >= 1 && number <= 2,
    );
  });
  $(".hand-legend.right").classList.toggle(
    "is-muted",
    heroMemory.hand === "left",
  );
  $(".hand-legend.left").classList.toggle(
    "is-muted",
    heroMemory.hand === "right",
  );
  text(
    "#right-legend",
    heroMemory.hand === "left" ? "右手 · 已静音" : "右手 · 旋律",
  );
  text(
    "#left-legend",
    heroMemory.hand === "right" ? "左手 · 已静音" : "左手 · 伴奏",
  );
  updateKeyboard(isHero ? state.activeNotes : []);
  const error = state.error;
  $(".audio-feedback").classList.toggle("has-error", Boolean(error));
  $("#audio-retry").hidden = !error;
  text(
    "#audio-status",
    error ||
      (state.loading
        ? "正在准备钢琴采样…谱面仍可定位，点击暂停可取消。"
        : state.playing
          ? isHero
            ? "琴声响起，音符和琴键一起回应。"
            : "正在试听下方片段，首屏练习已暂停。"
          : state.activeNotes.length
            ? "正在试听选中的音符。"
            : state.ready
              ? "钢琴采样已就绪。点音符可试听，点小节可定位。"
              : "点播放，听见真实钢琴采样。"),
  );
  const isBach = state.scoreId === BACH_LINES[selectedLine].score.id;
  bachView?.update(isBach ? state : silent);
  setPlayButton(
    $("#bach-play"),
    isBach && (state.playing || state.loading),
    corrected || selectedLine !== 0 ? "听校对后的片段" : "听当前片段",
  );
  if (error && isBach) text("#review-status", error + " 再点试听即可重试。");
  if (isBach && state.ended)
    text(
      "#review-status",
      "这一行已听完。可以换一行，或回到示例疑点再试一次。",
    );
  const isArrangement = state.scoreId?.startsWith("arrangement-");
  arrangeView?.update(isArrangement ? state : silent);
  setPlayButton(
    $("#hear-before"),
    state.scoreId === "arrangement-before" && (state.playing || state.loading),
    "听修改前",
  );
  setPlayButton(
    $("#hear-after"),
    state.scoreId === "arrangement-after" && (state.playing || state.loading),
    "听修改后",
  );
  if (error && isArrangement)
    text("#arrange-status", error + " 再点试听即可重试。");
  if (isArrangement && state.ended)
    text(
      "#arrange-status",
      arrangementPreview === "before"
        ? "修改前已听完。试试第一拍变成三和弦的效果。"
        : "修改后已听完。A4 预览已同步这次改编。",
    );
}

async function initialize() {
  createKeyboard();
  if (window.matchMedia("(max-width:700px)").matches)
    $("#practice-settings").open = false;
  const desktop = window.matchMedia("(min-width:701px)");
  desktop.addEventListener("change", (event) => {
    if (event.matches) $("#practice-settings").open = true;
  });
  const source = $("#bach-original");
  source.src = SOURCE_INFO.image;
  source.width = 1600;
  source.height = 2263;
  $("#original-pdf").href = SOURCE_INFO.pdf;
  const rowRoot = $("#source-row-buttons");
  BACH_LINES.forEach((line, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "source-row";
    button.dataset.line = index;
    button.style.cssText = `left:${line.rect.x * 100}%;top:${line.rect.y * 100}%;width:${line.rect.width * 100}%;height:${line.rect.height * 100}%;`;
    button.setAttribute(
      "aria-label",
      `选择原谱第 ${index + 1} 行，第 ${line.measures[0]} 至 ${line.measures.at(-1)} 小节`,
    );
    button.setAttribute("aria-pressed", String(index === 0));
    const label = document.createElement("span");
    label.textContent = `第 ${index + 1} 行 · ${line.measures[0]}–${line.measures.at(-1)} 小节`;
    button.append(label);
    button.addEventListener("click", () => selectSourceLine(index));
    rowRoot.append(button);
  });
  await document.fonts.load("24px Bravura");
  heroView = new PracticeScore($("#hero-score"), {
    score: ODE_SCORE,
    onNote: async (notes) => {
      lastAction = "hero";
      activateHero();
      const selected = notes[0];
      if (
        heroMemory.hand !== "both" &&
        notes.every((n) => n.hand !== heroMemory.hand)
      )
        audio.setHand(selected.hand);
      const state = audio.getSnapshot();
      if (
        state.loop &&
        (selected.beat < state.loop.start || selected.beat >= state.loop.end)
      )
        audio.setLoop(null);
      audio.pause();
      audio.seek(selected.beat);
      await audio.audition(notes);
      announce(`试听 ${notes.map((n) => noteName(n.midi)).join("、")}`);
    },
  });
  bachView = new PracticeScore($("#bach-score"), {
    score: bachScore(),
    compact: true,
    interactive: false,
    firstMeasure: 1,
    onNote: () => correctNote(),
  });
  bachView.selectNote(BACH_CORRECTION.noteId, { corrected: false });
  arrangeView = new PracticeScore($("#arrange-score"), {
    score: arrangementScore(),
    interactive: false,
    selectionLabel: "选中第一拍，改为三和弦",
    selectionCorrectedLabel: "已改为三和弦",
    onNote: () => {
      if (!arranged) $("#make-chord").click();
    },
  });
  const printHost = document.createElement("div");
  printHost.className = "score-surface";
  $("#print-notation").append(printHost);
  printView = new PracticeScore(printHost, {
    score: arrangementScore({ full: true }),
    interactive: false,
    perSystem: 2,
    fixedWidth: 620,
  });
  await Promise.all([
    heroView.ready,
    bachView.ready,
    arrangeView.ready,
    printView.ready,
  ]);
  updateArrangement();
  updateReviewCopy();
  audio.subscribe(onAudioState);
  audio.setScore(ODE_SCORE);
  $("#hero-play").addEventListener("click", toggleHero);
  $("#transport-play").addEventListener("click", toggleHero);
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.view;
      $$("[data-view]").forEach((other) => {
        const on = other === button;
        other.setAttribute("aria-selected", String(on));
        other.tabIndex = on ? 0 : -1;
      });
      $("#hero-score").setAttribute("aria-labelledby", button.id);
      heroView.setView(currentView);
      heroView.update(
        audio.getSnapshot().scoreId === heroId
          ? audio.getSnapshot()
          : { ...silent, ...heroMemory },
      );
      announce(`已切换为${button.textContent}，播放位置保持不变。`);
    });
    button.addEventListener("keydown", (event) => {
      const tabs = $$("[data-view]");
      const index = tabs.indexOf(button);
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      tabs[next].click();
      tabs[next].focus();
    });
  });
  $$("button[data-hand]").forEach((button) =>
    button.addEventListener("click", () => {
      activateHero();
      audio.setHand(button.dataset.hand);
      announce(
        `现在只听${button.textContent === "双手" ? "双手演奏" : button.textContent}。`,
      );
    }),
  );
  $$("[data-speed]").forEach((button) =>
    button.addEventListener("click", () => {
      activateHero();
      audio.setTempo(Number(button.dataset.speed));
      announce(`速度改为每分钟 ${button.dataset.speed} 拍，继续当前拍位。`);
    }),
  );
  $("#loop-toggle").addEventListener("click", () => {
    activateHero();
    audio.setLoop(audio.getSnapshot().loop ? null : { start: 4, end: 12 });
    announce(
      audio.getSnapshot().loop ? "循环第 2 至第 3 小节。" : "已取消循环。",
    );
  });
  $$("[data-measure]").forEach((button) =>
    button.addEventListener("click", () => {
      activateHero();
      const beat = Number(button.dataset.measure) * 4;
      const loop = audio.getSnapshot().loop;
      if (loop && (beat < loop.start || beat >= loop.end)) audio.setLoop(null);
      audio.seek(beat);
      heroView.selectMeasure?.(beat);
      announce(`已定位到第 ${Number(button.dataset.measure) + 1} 小节。`);
    }),
  );
  $("#audio-retry").addEventListener("click", () => {
    if (lastAction === "bach") toggleBach();
    else if (lastAction.startsWith("arrange-"))
      playArrangement(lastAction.split("-")[1]);
    else toggleHero();
  });
  $("#correct-note").addEventListener("click", correctNote);
  $("#bach-play").addEventListener("click", toggleBach);
  $("#review-reset").addEventListener("click", () => {
    audio.pause();
    corrected = false;
    selectSourceLine(0);
    text("#review-status", "已重置演示：F5 疑点回来了，可以再修正一次。");
    if (audio.getSnapshot().scoreId === BACH_LINES[0].score.id)
      audio.setScore(bachScore());
  });
  $$("[data-step]").forEach((button) =>
    button.addEventListener("click", () => {
      const step = button.dataset.step;
      if (step === "source") {
        setWorkflowStep(step);
        $(`.source-row[data-line="${selectedLine}"]`).focus({
          preventScroll: true,
        });
        text(
          "#review-status",
          "点击原谱中的第 1 或第 2 行，右侧会显示对应数字谱。",
        );
      }
      if (step === "review") {
        if (selectedLine !== 0) selectSourceLine(0);
        setWorkflowStep(step);
        $("#correct-note").focus({ preventScroll: true });
        text(
          "#review-status",
          corrected
            ? "疑点已修正。可以试听，或点击重置再试一次。"
            : "对照左侧原谱：右手第二拍应为 E5。点击红色音符或“修正为 E5”。",
        );
      }
      if (step === "listen") toggleBach();
    }),
  );
  $("#make-chord").addEventListener("click", () => {
    if (arranged) return;
    audio.pause();
    arranged = true;
    updateArrangement({ flash: true });
    text(
      "#arrange-status",
      "已将第一拍 E4 改为 C4 · E4 · G4。试听与 A4 预览同步更新。",
    );
    announce("三和弦已写入当前练习版本。");
  });
  $("#undo-arrange").addEventListener("click", () => {
    audio.pause();
    arranged = false;
    updateArrangement();
    text("#arrange-status", "已撤销。第一拍恢复 E4，A4 预览也恢复原始版本。");
  });
  $("#hear-before").addEventListener("click", () => playArrangement("before"));
  $("#hear-after").addEventListener("click", () => playArrangement("after"));
  $("#print-score").addEventListener("click", () => {
    audio.pause();
    text(
      "#arrange-status",
      "打印当前 A4 练习谱；在打印窗口中可选择“保存为 PDF”。",
    );
    window.print();
  });
  window.addEventListener("beforeprint", () => audio.pause());
  initPencilTrail();
  document.documentElement.dataset.homeReady = "true";
}

// Read-only diagnostics for regression checks; interaction still goes through real controls.
export function getHomeSnapshot() {
  return {
    audio: audio.getSnapshot(),
    hero: { ...heroMemory },
    view: currentView,
    selectedLine,
    corrected,
    arranged,
    arrangementPreview,
    geometry: heroView?.getGeometry(),
    bachGeometry: bachView?.getGeometry(),
  };
}

initialize().catch((error) => {
  console.error("琴伴互动首页未能就绪", error);
  text(
    "#audio-status",
    "乐谱资源暂未就绪，请刷新页面重试。你仍可打开琴伴练习室。",
  );
  text(".render-loading", "乐谱未能展开。请刷新页面，或打开琴伴练习室。");
});
