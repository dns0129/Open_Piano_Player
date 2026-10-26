// Builds the promo site's assets (site/assets/) from files already in this repo: the MusicXML
// samples for the in-page MusicXML → MIDI converter, the Salamander piano samples and the Bravura font.
// Run: npm run site:assets
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = `${root}site/assets/`;
rmSync(`${out}cases.js`, { force: true });

// Samples: the App's own MusicXML export of the 7-page Bumblebee transcription, unchanged…
mkdirSync(`${out}samples`, { recursive: true });
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

// Piano samples: every recorded minor third from A1 to C7, unchanged.
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

console.log(
  `site assets: 2 MusicXML samples, ${SAMPLES.length} piano samples, Bravura.woff2`,
);
