import { assetURL } from "./asset-url.mjs";
export const DEFAULT_PIANO_INSTRUMENT = "warm";

export const SAMPLE_BANK_URLS = Object.freeze({
  piano: "/audio/piano/manifest.json",
  violin: "/audio/violin/manifest.json",
  strings: "/audio/strings/manifest.json",
});

export const PIANO_INSTRUMENTS = Object.freeze([
  Object.freeze({
    id: "warm",
    label: "醇厚三角钢琴",
    engine: "samples",
    bank: "piano",
    description:
      "参考 Steinway 的醇厚听感：饱满低音、宽厚低中频、圆润触键与收敛的空间共鸣，基于 Salamander 钢琴录音调音。",
  }),
  Object.freeze({
    id: "a3-reference",
    label: "A3 参考三角钢琴",
    engine: "samples",
    bank: "piano",
    description:
      "参考指定视频 2:55 的 Steinway Model A3：凝聚的中低音、清楚而圆润的触键与集中声场。基于 Salamander 录音调音，并非 A3 原琴采样。",
  }),
  Object.freeze({
    id: "kawai-gx2",
    label: "KAWAI GX-2 参考三角钢琴",
    engine: "samples",
    bank: "piano",
    referenceURL: "https://www.youtube.com/watch?v=1InOnhNR4-A",
    description:
      "GX-2 方向调音：深沉低音、圆润中频、通透高音与适量共鸣。基于 Salamander 录音，并非 KAWAI 原琴采样。",
  }),
  Object.freeze({
    id: "kawai-sk2",
    label: "KAWAI SK-2 参考三角钢琴",
    engine: "samples",
    bank: "piano",
    referenceURL: "https://www.youtube.com/watch?v=1InOnhNR4-A",
    description:
      "SK-2 方向调音：宽厚琴体、柔和弱奏与更舒展的延音。基于 Salamander 录音，并非 KAWAI 原琴采样。",
  }),
  Object.freeze({
    id: "yamaha-gc1",
    label: "YAMAHA GC1 参考三角钢琴",
    engine: "samples",
    bank: "piano",
    referenceURL: "https://www.youtube.com/watch?v=wewYucuyvdI",
    description:
      "GC1 方向调音：清楚触键、明亮中高音与紧凑释音。基于 Salamander 录音，并非 GC1 原琴采样。",
  }),
  Object.freeze({
    id: "steinway-model40",
    label: "Steinway Model 40 雅致小直立琴（参考）",
    engine: "samples",
    bank: "piano",
    referenceURL: "https://www.youtube.com/watch?v=roZrorWI1aQ",
    description:
      "Model 40 Hepplewhite 方向调音：集中中频、克制低音、短释音与近距离声场。基于 Salamander 三角琴录音，并非 Model 40 直立琴原琴采样。",
  }),
  Object.freeze({
    id: "violin",
    label: "温暖小提琴",
    engine: "samples",
    bank: "violin",
    description:
      "真实独奏小提琴录音与自然揉弦；短音利落、长音柔和起弓，同声部相接旋律柔化换弓，持续音保留轻微弓压起伏。",
  }),
  Object.freeze({
    id: "strings",
    label: "柔和弦乐合奏",
    engine: "samples",
    bank: "strings",
    description:
      "按音区使用低音提琴、大提琴、中提琴与小提琴组录音，柔和起音与宽阔空间。",
  }),
  Object.freeze({
    id: "piano",
    label: "标准钢琴",
    engine: "samples",
    bank: "piano",
    description: "真实 Salamander 三角钢琴采样，保留原始音色。",
  }),
  Object.freeze({
    id: "soft",
    label: "柔和钢琴",
    engine: "samples",
    bank: "piano",
    description: "同一真实钢琴采样，降低高频并柔化触键。",
  }),
  Object.freeze({
    id: "bright",
    label: "明亮钢琴",
    engine: "samples",
    bank: "piano",
    description: "同一真实钢琴采样，突出高频与触键轮廓。",
  }),
  Object.freeze({
    id: "synth",
    label: "轻量合成",
    engine: "synth",
    description: "无需加载采样，以谐波合成发声。",
  }),
]);

