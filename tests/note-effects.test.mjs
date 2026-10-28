import test from "node:test";
import assert from "node:assert/strict";
import MidiPackage from "@tonejs/midi/build/Midi.js";
import { validateScore } from "../lib/score.mjs";
import { createNoteEditor } from "../lib/note-editor.mjs";
import {
  performanceNotes,
  ornamentNeighbor,
  ornamentAccidental,
} from "../lib/note-effects.mjs";
import { exportMidi, exportMusicXML } from "../lib/exporters.mjs";
import { importScore } from "../lib/importers.mjs";
import { parseTempoInput } from "../lib/tempo.mjs";
const { Midi } = MidiPackage;
const n = (id, beat, midi = 60, extra = {}) => ({
  id,
  beat,
  midi,
  duration: 1,
  hand: "right",
  velocity: 0.7,
  ...extra,
});
const score = (notes) =>
  validateScore({
    id: "expression-test",
    title: "演奏效果",
    tempo: 120,
    timeSignature: [4, 4],
    durationBeats: 8,
    notes,
  });

test("BPM input accepts the full supported range and rejects blank, fractional and invalid text", () => {
  for (const v of ["20", " 92 ", 300])
    assert.equal(parseTempoInput(v), Number(v));
  for (const v of ["", " ", "NaN", "92.5", 19, 301, Infinity])
    assert.throws(() => parseTempoInput(v), /20–300/);
});
test("ties merge only adjacent same-pitch attacks and keep the written heads editable", () => {
  const editor = createNoteEditor(score([n("a", 0), n("b", 1), n("c", 2)]));
  editor.toggleTie("a");
  editor.toggleTie("b");
  assert.equal(editor.score.notes.length, 3);
  assert.deepEqual(
    performanceNotes(editor.score).map((n) => [
      n.midi,
      n.beat,
      n.duration,
      n.sourceIds,
    ]),
    [[60, 0, 3, ["a", "b", "c"]]],
  );
  editor.update("b", { midi: 62 });
  assert.equal(
    editor.score.notes.some((n) => n.tieTo),
    false,
  );
  editor.undo();
  assert.equal(performanceNotes(editor.savedScore()).length, 1);
  editor.remove("b");
  assert.equal(
    editor.score.notes.some((n) => n.tieTo),
    false,
  );
  assert.throws(
    () => score([n("a", 0, 60, { tieTo: "b" }), n("b", 1, 62)]),
    /延音线/,
  );
  assert.throws(
    () =>
      score([
        n("a", 0, 60, { voice: "1", tieTo: "b" }),
        n("b", 1, 60, { voice: "2" }),
      ]),
    /延音线/,
  );
});
test("dynamics and accent alter real velocities; staccato releases early without changing the score clock", () => {
  const editor = createNoteEditor(score([n("a", 0)]));
  editor.setDynamic("a", "pp");
  assert.equal(performanceNotes(editor.score)[0].velocity, 0.28);
  editor.setDynamic("a", "f");
  editor.update("a", { accent: "accent", articulation: "staccato" });
  const sound = performanceNotes(editor.score)[0];
  assert.equal(sound.velocity, 1);
  assert.equal(sound.duration, 0.45);
  assert.equal(editor.score.notes[0].duration, 1);
  assert.equal(editor.score.durationBeats, 8);
  const reopened = createNoteEditor(
    JSON.parse(JSON.stringify(editor.savedScore())),
  );
  assert.equal(reopened.score.notes[0].dynamic, "f");
  reopened.clearEffects("a");
  assert.equal(performanceNotes(reopened.score)[0].duration, 1);
});
test("arpeggio applies to a whole chord, follows its direction, preserves release and leaves the other hand unchanged", () => {
  const editor = createNoteEditor(
    score([
      n("a", 0, 60),
      n("b", 0, 64),
      n("c", 0, 67),
      n("l", 0, 48, { hand: "left" }),
    ]),
  );
  editor.setArpeggio("b", "up");
  let sounds = performanceNotes(editor.score);
  assert.deepEqual(
    sounds.filter((n) => n.hand === "right").map((n) => [n.midi, n.beat]),
    [
      [60, 0],
      [64, 0.12],
      [67, 0.24],
    ],
  );
  assert.ok(sounds.every((n) => Math.abs(n.beat + n.duration - 1) < 1e-9));
  editor.setArpeggio("b", "down");
  sounds = performanceNotes(editor.score);
  assert.deepEqual(
    sounds.filter((n) => n.hand === "right").map((n) => n.midi),
    [67, 64, 60],
  );
  assert.equal(sounds.find((n) => n.hand === "left").beat, 0);
  editor.clearEffects("b");
  assert.equal(
    editor.score.notes.some((n) => n.arpeggio),
    false,
  );
  assert.throws(
    () => createNoteEditor(score([n("solo", 0)])).setArpeggio("solo", "up"),
    /两个/,
  );
});
test("ornaments alternate with key-aware neighbors or an explicit interval and retain their exact total span", () => {
  assert.equal(
    ornamentNeighbor(n("f", 0, 65, { ornament: "trill" }), 1),
    67,
    "F natural in G major moves to G",
  );
  assert.equal(
    ornamentNeighbor(n("e", 0, 64, { ornament: "trill" }), 0),
    65,
    "E to F is a semitone",
  );
  assert.equal(
    ornamentAccidental(
      n("c", 0, 60, { ornament: "trill", ornamentInterval: 1 }),
      0,
    ),
    "b",
    "C trill with a semitone auxiliary is written with D flat",
  );
  assert.equal(
    ornamentAccidental(
      n("e", 0, 64, { ornament: "trill", ornamentInterval: 2 }),
      0,
    ),
    "#",
  );
  const trill = performanceNotes(score([n("a", 0, 64, { ornament: "trill" })]));
  assert.equal(trill.length, 8);
  assert.deepEqual(
    trill.map((n) => n.midi),
    [64, 65, 64, 65, 64, 65, 64, 65],
  );
  const mordent = performanceNotes(
    score([n("a", 0, 60, { ornament: "mordent-lower", ornamentInterval: 1 })]),
  );
  assert.deepEqual(
    mordent.map((n) => n.midi),
    [60, 59, 60],
  );
  assert.equal(mordent.at(-1).beat + mordent.at(-1).duration, 1);
  assert.throws(
    () => score([n("edge", 0, 108, { ornament: "trill" })]),
    /88 键/,
  );
  assert.throws(() => score([n("a", 0, 60, { ornament: "random" })]), /无效/);
});
test("MIDI carries the heard attacks while MusicXML and JSON preserve editable notation and explicit ties", async () => {
  const written = score([
    n("a", 0, 60, { tieTo: "b", dynamic: "pp", velocity: 0.28 }),
    n("b", 1),
    n("tr", 2, 64, {
      ornament: "trill",
      ornamentInterval: 2,
      accent: "marcato",
    }),
    n("s", 4, 67, { articulation: "staccato" }),
  ]);
  written.tempo = 300;
  const midi = new Midi(exportMidi(written)),
    attacks = midi.tracks.flatMap((t) => t.notes);
  assert.equal(midi.header.tempos[0].bpm, 300);
  assert.equal(attacks.length, performanceNotes(written).length);
  assert.equal(
    attacks.find((n) => n.midi === 60).durationTicks / midi.header.ppq,
    2,
  );
  assert.ok(
    Math.abs(
      attacks.find((n) => n.midi === 67).durationTicks / midi.header.ppq - 0.45,
    ) <
      1 / midi.header.ppq,
  );
  const xml = exportMusicXML(written);
  assert.match(xml, /<trill-mark\/>/);
  assert.match(xml, /<strong-accent/);
  assert.match(xml, /<staccato\/>/);
  const imported = (await importScore(xml, "effects.musicxml")).score;
  assert.equal(imported.notes.length, written.notes.length);
  for (const expected of written.notes) {
    const actual = imported.notes.find((n) => n.id === expected.id);
    assert.ok(actual);
    for (const key of [
      "midi",
      "beat",
      "duration",
      "tieTo",
      "dynamic",
      "ornament",
      "ornamentInterval",
      "accent",
      "articulation",
      "velocity",
    ])
      assert.equal(actual[key], expected[key], key);
  }
  assert.deepEqual(
    performanceNotes(imported).map((n) => [
      n.midi,
      n.beat,
      n.duration,
      n.velocity,
    ]),
    performanceNotes(written).map((n) => [
      n.midi,
      n.beat,
      n.duration,
      n.velocity,
    ]),
  );
});
