// Captures the real app screenshots used by the promo site (site/assets/shots/*.webp).
// Drives a headless Google Chrome over the DevTools protocol with a throwaway profile:
//   - the public web app: 《致爱丽丝》 playing (staff, jianpu, export dialog, phone) and the recognised BWV 846 over its original page;
//   - the local app (QINBAN_URL, default http://127.0.0.1:8792): the PDF import preview for Chopin Op.28 No.7.
//     It only opens the preview, which runs in the browser; it never starts recognition, so nothing is written to .local/.
// Needs Node ≥ 22 (global WebSocket) and Chrome. Run: node scripts/capture-site-shots.mjs [desktop source phone local]
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const root = fileURLToPath(new URL("../", import.meta.url));
const WEB =
  process.env.QINBAN_WEB_URL || "https://dns0129.github.io/Open_Piano_Player/";
const LOCAL = process.env.QINBAN_URL || "http://127.0.0.1:8792/";
const CHROME =
  process.env.CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browser(port) {
  const profile = await mkdtemp(join(tmpdir(), "qinban-shots-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--hide-scrollbars",
      "--mute-audio",
      "--autoplay-policy=no-user-gesture-required",
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
      userGesture: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  };
  // Real mouse click on the smallest visible element matching the selector whose text includes `text`.
  const click = async (selector, text = "", within = "") => {
    for (let i = 0; i < 40; i++) {
      const box = await evaluate(`(() => {
        const scope = ${JSON.stringify(within)} ? [...document.querySelectorAll("li, article, section, div")].filter(e => e.offsetParent && e.textContent.includes(${JSON.stringify(within)}) && e.textContent.includes(${JSON.stringify(text)})).sort((a, b) => a.textContent.length - b.textContent.length)[0] : document;
        const el = scope && [...scope.querySelectorAll(${JSON.stringify(selector)})].find(e => e.offsetParent && (e.textContent.trim() + (e.getAttribute("aria-label") || "")).includes(${JSON.stringify(text)}));
        if (!el) return null;
        el.scrollIntoView({ block: "center", behavior: "instant" });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (box) {
        for (const type of ["mousePressed", "mouseReleased"])
          await send("Input.dispatchMouseEvent", {
            type,
            x: box.x,
            y: box.y,
            button: "left",
            clickCount: 1,
          });
        return;
      }
      await sleep(300);
    }
    throw new Error(`no element: ${selector} ${text}`);
  };
  await send("Page.enable");
  return {
    send,
    evaluate,
    click,
    async viewport(width, height, mobile = false) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: mobile ? 3 : 2,
        mobile,
      });
      if (mobile)
        await send("Emulation.setTouchEmulationEnabled", {
          enabled: true,
          maxTouchPoints: 5,
        });
    },
    async goto(url, wait = 6000) {
      await send("Page.navigate", { url });
      await sleep(wait);
    },
    async png() {
      return Buffer.from(
        (await send("Page.captureScreenshot", { format: "png" })).data,
        "base64",
      );
    },
    async close() {
      ws.close();
      proc.kill("SIGTERM");
      await sleep(500);
      await rm(profile, { recursive: true, force: true });
    },
  };
}

// crop: [x, y, w, h] in captured pixels; output is a WebP `width` pixels wide.
async function save(png, name, width, crop) {
  const img = await loadImage(png);
  const [x, y, w, h] = crop || [0, 0, img.width, img.height];
  const canvas = createCanvas(width, Math.round((h * width) / w));
  canvas
    .getContext("2d")
    .drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  await writeFile(
    `${root}site/assets/shots/${name}.webp`,
    canvas.toBuffer("image/webp", 84),
  );
  console.log(`site/assets/shots/${name}.webp`);
}

// Library → cloud library → search → download → open, in the public web app.
async function openCloudPiece(b, query, rowText) {
  await b.click("button, a", "曲库"); // 「我的曲库」 on desktop, 「曲库」 in the phone tab bar
  await sleep(1000);
  await b.click("button, a, [role=tab]", "云端曲库");
  await sleep(1000);
  await b.click("input[placeholder]");
  await b.send("Input.insertText", { text: query });
  await b.click("button", "搜索");
  await sleep(1500);
  await b.click("button", "下载到本地", rowText);
  await sleep(2500);
  await b.click("button, a, [role=tab]", "本地曲库");
  await sleep(1200);
  await b.click("button, a", "打开");
  await sleep(3000);
}
const SCORE_AREA = [490, 230, 2390, 1167]; // main score pane of a 1440×900 window at 2×
const only = process.argv.slice(2);
const want = (name) => !only.length || only.includes(name);

if (want("desktop")) {
  const desktop = await browser(9341);
  try {
    await desktop.viewport(1440, 900);
    await desktop.goto(WEB);
    await openCloudPiece(desktop, "致爱丽丝", "完整曲");
    await desktop.click("button", "播放");
    await sleep(14000); // the first play also loads the piano samples
    await save(await desktop.png(), "practice-staff", 1600);
    await desktop.evaluate(
      `document.querySelector('[data-mode="numbered"]').click()`,
    );
    await sleep(1600);
    await save(await desktop.png(), "practice-jianpu", 1400, SCORE_AREA);
    await desktop.click("button", "暂停").catch(() => {});
    await desktop.click("button", "导出乐谱");
    await sleep(1200);
    await save(
      await desktop.png(),
      "export-dialog",
      900,
      [939, 432, 1002, 936],
    );
  } finally {
    await desktop.close();
  }
}

if (want("source")) {
  const source = await browser(9342);
  try {
    await source.viewport(1440, 900);
    await source.goto(WEB);
    await openCloudPiece(source, "BWV846", "J. S. Bach");
    await source.click("button", "播放");
    await sleep(9000);
    await source.evaluate(
      `document.querySelector('[data-mode="source"]').click()`,
    );
    await sleep(2500);
    await save(await source.png(), "scan-original", 1400, SCORE_AREA);
  } finally {
    await source.close();
  }
}

if (want("phone")) {
  const phone = await browser(9343);
  try {
    await phone.viewport(390, 844, true);
    await phone.goto(WEB);
    await openCloudPiece(phone, "致爱丽丝", "完整曲");
    await phone.click("button", "播放");
    await sleep(12000);
    await save(await phone.png(), "practice-phone", 540);
  } finally {
    await phone.close();
  }
}

if (want("local")) {
  const local = await browser(9344);
  try {
    await local.viewport(1440, 900);
    await local.goto(LOCAL, 5000);
    await local.click("button, a", "导入乐谱");
    await sleep(1200);
    const input = await local.send("Runtime.evaluate", {
      expression: `[...document.querySelectorAll('input[type=file]')].find(i => /pdf/.test(i.accept))`,
    });
    await local.send("DOM.enable");
    await local.send("DOM.setFileInputFiles", {
      files: [
        `${root}public/intermediate-sources/intermediate-chopin-op28-07/original.pdf`,
      ],
      objectId: input.result.objectId,
    });
    await sleep(9000);
    await save(await local.png(), "scan-rows", 1400, [158, 734, 2564, 1023]);
  } catch (err) {
    console.warn(
      `skipped scan-rows.webp (local app at ${LOCAL}): ${err.message}`,
    );
  } finally {
    await local.close();
  }
}
