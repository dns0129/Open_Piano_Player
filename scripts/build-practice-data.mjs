// Rebuild the homepage's score data and the first page of its public-domain
// source PDF. Uses the same MusicXML importer and reviewed score as the app.
// Run: node scripts/build-practice-data.mjs
// Optional independent check: --verify-midi /path/to/wtk1-prelude1.mid
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { importScore } from "../lib/importers.mjs";
import { format } from "prettier";

const root = fileURLToPath(new URL("../", import.meta.url));
const assetRoot = `${root}site/assets/`;
const scorePath =
  "score-repo/scores/full-score-7e87728f60040aa1f7178325cebffac4e8ad.json";
const pdfPath = "site/assets/samples/bwv846-source.pdf";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourcePDF = readFileSync(root + pdfPath);
const sourcePDFHash =
  "b1c5be9fb63954df9c1a3e7b651ae930c4e5e332a5ab3e14b197379cfa04c35a";
if (sha256(sourcePDF) !== sourcePDFHash) {
  throw new Error(
    "BWV 846 source PDF changed; recheck the source-row mapping.",
  );
}

const { score: ode } = await importScore(
  readFileSync(`${assetRoot}samples/ode-to-joy.musicxml`),
  "ode-to-joy.musicxml",
);
const ODE_SCORE = {
  id: "ode-to-joy-four-bars",
  title: "欢乐颂",
  composer: "路德维希·范·贝多芬",
  subtitle: "前四小节 · 双手入门编配",
  beats: 16,
  bpm: ode.tempo,
  timeSignature: ode.timeSignature,
  keySignature: ode.keySignature,
  source: {
    file: "assets/samples/ode-to-joy.musicxml",
    label: "项目内置《欢乐颂》双手教学示例",
    license: "旋律为公有领域；沿用项目现有教学编配及左手伴奏",
  },
  notes: ode.notes
    .filter((note) => note.beat < 16)
    .map((note, index) => ({
      id: `ode-${index}`,
      beat: note.beat,
      duration: note.duration,
      midi: note.midi,
      hand: note.hand,
      velocity: note.velocity,
      rhythm: note.rhythm,
      pitch: note.pitch,
    })),
};
if (
  ODE_SCORE.notes.length !== 23 ||
  ODE_SCORE.notes.filter((n) => n.hand === "left").length !== 8
) {
  throw new Error("The Ode sample changed; verify the first four bars.");
}

const bachBytes = readFileSync(root + scorePath);
const bach = JSON.parse(bachBytes);
// These rectangles were measured on the actual 595.28 x 841.89 pt source PDF.
// Its engraved system starts are printed as 1, 4, 7, 10, 13 and 16 on page 1.
// Both selected systems contain three complete 4/4 bars. Margins include the
// brace, clefs, bar number, beams, ledger lines and the entire lower staff.
const PAGE = { width: 595.280029296875, height: 841.8900146484375 };
const lineSpecs = [
  { first: 1, last: 3, y: 88, height: 96 },
  { first: 4, last: 6, y: 218, height: 96 },
];
const BACH_LINES = lineSpecs.map((line, index) => {
  const sourceStartBeat = (line.first - 1) * 4;
  const beats = (line.last - line.first + 1) * 4;
  const id = `bach-line-${index + 1}`;
  return {
    id,
    label: `第 ${index + 1} 行 · 第 ${line.first}–${line.last} 小节`,
    measures: Array.from({ length: 3 }, (_, bar) => line.first + bar),
    firstMeasure: line.first,
    lastMeasure: line.last,
    sourceStartBeat,
    rect: {
      x: 20 / PAGE.width,
      y: line.y / PAGE.height,
      width: 550 / PAGE.width,
      height: line.height / PAGE.height,
    },
    score: {
      id,
      title: "C 大调前奏曲",
      subtitle: `BWV 846 · 第 ${line.first}–${line.last} 小节`,
      composer: "约翰·塞巴斯蒂安·巴赫",
      beats,
      bpm: 72,
      originalBpm: bach.tempo,
      timeSignature: [4, 4],
      keySignature: 0,
      firstMeasure: line.first,
      sourceStartBeat,
      notes: bach.notes
        .filter(
          (note) =>
            note.beat >= sourceStartBeat && note.beat < sourceStartBeat + beats,
        )
        .map((note, noteIndex) => ({
          id: `${id}-note-${noteIndex}`,
          sourceNoteId: note.id,
          beat: note.beat - sourceStartBeat,
          duration: note.duration,
          midi: note.midi,
          hand: note.hand,
          velocity: note.velocity,
        })),
    },
  };
});
for (const line of BACH_LINES) {
  if (line.score.notes.length !== 48) {
    throw new Error(
      `${line.id}: source notes changed; recheck the three bars.`,
    );
  }
}

