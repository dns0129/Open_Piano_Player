import test from "node:test";
import assert from "node:assert/strict";
import { PracticeAudio } from "../site/assets/practice-audio.js";

class Parameter {
  constructor() {
    this.value = 0;
    this.events = [];
  }
  setValueAtTime(value, time) {
    this.value = value;
    this.events.push(["set", value, time]);
  }
  linearRampToValueAtTime(value, time) {
    this.events.push(["linear", value, time]);
  }
  exponentialRampToValueAtTime(value, time) {
    this.events.push(["exponential", value, time]);
  }
  cancelScheduledValues(time) {
    this.events.push(["cancel", time]);
  }
}

class Node {
  constructor() {
    this.gain = new Parameter();
    this.frequency = new Parameter();
  }
  connect(node) {
    return node;
  }
  disconnect() {}
}

class Context {
  constructor() {
    this.currentTime = 0;
    this.state = "suspended";
    this.destination = new Node();
    this.events = [];
    this.resumes = 0;
  }
  resume() {
    this.resumes++;
    this.state = "running";
    return Promise.resolve();
  }
  createGain() {
    return new Node();
  }
  createBiquadFilter() {
    return new Node();
  }
  decodeAudioData(bytes) {
    return Promise.resolve({ root: new Uint8Array(bytes)[0], duration: 8 });
  }
  createBufferSource() {
    const source = new Node();
    source.playbackRate = new Parameter();
    source.stops = [];
    source.start = (when, offset) => {
      source.midi = Math.round(
        source.buffer.root + 12 * Math.log2(source.playbackRate.value),
      );
      source.when = when;
      source.offset = offset;
      this.events.push(source);
    };
    source.stop = (when) => source.stops.push(when);
    return source;
  }
}

class Page {
  constructor() {
    this.hidden = false;
    this.events = new Map();
  }
  addEventListener(name, fn) {
    this.events.set(name, fn);
  }
  removeEventListener(name) {
    this.events.delete(name);
  }
  hide() {
    this.hidden = true;
    this.events.get("visibilitychange")();
  }
}

function response(url) {
  const name = String(url).split("/").at(-1).replace(".mp3", "");
  const pitch = { C: 0, Ds: 3, Fs: 6, A: 9 }[name.slice(0, -1)];
  const root = 12 * (Number(name.at(-1)) + 1) + pitch;
  return { ok: true, arrayBuffer: async () => Uint8Array.of(root).buffer };
}

function setup(fetcher = async (url) => response(url)) {
  const context = new Context();
  const page = new Page();
  const tasks = new Map();
  let nextId = 0;
  let contextCount = 0;
  const player = new PracticeAudio({
    contextFactory: () => {
      contextCount++;
      return context;
    },
    fetcher,
    document: page,
    window: new Page(),
    setTimer: (fn, ms) => {
      tasks.set(++nextId, { fn, time: context.currentTime + ms / 1000 });
      return nextId;
    },
    clearTimer: (id) => tasks.delete(id),
    requestFrame: () => 0,
  });
  const advance = (seconds) => {
    const until = context.currentTime + seconds;
    let safety = 0;
    for (;;) {
      const entry = [...tasks]
        .filter(([, task]) => task.time <= until + 1e-10)
        .sort((a, b) => a[1].time - b[1].time)[0];
      if (!entry) break;
      const [id, task] = entry;
      tasks.delete(id);
      context.currentTime = task.time;
      task.fn();
      assert.ok(++safety < 20000, "timer must not spin");
    }
    context.currentTime = until;
  };
  return {
    player,
    context,
    page,
    advance,
    contextCount: () => contextCount,
    tasks,
  };
}

