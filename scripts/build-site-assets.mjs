// Builds the promo site's assets (site/assets/) from files already in this repo: engraved score fragments
// cut from the library's Mutopia PDFs (green ink on transparent paper), the notes behind the hero fragment,
// the MusicXML samples for the in-page converter, VexFlow + Bravura for the live score and the Salamander
// piano samples. The app screenshots in site/assets/shots/ come from scripts/capture-site-shots.mjs.
// Run: npm run site:assets
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = `${root}site/assets/`;
for (const old of [
  "cases.js",
  "img/elise-page.webp",
  "img/elise-ink.webp",
  "img/chopin-page.webp",
  "img/chopin-ink.webp",
  "img/bach-page.webp",
]) {
  rmSync(out + old, { force: true });
}
mkdirSync(`${out}img`, { recursive: true });
mkdirSync(`${out}samples`, { recursive: true });
mkdirSync(`${out}vendor`, { recursive: true });

/* ---------- Engraved fragments ---------- */
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
async function renderPage(file, pageNo, width) {
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(root + file)),
    isEvalSupported: false,
    standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/`,
  }).promise;
  const page = await pdf.getPage(pageNo);
  const viewport = page.getViewport({
    scale: width / page.getViewport({ scale: 1 }).width,
  });
  const canvas = createCanvas(
    Math.round(viewport.width),
    Math.round(viewport.height),
  );
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: g, viewport }).promise;
  return canvas;
}
// Piano systems from staff-line rows, as [top, bottom] fractions of the page with room for ledger lines.
// Lines closer than ~2.5 staff spaces belong to one staff (a note may hide a line); staves pair up
// into grand-staff systems.
function findSystems(page) {
  const { data, width, height } = page
    .getContext("2d")
    .getImageData(0, 0, page.width, page.height);
  const lines = [];
  for (let y = 0; y < height; y++) {
    let dark = 0;
    for (let x = 0; x < width; x++) if (data[(y * width + x) * 4] < 140) dark++;
    if (dark < width * 0.4) continue;
    if (lines.length && y - lines[lines.length - 1].end <= 2)
      lines[lines.length - 1].end = y;
    else lines.push({ start: y, end: y });
  }
  const gaps = lines.slice(1).map((l, i) => l.start - lines[i].end);
  const small = gaps.filter((g) => g < height / 50).sort((a, b) => a - b);
  const space = small[Math.floor(small.length / 2)];
  const staves = [[lines[0].start, lines[0].end]];
  lines.slice(1).forEach((l, i) => {
    if (gaps[i] > 2.5 * space) staves.push([l.start, l.end]);
    else staves[staves.length - 1][1] = l.end;
  });
  const systems = [];
  for (let i = 0; i + 1 < staves.length; i += 2)
    systems.push([staves[i][0], staves[i + 1][1]]);
  return systems.map(([top, bottom]) => [
    (top - 4.5 * space) / height,
    (bottom + 4.5 * space) / height,
  ]);
}
// Cut [top, bottom] (page fractions) and keep only the ink, coloured like printed green ink.
function inkCut(page, name, [top, bottom], width, [r, g, b] = [36, 66, 52]) {
  const sy = Math.max(0, Math.round(top * page.height));
  const sh = Math.min(page.height, Math.round(bottom * page.height)) - sy;
  const canvas = createCanvas(width, Math.round((sh * width) / page.width));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(page, 0, sy, page.width, sh, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const lum =
      0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255 - lum;
  }
  ctx.putImageData(img, 0, 0);
  writeFileSync(`${out}img/${name}.webp`, canvas.toBuffer("image/webp", 86));
  return { top: sy / page.height, bottom: (sy + sh) / page.height };
}

// Hero: 《致爱丽丝》 title and first two systems. The first system holds the pickup and bars 1–5.
const elise = await renderPage(
  "public/intermediate-sources/intermediate-beethoven-woo59/original.pdf",
  1,
  2800,
);
const eliseSystems = findSystems(elise);
const eliseCut = inkCut(
  elise,
  "ink-elise",
  [0.02, eliseSystems[1][1] + 0.015],
  1500,
);
// Section dividers: one system each from Bach's Invention No.8 and Chopin's Prelude Op.28 No.7.
const bach = await renderPage(
  "public/intermediate-sources/intermediate-bach-bwv779/original.pdf",
  1,
  3000,
);
inkCut(bach, "ink-bach", findSystems(bach)[1], 2400);
const chopin = await renderPage(
  "public/intermediate-sources/intermediate-chopin-op28-07/original.pdf",
  1,
  3000,
);
inkCut(chopin, "ink-chopin", findSystems(chopin)[1], 2400);

// Notes of the pickup + bars 1–5 of the hero fragment, and where that system sits inside the cut.
// at: [beat, x] anchors for the pencil playhead, measured on the 1500 px cut — the pickup's first note,
// then the first note of each bar (about 16 px after the barlines at 355, 566, 775, 1000, 1216 px)
// and the closing barline at 1427 px.
const eliseScore = JSON.parse(
  readFileSync(
    `${root}score-repo/scores/intermediate-beethoven-woo59.json`,
    "utf8",
  ),
);
const span = eliseCut.bottom - eliseCut.top;
const hero = {
  bpm: 72,
  beats: 8,
  system: {
    top: Math.round(((eliseSystems[0][0] - eliseCut.top) / span) * 1000) / 1000,
    bottom:
      Math.round(((eliseSystems[0][1] - eliseCut.top) / span) * 1000) / 1000,
    at: [
      [0, 288],
      [0.5, 372],
      [2, 582],
      [3.5, 791],
      [5, 1016],
      [6.5, 1232],
      [8, 1427],
    ].map(([beat, px]) => [beat, Math.round((px / 1500) * 1000) / 1000]),
  },
  notes: (eliseScore.score || eliseScore).notes
    .filter((n) => n.beat < 8)
    .map((n) => [
      n.beat,
      n.duration,
      n.midi,
      n.hand === "left" ? 1 : 0,
      Math.round((n.velocity ?? 0.6) * 100) / 100,
    ]),
};
writeFileSync(
  `${out}scores.js`,
  `// Generated by scripts/build-site-assets.mjs from score-repo/. Do not edit by hand.\n` +
    `// The opening of 《致爱丽丝》 shown in the hero; notes: [beat, duration, MIDI, hand (0 right, 1 left), velocity]\n` +
    `window.QINBAN_HERO = ${JSON.stringify(hero)};\n`,
);

