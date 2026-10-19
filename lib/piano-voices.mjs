import { assetURL } from './asset-url.mjs';
export const DEFAULT_PIANO_INSTRUMENT = 'warm';

export const SAMPLE_BANK_URLS = Object.freeze({
  piano: '/audio/piano/manifest.json',
  violin: '/audio/violin/manifest.json',
  strings: '/audio/strings/manifest.json',
});

export const PIANO_INSTRUMENTS = Object.freeze([
  Object.freeze({ id: 'warm', label: '醇厚三角钢琴', engine: 'samples', bank: 'piano', description: '参考 Steinway 的醇厚听感：温暖低中频、圆润触键与自然空间共鸣，基于 Salamander 钢琴录音调音。' }),
  Object.freeze({ id: 'violin', label: '温暖小提琴', engine: 'samples', bank: 'violin', description: '真实独奏小提琴录音，保留弓弦质感与自然揉弦，柔和起弓并持续长音。' }),
  Object.freeze({ id: 'strings', label: '柔和弦乐合奏', engine: 'samples', bank: 'strings', description: '按音区使用低音提琴、大提琴、中提琴与小提琴组录音，柔和起音与宽阔空间。' }),
  Object.freeze({ id: 'piano', label: '标准钢琴', engine: 'samples', bank: 'piano', description: '真实 Salamander 三角钢琴采样，保留原始音色。' }),
  Object.freeze({ id: 'soft', label: '柔和钢琴', engine: 'samples', bank: 'piano', description: '同一真实钢琴采样，降低高频并柔化触键。' }),
  Object.freeze({ id: 'bright', label: '明亮钢琴', engine: 'samples', bank: 'piano', description: '同一真实钢琴采样，突出高频与触键轮廓。' }),
  Object.freeze({ id: 'synth', label: '轻量合成', engine: 'synth', description: '无需加载采样，以谐波合成发声。' }),
]);

const PROFILES = Object.freeze({
  warm: { gain: 0.92, cutoff: 10200, velocityCutoff: 4300, shelf: -3.2, body: 2.1, attack: 0.006, release: 0.66, velocityExponent: 1.4, room: { wet: 0.13, decay: 1.35 } },
  violin: { gain: 0.96, cutoff: 10800, velocityCutoff: 1600, shelf: -1.6, body: 0.8, attack: 0.035, release: 0.2, velocityExponent: 1.15, room: { wet: 0.11, decay: 1.25 } },
  strings: { gain: 0.9, cutoff: 8800, velocityCutoff: 1800, shelf: -2.3, body: 1.2, attack: 0.095, release: 0.46, velocityExponent: 1.2, room: { wet: 0.18, decay: 1.65 } },
  piano: { gain: 0.82, cutoff: 18500, shelf: 0, attack: 0.003, release: 0.3, velocityExponent: 1.35 },
  soft: { gain: 0.79, cutoff: 4700, shelf: -5.5, attack: 0.012, release: 0.48, velocityExponent: 1.65 },
  bright: { gain: 0.74, cutoff: 19500, shelf: 4.5, attack: 0.002, release: 0.24, velocityExponent: 1.1 },
});

export function pianoInstrument(id) {
  const instrument = PIANO_INSTRUMENTS.find(item => item.id === id);
  if (!instrument) throw new Error('请选择有效的乐器音色。');
  return instrument;
}

export function pianoSampleProfile(id) { return PROFILES[id]; }

