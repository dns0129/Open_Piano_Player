import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import MidiPackage from "@tonejs/midi/build/Midi.js";
import {
  guitarStarterScore,
  guitarTabNotes,
  guitarPositions,
  GUITAR_TUNING,
} from "../lib/guitar.mjs";
import { guitarWaveform } from "../lib/guitar-voice.mjs";
import {
  scoreSection,
  sectionInstruments,
  sectionKey,
} from "../lib/instrument-sections.mjs";
import { validateScore, transposeScore } from "../lib/score.mjs";
import { readScoreDocument, toPracticeScore } from "../lib/score-document.ts";
import { createLibraryStore } from "../lib/library-store.mjs";
import {
  cloudEntry,
  validateCloudBundle,
} from "../lib/cloud-library-format.mjs";
import { exportMidi, exportMusicXML } from "../lib/exporters.mjs";
import { importScore } from "../lib/importers.mjs";
import { createNoteEditor } from "../lib/note-editor.mjs";
import { renderGuitarTab } from "../src/guitar-notation.js";
import { PianoPlayer } from "../src/audio.js";
import { createLibraryPanel } from "../src/library-panel.js";
const { Midi } = MidiPackage;

test("local and cloud library views isolate guitar scores from legacy piano scores", () => {
  const scores = [
    { ...guitarStarterScore, title: "GUITAR_ONLY" },
    {
      ...guitarStarterScore,
      instrument: undefined,
      id: "old-piano",
      title: "PIANO_ONLY",
    },
  ];
  const state = {
    section: "guitar",
    libraryTab: "local",
    score: scores[0],
    tempo: 84,
    cloudScores: scores.map((s) => ({ ...s, notes: s.notes.length })),
    cloudLibraryQuery: "ONLY",
    cloudLoaded: true,
  };
  const panel = createLibraryPanel({
    state,
    client: { scores, warnings: [] },
    capabilities: { mode: "browser" },
    starterScore: scores[1],
    keyName: () => "C",
  });
  assert.deepEqual(
    panel.availableScores().map((s) => s.id),
    [guitarStarterScore.id],
  );
  assert.doesNotMatch(panel.libraryView(), /PIANO_ONLY/);
  state.libraryTab = "cloud";
  assert.doesNotMatch(panel.libraryView(), /PIANO_ONLY/);
  assert.match(panel.libraryView(), /GUITAR_ONLY/);
  state.section = "piano";
  assert.match(panel.libraryView(), /PIANO_ONLY/);
  assert.doesNotMatch(panel.libraryView(), /GUITAR_ONLY/);
});

