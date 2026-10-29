import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeCompactRegion,
  encodeCompactRegion,
} from "../lib/recognition-wire.mjs";
import { validateRegionResult, assembleJob } from "../lib/score-region.mjs";
import { auditWrittenNotation } from "../lib/recognition-notation.mjs";
import { createRegionSubmission } from "../lib/recognition-submission.mjs";
import { exportMusicXML, exportMidi } from "../lib/exporters.mjs";
import { importMusicXML } from "../lib/importers.mjs";
import { readScoreDocument, toPracticeScore } from "../lib/score-document.ts";
import { compareRegionReadings } from "../lib/recognition-comparison.mjs";
import { withWrittenFixture } from "./helpers/written-recognition-fixture.mjs";
const region = {
  id: "row",
  page: 1,
  system: 1,
  rect: { x: 10, y: 20, width: 400, height: 200 },
};
const request = {
  region,
  metadata: { title: "Synthetic independent rule cases" },
  requireNotation: true,
};
const wire = () =>
  withWrittenFixture({
    complete: true,
    meter: [4, 4],
    key: 0,
    bpm: 90,
    bars: [4],
    notes: [
      [60, 0, 1, 1, 0.2, 0.2, 0.7],
      [60, 1, 3, 1, 0.5, 0.2, 0.7],
      [48, 0, 4, -1, 0.2, 0.8, 0.55],
    ],
    rests: [],
    in: [],
    out: [],
    ties: [],
    graces: [],
    warnings: [],
  });
const checked = (r) =>
  validateRegionResult(
    decodeCompactRegion(r, request),
    region,
    request.metadata,
  );

