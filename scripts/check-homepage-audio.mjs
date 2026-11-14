// Optional, independent audio acceptance check. Uses real Chromium MP3 decoding
// and OfflineAudioContext rendering; the production scheduler and voice graph
// stay unchanged. No additional dependency is required by the website itself.
// QINBAN_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs
// QINBAN_CHROMIUM=/path/to/chromium node scripts/check-homepage-audio.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

function wav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const root = fileURLToPath(new URL("../site/", import.meta.url));
const output = resolve(process.argv[2] || "output/homepage-audio");
const { chromium } = await import(
  process.env.QINBAN_PLAYWRIGHT_MODULE || "playwright"
);
const scenarios = [
  { id: "ode-both", hand: "both", bpm: 100, seconds: 10.2 },
  { id: "ode-left", hand: "left", bpm: 100, seconds: 10.2 },
  {
    id: "ode-slow-loop",
    hand: "left",
    bpm: 60,
    seconds: 8.4,
    loop: { start: 4, end: 12 },
    seek: 11.9,
  },
];
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  if (path === "/audio-check") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>琴伴音频验收</title><button id="play">播放</button></html>',
    );
    return;
  }
  const file = resolve(root, `.${path}`);
  if (
    !path.startsWith("/assets/") ||
    !file.startsWith(root.replace(/\/$/, "") + sep)
  ) {
    response.writeHead(404).end();
    return;
  }
  try {
    response.setHeader(
      "Content-Type",
      { ".js": "application/javascript", ".mp3": "audio/mpeg" }[
        extname(file)
      ] || "application/octet-stream",
    );
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.QINBAN_CHROMIUM || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  await mkdir(output, { recursive: true });
  const page = await browser.newPage();
  await page.goto(`${base}/audio-check`);
  const report = {
    generatedAt: new Date().toISOString(),
    sampleSource:
      "Salamander Grand Piano — Alexander Holm, CC BY 3.0; unchanged project MP3s",
    method:
      "Real Chromium MP3 decode and OfflineAudioContext PCM; actual PracticeAudio scheduler with only its clock/timer injected. Separate live AudioContext/Analyser check after a click.",
    scenarios: [],
  };
  for (const scenario of scenarios) {
    const result = await page.evaluate(renderOfflineAudio, scenario);
    assert.equal(result.nonfinite, 0, `${scenario.id}: non-finite PCM`);
    assert.equal(result.clipped, 0, `${scenario.id}: clipped PCM`);
    assert.ok(result.rms > 0.00001, `${scenario.id}: silence`);
    assert.ok(result.decodedSampleCount > 0, "actual MP3 samples must decode");
    if (scenario.hand === "left") {
      assert.equal(
        result.allLeft,
        true,
        "active notes must match the selected hand",
      );
      assert.ok(
        result.voices.every(
          (note) => note.hand === "left" && note.midi >= 43 && note.midi <= 55,
        ),
        "left-only source scheduling must contain only the source bass range",
      );
    }
    if (scenario.loop) {
      assert.ok(
        result.voices.every((note) => note.beat >= 4 && note.beat < 12),
      );
      const starts = result.voices
        .filter((note) => note.beat === 4)
        .map((note) => note.when);
      assert.equal(
        starts.length,
        2,
        "loop must wrap twice without duplicate note-ons",
      );
      assert.ok(
        Math.abs(starts[0] - 0.1) < 1e-6 && Math.abs(starts[1] - 8.1) < 1e-6,
      );
      const stops = result.voices
        .filter((note) => note.hardBoundary)
        .map((note) => note.when + note.duration);
      assert.ok(
        stops.every(
          (time) => Math.abs(time - 0.1) < 1e-6 || Math.abs(time - 8.1) < 1e-6,
        ),
        "loop's last source must end at the same clock time as the next first source",
      );
    } else {
      assert.equal(result.finalState.ended, true);
      assert.equal(result.finalState.beat, 16);
    }
    await writeFile(
      resolve(output, `${scenario.id}.wav`),
      wav(Buffer.from(result.pcm, "base64"), result.sampleRate),
    );
    const { pcm, ...summary } = result;
    void pcm;
    report.scenarios.push({ ...scenario, ...summary });
    console.log(
      `${scenario.id}: ${result.voices.length} sources, ${result.decodedSampleCount} decoded samples, peak=${result.peak.toFixed(6)}, RMS=${result.rms.toFixed(6)}, clipping=0`,
    );
  }

  await page.evaluate(prepareLiveAudio);
  await page.click("#play");
  await page.waitForFunction(
    () =>
      window.audioCheck.ready && window.audioCheck.player.getSnapshot().playing,
  );
  const live = await page.evaluate(measureLiveAudio);
  assert.ok(
    live.bothRms > 0.00001 && live.leftRms > 0.00001 && live.loopRms > 0.00001,
    "live AudioContext must output audible samples",
  );
  assert.ok(live.pauseRms < 0.000001, "pause must silence the live graph");
  assert.ok(
    Math.abs(live.before - live.after) < 0.01,
    "live tempo/hand switch must preserve beat",
  );
  assert.equal(live.leftOnly, true);
  assert.ok(live.wrapped.beat >= 4 && live.wrapped.beat < 5);
  assert.equal(live.wrappedSources.length, 1);
  assert.ok(
    Math.abs(live.wrappedSources[0].when - live.loopStartTime - 0.1) < 0.01,
  );
  assert.equal(live.paused.playing, false);
  assert.equal(live.paused.beat, live.stableBeat);
  report.live = live;
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Live AudioContext: both=${live.bothRms.toFixed(6)}, left=${live.leftRms.toFixed(6)}, loop=${live.loopRms.toFixed(6)}, paused=${live.pauseRms.toFixed(8)}; hand, tempo, loop and pause checks passed.`,
  );
  console.log(`Audio evidence written to ${output}`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}

async function renderOfflineAudio(config) {
  const { PracticeAudio } = await import("/assets/practice-audio.js");
  const { ODE_SCORE } = await import("/assets/practice-data.js");
  const sampleRate = 44100;
  const length = Math.ceil(sampleRate * config.seconds);
  const offline = new OfflineAudioContext(2, length, sampleRate);
  let now = 0;
  let id = 0;
  const timers = new Map();
  // Audio nodes and decoding are real. Only planning time is advanced
  // deterministically before startRendering so CI does not wait 30 seconds.
  const context = {
    get currentTime() {
      return now;
    },
    state: "running",
    destination: offline.destination,
    createGain: offline.createGain.bind(offline),
    createBiquadFilter: offline.createBiquadFilter.bind(offline),
    createBufferSource: offline.createBufferSource.bind(offline),
    decodeAudioData: offline.decodeAudioData.bind(offline),
  };
  const player = new PracticeAudio({
    contextFactory: () => context,
    setTimer: (fn, ms) => {
      timers.set(++id, { fn, time: now + ms / 1000 });
      return id;
    },
    clearTimer: (key) => timers.delete(key),
    requestFrame: () => 0,
  });
  const voices = [];
  const voice = player._voice.bind(player);
  player._voice = (note, when, duration, offset, hardBoundary) => {
    voices.push({
      id: note.id,
      hand: note.hand,
      midi: note.midi,
      beat: note.beat,
      when,
      duration,
      offset,
      hardBoundary: Boolean(hardBoundary),
    });
    return voice(note, when, duration, offset, hardBoundary);
  };
  player.setScore(ODE_SCORE);
  player.setTempo(config.bpm);
  player.setHand(config.hand);
  if (config.loop) player.setLoop(config.loop);
  if (config.seek != null) player.seek(config.seek);
  if (!(await player.play())) throw new Error(player.getSnapshot().error);
  const snapshots = [{ time: now, ...player.getSnapshot() }];
  let count = 0;
  while (timers.size) {
    const [key, task] = [...timers].sort((a, b) => a[1].time - b[1].time)[0];
    if (task.time > config.seconds) break;
    timers.delete(key);
    now = task.time;
    task.fn();
    if (++count % 4 === 0)
      snapshots.push({ time: now, ...player.getSnapshot() });
  }
  const rendered = await offline.startRendering();
  const pcm = new Uint8Array(length * 4);
  const view = new DataView(pcm.buffer);
  let energy = 0,
    peak = 0,
    nonfinite = 0,
    clipped = 0;
  for (let channel = 0; channel < 2; channel++) {
    const data = rendered.getChannelData(channel);
    for (let frame = 0; frame < length; frame++) {
      const value = data[frame];
      if (!Number.isFinite(value)) nonfinite++;
      if (Math.abs(value) >= 1) clipped++;
      peak = Math.max(peak, Math.abs(value));
      energy += value * value;
      view.setInt16(
        frame * 4 + channel * 2,
        Math.round(Math.max(-1, Math.min(1, value)) * 32767),
        true,
      );
    }
  }
  let binary = "";
  for (let i = 0; i < pcm.length; i += 16384)
    binary += String.fromCharCode(...pcm.subarray(i, i + 16384));
  const result = {
    pcm: btoa(binary),
    sampleRate,
    seconds: config.seconds,
    peak,
    rms: Math.sqrt(energy / (2 * length)),
    nonfinite,
    clipped,
    decodedSampleCount: player._buffers.size,
    voices,
    allLeft: snapshots.every((snapshot) =>
      snapshot.activeNotes.every((note) => note.hand === "left"),
    ),
    finalState: player.getSnapshot(),
  };
  player.dispose();
  return result;
}

async function prepareLiveAudio() {
  const { PracticeAudio } = await import("/assets/practice-audio.js");
  const { ODE_SCORE } = await import("/assets/practice-data.js");
  const context = new AudioContext({ latencyHint: "interactive" });
  const player = new PracticeAudio({ contextFactory: () => context });
  const voices = [];
  const voice = player._voice.bind(player);
  player._voice = (note, when, duration, offset, hardBoundary) => {
    voices.push({
      hand: note.hand,
      midi: note.midi,
      beat: note.beat,
      when,
      duration,
      hardBoundary: Boolean(hardBoundary),
    });
    return voice(note, when, duration, offset, hardBoundary);
  };
  player.setScore(ODE_SCORE);
  window.audioCheck = { player, context, voices, ready: false };
  document.querySelector("#play").onclick = async () => {
    window.audioCheck.ready = await player.play();
  };
}

async function measureLiveAudio() {
  const { player, context, voices } = window.audioCheck;
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  player._bus.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const readRms = async (frames = 16) => {
    let maxRms = 0;
    for (let i = 0; i < frames; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      analyser.getFloatTimeDomainData(data);
      let energy = 0;
      for (const value of data) energy += value * value;
      maxRms = Math.max(maxRms, Math.sqrt(energy / data.length));
    }
    return maxRms;
  };
  const bothRms = await readRms();
  const before = player.getSnapshot().beat;
  const index = voices.length;
  player.setHand("left");
  player.setTempo(60);
  const after = player.getSnapshot().beat;
  const leftRms = await readRms();
  const leftOnly = voices.slice(index).every((note) => note.hand === "left");
  player.setLoop({ start: 4, end: 12 });
  player.seek(11.9);
  const loopStartTime = context.currentTime;
  const loopIndex = voices.length;
  const loopRms = await readRms(8);
  const wrapped = player.getSnapshot();
  const wrappedSources = voices
    .slice(loopIndex - 2)
    .filter((note) => note.beat === 4 && note.when >= loopStartTime - 0.01);
  player.pause();
  const paused = player.getSnapshot();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const pauseRms = await readRms(2);
  const stableBeat = player.getSnapshot().beat;
  player.dispose();
  await context.close();
  return {
    bothRms,
    leftRms,
    loopRms,
    pauseRms,
    before,
    after,
    leftOnly,
    loopStartTime,
    wrappedSources,
    wrapped,
    paused,
    stableBeat,
  };
}