const PROFILES = Object.freeze({
  warm: {
    gain: 0.82,
    cutoff: 9300,
    velocityCutoff: 3900,
    shelf: -4.2,
    body: 3.0,
    bodyFrequency: 260,
    bodyQ: 0.65,
    // Weight comes from the fundamental and soundboard region, with sub-bass
    // and boxiness controlled before the shared room and master compressor.
    eq: [
      { type: "highpass", frequency: 28, Q: 0.707 },
      { type: "lowshelf", frequency: 150, gain: 1.8 },
      { type: "peaking", frequency: 650, Q: 0.8, gain: -1.0 },
    ],
    attack: 0.008,
    release: 0.74,
    bassRelease: 0.96,
    trebleRelease: 0.48,
    velocityExponent: 1.4,
    room: { wet: 0.16, decay: 1.5, lowCut: 160, highCut: 4200 },
  },
  "a3-reference": {
    // Directional reference: LivingPianosVideos, Model A3, 2:55–3:25.
    // This remains the licensed Salamander bank, with no video audio bundled.
    gain: 1.05,
    cutoff: 10500,
    velocityCutoff: 4400,
    shelf: -3.6,
    body: 3.4,
    bodyFrequency: 330,
    bodyQ: 0.7,
    eq: [
      { type: "highpass", frequency: 32, Q: 0.707 },
      { type: "lowshelf", frequency: 145, gain: 0.7 },
      { type: "peaking", frequency: 780, Q: 0.85, gain: -1.4 },
    ],
    attack: 0.005,
    release: 0.76,
    bassRelease: 0.88,
    trebleRelease: 0.62,
    velocityExponent: 1.4,
    room: {
      wet: 0.12,
      decay: 1.25,
      lowCut: 180,
      highCut: 4600,
      stereoWidth: 0.4,
    },
  },
  "kawai-gx2": {
    gain: 0.9,
    cutoff: 11800,
    velocityCutoff: 3800,
    shelf: -1.6,
    body: 2.3,
    bodyFrequency: 290,
    bodyQ: 0.65,
    eq: [
      { type: "highpass", frequency: 30, Q: 0.707 },
      { type: "lowshelf", frequency: 160, gain: 1.4 },
      { type: "peaking", frequency: 820, Q: 0.8, gain: -1.2 },
      { type: "peaking", frequency: 2300, Q: 0.7, gain: 0.6 },
    ],
    attack: 0.007,
    release: 0.66,
    bassRelease: 0.82,
    trebleRelease: 0.42,
    velocityExponent: 1.45,
    room: {
      wet: 0.13,
      decay: 1.3,
      lowCut: 170,
      highCut: 4400,
      stereoWidth: 0.65,
    },
  },
  "kawai-sk2": {
    gain: 0.91,
    cutoff: 11800,
    velocityCutoff: 5400,
    shelf: -2.4,
    body: 3.1,
    bodyFrequency: 240,
    bodyQ: 0.55,
    eq: [
      { type: "highpass", frequency: 28, Q: 0.707 },
      { type: "lowshelf", frequency: 130, gain: 1.3 },
      { type: "peaking", frequency: 720, Q: 0.85, gain: -1.5 },
    ],
    attack: 0.006,
    release: 0.82,
    bassRelease: 1.02,
    trebleRelease: 0.59,
    velocityExponent: 1.6,
    room: {
      wet: 0.17,
      decay: 1.6,
      lowCut: 160,
      highCut: 4900,
      stereoWidth: 0.8,
    },
  },
  "yamaha-gc1": {
    gain: 0.83,
    cutoff: 15100,
    velocityCutoff: 4600,
    shelf: 0.8,
    body: 0.9,
    bodyFrequency: 380,
    bodyQ: 0.75,
    eq: [
      { type: "highpass", frequency: 34, Q: 0.707 },
      { type: "lowshelf", frequency: 140, gain: -0.8 },
      { type: "peaking", frequency: 1800, Q: 0.7, gain: 0.9 },
    ],
    attack: 0.003,
    release: 0.48,
    bassRelease: 0.62,
    trebleRelease: 0.3,
    velocityExponent: 1.3,
    room: {
      wet: 0.09,
      decay: 1.05,
      lowCut: 200,
      highCut: 5400,
      stereoWidth: 0.6,
    },
  },
  "steinway-model40": {
    gain: 0.94,
    cutoff: 10100,
    velocityCutoff: 3000,
    shelf: -2.1,
    body: 2.3,
    bodyFrequency: 540,
    bodyQ: 0.8,
    eq: [
      { type: "highpass", frequency: 48, Q: 0.707 },
      { type: "lowshelf", frequency: 170, gain: -2.7 },
      { type: "peaking", frequency: 1450, Q: 0.9, gain: 1.1 },
    ],
    attack: 0.004,
    release: 0.34,
    bassRelease: 0.44,
    trebleRelease: 0.23,
    velocityExponent: 1.4,
    room: {
      wet: 0.07,
      decay: 0.85,
      lowCut: 240,
      highCut: 3900,
      stereoWidth: 0.22,
    },
  },
  violin: {
    gain: 0.92,
    cutoff: 9600,
    velocityCutoff: 2800,
    shelf: -2.0,
    body: 1.2,
    bodyFrequency: 460,
    bodyQ: 0.8,
    eq: [
      { type: "highpass", frequency: 160, Q: 0.707 },
      { type: "peaking", frequency: 3100, Q: 1.1, gain: -2.0 },
    ],
    attack: 0.06,
    release: 0.18,
    velocityExponent: 1.25,
    bowed: {
      shortAttack: 0.014,
      shortRelease: 0.045,
      transition: 0.028,
      swell: 0.045,
      swellHz: 0.65,
    },
    room: {
      wet: 0.12,
      decay: 1.3,
      lowCut: 220,
      highCut: 5800,
      stereoWidth: 0.7,
    },
  },
  strings: {
    gain: 0.9,
    cutoff: 8800,
    velocityCutoff: 1800,
    shelf: -2.3,
    body: 1.2,
    attack: 0.095,
    release: 0.46,
    velocityExponent: 1.2,
    room: { wet: 0.18, decay: 1.65 },
  },
  piano: {
    gain: 0.82,
    cutoff: 18500,
    shelf: 0,
    attack: 0.003,
    release: 0.3,
    velocityExponent: 1.35,
  },
  soft: {
    gain: 0.79,
    cutoff: 4700,
    shelf: -5.5,
    attack: 0.012,
    release: 0.48,
    velocityExponent: 1.65,
  },
  bright: {
    gain: 0.74,
    cutoff: 19500,
    shelf: 4.5,
    attack: 0.002,
    release: 0.24,
    velocityExponent: 1.1,
  },
});