test("B sharp, C flat, double accidentals and octave shifts retain spelling and cross-check MIDI", () => {
  for (const [step, alter, octave, midi] of [
    ["B", 1, 4, 72],
    ["C", -1, 4, 59],
    ["F", 2, 4, 67],
    ["B", -2, 4, 69],
  ]) {
    const r = wire();
    r.notes[0][0] = midi;
    Object.assign(r.notation.notes[0], { step, alter, octave, printed: alter });
    // Keep the following same-letter event independent by explicitly restoring C.
    const c = checked(r);
    assert.equal(c.checks.passed, true, JSON.stringify(c.checks.errors));
    assert.equal(c.score.notes.find((n) => n.id === "n0").pitch.step, step);
  }
  const r = wire();
  r.notes[0][0] = 72;
  Object.assign(r.notation.notes[0], { shift: 12 });
  const c = checked(r);
  assert.equal(c.checks.passed, true);
  assert.equal(c.score.notes.find((n) => n.id === "n0").pitch.octave, 5);
});
test("a conflicting visual pitch does not silently overwrite model MIDI", () => {
  const r = wire();
  Object.assign(r.notation.notes[0], {
    step: "B",
    octave: 4,
    alter: 1,
    printed: 1,
  });
  const c = checked(r);
  assert.equal(c.score.notes.find((n) => n.id === "n0").midi, 60);
  assert.ok(
    c.checks.errors.some(
      (e) => e.code === "PITCH_DISAGREEMENT" && e.computedMidi === 72,
    ),
  );
  const saved = toPracticeScore(readScoreDocument(c.score));
  assert.equal(saved.recognitionEvidence.notes[0].step, "B");
});
test("accidentals inherit by staff, letter and octave; natural and new bars reset correctly", () => {
  const r = wire();
  r.notes[0][0] = 61;
  r.notes[1][0] = 61;
  Object.assign(r.notation.notes[0], { alter: 1, printed: 1 });
  Object.assign(r.notation.notes[1], { alter: 1, printed: null });
  assert.equal(checked(r).checks.passed, true);
  r.notation.notes[1].printed = 0;
  assert.ok(
    checked(r).checks.errors.some((e) => e.code === "ACCIDENTAL_STATE"),
  );
  const lower = wire();
  lower.notation.notes[2].alter = 1;
  lower.notes[2][0] = 49;
  lower.notation.notes[2].printed = null;
  assert.ok(
    checked(lower).checks.errors.some((e) => e.code === "ACCIDENTAL_STATE"),
    "upper staff C natural cannot authorize a lower C sharp",
  );
});
test("simultaneous accidental handling is independent of note array order and catches conflicts", () => {
  const r = wire();
  r.notes[1] = [61, 0, 1, 2, 0.3, 0.2, 0.7];
  r.notation.notes[1] = {
    ...r.notation.notes[0],
    index: 1,
    alter: 1,
    printed: null,
  };
  r.notes[0][0] = 61;
  r.notation.notes[0].alter = 1;
  r.notation.notes[0].printed = 1;
  r.rests = [
    [1, 3, 1],
    [1, 3, 2],
  ];
  r.notation.rests = [
    { index: 0, staff: 1 },
    { index: 1, staff: 1 },
  ];
  r.notation.voices.push({ voice: 2, from: 0, to: 4 });
  const a = checked(r);
  assert.equal(a.checks.passed, true, JSON.stringify(a.checks.errors));
  r.notation.notes.reverse();
  assert.equal(checked(r).checks.passed, true);
  r.notation.notes.find((n) => n.index === 1).printed = -1;
  assert.ok(
    checked(r).checks.errors.some(
      (e) => e.code === "SIMULTANEOUS_ACCIDENTAL_CONFLICT",
    ),
  );
});
test("source clef positions and cross-staff hand allocation remain separate", () => {
  const r = wire();
  Object.assign(r.notation.notes[0], { position: 0, step: "E", octave: 4 });
  r.notes[0][0] = 64;
  assert.equal(checked(r).checks.passed, true);
  r.notation.notes[0].position = 1;
  assert.ok(checked(r).checks.errors.some((e) => e.code === "STAFF_POSITION"));
  const cross = wire();
  cross.notation.notes[0].staff = 2;
  cross.notation.clefs[1] = {
    beat: 0,
    staff: 2,
    sign: "G",
    line: 2,
    octaveChange: 0,
  };
  const c = checked(cross);
  assert.equal(c.score.notes.find((n) => n.id === "n0").hand, "right");
  assert.equal(c.score.notes.find((n) => n.id === "n0").staff, 2);
});
test("each voice needs explicit coverage and deleting a rest is never repaired by another voice", () => {
  const r = wire();
  r.notes.push([67, 0, 1, 2, 0.2, 0.1, 0.7]);
  r.notation.notes.push({
    index: 3,
    staff: 1,
    step: "G",
    octave: 4,
    alter: 0,
    printed: null,
    shift: 0,
  });
  r.notation.voices.push({ voice: 2, from: 0, to: 4 });
  assert.ok(
    checked(r).checks.errors.some(
      (e) => e.code === "VOICE_GAP" && e.voice === "right-2",
    ),
  );
  r.rests.push([1, 3, 2]);
  r.notation.rests.push({ index: 0, staff: 1, x: 0.5, y: 0.3 });
  const c = checked(r);
  assert.equal(c.checks.passed, true);
  const edited = structuredClone(c);
  edited.rests = [];
  edited.score.rests = [];
  const rechecked = validateRegionResult(edited, region);
  assert.ok(
    rechecked.checks.errors.some((e) => e.code === "SOURCE_REST_MISSING"),
  );
  assert.ok(rechecked.checks.errors.some((e) => e.code === "VOICE_GAP"));
});
test("new or layout-inferred rests cannot stand in for source evidence and duplicate source IDs are rejected", () => {
  const r = wire();
  r.notes[1][1] = 2;
  r.notes[1][2] = 2;
  r.rests = [[1, 1, 1]];
  r.notation.rests = [{ index: 0, staff: 1 }];
  const c = checked(r);
  assert.equal(c.checks.passed, true);
  const missing = structuredClone(c);
  missing.score.recognitionEvidence.rests = [];
  assert.ok(
    validateRegionResult(missing, region).checks.errors.some(
      (e) => e.code === "SOURCE_REST_EVIDENCE_MISSING",
    ),
  );
  const inferred = structuredClone(c);
  inferred.rests[0].provenance = "inferred";
  const issues = validateRegionResult(inferred, region).checks.errors;
  assert.ok(issues.some((e) => e.code === "VOICE_GAP"));
  assert.ok(issues.some((e) => e.code === "SOURCE_REST_EVIDENCE_MISSING"));
  r.notation.rests.push({ ...r.notation.rests[0] });
  assert.throws(() => checked(r), /重复/);
});

