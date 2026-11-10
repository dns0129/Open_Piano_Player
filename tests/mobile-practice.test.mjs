import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Element } from "vexflow";
import { fontsReady, renderNotation } from "../src/notation.js";
import { planSystems } from "../lib/notation-layout.mjs";
import {
  exportMusicXML,
  MUSICXML_DIVISIONS,
  MUSICXML_MAX_DIVISIONS,
} from "../lib/exporters.mjs";
import { importMusicXML } from "../lib/importers.mjs";
import { createPracticeMemory } from "../src/practice-memory.js";
import { createPracticeSession } from "../src/practice-session.js";
import { deliverFile, sharesFiles } from "../src/file-delivery.js";
import { PianoPlayer } from "../src/audio.js";

const sixteenths = (bars) => ({
  id: "dense",
  title: "密集十六分",
  tempo: 90,
  timeSignature: [4, 4],
  keySignature: 0,
  durationBeats: bars * 4,
  notes: Array.from({ length: bars * 16 }, (_, i) => ({
    id: `n${i}`,
    beat: i / 4,
    duration: 0.25,
    midi: 60 + (i % 8),
    hand: "right",
  })),
});

async function withDOM(width, run) {
  await fontsReady;
  const dom = new JSDOM('<div id="host"></div>');
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const measurementCanvas = Element.getTextMeasurementCanvas();
  try {
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    globalThis.cancelAnimationFrame = () => {};
    dom.window.HTMLCanvasElement.prototype.getContext = () => ({
      font: "",
      measureText: (text) => ({
        width: String(text).length * 8,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      }),
    });
    Element.setTextMeasurementCanvas(document.createElement("canvas"));
    const host = document.querySelector("#host");
    Object.defineProperty(host, "clientWidth", { value: width });
    return await run(host);
  } finally {
    Element.setTextMeasurementCanvas(measurementCanvas);
    Object.assign(globalThis, saved);
  }
}

const systemScales = (host) =>
  [...host.querySelectorAll(".notation-system")].map((system) => {
    const box = Number(
      system.querySelector("svg").getAttribute("viewBox").split(" ")[2],
    );
    return {
      layout: box,
      pinned: parseFloat(system.style.width) || null,
      scrolls: system.parentElement.classList.contains("notation-row"),
    };
  });

test("a phone-width practice score never shrinks a dense bar below the readable size; it scrolls sideways instead", async () => {
  await withDOM(360, async (host) => {
    const score = sixteenths(3);
    // The old layout: every system is squeezed into the host width.
    const fitted = renderNotation(host, score, { autoScroll: false });
    const before = systemScales(host);
    assert.ok(before.every((system) => !system.scrolls && !system.pinned));
    assert.ok(
      before.some((system) => 360 / system.layout < 0.8),
      "the fixture must be dense enough to have been shrunk",
    );
    fitted.destroy();

    const readable = renderNotation(host, score, {
      autoScroll: false,
      overflow: "scroll",
      renderAll: true,
    });
    const after = systemScales(host);
    assert.ok(after.length >= 3);
    for (const system of after) {
      const scale = system.pinned ? system.pinned / system.layout : 1;
      assert.ok(scale >= 0.8 - 1e-3, `scale ${scale} keeps notes readable`);
      assert.equal(system.scrolls, Boolean(system.pinned));
    }
    assert.ok(after.some((system) => system.scrolls));
    // The explanation folds away on a phone and the score is not selectable text.
    assert.equal(host.querySelector(".notation-help-toggle").open, false);
    assert.match(
      document.querySelector("#pianola-notation-styles").textContent,
      /\.notation-root\{[^}]*user-select:none/,
    );

    // Larger notes take more room: fewer bars per row, same guarantee.
    assert.equal(readable.setZoom(1.5), 1.5);
    assert.equal(readable.zoom, 1.5);
    for (const system of systemScales(host)) {
      const scale = system.pinned ? system.pinned / system.layout : 1.5;
      assert.ok(scale >= 0.8 * 1.5 - 1e-3);
    }
    assert.equal(readable.setZoom(99), 2.4, "zoom is clamped");
    readable.destroy();
  });
});

