import { assetURL } from "../lib/asset-url.mjs";
import {
  MAX_TRANSCRIPTION_SECONDS,
  TRANSCRIPTION_SAMPLE_RATE,
  resolveAudioSegment,
  resampleMono,
} from "../lib/transcription.mjs";
export { MAX_TRANSCRIPTION_SECONDS };

const decodedFiles = new WeakMap();
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const checkAbort = (signal) => {
  if (signal?.aborted) throw new DOMException("已取消音频转谱。", "AbortError");
};

async function decodedAudio(file) {
  if (!file || typeof file.arrayBuffer !== "function")
    throw new Error("请选择音频文件。");
  if (file.size > MAX_AUDIO_BYTES)
    throw new Error("音频文件须小于 100 MB；长录音请先裁剪。");
  if (decodedFiles.has(file)) return decodedFiles.get(file);
  const promise = (async () => {
    const AudioContext =
      globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext)
      throw new Error(
        "当前浏览器不支持音频解码，请使用新版 Chrome、Edge 或 Safari。",
      );
    const context = new AudioContext();
    try {
      const data = await file.arrayBuffer();
      return await context.decodeAudioData(data);
    } catch {
      throw new Error(
        "无法解码这个音频。请选择浏览器支持的 WAV、MP3、M4A、OGG 或 FLAC 文件。",
      );
    } finally {
      await context.close();
    }
  })();
  decodedFiles.set(file, promise);
  try {
    return await promise;
  } catch (error) {
    decodedFiles.delete(file);
    throw error;
  }
}

/** Decode locally and reuse that exact buffer for the subsequent selected clip. */
export async function analyzeAudio(file) {
  const audio = await decodedAudio(file);
  const waveform = Array.from({ length: 100 }, (_, bin) => {
    const from = Math.floor((bin * audio.length) / 100),
      to = Math.floor(((bin + 1) * audio.length) / 100);
    const stride = Math.max(1, Math.floor((to - from) / 256));
    let peak = 0;
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const data = audio.getChannelData(channel);
      for (let index = from; index < to; index += stride)
        peak = Math.max(peak, Math.abs(data[index]));
    }
    return Math.min(1, peak);
  });
  return {
    duration: audio.duration,
    sampleRate: audio.sampleRate,
    channels: audio.numberOfChannels,
    waveform,
  };
}

async function clipMono(audio, segment) {
  const begin = Math.floor(segment.start * audio.sampleRate);
  const end = Math.min(audio.length, Math.ceil(segment.end * audio.sampleRate));
  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) =>
    audio.getChannelData(index).subarray(begin, end),
  );
  const OfflineContext =
    globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OfflineContext) return resampleMono(channels, audio.sampleRate);
  const offline = new OfflineContext(
    1,
    Math.round(segment.duration * TRANSCRIPTION_SAMPLE_RATE),
    TRANSCRIPTION_SAMPLE_RATE,
  );
  const mono = offline.createBuffer(1, end - begin, audio.sampleRate);
  const values = mono.getChannelData(0);
  for (const channel of channels)
    for (let index = 0; index < values.length; index++)
      values[index] += channel[index] / channels.length;
  const source = offline.createBufferSource();
  source.buffer = mono;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

export async function transcribeAudio(file, options = {}) {
  const { signal, onProgress = () => {} } = options;
  checkAbort(signal);
  onProgress({ stage: "decode", progress: 0.02, message: "正在本地解码音频…" });
  const audio = await decodedAudio(file);
  checkAbort(signal);
  const segment = resolveAudioSegment(
    audio.duration,
    options.startSeconds,
    options.endSeconds,
  );
  onProgress({
    stage: "resample",
    progress: 0.07,
    message: `正在准备 ${segment.duration.toFixed(1)} 秒的音频片段…`,
  });
  const samples = await clipMono(audio, segment);
  checkAbort(signal);
  if (!globalThis.Worker)
    throw new Error(
      "当前浏览器不支持后台音符识别，请使用新版 Chrome、Edge 或 Safari。",
    );
  const worker = new Worker(
    new URL("../lib/transcription.mjs", import.meta.url),
    { type: "module", name: "qinban-local-piano-transcription" },
  );
  return await new Promise((resolve, reject) => {
    let finished = false;
    const settle = (error, result) => {
      if (finished) return;
      finished = true;
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(result);
    };
    const onAbort = () =>
      settle(new DOMException("已取消音频转谱。", "AbortError"));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    worker.onmessage = (event) => {
      if (event.data.type === "progress") onProgress(event.data.progress);
      if (event.data.type === "result") settle(null, event.data.result);
      if (event.data.type === "error") {
        const error = new Error(event.data.error.message);
        error.name = event.data.error.name;
        if (event.data.error.stack) error.stack = event.data.error.stack;
        settle(error);
      }
    };
    worker.onerror = () =>
      settle(new Error("本地音频识别进程未能启动，请重新加载页面后重试。"));
    worker.postMessage(
      {
        type: "transcribe",
        samples: samples.buffer,
        options: {
          title:
            options.title || `${file.name.replace(/\.[^.]+$/, "")} · 钢琴转谱`,
          tempo: options.tempo || 0,
          grid: options.grid || "1/16",
          mode: options.mode || "piano",
          startSeconds: segment.start,
          onsetThreshold: options.onsetThreshold ?? 0.5,
          frameThreshold: options.frameThreshold ?? 0.3,
          modelUrl: new URL(assetURL("/models/basic-pitch/model.json"), globalThis.location.origin).href,
          wasmPath: new URL(assetURL("/models/basic-pitch/"), globalThis.location.origin).href,
        },
      },
      [samples.buffer],
    );
  });
}
