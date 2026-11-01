import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Element } from "vexflow";
import { suggestPianoFingering } from "../lib/piano-fingering.mjs";
import { validateScore } from "../lib/score.mjs";
import { createNoteEditor } from "../lib/note-editor.mjs";
import { exportMusicXML } from "../lib/exporters.mjs";
import { importScore } from "../lib/importers.mjs";
import { fontsReady, renderNotation } from "../src/notation.js";
import { boot, until } from "./app-harness.mjs";

const note = (id, midi, beat, hand = "right", extra = {}) => ({
  id,
  midi,
  beat,
  hand,
  duration: 1,
  ...extra,
});
const score = (notes) =>
  validateScore({
    id: "finger-test",
    title: "指法测试",
    tempo: 90,
    timeSignature: [4, 4],
    durationBeats: 8,
    notes,
  });
const fingers = (map, ids) => ids.map((id) => map.get(id)?.finger);

test("suggestions use piano finger numbers for each hand and preserve explicit markings", () => {
  const pitches = [60, 62, 64, 65, 67];
  const notes = [
    ...pitches.map((midi, beat) => note(`r${beat}`, midi, beat)),
    ...pitches.map((midi, beat) => note(`l${beat}`, midi - 12, beat, "left")),
  ];
  const original = structuredClone(notes);
  const result = suggestPianoFingering(score(notes));
  assert.deepEqual(
    fingers(
      result,
      pitches.map((_, i) => `r${i}`),
    ),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    fingers(
      result,
      pitches.map((_, i) => `l${i}`),
    ),
    [5, 4, 3, 2, 1],
  );
  assert.deepEqual(notes, original, "suggestions do not alter the score");
  notes[0].finger = 4;
  assert.deepEqual(suggestPianoFingering(score(notes)).get("r0"), {
    finger: 4,
    source: "written",
  });
  for (const invalid of [0, 6, 1.5, "2", null])
    assert.throws(
      () => score([note("bad", 60, 0, "right", { finger: invalid })]),
      /指法/,
    );
});

test("chords, held notes, ties and ambiguous reaches never reuse a held finger", () => {
  const source = score([
    note("low", 60, 0, "right", { duration: 3, finger: 1 }),
    note("mid", 64, 0),
    note("high", 67, 0),
    note("held-neighbor", 62, 1),
    note("tie-a", 72, 4, "right", { tieTo: "tie-b" }),
    note("tie-b", 72, 5),
  ]);
  const result = suggestPianoFingering(source);
  const chord = fingers(result, ["low", "mid", "high"]);
  assert.ok(chord[0] < chord[1] && chord[1] < chord[2]);
  assert.notEqual(result.get("held-neighbor")?.finger, 1);
  assert.ok(result.has("tie-a"));
  assert.equal(
    result.has("tie-b"),
    false,
    "a tied continuation is not a new attack",
  );
  const tooWide = suggestPianoFingering(
    score([note("a", 48, 0, "right", { finger: 5 }), note("b", 72, 0)]),
  );
  assert.equal(tooWide.get("a").finger, 5);
  assert.equal(tooWide.has("b"), false);
  const impossible = suggestPianoFingering(
    score([
      note("a", 60, 0, "right", { duration: 2, finger: 5 }),
      note("b", 64, 1),
    ]),
  );
  assert.equal(
    impossible.has("b"),
    false,
    "do not invent an impossible finger while a key is held",
  );
  const tieChange = suggestPianoFingering(
    score([
      note("head", 60, 0, "right", { finger: 1, tieTo: "tail" }),
      note("tail", 60, 1, "right", { finger: 3, duration: 2 }),
      note("during", 64, 2),
    ]),
  );
  assert.equal(tieChange.get("tail").finger, 3);
  assert.equal(tieChange.has("during"), false);
});

test("manual and accepted fingerings survive editing, undo, JSON and MusicXML", async () => {
  const editor = createNoteEditor(
    score([
      note("a", 60, 0, "right", { finger: 3 }),
      note("b", 64, 1),
      note("c", 48, 0, "left", { finger: 5 }),
    ]),
  );
  assert.equal(editor.applySuggestedFingering(), 1);
  assert.equal(editor.score.notes.find((n) => n.id === "a").finger, 3);
  assert.ok(editor.score.notes.find((n) => n.id === "b").finger);
  editor.undo();
  assert.equal(editor.score.notes.find((n) => n.id === "b").finger, undefined);
  editor.redo();
  editor.update("b", { finger: 2 });
  const saved = editor.savedScore();
  const importedJSON = (
    await importScore(JSON.stringify(saved), "fingers.json")
  ).score;
  assert.equal(importedJSON.notes.find((n) => n.id === "b").finger, 2);
  const xml = exportMusicXML(saved);
  assert.match(xml, /<technical><fingering>3<\/fingering><\/technical>/);
  const importedXML = (await importScore(xml, "fingers.musicxml")).score;
  for (const n of saved.notes)
    assert.equal(
      importedXML.notes.find(
        (item) => item.midi === n.midi && item.beat === n.beat,
      ).finger,
      n.finger,
    );
  const complex = xml.replace(
    "<fingering>3</fingering>",
    "<fingering>3 2</fingering>",
  );
  const parsed = await importScore(complex, "complex.musicxml");
  assert.equal(parsed.score.notes.find((n) => n.midi === 60).finger, undefined);
  assert.ok(parsed.warnings.some((warning) => warning.includes("复杂")));
  const substitution = xml.replace(
    "<fingering>3</fingering>",
    '<fingering substitution="yes">3</fingering>',
  );
  const substitutionParsed = await importScore(
    substitution,
    "substitution.musicxml",
  );
  assert.equal(
    substitutionParsed.score.notes.find((n) => n.midi === 60).finger,
    undefined,
  );
  assert.ok(
    substitutionParsed.warnings.some((warning) => warning.includes("复杂")),
  );
});

