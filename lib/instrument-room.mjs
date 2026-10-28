// A short, deterministic stereo room. One convolver per active instrument,
// shared by all its voices; no feedback path or additional sample downloads.
export function createInstrumentRoom(
  context,
  destination,
  { wet, decay, lowCut, highCut, stereoWidth },
) {
  const input = context.createGain();
  const dry = context.createGain();
  const reverb = context.createConvolver();
  const reflected = context.createGain();
  const gate = context.createGain();
  const impulse = context.createBuffer(
    2,
    Math.ceil(context.sampleRate * decay),
    context.sampleRate,
  );
  let seed = 19387;
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      smooth = smooth * 0.52 + (seed / 2147483648 - 1) * 0.48;
      const time = i / context.sampleRate;
      data[i] =
        time < 0.012 ? 0 : smooth * Math.exp((-6.91 * time) / decay) * 0.055;
    }
    for (const [time, gain] of [
      [0.019, 0.32],
      [0.033, 0.21],
      [0.051, 0.14],
    ]) {
      data[Math.round((time + channel * 0.003) * context.sampleRate)] += gain;
    }
  }
  reverb.normalize = false;
  reverb.buffer = impulse;
  dry.gain.value = 1 - wet * 0.35;
  reflected.gain.value = wet;
  // Symmetric mid/side narrowing keeps the reference piano centered without
  // pitch shifting, added voices or comb filtering. Shared by every note.
  const widthNodes = [];
  let signal = input;
  if (stereoWidth !== undefined && stereoWidth < 1) {
    const width = Math.max(0, stereoWidth);
    const splitter = context.createChannelSplitter(2);
    const merger = context.createChannelMerger(2);
    input.connect(splitter);
    widthNodes.push(splitter, merger);
    for (let from = 0; from < 2; from++)
      for (let to = 0; to < 2; to++) {
        const mix = context.createGain();
        mix.gain.value = (1 + (from === to ? width : -width)) / 2;
        splitter.connect(mix, from);
        mix.connect(merger, 0, to);
        widthNodes.push(mix);
      }
    signal = merger;
  }
  signal.connect(dry);
  dry.connect(gate);
  signal.connect(reverb);
  const toneNodes = [];
  let tail = reverb;
  for (const [type, frequency] of [
    ["highpass", lowCut],
    ["lowpass", highCut],
  ]) {
    if (!frequency) continue;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.707;
    tail.connect(filter);
    tail = filter;
    toneNodes.push(filter);
  }
  tail.connect(reflected);
  reflected.connect(gate);
  gate.connect(destination);
  return {
    input,
    fadeOut(time) {
      gate.gain.cancelScheduledValues(time);
      gate.gain.setValueAtTime(gate.gain.value, time);
      gate.gain.linearRampToValueAtTime(0, time + 0.012);
    },
    dispose() {
      for (const node of [
        input,
        ...widthNodes,
        dry,
        reverb,
        ...toneNodes,
        reflected,
        gate,
      ])
        node.disconnect();
    },
  };
}