const correctionNote = BACH_LINES[0].score.notes.find(
  (note) => note.beat === 1 && note.hand === "right" && note.midi === 76,
);
if (!correctionNote) throw new Error("The correction reference note changed.");
const BACH_CORRECTION = {
  lineId: BACH_LINES[0].id,
  noteId: correctionNote.id,
  beat: correctionNote.beat,
  hand: "right",
  measure: 1,
  correctMidi: 76,
  wrongMidi: 77,
  correctName: "E5",
  wrongName: "F5",
  label: "第 1 小节第 2 拍 · 右手",
  explanation: "这一音应为 E5。点一下，把演示中标出的 F5 校正回 E5。",
  isStagedDemo: true,
  sourcePoint: { x: 108 / PAGE.width, y: 103 / PAGE.height },
};

const SOURCE_INFO = {
  title: "C 大调前奏曲 · BWV 846",
  image: "assets/samples/bwv846-page1.webp",
  pdf: "assets/samples/bwv846-source.pdf",
  imageWidth: 1600,
  imageHeight: 2263,
  pages: 2,
  shownPage: 1,
  author: "约翰·塞巴斯蒂安·巴赫",
  typesetter: "Tobias Erbsland",
  license: "Public Domain",
  licenseLabel: "公有领域 · Mutopia 排版",
  reference: "Mutopia-2011/09/12-5",
  url: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=5",
  pdfUrl:
    "https://www.mutopiaproject.org/ftp/BachJS/BWV846/wtk1-prelude1/wtk1-prelude1-a4.pdf",
  midiUrl:
    "https://www.mutopiaproject.org/ftp/BachJS/BWV846/wtk1-prelude1/wtk1-prelude1.mid",
  sourceScore: scorePath,
  pdfSha256: sourcePDFHash,
  scoreSha256: sha256(bachBytes),
  note: "原谱为同版本 Mutopia A4 PDF；数字谱取自项目已逐行审核的乐谱。红色疑点仅为可重置的校对教学示例，并非新识别结果。",
};

const verifyAt = process.argv.indexOf("--verify-midi");
if (verifyAt >= 0) {
  const path = process.argv[verifyAt + 1];
  if (!path)
    throw new Error("--verify-midi requires the publisher's MIDI path.");
  const { score: midi } = await importScore(readFileSync(path), "bwv846.mid");
  const normalize = (notes) =>
    notes
      .filter((note) => note.beat < 24)
      .map((note) => [note.beat, note.duration, note.midi, note.hand])
      .sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  if (
    JSON.stringify(normalize(bach.notes)) !==
    JSON.stringify(normalize(midi.notes))
  ) {
    throw new Error("Reviewed score does not match the publisher MIDI.");
  }
  console.log("BWV 846: first six bars match the publisher MIDI (96 events).");
}

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const loadingTask = pdfjs.getDocument({
  data: new Uint8Array(sourcePDF),
  isEvalSupported: false,
  standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/`,
});
const pdf = await loadingTask.promise;
const page = await pdf.getPage(1);
const viewport = page.getViewport({
  scale: 1600 / page.getViewport({ scale: 1 }).width,
});
const canvas = createCanvas(1600, Math.ceil(viewport.height));
await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
writeFileSync(
  `${assetRoot}samples/bwv846-page1.webp`,
  canvas.toBuffer("image/webp", 90),
);
await loadingTask.destroy();

const exports = { ODE_SCORE, BACH_LINES, SOURCE_INFO, BACH_CORRECTION };
writeFileSync(
  `${assetRoot}practice-data.js`,
  await format(
    "// Generated by scripts/build-practice-data.mjs; see HOMEPAGE-SOURCES.md.\n" +
      Object.entries(exports)
        .map(
          ([name, data]) =>
            `export const ${name} = ${JSON.stringify(data, null, 2)};`,
        )
        .join("\n\n") +
      "\n",
    { parser: "babel" },
  ),
);
console.log(
  "Generated 23 Ode events, two 48-event Bach systems and the source page.",
);