/* ---------- MusicXML samples ---------- */
// The App's own MusicXML export of the 7-page Bumblebee transcription, unchanged…
copyFileSync(
  `${root}output/scores/野蜂飞舞-Yeung-完整7页.musicxml`,
  `${out}samples/flight-of-the-bumblebee-yeung.musicxml`,
);
// …and a small two-staff 《欢乐颂》 written here (public-domain melody, same notes as site.js).
const SCALE = [0, 2, 4, 5, 7, 9, 11];
function jianpu(src) {
  let beat = 0;
  return src
    .trim()
    .split(/\s+/)
    .map((token) => {
      let dur = token.includes("_") ? 0.5 : 1;
      if (token.includes(".")) dur *= 1.5;
      dur += (token.match(/-/g) || []).length;
      const oct =
        (token.match(/'/g) || []).length - (token.match(/,/g) || []).length;
      const note = {
        beat,
        dur,
        midi: 60 + SCALE[Number(token[0]) - 1] + 12 * oct,
      };
      beat += dur;
      return note;
    });
}
const right = jianpu(
  "3 3 4 5 5 4 3 2 1 1 2 3 3. 2_ 2- 3 3 4 5 5 4 3 2 1 1 2 3 2. 1_ 1- " +
    "2 2 3 1 2 3_ 4_ 3 1 2 3_ 4_ 3 2 1 2 5,- 3 3 4 5 5 4 3 2 1 1 2 3 2. 1_ 1-",
);
const bass = [48, 55, 43, 50, 48, 55, 43, 50, 48, 55, 43, 50, 48, 55, 43, 48];
bass.push(43, 48, 43, 48, 43, 50, 48, 43, 48, 55, 43, 50, 48, 55, 43, 48);
const left = bass.map((midi, i) => ({ beat: i * 2, dur: 2, midi }));
const STEPS = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
const TYPES = { 0.5: "eighth", 1: "quarter", 1.5: "quarter", 2: "half" };
const noteXml = (n, staff) => {
  const pc = n.midi % 12;
  const alter = STEPS[pc] === STEPS[(pc + 11) % 12] ? "<alter>1</alter>" : "";
  return (
    `<note><pitch><step>${STEPS[pc]}</step>${alter}<octave>${Math.floor(n.midi / 12) - 1}</octave></pitch>` +
    `<duration>${n.dur * 2}</duration><voice>${staff === 1 ? 1 : 5}</voice><type>${TYPES[n.dur]}</type>` +
    `${n.dur === 1.5 ? "<dot/>" : ""}<staff>${staff}</staff></note>`
  );
};
const measures = Array.from({ length: 16 }, (_, m) => {
  const inBar = (n) => n.beat >= m * 4 && n.beat < m * 4 + 4;
  const head =
    m === 0
      ? `<attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>` +
        `<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>` +
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type><sound tempo="100"/></direction>`
      : "";
  return (
    `<measure number="${m + 1}">${head}` +
    right
      .filter(inBar)
      .map((n) => noteXml(n, 1))
      .join("") +
    `<backup><duration>8</duration></backup>` +
    left
      .filter(inBar)
      .map((n) => noteXml(n, 2))
      .join("") +
    `</measure>`
  );
});
writeFileSync(
  `${out}samples/ode-to-joy.musicxml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n` +
    `<score-partwise version="4.0"><work><work-title>欢乐颂</work-title></work>` +
    `<identification><creator type="composer">Ludwig van Beethoven</creator></identification>` +
    `<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>` +
    `<part id="P1">${measures.join("")}</part></score-partwise>\n`,
);

/* ---------- Thumbnail of the Bumblebee's first page ---------- */
// The source PDF lives in the local, untracked evidence/ folder; without it the committed image stays.
const beePdf = `${root}evidence/international-imslp-yeung.pdf`;
if (existsSync(beePdf)) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(beePdf)),
    isEvalSupported: false,
    standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/`,
  }).promise;
  const page = await pdf.getPage(1);
  const width = 760;
  const viewport = page.getViewport({
    scale: (width * 2) / page.getViewport({ scale: 1 }).width,
  });
  const big = createCanvas(
    Math.round(viewport.width),
    Math.round(viewport.height),
  );
  const g = big.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, big.width, big.height);
  await page.render({ canvasContext: g, viewport }).promise;
  const small = createCanvas(
    width,
    Math.round((big.height * width) / big.width),
  );
  small.getContext("2d").drawImage(big, 0, 0, small.width, small.height);
  writeFileSync(`${out}img/bee-page.webp`, small.toBuffer("image/webp", 82));
} else
  console.warn(
    "skipped bee-page.webp: evidence/international-imslp-yeung.pdf not found",
  );