const score = {
  id: "ode",
  beats: 16,
  bpm: 120,
  notes: [
    ...Array.from({ length: 16 }, (_, beat) => ({
      id: `r${beat}`,
      beat,
      duration: 1,
      midi: 60 + beat,
      hand: "right",
      velocity: 0.65,
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `l${index}`,
      beat: index * 2,
      duration: 2,
      midi: 48 + index,
      hand: "left",
      velocity: 0.5,
    })),
  ],
};
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`);

test("prefetch is silent; gesture starts the shared beat clock and both hands", async () => {
  const env = setup();
  env.player.setScore(score);
  await env.player.prefetch();
  assert.equal(env.contextCount(), 0);
  assert.equal(env.context.events.length, 0);
  assert.equal(await env.player.play(), true);
  assert.equal(env.context.resumes, 1);
  assert.deepEqual(
    env.player.getSnapshot().activeNotes.map((note) => note.id),
    ["r0", "l0"],
  );
  assert.deepEqual(
    env.context.events.map((event) => event.midi),
    [60, 48],
  );
  env.advance(0.375);
  close(env.player.getSnapshot().beat, 0.75);
  env.player.dispose();
});

test("changing tempo and hand preserves beat and cancels already scheduled old voices", async () => {
  const env = setup();
  env.player.setScore(score);
  await env.player.play();
  env.advance(0.45); // beat .9; the right hand's next note is already queued.
  const oldSources = [...env.context.events];
  assert.ok(oldSources.some((event) => event.when > env.context.currentTime));
  env.player.setHand("left");
  close(env.player.getSnapshot().beat, 0.9);
  assert.ok(oldSources.every((event) => event.stops.at(-1) <= 0.45));
  assert.ok(
    env.player.getSnapshot().activeNotes.every((note) => note.hand === "left"),
  );
  const afterHand = env.context.events.slice(oldSources.length);
  assert.ok(
    afterHand.length > 0 && afterHand.every((event) => event.midi < 60),
  );
  env.player.setTempo(60);
  close(env.player.getSnapshot().beat, 0.9);
  env.advance(0.6);
  close(env.player.getSnapshot().beat, 1.5);
  env.player.pause();
  env.advance(1);
  close(env.player.getSnapshot().beat, 1.5);
  assert.equal(env.player.getSnapshot().activeNotes.length, 0);
  env.player.dispose();
});

test("loop [4,12) schedules the first note at the boundary without bar four or a duplicate onset", async () => {
  const env = setup();
  env.player.setScore(score);
  env.player.setLoop({ start: 4, end: 12 });
  close(env.player.getSnapshot().beat, 4);
  env.player.seek(11.9);
  await env.player.play();
  const boundary = env.context.events.filter((event) => event.midi === 64);
  assert.equal(boundary.length, 1);
  close(boundary[0].when, 0.05);
  const leavingNotes = env.context.events.filter((event) =>
    [71, 53].includes(event.midi),
  );
  assert.equal(leavingNotes.length, 2);
  for (const event of leavingNotes) close(event.stops.at(-1), 0.05);
  env.advance(0.075);
  close(env.player.getSnapshot().beat, 4.05);
  assert.equal(
    env.context.events.filter((event) => event.midi === 64).length,
    1,
  );
  env.advance(4);
  close(env.player.getSnapshot().beat, 4.05);
  assert.equal(
    env.context.events.filter((event) => event.midi === 64).length,
    2,
  );
  assert.ok(env.context.events.every((event) => event.midi < 72));
  env.player.setLoop(null);
  close(env.player.getSnapshot().beat, 4.05);
  env.player.dispose();
});

test("seek and natural end use the same timing for active notes", async () => {
  const env = setup();
  env.player.setScore(score);
  env.player.seek(8.5);
  await env.player.play();
  close(env.player.getSnapshot().beat, 8.5);
  assert.deepEqual(
    env.player.getSnapshot().activeNotes.map((note) => note.id),
    ["r8", "l4"],
  );
  close(
    env.context.events[0].offset,
    0.25 * env.context.events[0].playbackRate.value,
  );
  env.advance(3.8);
  assert.equal(env.player.getSnapshot().playing, false);
  assert.equal(env.player.getSnapshot().ended, true);
  close(env.player.getSnapshot().beat, 16);
  assert.equal(env.player.getSnapshot().activeNotes.length, 0);
  await env.player.play();
  close(env.player.getSnapshot().beat, 0);
  env.player.dispose();
});

test("backgrounding during loading cancels the pending gesture and never auto starts", async () => {
  const resolvers = [];
  const env = setup(
    (url) =>
      new Promise((resolve) => resolvers.push(() => resolve(response(url)))),
  );
  env.player.setScore(score);
  const pending = env.player.play();
  assert.equal(env.player.getSnapshot().loading, true);
  env.player.seek(8);
  close(env.player.getSnapshot().beat, 8);
  env.page.hide();
  for (const resolve of resolvers) resolve();
  assert.equal(await pending, false);
  assert.equal(env.player.getSnapshot().playing, false);
  assert.equal(env.player.getSnapshot().loading, false);
  assert.equal(env.context.events.length, 0);
  env.page.hidden = false;
  await env.player.play();
  close(env.player.getSnapshot().beat, 8);
  env.page.hide();
  assert.equal(env.player.getSnapshot().playing, false);
  assert.equal(env.player.getSnapshot().activeNotes.length, 0);
  env.player.dispose();
});

test("sample errors remain visible, permit positioning, and can be retried without a synth", async () => {
  let fails = true;
  const env = setup(async (url) => (fails ? { ok: false } : response(url)));
  env.player.setScore(score);
  assert.equal(await env.player.play(), false);
  assert.match(env.player.getSnapshot().error, /采样/);
  assert.equal(env.context.events.length, 0);
  env.player.seek(4);
  close(env.player.getSnapshot().beat, 4);
  fails = false;
  assert.equal(await env.player.play(), true);
  assert.equal(env.player.getSnapshot().error, null);
  close(env.player.getSnapshot().beat, 4);
  env.player.dispose();
});

test("audition pauses transport and another excerpt always takes exclusive sound ownership", async () => {
  const first = setup();
  const second = setup();
  first.player.setScore(score);
  second.player.setScore({ ...score, id: "bach" });
  await first.player.play();
  first.advance(0.25);
  await first.player.audition(score.notes[3]);
  assert.equal(first.player.getSnapshot().playing, false);
  close(first.player.getSnapshot().beat, 0.5);
  assert.deepEqual(
    first.player.getSnapshot().activeNotes.map((note) => note.id),
    ["r3"],
  );
  first.player.seek(4);
  assert.equal(first.player.getSnapshot().activeNotes.length, 0);
  assert.ok(
    first.context.events.every(
      (event) => event.stops.at(-1) <= first.context.currentTime,
    ),
  );
  await first.player.audition(score.notes[3]);
  await second.player.play();
  assert.equal(first.player.getSnapshot().activeNotes.length, 0);
  assert.ok(
    first.context.events.every(
      (event) => event.stops.at(-1) <= first.context.currentTime,
    ),
  );
  assert.equal(second.player.getSnapshot().playing, true);
  first.player.dispose();
  second.player.dispose();
});

test("rapid loading play/pause/play obeys only the latest intent and current settings", async () => {
  const resolvers = [];
  const env = setup(
    (url) =>
      new Promise((resolve) => resolvers.push(() => resolve(response(url)))),
  );
  env.player.setScore(score);
  const abandoned = env.player.play();
  env.player.pause();
  const superseded = env.player.play();
  const latest = env.player.play();
  env.player.setTempo(60);
  env.player.setHand("left");
  env.player.setLoop({ start: 4, end: 12 });
  env.player.seek(8.5);
  for (const resolve of resolvers) resolve();
  assert.deepEqual(await Promise.all([abandoned, superseded, latest]), [
    false,
    false,
    true,
  ]);
  const snapshot = env.player.getSnapshot();
  assert.equal(snapshot.playing, true);
  assert.equal(snapshot.loading, false);
  assert.equal(snapshot.bpm, 60);
  close(snapshot.beat, 8.5);
  assert.ok(snapshot.activeNotes.every((note) => note.hand === "left"));
  assert.equal(env.context.events.length, 1);
  assert.equal(env.context.events[0].midi, 52);
  env.player.dispose();
});

test("a seek a fraction before the loop boundary does not extend the old note past it", async () => {
  const env = setup();
  env.player.setScore(score);
  env.player.setTempo(60);
  env.player.setLoop({ start: 4, end: 12 });
  env.player.seek(11.9999);
  await env.player.play();
  const leaving = env.context.events.filter((event) =>
    [71, 53].includes(event.midi),
  );
  assert.equal(leaving.length, 2);
  for (const event of leaving) close(event.stops.at(-1), 0.0001);
  const incoming = env.context.events.filter((event) =>
    [64, 50].includes(event.midi),
  );
  assert.equal(incoming.length, 2);
  for (const event of incoming) close(event.when, 0.0001);
  env.player.dispose();
});

test("ended remains truthful when paused at the end, changing settings, then seeking back", async () => {
  const env = setup();
  env.player.setScore(score);
  env.player.seek(15.99);
  await env.player.play();
  env.advance(0.01); // End has passed, before the next 25ms scheduling callback.
  env.player.pause();
  assert.equal(env.player.getSnapshot().ended, true);
  env.player.setLoop(null);
  env.player.setTempo(60);
  env.player.setHand("left");
  assert.equal(env.player.getSnapshot().ended, true);
  env.player.seek(4);
  assert.equal(env.player.getSnapshot().ended, false);
  close(env.player.getSnapshot().beat, 4);
  env.player.dispose();
});

for (const [label, change] of [
  ["hand change", (player) => player.setHand("left")],
  ["manual seek", (player) => player.seek(8)],
  ["loop selection", (player) => player.setLoop({ start: 4, end: 12 })],
]) {
  test(`a ${label} cancels a pending audition without later sounding the old note`, async () => {
    const resolvers = [];
    const env = setup(
      (url) =>
        new Promise((resolve) => resolvers.push(() => resolve(response(url)))),
    );
    env.player.setScore(score);
    const pending = env.player.audition(score.notes[0]);
    assert.equal(env.player.getSnapshot().loading, true);
    change(env.player);
    assert.equal(env.player.getSnapshot().loading, false);
    for (const resolve of resolvers) resolve();
    assert.equal(await pending, false);
    assert.equal(env.context.events.length, 0);
    assert.equal(env.player.getSnapshot().activeNotes.length, 0);
    env.player.dispose();
  });
}