export function pianoInstrument(id) {
  const instrument = PIANO_INSTRUMENTS.find((item) => item.id === id);
  if (!instrument) throw new Error("请选择有效的乐器音色。");
  return instrument;
}

export function pianoSampleProfile(id) {
  return PROFILES[id];
}

/** Low strings ring longer; treble damping keeps fast passages articulate. */
export function pianoReleaseSeconds(profile, midi) {
  if (profile.bassRelease === undefined || profile.trebleRelease === undefined)
    return profile.release;
  const register = Math.max(0, Math.min(1, (midi - 45) / 39));
  return (
    profile.bassRelease +
    (profile.trebleRelease - profile.bassRelease) * register
  );
}

const absoluteURL = (value) =>
  new URL(value, globalThis.location?.href || "http://localhost/").href;
const hashBuffer = async (bytes) => {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "音色采样校验需要 localhost 或 HTTPS，请通过本地启动器打开应用。",
    );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

/** A per-AudioContext decoded pool; presets of the same bank share recordings. */
export class PianoSampleBank {
  constructor(context, options = {}) {
    this.context = context;
    this.manifestURL = absoluteURL(
      options.manifestURL || assetURL("/audio/piano/manifest.json"),
    );
    this.fetch = options.fetcher || ((...args) => globalThis.fetch(...args));
    this._providedManifest = options.manifest;
    this._buffers = new Map();
    this.ready = false;
    this._listeners = new Set();
    this._progress = { loaded: 0, total: 0, progress: 0 };
  }

  async load(onProgress = () => {}) {
    if (this.ready) {
      onProgress({ ...this._progress });
      return this;
    }
    this._listeners.add(onProgress);
    onProgress({ ...this._progress });
    if (!this._promise) {
      this._controller = new AbortController();
      this._promise = this._load().catch((error) => {
        this._controller.abort();
        throw error;
      });
    }
    try {
      await this._promise;
      return this;
    } finally {
      this._listeners.delete(onProgress);
      if (!this.ready) this._promise = null;
    }
  }

