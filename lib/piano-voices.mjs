export const DEFAULT_PIANO_INSTRUMENT = 'piano';

export const PIANO_INSTRUMENTS = Object.freeze([
  Object.freeze({ id: 'piano', label: '标准钢琴', engine: 'samples', description: '真实 Salamander 三角钢琴采样，保留原始音色。' }),
  Object.freeze({ id: 'soft', label: '柔和钢琴', engine: 'samples', description: '同一真实钢琴采样，降低高频并柔化触键。' }),
  Object.freeze({ id: 'bright', label: '明亮钢琴', engine: 'samples', description: '同一真实钢琴采样，突出高频与触键轮廓。' }),
  Object.freeze({ id: 'synth', label: '轻量合成', engine: 'synth', description: '无需加载采样，以谐波合成发声。' }),
]);

const PROFILES = Object.freeze({
  piano: { gain: 0.82, cutoff: 18500, shelf: 0, attack: 0.003, release: 0.3, velocityExponent: 1.35 },
  soft: { gain: 0.79, cutoff: 4700, shelf: -5.5, attack: 0.012, release: 0.48, velocityExponent: 1.65 },
  bright: { gain: 0.74, cutoff: 19500, shelf: 4.5, attack: 0.002, release: 0.24, velocityExponent: 1.1 },
});

export function pianoInstrument(id) {
  const instrument = PIANO_INSTRUMENTS.find(item => item.id === id);
  if (!instrument) throw new Error('请选择有效的钢琴音色。');
  return instrument;
}

export function pianoSampleProfile(id) { return PROFILES[id]; }

const absoluteURL = value => new URL(value, globalThis.location?.href || 'http://localhost/').href;
const hashBuffer = async bytes => {
  if (!globalThis.crypto?.subtle) throw new Error('钢琴采样校验需要 localhost 或 HTTPS，请通过本地启动器打开应用。');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

/** A per-AudioContext shared decoded sample pool; all three presets reuse it. */
export class PianoSampleBank {
  constructor(context, options = {}) {
    this.context = context;
    this.manifestURL = absoluteURL(options.manifestURL || '/audio/piano/manifest.json');
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
      if (!response.ok) throw new Error('钢琴采样清单加载失败，请重试或选择轻量合成。');
      manifest = await response.json();
    }
    if (!Array.isArray(manifest?.samples) || !manifest.samples.length || manifest.samples.length > 88) {
      throw new Error('钢琴采样清单无效。');
    }
    const base = new URL('.', this.manifestURL);
    const seen = new Set();
    this._samples = manifest.samples.map(sample => {
      const midi = Number(sample.midi);
      if (!Number.isInteger(midi) || midi < 21 || midi > 108 || seen.has(midi)) throw new Error('钢琴采样根音清单无效。');
      seen.add(midi);
      const file = sample.url || sample.file || `${encodeURIComponent(sample.note)}.mp3`;
      if (typeof file !== 'string' || !file || /[\u0000-\u001f]/.test(file)) throw new Error('钢琴采样路径无效。');
      const url = new URL(file, base);
      if (url.origin !== base.origin) throw new Error('钢琴采样必须从本应用本地资源加载。');
      if (sample.sha256 && !/^[a-f0-9]{64}$/i.test(sample.sha256)) throw new Error('钢琴采样校验信息无效。');
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
        if (!response.ok) throw new Error(`钢琴采样 ${sample.note || sample.midi} 加载失败，请重试。`);
        const bytes = await response.arrayBuffer();
        if (sample.bytes && bytes.byteLength !== sample.bytes) throw new Error('钢琴采样文件不完整，请重新准备音源。');
        if (sample.sha256 && await hashBuffer(bytes) !== sample.sha256.toLowerCase()) throw new Error('钢琴采样校验失败，请重新准备音源。');
        if (signal.aborted) throw new DOMException('采样加载已取消。', 'AbortError');
        let buffer;
        try { buffer = await this.context.decodeAudioData(bytes.slice(0)); }
        catch { throw new Error(`无法解码钢琴采样 ${sample.note || sample.midi}，请重试或选择轻量合成。`); }
        if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('钢琴采样内容无效。');
        if (signal.aborted) throw new DOMException('采样加载已取消。', 'AbortError');
        this._buffers.set(sample.midi, buffer);
        notify();
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, this._samples.length) }, consume));
    this.ready = true;
  }

  sampleFor(midi) {
    if (!this.ready) throw new Error('真实钢琴采样尚未准备好。');
    const sample = this._samples.reduce((best, item) => Math.abs(item.midi - midi) < Math.abs(best.midi - midi) ? item : best);
    return { midi: sample.midi, buffer: this._buffers.get(sample.midi) };
  }

  dispose() {
    this._controller?.abort();
    this._listeners.clear();
    this._buffers.clear();
    this.ready = false;
  }
}
