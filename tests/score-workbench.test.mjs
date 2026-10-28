import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { validateScore } from "../lib/score.mjs";
import {
  snapStaffTarget,
  savedScorePages,
  sourceGrid,
  pagePlayback,
  editedSourceRecord,
  sliceScoreRange,
} from "../lib/score-workbench.mjs";
import { workbenchFixture } from "./helpers/score-workbench-fixture.mjs";

const fixture = workbenchFixture;
test("saved scores group complete original pages and preserve irregular measures and clipped ties", () => {
  const { score, sourceRecord } = fixture(),
    pages = savedScorePages(validateScore(score), sourceRecord.notation);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].systems.length, 2);
  assert.equal(pages[1].systems[0].score.notes[0].beat, 0);
  assert.equal(pagePlayback(pages[0]).durationBeats, 8);
  assert.equal(new Set(pagePlayback(pages[0]).notes.map((n) => n.id)).size, 6);
  assert.equal(
    savedScorePages({ ...validateScore(score), durationBeats: 36 }, null)
      .length,
    2,
  );
  const irregular = validateScore({
    ...score,
    durationBeats: 9,
    measureMap: [
      { beat: 0, duration: 1 },
      { beat: 1, duration: 4 },
      { beat: 5, duration: 4 },
    ],
    notes: [{ id: "long", beat: 0, duration: 9, midi: 60, hand: "right" }],
  });
  const part = sliceScoreRange(irregular, 1, 9);
  assert.deepEqual(
    part.measureMap.map((b) => b.duration),
    [4, 4],
  );
  assert.equal(part.notes[0].duration, 8);
});
test("staff snap follows line/space, bounds, exact triplets, original onset columns and musical time", () => {
  const note = { midi: 72, beat: 0, duration: 1, hand: "right" },
    staffs = [
      {
        hand: "right",
        bottomY: 100,
        bottomStep: 30,
        spacing: 10,
        minStep: 23,
        maxStep: 44,
      },
    ],
    bar = { start: 0, end: 4, left: 100, right: 500 };
  const target = snapStaffTarget({
    note,
    bar,
    staffs,
    x: 201,
    y: 94,
    endBeat: 4,
  });
  assert.equal(target.patch.midi, 65);
  assert.equal(target.y, 95);
  assert.equal(target.patch.beat, 1);
  assert.equal(target.x, 200);
  const trip = snapStaffTarget({
    note,
    bar,
    staffs,
    x: 134,
    y: 95,
    existingBeats: [1 / 3],
    endBeat: 4,
  });
  assert.equal(trip.patch.beat, 1 / 3);
  const bound = snapStaffTarget({
    note,
    bar,
    staffs,
    x: 500,
    y: -10000,
    endBeat: 4,
  });
  assert.ok(bound.y >= 30);
  assert.ok(bound.patch.beat + note.duration <= 4);
  const { score, sourceRecord } = fixture(),
    system = savedScorePages(validateScore(score), sourceRecord.notation)[0]
      .systems[0],
    grid = sourceGrid(system, system.source.staffLines);
  const source = snapStaffTarget({
    note,
    bar: grid.bar,
    staffs: grid.staffs,
    x: 480,
    y: 130,
    endBeat: 4,
    existingBeats: [0, 2],
  });
  assert.equal(source.patch.beat, 2);
  assert.equal(source.x, 480);
  assert.equal(source.patch.midi, 72);
});