  async _load() {
    const signal = this._controller.signal;
    let manifest = this._providedManifest;
    if (!manifest) {
      const response = await this.fetch(this.manifestURL, { signal });
      if (!response.ok)
        throw new Error("音色采样清单加载失败，请重试或选择轻量合成。");
      manifest = await response.json();
    }
    if (
      !Array.isArray(manifest?.samples) ||
      !manifest.samples.length ||
      manifest.samples.length > 88
    ) {
      throw new Error("音色采样清单无效。");
    }
    const base = new URL(".", this.manifestURL);
    const seen = new Set();
    this._samples = manifest.samples
      .map((sample) => {
        const midi = Number(sample.midi);
        if (
          !Number.isInteger(midi) ||
          midi < 21 ||
          midi > 108 ||
          seen.has(midi)
        )
          throw new Error("音色采样根音清单无效。");
        seen.add(midi);
        const file =
          sample.url || sample.file || `${encodeURIComponent(sample.note)}.mp3`;
        if (typeof file !== "string" || !file || /[\u0000-\u001f]/.test(file))
          throw new Error("音色采样路径无效。");
        const url = new URL(file, base);
        if (url.origin !== base.origin)
          throw new Error("音色采样必须从本应用本地资源加载。");
        if (sample.sha256 && !/^[a-f0-9]{64}$/i.test(sample.sha256))
          throw new Error("音色采样校验信息无效。");
        if (
          (sample.loopStart !== undefined || sample.loopEnd !== undefined) &&
          !(
            Number.isFinite(sample.loopStart) &&
            sample.loopStart >= 0 &&
            Number.isFinite(sample.loopEnd) &&
            sample.loopEnd > sample.loopStart + 0.05
          )
        ) {
          throw new Error("弦乐采样循环区间无效。");
        }
        if (
          sample.pan !== undefined &&
          !(Number.isFinite(sample.pan) && Math.abs(sample.pan) <= 1)
        )
          throw new Error("音色采样声像无效。");
        return { ...sample, midi, url: url.href };
      })
      .sort((a, b) => a.midi - b.midi);
    this.label = String(manifest.label || "Salamander Grand Piano");
    let cursor = 0;
    const notify = () => {
      const loaded = this._samples.filter((sample) =>
        this._buffers.has(sample.midi),
      ).length;
      this._progress = {
        loaded,
        total: this._samples.length,
        progress: loaded / this._samples.length,
      };
      for (const listener of this._listeners) listener({ ...this._progress });
    };
    notify();
    const consume = async () => {
      while (cursor < this._samples.length) {
        const sample = this._samples[cursor++];
        if (this._buffers.has(sample.midi)) continue;
        const response = await this.fetch(sample.url, { signal });
        if (!response.ok)
          throw new Error(
            `音色采样 ${sample.note || sample.midi} 加载失败，请重试。`,
          );
        const bytes = await response.arrayBuffer();
        if (sample.bytes && bytes.byteLength !== sample.bytes)
          throw new Error("音色采样文件不完整，请重新准备音源。");
        if (
          sample.sha256 &&
          (await hashBuffer(bytes)) !== sample.sha256.toLowerCase()
        )
          throw new Error("音色采样校验失败，请重新准备音源。");
        if (signal.aborted)
          throw new DOMException("采样加载已取消。", "AbortError");
        let buffer;
        try {
          buffer = await this.context.decodeAudioData(bytes.slice(0));
        } catch {
          throw new Error(
            `无法解码音色采样 ${sample.note || sample.midi}，请重试或选择轻量合成。`,
          );
        }
        if (
          !buffer ||
          !Number.isFinite(buffer.duration) ||
          buffer.duration <= 0
        )
          throw new Error("音色采样内容无效。");
        if (sample.loopEnd !== undefined && sample.loopEnd > buffer.duration)
          throw new Error("弦乐采样循环超出录音长度。");
        if (signal.aborted)
          throw new DOMException("采样加载已取消。", "AbortError");
        this._buffers.set(sample.midi, buffer);
        notify();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, this._samples.length) }, consume),
    );
    this.ready = true;
  }

  sampleFor(midi) {
    if (!this.ready) throw new Error("乐器采样尚未准备好。");
    const sample = this._samples.reduce((best, item) =>
      Math.abs(item.midi - midi) < Math.abs(best.midi - midi) ? item : best,
    );
    return { ...sample, buffer: this._buffers.get(sample.midi) };
  }

  dispose() {
    this._controller?.abort();
    this._listeners.clear();
    this._buffers.clear();
    this.ready = false;
  }
}
