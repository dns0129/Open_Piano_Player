import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { VexFlow, Element } from "vexflow";
import { PracticeScore } from "../site/assets/practice-score.js";
import {
  ODE_SCORE,
  BACH_LINES,
  BACH_CORRECTION,
} from "../site/assets/practice-data.js";

function environment(width = 800, fonts) {
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
  };
  const measurementCanvas = Element.getTextMeasurementCanvas();
  const dom = new JSDOM('<main><div id="score"></div></main>');
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  window.VexFlow = VexFlow;
  // Actual VexFlow SVG engraving, with deterministic text measurements because
  // jsdom has no platform font rasterizer. Browser font/visual QA is separate.
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    font: "",
    measureText: (text) => ({
      width: String(text).length * 8,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
    }),
  });
  Element.setTextMeasurementCanvas(document.createElement("canvas"));
  if (fonts) Object.defineProperty(document, "fonts", { value: fonts });
  const host = document.querySelector("#score");
  Object.defineProperty(host, "clientWidth", { value: width });
  const views = [];
  return {
    dom,
    host,
    create(options) {
      const view = new PracticeScore(host, options);
      views.push(view);
      return view;
    },
    restore() {
      views.forEach((view) => view.destroy());
      Element.setTextMeasurementCanvas(measurementCanvas);
      Object.assign(globalThis, saved);
      dom.window.close();
    },
  };
}

function close(actual, expected, message = "") {
  assert.ok(
    Math.abs(actual - expected) < 0.001,
    `${message}: ${actual} ≠ ${expected}`,
  );
}

function checkEventCoverage(geometry, source) {
  const ids = [...new Set(geometry.notes.flatMap((mark) => mark.ids))].sort();
  assert.deepEqual(ids, source.notes.map((note) => note.id).sort());
  for (const note of source.notes) {
    const segments = geometry.notes
      .filter((mark) => mark.ids.includes(note.id))
      .sort((a, b) => a.beat - b.beat);
    close(segments[0].beat, note.beat, `${note.id} onset`);
    close(
      segments.at(-1).endBeat,
      note.beat + note.duration,
      `${note.id} offset`,
    );
    close(
      segments.reduce(
        (duration, segment) => duration + segment.endBeat - segment.beat,
        0,
      ),
      note.duration,
      `${note.id} sounding duration`,
    );
  }
}

test("staff cursor crosses actual notehead centers and loop marks enclose bars 2–3", async () => {
  const env = environment();
  try {
    let clicked;
    const view = env.create({
      score: ODE_SCORE,
      onNote: (notes) => (clicked = notes),
    });
    await view.ready;
    const geometry = view.getGeometry();
    assert.equal(geometry.systems.length, 1);
    assert.equal(geometry.perSystem, 4);
    checkEventCoverage(geometry, ODE_SCORE);
    for (const source of ODE_SCORE.notes.filter(
      (note) => note.hand === "right",
    )) {
      view.update({
        beat: source.beat,
        playing: true,
        activeNotes: [source],
        hand: "both",
      });
      const mark = view
        .getGeometry()
        .notes.find((note) => note.ids.includes(source.id));
      close(
        Number(env.host.querySelector(".playhead").dataset.x),
        mark.x,
        `${source.id} cursor`,
      );
    }
    view.update({ beat: 5, loop: { start: 4, end: 12 } });
    const measures = geometry.systems[0].measures;
    const loop = env.host.querySelector(".loop-mark");
    assert.ok(loop);
    const coordinates = loop
      .getAttribute("d")
      .match(/-?\d+(?:\.\d+)?/g)
      .map(Number);
    close(coordinates[0], measures[1].x + 2, "loop begins at bar 2 boundary");
    close(
      coordinates.at(-2),
      measures[2].x + measures[2].width - 2,
      "loop ends at bar 3 boundary",
    );
    const source = ODE_SCORE.notes.find((note) => note.hand === "right");
    const hit = env.host.querySelector(
      `.note-hit[data-note-ids="${source.id}"]`,
    );
    assert.equal(Number(hit.getAttribute("width")), 44);
    assert.equal(Number(hit.getAttribute("height")), 44);
    assert.match(hit.getAttribute("aria-label"), /右手 E4.*第 1 小节/);
    hit.dispatchEvent(
      new env.dom.window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      }),
    );
    assert.equal(clicked[0].id, source.id);
    view.update({ loop: null });
    assert.equal(env.host.querySelectorAll(".loop-mark,.loop-tag").length, 0);
  } finally {
    env.restore();
  }
});