const bundle = build({
  stdin: {
    contents: `export {mountPageNoteEditor} from './src/page-note-editor.js';export {mountRecognitionPageEditor} from './src/recognition-page-editor.js';export {Element} from 'vexflow';export {fontsReady} from './src/notation.js';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  globalName: "Workbench",
  logLevel: "silent",
}).then((r) => r.outputFiles[0].text);
async function boot(t) {
  const dom = new JSDOM('<div id="host" style="height:100vh"></div>', {
      url: "http://localhost",
      pretendToBeVisual: true,
      runScripts: "outside-only",
    }),
    w = dom.window;
  t.after(() => w.close());
  Object.assign(w, { structuredClone, TextEncoder, TextDecoder, Uint8Array });
  w.HTMLCanvasElement.prototype.getContext = () => ({
    font: "",
    measureText: (text) => ({
      width: String(text).length * 8,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
    }),
  });
  Object.defineProperty(w.HTMLElement.prototype, "clientWidth", {
    get: () => 800,
  });
  w.eval(await bundle);
  w.Workbench.Element.setTextMeasurementCanvas(
    w.document.createElement("canvas"),
  );
  await w.Workbench.fontsReady;
  const doc = w.document,
    host = doc.querySelector("#host"),
    audioCalls = [],
    audio = {
      note: async (s, id) => audioCalls.push({ kind: "note", s, id }),
      page: async (s) => audioCalls.push({ kind: "page", s }),
      stop: () => audioCalls.push({ kind: "stop" }),
    };
  const pointer = (target, type, x, y) => {
    const e = new w.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(e, "pointerId", { value: 1 });
    target.dispatchEvent(e);
  };
  const click = (action) =>
    doc.querySelector(`[data-swe-action="${action}"]`).click();
  return { w, doc, host, audio, audioCalls, pointer, click };
}
async function tick() {
  await new Promise((r) => setTimeout(r, 20));
}

test("page editor ghost is snapped before committing, cancellation is isolated, save/undo/redo/auditions use real notes", async (t) => {
  const { w, doc, host, audio, audioCalls, pointer, click } = await boot(t),
    { score, sourceRecord } = fixture();
  let saved, record;
  const dispose = w.Workbench.mountPageNoteEditor(host, score, {
    sourceRecord,
    audio,
    onSave: (s, r) => {
      saved = s;
      record = r;
    },
  });
  t.after(dispose);
  assert.equal(doc.querySelectorAll(".swe-digital-system").length, 2);
  assert.equal(
    doc.querySelectorAll(".notation-error").length,
    0,
    doc.body.textContent,
  );
  let handle = doc.querySelector('[data-swe-note="a0"]');
  assert.ok(handle);
  let svg = handle.closest("svg");
  const box = svg.getAttribute("viewBox").split(" ").map(Number),
    x = Number(handle.getAttribute("cx")),
    y = Number(handle.getAttribute("cy"));
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: box[2],
    bottom: box[3],
    width: box[2],
    height: box[3],
  });
  pointer(handle, "pointerdown", x, y);
  pointer(doc.querySelector(".score-workbench"), "pointermove", x + 40, y + 6);
  const ghost = doc.querySelector("[data-swe-ghost] ellipse");
  assert.ok(ghost);
  assert.equal(Number(ghost.getAttribute("cy")), y + 5);
  assert.match(
    doc.querySelector("[data-swe-status]").textContent,
    /松开后落在/,
  );
  pointer(
    doc.querySelector(".score-workbench"),
    "pointercancel",
    x + 40,
    y + 6,
  );
  click("save");
  await tick();
  assert.equal(saved.notes.find((n) => n.id === "a0").midi, 72);
  handle = doc.querySelector('[data-swe-note="a0"]');
  svg = handle.closest("svg");
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: box[2],
    bottom: box[3],
    width: box[2],
    height: box[3],
  });
  pointer(handle, "pointerdown", x, y);
  pointer(doc.querySelector(".score-workbench"), "pointermove", x + 40, y + 6);
  pointer(doc.querySelector(".score-workbench"), "pointerup", x + 40, y + 6);
  await tick();
  click("audition");
  await tick();
  assert.equal(audioCalls.find((c) => c.kind === "note").s.notes.length, 1);
  assert.equal(audioCalls.find((c) => c.kind === "note").s.notes[0].midi, 71);
  click("save");
  await tick();
  assert.equal(saved.notes.find((n) => n.id === "a0").midi, 71);
  assert.equal(record.notation.notes.find((n) => n.noteId === "a0").midi, 71);
  assert.equal(score.notes[0].midi, 72);
  assert.notEqual(saved.id, score.id);
  click("undo");
  click("save");
  await tick();
  assert.equal(saved.notes.find((n) => n.id === "a0").midi, 72);
  click("redo");
  click("save");
  await tick();
  assert.equal(saved.notes.find((n) => n.id === "a0").midi, 71);
  click("play-page");
  await tick();
  assert.equal(audioCalls.find((c) => c.kind === "page").s.notes.length, 6);
  assert.equal(audioCalls.find((c) => c.kind === "page").s.durationBeats, 8);
  click("next");
  assert.equal(doc.querySelector("[data-swe-page]").value, "2");
  assert.equal(doc.querySelectorAll(".swe-digital-system").length, 2);
  assert.equal(doc.querySelectorAll("[data-swe-ghost]").length, 0);
});

test("recognition overlay commits source-grid edits and restores evidence with undo, approval remains invalidated", async (t) => {
  const { w, doc, host, audio, pointer, click } = await boot(t),
    { score, sourceRecord } = fixture(),
    s = sourceRecord.notation.systems[0];
  const region = {
    ...s,
    selected: true,
    notes: score.notes
      .filter((n) => n.beat < 4)
      .map((n) => ({
        ...n,
        ...sourceRecord.notation.notes.find((p) => p.noteId === n.id),
      })),
    score: {
      ...score,
      durationBeats: 4,
      recognitionEvidence: {
        notes: [
          {
            noteId: "a0",
            staff: 1,
            step: "C",
            octave: 5,
            alter: 0,
            printed: null,
            shift: 0,
          },
        ],
      },
    },
    durationBeats: 4,
    reviewed: true,
  };
  const controller = w.Workbench.mountRecognitionPageEditor(host, {
    audio,
    draft: {
      title: score.title,
      pages: [{ page: 1, decision: "include", width: 850, height: 1150 }],
    },
    regions: [region],
    assets: new Map([[s.id, { url: s.imageUrl }]]),
    thumbnails: new Map(),
    onClose: () => {},
  });
  t.after(() => controller.destroy());
  const handle = doc.querySelector('[data-swe-note="a0"]'),
    svg = doc.querySelector(".swe-source-page");
  svg.getBoundingClientRect = () => ({
    left: 900,
    top: 0,
    right: 1750,
    bottom: 1150,
    width: 850,
    height: 1150,
  });
  pointer(handle, "pointerdown", 30, 20);
  pointer(doc.querySelector(".score-workbench"), "pointermove", 1380, 135);
  assert.ok(doc.querySelector("[data-swe-ghost]"));
  pointer(doc.querySelector(".score-workbench"), "pointerup", 1380, 135);
  await tick();
  assert.equal(region.notes[0].beat, 2);
  assert.equal(region.notes[0].x, 480);
  assert.equal(region.notes[0].y, 135);
  assert.equal(region.notes[0].midi, 71);
  assert.equal(region.score.recognitionEvidence.notes[0].step, "B");
  assert.equal(region.reviewed, false);
  click("undo");
  await tick();
  assert.equal(region.notes[0].midi, 72);
  assert.equal(region.score.recognitionEvidence.notes[0].step, "C");
  assert.equal(region.reviewed, false);
  click("redo");
  await tick();
  assert.equal(region.notes[0].midi, 71);
});

test("edited copies retain complete original pages, calibrated staffs and valid source references after library reopen", async (t) => {
  const { indexedDB } = await import("fake-indexeddb"),
    { createBrowserLibrary } = await import("../src/library-indexeddb.js"),
    { createUnifiedLibrary } = await import("../src/library.js"),
    { createNoteEditor } = await import("../lib/note-editor.mjs"),
    { sourceMatchesScore } = await import("../src/source-library.js");
  const { score, sourceRecord } = fixture();
  sourceRecord.notation.pages = [
    { page: 1, assetId: "original-page-1", width: 850, height: 1150 },
  ];
  sourceRecord.assets = [
    ...sourceRecord.notation.systems.map((s) => ({
      id: s.id,
      page: s.page,
      system: s.system,
      blob: new Blob(["crop-" + s.id], { type: "image/png" }),
    })),
    {
      id: "original-page-1",
      page: 1,
      blob: new Blob(["complete-original-page"], { type: "image/png" }),
    },
  ];
  const browser = createBrowserLibrary({
    name: "workbench-" + crypto.randomUUID(),
    indexedDB,
  });
  t.after(() => browser.close());
  const client = createUnifiedLibrary({
    adapter: browser,
    migrateLegacy: false,
  });
  await client.initialize();
  const original = editedSourceRecord(validateScore(score), sourceRecord);
  await client.save(score, { sourceRecord: original });
  const editor = createNoteEditor(score);
  editor.update("a0", {
    midi: 71,
    pitch: { step: "B", octave: 4, alter: 0, provenance: "edited" },
  });
  const saved = editor.savedScore();
  await client.save(saved, {
    sourceRecord: editedSourceRecord(saved, original),
  });
  const reopened = await client.readSource(saved);
  assert.equal(sourceMatchesScore(saved, reopened), true);
  assert.ok(reopened.notation.pages[0].imageUrl.startsWith("blob:"));
  assert.equal(
    await reopened.assets.find((a) => a.id === "original-page-1").blob.text(),
    "complete-original-page",
  );
  assert.deepEqual(
    reopened.notation.systems[0].staffLines,
    sourceRecord.notation.systems[0].staffLines,
  );
  assert.equal(
    (await browser.get(score.id)).score.notes.find((n) => n.id === "a0").midi,
    72,
  );
  const again = createNoteEditor(saved);
  again.update("a0", { midi: 69 });
  assert.equal(again.savedScore().id, saved.id);
  const backup = await browser.backup();
  assert.equal(backup.records.length, 2);
});

test("relocating a note exchanges rests without stealing an occupied rhythm slot, and page preview sustains cross-row notes", async () => {
  const { moveGridNote } = await import("../lib/score-workbench.mjs");
  const score = validateScore({
    tempo: 96,
    timeSignature: [4, 4],
    durationBeats: 4,
    notes: [
      {
        id: "a",
        beat: 0,
        duration: 1,
        midi: 60,
        hand: "right",
        voice: "right-1",
      },
      {
        id: "b",
        beat: 3,
        duration: 1,
        midi: 64,
        hand: "right",
        voice: "right-1",
      },
    ],
    rests: [
      {
        id: "rest",
        beat: 1,
        duration: 2,
        staff: 1,
        voice: "right-1",
        hand: "right",
        provenance: "source",
      },
    ],
  });
  const moved = moveGridNote(score, "a", { beat: 1 });
  assert.deepEqual(
    moved.rests.map((r) => [r.beat, r.duration]).sort((a, b) => a[0] - b[0]),
    [
      [0, 1],
      [2, 1],
    ],
  );
  assert.deepEqual(
    score.rests.map((r) => [r.beat, r.duration]),
    [[1, 2]],
  );
  assert.throws(() => moveGridNote(score, "a", { beat: 2.5 }), /冲突/);
  const { sourceRecord } = fixture(),
    held = {
      ...score,
      durationBeats: 16,
      notes: [{ id: "held", midi: 60, beat: 0, duration: 8, hand: "right" }],
      rests: [],
    };
  const page = savedScorePages(held, sourceRecord.notation)[0],
    preview = pagePlayback(page);
  assert.equal(preview.notes.length, 1);
  assert.equal(preview.notes[0].duration, 8);
});

test("original-source targets honor clef changes and ottava; explicit edits retain sounding and written agreement", async () => {
  const { applyWrittenGridPitch } = await import("../lib/recognition-edit.mjs"),
    { score, sourceRecord } = fixture(),
    system = savedScorePages(score, sourceRecord.notation)[0].systems[0];
  const evidence = {
    notes: [{ noteId: "a0", shift: 12 }],
    clefs: [
      { staff: 1, beat: 0, sign: "F", line: 4, octaveChange: 0 },
      { staff: 1, beat: 2, sign: "G", line: 2, octaveChange: 0 },
    ],
  };
  system.source.evidence = evidence;
  const grid = sourceGrid(system, system.source.staffLines, "a0"),
    note = { id: "a0", midi: 60, beat: 0, duration: 1, hand: "right" },
    snap = (x) =>
      snapStaffTarget({
        note,
        bar: grid.bar,
        staffs: grid.staffs,
        x,
        y: 155,
        endBeat: 4,
      });
  assert.equal(snap(160).patch.midi, 55);
  assert.equal(snap(480).patch.midi, 76);
  applyWrittenGridPitch(evidence, {
    ...note,
    staff: 1,
    beat: 2,
    pitch: { step: "E", octave: 5, alter: 0 },
  });
  assert.equal(evidence.notes[0].octave, 4);
  assert.equal(evidence.notes[0].shift, 12);
});

test("a new line or space takes the key signature, a horizontal move keeps the written accidental, and only displayed accidentals count as printed", async () => {
  const { applyWrittenGridPitch } = await import("../lib/recognition-edit.mjs");
  // Treble staff with E4 on the bottom line; each staff step is 5px.
  const staffs = [{ hand: "right", bottomY: 100, spacing: 10, bottomStep: 30 }],
    bar = { start: 0, end: 4, left: 0, right: 400, keySignature: 1 },
    yAt = (step, octave) =>
      100 - (octave * 7 + "CDEFGAB".indexOf(step) - 30) * 5,
    move = (note, step, octave, keySignature = 1, x = 0) =>
      snapStaffTarget({
        note,
        bar: { ...bar, keySignature },
        staffs,
        notes: [note],
        x,
        y: yAt(step, octave),
      }).patch,
    fSharp = {
      id: "f",
      midi: 66,
      beat: 0,
      duration: 1,
      hand: "right",
      pitch: { step: "F", octave: 4, alter: 1 },
    };
  let patch = move(fSharp, "G", 4);
  assert.deepEqual(
    [patch.midi, patch.pitch.alter, patch.accidental],
    [67, 0, undefined],
  );
  patch = move(fSharp, "E", 4);
  assert.deepEqual(
    [patch.midi, patch.pitch.step, patch.pitch.alter],
    [64, "E", 0],
  );
  patch = move(
    { ...fSharp, id: "g", midi: 67, pitch: { step: "G", octave: 4, alter: 0 } },
    "F",
    4,
  );
  assert.deepEqual([patch.midi, patch.pitch.alter], [66, 1]);

  const cSharp = {
    id: "c",
    midi: 61,
    beat: 0,
    duration: 1,
    hand: "right",
    accidental: "sharp",
    pitch: { step: "C", octave: 4, alter: 1 },
  };
  patch = move(cSharp, "C", 4, 0, 200);
  assert.deepEqual(
    [patch.midi, patch.beat, patch.accidental],
    [61, 2, "sharp"],
  );
  patch = move(cSharp, "D", 4, 0);
  assert.deepEqual(
    [patch.midi, patch.pitch.alter, patch.accidental],
    [62, 0, undefined],
  );

  const evidence = {
    notes: [
      { noteId: "c", staff: 1, step: "C", octave: 4, alter: 1, printed: 1 },
    ],
  };
  applyWrittenGridPitch(evidence, { ...cSharp, ...patch });
  assert.deepEqual(
    [evidence.notes[0].step, evidence.notes[0].printed],
    ["D", null],
  );
  applyWrittenGridPitch(evidence, cSharp);
  assert.deepEqual(
    [evidence.notes[0].step, evidence.notes[0].printed],
    ["C", 1],
  );
});

test("source grid preserves leading rests and has a bounded fallback when original onset coordinates are unknown", () => {
  const { score, sourceRecord } = fixture(),
    system = savedScorePages(score, sourceRecord.notation)[0].systems[0],
    note = { id: "picked", midi: 72, beat: 1, duration: 1, hand: "right" };
  system.source.notes = [{ noteId: "picked", beat: 1, x: 300, y: 130 }];
  let grid = sourceGrid(system, system.source.staffLines);
  let target = snapStaffTarget({
    note,
    bar: grid.bar,
    staffs: grid.staffs,
    x: 300,
    y: 130,
    endBeat: 4,
  });
  assert.equal(target.patch.beat, 1);
  assert.equal(target.x, 300);
  system.source.notes = [];
  grid = sourceGrid(system, system.source.staffLines);
  target = snapStaffTarget({
    note,
    bar: grid.bar,
    staffs: grid.staffs,
    x: grid.bar.left,
    y: 130,
    endBeat: 4,
  });
  assert.equal(target.patch.beat, 0);
  assert.ok(target.x < grid.bar.right);
});
