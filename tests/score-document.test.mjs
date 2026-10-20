import test from "node:test";
import assert from "node:assert/strict";
import {
  migrateScoreV1,
  readScoreDocument,
  validateScoreDocument,
  toPracticeScore,
} from "../lib/score-document.ts";
import {
  createDisplayRepresentation,
  createPerformanceTimeline,
} from "../lib/score-representations.ts";
import { importMusicXML } from "../lib/importers.mjs";
import { exportMusicXML } from "../lib/exporters.mjs";
import { createNoteEditor } from "../lib/note-editor.mjs";
import { transposeScore } from "../lib/score.mjs";
const raw = () => ({
  version: 1,
  id: "original",
  title: "文档测试",
  tempo: 120,
  keySignature: 0,
  timeSignature: [4, 4],
  durationBeats: 4,
  notes: [
    { id: "a", midi: 61, beat: 0, duration: 1, hand: "right" },
    { id: "b", midi: 48, beat: 2, duration: 1, hand: "left" },
  ],
});
const xml =
  '<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes><note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><voice>lead</voice><staff>1</staff></note><note><pitch><step>D</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><accidental>flat</accidental><voice>lead</voice><staff>1</staff></note><note><rest/><duration>2</duration><voice>lead</voice><staff>1</staff></note></measure><measure number="2"><attributes><key><fifths>-1</fifths></key></attributes><note><pitch><step>B</step><alter>-1</alter><octave>3</octave></pitch><duration>4</duration><voice>bass</voice><staff>2</staff></note></measure></part></score-partwise>';
test("v1 migration is pure, labels inferred notation and gives stable document/lineage semantics", () => {
  const source = raw(),
    before = structuredClone(source),
    doc = migrateScoreV1(source);
  assert.deepEqual(source, before);
  assert.equal(doc.version, 2);
  assert.deepEqual(doc.lineage, { originalId: "original" });
  assert.equal(doc.notes[0].pitch.provenance, "inferred");
  assert.ok(doc.migration.inferred.includes("rests"));
  assert.equal(toPracticeScore(doc).notes[0].midi, 61);
  assert.deepEqual(readScoreDocument(JSON.parse(JSON.stringify(doc))), doc);
  assert.deepEqual(
    readScoreDocument(toPracticeScore(doc)).migration,
    doc.migration,
  );
  const invalid = structuredClone(doc);
  invalid.notes[0].pitch.alter = 0;
  assert.throws(() => validateScoreDocument(invalid), /音高/);
  assert.throws(() => readScoreDocument({ ...source, version: 3 }), /v1/);
});
test("MusicXML C sharp/D flat, explicit rests, staff, voice and key changes survive document and XML round trips", () => {
  const score = importMusicXML(xml).score,
    doc = readScoreDocument(score),
    round = readScoreDocument(importMusicXML(exportMusicXML(doc)).score);
  assert.deepEqual(
    doc.notes.slice(0, 2).map((n) => n.pitch.step),
    ["C", "D"],
  );
  assert.deepEqual(
    round.notes
      .slice(0, 2)
      .map((n) => [n.pitch.step, n.pitch.alter, n.voice, n.staff]),
    [
      ["C", 1, "lead", 1],
      ["D", -1, "lead", 1],
    ],
  );
  assert.equal(round.notes[1].accidental, "flat");
  assert.ok(
    round.rests.some(
      (r) => r.beat === 2 && r.duration === 2 && r.provenance === "source",
    ),
  );
  assert.equal(round.measureMap[1].keySignature, -1);
  const display = createDisplayRepresentation(doc);
  assert.deepEqual(
    display.notes.map((n) => n.pitch),
    doc.notes.map((n) => n.pitch),
  );
});
test("performance expands expressions and ties while preserving written heads and tempo events", () => {
  const score = {
    ...raw(),
    notes: [
      {
        id: "a",
        midi: 60,
        beat: 0,
        duration: 1,
        hand: "right",
        voice: "v",
        tieTo: "b",
        velocity: 0.3,
      },
      {
        id: "b",
        midi: 60,
        beat: 1,
        duration: 1,
        hand: "right",
        voice: "v",
        velocity: 0.9,
      },
      {
        id: "c",
        midi: 64,
        beat: 2,
        duration: 1,
        hand: "left",
        ornament: "trill",
        velocity: 0.7,
      },
    ],
    tempoMap: [
      { beat: 0, bpm: 120, curve: "linear" },
      { beat: 4, bpm: 60 },
    ],
  };
  const doc = readScoreDocument(score),
    before = structuredClone(doc),
    timeline = createPerformanceTimeline(doc);
  assert.equal(doc.notes.length, 3);
  assert.equal(
    timeline.notes.filter((n) => n.sourceIds.includes("a")).length,
    1,
  );
  assert.equal(timeline.notes[0].duration, 2);
  assert.equal(timeline.notes[0].velocity, 0.3);
  assert.equal(
    timeline.notes.filter((n) => n.sourceIds.includes("c")).length,
    8,
  );
  assert.ok(timeline.durationSeconds > 2);
  assert.deepEqual(doc, before);
});
test("source coordinates and editing ancestry persist; pitch changes invalidate old explicit spelling", () => {
  const score = raw(),
    notation = {
      version: 1,
      scoreId: score.id,
      coordinateSpace: "page",
      systems: [
        {
          id: "row",
          page: 1,
          system: 1,
          rect: { x: 0, y: 0, width: 200, height: 100 },
        },
      ],
      notes: [{ noteId: "a", page: 1, system: 1, x: 30, y: 40 }],
    };
  const doc = readScoreDocument(score, { sourceNotation: notation });
  assert.deepEqual(doc.notes[0].sourcePositions, [
    { page: 1, system: 1, x: 30, y: 40 },
  ]);
  const editor = createNoteEditor(toPracticeScore(doc));
  editor.update("a", { midi: 62 });
  const edited = readScoreDocument(editor.savedScore());
  assert.deepEqual(edited.lineage, {
    originalId: "original",
    parentId: "original",
  });
  assert.equal(edited.notes[0].pitch.step, "D");
  assert.equal(doc.notes[0].midi, 61);
});
test("v1 without an id migrates deterministically and transposition clears grace spelling", () => {
  const score = raw();
  delete score.id;
  assert.equal(
    readScoreDocument(score).id,
    readScoreDocument(structuredClone(score)).id,
  );
  const doc = readScoreDocument({
    ...raw(),
    notes: [
      {
        ...raw().notes[0],
        grace: {
          placement: "before",
          slash: true,
          stealBeats: 0.25,
          notes: [
            {
              midi: 60,
              pitch: { step: "C", alter: 0, octave: 4, provenance: "source" },
            },
          ],
        },
      },
    ],
  });
  assert.equal(transposeScore(doc, 1).notes[0].grace.notes[0].midi, 61);
  assert.equal(transposeScore(doc, 0).notes[0].grace.notes[0].pitch.step, "C");
});
