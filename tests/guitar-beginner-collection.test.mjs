import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { guitarBeginnerBundle } from "../lib/guitar-beginner-collection.mjs";
import { guitarTabNotes, GUITAR_TUNING } from "../lib/guitar.mjs";
import {
  validateCloudBundle,
  cloudEntry,
} from "../lib/cloud-library-format.mjs";
import { readScoreDocument, toPracticeScore } from "../lib/score-document.ts";
import { importScore } from "../lib/importers.mjs";
import { createPerformanceTimeline } from "../lib/score-representations.ts";
import { searchCloudScores } from "../lib/library-search.mjs";
import { createLibraryPanel } from "../src/library-panel.js";
import { renderGuitarTab } from "../src/guitar-notation.js";

const root = new URL("../", import.meta.url);
const json = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const collection = await json("public/guitar-beginner-sources/collection.json");
const index = await json("public/cloud-library/index.json");

test("eight first-position guitar editions keep metadata, accurate manifests, and playable complete bars", async () => {
  const manifest = await json("public/guitar-beginner-sources/manifest.json");
  assert.equal(collection.scores.length, 8);
  assert.equal(new Set(collection.scores.map((s) => s.id)).size, 8);
  assert.equal(
    collection.scores.filter((s) => s.kind === "original").length,
    4,
  );
  for (const edition of collection.scores) {
    const text = await readFile(
      new URL(`public/cloud-library/scores/${edition.id}.json`, root),
      "utf8",
    );
    const bundle = validateCloudBundle(JSON.parse(text));
    assert.deepEqual(
      bundle,
      guitarBeginnerBundle(edition),
      edition.id + " deterministic edition",
    );
    assert.equal(bundle.score.instrument, "guitar");
    assert.deepEqual(bundle.document.timeSignature, [4, 4]);
    assert.equal(bundle.score.durationBeats, edition.bars.length * 4);
    assert.ok(
      bundle.document.notes.every(
        (n) => n.pitch && n.rhythm && n.staff === 1 && n.voice === "1",
      ),
    );
    assert.equal(
      toPracticeScore(readScoreDocument(bundle.document)).instrument,
      "guitar",
    );
    assert.deepEqual(
      index.scores.find((s) => s.id === edition.id),
      cloudEntry(bundle),
    );
    assert.equal(
      manifest.scores.find((s) => s.id === edition.id).sha256,
      createHash("sha256").update(text).digest("hex"),
    );
    assert.ok(bundle.score.source.license.includes("CC0"));
    assert.match(bundle.score.source.url, /^https:\/\//);
    const tab = guitarTabNotes(bundle.score);
    for (const n of tab) {
      assert.ok(
        n.fingering && n.fingering.fret <= 3,
        edition.id + " first-position fingering",
      );
      assert.equal(
        GUITAR_TUNING[n.fingering.string - 1] + n.fingering.fret,
        n.midi,
      );
    }
    const timeline = createPerformanceTimeline(bundle.document);
    assert.equal(timeline.notes.length, bundle.score.notes.length);
    assert.ok(
      Math.abs(
        timeline.timing.durationSeconds -
          (bundle.score.durationBeats * 60) / edition.tempo,
      ) < 1e-7,
    );
    assert.ok(
      timeline.timing.durationSeconds >= 12 &&
        timeline.timing.durationSeconds <= 35,
    );
  }
  const guitarEntries = searchCloudScores(
    index.scores.filter((s) => s.instrument === "guitar"),
    "吉他入门",
  );
  assert.equal(guitarEntries.length, 8);
});

test("traditional melodies retain known phrases and taught note values", () => {
  const make = (name) =>
    guitarBeginnerBundle(collection.scores.find((s) => s.id.endsWith(name)))
      .score;
  const twinkle = make("twinkle");
  assert.deepEqual(
    twinkle.notes.slice(0, 7).map((n) => [n.midi, n.duration]),
    [
      [48, 1],
      [48, 1],
      [55, 1],
      [55, 1],
      [57, 1],
      [57, 1],
      [55, 2],
    ],
  );
  assert.equal(twinkle.durationBeats, 48);
  const ode = make("ode-to-joy");
  assert.deepEqual(
    ode.notes.slice(0, 8).map((n) => n.midi),
    [64, 64, 65, 67, 67, 65, 64, 62],
  );
  assert.deepEqual(
    ode.notes.filter((n) => n.beat >= 12 && n.beat < 16).map((n) => n.duration),
    [1.5, 0.5, 2],
  );
  assert.equal(ode.notes.at(-1).midi, 60);
  const jacques = make("frere-jacques");
  assert.deepEqual(
    jacques.notes
      .filter((n) => n.beat >= 16 && n.beat < 20)
      .map((n) => [n.midi, n.duration]),
    [
      [55, 0.5],
      [57, 0.5],
      [55, 0.5],
      [53, 0.5],
      [52, 1],
      [48, 1],
    ],
  );
  const open = make("open-strings");
  assert.ok(open.notes.every((n) => GUITAR_TUNING.includes(n.midi)));
  assert.ok(guitarTabNotes(open).every((n) => n.fingering.fret === 0));
});

test("downloadable guitar MIDI and MusicXML retain every pitch, onset and written duration", async () => {
  for (const edition of collection.scores) {
    const expected = guitarBeginnerBundle(edition).score;
    for (const ext of ["mid", "musicxml"]) {
      const bytes = await readFile(
        new URL(`public/guitar-beginner-sources/${edition.id}.${ext}`, root),
      );
      const actual = (await importScore(bytes, edition.id + "." + ext)).score;
      assert.equal(actual.instrument, "guitar");
      assert.equal(actual.notes.length, expected.notes.length);
      assert.equal(actual.durationBeats, expected.durationBeats);
      actual.notes.forEach((n, i) => {
        assert.equal(n.midi, expected.notes[i].midi, edition.id);
        assert.ok(Math.abs(n.beat - expected.notes[i].beat) < 1e-6, edition.id);
        assert.ok(
          Math.abs(n.duration - expected.notes[i].duration) < 1e-6,
          edition.id,
        );
      });
    }
  }
});

test("all eight cloud editions render every note with no unassignable fingering and are discoverable through the guitar shortcut", () => {
  const dom = new JSDOM('<div id="app"></div>'),
    previous = globalThis.document;
  try {
    globalThis.document = dom.window.document;
    const host = document.querySelector("#app");
    for (const edition of collection.scores) {
      const score = guitarBeginnerBundle(edition).score;
      const renderer = renderGuitarTab(host, score, { autoScroll: false });
      assert.equal(
        host.querySelectorAll("[data-note-id]").length,
        score.notes.length,
      );
      assert.equal(
        host.querySelectorAll(".guitar-tab-system").length,
        edition.bars.length,
      );
      assert.equal(host.querySelectorAll('[aria-label*="无法分配"]').length, 0);
      renderer.setBeat(score.durationBeats);
      renderer.destroy();
    }
    const state = {
      section: "guitar",
      libraryTab: "cloud",
      cloudScores: index.scores,
      cloudLoaded: true,
      score: guitarBeginnerBundle(collection.scores[0]).score,
      tempo: 72,
    };
    let renders = 0;
    const panel = createLibraryPanel({
      state,
      client: { scores: [], warnings: [] },
      capabilities: { mode: "browser" },
      render: () => {
        renders++;
      },
    });
    host.innerHTML = panel.libraryView();
    panel.bindLibrary();
    host.querySelector("[data-guitar-beginners]").click();
    assert.equal(state.cloudLibraryQuery, "吉他入门");
    assert.equal(renders, 1);
    host.innerHTML = panel.libraryView();
    assert.equal(host.querySelectorAll("[data-cloud-download]").length, 8);
    assert.ok(
      [...host.querySelectorAll("[data-cloud-download]")].every((b) =>
        b.dataset.cloudDownload.startsWith("guitar-beginner-"),
      ),
    );
    state.section = "piano";
    assert.doesNotMatch(
      panel.libraryView(),
      /data-guitar-beginners|guitar-beginner-/,
    );
  } finally {
    globalThis.document = previous;
    dom.window.close();
  }
});

test("invalid bars and non-beginner register cannot be published as beginner editions", () => {
  const edition = collection.scores[0];
  assert.throws(
    () => guitarBeginnerBundle({ ...edition, bars: ["E4 E4 E4"] }),
    /必须是4拍/,
  );
  assert.throws(
    () => guitarBeginnerBundle({ ...edition, bars: ["B4:4"] }),
    /0–3品/,
  );
});