test("all readings keep event durations; numbered rhythm and roll note lengths are visible", async () => {
  const env = environment();
  try {
    const view = env.create({ score: ODE_SCORE, onNote: () => {} });
    await view.ready;
    const state = {
      beat: 13.5,
      playing: true,
      hand: "left",
      loop: { start: 4, end: 12 },
      activeNotes: [],
    };
    view.update(state);
    for (const mode of ["staff", "numbered", "roll"]) {
      view.setView(mode);
      assert.equal(view.state.beat, 13.5);
      assert.equal(view.state.hand, "left");
      assert.deepEqual(view.state.loop, state.loop);
      checkEventCoverage(view.getGeometry(), ODE_SCORE);
    }
    view.setView("numbered");
    const dotted = ODE_SCORE.notes.find(
      (note) => note.hand === "right" && note.duration === 1.5,
    );
    const eighth = ODE_SCORE.notes.find(
      (note) => note.hand === "right" && note.duration === 0.5,
    );
    const low = ODE_SCORE.notes.find((note) => note.midi === 43);
    assert.equal(
      env.host
        .querySelector(`.score-note[data-note-ids="${dotted.id}"]`)
        .querySelectorAll("circle").length,
      1,
      "dotted quarter has a rhythm dot",
    );
    assert.equal(
      env.host
        .querySelector(`.score-note[data-note-ids="${eighth.id}"]`)
        .querySelectorAll("line").length,
      1,
      "eighth note has one underline",
    );
    assert.equal(
      env.host
        .querySelector(`.score-note[data-note-ids="${low.id}"]`)
        .querySelectorAll("circle").length,
      2,
      "G2 has two lower octave dots",
    );
    view.setView("roll");
    const quarter = ODE_SCORE.notes.find((note) => note.duration === 1);
    const half = ODE_SCORE.notes.find((note) => note.duration === 2);
    const rectangle = (note) =>
      env.host.querySelector(`.score-note[data-note-ids="${note.id}"] rect`);
    close(
      Number(rectangle(half).getAttribute("width")) + 1,
      (Number(rectangle(quarter).getAttribute("width")) + 1) * 2,
      "half note lasts twice a quarter",
    );
    assert.notEqual(
      rectangle(half).getAttribute("y"),
      rectangle(quarter).getAttribute("y"),
      "pitch controls the lane",
    );
  } finally {
    env.restore();
  }
});

