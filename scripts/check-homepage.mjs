// Real browser acceptance of the independent static homepage. No production data
// or recognition service is touched. Run after `npx playwright install chromium`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const root = fileURLToPath(new URL("../site/", import.meta.url));
const output = resolve("output/homepage");
await mkdir(output, { recursive: true });
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".md": "text/plain; charset=utf-8",
};
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  const file = resolve(root, "." + (path === "/" ? "/index.html" : path));
  if (!file.startsWith(root.replace(/\/$/, "") + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      types[extname(file)] || "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const report = {
  generatedAt: new Date().toISOString(),
  checks: [],
  errors: [],
  links: [],
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.QINBAN_CHROMIUM || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const snapshot = (page) =>
  page.evaluate(async () =>
    (
      await import(document.querySelector("script[data-home-entry]").src)
    ).getHomeSnapshot(),
  );
const record = (name, result = {}) => {
  report.checks.push({ name, ...result, passed: true });
  console.log(`PASS ${name}`);
};
const assertNoOverflow = async (page, name) => {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    page: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.page <= dimensions.viewport + 1,
    `${name}: horizontal page overflow ${JSON.stringify(dimensions)}`,
  );
  record(name, dimensions);
};
async function parity(page, name) {
  const result = await page.evaluate(async () => {
    const s = (
      await import(document.querySelector("script[data-home-entry]").src)
    ).getHomeSnapshot();
    const expected = s.audio.activeNotes.map((n) => n.id).sort();
    const shown = [
      ...new Set(
        [
          ...document.querySelectorAll("#hero-score .score-note.is-active"),
        ].flatMap((n) => n.dataset.noteIds?.split(" ") || []),
      ),
    ].sort();
    const keys = [
      ...document.querySelectorAll(
        "#hero-keyboard .active-left,#hero-keyboard .active-right",
      ),
    ]
      .map((n) => Number(n.dataset.midi))
      .sort((a, b) => a - b);
    return {
      expected,
      shown,
      keys,
      expectedKeys: [...new Set(s.audio.activeNotes.map((n) => n.midi))].sort(
        (a, b) => a - b,
      ),
      state: s.audio,
    };
  });
  assert.deepEqual(
    result.shown,
    result.expected,
    `${name}: score/audio IDs diverged`,
  );
  assert.deepEqual(
    result.keys,
    result.expectedKeys,
    `${name}: keys/audio pitches diverged`,
  );
  record(name, {
    hand: result.state.hand,
    beat: result.state.beat,
    active: result.expected,
  });
}

async function assertPrintPreviewFits(page, name) {
  const geometry = await page.locator("#print-sheet").evaluate((sheet) => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const style = getComputedStyle(sheet);
    const notation = sheet.querySelector("#print-notation");
    return {
      sheet: rect(sheet),
      contentWidth:
        sheet.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
      notationWidth: notation.clientWidth,
      notation: rect(notation),
      systems: [...notation.querySelectorAll(".score-system > svg")].map(
        (svg) => ({
          bounds: rect(svg),
          labels: [...svg.querySelectorAll(".score-overlays > text")]
            .filter((label) => /^[1-4]$/.test(label.textContent.trim()))
            .map((label) => ({
              number: Number(label.textContent),
              bounds: rect(label),
            })),
        }),
      ),
    };
  });
  assert(geometry.systems.length > 0, `${name}: live A4 preview has no score`);
  assert(
    geometry.notationWidth <= geometry.contentWidth + 1,
    `${name}: notation exceeds the A4 inner content width`,
  );
  const labels = geometry.systems.flatMap((system) => system.labels);
  assert.deepEqual(
    labels.map((label) => label.number).sort(),
    [1, 2, 3, 4],
    `${name}: all four measure labels must appear in the live preview`,
  );
  for (const system of geometry.systems) {
    const box = system.bounds;
    assert(
      box.width > 0 && box.height > 0,
      `${name}: live A4 score must have a rendered size`,
    );
    // Both rectangles include the same decorative page rotation. Comparing
    // rendered bounds catches an unscaled 620px SVG hidden by the paper crop.
    assert(
      box.width <= geometry.notation.width + 2 &&
        box.left >= geometry.notation.left - 2 &&
        box.right <= geometry.notation.right + 2,
      `${name}: live A4 SVG is horizontally clipped: ${JSON.stringify(geometry)}`,
    );
    assert(
      box.left >= geometry.sheet.left - 2 &&
        box.right <= geometry.sheet.right + 2 &&
        box.bottom <= geometry.sheet.bottom + 2,
      `${name}: live A4 score extends beyond the paper`,
    );
    for (const label of system.labels) {
      assert(
        label.bounds.left >= geometry.notation.left - 2 &&
          label.bounds.right <= geometry.notation.right + 2 &&
          label.bounds.bottom <= geometry.sheet.bottom + 2,
        `${name}: measure ${label.number} is clipped in the live A4 preview`,
      );
    }
  }
  record(`${name}: live A4 preview contains all four measures`, geometry);
}

