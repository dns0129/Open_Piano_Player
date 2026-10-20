/** Deterministic plucked-string synthesis. Exact harmonic frequencies preserve
 * tuning; high partials decay faster to mimic nylon-string damping. No assets.
 */
export function guitarWaveform(midi, sampleRate) {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const length = Math.ceil(sampleRate * 5), data = new Float32Array(length);
  for (let harmonic = 1; harmonic <= 16 && harmonic * frequency < sampleRate * .43; harmonic++) {
    const weight = Math.sin(Math.PI * harmonic * .19) / harmonic ** 1.55;
    const decay = Math.exp(-1 / (sampleRate * (1.65 / harmonic ** .65)));
    const angle = 2 * Math.PI * frequency * harmonic / sampleRate;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    let x = 1, y = 0, envelope = weight;
    for (let i = 0; i < length; i++) {
      data[i] += y * envelope * .65;
      const nextX = x * cos - y * sin;
      y = x * sin + y * cos; x = nextX; envelope *= decay;
    }
  }
  // Short pick transient and click-free attack/tail, with no random global state.
  let seed = midi + 19387;
  for (let i = 0; i < length; i++) {
    if (i < sampleRate * .014) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] += (seed / 2147483648 - 1) * .028 * Math.exp(-i / (sampleRate * .003));
    }
    data[i] *= Math.min(1, i / (sampleRate * .002)) * Math.min(1, (length - i - 1) / (sampleRate * .025));
  }
  return data;
}
