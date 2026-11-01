import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { audioSpectrum, SPECTRUM_RATE } from "../lib/audio-spectrum.mjs";
import {
  validateAudioSpectrum,
  audioModelResultToScore,
  createPiAudioTranscriber,
} from "../lib/pi-audio-transcription.mjs";
import { decodeMedia } from "../lib/audio-media.mjs";
import { createAppServer } from "../server.mjs";
import { safeFetch } from "../lib/safe-network.mjs";
import { exportMidi, exportMusicXML } from "../lib/exporters.mjs";
import { importMidi, importMusicXML } from "../lib/importers.mjs";
import { boot } from "./app-harness.mjs";

function sine(duration = 1, hz = 440) {
  const samples = new Float32Array(Math.round(SPECTRUM_RATE * duration));
  for (let i = 0; i < samples.length; i++)
    samples[i] = 0.3 * Math.sin((2 * Math.PI * hz * i) / SPECTRUM_RATE);
  return samples;
}
const audioInput = (spectrum = audioSpectrum(sine())) => ({
  spectrum,
  title: "练习片段",
  tempo: 0,
  grid: "1/16",
  mode: "piano",
  startSeconds: 5,
});
const modelResult = {
  complete: true,
  tempo: 120,
  keyKnown: true,
  keySignature: 0,
  mode: "major",
  meterKnown: true,
  timeSignature: [4, 4],
  notes: [{ midi: 69, startSeconds: 0.1, durationSeconds: 0.5, hand: "right" }],
  warnings: [],
};

test("frequency evidence is extracted from PCM without fabricating notes", () => {
  const spectrum = audioSpectrum(sine());
  assert.equal(spectrum.frames.length, 10);
  assert.ok(Math.abs(spectrum.frames[4][2][0][0] - 440) < 1);
  assert.equal(spectrum.frames[4][2][0][1], -12);
  assert.deepEqual(
    validateAudioSpectrum(audioInput(spectrum)).spectrum,
    spectrum,
  );
  assert.throws(() => audioSpectrum(new Float32Array(SPECTRUM_RATE)), /静音/);
  const incomplete = structuredClone(spectrum);
  incomplete.frames.pop();
  assert.throws(() => validateAudioSpectrum(audioInput(incomplete)), /频谱/);
  const outOfTime = structuredClone(spectrum);
  outOfTime.frames[2][0] = 0.9;
  assert.throws(() => validateAudioSpectrum(audioInput(outOfTime)), /频谱/);
});

test("score uses model notes and tempo, preserves excerpt duration and marks uncertainty", () => {
  const input = validateAudioSpectrum(audioInput());
  const result = audioModelResultToScore(modelResult, input);
  assert.equal(result.score.notes[0].midi, 69);
  assert.equal(result.score.notes[0].beat, 0.25);
  assert.equal(result.score.notes[0].duration, 1);
  assert.equal(result.score.durationBeats, 2);
  assert.equal(result.score.tempo, 120);
  assert.equal(result.score.source.reviewRequired, true);
  assert.equal(result.analysis.startSeconds, 5);
  assert.match(result.warnings.join(" "), /没有直接听到/);
  const unknown = audioModelResultToScore(
    {
      ...modelResult,
      tempo: 0,
      keyKnown: false,
      meterKnown: false,
      mode: "unknown",
    },
    input,
  );
  assert.equal(unknown.score.tempo, 90);
  assert.match(unknown.warnings.join(" "), /90 BPM/);
  assert.throws(
    () => audioModelResultToScore({ ...modelResult, complete: false }, input),
    /完整/,
  );
  assert.throws(
    () =>
      audioModelResultToScore(
        {
          ...modelResult,
          notes: [
            {
              ...modelResult.notes[0],
              startSeconds: 0.9,
              durationSeconds: 0.5,
            },
          ],
        },
        input,
      ),
    /超出/,
  );
});

test("exported MIDI and MusicXML retain the inferred note and tempo", () => {
  const { score } = audioModelResultToScore(
    modelResult,
    validateAudioSpectrum(audioInput()),
  );
  for (const imported of [
    importMidi(exportMidi(score)).score,
    importMusicXML(exportMusicXML(score)).score,
  ]) {
    assert.equal(imported.tempo, 120);
    assert.ok(
      imported.notes.some(
        (note) =>
          note.midi === 69 &&
          Math.abs(note.beat - 0.25) < 0.01 &&
          Math.abs(note.duration - 1) < 0.01,
      ),
    );
  }
});

test("public media fetch never follows targets resolving to a private network", async () => {
  await assert.rejects(
    safeFetch("http://127.0.0.1/test.mp3", { allowPublicRedirects: true }),
    (error) => error.code === "UNSAFE_URL",
  );
  await assert.rejects(
    safeFetch("https://audio.example.test/test.mp3", {
      allowPublicRedirects: true,
      lookupImpl: async () => [{ address: "10.0.0.4", family: 4 }],
    }),
    (error) => error.code === "UNSAFE_URL",
  );
});