async function pixelDifference(before, after) {
  const [a, b] = await Promise.all(
    [before, after].map((png) =>
      sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    ),
  );
  assert.deepEqual(
    a.info,
    b.info,
    "comparison images must have equal dimensions",
  );
  let changedPixels = 0;
  let totalDifference = 0;
  for (let i = 0; i < a.data.length; i += a.info.channels) {
    let maximum = 0;
    for (let channel = 0; channel < a.info.channels; channel++) {
      const difference = Math.abs(a.data[i + channel] - b.data[i + channel]);
      maximum = Math.max(maximum, difference);
      totalDifference += difference;
    }
    if (maximum > 5) changedPixels++;
  }
  return {
    changedPixels,
    totalPixels: a.info.width * a.info.height,
    meanChannelDifference: totalDifference / a.data.length,
  };
}

async function assertTypography(page, name) {
  await page.waitForFunction(
    () => document.documentElement.dataset.pageMotion === "ready",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("motion-settled"),
  );
  const type = await page.evaluate(() => {
    const describe = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return { family: style.fontFamily, pixels: parseFloat(style.fontSize) };
    };
    return {
      body: describe("body"),
      heading: describe("#hero-title"),
      brush: describe("#hero-title .title-brush"),
      description: describe(".hero-description"),
      control: describe("#hero-play"),
      brushLoaded: document.fonts.check('32px "Qinban Brush"', "开始练。"),
      brushFace: [...document.fonts].some(
        (face) =>
          face.family.replaceAll('"', "") === "Qinban Brush" &&
          face.status === "loaded",
      ),
    };
  });
  assert(
    type.brush.family.includes("Qinban Brush"),
    `${name}: calligraphic heading face`,
  );
  assert(
    type.brushLoaded && type.brushFace,
    `${name}: the bundled brush font must actually load`,
  );
  assert.notEqual(
    type.heading.family,
    type.control.family,
    `${name}: title and controls have distinct typography`,
  );
  assert(type.body.pixels >= 15, `${name}: body text is at least 15px`);
  assert(
    type.description.pixels >= 15,
    `${name}: hero explanation is at least 15px`,
  );
  record(`${name}: loaded brush, Song-style title and readable controls`, type);
}

async function verifyFluidInk(page, name) {
  const canvas = page.locator(".pencil-trail");
  assert.equal(
    await canvas.evaluate((el) => getComputedStyle(el).pointerEvents),
    "none",
  );
  assert.equal(await canvas.getAttribute("hidden"), null);
  // Capture actual browser-composited pixels. Hiding only the surrounding page
  // for this capture isolates liquid from the independently moving hero art.
  // No animation is disabled, no drawing context is requested, and the same
  // canvas/renderer keeps advancing throughout these screenshots.
  const layerShot = (filename) =>
    page.screenshot({
      path: resolve(output, filename),
      fullPage: false,
      animations: "allow",
      style: `html, body { background: #F3EEE1 !important; background-image: none !important; }
      body * { visibility: hidden !important; }
      body::before, body::after { visibility: hidden !important; }
      .pencil-trail { visibility: visible !important; }`,
    });
  const blank = await layerShot(`${name}-fluid-empty.png`);
  await page.mouse.move(320, 185);
  await page.mouse.down();
  for (let i = 0; i <= 46; i++) {
    const angle = (i / 46) * Math.PI * 2;
    await page.mouse.move(
      320 + Math.sin(angle) * 180,
      185 + Math.sin(angle * 2) * 65,
    );
    await page.waitForTimeout(18);
  }
  await page.mouse.up();
  const renderer = await canvas.getAttribute("data-renderer");
  assert(
    ["webgl2", "canvas2d"].includes(renderer),
    `unexpected fluid renderer: ${renderer}`,
  );
  assert.equal(await canvas.getAttribute("data-ink-state"), "flowing");
  const flowing = await layerShot(`${name}-fluid-flowing.png`);
  const visible = await pixelDifference(blank, flowing);
  assert(
    visible.changedPixels > 1500,
    `liquid must visibly cover an area, got ${JSON.stringify(visible)}`,
  );
  await page.screenshot({
    path: resolve(output, `${name}-fluid-on-page.png`),
    fullPage: false,
  });
  await page.waitForTimeout(420);
  const released = await layerShot(`${name}-fluid-released.png`);
  const inertia = await pixelDifference(flowing, released);
  assert(
    inertia.changedPixels > 500,
    `released liquid must keep moving, got ${JSON.stringify(inertia)}`,
  );
  await page.waitForFunction(
    () => document.querySelector(".pencil-trail").dataset.inkState === "idle",
    null,
    { timeout: 8000 },
  );
  const faded = await layerShot(`${name}-fluid-faded.png`);
  const residue = await pixelDifference(blank, faded);
  assert(
    residue.changedPixels < 40,
    `liquid must clear after its lifetime, got ${JSON.stringify(residue)}`,
  );
  await page.evaluate(() => getSelection()?.removeAllRanges());
  record(
    `${name}: visible fluid moves after release, clears and never catches input`,
    {
      renderer,
      visible,
      inertia,
      residue,
    },
  );
}

