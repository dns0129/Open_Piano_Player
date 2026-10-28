const letters = ["C", "D", "E", "F", "G", "A", "B"];
const natural = [0, 2, 4, 5, 7, 9, 11];
const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
const flatOrder = ["B", "E", "A", "D", "G", "C", "F"];

export function spellMidi(midi, keySignature = 0) {
  const expected = {};
  (keySignature >= 0 ? sharpOrder : flatOrder)
    .slice(0, Math.abs(keySignature))
    .forEach((l) => {
      expected[l] = Math.sign(keySignature);
    });
  const candidates = [];
  for (let i = 0; i < 7; i++) {
    for (let accidental = -2; accidental <= 2; accidental++) {
      if ((((natural[i] + accidental) % 12) + 12) % 12 !== midi % 12) continue;
      const octave = (midi - natural[i] - accidental) / 12 - 1;
      const cost =
        Math.abs(accidental - (expected[letters[i]] || 0)) * 3 +
        Math.abs(accidental) * 0.1 +
        (keySignature >= 0 ? accidental < 0 : accidental > 0) * 0.01;
      candidates.push({ letter: letters[i], accidental, octave, cost });
    }
  }
  return candidates.sort((a, b) => a.cost - b.cost)[0];
}

/** Move by written letter, then apply the score key to that neighboring letter. */
export function diatonicNeighbor(midi, keySignature, direction, written) {
  const next = diatonicNeighborInfo(midi, keySignature, direction, written);
  return next.naturalMidi + next.accidental;
}
export function diatonicNeighborInfo(midi, keySignature, direction, written) {
  const pitch = written
      ? {
          letter: written.step,
          accidental: written.alter,
          octave: written.octave,
        }
      : spellMidi(midi, keySignature),
    index = letters.indexOf(pitch.letter),
    next = index + direction;
  const nextIndex = (next + 7) % 7,
    octave = pitch.octave + (next < 0 ? -1 : next > 6 ? 1 : 0);
  const order = keySignature >= 0 ? sharpOrder : flatOrder;
  const accidental = order
    .slice(0, Math.abs(keySignature))
    .includes(letters[nextIndex])
    ? Math.sign(keySignature)
    : 0;
  return { naturalMidi: (octave + 1) * 12 + natural[nextIndex], accidental };
}