test("Pi agent receives actual spectrum and its request is pinned to gpt-6.1-sol high", async () => {
  const input = audioInput();
  let optionsSeen,
    promptSeen,
    verified = false;
  const modelsImpl = {
    getModel: (_provider, model) => ({ id: model }),
    streamSimple(model, context, options) {
      optionsSeen = options;
      options.onPayload({
        model: model.id,
        reasoning: { effort: options.reasoning },
      });
    },
  };
  const transcribe = createPiAudioTranscriber({
    modelsImpl,
    credentialReader: async () => {},
    verified: () => {
      verified = true;
    },
    agentFactory: (options) => ({
      state: { messages: [] },
      abort() {},
      async prompt(message) {
        promptSeen = message;
        options.streamFn(options.initialState.model, {}, {});
        await options.initialState.tools[0].execute("fixture", modelResult);
      },
    }),
  });
  const result = await transcribe(input);
  assert.equal(optionsSeen.reasoning, "high");
  assert.equal(result.model, "gpt-6.1-sol");
  assert.deepEqual(result.requestAudit, [
    { model: "gpt-6.1-sol", reasoningEffort: "high" },
  ]);
  assert.ok(promptSeen.content[0].text.includes('"frames"'));
  assert.ok(
    !promptSeen.content[0].text.includes(input.title),
    "title is not evidence of notes",
  );
  assert.equal(verified, true);
});

test("unverified model response is never used", async () => {
  const transcribe = createPiAudioTranscriber({
    modelsImpl: { getModel: () => ({ id: "gpt-6.1-sol" }) },
    credentialReader: async () => {},
    agentFactory: (options) => ({
      state: { messages: [] },
      abort() {},
      async prompt() {
        await options.initialState.tools[0].execute("fixture", modelResult);
      },
    }),
  });
  await assert.rejects(
    transcribe(audioInput()),
    (error) => error.code === "AUDIO_MODEL_UNVERIFIED",
  );
});

test(
  "video audio track is decoded locally for browser processing",
  { skip: spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "qinban-video-test-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const path = join(dir, "test.mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=64x64:r=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "1",
      "-c:v",
      "mpeg4",
      "-c:a",
      "aac",
      path,
    ]);
    const wav = await decodeMedia({
      data: (await readFile(path)).toString("base64"),
    });
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.toString("ascii", 8, 12), "WAVE");
    assert.ok(wav.length > 40000);
    await assert.rejects(
      decodeMedia({ data: Buffer.from("not media").toString("base64") }),
      /无法读取/,
    );
  },
);

test("local audio routes require a session and CSRF, pass cancellation and reject web pages", async (t) => {
  let transcribeInput, sourceOptions;
  const server = createAppServer({
    statusReader: async () => ({ available: true }),
    audioTranscriber: async (input, { signal }) => {
      transcribeInput = input;
      assert.equal(signal.aborted, false);
      return { provider: "pi", model: "gpt-6.1-sol", reasoningEffort: "high" };
    },
    audioSourceFetcher: async (_url, options) => {
      sourceOptions = options;
      return {
        headers: { "content-type": "text/html" },
        buffer: Buffer.from("<html></html>"),
      };
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const status = await fetch(url + "/api/status");
  const cookie = status.headers.get("set-cookie").split(";")[0],
    data = await status.json();
  const headers = {
    "content-type": "application/json",
    "x-csrf-token": data.csrfToken,
    cookie,
    origin: url,
  };
  assert.equal(
    (
      await fetch(url + "/api/audio/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  const response = await fetch(url + "/api/audio/transcribe", {
    method: "POST",
    headers,
    body: JSON.stringify({ spectrum: "test" }),
  });
  assert.equal(response.status, 200);
  assert.equal(transcribeInput.spectrum, "test");
  const page = await fetch(url + "/api/audio/source", {
    method: "POST",
    headers,
    body: JSON.stringify({ url: "https://example.com/video" }),
  });
  assert.equal(page.status, 422);
  assert.equal((await page.json()).code, "AUDIO_LINK_NOT_MEDIA");
  assert.equal(sourceOptions.allowPublicRedirects, true);
  assert.equal(sourceOptions.maxBytes, 50 * 1024 * 1024);
});

test("audio workspace exposes Pi, video and link input with honest static-site behavior", async (t) => {
  const { doc } = await boot(t);
  doc.querySelector('[data-nav="audio"]').click();
  assert.match(
    doc.querySelector(".audio-page").textContent,
    /GPT-6.1 Sol high/,
  );
  assert.match(
    doc.querySelector(".audio-page").textContent,
    /模型不直接接收声音/,
  );
  assert.ok(doc.querySelector("#audio-link"));
  assert.match(doc.querySelector("#audio-input").accept, /video/);
  assert.equal(doc.querySelector("#start-transcription").disabled, true);
});
