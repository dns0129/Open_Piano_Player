import { validateScore } from "./score.mjs";

export const TRANSCRIPTION_SAMPLE_RATE = 22050;
export const MAX_TRANSCRIPTION_SECONDS = 120;
export const BASIC_PITCH_VERSION = "1.0.1";
export const MODEL_SHA256 = Object.freeze({
  "model.json":
    "1ed1aaee3409ec1dc098c8b01f430c0911f6fe9412e7af8086750f9e8f302f68",
  "group1-shard1of1.bin":
    "b142a95737a52e1e412d5f92e73d8bb80dfe8d04941acc0702f11f4524fb377c",
});
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const round = (n) => Math.round(n * 1000000) / 1000000;
const abort = (signal) => {
  if (signal?.aborted) throw new DOMException("已取消音频转谱。", "AbortError");
};

export function resolveAudioSegment(
  duration,
  startSeconds = 0,
  endSeconds = duration,
) {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("音频没有可读取的时长。");
  const start = Number(startSeconds ?? 0),
    end = Number(endSeconds ?? duration);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > duration + 0.01 ||
    end <= start
  ) {
    throw new Error("请选择音频时长以内有效的起止时间。");
  }
  if (end - start > MAX_TRANSCRIPTION_SECONDS + 0.001)
    throw new Error("每次最多转谱 120 秒，请先选择音频片段。");
  if (end - start < 0.25) throw new Error("请选择至少 0.25 秒的音频片段。");
  return {
    start,
    end: Math.min(end, duration),
    duration: Math.min(end, duration) - start,
  };
}

/** Pure fallback for browsers without OfflineAudioContext; channels are clipped first. */
export function resampleMono(
  channels,
  sourceRate,
  targetRate = TRANSCRIPTION_SAMPLE_RATE,
) {
  if (
    !channels.length ||
    !channels[0].length ||
    sourceRate <= 0 ||
    targetRate <= 0
  )
    throw new Error("音频采样数据无效。");
  const length = channels[0].length;
  const output = new Float32Array(
    Math.round((length * targetRate) / sourceRate),
  );
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < output.length; i++) {
    const position = i * ratio,
      left = Math.floor(position),
      fraction = position - left;
    let value = 0;
    for (const channel of channels)
      value +=
        channel[left] * (1 - fraction) +
        channel[Math.min(left + 1, channel.length - 1)] * fraction;
    output[i] = value / channels.length;
  }
  return output;
}

/** Estimate pulse from model note onsets. Half/double-time ambiguity is reported. */
export function estimateTempo(events) {
  const starts = events
    .map((n) => n.startTimeSeconds)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const attacks = starts.filter((n, i) => !i || n - starts[i - 1] > 0.055);
  const intervals = [];
  for (let i = 1; i < attacks.length; i++) {
    const delta = attacks[i] - attacks[i - 1];
    if (delta >= 0.12 && delta <= 2.4) intervals.push(delta);
  }
  if (intervals.length < 3)
    return {
      tempo: 90,
      confidence: 0,
      reason: "有效起音较少，默认使用 90 BPM",
    };
  let best = { tempo: 90, score: -Infinity };
  for (let tempo = 55; tempo <= 180; tempo++) {
    let fit = 0;
    for (const delta of intervals) {
      const beats = (delta * tempo) / 60;
      const half = Math.round(beats * 2) / 2;
      const error = Math.abs(beats - half);
      const fullBeat = Math.abs(half - Math.round(half)) < 0.001;
      fit += Math.exp(-((error / 0.065) ** 2)) * (fullBeat ? 1 : 0.77);
    }
    fit /= intervals.length;
    fit -= Math.abs(Math.log2(tempo / 100)) * 0.045;
    if (fit > best.score) best = { tempo, score: fit };
  }
  return {
    tempo: best.tempo,
    confidence: clamp(best.score, 0, 1),
    reason: "由识别音符的起音间隔估计，可能有半速或倍速歧义",
  };
}