function runEncoder(args) {
  return new Promise((done, fail) => {
    const process = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...args,
    ]);
    let stderr = "";
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.once("error", fail);
    process.once("exit", (code) =>
      code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}: ${stderr}`)),
    );
  });
}

async function captureMotionEvidence() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: resolve(output, "motion-raw"),
      size: { width: 1280, height: 900 },
    },
  });
  const page = await context.newPage();
  const video = page.video();
  const started = Date.now();
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.homeReady === "true" &&
        document.documentElement.dataset.pageMotion === "ready",
    );
    await page.waitForTimeout(350);
    // Move first, then press in the clear upper margin for a denser curling
    // gesture. These are ordinary browser inputs on the unmodified live page.
    await page.mouse.move(170, 150);
    for (let i = 0; i <= 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      await page.mouse.move(
        310 + Math.sin(angle) * 155,
        210 + Math.sin(angle * 2) * 90,
      );
      await page.waitForTimeout(24);
    }
    await page.mouse.move(510, 115);
    await page.mouse.down();
    for (let i = 0; i <= 35; i++) {
      const angle = (i / 35) * Math.PI * 2;
      await page.mouse.move(
        510 + Math.sin(angle) * 125,
        115 + Math.sin(angle * 2) * 32,
      );
      await page.waitForTimeout(24);
    }
    await page.mouse.up();
    await page.evaluate(() => getSelection()?.removeAllRanges());
    await page.waitForTimeout(550);
    await page.screenshot({
      path: resolve(output, "motion-desktop-flow.png"),
      fullPage: false,
    });
    await page.locator("#hero-play").click();
    await page.waitForTimeout(1100);
    await page.locator("#transport-play").click();
    await page.mouse.wheel(0, 650);
    await page.waitForTimeout(700);
    await page.mouse.wheel(0, 480);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: resolve(output, "motion-scroll-reveal.png"),
      fullPage: false,
    });
    const invisibleInView = await page
      .locator(".motion-reveal")
      .evaluateAll((elements) =>
        elements
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.top < innerHeight - 50 &&
              rect.bottom > 50 &&
              Number(getComputedStyle(el).opacity) < 0.95
            );
          })
          .map((el) => el.className),
      );
    assert.deepEqual(
      invisibleInView,
      [],
      "scroll-revealed content must be readable in the viewport",
    );
    await page.waitForTimeout(Math.max(0, 8500 - (Date.now() - started)));
  } finally {
    await context.close();
    await video.saveAs(resolve(output, "homepage-motion.webm"));
  }
  await runEncoder([
    "-i",
    resolve(output, "homepage-motion.webm"),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    resolve(output, "homepage-motion.mp4"),
  ]);
  await runEncoder([
    "-i",
    resolve(output, "homepage-motion.webm"),
    "-t",
    "9",
    "-an",
    "-filter_complex",
    "[0:v]fps=14,scale=600:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3",
    "-loop",
    "0",
    resolve(output, "homepage-motion.gif"),
  ]);
  record(
    "real browser motion film: entrance, liquid gesture, piano and scroll reveal",
    {
      viewport: "1280×900",
      files: [
        "homepage-motion.webm",
        "homepage-motion.mp4",
        "homepage-motion.gif",
      ],
    },
  );
}

async function verifyRealBackgroundTabs() {
  // Public ConnectOverCDPOptions.noDefaults suppresses focus emulation only
  // for the existing default context. Launch stock Chromium, then attach;
  // browser.newContext() would enable the automation override again.
  // Linux runs need a display, e.g. xvfb-run -a node scripts/check-homepage.mjs.
  const profile = await mkdtemp(resolve(tmpdir(), "qinban-visibility-"));
  const nativeProcess = spawn(
    process.env.QINBAN_CHROMIUM || chromium.executablePath(),
    [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--window-size=1500,1100",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let diagnostics = "";
  let launchError;
  let headed;
  nativeProcess.stderr.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-16000);
  });
  const exited = new Promise((done) => {
    nativeProcess.once("exit", done);
    nativeProcess.once("error", (error) => {
      launchError = error;
      done();
    });
  });
  try {
    let endpoint;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      assert(
        nativeProcess.exitCode === null && nativeProcess.signalCode === null,
        `native Chromium exited before CDP was ready: ${diagnostics}`,
      );
      const activePort = await readFile(
        resolve(profile, "DevToolsActivePort"),
        "utf8",
      ).catch((error) => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
      const [port, socketPath] = activePort.trim().split(/\r?\n/);
      if (/^\d+$/.test(port) && socketPath?.startsWith("/devtools/browser/")) {
        endpoint = `ws://127.0.0.1:${port}${socketPath}`;
        break;
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    assert(
      endpoint,
      `native Chromium did not expose a CDP endpoint: ${diagnostics}`,
    );
    headed = await chromium.connectOverCDP(endpoint, {
      noDefaults: true,
      timeout: 10000,
    });
    const context = headed.contexts()[0];
    assert(context, "stock Chromium must expose its existing default context");
    // Keep the initial about:blank tab alive when each test pair is closed.
    if (!context.pages().length) await context.newPage();
    for (const config of [
      { name: "desktop", width: 1440, height: 1000, mobile: false },
      { name: "mobile", width: 375, height: 812, mobile: true },
    ]) {
      const page = await context.newPage();
      let other;
      try {
        // This native-tab check covers both responsive viewport widths. Real
        // touch/device emulation remains in the main mobile interaction suite.
        await page.setViewportSize({
          width: config.width,
          height: config.height,
        });
        await page.addInitScript(() => {
          window.__qinbanVisibilityEvidence = [];
          document.addEventListener("visibilitychange", (event) => {
            window.__qinbanVisibilityEvidence.push({
              state: document.visibilityState,
              hidden: document.hidden,
              trusted: event.isTrusted,
              time: performance.now(),
            });
          });
        });
        await page.goto(base, { waitUntil: "networkidle" });
        await page.bringToFront();
        await page.waitForFunction(
          () =>
            document.documentElement.dataset.homeReady === "true" &&
            document.visibilityState === "visible",
          undefined,
          { timeout: 15000 },
        );
        if (config.mobile)
          await page.locator("#practice-settings summary").click();
        // A looping excerpt cannot finish naturally and masquerade as a pause.
        await page.locator("#loop-toggle").click();
        await page.locator("#hero-play").click();
        await page.waitForFunction(
          async () => {
            const state = (
              await import(
                document.querySelector("script[data-home-entry]").src
              )
            ).getHomeSnapshot().audio;
            return state.playing && state.activeNotes.length > 0;
          },
          undefined,
          { timeout: 10000 },
        );
        const playing = await snapshot(page);
        assert.deepEqual(playing.audio.loop, { start: 4, end: 12 });
        other = await context.newPage();
        await other.goto("about:blank");
        await other.bringToFront();
        // Interval polling is deliberate: requestAnimationFrame stops in a
        // genuinely hidden tab. Do not override hidden or dispatch an event.
        await page.waitForFunction(
          () => document.hidden && document.visibilityState === "hidden",
          undefined,
          { polling: 100, timeout: 10000 },
        );
        const hidden = await snapshot(page);
        assert.equal(
          hidden.audio.playing,
          false,
          `${config.name}: a genuinely hidden tab must pause`,
        );
        assert.equal(
          hidden.audio.loading,
          false,
          `${config.name}: backgrounding must cancel pending playback`,
        );
        assert.deepEqual(
          hidden.audio.activeNotes,
          [],
          `${config.name}: backgrounding must clear sounding notes`,
        );
        assert.equal(
          hidden.audio.ended,
          false,
          `${config.name}: background pause cannot be natural completion`,
        );
        await new Promise((done) => setTimeout(done, 350));
        assert.equal(
          (await snapshot(page)).audio.beat,
          hidden.audio.beat,
          `${config.name}: beat must stay frozen in the background`,
        );
        await page.bringToFront();
        await page.waitForFunction(
          () => !document.hidden && document.visibilityState === "visible",
          undefined,
          { polling: 100, timeout: 10000 },
        );
        await new Promise((done) => setTimeout(done, 350));
        const restored = await snapshot(page);
        assert.equal(
          restored.audio.playing,
          false,
          `${config.name}: returning to the tab must not auto-resume`,
        );
        assert.deepEqual(restored.audio.activeNotes, []);
        assert.equal(restored.audio.beat, hidden.audio.beat);
        const visibility = await page.evaluate(
          () => window.__qinbanVisibilityEvidence,
        );
        const hideEvent = visibility.find(
          (event) => event.hidden && event.state === "hidden" && event.trusted,
        );
        assert(
          hideEvent,
          `${config.name}: browser must emit a trusted hidden event`,
        );
        assert(
          visibility.some(
            (event) =>
              !event.hidden &&
              event.state === "visible" &&
              event.trusted &&
              event.time >= hideEvent.time,
          ),
          `${config.name}: browser must emit a trusted visible event after returning`,
        );
        await page.screenshot({
          path: resolve(output, `${config.name}-returned-paused.png`),
        });
        record(
          `${config.name}: real background tab pauses and returns paused`,
          {
            playingBeat: playing.audio.beat,
            pausedBeat: hidden.audio.beat,
            focusEmulation:
              "never enabled: stock Chromium default context + connectOverCDP noDefaults",
            viewport: { width: config.width, height: config.height },
            visibility,
          },
        );
      } catch (error) {
        const visibility = await page
          .evaluate(() => ({
            hidden: document.hidden,
            state: document.visibilityState,
            events: window.__qinbanVisibilityEvidence,
          }))
          .catch(() => null);
        report.errors.push({
          name: `${config.name}: real background tab`,
          message: error.stack,
          visibility,
        });
        console.error(`${config.name}: real background tab: ${error.stack}`);
      } finally {
        if (other) await other.close().catch(() => {});
        await page.close().catch(() => {});
      }
    }
  } finally {
    if (headed) await headed.close().catch(() => {});
    if (
      nativeProcess.pid &&
      nativeProcess.exitCode === null &&
      nativeProcess.signalCode === null
    ) {
      nativeProcess.kill("SIGTERM");
      await Promise.race([
        exited,
        new Promise((done) => setTimeout(done, 2000)),
      ]);
      if (
        nativeProcess.exitCode === null &&
        nativeProcess.signalCode === null
      ) {
        nativeProcess.kill("SIGKILL");
        await exited;
      }
    }
    await writeFile(resolve(output, "native-browser.log"), diagnostics);
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}