test("guitar identity survives document migration, transposition, editing, disk reopen and backup restore", async (t) => {
  const score = validateScore(guitarStarterScore);
  assert.equal(toPracticeScore(readScoreDocument(score)).instrument, "guitar");
  assert.equal(transposeScore(score, 1).instrument, "guitar");
  const editor = createNoteEditor(score);
  editor.update(score.notes[0].id, { midi: 49 });
  assert.equal(editor.savedScore().instrument, "guitar");
  const directory = await mkdtemp(join(tmpdir(), "qinban-guitar-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createLibraryStore({ directory });
  await store.save({ score });
  const reopened = createLibraryStore({ directory });
  assert.equal((await reopened.get(score.id)).score.instrument, "guitar");
  assert.equal(
    (await reopened.list()).records[0].document.instrument,
    "guitar",
  );
  const backup = await reopened.backup();
  const restored = createLibraryStore({
    directory: join(directory, "restored"),
  });
  await restored.restore(backup);
  assert.equal((await restored.get(score.id)).score.instrument, "guitar");
  assert.equal(cloudEntry(validateCloudBundle({ score })).instrument, "guitar");
  assert.equal(scoreSection({ title: "old piano score" }), "piano");
  assert.equal(sectionInstruments("guitar").length, 1);
  assert.ok(!sectionInstruments("piano").some((p) => p.id === "nylon-guitar"));
  assert.notEqual(
    sectionKey("qinban-active-score", "piano"),
    sectionKey("qinban-active-score", "guitar"),
  );
  assert.throws(() => validateScore({ ...score, instrument: "banjo" }), /乐器/);
});

test("guitar MIDI and MusicXML export/reimport retain sounding pitch and instrument", async () => {
  const score = validateScore(guitarStarterScore);
  const bytes = exportMidi(score),
    midi = new Midi(bytes);
  assert.equal(midi.tracks.length, 1);
  assert.equal(midi.tracks[0].instrument.number, 24);
  const xml = exportMusicXML(score);
  assert.match(xml, /<part-name>Guitar<\/part-name>/);
  assert.match(xml, /<staves>1<\/staves>/);
  assert.doesNotMatch(xml, /<sign>F<\/sign>/);
  for (const [data, name] of [
    [bytes, "guitar.mid"],
    [xml, "guitar.musicxml"],
    [JSON.stringify(readScoreDocument(score)), "guitar.json"],
  ]) {
    const imported = (await importScore(data, name)).score;
    assert.equal(imported.instrument, "guitar", name);
    assert.deepEqual(
      imported.notes.map((n) => n.midi),
      score.notes.map((n) => n.midi),
      name,
    );
    assert.equal(imported.durationBeats, score.durationBeats, name);
  }
});

test("automatic guitar fingering preserves pitches, reserves sustained strings and marks impossible notes", () => {
  const demo = guitarTabNotes(guitarStarterScore);
  assert.ok(demo.every((n) => n.fingering));
  for (const n of demo)
    assert.equal(
      GUITAR_TUNING[n.fingering.string - 1] + n.fingering.fret,
      n.midi,
    );
  assert.deepEqual(guitarPositions(39), []);
  const chord = guitarTabNotes({
    notes: [40, 45, 50, 55, 59, 64].map((midi, i) => ({
      id: `${i}`,
      midi,
      beat: 0,
      duration: 4,
    })),
  });
  assert.equal(new Set(chord.map((n) => n.fingering?.string)).size, 6);
  const overlap = guitarTabNotes({
    notes: [
      { id: "a", midi: 40, beat: 0, duration: 8 },
      { id: "b", midi: 41, beat: 4, duration: 1 },
      { id: "c", midi: 100, beat: 5, duration: 1 },
    ],
  });
  assert.equal(overlap[1].fingering, null);
  assert.equal(overlap[2].fingering, null);
  assert.deepEqual(
    overlap.map((n) => n.midi),
    [40, 41, 100],
  );
});

test("guitar tab keeps every note and precise seek positions, including unsupported pitches", () => {
  const dom = new JSDOM('<div id="host"></div>');
  const previous = globalThis.document;
  let renderer;
  try {
    globalThis.document = dom.window.document;
    const score = validateScore({
      ...guitarStarterScore,
      notes: [
        ...guitarStarterScore.notes,
        { id: "unsupported", midi: 100, beat: 0, duration: 1, hand: "right" },
      ],
    });
    let seek;
    const host = document.querySelector("#host");
    renderer = renderGuitarTab(host, score, {
      autoScroll: false,
      onSeek: (beat) => {
        seek = beat;
      },
    });
    assert.equal(
      host.querySelectorAll("[data-note-id]").length,
      score.notes.length,
    );
    assert.equal(host.querySelectorAll(".notation-system>svg").length, 8);
    assert.match(
      host
        .querySelector('[data-note-id="unsupported"]')
        .getAttribute("aria-label"),
      /无法分配/,
    );
    host
      .querySelector('[data-note-id="guitar-first-3"]')
      .dispatchEvent(new dom.window.MouseEvent("click"));
    assert.equal(seek, 1.5);
    renderer.setBeat(1.5);
    assert.equal(
      host
        .querySelector('[data-note-id="guitar-first-3"] rect')
        .getAttribute("fill"),
      "#c9e2bf",
    );
  } finally {
    renderer?.destroy();
    globalThis.document = previous;
    dom.window.close();
  }
});

test("nylon synthesis is tuned, decays naturally, and has bounded finite output", () => {
  const sr = 24000,
    data = guitarWaveform(64, sr),
    expected = 440 * 2 ** ((64 - 69) / 12);
  assert.ok(data.every(Number.isFinite));
  assert.ok(Math.max(...data.subarray(0, sr)) < 1);
  const rms = (start) =>
    Math.sqrt(
      data.subarray(start, start + sr / 5).reduce((s, n) => s + n * n, 0) /
        (sr / 5),
    );
  assert.ok(rms(sr * 3) < rms(sr / 10) * 0.3);
  let bestLag = 0,
    best = -Infinity;
  for (
    let lag = Math.floor(sr / expected) - 3;
    lag <= Math.ceil(sr / expected) + 3;
    lag++
  ) {
    let sum = 0;
    for (let i = sr / 10; i < sr / 5; i++) sum += data[i] * data[i + lag];
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  assert.ok(Math.abs(sr / bestLag / expected - 1) < 0.015);
});

test("guitar transport uses generated buffers, cancels voices and switches independently to piano synth", async () => {
  class Param {
    value = 0;
    setValueAtTime(v) {
      this.value = v;
    }
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
    cancelScheduledValues() {}
    setTargetAtTime() {}
  }
  class Node {
    gain = new Param();
    frequency = new Param();
    detune = new Param();
    threshold = new Param();
    knee = new Param();
    ratio = new Param();
    attack = new Param();
    release = new Param();
    stops = [];
    connect() {}
    disconnect() {}
    start(time, offset) {
      this.started = time;
      this.offset = offset;
    }
    stop(time) {
      this.stops.push(time);
    }
  }
  const sources = [],
    oscillators = [];
  const ctx = {
    sampleRate: 24000,
    currentTime: 0,
    destination: {},
    resume: async () => {},
    close: async () => {},
    createGain: () => new Node(),
    createDynamicsCompressor: () => new Node(),
    createBuffer: (channels, length, sampleRate) => {
      const data = new Float32Array(length);
      return { duration: length / sampleRate, getChannelData: () => data };
    },
    createBufferSource: () => {
      const n = new Node();
      sources.push(n);
      return n;
    },
    createOscillator: () => {
      const n = new Node();
      oscillators.push(n);
      return n;
    },
  };
  const player = new PianoPlayer({
    instrument: "nylon-guitar",
    audioContextFactory: () => ctx,
    requestFrame: () => 1,
    cancelFrame: () => {},
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  player.setScore(guitarStarterScore);
  await player.play();
  assert.equal(player.instrumentState.engine, "pluck");
  assert.ok(sources.length);
  assert.equal(oscillators.length, 0);
  assert.ok(
    sources[0].buffer.getChannelData(0).some((n) => Math.abs(n) > 0.01),
  );
  player.seek(1);
  player.pause();
  assert.ok(sources.every((n) => n.stops.at(-1) <= 0.015));
  const beat = player.beat;
  await player.setInstrument("synth");
  assert.equal(player.beat, beat);
  await player.notePreview(60);
  assert.ok(oscillators.length);
  await player.setInstrument("nylon-guitar");
  assert.equal(player.instrument, "nylon-guitar");
  await player.dispose();
});
