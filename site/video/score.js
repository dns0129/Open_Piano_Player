// Soundtrack of the promo video: the opening of Beethoven's Für Elise (WoO 59), shared by the
// page (scene timing, notes drawn in sync) and scripts/render-promo-video.mjs (audio mix).
// Times are in seconds; one bar of 3/8 at ♩=72 is 1.25 s, a sixteenth 1/4.8 s.

export const START = 0.5; // first note of the pickup
export const SIXTEENTH = 1.25 / 6;
export const BAR0 = START + 2 * SIXTEENTH; // downbeat of bar 1
export const DURATION = 30.5;
export const barAt = (n) => BAR0 + n * 1.25; // n counts bars from 0, repeats unrolled

const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const midi = (name) => {
  const [, l, acc, oct] = name.match(/^([A-G])(#?)(\d)$/);
  return 12 * (Number(oct) + 1) + PITCH[l] + (acc ? 1 : 0);
};

// Right hand per bar: "name:sixteenths", "r" is a rest. Left hand: broken chord on the first three sixteenths.
const RH = {
  a: "E5 D#5 E5 B4 D5 C5",
  b: "A4:2 r C4 E4 A4",
  c: "B4:2 r E4 G#4 B4",
  d: "C5:2 r E4 E5 D#5",
  e: "B4:2 r E4 C5 B4",
  f: "A4:2 r:2 E5 D#5",
  g: "A4:2 r B4 C5 D5",
  h: "E5:3 G4 F5 E5",
  i: "D5:3 F4 E5 D5",
  j: "C5:3 E4 D5 C5",
};
const LH = {
  b: "A2 E3 A3",
  c: "E2 E3 G#3",
  d: "A2 E3 A3",
  e: "E2 E3 G#3",
  f: "A2 E3 A3",
  g: "A2 E3 A3",
  h: "C3 G3 C4",
  i: "G2 G3 B3",
  j: "A2 E3 A3",
};
// 1st time bars 1–8, 2nd time bars 1–7 + second ending, then bars 10–13.
const FORM = "abcdabef" + "abcdabeg" + "hije";

function build() {
  const notes = [];
  const add = (t, name, dur, vel, hand) =>
    notes.push({ t, midi: midi(name), dur, vel, hand });
  add(START, "E5", SIXTEENTH * 1.4, 0.7, "r");
  add(START + SIXTEENTH, "D#5", SIXTEENTH * 1.4, 0.7, "r");
  [...FORM].forEach((key, n) => {
    const t0 = barAt(n);
    let s = 0;
    for (const tok of RH[key].split(" ")) {
      const [name, len = "1"] = tok.split(":");
      const d = Number(len);
      if (name !== "r")
        add(t0 + s * SIXTEENTH, name, d * SIXTEENTH * 1.5, 0.78, "r");
      s += d;
    }
    (LH[key] || "")
      .split(" ")
      .filter(Boolean)
      .forEach((name, k) =>
        add(t0 + k * SIXTEENTH, name, (6 - k) * SIXTEENTH, 0.5 - k * 0.05, "l"),
      );
  });
  // Final A minor, slightly rolled, left to ring.
  const tEnd = barAt(FORM.length);
  ["A2", "E3", "A3", "C4", "E4", "A4"].forEach((name, k) =>
    add(tEnd + k * 0.035, name, 3.6, k < 3 ? 0.5 : 0.62, k < 3 ? "l" : "r"),
  );
  return notes;
}

export const NOTES = build();
export const FINAL = barAt(FORM.length);
