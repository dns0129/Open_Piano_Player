// Renders the promo video site/video/promo.html to site/video/qinban-promo.mp4.
//   - Picture: serves site/ over a local HTTP port, drives a headless Google Chrome over the DevTools
//     protocol, calls window.seek(t) for every frame and pipes the screenshots into ffmpeg.
//   - Sound: mixes the Für Elise notes of site/video/score.js from the Salamander piano samples in
//     site/assets/audio/piano/ (nearest recorded note, resampled), with a light room echo from ffmpeg.
// Needs Chrome, ffmpeg with libx264 (on PATH or FFMPEG=/path/to/ffmpeg) and Node ≥ 21.
// Run: node scripts/render-promo-video.mjs [--fps 30] [--out file.mp4]
//      node scripts/render-promo-video.mjs --stills 2,8.5,14 --out dir   (PNG frames only, for checking)
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// Node 21 has WebSocket behind a flag; rerun once with it instead of failing.
if (typeof WebSocket === "undefined") {
  if (
    Number(process.versions.node.split(".")[0]) >= 21 &&
    !process.execArgv.includes("--experimental-websocket")
  ) {
    const run = spawnSync(
      process.execPath,
      ["--experimental-websocket", ...process.argv.slice(1)],
      { stdio: "inherit" },
    );
    process.exit(run.status ?? 1);
  }
  console.error(`需要 Node.js 21 或更新版本（当前 ${process.version}）。`);
  process.exit(1);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const site = join(root, "site");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const FPS = Number(arg("fps", 30));
const OUT = arg("out", join(site, "video", "qinban-promo.mp4"));
const STILLS = arg("stills", "");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const CHROME =
  process.env.CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const RATE = 44100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { NOTES, DURATION } = await import(
  new URL("../site/video/score.js", import.meta.url)
);

// ---------- Sound ----------
const SAMPLE_NOTES = { C: 0, Ds: 3, Fs: 6, A: 9 };
const SAMPLES = [];
for (const [name, pc] of Object.entries(SAMPLE_NOTES))
  for (let oct = 1; oct <= 7; oct++)
    SAMPLES.push({ file: `${name}${oct}.mp3`, midi: 12 * (oct + 1) + pc });

function decode(file) {
  const run = spawnSync(
    FFMPEG,
    [
      "-v",
      "error",
      "-i",
      file,
      "-f",
      "f32le",
      "-ac",
      "2",
      "-ar",
      String(RATE),
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );
  if (run.status !== 0)
    throw new Error(`ffmpeg 解码失败：${file}\n${run.stderr}`);
  const buf = run.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

async function mixAudio(path) {
  const available = [];
  for (const s of SAMPLES) {
    try {
      await readFile(join(site, "assets/audio/piano", s.file));
      available.push(s);
    } catch {}
  }
  const cache = new Map();
  const length = Math.ceil((DURATION + 0.5) * RATE);
  const L = new Float32Array(length);
  const R = new Float32Array(length);
  for (const n of NOTES) {
    const s = available.reduce((a, b) =>
      Math.abs(b.midi - n.midi) < Math.abs(a.midi - n.midi) ? b : a,
    );
    if (!cache.has(s.file))
      cache.set(s.file, decode(join(site, "assets/audio/piano", s.file)));
    const src = cache.get(s.file);
    const frames = src.length / 2;
    const ratio = 2 ** ((n.midi - s.midi) / 12);
    const start = Math.round(n.t * RATE);
    const hold = n.dur * RATE;
    const release = 0.35 * RATE;
    const pan = clampPan((n.midi - 62) / 60);
    const gl = n.vel * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = n.vel * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let j = 0; j < hold + release && start + j < length; j++) {
      const x = j * ratio;
      const i = Math.floor(x);
      if (i + 1 >= frames) break;
      const f = x - i;
      const env = j < hold ? 1 : 1 - (j - hold) / release;
      // Folded to mono: the recordings lean right in the treble; pan places each note instead.
      const v =
        (src[2 * i] + src[2 * i + 1]) * (1 - f) * 0.5 +
        (src[2 * i + 2] + src[2 * i + 3]) * f * 0.5;
      L[start + j] += v * env * gl;
      R[start + j] += v * env * gr;
    }
  }
  let peak = 0;
  for (let i = 0; i < length; i++)
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = 0.85 / peak;
  // 32-bit float WAV.
  const data = Buffer.alloc(length * 8);
  for (let i = 0; i < length; i++) {
    data.writeFloatLE(L[i] * gain, i * 8);
    data.writeFloatLE(R[i] * gain, i * 8 + 4);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 8, 28);
  head.writeUInt16LE(8, 32);
  head.writeUInt16LE(32, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  await writeFile(path, Buffer.concat([head, data]));
}
function clampPan(x) {
  return Math.max(-0.3, Math.min(0.3, x));
}

// ---------- Picture ----------
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(
      decodeURIComponent(new URL(req.url, "http://x").pathname),
    );
    try {
      const body = await readFile(join(site, path));
      res.writeHead(200, {
        "content-type": TYPES[extname(path)] || "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function browser(port) {
  const profile = await mkdtemp(join(tmpdir(), "qinban-video-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--hide-scrollbars",
      "--mute-audio",
      "--force-color-profile=srgb",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    try {
      page = (
        await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      ).find((t) => t.type === "page");
    } catch {
      await sleep(200);
    }
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok) => ws.addEventListener("open", ok, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? fail(new Error(JSON.stringify(msg.error))) : ok(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      pending.set(++id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  };
  await send("Page.enable");
  return {
    send,
    evaluate,
    async close() {
      ws.close();
      proc.kill();
      await sleep(300);
      await rm(profile, { recursive: true, force: true });
    },
  };
}

const work = await mkdtemp(join(tmpdir(), "qinban-video-work-"));
const wav = join(work, "music.wav");
if (!STILLS) {
  console.log("混音：", NOTES.length, "个音");
  await mixAudio(wav);
}

const server = await serve();
const b = await browser(9300 + Math.floor(Math.random() * 500));
try {
  await b.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await b.send("Page.navigate", {
    url: `http://127.0.0.1:${server.address().port}/video/promo.html?render`,
  });
  for (let i = 0; i < 50; i++) {
    if (await b.evaluate("!!window.ready").catch(() => false)) break;
    await sleep(200);
  }
  await b.evaluate("window.ready");

  if (STILLS) {
    for (const t of STILLS.split(",").map(Number)) {
      await b.evaluate(
        `seek(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`,
      );
      const { data } = await b.send("Page.captureScreenshot", {
        format: "png",
      });
      await writeFile(join(OUT, `frame-${t}.png`), Buffer.from(data, "base64"));
    }
    console.log(`已保存 ${STILLS} 秒的画面到 ${OUT}`);
  } else {
    const total = Math.round(DURATION * FPS);
    const ff = spawn(
      FFMPEG,
      [
        "-v",
        "error",
        "-y",
        "-framerate",
        String(FPS),
        "-f",
        "image2pipe",
        "-c:v",
        "mjpeg",
        "-i",
        "-",
        "-i",
        wav,
        "-af",
        "aecho=0.9:0.85:41|83|127|181:0.2|0.15|0.1|0.06,afade=t=out:st=" +
          (DURATION - 1.2) +
          ":d=1.2",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        String(DURATION),
        "-movflags",
        "+faststart",
        OUT,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const done = new Promise((ok, fail) =>
      ff.on("close", (code) =>
        code === 0 ? ok() : fail(new Error(`ffmpeg 退出码 ${code}`)),
      ),
    );
    for (let f = 0; f < total; f++) {
      await b.evaluate(
        `seek(${f / FPS}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`,
      );
      const { data } = await b.send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 94,
      });
      if (!ff.stdin.write(Buffer.from(data, "base64")))
        await new Promise((ok) => ff.stdin.once("drain", ok));
      if (f % FPS === 0) process.stdout.write(`\r画面：${f}/${total}`);
    }
    ff.stdin.end();
    await done;
    console.log(`\n完成：${OUT}`);
  }
} finally {
  await b.close();
  server.close();
  await rm(work, { recursive: true, force: true });
}