/** Krumhansl pitch-class correlation; it never modifies recognized pitches. */
export function estimateKeySignature(events) {
  const histogram = Array(12).fill(0);
  for (const n of events)
    histogram[((n.pitchMidi % 12) + 12) % 12] +=
      n.durationSeconds * (n.amplitude || 0.5);
  const profiles = [
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  ];
  const correlation = (a, b) => {
    const am = a.reduce((s, x) => s + x, 0) / 12,
      bm = b.reduce((s, x) => s + x, 0) / 12;
    let cross = 0,
      av = 0,
      bv = 0;
    for (let i = 0; i < 12; i++) {
      const x = a[i] - am,
        y = b[i] - bm;
      cross += x * y;
      av += x * x;
      bv += y * y;
    }
    return cross / Math.sqrt(av * bv || 1);
  };
  let best = { score: -Infinity, tonic: 0, minor: false };
  for (let minor = 0; minor < 2; minor++)
    for (let tonic = 0; tonic < 12; tonic++) {
      const profile = Array.from(
        { length: 12 },
        (_, pc) => profiles[minor][(pc - tonic + 12) % 12],
      );
      const score = correlation(histogram, profile);
      if (score > best.score) best = { score, tonic, minor: Boolean(minor) };
    }
  const relativeMajor = (best.tonic + (best.minor ? 3 : 0)) % 12;
  const fifths = [0, -5, 2, -3, 4, -1, -6, 1, -4, 3, -2, 5][relativeMajor];
  return {
    keySignature: fifths,
    confidence: clamp(best.score, 0, 1),
    minor: best.minor,
  };
}

