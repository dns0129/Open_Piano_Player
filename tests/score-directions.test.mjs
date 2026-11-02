import test from "node:test";
import assert from "node:assert/strict";
import { importMusicXML } from "../lib/importers.mjs";
import { exportMusicXML } from "../lib/exporters.mjs";
import { validateScore } from "../lib/score.mjs";
import { normalizeLibraryRecord } from "../lib/library-format.ts";
import { transposeScore } from "../lib/score.mjs";

const xml = `<score-partwise version="4.0"><part-list><score-part id="P"><part-name>Piano</part-name></score-part></part-list><part id="P"><measure number="1"><attributes><divisions>4</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes><note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><type>half</type><staff>1</staff></note><direction><direction-type><rehearsal>副歌 &amp; 尾声</rehearsal><words>rubato &lt;自由&gt;</words></direction-type><offset>2</offset><staff>2</staff></direction><note><rest/><duration>8</duration><type>half</type><staff>1</staff></note></measure></part></score-partwise>`;

test("MusicXML text directions retain offset, staff and escaped text through editing, disk format and re-export", () => {
  const original = importMusicXML(xml).score;
  assert.deepEqual(original.directions, [
    { type: "rehearsal", text: "副歌 & 尾声", beat: 2.5, staff: 2 },
    { type: "words", text: "rubato <自由>", beat: 2.5, staff: 2 },
  ]);
  const record = normalizeLibraryRecord({ score: transposeScore(original, 1) });
  assert.deepEqual(record.document.directions, original.directions);
  const exported = exportMusicXML(record.score);
  assert.ok(exported.includes("副歌 &amp; 尾声"));
  const restored = importMusicXML(exported).score;
  assert.deepEqual(restored.directions, original.directions);
  assert.deepEqual(
    restored.notes.map((n) => n.midi),
    record.score.notes.map((n) => n.midi),
  );
});

test("text directions reject corrupt positions and staff identifiers without silently dropping data", () => {
  const score = importMusicXML(xml).score;
  for (const direction of [
    { type: "other", text: "text", beat: 0 },
    { type: "words", text: "", beat: 0 },
    { type: "words", text: "text", beat: NaN },
    { type: "words", text: "text", beat: -1 },
    { type: "words", text: "text", beat: 4 },
    { type: "words", text: "text", beat: 0, staff: 3 },
  ])
    assert.throws(
      () => validateScore({ ...score, directions: [direction] }),
      /文字标记/,
    );
});