test("staff and numbered notation show the same per-note digits once, and respect the visibility switch", async () => {
  await fontsReady;
  const dom = new JSDOM('<div id="host"></div>');
  const keys = ["document", "window", "cancelAnimationFrame"];
  const saved = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const canvas = Element.getTextMeasurementCanvas();
  let renderer;
  try {
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    globalThis.cancelAnimationFrame = () => {};
    dom.window.HTMLCanvasElement.prototype.getContext = () => ({
      font: "",
      measureText: (s) => ({
        width: String(s).length * 8,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      }),
    });
    Element.setTextMeasurementCanvas(document.createElement("canvas"));
    const host = document.querySelector("#host");
    Object.defineProperty(host, "clientWidth", { value: 360 });
    const piece = score([
      note("long", 60, 0, "right", { duration: 6, finger: 2 }),
      note("chord", 64, 0, "right", { finger: 4 }),
      note("bass", 48, 0, "left", { finger: 5 }),
      note("new", 67, 6),
    ]);
    const observed = [];
    for (const mode of ["staff", "numbered"]) {
      renderer = renderNotation(host, piece, {
        mode,
        autoScroll: false,
        renderAll: true,
      });
      assert.equal(host.querySelectorAll(".notation-error").length, 0);
      const marks = [...host.querySelectorAll(".notation-fingering")];
      assert.equal(
        marks.filter((el) => el.dataset.noteId === "long").length,
        1,
      );
      observed.push(
        marks
          .map((el) => [
            el.dataset.noteId,
            el.dataset.finger,
            el.dataset.source,
          ])
          .sort(),
      );
      assert.match(
        host.querySelector(".notation-hit").getAttribute("aria-label"),
        /指/,
      );
      renderer.destroy();
      renderer = renderNotation(host, piece, {
        mode,
        autoScroll: false,
        renderAll: true,
        showFingering: false,
      });
      assert.equal(host.querySelectorAll(".notation-fingering").length, 0);
      renderer.destroy();
    }
    assert.deepEqual(observed[0], observed[1]);
    assert.deepEqual(
      observed[0].find(([id]) => id === "long"),
      ["long", "2", "written"],
    );
  } finally {
    renderer?.destroy();
    Element.setTextMeasurementCanvas(canvas);
    for (const key of keys)
      saved[key] === undefined
        ? delete globalThis[key]
        : (globalThis[key] = saved[key]);
    dom.window.close();
  }
});

test("the editor lets a player correct and save individual fingers or accept suggestions", async () => {
  await fontsReady;
  const dom = new JSDOM('<div id="host"></div>', { pretendToBeVisual: true });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    font: "",
    measureText: (s) => ({
      width: String(s).length * 8,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
    }),
  });
  const keys = [
    "document",
    "window",
    "HTMLElement",
    "SVGElement",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, globalThis[key]]),
  );
  for (const key of keys)
    globalThis[key] = key.includes("AnimationFrame")
      ? dom.window[key].bind(dom.window)
      : dom.window[key];
  let dispose, saved;
  try {
    const { mountNoteEditor } = await import("../src/note-editor.js");
    const host = document.querySelector("#host");
    dispose = mountNoteEditor(
      host,
      score([note("a", 60, 0), note("b", 62, 1)]),
      {
        onSave: (value) => {
          saved = value;
        },
      },
    );
    const select = host.querySelector("[data-finger-select]");
    select.value = "4";
    select.dispatchEvent(new dom.window.Event("change"));
    assert.equal(host.querySelector("[data-finger-select]").value, "4");
    host.querySelector("[data-apply-fingering]").click();
    assert.match(
      host.querySelector("[data-edit-notice]").textContent,
      /1 个自动指法/,
    );
    host.querySelector("[data-save]").click();
    assert.equal(saved.notes.find((n) => n.id === "a").finger, 4);
    assert.ok(saved.notes.find((n) => n.id === "b").finger);
  } finally {
    dispose?.();
    dom.window.close();
    for (const key of keys)
      previous[key] === undefined
        ? delete globalThis[key]
        : (globalThis[key] = previous[key]);
  }
});

test("the practice room persists its fingering toggle across notation modes", async (t) => {
  const { w, doc } = await boot(t, { staticSite: true });
  await until(
    () => doc.querySelector(".notation-fingering"),
    "五线谱应显示指法",
  );
  const toggle = doc.querySelector("#show-fingering");
  assert.equal(toggle.checked, true);
  toggle.checked = false;
  toggle.dispatchEvent(new w.Event("change"));
  assert.equal(doc.querySelectorAll(".notation-fingering").length, 0);
  assert.equal(w.localStorage.getItem("qinban-show-fingering"), "false");
  doc.querySelector('[data-mode="numbered"]').click();
  assert.equal(doc.querySelectorAll(".notation-fingering").length, 0);
  const newToggle = doc.querySelector("#show-fingering");
  newToggle.checked = true;
  newToggle.dispatchEvent(new w.Event("change"));
  assert.ok(doc.querySelectorAll(".notation-fingering").length > 0);
  // Let startup IndexedDB jobs finish before the test tears down the window.
  await new Promise((resolve) => setTimeout(resolve, 100));
});