const absoluteURL = value => new URL(value, globalThis.location?.href || 'http://localhost/').href;
const hashBuffer = async bytes => {
  if (!globalThis.crypto?.subtle) throw new Error('音色采样校验需要 localhost 或 HTTPS，请通过本地启动器打开应用。');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

/** A per-AudioContext decoded pool; presets of the same bank share recordings. */
export class PianoSampleBank {
  constructor(context, options = {}) {
    this.context = context;
    this.manifestURL = absoluteURL(options.manifestURL || assetURL('/audio/piano/manifest.json'));
    this.fetch = options.fetcher || ((...args) => globalThis.fetch(...args));
    this._providedManifest = options.manifest;
    this._buffers = new Map();
    this.ready = false;
    this._listeners = new Set();
    this._progress = { loaded: 0, total: 0, progress: 0 };
  }

  async load(onProgress = () => {}) {
    if (this.ready) { onProgress({ ...this._progress }); return this; }
    this._listeners.add(onProgress);
    onProgress({ ...this._progress });
    if (!this._promise) {
      this._controller = new AbortController();
      this._promise = this._load().catch(error => { this._controller.abort(); throw error; });
    }
    try { await this._promise; return this; }
    finally {
      this._listeners.delete(onProgress);
      if (!this.ready) this._promise = null;
    }
  }

  async _load() {
    const signal = this._controller.signal;
    let manifest = this._providedManifest;
    if (!manifest) {
      const response = await this.fetch(this.manifestURL, { signal });
      if (!response.ok) throw new Error('音色采样清单加载失败，请重试或选择轻量合成。');
      manifest = await response.json();
    }
    if (!Array.isArray(manifest?.samples) || !manifest.samples.length || manifest.samples.length > 88) {
      throw new Error('音色采样清单无效。');
    }
    const base = new URL('.', this.manifestURL);
    const seen = new Set();
    this._samples = manifest.samples.map(sample => {
      const midi = Number(sample.midi);
      if (!Number.isInteger(midi) || midi < 21 || midi > 108 || seen.has(midi)) throw new Error('音色采样根音清单无效。');
      seen.add(midi);
      const file = sample.url || sample.file || `${encodeURIComponent(sample.note)}.mp3`;
      if (typeof file !== 'string' || !file || /[\u0000-\u001f]/.test(file)) throw new Error('音色采样路径无效。');
      const url = new URL(file, base);
      if (url.origin !== base.origin) throw new Error('音色采样必须从本应用本地资源加载。');
      if (sample.sha256 && !/^[a-f0-9]{64}$/i.test(sample.sha256)) throw new Error('音色采样校验信息无效。');
      if ((sample.loopStart !== undefined || sample.loopEnd !== undefined) &&
        !(Number.isFinite(sample.loopStart) && sample.loopStart >= 0 && Number.isFinite(sample.loopEnd) && sample.loopEnd > sample.loopStart + 0.05)) {
        throw new Error('弦乐采样循环区间无效。');
      }
      if (sample.pan !== undefined && !(Number.isFinite(sample.pan) && Math.abs(sample.pan) <= 1)) throw new Error('音色采样声像无效。');
      return { ...sample, midi, url: url.href };
    }).sort((a, b) => a.midi - b.midi);
    this.label = String(manifest.label || 'Salamander Grand Piano');
    let cursor = 0;
    const notify = () => {
      const loaded = this._samples.filter(sample => this._buffers.has(sample.midi)).length;
      this._progress = { loaded, total: this._samples.length, progress: loaded / this._samples.length };
      for (const listener of this._listeners) listener({ ...this._progress });
    };
    notify();
    const consume = async () => {
      while (cursor < this._samples.length) {
        const sample = this._samples[cursor++];
        if (this._buffers.has(sample.midi)) continue;
        const response = await this.fetch(sample.url, { signal });
        if (!response.ok) throw new Error(`音色采样 ${sample.note || sample.midi} 加载失败，请重试。`);
        const bytes = await response.arrayBuffer();
        if (sample.bytes && bytes.byteLength !== sample.bytes) throw new Error('音色采样文件不完整，请重新准备音源。');
        if (sample.sha256 && await hashBuffer(bytes) !== sample.sha256.toLowerCase()) throw new Error('音色采样校验失败，请重新准备音源。');
        if (signal.aborted) throw new DOMException('采样加载已取消。', 'AbortError');
        let buffer;
        try { buffer = await this.context.decodeAudioData(bytes.slice(0)); }
        catch { throw new Error(`无法解码音色采样 ${sample.note || sample.midi}，请重试或选择轻量合成。`); }
        if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('音色采样内容无效。');
        if (sample.loopEnd !== undefined && sample.loopEnd > buffer.duration) throw new Error('弦乐采样循环超出录音长度。');
        if (signal.aborted) throw new DOMException('采样加载已取消。', 'AbortError');
        this._buffers.set(sample.midi, buffer);
        notify();
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, this._samples.length) }, consume));
    this.ready = true;
  }

  sampleFor(midi) {
    if (!this.ready) throw new Error('乐器采样尚未准备好。');
    const sample = this._samples.reduce((best, item) => Math.abs(item.midi - midi) < Math.abs(best.midi - midi) ? item : best);
    return { ...sample, buffer: this._buffers.get(sample.midi) };
  }

  dispose() {
    this._controller?.abort();
    this._listeners.clear();
    this._buffers.clear();
    this.ready = false;
  }
}