test("score size is a no-op for fitted previews and compact spacing only tightens narrow rows", async () => {
  await withDOM(360, async (host) => {
    const preview = renderNotation(host, sixteenths(1), { autoScroll: false });
    assert.equal(preview.setZoom(2), 1);
    assert.equal(host.querySelector(".notation-row"), null);
    preview.destroy();
  });
  const score = sixteenths(2);
  const normal = planSystems(score, 360, "staff"),
    compact = planSystems(score, 360, "staff", { compact: true });
  assert.ok(compact[0].width < normal[0].width);
  assert.deepEqual(
    planSystems(score, 900, "staff"),
    planSystems(score, 900, "staff", {}),
  );
});

test("MusicXML declares the smallest exact divisions and keeps schema order", () => {
  const plain = exportMusicXML(sixteenths(2));
  assert.match(plain, /<divisions>4<\/divisions>/);
  assert.ok(!plain.includes(String(MUSICXML_DIVISIONS)));
  assert.match(plain, /<duration>1<\/duration>/);
  assert.equal(importMusicXML(plain).score.notes.length, 32);

  // Triplet with a written accidental: accidental precedes time-modification.
  const triplet = exportMusicXML({
    id: "t",
    title: "三连音",
    tempo: 90,
    timeSignature: [4, 4],
    keySignature: 0,
    durationBeats: 4,
    notes: [
      ...[0, 1, 2].map((i) => ({
        id: `t${i}`,
        beat: i / 3,
        duration: 1 / 3,
        midi: 61 + i,
        hand: "right",
        accidental: "sharp",
        rhythm: {
          type: "eighth",
          dots: 0,
          tuplets: [{ actual: 3, normal: 2 }],
        },
      })),
      { id: "q", beat: 1, duration: 3, midi: 60, hand: "right" },
    ],
  });
  assert.match(triplet, /<divisions>3<\/divisions>/);
  assert.match(
    triplet,
    /<type>eighth<\/type><accidental>sharp<\/accidental><time-modification>/,
  );
  // No empty composer or credit elements.
  assert.ok(!plain.includes('<creator type="composer"></creator>'));
  assert.ok(!plain.includes("<credit-words></credit-words>"));
});

test("free-timed durations are rounded to a bounded grid and every voice still fills its bar", () => {
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const xml = exportMusicXML({
    id: "free",
    title: "自由节奏",
    tempo: 90,
    timeSignature: [4, 4],
    keySignature: -2,
    durationBeats: 16,
    notes: Array.from({ length: 50 }, (_, i) => ({
      id: `f${i}`,
      beat: Math.round(i * 0.2613 * 1e6) / 1e6,
      duration: 0.11 + random() * 0.9,
      midi: 48 + Math.floor(random() * 30),
      hand: i % 3 ? "right" : "left",
    })),
  });
  const divisions = Number(xml.match(/<divisions>(\d+)<\/divisions>/)[1]);
  assert.ok(divisions <= MUSICXML_MAX_DIVISIONS);
  const bar = divisions * 4;
  for (const [, body] of xml.matchAll(/<measure [^>]*>(.*?)<\/measure>/gs)) {
    let cursor = 0;
    const ends = new Set();
    for (const [, kind, inner] of body.matchAll(
      /<(note|backup|forward)[ >](.*?)<\/\1>/gs,
    )) {
      const length = Number(inner.match(/<duration>(\d+)<\/duration>/)?.[1]);
      if (kind === "backup") {
        ends.add(cursor);
        cursor -= length;
      } else if (kind === "forward" || !/<chord\/>|<grace/.test(inner))
        cursor += length;
    }
    ends.add(cursor);
    assert.deepEqual([...ends], [bar]);
  }
  assert.ok(!/<actual-notes>\d{4,}/.test(xml), "no nonsense tuplet ratios");
});

