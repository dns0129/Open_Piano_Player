import { decodedAudio, clipMono } from "./audio-transcription.js";
import { resolveAudioSegment } from "../lib/transcription.mjs";

export async function transcribeWithPi(file, options, api) {
  const { signal, onProgress = () => {} } = options;
  signal.throwIfAborted();
  onProgress({ progress: 0.02, message: "正在准备所选音频片段…" });
  const audio = await decodedAudio(file);
  signal.throwIfAborted();
  const segment = resolveAudioSegment(
    audio.duration,
    options.startSeconds,
    options.endSeconds,
  );
  const samples = await clipMono(audio, segment);
  signal.throwIfAborted();
  const spectrum = await new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../lib/audio-spectrum.mjs", import.meta.url),
      { type: "module", name: "qinban-audio-spectrum" },
    );
    const done = (error, value) => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const abort = () =>
      done(new DOMException("已取消音频转谱。", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress")
        onProgress({
          progress: 0.05 + data.progress * 0.35,
          message: "正在提取频谱证据…",
        });
      else if (data.type === "result") done(null, data.spectrum);
      else if (data.type === "error") done(new Error(data.message));
    };
    worker.onerror = () =>
      done(new Error("频谱分析未能启动，请刷新页面重试。"));
    worker.postMessage({ samples: samples.buffer }, [samples.buffer]);
  });
  signal.throwIfAborted();
  onProgress({
    progress: 0.45,
    message:
      "正在通过 Pi 调用 GPT-6.1 Sol high 推断音符和速度，可能需要数分钟…",
  });
  const result = await api(
    "/api/audio/transcribe",
    {
      spectrum,
      title: options.title,
      tempo: options.tempo,
      mode: options.mode,
      grid: options.grid,
      startSeconds: segment.start,
    },
    signal,
  );
  signal.throwIfAborted();
  if (
    result.provider !== "pi" ||
    result.model !== "gpt-6.1-sol" ||
    result.reasoningEffort !== "high" ||
    !Array.isArray(result.requestAudit) ||
    !result.requestAudit.length ||
    result.requestAudit.some(
      (entry) =>
        entry.model !== "gpt-6.1-sol" || entry.reasoningEffort !== "high",
    )
  )
    throw new Error("无法确认 Pi 的模型和思考强度，本次结果未使用。");
  onProgress({ progress: 1, message: "转写完成，请对照原音校对。" });
  return result;
}
