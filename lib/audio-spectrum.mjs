// A short-time Fourier transform supplies measurements, not detected notes.
// The Pi agent must infer the notes, rhythm and key from these measurements.
export const SPECTRUM_RATE = 22050;
export const SPECTRUM_HOP_SECONDS = 0.1;
export const SPECTRUM_WINDOW = 8192;
export const MAX_SPECTRUM_SECONDS = 120;

export function audioSpectrum(samples, { signal, onProgress = () => {} } = {}) {
  if (
    !(samples instanceof Float32Array) ||
    samples.length < SPECTRUM_RATE / 4 ||
    samples.length > SPECTRUM_RATE * MAX_SPECTRUM_SECONDS + 1
  )
    throw new Error("音频片段须为 0.25–120 秒。");
  const n = SPECTRUM_WINDOW;
  const hop = Math.round(SPECTRUM_RATE * SPECTRUM_HOP_SECONDS);
  const bits = Math.log2(n);
  const reverse = new Uint16Array(n);
  const window = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i,
      y = 0;
    for (let b = 0; b < bits; b++) {
      y = (y << 1) | (x & 1);
      x >>>= 1;
    }
    reverse[i] = y;
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  const cos = new Float64Array(n / 2),
    sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const real = new Float64Array(n),
    imaginary = new Float64Array(n);
  const magnitude = new Float64Array(n / 2);
  const frames = [];
  let maximumRms = 0;
  const count = Math.ceil(samples.length / hop);
  for (let frame = 0; frame < count; frame++) {
    signal?.throwIfAborted();
    const center = frame * hop;
    let sum = 0,
      observed = 0;
    for (let i = 0; i < n; i++) {
      const index = center + i - n / 2;
      const sample = index < 0 || index >= samples.length ? 0 : samples[index];
      if (!Number.isFinite(sample)) throw new Error("音频采样含无效数值。");
      if (
        Math.abs(index - center) < hop / 2 &&
        index >= 0 &&
        index < samples.length
      ) {
        sum += sample * sample;
        observed++;
      }
      real[reverse[i]] = sample * window[i];
      imaginary[reverse[i]] = 0;
    }
    const rms = Math.sqrt(sum / Math.max(1, observed));
    maximumRms = Math.max(maximumRms, rms);
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2,
        step = n / size;
      for (let offset = 0; offset < n; offset += size) {
        for (let j = 0; j < half; j++) {
          const w = j * step,
            a = offset + j,
            b = a + half;
          const tr = real[b] * cos[w] - imaginary[b] * sin[w];
          const ti = real[b] * sin[w] + imaginary[b] * cos[w];
          real[b] = real[a] - tr;
          imaginary[b] = imaginary[a] - ti;
          real[a] += tr;
          imaginary[a] += ti;
        }
      }
    }
    for (let i = 0; i < n / 2; i++)
      magnitude[i] = Math.hypot(real[i], imaginary[i]);
    const peaks = [];
    const low = Math.max(2, Math.floor((27.5 * n) / SPECTRUM_RATE));
    const high = Math.min(n / 2 - 2, Math.ceil((5000 * n) / SPECTRUM_RATE));
    for (let i = low; i <= high; i++) {
      if (magnitude[i] <= magnitude[i - 1] || magnitude[i] <= magnitude[i + 1])
        continue;
      const db = 20 * Math.log10(Math.max(1e-10, (magnitude[i] * 4) / n));
      if (db < -72) continue;
      const left = Math.log(Math.max(1e-10, magnitude[i - 1]));
      const mid = Math.log(Math.max(1e-10, magnitude[i]));
      const right = Math.log(Math.max(1e-10, magnitude[i + 1]));
      const denominator = left - 2 * mid + right;
      const correction = denominator
        ? Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / denominator))
        : 0;
      peaks.push([
        Math.round((((i + correction) * SPECTRUM_RATE) / n) * 10) / 10,
        Math.round(db),
      ]);
    }
    peaks.sort((a, b) => b[1] - a[1]);
    frames.push([
      Math.round((center / SPECTRUM_RATE) * 1000) / 1000,
      Math.round(20 * Math.log10(Math.max(1e-6, rms))),
      peaks.slice(0, 20),
    ]);
    if (frame % 20 === 0) onProgress(frame / count);
  }
  if (maximumRms < 0.00003) throw new Error("这个片段接近静音，无法识别乐谱。");
  onProgress(1);
  return {
    duration: samples.length / SPECTRUM_RATE,
    hopSeconds: hop / SPECTRUM_RATE,
    windowSeconds: n / SPECTRUM_RATE,
    frames,
  };
}

if (
  typeof globalThis.WorkerGlobalScope !== "undefined" &&
  globalThis instanceof globalThis.WorkerGlobalScope
) {
  globalThis.onmessage = (event) => {
    try {
      const spectrum = audioSpectrum(new Float32Array(event.data.samples), {
        onProgress: (progress) =>
          globalThis.postMessage({ type: "progress", progress }),
      });
      globalThis.postMessage({ type: "result", spectrum });
    } catch (error) {
      globalThis.postMessage({
        type: "error",
        message: error.message || "音频频谱分析失败。",
      });
    }
  };
}