export function noteEventsToScore(events, options = {}) {
  const duration = options.duration;
  const usable = events.filter(
    (n) =>
      Number.isFinite(n.startTimeSeconds) &&
      n.durationSeconds >= 0.055 &&
      Number.isInteger(n.pitchMidi) &&
      n.pitchMidi >= 21 &&
      n.pitchMidi <= 108 &&
      Number.isFinite(n.amplitude) &&
      n.amplitude >= 0.12 &&
      n.startTimeSeconds >= 0 &&
      (!duration || n.startTimeSeconds < duration),
  );
  if (!usable.length)
    throw new Error(
      "没有识别到稳定的钢琴音符。请尝试更清晰的独奏片段，或缩短选择范围。",
    );
  if (!["1/8", "1/16", undefined].includes(options.grid))
    throw new Error("量化网格只能选择八分或十六分音符。");
  if (!["piano", "melody", undefined].includes(options.mode))
    throw new Error("转谱模式无效。");
  const estimate = estimateTempo(usable);
  const requestedTempo = Number(options.tempo || 0);
  if (
    requestedTempo !== 0 &&
    (!Number.isFinite(requestedTempo) ||
      requestedTempo < 20 ||
      requestedTempo > 240)
  )
    throw new Error("速度须为 20–240 BPM，或使用自动估计。");
  const tempo = requestedTempo || estimate.tempo;
  const step = options.grid === "1/8" ? 0.5 : 0.25;
  const unique = new Map();
  for (const event of usable) {
    const beat = Math.max(
      0,
      Math.round((event.startTimeSeconds * tempo) / 60 / step) * step,
    );
    const available = duration
      ? Math.min(event.durationSeconds, duration - event.startTimeSeconds)
      : event.durationSeconds;
    const length = Math.max(
      step,
      Math.round((available * tempo) / 60 / step) * step,
    );
    const key = `${beat}:${event.pitchMidi}`;
    const note = {
      id: `audio-note-${unique.size}`,
      beat: round(beat),
      duration: round(length),
      midi: event.pitchMidi,
      hand: event.pitchMidi < 60 ? "left" : "right",
      velocity: round(clamp(event.amplitude, 0.15, 1)),
    };
    const previous = unique.get(key);
    if (previous) {
      previous.duration = Math.max(previous.duration, note.duration);
      previous.velocity = Math.max(previous.velocity, note.velocity);
    } else unique.set(key, note);
  }
  let notes = [...unique.values()].sort(
    (a, b) => a.beat - b.beat || a.midi - b.midi,
  );
  if (options.mode === "melody") {
    const byOnset = new Map();
    for (const note of notes) {
      const previous = byOnset.get(note.beat);
      if (!previous || note.midi > previous.midi) byOnset.set(note.beat, note);
    }
    notes = [...byOnset.values()].sort((a, b) => a.beat - b.beat);
    notes.forEach((note, index) => {
      const next = notes[index + 1];
      if (next) note.duration = Math.min(note.duration, next.beat - note.beat);
      note.hand = "right";
    });
  }
  // Repeated attacks of the same key cannot overlap after quantization.
  const lastPitch = new Map();
  for (const note of notes) {
    const previous = lastPitch.get(note.midi);
    if (previous && previous.beat + previous.duration > note.beat)
      previous.duration = round(note.beat - previous.beat);
    lastPitch.set(note.midi, note);
  }
  if (notes.length > 10000)
    throw new Error("识别结果超过 10000 个音符，请缩短片段后再试。");
  const key = estimateKeySignature(usable);
  const warnings = [
    "这是对原音频的自动转写；复杂和弦、踏板、混响和人声可能造成漏音、错音或多余音符，请对照原音频校对。",
    `拍号暂设 4/4；调号按音高分布估计，节奏已量化到${step === 0.5 ? "八分" : "十六分"}音符。`,
    options.mode === "melody"
      ? "主旋律模式仅保留每次起音的最高识别音，不会创作或补充伴奏。"
      : "左右手按中央 C 的音区启发式划分，并非真实指法或演奏分手。",
  ];
  if (!requestedTempo)
    warnings.push(
      `速度估计为 ${tempo} BPM；${estimate.reason}，可手动设置后重新转谱。`,
    );
  if (key.confidence < 0.6)
    warnings.push(
      "调号估计依据较弱，显示调号可能需要修改；音符的实际音高未因此改变。",
    );
  const score = validateScore({
    version: 1,
    id: `audio-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`,
    title: options.title || "音频钢琴转谱",
    composer: "音频自动转谱（待校对）",
    tempo,
    timeSignature: [4, 4],
    keySignature: key.keySignature,
    source: {
      kind: "audio-transcription",
      label: "用户音频 · 自动转谱，需校对",
    },
    notes,
    durationBeats: Math.max(...notes.map((n) => round(n.beat + n.duration))),
  });
  return {
    score,
    warnings,
    analysis: {
      duration,
      tempo,
      noteCount: notes.length,
      detectedNoteCount: usable.length,
      tempoEstimated: !requestedTempo,
      tempoConfidence: estimate.confidence,
      startSeconds: options.startSeconds || 0,
      endSeconds: (options.startSeconds || 0) + (duration || 0),
      engine: options.engine || `Spotify Basic Pitch ${BASIC_PITCH_VERSION}`,
    },
  };
}

async function verifiedModelArtifacts(modelUrl, signal, onProgress) {
  const base = new URL(".", modelUrl);
  if (globalThis.location?.origin && base.origin !== globalThis.location.origin)
    throw new Error("模型必须从本应用本地资源加载。");
  const read = async (name) => {
    const response = await fetch(new URL(name, base), { signal });
    if (!response.ok)
      throw new Error("本地转谱模型尚未准备好，请重新启动应用完成资源准备。");
    const bytes = await response.arrayBuffer();
    if (!globalThis.crypto?.subtle)
      throw new Error(
        "转谱模型校验需要安全浏览器环境，请通过 localhost 或 HTTPS 打开应用。",
      );
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== MODEL_SHA256[name])
      throw new Error("本地音频转谱模型校验失败，请重新准备模型资源。");
    return bytes;
  };
  const json = JSON.parse(new TextDecoder().decode(await read("model.json")));
  onProgress?.({
    stage: "model",
    progress: 0.13,
    message: "正在校验本地模型权重…",
  });
  const weights = await read("group1-shard1of1.bin");
  return {
    ...json,
    weightSpecs: json.weightsManifest.flatMap((group) => group.weights),
    weightData: weights,
  };
}

