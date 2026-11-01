import { Agent } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { models, provider, sharedCredential, markVerified } from "./auth.mjs";
import { SCORE_RECOGNITION, recognitionStream } from "./recognition-policy.mjs";
import { validateScore } from "./score.mjs";
import { userError } from "./settings.mjs";

const invalid = (message = "频谱数据无效，请重新选择音频。") =>
  userError(message, "INVALID_AUDIO_SPECTRUM", 422);
const finite = (n, min, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const round = (n) => Math.round(n * 1000000) / 1000000;

export function validateAudioSpectrum(input) {
  const spectrum = input?.spectrum;
  if (
    !spectrum ||
    !finite(spectrum.duration, 0.25, 120.01) ||
    !finite(spectrum.hopSeconds, 0.095, 0.105) ||
    !finite(spectrum.windowSeconds, 0.36, 0.39) ||
    !Array.isArray(spectrum.frames)
  )
    throw invalid();
  const expected = Math.ceil(spectrum.duration / spectrum.hopSeconds);
  if (spectrum.frames.length !== expected || expected > 1201) throw invalid();
  for (const [index, frame] of spectrum.frames.entries()) {
    if (
      !Array.isArray(frame) ||
      frame.length !== 3 ||
      !finite(frame[0], 0, spectrum.duration) ||
      Math.abs(frame[0] - index * spectrum.hopSeconds) > 0.002 ||
      !finite(frame[1], -120, 5) ||
      !Array.isArray(frame[2]) ||
      frame[2].length > 20
    )
      throw invalid();
    for (const peak of frame[2])
      if (
        !Array.isArray(peak) ||
        peak.length !== 2 ||
        !finite(peak[0], 20, 5010) ||
        !finite(peak[1], -72, 5)
      )
        throw invalid();
  }
  if (!spectrum.frames.some((f) => f[2].length))
    throw invalid("这个片段没有可辨识的频谱，请更换清晰音源。");
  if (
    !["piano", "melody"].includes(input.mode) ||
    !["1/8", "1/16"].includes(input.grid)
  )
    throw invalid("转谱选项无效。");
  const tempo = Number(input.tempo || 0);
  if (!finite(tempo, 0, 240) || (tempo !== 0 && tempo < 20))
    throw invalid("速度须为 20–240 BPM，或留空让模型估计。");
  const start = Number(input.startSeconds || 0);
  if (!finite(start, 0, 86400)) throw invalid();
  return {
    spectrum,
    mode: input.mode,
    grid: input.grid,
    tempo,
    startSeconds: start,
    title: String(input.title || "音频转写").slice(0, 180),
  };
}

export function audioModelResultToScore(raw, input) {
  if (
    !raw ||
    raw.complete !== true ||
    !Array.isArray(raw.notes) ||
    !raw.notes.length ||
    raw.notes.length > 3000
  )
    throw userError(
      "Pi 未能完整识别所选片段，请缩短范围或更换清晰音源。",
      "INCOMPLETE_AUDIO",
      422,
    );
  if (
    !finite(raw.tempo, 0, 240) ||
    (raw.tempo !== 0 && raw.tempo < 20) ||
    !Number.isInteger(raw.keySignature) ||
    !finite(raw.keySignature, -7, 7) ||
    typeof raw.keyKnown !== "boolean" ||
    !["major", "minor", "unknown"].includes(raw.mode) ||
    typeof raw.meterKnown !== "boolean" ||
    !Array.isArray(raw.timeSignature) ||
    raw.timeSignature.length !== 2 ||
    !Number.isInteger(raw.timeSignature[0]) ||
    !finite(raw.timeSignature[0], 1, 16) ||
    ![1, 2, 4, 8, 16].includes(raw.timeSignature[1])
  )
    throw userError(
      "Pi 返回的速度或调号无效，请重试。",
      "INVALID_AUDIO_RESULT",
      422,
    );
  const tempo = input.tempo || raw.tempo || 90;
  const step = input.grid === "1/8" ? 0.5 : 0.25;
  const notes = raw.notes.map((event, index) => {
    if (
      !event ||
      typeof event !== "object" ||
      !Number.isInteger(event.midi) ||
      !finite(event.midi, 21, 108) ||
      !finite(event.startSeconds, 0, input.spectrum.duration) ||
      event.startSeconds >= input.spectrum.duration ||
      !finite(event.durationSeconds, 0.03, input.spectrum.duration + 0.05) ||
      event.startSeconds + event.durationSeconds >
        input.spectrum.duration + 0.05 ||
      !["left", "right"].includes(event.hand)
    )
      throw userError(
        "Pi 返回的音符或时间超出选定范围，请重试。",
        "INVALID_AUDIO_RESULT",
        422,
      );
    const beat = Math.max(
      0,
      Math.round((event.startSeconds * tempo) / 60 / step) * step,
    );
    const duration = Math.max(
      step,
      Math.round((event.durationSeconds * tempo) / 60 / step) * step,
    );
    return {
      id: `pi-audio-${index}`,
      midi: event.midi,
      beat: round(beat),
      duration: round(duration),
      hand: event.hand,
      velocity: 0.75,
    };
  });
  const score = validateScore({
    version: 1,
    id: `audio-${globalThis.crypto.randomUUID()}`,
    title: input.title,
    composer: "Pi 音频频谱转写（待校对）",
    tempo,
    timeSignature: raw.meterKnown ? raw.timeSignature : [4, 4],
    keySignature: raw.keyKnown ? raw.keySignature : 0,
    ...(raw.keyKnown && raw.mode !== "unknown" ? { mode: raw.mode } : {}),
    source: {
      kind: "audio-transcription",
      label: "用户音频 · Pi 频谱转写，需校对",
      reviewRequired: true,
    },
    notes,
    durationBeats: Math.max(
      Math.ceil((input.spectrum.duration * tempo) / 60 / step) * step,
      ...notes.map((n) => n.beat + n.duration),
    ),
  });
  const warnings = [
    "这是 Pi 根据频谱推断的实验性草稿，模型没有直接听到音频；请对照原音检查音高、节奏与遗漏。",
    "频谱包含泛音，和弦、低音、人声及混音尤其容易错判；力度使用统一值。",
    input.mode === "melody"
      ? "主旋律由模型推断，可能遗漏或误选声部。"
      : "左右手由模型估计，不代表实际演奏指法。",
  ];
  if (!input.tempo && !raw.tempo)
    warnings.push("模型无法确定速度，暂用 90 BPM，请手动指定后重新转谱。");
  else if (!input.tempo)
    warnings.push(`模型估计速度为 ${tempo} BPM，可能存在半速或倍速歧义。`);
  if (!raw.keyKnown) warnings.push("模型无法确定调号，暂不标调号。");
  if (!raw.meterKnown) warnings.push("模型无法确定拍号，暂按 4/4 显示。");
  if (Array.isArray(raw.warnings))
    warnings.push(
      ...raw.warnings
        .filter((w) => typeof w === "string")
        .slice(0, 4)
        .map((w) => w.slice(0, 180)),
    );
  return {
    score,
    warnings,
    analysis: {
      duration: input.spectrum.duration,
      startSeconds: input.startSeconds,
      endSeconds: input.startSeconds + input.spectrum.duration,
      engine: "Pi Agent · GPT-6.1 Sol high · 频谱推断",
      keyKnown: raw.keyKnown,
      meterKnown: raw.meterKnown,
      noteCount: notes.length,
    },
  };
}

const noteSchema = Type.Object({
  midi: Type.Integer({ minimum: 21, maximum: 108 }),
  startSeconds: Type.Number({ minimum: 0 }),
  durationSeconds: Type.Number({ minimum: 0.03 }),
  hand: Type.Union([Type.Literal("left"), Type.Literal("right")]),
});
const outputSchema = Type.Object({
  complete: Type.Boolean(),
  tempo: Type.Number({ minimum: 0, maximum: 240 }),
  keyKnown: Type.Boolean(),
  keySignature: Type.Integer({ minimum: -7, maximum: 7 }),
  mode: Type.Union([
    Type.Literal("major"),
    Type.Literal("minor"),
    Type.Literal("unknown"),
  ]),
  meterKnown: Type.Boolean(),
  timeSignature: Type.Array(Type.Integer(), { minItems: 2, maxItems: 2 }),
  notes: Type.Array(noteSchema, { maxItems: 3000 }),
  warnings: Type.Array(Type.String({ maxLength: 180 }), { maxItems: 4 }),
});
const instructions = `你是音频频谱转写助手。你不能直接听音频，只能根据用户提供的短时傅里叶频谱测量进行推断。每一帧为 [片段内秒数, RMS分贝, [[频率Hz,强度dBFS],...]]，相邻帧约0.1秒，分析窗口约0.37秒。频率峰可能是泛音而非独立音符，单音往往同时出现整数倍频；注意随时间出现和消失的基频、起音、持续音和休止。低频分辨率有限，多声部可能有遗漏。MIDI 69 = 440Hz，MIDI = 69 + 12*log2(Hz/440)。不得根据歌名、记忆或常见曲目补音。按提供的完整片段识别：每个音符的开始与持续时间使用片段内秒数，MIDI 21–108；可同时给多个音符，手别仅为估计。由实际起音推断速度、调号和拍号，无法判断速度时 tempo=0，调号未知时 keyKnown=false、keySignature=0、mode=unknown，拍号未知时 meterKnown=false、timeSignature=[4,4]。主旋律模式只提交证据支持的旋律。无法覆盖完整片段时 complete=false，不要杜撰。使用 submit_transcription 提交结构化结果。`;

export function createPiAudioTranscriber({
  modelsImpl = models,
  credentialReader = sharedCredential,
  agentFactory = (options) => new Agent(options),
  verified = markVerified,
} = {}) {
  return async function transcribe(
    raw,
    { signal = AbortSignal.timeout(SCORE_RECOGNITION.timeoutMs) } = {},
  ) {
    const input = validateAudioSpectrum(raw);
    await credentialReader();
    const model = modelsImpl.getModel(provider, SCORE_RECOGNITION.model);
    if (!model)
      throw userError(
        "GPT-6.1 Sol 暂不可用，请检查 Pi / Codex 登录与账户权限。",
        "PI_MODEL_UNAVAILABLE",
        503,
      );
    let result,
      turns = 0;
    const requestAudit = [];
    const agent = agentFactory({
      initialState: {
        systemPrompt: instructions,
        model,
        thinkingLevel: SCORE_RECOGNITION.reasoningEffort,
        tools: [
          {
            name: "submit_transcription",
            label: "提交音频频谱转写",
            description: "提交频谱支持的完整音符和速度，不能猜测无依据的片段。",
            parameters: outputSchema,
            async execute(_id, args) {
              result = audioModelResultToScore(args, input);
              return {
                content: [{ type: "text", text: "转写草稿已接收。" }],
                details: { accepted: true },
                terminate: true,
              };
            },
          },
        ],
      },
      streamFn: recognitionStream(
        (...args) => modelsImpl.streamSimple(...args),
        (audit) => requestAudit.push(audit),
      ),
      toolExecution: "sequential",
      finishTurn: () =>
        result || ++turns >= 3 ? { action: "end" } : undefined,
    });
    const abort = () => agent.abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      signal.throwIfAborted();
      await agent.prompt({
        role: "user",
        content: [
          {
            type: "text",
            text: `转写模式：${input.mode === "melody" ? "主旋律" : "钢琴／可辨识的同时发声音符"}。${input.tempo ? `用户指定速度 ${input.tempo} BPM。` : "请由音频估计速度。"}频谱如下（时间从所选片段起点开始）：\n${JSON.stringify(input.spectrum)}`,
          },
        ],
        timestamp: Date.now(),
      });
      signal.throwIfAborted();
      if (!result) {
        const last = agent.state.messages
          .filter((m) => m.role === "assistant")
          .at(-1);
        throw userError(
          last?.errorMessage
            ? "Pi 音频转写请求未完成，请检查模型连接或重试。"
            : "Pi 未提交可用的转写结果，请缩短片段后重试。",
          "AUDIO_MODEL_FAILED",
          422,
        );
      }
      if (!requestAudit.length)
        throw userError(
          "无法核实 Pi 的模型与思考强度，本次结果未使用。",
          "AUDIO_MODEL_UNVERIFIED",
          502,
        );
      verified(model.id);
      return {
        ...result,
        provider: "pi",
        model: model.id,
        reasoningEffort: SCORE_RECOGNITION.reasoningEffort,
        requestAudit,
      };
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };
}
export const transcribePiAudio = createPiAudioTranscriber();
