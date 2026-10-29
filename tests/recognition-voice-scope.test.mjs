import test from "node:test";
import assert from "node:assert/strict";
import { decodeCompactRegion } from "../lib/recognition-wire.mjs";
import { validateRegionResult } from "../lib/score-region.mjs";
import { withWrittenFixture } from "./helpers/written-recognition-fixture.mjs";

const region = {
  id: "scope-row",
  page: 1,
  system: 1,
  rect: { x: 0, y: 0, width: 500, height: 200 },
};
function read(notes, voices, bars = [4, 4]) {
  const raw = withWrittenFixture({
    complete: true,
    meter: [4, 4],
    key: 0,
    bpm: 90,
    bars,
    notes,
    rests: [],
    in: [],
    out: [],
    ties: [],
    graces: [],
    warnings: [],
  });
  raw.notation.voices = voices;
  return decodeCompactRegion(raw, { region });
}
const note = (midi, beat, duration, voice) => [
  midi,
  beat,
  duration,
  voice,
  0.3,
  voice > 0 ? 0.2 : 0.8,
  0.7,
];

test("a source voice may end before a bar line and restart next bar without invented rests", () => {
  const raw = read(
    [note(60, 0, 3, 1), note(62, 4, 4, 1), note(48, 0, 8, -1)],
    [
      { voice: 1, from: 0, to: 3 },
      { voice: 1, from: 4, to: 8 },
      { voice: -1, from: 0, to: 8 },
    ],
  );
  const result = validateRegionResult(raw, region);
  assert.deepEqual(result.checks.errors, []);
  assert.deepEqual(result.rests, []);
  assert.equal(result.checks.rhythm[0].expectedBeats, 3);
  assert.equal(result.checks.rhythm[0].inactiveBeats, 1);
  const events = (notes) =>
    notes
      .map((n) => [n.id, n.midi, n.beat, n.duration])
      .sort(([a], [b]) => a.localeCompare(b));
  assert.deepEqual(events(result.score.notes), events(raw.score.notes));
});

test("overlapping source scopes count their union once", () => {
  const result = validateRegionResult(
    read(
      [note(60, 0, 3, 1), note(64, 1, 3, 2), note(48, 0, 4, -1)],
      [
        { voice: 1, from: 0, to: 3 },
        { voice: 2, from: 1, to: 4 },
        { voice: -1, from: 0, to: 4 },
      ],
      [4],
    ),
    region,
  );
  assert.deepEqual(result.checks.errors, []);
  assert.equal(result.checks.rhythm[0].expectedBeats, 4);
  assert.equal(result.checks.rhythm[0].inactiveBeats, 0);
});

test("a hand that has finished has no active voice in the final sustained bar", () => {
  const result = validateRegionResult(
    read(
      [note(60, 0, 4, 1), note(62, 4, 4, 1), note(48, 0, 12, -1)],
      [
        { voice: 1, from: 0, to: 8 },
        { voice: -1, from: 0, to: 12 },
      ],
      [4, 4, 4],
    ),
    region,
  );
  assert.deepEqual(result.checks.errors, []);
  assert.deepEqual(result.rests, []);
  const lastRight = result.checks.rhythm.find(
    (r) => r.measure === 3 && r.hand === "right",
  );
  assert.equal(lastRight.expectedBeats, 0);
  assert.equal(lastRight.coveredBeats, 0);
  assert.equal(lastRight.inactiveBeats, 4);
});

test("unexplained gaps inside declared active scope still fail", () => {
  const result = validateRegionResult(
    read(
      [note(60, 0, 3, 1), note(62, 4, 4, 1), note(48, 0, 8, -1)],
      [
        { voice: 1, from: 0, to: 8 },
        { voice: -1, from: 0, to: 8 },
      ],
    ),
    region,
  );
  assert.ok(result.checks.errors.some((e) => e.code === "RHYTHM_GAP"));
  assert.ok(result.checks.errors.some((e) => e.code === "VOICE_GAP"));
});

test("another complete voice cannot conceal a gap in an independent active voice", () => {
  const result = validateRegionResult(
    read(
      [
        note(60, 0, 4, 1),
        note(64, 0, 1, 2),
        note(65, 3, 1, 2),
        note(48, 0, 4, -1),
      ],
      [
        { voice: 1, from: 0, to: 4 },
        { voice: 2, from: 0, to: 4 },
        { voice: -1, from: 0, to: 4 },
      ],
      [4],
    ),
    region,
  );
  assert.ok(result.checks.errors.some((e) => e.code === "VOICE_GAP"));
});

test("legacy readings without source scopes still require complete hand coverage", () => {
  const raw = read(
    [note(60, 0, 3, 1), note(48, 0, 4, -1)],
    [
      { voice: 1, from: 0, to: 3 },
      { voice: -1, from: 0, to: 4 },
    ],
    [4],
  );
  delete raw.score.recognitionEvidence;
  assert.ok(
    validateRegionResult(raw, region).checks.errors.some(
      (e) => e.code === "RHYTHM_GAP",
    ),
  );
});

test("shortening a scope past an existing event remains invalid", () => {
  const result = validateRegionResult(
    read(
      [note(60, 0, 3, 1), note(48, 0, 4, -1)],
      [
        { voice: 1, from: 0, to: 2 },
        { voice: -1, from: 0, to: 4 },
      ],
      [4],
    ),
    region,
  );
  assert.ok(result.checks.errors.some((e) => e.code === "VOICE_SCOPE"));
});