/** Real neural-network transcription; Float32Array must contain 22050 Hz mono audio. */
export async function transcribeSamples(samples, options = {}) {
  const { signal, onProgress } = options;
  abort(signal);
  const onsetThreshold = Number(options.onsetThreshold ?? 0.5);
  const frameThreshold = Number(options.frameThreshold ?? 0.3);
  if (
    ![onsetThreshold, frameThreshold].every(
      (value) => Number.isFinite(value) && value >= 0.1 && value <= 0.9,
    )
  ) {
    throw new Error("识别阈值须为 0.10–0.90。");
  }
  if (
    !(samples instanceof Float32Array) ||
    samples.length < TRANSCRIPTION_SAMPLE_RATE / 4 ||
    samples.length > TRANSCRIPTION_SAMPLE_RATE * MAX_TRANSCRIPTION_SECONDS + 1
  )
    throw new Error("转谱音频须为 0.25–120 秒的 22050 Hz 单声道数据。");
  let peak = 0,
    sum = 0;
  for (const value of samples) {
    if (!Number.isFinite(value)) throw new Error("音频采样数据含无效数值。");
    peak = Math.max(peak, Math.abs(value));
    sum += value * value;
  }
  if (peak < 0.0001 || Math.sqrt(sum / samples.length) < 0.00003)
    throw new Error("这个片段接近静音，无法识别出乐谱。");
  const tfNamespace = await import("@tensorflow/tfjs");
  const tf = tfNamespace.tensor ? tfNamespace : tfNamespace.default;
  let backend = options.backend || "wasm";
  if (backend === "wasm") {
    try {
      const wasm = await import("@tensorflow/tfjs-backend-wasm");
      wasm.setWasmPaths(
        options.wasmPath ||
          new URL(
            ".",
            options.modelUrl ||
              `${globalThis.location.origin}/models/basic-pitch/model.json`,
          ).href,
      );
      if (!(await tf.setBackend("wasm")))
        throw new Error("WASM backend unavailable");
      await tf.ready();
    } catch {
      backend = "cpu";
      onProgress?.({
        stage: "model",
        progress: 0.1,
        message: "当前设备使用本地 CPU 识别，处理时间可能较长…",
      });
    }
  }
  if (backend !== "wasm") await tf.setBackend(backend);
  await tf.ready();
  abort(signal);
  onProgress?.({
    stage: "model",
    progress: 0.11,
    message: "正在加载本地 Basic Pitch 音符识别模型…",
  });
  const artifacts =
    options.modelArtifacts ||
    (!options.model
      ? await verifiedModelArtifacts(options.modelUrl, signal, onProgress)
      : null);
  const wasmFailure = (error) =>
    tf.getBackend() === "wasm" &&
    error.name !== "AbortError" &&
    /kernel|dtype|not implemented|unsupported|wasm|memory access|unreachable/i.test(
      error.message,
    );
  const fallbackCPU = async (error) => {
    console.debug(
      "[音频转谱] WASM compatibility fallback:",
      error.stack || error.message,
    );
    onProgress?.({
      stage: "model",
      progress: 0.16,
      message: "设备加速器不支持此模型运算，正在改用本地 CPU…",
    });
    await tf.setBackend("cpu");
    await tf.ready();
  };
  const loadModel = async () => {
    const candidate = new tf.GraphModel(tf.io.fromMemory(artifacts));
    try {
      await candidate.load();
      return candidate;
    } catch (error) {
      try {
        candidate.dispose();
      } catch {
        /* partially loaded graph */
      }
      throw error;
    }
  };
  let model = options.model;
  if (!model) {
    try {
      model = await loadModel();
    } catch (error) {
      if (!wasmFailure(error)) throw error;
      abort(signal);
      await fallbackCPU(error);
      model = await loadModel();
    }
  }
  const packageNamespace = await import("@spotify/basic-pitch");
  const { BasicPitch, outputToNotesPoly, noteFramesToTime } =
    packageNamespace.BasicPitch ? packageNamespace : packageNamespace.default;
  class TypedPaddingBasicPitch extends BasicPitch {
    async prepareData(input) {
      // Equivalent to upstream zero-prefix + tf.signal.frame(..., padEnd=true).
      // TFJS 3.21 signal.frame calls fill without a dtype; its WASM Fill kernel
      // rejects this as "Unknown dtype undefined". Preframe PCM and explicitly
      // use float32, without changing the neural model or its window alignment.
      const windowSamples = TRANSCRIPTION_SAMPLE_RATE * 2 - 256;
      const hopSamples = windowSamples - 30 * 256;
      const leadingSamples = 15 * 256;
      const count = Math.ceil((input.length + leadingSamples) / hopSamples);
      const packed = new Float32Array(count * windowSamples);
      for (let window = 0; window < count; window++) {
        const origin = window * hopSamples - leadingSamples;
        const first = Math.max(0, origin),
          last = Math.min(input.length, origin + windowSamples);
        if (last > first)
          packed.set(
            input.subarray(first, last),
            window * windowSamples + first - origin,
          );
      }
      return [
        tf.tensor3d(packed, [count, windowSamples, 1], "float32"),
        input.length,
      ];
    }
  }
  const predictor = new TypedPaddingBasicPitch(Promise.resolve(model));
  const frames = [],
    onsets = [];
  // The upstream implementation leaves window tensors alive. Scope them so every
  // success/error/cancellation releases temporary tensors; model weights are outside.
  const evaluate = async () => {
    tf.engine().startScope();
    try {
      await predictor.evaluateModel(
        samples,
        (f, o) => {
          frames.push(...f);
          onsets.push(...o);
        },
        (p) => {
          abort(signal);
          onProgress?.({
            stage: "inference",
            progress: 0.18 + p * 0.67,
            message: `本地识别音符 ${Math.round(p * 100)}% · ${tf.getBackend().toUpperCase()}`,
          });
        },
      );
    } finally {
      tf.engine().endScope();
    }
  };
  try {
    try {
      await evaluate();
    } catch (error) {
      if (!wasmFailure(error)) throw error;
      abort(signal);
      frames.length = 0;
      onsets.length = 0;
      await fallbackCPU(error);
      await evaluate();
    }
    abort(signal);
    onProgress?.({
      stage: "notation",
      progress: 0.9,
      message: "正在提取和弦、量化节奏并生成钢琴谱…",
    });
    const noteEvents = noteFramesToTime(
      outputToNotesPoly(
        frames,
        onsets,
        onsetThreshold,
        frameThreshold,
        5,
        true,
        4186.1,
        27.5,
        true,
      ),
    );
    const result = noteEventsToScore(noteEvents, {
      ...options,
      duration: samples.length / TRANSCRIPTION_SAMPLE_RATE,
      engine: `Spotify Basic Pitch ${BASIC_PITCH_VERSION} · TensorFlow.js ${tf.getBackend().toUpperCase()} · 本地多音识别`,
    });
    onProgress?.({
      stage: "done",
      progress: 1,
      message: `已识别 ${result.score.notes.length} 个音符，等待校对。`,
    });
    return result;
  } finally {
    if (!options.model) model.dispose();
  }
}

// The same module is a Vite-bundled dedicated worker; no audio or metadata leaves
// this browser. Terminating the worker immediately cancels model execution.
if (
  typeof globalThis.WorkerGlobalScope !== "undefined" &&
  globalThis instanceof globalThis.WorkerGlobalScope
) {
  globalThis.onmessage = async (event) => {
    if (event.data?.type !== "transcribe") return;
    try {
      const result = await transcribeSamples(
        new Float32Array(event.data.samples),
        {
          ...event.data.options,
          onProgress: (progress) =>
            globalThis.postMessage({ type: "progress", progress }),
        },
      );
      globalThis.postMessage({ type: "result", result });
    } catch (error) {
      globalThis.postMessage({
        type: "error",
        error: {
          name: error.name,
          message: error.message || "音频识别失败。",
          stack: error.stack,
        },
      });
    }
  };
}