test("browser preflight shares source validation and its assembly retains explicit rests, written heads and ties", async () => {
  const {
    normalizeFullScoreRegionResult,
    fullScoreRegionIssues,
    assembleFullScoreReview,
  } = await import("../lib/full-score-review.mjs");
  const raw = wire();
  raw.notes[1][1] = 2;
  raw.notes[1][2] = 2;
  raw.rests = [[1, 1, 1]];
  raw.notation.rests = [{ index: 0, staff: 1 }];
  const c = checked(raw),
    row = normalizeFullScoreRegionResult({ ...region, selected: true }, c);
  row.reviewed = true;
  assert.deepEqual(fullScoreRegionIssues(row), []);
  row.notes[0].midi++;
  assert.ok(
    fullScoreRegionIssues(row).some((e) => e.code === "PITCH_DISAGREEMENT"),
  );
  row.notes[0].midi--;
  const result = assembleFullScoreReview({
    id: "p1",
    title: "fixture",
    totalPages: 1,
    pages: [{ page: 1, scanned: true, decision: "include" }],
    regions: [row],
  });
  assert.equal(result.score.recognitionEvidence.notes.length, 3);
  assert.equal(result.score.rests.length, 1);
  assert.equal(result.score.notes.find((n) => n.midi === 60).pitch.step, "C");
  const tied = checked(wire());
  tied.internalTies = [{ fromNoteId: "n0", toNoteId: "n1" }];
  const second = normalizeFullScoreRegionResult(
    { ...region, selected: true },
    tied,
  );
  second.reviewed = true;
  const assembled = assembleFullScoreReview({
    id: "tie",
    title: "fixture",
    totalPages: 1,
    pages: [{ page: 1, scanned: true, decision: "include" }],
    regions: [second],
  });
  assert.equal(assembled.score.notes.length, 3);
  assert.equal(assembled.score.notes.filter((n) => n.tieTo).length, 1);
});
test("native MusicXML and JSON roundtrip preserve source pitches, cross-staff hands and rests", () => {
  const r = wire();
  r.notes[0][0] = 70;
  Object.assign(r.notation.notes[0], { step: "B", alter: -1, printed: -1 });
  r.notes[1][1] = 2;
  r.notes[1][2] = 2;
  r.rests = [[1, 1, 1]];
  r.notation.rests = [{ index: 0, staff: 1, x: 0.3, y: 0.2 }];
  r.notation.notes[0].staff = 2;
  const c = checked(r);
  assert.equal(c.checks.passed, true, JSON.stringify(c.checks.errors));
  const doc = readScoreDocument(c.score),
    saved = toPracticeScore(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(saved.recognitionEvidence, c.score.recognitionEvidence);
  const xml = exportMusicXML(saved);
  assert.match(xml, /<step>B<\/step>/);
  assert.match(xml, /<alter>-1<\/alter>/);
  assert.match(xml, /<rest\/>/);
  const imported = importMusicXML(xml).score;
  assert.deepEqual(imported.recognitionEvidence, saved.recognitionEvidence);
  assert.equal(imported.notes.find((n) => n.id === "n0").hand, "right");
  assert.equal(imported.notes.find((n) => n.id === "n0").staff, 2);
  assert.equal(
    imported.rests.find((n) => n.id === "rest-0").provenance,
    "source",
  );
  assert.ok(exportMidi(imported).length > 0);
});
test("comparison detects source spelling/rest differences while voice numbering is irrelevant", () => {
  const a = checked(wire()),
    b = structuredClone(a);
  for (const n of b.score.notes) n.voice = "renumbered-" + n.voice;
  assert.equal(compareRegionReadings(a, b).exactMatch, true);
  b.score.recognitionEvidence.notes[0].printed = 1;
  assert.equal(compareRegionReadings(a, b).exactMatch, false);
});
test("legacy data can be opened but a new complete submission requires written evidence", async () => {
  const r = wire();
  delete r.notation;
  assert.equal(checked(r).checks.passed, true);
  const s = createRegionSubmission(request);
  await s.submit(r);
  assert.equal(s.finish().checks.passed, false);
  assert.ok(
    s.finish().checks.errors.some((e) => e.code === "WRITTEN_EVIDENCE_MISSING"),
  );
});

test("App-to-Skill bridge preserves explicit rests and cross-staff source without auto-confirming", async () => {
  const { recognitionTranscription } =
    await import("../lib/recognition-transcription.mjs");
  const { validateTranscription, musicXML } =
    await import("../skills/piano-score-to-musicxml/scripts/score_pipeline.mjs");
  const r = wire();
  r.notes[0][0] = 70;
  Object.assign(r.notation.notes[0], { step: "B", alter: -1, printed: -1 });
  r.notes[1][1] = 2;
  r.notes[1][2] = 2;
  r.rests = [[1, 1, 1]];
  r.notation.rests = [{ index: 0, staff: 1 }];
  r.notation.notes[0].staff = 2;
  const result = checked(r),
    job = {
      id: "fixture",
      metadata: { title: "fixture", source: { label: "synthetic" } },
      regions: [{ ...region, result }],
      totalPages: 1,
      excludedPages: [],
    };
  result.score.tempoMap = [
    { beat: 0, bpm: 90 },
    { beat: 1, bpm: 80 },
    { beat: 4, bpm: 70 },
  ];
  const manifest = {
    schema: "piano-score-pages/v1",
    pages: [{ page: 1, sha256: "a".repeat(64) }],
  };
  const raw = recognitionTranscription(job, manifest);
  assert.deepEqual(
    raw.notation.tempoMarks.map((t) => t.beat),
    [0, 1],
  );
  assert.equal(raw.score.tempoMap.at(-1).beat, 4);
  assert.equal(raw.review.humanConfirmed, false);
  assert.ok(raw.pages.every((p) => p.reviewed === false));
  const converted = validateTranscription(raw, manifest, { draft: true });
  assert.equal(converted.score.rests.length, 1);
  assert.equal(converted.score.notes.find((n) => n.midi === 70).staff, 2);
  assert.match(musicXML(converted), /<rest\/>/);
  raw.notation.rests[0].checked = "false";
  assert.throws(
    () => validateTranscription(raw, manifest, { draft: true }),
    /布尔/,
  );
});

test("written cross-row ties retain both source heads and native tieTo links", () => {
  const a = checked(wire()),
    b = checked(wire());
  // The final C of row 1 ties into row 2's first C, on the same explicit voice.
  a.continuity.tieOut = [{ noteId: "n1", midi: 60, hand: "right" }];
  b.continuity.tieIn = [{ noteId: "n0", midi: 60, hand: "right" }];
  const job = {
    id: "ties",
    metadata: { title: "fixture", source: { label: "fixture" } },
    regions: [
      { ...region, result: a },
      { ...region, id: "row2", system: 2, result: b },
    ],
    totalPages: 1,
    excludedPages: [],
  };
  const assembled = assembleJob(job, { draft: true });
  assert.equal(assembled.score.notes.length, 6);
  assert.equal(assembled.score.notes.filter((n) => n.tieTo).length, 1);
  assert.equal(assembled.score.recognitionEvidence.notes.length, 6);
  assert.equal(assembled.sourceNotation.notes.length, 6);
});