test("practice memory restores tempo, loop and place per piece and announces a return once", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const score = { id: "piece", tempo: 96, durationBeats: 64 };
  const first = createPracticeMemory({ storage });
  assert.equal(first.recall(score), null);
  first.remember(score, { tempo: 96, beat: 0, loopStart: 0, loopEnd: 16 });
  assert.equal(values.size, 0, "an untouched piece stores nothing");
  first.remember(score, { tempo: 60, beat: 20, loopStart: 16, loopEnd: 32 });

  const next = createPracticeMemory({ storage });
  assert.deepEqual(next.recall(score), {
    tempo: 60,
    beat: 20,
    loopStart: 16,
    loopEnd: 32,
    announce: true,
  });
  assert.equal(next.recall(score).announce, false);
  // A finished piece starts from the top; an edited, shorter score is not overrun.
  next.remember(score, { tempo: 60, beat: 64, loopStart: 16, loopEnd: 32 });
  assert.equal(next.recall(score).beat, 0);
  assert.equal(next.recall({ ...score, durationBeats: 8 }).loopEnd, 0);

  // Hosted (possibly shared) devices keep the state in memory only.
  const hosted = createPracticeMemory({ persist: false, storage });
  hosted.remember({ ...score, id: "private" }, { tempo: 50, beat: 4 });
  assert.equal(hosted.recall({ ...score, id: "private" }).tempo, 50);
  assert.ok(!values.get("qinban-practice-memory-v1").includes("private"));
  // Corrupt or unavailable storage never blocks practice.
  assert.equal(
    createPracticeMemory({
      storage: { getItem: () => "{", setItem() {} },
    }).recall(score),
    null,
  );
});

test("the practice session keeps the screen awake only while practising and wires media keys", async () => {
  const events = [];
  let handlers = {};
  const nav = {
    wakeLock: {
      request: async (kind) => {
        events.push(`lock:${kind}`);
        return {
          addEventListener() {},
          release: async () => events.push("release"),
        };
      },
    },
    mediaSession: {
      setActionHandler: (action, handler) => (handlers[action] = handler),
    },
  };
  const doc = { visibilityState: "visible", addEventListener() {} };
  const session = createPracticeSession({
    onPlay: () => events.push("play"),
    onPause: () => events.push("pause"),
    nav,
    doc,
  });
  assert.equal(session.canKeepAwake, true);
  session.update({ active: true, playing: false, keepAwake: false });
  await Promise.resolve();
  assert.deepEqual(events, []);
  session.update({ active: true, playing: true, keepAwake: false });
  await new Promise((resolve) => setTimeout(resolve));
  session.update({ active: true, playing: true, keepAwake: false });
  await new Promise((resolve) => setTimeout(resolve));
  assert.deepEqual(events, ["lock:screen"], "one lock, not one per update");
  assert.equal(nav.mediaSession.playbackState, "playing");
  session.update({ active: false, playing: false, keepAwake: true });
  await new Promise((resolve) => setTimeout(resolve));
  assert.deepEqual(events, ["lock:screen", "release"]);
  handlers.play();
  handlers.pause();
  assert.deepEqual(events.slice(2), ["play", "pause"]);
  // Browsers without either API are simply unaffected.
  const bare = createPracticeSession({ nav: {}, doc });
  assert.equal(bare.canKeepAwake, false);
  bare.update({ active: true, playing: true, keepAwake: true });
});

