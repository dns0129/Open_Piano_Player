import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import MidiPackage from "@tonejs/midi/build/Midi.js";
import { validateScore } from "../lib/score.mjs";
import { exportMidi } from "../lib/exporters.mjs";
import { importScore } from "../lib/importers.mjs";
import { bumblebeeYeungScore } from "../lib/scores/bumblebee-yeung.mjs";

const { Midi } = MidiPackage;
const tuples = (score) =>
  score.notes
    .map((note) =>
      JSON.stringify([note.beat, note.duration, note.midi, note.hand]),
    )
    .sort();
const output = (extension) =>
  new URL(
    `../output/scores/野蜂飞舞-Yeung-完整7页.${extension}`,
    import.meta.url,
  );

test("complete Yeung edition is a standard score with preserved attribution and terminal rest", () => {
  const score = validateScore(bumblebeeYeungScore);
  assert.deepEqual(score, bumblebeeYeungScore);
  assert.equal(score.id, "bumblebee-yeung-complete");
  assert.equal(score.notes.length, 1313);
  assert.equal(new Set(score.notes.map((note) => note.id)).size, 1313);
  assert.deepEqual(score.timeSignature, [2, 4]);
  assert.equal(score.durationBeats / 2, 105);
  assert.equal(score.durationBeats, 210);
  assert.equal(
    Math.max(...score.notes.map((note) => note.beat + note.duration)),
    209,
  );
  assert.equal(score.source.kind, "pdf-transcription-checked");
  assert.match(score.source.label, /Kevin W\. K\. Yeung/);
  assert.match(score.source.license, /CC BY-SA 3\.0/);
  assert.match(score.source.license, /Non-PD US/);
  assert.equal(
    score.source.url,
    "https://imslp.org/wiki/File:PMLP03170-Flight_of_the_Bumblebee_--_for_Piano_Solo_(Yeung).pdf",
  );
});

for (const extension of ["score.json", "mid", "musicxml"]) {
  test(`actual complete ${extension} export roundtrips all 1313 performed note events and 210 beats`, async () => {
    const bytes = await readFile(output(extension));
    const { score } = await importScore(
      bytes,
      `野蜂飞舞-Yeung-完整7页.${extension}`,
    );
    assert.equal(score.notes.length, 1313);
    assert.deepEqual(tuples(score), tuples(bumblebeeYeungScore));
    assert.equal(score.durationBeats, 210);
    assert.deepEqual(score.timeSignature, [2, 4]);
    assert.ok(
      Math.abs(score.tempo - 185) < 0.001,
      "SMF integer microseconds may quantize the tempo",
    );
    if (extension === "score.json")
      assert.deepEqual(score, bumblebeeYeungScore);
    if (extension === "musicxml") {
      const xml = bytes.toString("utf8");
      assert.equal((xml.match(/<measure number=/g) || []).length, 105);
      assert.match(xml, /CC BY-SA 3\.0/);
      assert.match(xml, /Non-PD US/);
      assert.match(xml, /Kevin W\. K\. Yeung/);
    }
  });
}

test("MIDI end-of-track preserves trailing written silence without synthetic notes", async () => {
  const original = validateScore({
    id: "trailing-rest-regression",
    title: "Two bars with final rests",
    tempo: 120,
    timeSignature: [4, 4],
    durationBeats: 8,
    notes: [
      { id: "rh", beat: 0.5, duration: 0.5, midi: 76, hand: "right" },
      { id: "lh", beat: 1.25, duration: 0.5, midi: 48, hand: "left" },
    ],
  });
  const bytes = exportMidi(original);
  const parsed = new Midi(bytes);
  assert.equal(
    parsed.tracks.reduce((count, track) => count + track.notes.length, 0),
    2,
  );
  assert.ok(
    parsed.tracks.every(
      (track) => track.endOfTrackTicks === 8 * parsed.header.ppq,
    ),
  );
  const { score } = await importScore(bytes, "two-bars.mid");
  assert.equal(score.durationBeats, 8);
  assert.deepEqual(tuples(score), tuples(original));
});
