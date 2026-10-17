import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  noteEventsToScore,
  estimateTempo,
  resolveAudioSegment,
  resampleMono,
  transcribeSamples,
  TRANSCRIPTION_SAMPLE_RATE,
} from "../lib/transcription.mjs";

const event = (
  pitchMidi,
  startTimeSeconds,
  durationSeconds = 0.5,
  amplitude = 0.8,
) => ({ pitchMidi, startTimeSeconds, durationSeconds, amplitude });

test("quantization preserves real pitches, both hands and rests without adding accompaniment", () => {
  const events = [
    event(48, 0.51, 1.04),
    event(60, 0.51),
    event(64, 0.52),
    event(67, 0.51),
    event(72, 2.03, 0.23),
  ];
  const { score, warnings } = noteEventsToScore(events, {
    tempo: 120,
    duration: 3,
    grid: "1/16",
  });
  assert.deepEqual(
    score.notes.map((n) => n.midi).sort((a, b) => a - b),
    [48, 60, 64, 67, 72],
  );
  assert.equal(score.notes[0].beat, 1);
  assert.equal(score.notes[0].hand, "left");
  assert.equal(score.notes.find((n) => n.midi === 72).beat, 4);
  assert.ok(
    score.notes.filter((n) => n.beat > 2 && n.beat < 4).length === 0,
    "the rest remains a rest",
  );
  assert.equal(score.source.kind, "audio-transcription");
  assert.ok(warnings.some((warning) => warning.includes("校对")));
});

test("melody mode selects actual high notes and never fabricates a low accompaniment", () => {
  const { score } = noteEventsToScore(
    [event(48, 0), event(60, 0), event(67, 0), event(72, 0.5)],
    { tempo: 120, duration: 2, mode: "melody" },
  );
  assert.deepEqual(
    score.notes.map((n) => n.midi),
    [67, 72],
  );
  assert.ok(score.notes.every((n) => n.hand === "right"));
});

test("segment selection is bounded before running a model and silence produces no score", async () => {
  assert.deepEqual(resolveAudioSegment(300, 50, 80), {
    start: 50,
    end: 80,
    duration: 30,
  });
  assert.throws(() => resolveAudioSegment(300, 0, 121), /120/);
  assert.throws(() => resolveAudioSegment(10, 5, 4), /起止时间/);
  await assert.rejects(
    transcribeSamples(new Float32Array(TRANSCRIPTION_SAMPLE_RATE)),
    /静音/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    transcribeSamples(new Float32Array(TRANSCRIPTION_SAMPLE_RATE), {
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
});

test("tempo is a labeled estimate and resampling downmixes channels", () => {
  const estimate = estimateTempo(
    Array.from({ length: 9 }, (_, index) => event(60, index * 0.5)),
  );
  assert.ok(Math.abs(estimate.tempo - 120) <= 1);
  assert.ok(estimate.confidence > 0.8);
  assert.equal(estimateTempo([event(60, 0)]).confidence, 0);
  const mixed = resampleMono(
    [Float32Array.from([1, 0, -1, 0]), Float32Array.from([0, 1, 0, -1])],
    4,
    2,
  );
  assert.deepEqual([...mixed], [0.5, -0.5]);
});

/** Deterministic struck-string PCM fixture, not note events passed to a fake model. */
function pianoFixture() {
  const samples = new Float32Array(Math.round(2.5 * TRANSCRIPTION_SAMPLE_RATE));
  for (const [midi, onset, duration, volume] of [
    [48, 0.2, 1.8, 0.18],
    [60, 0.2, 0.75, 0.2],
    [64, 0.2, 0.75, 0.18],
    [67, 0.2, 0.75, 0.18],
    [72, 1.25, 0.65, 0.24],
  ]) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const begin = Math.round(onset * TRANSCRIPTION_SAMPLE_RATE),
      length = Math.round(duration * TRANSCRIPTION_SAMPLE_RATE);
    for (let offset = 0; offset < length; offset++) {
      const t = offset / TRANSCRIPTION_SAMPLE_RATE;
      const envelope =
        Math.min(1, t / 0.008) *
        Math.min(1, (duration - t) / 0.08) *
        Math.exp(-t * 1.9);
      let value = 0;
      for (let harmonic = 1; harmonic <= 5; harmonic++)
        value +=
          (1 / harmonic ** 2.3) *
          Math.sin(2 * Math.PI * frequency * harmonic * t);
      samples[begin + offset] += value * envelope * volume;
    }
  }
  return samples;
}

test(
  "official local neural model recognizes a PCM piano chord and later high note",
  { timeout: 180000 },
  async () => {
    const require = createRequire(import.meta.url);
    const modelDirectory = join(
      dirname(require.resolve("@spotify/basic-pitch/package.json")),
      "model",
    );
    const json = JSON.parse(
      await readFile(join(modelDirectory, "model.json"), "utf8"),
    );
    const bytes = await readFile(join(modelDirectory, "group1-shard1of1.bin"));
    const stages = [];
    const result = await transcribeSamples(pianoFixture(), {
      backend: "cpu",
      tempo: 120,
      grid: "1/16",
      title: "回归用原创和弦",
      onProgress: (progress) => stages.push(progress.stage),
      modelArtifacts: {
        ...json,
        weightSpecs: json.weightsManifest.flatMap((g) => g.weights),
        weightData: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      },
    });
    const early = new Set(
      result.score.notes.filter((n) => n.beat < 1.5).map((n) => n.midi),
    );
    assert.ok(
      early.has(60) && early.has(64) && early.has(67),
      `expected C-major chord, received ${[...early]}`,
    );
    assert.ok(
      result.score.notes.some((n) => n.midi === 72 && n.beat >= 2),
      "the later C5 is detected from audio",
    );
    assert.ok(result.analysis.engine.includes("Spotify Basic Pitch"));
    assert.ok(stages.includes("inference") && stages.at(-1) === "done");
  },
);

test(
  "the same real piano chord runs on the local WASM model without CPU fallback",
  { timeout: 180000 },
  async () => {
    const require = createRequire(import.meta.url);
    const modelDirectory = join(
      dirname(require.resolve("@spotify/basic-pitch/package.json")),
      "model",
    );
    const json = JSON.parse(
      await readFile(join(modelDirectory, "model.json"), "utf8"),
    );
    const bytes = await readFile(join(modelDirectory, "group1-shard1of1.bin"));
    const result = await transcribeSamples(pianoFixture(), {
      backend: "wasm",
      tempo: 120,
      wasmPath: `${dirname(require.resolve("@tensorflow/tfjs-backend-wasm/package.json"))}/dist/`,
      modelArtifacts: {
        ...json,
        weightSpecs: json.weightsManifest.flatMap((g) => g.weights),
        weightData: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      },
    });
    assert.ok(
      result.analysis.engine.includes("WASM"),
      "the accelerated backend must complete the model, not quietly fall back",
    );
    const chord = new Set(
      result.score.notes.filter((n) => n.beat < 1.5).map((n) => n.midi),
    );
    assert.ok(
      [60, 64, 67].every((midi) => chord.has(midi)),
      `expected C-major chord, received ${[...chord]}`,
    );
    assert.ok(result.score.notes.some((n) => n.midi === 72 && n.beat >= 2));
  },
);