test("files go to the share sheet on touch devices and fall back cleanly", async () => {
  const saved = {
    matchMedia: globalThis.matchMedia,
    document: globalThis.document,
  };
  const file = new File(["x"], "谱.musicxml", { type: "text/plain" });
  const clicks = [];
  try {
    globalThis.document = {
      createElement: () => ({
        style: {},
        click() {
          clicks.push(this.download);
        },
        remove() {},
      }),
      body: { append() {} },
    };
    const share = (result) => ({
      canShare: () => true,
      share: async () => {
        if (result) throw Object.assign(new Error(result), { name: result });
      },
    });
    globalThis.matchMedia = () => ({ matches: true });
    assert.equal(sharesFiles(share()), true);
    assert.equal(await deliverFile(file, { nav: share() }), "shared");
    assert.equal(
      await deliverFile(file, { nav: share("AbortError") }),
      "cancelled",
    );
    assert.equal(
      await deliverFile(file, { nav: share("NotAllowedError") }),
      "needs-tap",
    );
    assert.deepEqual(clicks, [], "none of these may also download the file");
    // A type the share sheet refuses, and any desktop browser, download instead.
    assert.equal(
      await deliverFile(file, { nav: { ...share(), canShare: () => false } }),
      "downloaded",
    );
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(sharesFiles(share()), false);
    assert.equal(await deliverFile(file, { nav: share() }), "downloaded");
    assert.deepEqual(clicks, ["谱.musicxml", "谱.musicxml"]);
  } finally {
    Object.assign(globalThis, saved);
  }
});

test("a suspended audio context is resumed in the tap, reported when it stays blocked, and never plays on in silence", async () => {
  class Node {
    gain = {
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
      cancelScheduledValues() {},
      setTargetAtTime() {},
    };
    frequency = { value: 0 };
    detune = { value: 0 };
    threshold = { value: 0 };
    knee = { value: 0 };
    ratio = { value: 0 };
    attack = { value: 0 };
    release = { value: 0 };
    connect() {}
    disconnect() {}
    start() {}
    stop() {}
  }
  const makeContext = (unlock) => {
    const context = {
      state: "suspended",
      currentTime: 0,
      sampleRate: 48000,
      destination: {},
      resumes: 0,
      createGain: () => new Node(),
      createDynamicsCompressor: () => new Node(),
      createOscillator: () => new Node(),
      resume() {
        context.resumes++;
        return unlock(context);
      },
      async close() {
        context.state = "closed";
      },
    };
    return context;
  };
  const score = {
    tempo: 120,
    timeSignature: [4, 4],
    keySignature: 0,
    durationBeats: 8,
    notes: [{ id: "a", beat: 0, duration: 8, midi: 60, hand: "right" }],
  };
  const build = (context) => {
    const states = [];
    const player = new PianoPlayer({
      instrument: "synth",
      audioContextFactory: () => context,
      requestFrame: () => 1,
      cancelFrame() {},
      setIntervalFn: () => 1,
      clearIntervalFn() {},
      onStateChange: (state) => states.push(state),
    });
    player.setScore(score);
    return { player, states };
  };

  // 1. The normal phone path: suspended until the tap resumes it.
  const granted = makeContext(async (context) => {
    context.state = "running";
  });
  const ok = build(granted);
  await ok.player.play();
  assert.equal(ok.player.state, "playing");
  assert.equal(granted.resumes, 1);

  // 2. Interrupted mid-piece (call, lock screen) and resuming needs a new tap:
  //    the transport pauses instead of counting bars in silence.
  granted.resume = () => new Promise(() => {});
  granted.state = "interrupted";
  const timers = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => (timers.push(fn), timers.length);
  try {
    const recovering = ok.player._recoverAudio();
    timers.splice(0).forEach((fn) => fn());
    await recovering;
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.equal(ok.player.state, "paused");
  assert.deepEqual(ok.states, ["playing", "paused"]);
  await ok.player.dispose();

  // 3. A browser that refuses to start audio is reported, not ignored.
  const blocked = build(makeContext(async () => {}));
  await assert.rejects(blocked.player.play(), /再点一次播放键/);
  assert.equal(blocked.player.state, "stopped");
  await blocked.player.dispose();
});