test("Bach held bass events are simultaneous chords with ties, and only the doubt is actionable", async () => {
  const env = environment(310);
  try {
    let correction = 0;
    const score = structuredClone(BACH_LINES[0].score);
    score.notes.find((note) => note.id === BACH_CORRECTION.noteId).midi =
      BACH_CORRECTION.wrongMidi;
    const view = env.create({
      score,
      compact: true,
      interactive: false,
      onNote: () => correction++,
    });
    view.selectNote(BACH_CORRECTION.noteId);
    await view.ready;
    checkEventCoverage(view.getGeometry(), score);
    assert.equal(view.getGeometry().systems.length, 3);
    assert.equal(view.getGeometry().width, 450);
    const heldBass = score.notes.find(
      (note) => note.beat === 0 && note.hand === "left",
    );
    const heldSegments = view
      .getGeometry()
      .notes.filter((mark) => mark.ids.includes(heldBass.id));
    assert.equal(heldSegments.length, 2);
    assert.equal(
      heldSegments[1].ids.length,
      2,
      "the following E4 overlaps the still-held C4",
    );
    assert.equal(
      env.host.querySelectorAll(".vf-stavetie").length,
      6,
      "each of the six held C/B bass events is tied into its chord",
    );
    assert.equal(env.host.querySelectorAll(".note-hit").length, 1);
    const hit = env.host.querySelector(".note-hit");
    assert.match(hit.getAttribute("aria-label"), /示例疑点.*F5/);
    hit.dispatchEvent(
      new env.dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    assert.equal(correction, 1);
    view.update({ hand: "right" });
    assert.ok(
      [...env.host.querySelectorAll(".vf-stavetie")].every((tie) =>
        tie.classList.contains("is-muted"),
      ),
      "ties mute with the left hand",
    );
    view.setScore(BACH_LINES[1].score).selectNote(null);
    assert.equal(view.firstMeasure, 4);
    assert.equal(view.getGeometry().systems[0].measures[0].number, 4);
    assert.equal(env.host.querySelectorAll(".note-hit").length, 0);
  } finally {
    env.restore();
  }
});

test("mobile systems and view switches retain the beat and only move their own scroll container", async () => {
  const env = environment(310);
  try {
    let pageScrolls = 0;
    window.scrollTo = () => pageScrolls++;
    const view = env.create({ score: ODE_SCORE, onNote: () => {} });
    await view.ready;
    assert.equal(view.getGeometry().systems.length, 4);
    const note = ODE_SCORE.notes.find(
      (note) => note.beat === 8 && note.hand === "left",
    );
    view.update({
      beat: 8,
      playing: true,
      activeNotes: [note],
      hand: "left",
      loop: { start: 4, end: 12 },
    });
    assert.equal(env.host.scrollLeft, 620);
    assert.equal(
      env.host.querySelectorAll(".loop-mark").length,
      2,
      "loop spans the second and third mobile systems",
    );
    for (const mode of ["numbered", "roll", "staff"]) {
      view.setView(mode);
      assert.equal(view.state.beat, 8);
      assert.equal(env.host.scrollLeft, 620);
      assert.equal(
        env.host.querySelectorAll(".playhead:not([hidden])").length,
        1,
      );
      assert.ok(
        [...env.host.querySelectorAll(".score-note.hand-right")].every(
          (group) => group.classList.contains("is-muted"),
        ),
      );
    }
    assert.equal(pageScrolls, 0);
  } finally {
    env.restore();
  }
});

test("engraving waits for Bravura and preserves selection made while the font loads", async () => {
  let resolveFont;
  const fontPromise = new Promise((resolve) => (resolveFont = resolve));
  let requested;
  const env = environment(310, {
    load: (font) => {
      requested = font;
      return fontPromise;
    },
  });
  try {
    const view = env.create({
      score: BACH_LINES[0].score,
      interactive: false,
      compact: true,
      onNote: () => {},
    });
    view.selectNote(BACH_CORRECTION.noteId, { corrected: true });
    assert.equal(env.host.querySelectorAll("svg").length, 0);
    assert.match(env.host.textContent, /正在铺开乐谱/);
    assert.match(requested, /Bravura/);
    resolveFont();
    await view.ready;
    assert.equal(env.host.querySelectorAll("svg").length, 3);
    assert.equal(env.host.querySelectorAll(".note-hit.is-corrected").length, 1);
  } finally {
    env.restore();
  }
});

test("the A4 engraving has all four bars and the edited triad, with no interactive hit targets", async () => {
  const env = environment(220);
  try {
    const score = structuredClone(ODE_SCORE);
    const first = score.notes.find(
      (note) => note.beat === 0 && note.hand === "right",
    );
    score.notes.push(
      { ...first, id: "chord-c", midi: 60 },
      { ...first, id: "chord-g", midi: 67 },
    );
    const view = env.create({
      score,
      interactive: false,
      perSystem: 2,
      fixedWidth: 620,
    });
    await view.ready;
    const geometry = view.getGeometry();
    assert.equal(geometry.systems.length, 2);
    assert.equal(geometry.width, 620);
    assert.equal(
      geometry.systems.flatMap((system) => system.measures).length,
      4,
    );
    assert.equal(
      geometry.notes.find((mark) => mark.ids.includes(first.id)).ids.length,
      3,
    );
    assert.equal(env.host.querySelectorAll(".note-hit,.playhead").length, 0);
    checkEventCoverage(geometry, score);
  } finally {
    env.restore();
  }
});

test("measure selection draws once without erasing loop boundaries and arrangement labels stay contextual", async () => {
  const env = environment();
  try {
    const view = env.create({
      score: ODE_SCORE,
      interactive: false,
      onNote: () => {},
      selectionLabel: "选中第一拍，改为三和弦",
      selectionCorrectedLabel: "已改为三和弦",
    });
    await view.ready;
    const first = ODE_SCORE.notes.find(
      (note) => note.beat === 0 && note.hand === "right",
    );
    view.selectNote(first.id).selectMeasure(4);
    const line = env.host.querySelector(".measure-selection");
    assert.equal(line.dataset.selectedBeat, "4");
    assert.equal(line.style.animationDuration, "300ms");
    assert.match(
      env.host.querySelector(".note-hit").getAttribute("aria-label"),
      /选中第一拍，改为三和弦/,
    );
    view.update({ beat: 4.5, playing: true, loop: { start: 4, end: 12 } });
    assert.equal(
      env.host.querySelector(".measure-selection"),
      line,
      "audio frames do not restart the pencil animation",
    );
    assert.equal(
      env.host.querySelectorAll(".loop-mark:not(.measure-selection)").length,
      1,
    );
    view.selectMeasure(8).selectNote(first.id, { corrected: true });
    assert.equal(env.host.querySelectorAll(".measure-selection").length, 1);
    assert.equal(
      env.host.querySelector(".measure-selection").dataset.selectedBeat,
      "8",
    );
    assert.match(
      env.host.querySelector(".note-hit").getAttribute("aria-label"),
      /已改为三和弦/,
    );
    assert.doesNotThrow(() => JSON.stringify(view.getGeometry()));
  } finally {
    env.restore();
  }
});
