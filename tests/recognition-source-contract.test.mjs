import test from "node:test";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import {
  decodeCompactRegion,
  encodeCompactRegion,
} from "../lib/recognition-wire.mjs";
import { validateRegionResult, assembleJob } from "../lib/score-region.mjs";
import { exportMusicXML } from "../lib/exporters.mjs";
import { withWrittenFixture } from "./helpers/written-recognition-fixture.mjs";
import { runRecognitionPlan } from "../lib/recognition-plan.mjs";
import {
  recognitionDisposition,
  recognitionStageSummary,
} from "../lib/recognition-disposition.mjs";

const region = {
  id: "row",
  page: 1,
  system: 1,
  rect: { x: 0, y: 0, width: 400, height: 200 },
};
function fixture(overrides = {}) {
  return withWrittenFixture({
    complete: true,
    meter: [4, 4],
    key: 0,
    bpm: 90,
    bars: [4],
    notes: [
      [60, 0, 4, 1, 0.2, 0.2, 0.7],
      [48, 0, 4, -1, 0.2, 0.8, 0.7],
    ],
    rests: [],
    in: [],
    out: [],
    ties: [],
    warnings: [],
    ...overrides,
  });
}
test("wire retains explicit per-measure meters without inferring a meter from bar lengths", () => {
  const raw = fixture({
    meter: [3, 4],
    meters: [
      [3, 4],
      [4, 4],
    ],
    bars: [3, 4],
    notes: [
      [60, 0, 3, 1, 0.2, 0.2, 0.7],
      [62, 3, 4, 1, 0.6, 0.2, 0.7],
      [48, 0, 3, -1, 0.2, 0.8, 0.7],
      [50, 3, 4, -1, 0.6, 0.8, 0.7],
    ],
  });
  const decoded = decodeCompactRegion(raw, { region });
  assert.deepEqual(decoded.coverage.measureTimeSignatures, raw.meters);
  const valid = validateRegionResult(decoded, region);
  assert.equal(valid.checks.passed, true);
  assert.deepEqual(encodeCompactRegion(valid, region).meters, raw.meters);
  for (const meters of [
    [[3, 4]],
    [
      [3, 4],
      [4, 3],
    ],
    [
      [4, 4],
      [4, 4],
    ],
  ]) {
    assert.throws(() => decodeCompactRegion({ ...raw, meters }, { region }));
  }
  const legacy = structuredClone(raw);
  delete legacy.meters;
  assert.ok(
    validateRegionResult(
      decodeCompactRegion(legacy, { region }),
      region,
    ).checks.errors.some((e) => e.code === "OVERFULL_MEASURE"),
  );
});
test("same-beat clefs require explicit source order and retain both displayed events", () => {
  const raw = fixture({
    notes: [
      [60, 0, 4, 1, 0.2, 0.2, 0.7],
      [72, 0, 4, -1, 0.2, 0.8, 0.7],
    ],
  });
  raw.notation.notes[1].position = 5;
  raw.notation.clefs = [
    raw.notation.clefs[0],
    { beat: 0, staff: 2, sign: "F", line: 4, octaveChange: 0, order: 0 },
    { beat: 0, staff: 2, sign: "G", line: 2, octaveChange: 0, order: 1 },
  ];
  const valid = validateRegionResult(
    decodeCompactRegion(raw, { region }),
    region,
  );
  assert.equal(valid.checks.passed, true);
  assert.deepEqual(
    valid.score.recognitionEvidence.clefs
      .filter((c) => c.staff === 2)
      .map((c) => [c.sign, c.order]),
    [
      ["F", 0],
      ["G", 1],
    ],
  );
  raw.notation.clefs.reverse();
  const reversed = validateRegionResult(
    decodeCompactRegion(raw, { region }),
    region,
  );
  assert.equal(reversed.checks.passed, true, "array order is not source order");
  const ambiguous = structuredClone(raw);
  ambiguous.notation.clefs.forEach((c) => delete c.order);
  assert.throws(() => decodeCompactRegion(ambiguous, { region }));
});
test("source XML uses time advancement for inactive voice lanes, retaining explicit rests only", () => {
  const raw = fixture({
    bars: [4, 4],
    notes: [
      [60, 0, 4, 1, 0.2, 0.2, 0.7],
      [64, 4, 4, 2, 0.6, 0.2, 0.7],
      [48, 0, 8, -1, 0.2, 0.8, 0.7],
    ],
  });
  raw.notation.voices = [
    { voice: 1, from: 0, to: 4 },
    { voice: 2, from: 4, to: 8 },
    { voice: -1, from: 0, to: 8 },
  ];
  const result = validateRegionResult(
    decodeCompactRegion(raw, { region }),
    region,
  );
  assert.equal(result.checks.passed, true);
  const assembled = assembleJob(
    {
      metadata: {
        title: "Source lanes",
        source: { label: "Synthetic fixture" },
      },
      totalPages: 1,
      excludedPages: [],
      regions: [{ ...region, result }],
    },
    { draft: true },
  );
  const xml = exportMusicXML(assembled.score, { noteIds: true });
  const parsed = new XMLParser().parse(xml);
  const measures = parsed["score-partwise"].part.measure;
  const notes = measures
    .flatMap((m) => (Array.isArray(m.note) ? m.note : [m.note]))
    .filter(Boolean);
  assert.equal(
    notes.filter((n) => n.rest !== undefined).length,
    0,
    "inactive lanes must not invent source rests",
  );
  assert.match(xml, /<forward>/);
  const explicit = structuredClone(assembled.score);
  explicit.rests = [
    {
      id: "source-rest",
      beat: 4,
      duration: 4,
      hand: "right",
      voice: "right-1",
      staff: 1,
      provenance: "source",
    },
  ];
  const explicitXml = exportMusicXML(explicit);
  assert.equal(
    (explicitXml.match(/<rest\//g) || []).length,
    1,
    "keep the explicit source rest",
  );
  assert.match(explicitXml, /qinban-rest/);
  const legacy = structuredClone(assembled.score);
  delete legacy.recognitionEvidence;
  assert.match(
    exportMusicXML(legacy),
    /<rest\//,
    "legacy display padding remains supported",
  );
});

test("data-contract failures stop before image enhancement or another provider request", async () => {
  let calls = 0,
    preparations = 0;
  await assert.rejects(
    runRecognitionPlan(
      { metadata: {}, region: { ...region, image: { sha256: "synthetic" } } },
      {
        read: async () => {
          calls++;
          throw Object.assign(Error("ambiguous clef protocol"), {
            code: "INVALID_COMPACT_REGION",
            issues: [{ code: "INVALID_NOTATION", path: "notation" }],
          });
        },
        prepare: async () => {
          preparations++;
          throw Error("image work cannot repair a protocol error");
        },
        policy: { maxCalls: 2, recover: true },
      },
    ),
    (e) =>
      e.code === "INVALID_COMPACT_REGION" &&
      e.recognitionDisposition?.category === "data-contract",
  );
  assert.equal(calls, 1);
  assert.equal(preparations, 0);
  await assert.rejects(
    runRecognitionPlan(
      { metadata: {}, region: { ...region, image: { sha256: "synthetic" } } },
      {
        read: async () => {
          calls++;
          throw Error("must not redispatch");
        },
        prepare: async () => {
          preparations++;
          throw Error("must preserve the source diagnosis");
        },
        policy: { maxCalls: 2, recover: true },
        checkpoint: {
          calls: 1,
          history: [
            {
              stage: "first",
              regionId: region.id,
              error: {
                code: "NEEDS_SOURCE",
                sourceAssessment: { cause: "source-notation" },
              },
            },
          ],
        },
      },
    ),
    (e) => e.recognitionDisposition?.category === "source-notation",
  );
  assert.equal(calls, 1);
  assert.equal(preparations, 0);
});

test("reporting separates result presence, structural checks, import, artifacts and unknown accuracy", () => {
  const stages = recognitionStageSummary(
    [
      {
        geometryReady: true,
        pages: 2,
        recognizedRows: 3,
        totalRows: 4,
        structurallyPassedRows: 2,
        imported: false,
      },
    ],
    [{ status: "draft" }],
  );
  assert.equal(stages.recognition.rowsWithResult, 3);
  assert.equal(stages.recognition.structurallyPassedRows, 2);
  assert.equal(stages.library.imported, 0);
  assert.equal(stages.artifacts.drafts, 1);
  assert.equal(stages.sourceAccuracy.status, "not-scored");
  assert.equal(stages.symbolCoverage.status, "not-scored");
  assert.equal(
    recognitionDisposition({
      checks: { errors: [{ code: "OVERFULL_MEASURE" }] },
    }).retryWithSource,
    false,
  );
  assert.equal(
    recognitionDisposition({
      code: "NEEDS_SOURCE",
      sourceAssessment: { cause: "image-quality" },
    }).category,
    "source-image",
  );
});