async function scenario({ name, width, height, mobile }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const missing = [];
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith(base))
      missing.push(`${r.status()} ${r.url()}`);
  });
  try {
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => document.documentElement.dataset.homeReady === "true",
      { timeout: 20000 },
    );
    await assertTypography(page, name);
    await assertNoOverflow(page, `${name}: no horizontal page overflow`);
    await page.screenshot({
      path: resolve(output, `${name}-initial.png`),
      fullPage: false,
    });
    const originalRatio = await page
      .locator("#bach-original")
      .evaluate(
        (img) =>
          img.getBoundingClientRect().width /
          img.getBoundingClientRect().height,
      );
    assert(
      Math.abs(originalRatio - 1600 / 2263) < 0.005,
      "original score image aspect ratio",
    );
    const musicFont = await page
      .locator("#hero-score .music-glyph")
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    assert(
      musicFont.includes("Bravura"),
      `${name}: musical glyphs must retain Bravura, got ${musicFont}`,
    );
    const hitStroke = await page
      .locator("#hero-score .note-hit")
      .first()
      .evaluate((el) => getComputedStyle(el).stroke);
    assert.equal(
      hitStroke,
      "none",
      `${name}: transparent hit targets must not have visible borders`,
    );
    if (!mobile) {
      await verifyFluidInk(page, name);
    } else {
      assert(
        (await page.locator(".pencil-trail").getAttribute("hidden")) !== null,
      );
      record(
        `${name}: coarse touch input leaves the score clear of pointer ink`,
      );
    }
    const initial = await snapshot(page);
    assert.equal(initial.audio.playing, false);
    assert.equal(initial.audio.activeNotes.length, 0);
    const clickAt = Date.now();
    await page.locator("#hero-play").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#transport-play")
          .getAttribute("aria-pressed") === "true" &&
        document.querySelector("#hero-keyboard .active-right"),
      { timeout: 10000 },
    );
    record(`${name}: user click to piano and synchronized keys`, {
      milliseconds: Date.now() - clickAt,
    });
    await parity(page, `${name}: staff, keyboard and audio agree`);
    const before = await snapshot(page);
    await page.getByRole("tab", { name: "简谱", exact: true }).click();
    const after = await snapshot(page);
    assert.equal(after.view, "numbered");
    assert(after.audio.playing);
    assert(
      after.audio.beat >= before.audio.beat - 0.01 &&
        after.audio.beat - before.audio.beat < 1,
    );
    record(`${name}: notation switch retains beat`, {
      before: before.audio.beat,
      after: after.audio.beat,
    });
    if (mobile) await page.locator("#practice-settings summary").click();
    await page.locator('button[data-hand="left"]').click();
    let state = await snapshot(page);
    assert.equal(state.audio.hand, "left");
    assert(state.audio.activeNotes.every((n) => n.hand === "left"));
    await parity(
      page,
      `${name}: actual left-hand playback and dimmed right hand`,
    );
    assert(
      (await page.locator("#hero-score .hand-right.is-muted").count()) > 0,
    );
    const speedBefore = state.audio.beat;
    await page.locator('[data-speed="70"]').click();
    state = await snapshot(page);
    assert.equal(state.audio.bpm, 70);
    assert(
      state.audio.beat >= speedBefore - 0.01 &&
        state.audio.beat - speedBefore < 1,
    );
    await page.locator("#loop-toggle").click();
    state = await snapshot(page);
    assert.deepEqual(state.audio.loop, { start: 4, end: 12 });
    const samples = await page.evaluate(async () => {
      const app = await import(
        document.querySelector("script[data-home-entry]").src
      );
      const snapshots = [];
      const start = performance.now();
      while (performance.now() - start < 14200) {
        const s = app.getHomeSnapshot().audio;
        snapshots.push({
          beat: s.beat,
          notes: s.activeNotes.map((n) => ({ hand: n.hand, beat: n.beat })),
        });
        await new Promise((r) => setTimeout(r, 90));
      }
      return snapshots;
    });
    const wraps = samples
      .slice(1)
      .filter((s, i) => s.beat < samples[i].beat - 1).length;
    assert(wraps >= 2, `${name}: fewer than two loop wraps`);
    assert(
      samples.every(
        (s) =>
          s.beat >= 4 &&
          s.beat < 12 &&
          s.notes.every((n) => n.hand === "left" && n.beat >= 4 && n.beat < 12),
      ),
    );
    await page.screenshot({
      path: resolve(output, `${name}-left-loop.png`),
      fullPage: false,
    });
    await page.locator("#transport-play").click();
    const stopped = await snapshot(page);
    await page.waitForTimeout(250);
    const later = await snapshot(page);
    assert(!later.audio.playing);
    assert.equal(later.audio.activeNotes.length, 0);
    assert.equal(later.audio.beat, stopped.audio.beat);
    record(`${name}: slow loop twice then pause`, {
      wraps,
      pausedBeat: later.audio.beat,
    });
    await page.locator('[data-measure="3"]').click();
    state = await snapshot(page);
    assert.equal(state.audio.beat, 12);
    assert.equal(state.audio.loop, null);
    await page.getByRole("tab", { name: "五线谱", exact: true }).click();
    await page.locator('[data-measure="0"]').click();
    await page.locator('button[data-hand="both"]').click();
    await page.locator('#hero-score .note-hit[data-note-ids~="ode-1"]').click();
    state = await snapshot(page);
    assert(!state.audio.playing);
    assert(state.audio.activeNotes.some((n) => n.midi === 64));
    record(`${name}: measure seek and single-note audition`);
    await page.getByRole("tab", { name: "钢琴卷帘", exact: true }).click();
    assert.equal((await snapshot(page)).view, "roll");
    await page.getByRole("tab", { name: "五线谱", exact: true }).click();
    await page.locator('.source-row[data-line="1"]').click();
    state = await snapshot(page);
    assert.equal(state.selectedLine, 1);
    assert(
      await page
        .locator("#digital-row-label")
        .innerText()
        .then((s) => s.includes("4–6")),
    );
    await page.locator('.source-row[data-line="0"]').click();
    await page.locator('[data-step="review"]').click();
    await page.locator("#correct-note").click();
    assert((await snapshot(page)).corrected);
    await page.locator("#bach-play").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#bach-play").getAttribute("aria-pressed") ===
        "true",
    );
    state = await snapshot(page);
    assert(state.audio.scoreId.startsWith("bach"));
    assert(
      !(await page
        .locator("#hero-play")
        .getAttribute("aria-pressed")
        .then((v) => v === "true")),
    );
    await page.screenshot({
      path: resolve(output, `${name}-review.png`),
      fullPage: false,
    });
    await page.locator("#bach-play").click();
    await page.locator("#review-reset").click();
    assert.equal((await snapshot(page)).corrected, false);
    record(`${name}: original row mapping, correction, audition and reset`);
    await page.locator("#hear-before").click();
    await page.waitForTimeout(130);
    state = await snapshot(page);
    assert.equal(state.audio.scoreId, "arrangement-before");
    const beforePitches = state.audio.activeNotes
      .filter((n) => n.hand === "right")
      .map((n) => n.midi)
      .sort();
    assert.deepEqual(beforePitches, [64]);
    await page.locator("#make-chord").click();
    assert((await snapshot(page)).arranged);
    await page.locator("#hear-after").click();
    await page.waitForTimeout(100);
    state = await snapshot(page);
    assert.equal(state.audio.scoreId, "arrangement-after");
    assert.deepEqual(
      state.audio.activeNotes
        .filter((n) => n.hand === "right")
        .map((n) => n.midi)
        .sort(),
      [60, 64, 67],
    );
    await page.locator("#hear-after").click();
    await page.screenshot({
      path: resolve(output, `${name}-arranged.png`),
      fullPage: false,
    });
    await assertPrintPreviewFits(page, name);
    await page.pdf({
      path: resolve(output, `${name}-A4.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
    });
    await page.emulateMedia({ media: "screen" });
    // Follow the public flow through a real natural end before undoing. A
    // later review action must not revive the completed arrangement's state.
    await page.locator("#hear-after").click();
    await page.waitForFunction(
      async () => {
        const audio = (
          await import(document.querySelector("script[data-home-entry]").src)
        ).getHomeSnapshot().audio;
        return (
          audio.scoreId === "arrangement-after" && audio.ended && !audio.playing
        );
      },
      undefined,
      { timeout: 6000, polling: 50 },
    );
    await page.locator("#undo-arrange").click();
    const undone = await snapshot(page);
    assert.equal(undone.arranged, false);
    assert.equal(
      undone.audio.ended,
      false,
      `${name}: undo clears the completed arrangement state`,
    );
    assert.equal(
      undone.audio.beat,
      0,
      `${name}: undo resets the arrangement clock`,
    );
    assert(
      (await page.locator("#arrange-status").innerText()).includes("已撤销"),
    );
    await page.locator("#review-reset").click();
    assert(
      (await page.locator("#arrange-status").innerText()).includes("已撤销"),
      `${name}: resetting review must preserve the undo status`,
    );
    assert(
      await page
        .locator("#print-edition")
        .innerText()
        .then((s) => s.includes("原始版本")),
    );
    record(`${name}: real triad change, A4 preview and undo`);
    record(
      `${name}: natural arrangement end, undo and review reset keep consistent state`,
    );
    const smallButtons = await page
      .locator("button:not([disabled]),summary")
      .evaluateAll((elements) =>
        elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5)
            );
          })
          .map((el) => ({
            label: el.textContent.trim(),
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          })),
      );
    assert.deepEqual(
      smallButtons,
      [],
      `${name}: buttons under 44px ${JSON.stringify(smallButtons)}`,
    );
    record(`${name}: 44px targets`);
    await assertNoOverflow(
      page,
      `${name}: layout remains contained after all actions`,
    );
    await page.locator('[data-speed="100"]').click();
    await page.locator('[data-measure="0"]').click();
    await page.screenshot({
      path: resolve(output, `${name}-full.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], `${name}: JS errors`);
    assert.deepEqual(missing, [], `${name}: missing resources`);
    record(`${name}: no browser errors or missing local resources`);
  } catch (error) {
    report.errors.push({ name, message: error.stack });
    console.error(`${name}: ${error.stack}`);
    await page
      .screenshot({
        path: resolve(output, `${name}-failure.png`),
        fullPage: true,
      })
      .catch(() => {});
  } finally {
    await context.close();
  }
}
try {
  await scenario({ name: "desktop", width: 1440, height: 1000, mobile: false });
  await scenario({ name: "mobile", width: 375, height: 812, mobile: true });
  try {
    await captureMotionEvidence();
  } catch (error) {
    report.errors.push({ name: "motion evidence", message: error.stack });
    console.error(error);
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  for (const name of ["desktop", "mobile"]) {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await readFile(resolve(output, `${name}-A4.pdf`))),
      isEvalSupported: false,
    });
    try {
      const pdf = await loadingTask.promise;
      assert.equal(pdf.numPages, 1, `${name}: A4 print must be one page`);
      const printed = await pdf.getPage(1);
      const viewport = printed.getViewport({ scale: 1 });
      assert(
        Math.abs(viewport.width - 595.28) < 1 &&
          Math.abs(viewport.height - 841.89) < 1,
        `${name}: exact A4 paper dimensions`,
      );
      const content = await printed.getTextContent();
      assert(
        content.items.length > 10,
        `${name}: printed score cannot be blank`,
      );
      record(`${name}: one nonblank A4 page`, {
        width: viewport.width,
        height: viewport.height,
      });
    } catch (error) {
      report.errors.push({ name: `${name}: A4 PDF`, message: error.stack });
      console.error(error);
    } finally {
      // PDF.js 6 exposes destroy() on PDFDocumentLoadingTask, not its proxy.
      await loadingTask.destroy();
    }
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(
    () => document.documentElement.dataset.homeReady === "true",
  );
  assert((await page.locator(".pencil-trail").getAttribute("hidden")) !== null);
  await page.waitForFunction(
    () => document.documentElement.dataset.pageMotion === "ready",
  );
  const reducedContent = await page
    .locator(".motion-reveal, #hero-title, .hero-description, #hero-play")
    .evaluateAll((elements) =>
      elements.map((el) => {
        const style = getComputedStyle(el);
        return {
          element: el.id || el.className,
          opacity: Number(style.opacity),
          transform: style.transform,
          visibility: style.visibility,
        };
      }),
    );
  assert(
    reducedContent.length > 5,
    "reduced motion must include below-fold reveal content",
  );
  assert(
    reducedContent.every(
      (el) =>
        el.opacity === 1 &&
        el.transform === "none" &&
        el.visibility === "visible",
    ),
    `reduced-motion content cannot wait for entrance or scroll animations: ${JSON.stringify(reducedContent)}`,
  );
  await page.screenshot({
    path: resolve(output, "reduced-motion-full.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "简谱", exact: true }).click();
  await page.locator('[data-measure="2"]').click();
  assert.equal((await snapshot(page)).audio.beat, 8);
  record(
    "reduced motion: ink disabled, all content visible and manual position updates immediately",
    { visibleContent: reducedContent.length },
  );
  await context.close();
  const failureContext = await browser.newContext();
  const failurePage = await failureContext.newPage();
  let block = true;
  await failurePage.route("**/audio/piano/*.mp3", (route) =>
    block ? route.abort() : route.continue(),
  );
  await failurePage.goto(base);
  await failurePage.waitForFunction(
    () => document.documentElement.dataset.homeReady === "true",
  );
  await failurePage.locator("#hero-play").click();
  await failurePage.locator("#audio-retry").waitFor({ state: "visible" });
  await failurePage.locator('[data-measure="2"]').click();
  assert.equal((await snapshot(failurePage)).audio.beat, 8);
  block = false;
  await failurePage.locator("#audio-retry").click();
  await failurePage.waitForFunction(() =>
    document.querySelector("#hero-keyboard .active-right"),
  );
  assert((await snapshot(failurePage)).audio.playing);
  record("sample failure stays visible, positioning works, retry recovers");
  await failureContext.close();
  const linkContext = await browser.newContext();
  const linkPage = await linkContext.newPage();
  await linkPage.goto(base);
  const hrefs = await linkPage
    .locator("a[href]")
    .evaluateAll((elements) => [
      ...new Set(elements.map((a) => a.getAttribute("href"))),
    ]);
  for (const href of hrefs) {
    if (href.startsWith("#")) {
      assert((await linkPage.locator(href).count()) > 0);
      report.links.push({ href, status: "anchor exists" });
      continue;
    }
    const url = new URL(href, base).href;
    const response = await linkContext.request.get(url, { timeout: 20000 });
    assert(response.ok(), `link ${href} returned ${response.status()}`);
    report.links.push({
      href,
      status: response.status(),
      final: response.url(),
    });
  }
  record("all homepage links return valid destinations");
  await linkContext.close();
  await verifyRealBackgroundTabs();
} catch (error) {
  report.errors.push({ name: "additional checks", message: error.stack });
  console.error(error);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
if (report.errors.length) process.exitCode = 1;