/* ---------- App icon, VexFlow, Bravura, piano samples ---------- */
copyFileSync(`${root}public/favicon.svg`, `${out}favicon.svg`);
copyFileSync(
  `${root}node_modules/vexflow/build/cjs/vexflow-core.js`,
  `${out}vendor/vexflow-core.js`,
);
copyFileSync(
  `${root}node_modules/vexflow/LICENSE`,
  `${out}vendor/VEXFLOW-LICENSE.txt`,
);
// Bravura as shipped (unmodified) inside VexFlow 5, written out as a woff2 file.
const bravura = readFileSync(
  `${root}node_modules/vexflow/build/esm/src/fonts/bravura.js`,
  "utf8",
);
mkdirSync(`${out}fonts`, { recursive: true });
writeFileSync(
  `${out}fonts/Bravura.woff2`,
  Buffer.from(bravura.match(/base64,([A-Za-z0-9+/=]+)/)[1], "base64"),
);
// Every recorded minor third from A1 to C7, unchanged.
const SAMPLES = [
  "A1",
  "C2",
  "Ds2",
  "Fs2",
  "A2",
  "C3",
  "Ds3",
  "Fs3",
  "A3",
  "C4",
  "Ds4",
];
SAMPLES.push(
  "Fs4",
  "A4",
  "C5",
  "Ds5",
  "Fs5",
  "A5",
  "C6",
  "Ds6",
  "Fs6",
  "A6",
  "C7",
);
mkdirSync(`${out}audio/piano`, { recursive: true });
for (const name of [
  ...SAMPLES.map((note) => `${note}.mp3`),
  "ATTRIBUTION.txt",
  "LICENSE.txt",
]) {
  copyFileSync(
    `${root}public/audio/piano/${name}`,
    `${out}audio/piano/${name}`,
  );
}

console.log(
  `site assets: 2 MusicXML samples, bee-page thumbnail, VexFlow core, Bravura, ${SAMPLES.length} piano samples`,
);
