import test from "node:test";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import { decodeCompactRegion } from "../lib/recognition-wire.mjs";
import { validateRegionResult, assembleJob } from "../lib/score-region.mjs";
import { recognitionTranscription } from "../lib/recognition-transcription.mjs";
import { withWrittenFixture } from "./helpers/written-recognition-fixture.mjs";
import {
  validateTranscription,
  musicXML,
} from "../skills/piano-score-to-musicxml/scripts/score_pipeline.mjs";

function fixture() {
  const region = {
    id: "row",
    page: 1,
    system: 1,
    rect: { x: 0, y: 0, width: 300, height: 160 },
    image: { sha256: "a".repeat(64) },
  };
  const raw = withWrittenFixture({
    complete: true,
    meter: [4, 4],
    key: 1,
    bpm: 90,
    bars: [4],
    notes: [
      [63, 0, 0, 1, 0.1, 0.2, 0.7],
      [66, 0, 0, 1, 0.1, 0.15, 0.7],
      [63, 0, 4, 1, 0.2, 0.2, 0.7],
      [48, 0, 4, -1, 0.2, 0.8, 0.5],
    ],
    rests: [],
    in: [],
    out: [],
    ties: [],
    graces: [
      [0, 2],
      [1, 2],
    ],
    graceStyles: [[2, 0, 1, 0.2]],
    warnings: [],
  });
  raw.notation.notes[1].printed = null;
  raw.notation.notes[2].printed = null;
  const result = validateRegionResult(
    decodeCompactRegion(raw, { region }),
    region,
  );
  assert.equal(result.checks.passed, true);
  const job = {
    metadata: {
      title: "Synthetic source grace chord",
      source: { label: "Synthetic fixture" },
    },
    regions: [{ ...region, result }],
    totalPages: 1,
    excludedPages: [],
  };
  const manifest = {
    schema: "piano-score-pages/v1",
    pages: [{ page: 1, sha256: "b".repeat(64) }],
  };
  const sourceGraceNotation = assembleJob(job, {
    draft: true,
  }).score.recognitionEvidence.graces.map((g) => ({
    noteId: g.noteId,
    type: "eighth",
    slash: true,
    chordGroup: "source-chord",
    sourceImageSha256: region.image.sha256,
  }));
  return { job, manifest, sourceGraceNotation };
}

test("explicit source grace chord evidence carries its accidental to the principal without inventing a principal sign", () => {
  const f = fixture();
  const raw = recognitionTranscription(f.job, f.manifest, f);
  assert.equal(raw.notation.graces.length, 2);
  assert.equal(raw.notation.graces[0].printedAccidental, 1);
  const anchor = raw.notation.graces[0].beforeNote;
  assert.equal(raw.notation.notes[anchor].printedAccidental, null);
  assert.equal(raw.notation.graces[0].type, "eighth");
  const checked = validateTranscription(raw, f.manifest, { draft: true });
  assert.equal(checked.score.notes.length, 2);
  const xml = new XMLParser({ ignoreAttributes: false }).parse(
    musicXML(checked),
  );
  const notes = xml["score-partwise"].part.measure.note;
  const graces = notes.filter((n) => n.grace !== undefined);
  assert.equal(graces.length, 2);
  assert.equal(graces[0].chord, undefined);
  assert.equal(graces[1].chord, "");
  assert.equal(graces[0].accidental, "sharp");
  assert.ok(graces.every((g) => g.duration === undefined));
});

test("unknown paper grace values remain unhandled instead of being inferred from playback borrowing", () => {
  const f = fixture();
  const raw = recognitionTranscription(f.job, f.manifest);
  assert.deepEqual(raw.notation.graces, []);
  assert.ok(raw.notation.unhandled.some((i) => i.message.includes("倚音")));
});

test("source grace metadata is bound to the current image and cannot add unknown grace heads", () => {
  const f = fixture();
  for (const mutate of [
    (s) => (s[0].sourceImageSha256 = "c".repeat(64)),
    (s) => (s[0].noteId = "unknown-grace"),
    (s) => s.push({ ...s[0] }),
  ]) {
    const sourceGraceNotation = structuredClone(f.sourceGraceNotation);
    mutate(sourceGraceNotation);
    assert.throws(() =>
      recognitionTranscription(f.job, f.manifest, { sourceGraceNotation }),
    );
  }
});

test("grace accidental conflicts still block and chord groups cannot mix anchors or paper values", () => {
  const f = fixture();
  const raw = recognitionTranscription(f.job, f.manifest, f);
  raw.notation.graces[0].printedAccidental = -1;
  assert.throws(() => validateTranscription(raw, f.manifest, { draft: true }));
  const mixed = recognitionTranscription(f.job, f.manifest, f);
  mixed.notation.graces[1].type = "16th";
  assert.throws(() =>
    validateTranscription(mixed, f.manifest, { draft: true }),
  );
});
