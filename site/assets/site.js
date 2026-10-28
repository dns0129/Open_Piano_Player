/* 琴伴 promo site: piano playback, the MusicXML → MIDI converter and the live follow demo (VexFlow). */
(() => {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmtTime = (s) =>
    `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

  // Melodies written as jianpu in C: digit, ' = octave up, , = octave down, - = +1 beat, _ = eighth, . = dotted.
  function jianpu(src, { tonic = 60, hand = 0, vel = 0.62 } = {}) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const notes = [];
    let beat = 0;
    for (const token of src.trim().split(/\s+/)) {
      let dur = token.includes("_") ? 0.5 : 1;
      if (token.includes(".")) dur *= 1.5;
      dur += (token.match(/-/g) || []).length;
      const oct =
        (token.match(/'/g) || []).length - (token.match(/,/g) || []).length;
      notes.push({
        beat,
        dur,
        midi: tonic + SCALE[Number(token[0]) - 1] + 12 * oct,
        hand,
        vel,
      });
      beat += dur;
    }
    return notes;
  }
  // 《欢乐颂》 theme, 16 bars, with a half-note bass line (same notes as the MusicXML sample).
  const ODE_RIGHT = jianpu(
    "3 3 4 5 5 4 3 2 1 1 2 3 3. 2_ 2- 3 3 4 5 5 4 3 2 1 1 2 3 2. 1_ 1- " +
      "2 2 3 1 2 3_ 4_ 3 1 2 3_ 4_ 3 2 1 2 5,- 3 3 4 5 5 4 3 2 1 1 2 3 2. 1_ 1-",
  );
  const ODE_BASS = [
    48, 55, 43, 50, 48, 55, 43, 50, 48, 55, 43, 50, 48, 55, 43, 48,
  ];
  ODE_BASS.push(43, 48, 43, 48, 43, 50, 48, 43, 48, 55, 43, 50, 48, 55, 43, 48);
  const ODE = [
    ...ODE_RIGHT,
    ...ODE_BASS.map((midi, i) => ({
      beat: i * 2,
      dur: 2,
      midi,
      hand: 1,
      vel: 0.42,
    })),
  ].sort((a, b) => a.beat - b.beat || b.midi - a.midi);
  const bars = (notes, from, to) =>
    notes
      .filter((n) => n.beat >= from * 4 && n.beat < to * 4)
      .map((n) => ({ ...n, beat: n.beat - from * 4 }));

  const frame = (() => {
    const fns = new Set();
    let raf = 0;
    const run = (t) => {
      raf = 0;
      for (const fn of [...fns]) {
        try {
          fn(t);
        } catch (err) {
          console.error(err); // one failing callback must not stop the others
        }
      }
      if (fns.size) raf = requestAnimationFrame(run);
    };
    return {
      add(fn) {
        fns.add(fn);
        if (!raf) raf = requestAnimationFrame(run);
      },
      remove(fn) {
        fns.delete(fn);
      },
    };
  })();

  /* ---------------- Sound: Salamander piano samples with a little room ---------------- */
  const Sound = (() => {
    const SAMPLES = {
      33: "A1",
      36: "C2",
      39: "Ds2",
      42: "Fs2",
      45: "A2",
      48: "C3",
      51: "Ds3",
      54: "Fs3",
      57: "A3",
      60: "C4",
      63: "Ds4",
      66: "Fs4",
      69: "A4",
      72: "C5",
      75: "Ds5",
      78: "Fs5",
      81: "A5",
      84: "C6",
      87: "Ds6",
      90: "Fs6",
      93: "A6",
      96: "C7",
    };
    const raw = new Map();
    const buffers = new Map();
    let ctx = null;
    let bus = null;
    let decoding = null;
    let unlocked = false;
    let fetched = false;

    // Samples are fetched on first use of anything that plays, then decoded once audio is allowed.
    function prefetch() {
      if (fetched) return;
      fetched = true;
      for (const midi of Object.keys(SAMPLES)
        .map(Number)
        .sort((a, b) => Math.abs(a - 64) - Math.abs(b - 64))) {
        raw.set(
          midi,
          fetch(`assets/audio/piano/${SAMPLES[midi]}.mp3`)
            .then((res) => (res.ok ? res.arrayBuffer() : null))
            .catch(() => null),
        );
      }
    }
    function decodeAll() {
      decoding ||= Promise.all(
        [...raw].map(async ([midi, bytes]) => {
          const data = await bytes;
          if (!data) return;
          try {
            buffers.set(
              midi,
              await new Promise((ok, fail) =>
                ctx.decodeAudioData(data.slice(0), ok, fail),
              ),
            );
          } catch {
            /* the synth fallback covers a sample that fails to decode */
          }
        }),
      );
      return decoding;
    }
    function impulse(seconds) {
      const rate = ctx.sampleRate;
      const len = Math.floor(rate * seconds);
      const buf = ctx.createBuffer(2, len, rate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++)
          d[i] =
            (Math.random() * 2 - 1) *
            Math.pow(1 - i / len, 3.4) *
            Math.min(1, i / (rate * 0.012));
      }
      return buf;
    }
    // Called from pointerdown / keydown / touchend, which browsers accept for starting audio.
    function unlock() {
      unlocked = true;
      return init();
    }
    function init() {
      if (!unlocked) return null;
      prefetch();
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC({ latencyHint: "interactive" });
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 3;
        bus = ctx.createGain();
        bus.gain.value = 0.8;
        const verb = ctx.createConvolver();
        verb.buffer = impulse(2.2);
        const wet = ctx.createGain();
        wet.gain.value = 0.18;
        bus.connect(comp);
        bus.connect(wet).connect(verb).connect(comp);
        comp.connect(ctx.destination);
        decodeAll();
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    function nearest(midi) {
      let best = null;
      let dist = 99;
      for (const m of buffers.keys()) {
        const d = Math.abs(m - midi);
        if (d < dist) {
          dist = d;
          best = m;
        }
      }
      return dist <= 6 ? best : null;
    }
    function piano(midi, { when = 0, dur = 0.5, vel = 0.7 } = {}) {
      if (!init()) return null;
      const t = Math.max(ctx.currentTime, when || ctx.currentTime);
      const end = t + Math.max(0.06, dur);
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = clamp(
        700 + vel * vel * 9000 + (midi - 40) * 45,
        500,
        16000,
      );
      const peak = 0.08 + Math.pow(clamp(vel, 0, 1), 1.7) * 0.85;
      const base = nearest(midi);
      const sources = [];
      if (base != null) {
        const src = ctx.createBufferSource();
        src.buffer = buffers.get(base);
        src.playbackRate.value = Math.pow(2, (midi - base) / 12);
        g.gain.setValueAtTime(peak, t);
        g.gain.setValueAtTime(peak, end);
        g.gain.setTargetAtTime(0, end, 0.1);
        src.connect(lp);
        sources.push(src);
      } else {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        osc.connect(lp);
        sources.push(osc);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak * 0.5, t + 0.006);
        g.gain.setTargetAtTime(peak * 0.1, t + 0.006, 0.4);
        g.gain.setTargetAtTime(0, end, 0.1);
      }
      lp.connect(g).connect(bus);
      for (const s of sources) {
        s.start(t);
        s.stop(end + 1.2);
      }
      return {
        start: t,
        end,
        cancel() {
          for (const s of sources) {
            try {
              s.stop();
            } catch {
              /* already stopped */
            }
          }
          g.disconnect();
        },
        release(at) {
          const x = Math.max(ctx.currentTime, at ?? ctx.currentTime);
          g.gain.cancelScheduledValues(x);
          g.gain.setValueAtTime(g.gain.value, x);
          g.gain.setTargetAtTime(0, x, 0.07);
        },
      };
    }
    return {
      init,
      unlock,
      piano,
      ready: () => decoding || Promise.resolve(),
      get now() {
        return ctx ? ctx.currentTime : 0;
      },
    };
  })();

  /* ---------------- Sequencer ---------------- */
  // Tempo changes and seeks reschedule everything not yet sounding from the current beat,
  // the same way the App's practice room keeps its place.
  class Player {
    constructor({ notes = [], bpm = 100, onState, onEnd } = {}) {
      Object.assign(this, { bpm, onState, onEnd });
      this.playing = false;
      this.pos = 0;
      this.voices = [];
      this.segs = [{ t: 0, b: 0 }];
      this.setNotes(notes);
    }
    setNotes(notes, length) {
      this.notes = [...notes].sort((a, b) => a.beat - b.beat);
      this.length =
        length ?? Math.max(0, ...this.notes.map((n) => n.beat + n.dur));
    }
    get beat() {
      if (!this.playing || this.starting) return this.pos;
      const now = Sound.now;
      const seg = this.segs[0];
      // Playback starts a few milliseconds after scheduling; until then report the start beat.
      return seg.b + (Math.max(0, now - seg.t) * this.bpm) / 60;
    }
    async play() {
      if (this.playing) return;
      if (Player.current && Player.current !== this) Player.current.pause();
      Player.current = this;
      if (!Sound.init()) return;
      this.playing = true;
      this.starting = true;
      this.onState?.(true);
      await Promise.race([
        Sound.ready(),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
      this.starting = false;
      if (!this.playing) return;
      if (this.pos >= this.length - 1e-6) this.pos = 0;
      this.reschedule(this.pos);
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 25);
    }
    pause() {
      if (!this.playing) return;
      this.pos = this.beat;
      this.playing = false;
      clearInterval(this.timer);
      clearTimeout(this.endTimer);
      this.endTimer = 0;
      const now = Sound.now;
      for (const v of this.voices) {
        if (!v) continue;
        if (v.start > now) v.cancel();
        else v.release(now);
      }
      this.voices = [];
      if (Player.current === this) Player.current = null;
      this.onState?.(false);
    }
    toggle() {
      if (this.playing) this.pause();
      else this.play();
    }
    seek(beat) {
      beat = clamp(beat, 0, Math.max(0, this.length - 1e-3));
      if (this.playing && !this.starting) this.reschedule(beat, true);
      else this.pos = beat;
    }
    setTempo(bpm) {
      const b = this.beat;
      this.bpm = bpm;
      if (this.playing && !this.starting) this.reschedule(b);
    }
    reschedule(beat, cutRinging) {
      const now = Sound.now;
      this.voices = this.voices.filter((v) => {
        if (!v) return false;
        if (v.start > now + 0.004) {
          v.cancel();
          return false;
        }
        if (cutRinging) v.release(now);
        return !cutRinging;
      });
      this.segs = [{ t: now + 0.04, b: beat }];
      this.cursor = beat;
      this.idx = this.notes.findIndex((n) => n.beat >= beat - 1e-6);
      if (this.idx < 0) this.idx = this.notes.length;
      clearTimeout(this.endTimer);
      this.endTimer = 0;
      this.tick();
    }
    tick() {
      if (!this.playing) return;
      const now = Sound.now;
      const seg = this.segs[0];
      const spb = 60 / this.bpm;
      const tAt = (b) => seg.t + (b - seg.b) * spb;
      const upto = Math.min(seg.b + (now + 0.15 - seg.t) / spb, this.length);
      while (
        this.idx < this.notes.length &&
        this.notes[this.idx].beat < upto - 1e-9
      ) {
        const n = this.notes[this.idx++];
        if (n.beat < this.cursor - 1e-6) continue;
        this.voices.push(
          Sound.piano(n.midi, {
            when: tAt(n.beat),
            dur: n.dur * spb,
            vel: n.vel ?? 0.7,
          }),
        );
      }
      this.cursor = upto;
      if (upto >= this.length && !this.endTimer) {
        this.endTimer = setTimeout(
          () => {
            this.pause();
            this.pos = 0;
            this.onEnd?.();
          },
          Math.max(0, (tAt(this.length) - now) * 1000 + 40),
        );
      }
      this.voices = this.voices.filter((v) => v && v.end > now - 0.3);
    }
  }
  Player.current = null;

  /* ---------------- MusicXML → MIDI ---------------- */
  const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Reads score-partwise MusicXML into timed notes (quarter-note beats). Chords, backup/forward,
  // tuplets (via <duration>), ties and tempo marks are honoured; grace notes are skipped and
  // repeats are kept in written order.
  function parseMusicXML(source) {
    const doc = new DOMParser().parseFromString(source, "application/xml");
    if (doc.getElementsByTagName("parsererror").length)
      throw new Error("这个文件不是有效的 XML。");
    const root = doc.documentElement;
    if (root.nodeName === "score-timewise")
      throw new Error(
        "暂不支持 timewise 格式的 MusicXML，请先用打谱软件另存为 partwise。",
      );
    if (root.nodeName !== "score-partwise")
      throw new Error("文件里没有 MusicXML 乐谱（score-partwise）。");
    const kid = (el, name) => {
      for (const c of el.children) if (c.nodeName === name) return c;
      return null;
    };
    const val = (el, name) => kid(el, name)?.textContent.trim() ?? null;
    const title =
      root.querySelector("work > work-title")?.textContent.trim() ||
      root.querySelector("movement-title")?.textContent.trim() ||
      "未命名乐谱";
    const composer =
      root
        .querySelector('identification > creator[type="composer"]')
        ?.textContent.trim() || "";
    const names = new Map(
      [...root.querySelectorAll("part-list > score-part")].map((sp) => [
        sp.id,
        sp.querySelector("part-name")?.textContent.trim() || sp.id,
      ]),
    );

    const notes = [];
    const tempos = [];
    const staves = new Map();
    let timeSig = null;
    let measures = 0;
    let beats = 0;
    let noteTags = 0;
    let rests = 0;
    let graces = 0;
    for (const part of root.children) {
      if (part.nodeName !== "part") continue;
      const id = part.id;
      let divisions = 1;
      let t = 0;
      let lastStart = 0;
      let dynamics = 0.71;
      let count = 0;
      const open = new Map();
      for (const measure of part.children) {
        if (measure.nodeName !== "measure") continue;
        count += 1;
        let maxT = t;
        for (const el of measure.children) {
          if (el.nodeName === "attributes") {
            if (val(el, "divisions")) divisions = Number(val(el, "divisions"));
            if (val(el, "staves")) staves.set(id, Number(val(el, "staves")));
            const time = kid(el, "time");
            if (time && !timeSig && val(time, "beats"))
              timeSig = [
                Number(val(time, "beats")),
                Number(val(time, "beat-type")),
              ];
          } else if (el.nodeName === "backup")
            t -= Number(val(el, "duration")) / divisions;
          else if (el.nodeName === "forward")
            t += Number(val(el, "duration")) / divisions;
          else if (el.nodeName === "direction" || el.nodeName === "sound") {
            const s = el.nodeName === "sound" ? el : el.querySelector("sound");
            const bpm = Number(s?.getAttribute("tempo"));
            if (bpm > 0) tempos.push({ beat: t, bpm });
            const dyn = Number(s?.getAttribute("dynamics"));
            if (dyn > 0) dynamics = clamp((dyn * 0.9) / 127, 0.05, 1);
          } else if (el.nodeName === "note") {
            noteTags += 1;
            if (kid(el, "grace")) {
              graces += 1;
              continue;
            }
            const dur = Number(val(el, "duration") || 0) / divisions;
            const chord = !!kid(el, "chord");
            const at = chord ? lastStart : t;
            if (!chord) {
              lastStart = t;
              t += dur;
            }
            maxT = Math.max(maxT, t);
            if (kid(el, "rest")) {
              rests += 1;
              continue;
            }
            const pitch = kid(el, "pitch");
            if (!pitch) continue;
            const midi =
              (Number(val(pitch, "octave")) + 1) * 12 +
              STEP[val(pitch, "step")] +
              Math.round(Number(val(pitch, "alter") || 0));
            const staff = Number(val(el, "staff") || 1);
            const ties = [...el.children]
              .filter((c) => c.nodeName === "tie")
              .map((c) => c.getAttribute("type"));
            const key = `${staff}:${midi}`;
            const held = open.get(key);
            if (
              ties.includes("stop") &&
              held &&
              Math.abs(held.beat + held.dur - at) < 1e-6
            ) {
              held.dur += dur;
              if (!ties.includes("start")) open.delete(key);
              continue;
            }
            const vel =
              Number(el.getAttribute("dynamics")) > 0
                ? clamp(
                    (Number(el.getAttribute("dynamics")) * 0.9) / 127,
                    0.05,
                    1,
                  )
                : dynamics;
            const note = { part: id, staff, midi, beat: at, dur, vel };
            notes.push(note);
            if (ties.includes("start")) open.set(key, note);
          }
          maxT = Math.max(maxT, t);
        }
        t = maxT; // a voice that ends early never shortens the bar
      }
      measures = Math.max(measures, count);
      beats = Math.max(beats, t);
    }
    if (!notes.length) throw new Error("文件里没有找到可以播放的音符。");

    // One MIDI track per part and staff: a piano part's two staves become right and left hand.
    const tracks = [];
    for (const [id, name] of names) {
      const multi = (staves.get(id) || 1) > 1;
      const used = [
        ...new Set(notes.filter((n) => n.part === id).map((n) => n.staff)),
      ].sort((a, b) => a - b);
      for (const staff of used) {
        const label = multi
          ? staff === 1
            ? "右手"
            : staff === 2
              ? "左手"
              : `谱表 ${staff}`
          : "";
        const own = notes.filter((n) => n.part === id && n.staff === staff);
        for (const n of own) n.track = tracks.length;
        tracks.push({ name: label ? `${name} · ${label}` : name, notes: own });
      }
    }
    const tempoMap = new Map(tempos.map((x) => [Math.round(x.beat * 1000), x]));
    return {
      title,
      composer,
      parts: names.size,
      tracks,
      notes,
      tempos: tempoMap.size
        ? [...tempoMap.values()].sort((a, b) => a.beat - b.beat)
        : [{ beat: 0, bpm: 120 }],
      timeSig: timeSig || [4, 4],
      measures,
      beats,
      noteTags,
      rests,
      graces,
    };
  }

  // Standard MIDI file, format 1: a tempo track plus one track per staff, 480 ticks per quarter.
  function writeMidi({ title, tracks, tempos, timeSig }, ppq = 480) {
    const utf8 = (s) => [...new TextEncoder().encode(s)];
    const vlq = (n) => {
      n = Math.max(0, Math.round(n));
      const bytes = [n & 0x7f];
      while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
      return bytes;
    };
    const u32 = (n) => [
      (n >>> 24) & 255,
      (n >>> 16) & 255,
      (n >>> 8) & 255,
      n & 255,
    ];
    const meta = (type, bytes) => [0xff, type, ...vlq(bytes.length), ...bytes];
    const tick = (beat) => Math.round(beat * ppq);
    const chunk = (events) => {
      events.sort((a, b) => a.tick - b.tick || a.order - b.order);
      const data = [];
      let last = 0;
      for (const e of events) {
        for (const b of vlq(e.tick - last)) data.push(b);
        for (const b of e.bytes) data.push(b);
        last = e.tick;
      }
      data.push(0, 0xff, 0x2f, 0);
      return [0x4d, 0x54, 0x72, 0x6b, ...u32(data.length), ...data];
    };
    const conductor = [
      { tick: 0, order: 0, bytes: meta(0x03, utf8(title)) },
      {
        tick: 0,
        order: 1,
        bytes: meta(0x58, [
          timeSig[0],
          Math.round(Math.log2(timeSig[1])),
          24,
          8,
        ]),
      },
      ...tempos.map((x) => {
        const us = Math.round(60000000 / x.bpm);
        return {
          tick: tick(x.beat),
          order: 2,
          bytes: meta(0x51, [(us >> 16) & 255, (us >> 8) & 255, us & 255]),
        };
      }),
    ];
    const chunks = [chunk(conductor)];
    tracks.forEach((track, i) => {
      const ch = Math.min(15, i >= 9 ? i + 1 : i); // channel 10 is reserved for drums
      const events = [
        { tick: 0, order: 0, bytes: meta(0x03, utf8(track.name)) },
        { tick: 0, order: 1, bytes: [0xc0 | ch, 0] },
      ];
      for (const n of track.notes) {
        const on = tick(n.beat);
        const off = Math.max(on + 1, tick(n.beat + n.dur));
        events.push({
          tick: on,
          order: 3,
          bytes: [0x90 | ch, n.midi, clamp(Math.round(n.vel * 127), 1, 127)],
        });
        events.push({ tick: off, order: 2, bytes: [0x80 | ch, n.midi, 0] });
      }
      chunks.push(chunk(events));
    });
    const header = [
      0x4d,
      0x54,
      0x68,
      0x64,
      ...u32(6),
      0,
      1,
      (chunks.length >> 8) & 255,
      chunks.length & 255,
      (ppq >> 8) & 255,
      ppq & 255,
    ];
    const bytes = new Uint8Array(
      header.length + chunks.reduce((s, c) => s + c.length, 0),
    );
    bytes.set(header);
    let at = header.length;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    return bytes;
  }

  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${
      name
        .replace(/[\\/:*?"<>|]+/g, " ")
        .trim()
        .slice(0, 60) || "琴伴"
    }.mid`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  window.LepuConvert = { parseMusicXML, writeMidi };

  /* ---------------- Engraving with VexFlow ---------------- */
  const NAMES = ["c", "c", "d", "d", "e", "f", "f", "g", "g", "a", "a", "b"];
  const SHARP = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const DURATION = { 0.5: "8", 1: "q", 1.5: "qd", 2: "h", 3: "hd", 4: "w" };

  // One grand-staff system of whole 4/4 bars. Returns each drawn note with its beat and x position.
  function drawSystem(host, notes, { barCount, width, first }) {
    const VF = window.VexFlow;
    const {
      Renderer,
      Stave,
      StaveNote,
      Voice,
      Formatter,
      Beam,
      StaveConnector,
      Dot,
      Accidental,
    } = VF;
    host.replaceChildren();
    const height = 236;
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();
    const extra = first ? 78 : 46;
    const barWidth = (width - 12 - extra) / barCount;
    const drawn = [];
    let x = 6;
    for (let i = 0; i < barCount; i++) {
      const w = barWidth + (i === 0 ? extra : 0);
      const treble = new Stave(x, 14, w);
      const bass = new Stave(x, 112, w);
      if (i === 0) {
        treble.addClef("treble");
        bass.addClef("bass");
        if (first) {
          treble.addTimeSignature("4/4");
          bass.addTimeSignature("4/4");
        }
      }
      treble.setContext(ctx).draw();
      bass.setContext(ctx).draw();
      if (i === 0) {
        new StaveConnector(treble, bass)
          .setType("brace")
          .setContext(ctx)
          .draw();
        new StaveConnector(treble, bass)
          .setType("singleLeft")
          .setContext(ctx)
          .draw();
      }
      new StaveConnector(treble, bass)
        .setType("singleRight")
        .setContext(ctx)
        .draw();
      const make = (n, clef) => {
        const pc = n.midi % 12;
        const note = new StaveNote({
          keys: [`${NAMES[pc]}/${Math.floor(n.midi / 12) - 1}`],
          duration: DURATION[n.dur],
          clef,
          autoStem: true,
        });
        if (SHARP[pc]) note.addModifier(new Accidental("#"), 0);
        if (DURATION[n.dur].endsWith("d"))
          Dot.buildAndAttach([note], { all: true });
        note.source = n;
        return note;
      };
      const inBar = notes.filter((n) => n.beat >= i * 4 && n.beat < i * 4 + 4);
      const right = inBar.filter((n) => !n.hand).map((n) => make(n, "treble"));
      const left = inBar.filter((n) => n.hand).map((n) => make(n, "bass"));
      const v1 = new Voice({ numBeats: 4, beatValue: 4 }).addTickables(right);
      const v2 = new Voice({ numBeats: 4, beatValue: 4 }).addTickables(left);
      new Formatter()
        .joinVoices([v1])
        .joinVoices([v2])
        .formatToStave([v1, v2], treble);
      const beams = Beam.generateBeams(right);
      v1.draw(ctx, treble);
      v2.draw(ctx, bass);
      for (const b of beams) b.setContext(ctx).draw();
      for (const note of [...right, ...left]) {
        drawn.push({
          el: note.getSVGElement(),
          beat: note.source.beat,
          dur: note.source.dur,
          x: note.getAbsoluteX() + 6,
        });
      }
      x += w;
    }
    const svgEl = host.querySelector("svg");
    svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
    return drawn.sort((a, b) => a.beat - b.beat);
  }

  const fontReady = () =>
    Promise.race([
      document.fonts?.load('30px "Bravura"') ?? Promise.resolve(),
      new Promise((r) => setTimeout(r, 2500)),
    ]);

  /* ---------------- MusicXML → MIDI converter ---------------- */
  function initConverter() {
    const panel = $("#converter");
    const drop = $("#drop");
    const input = $("#xml-file");
    const result = $("#xml-result");
    const error = $("#xml-error");
    const playBtn = $("#xml-play");
    const canvas = $(".result-roll", result);
    const g = canvas.getContext("2d");
    const SAMPLES = {
      ode: { url: "assets/samples/ode-to-joy.musicxml" },
      bee: {
        url: "assets/samples/flight-of-the-bumblebee-yeung.musicxml",
        credit:
          "里姆斯基-科萨科夫 曲，Kevin W. K. Yeung 钢琴编配，CC BY-SA 3.0（IMSLP），琴伴从 7 页原版 PDF 转写",
      },
    };
    const COLORS = ["#39734f", "#a4735e", "#4f7f9c", "#8a6aa8"];
    const player = new Player({});
    let score = null;
    let bytes = null;

    const fail = (message) => {
      error.textContent = message;
      error.hidden = false;
    };
    function convert(source, credit) {
      error.hidden = true;
      player.pause();
      const t0 = performance.now();
      try {
        score = parseMusicXML(source);
        bytes = writeMidi(score);
      } catch (err) {
        result.hidden = true;
        return fail(err.message || "转换失败。");
      }
      const ms = Math.max(1, Math.round(performance.now() - t0));
      const bpm = score.tempos[0].bpm;
      player.setNotes(score.notes, score.beats);
      player.bpm = bpm;
      player.pos = 0;
      $(".result-title", result).textContent = score.title;
      $(".result-sub", result).textContent = [
        score.composer,
        score.tracks.map((t) => t.name).join("、"),
      ]
        .filter(Boolean)
        .join(" · ");
      const seconds = score.tempos.reduce(
        (s, x, i, all) =>
          s + (((all[i + 1]?.beat ?? score.beats) - x.beat) * 60) / x.bpm,
        0,
      );
      const cells = [
        ["小节", score.measures],
        ["音符", score.notes.length.toLocaleString("en-US")],
        ["轨道", score.tracks.length],
        ["速度", score.tempos.length > 1 ? `${bpm} 起` : bpm],
        ["时长", fmtTime(seconds)],
      ];
      $(".result-stats", result).innerHTML = cells
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
        .join("");
      const skipped = [
        score.rests && `${score.rests} 个休止`,
        score.graces && `${score.graces} 个倚音未计入`,
      ]
        .filter(Boolean)
        .join("、");
      $(".result-note", result).textContent =
        `读了 ${score.noteTags.toLocaleString("en-US")} 个 <note>${skipped ? `（含 ${skipped}）` : ""}，写出 ${score.notes.length.toLocaleString("en-US")} 个 MIDI 音符，` +
        `文件 ${(bytes.length / 1024).toFixed(1)} KB，用了 ${ms} 毫秒。` +
        (score.tempos.length > 1
          ? `文件里保留了全部 ${score.tempos.length} 处速度变化，这里试听按第一个速度。`
          : "") +
        (credit ? `${credit}。` : "");
      result.hidden = false;
      drawRoll();
    }

    function drawRoll() {
      if (!score || result.hidden) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const midis = score.notes.map((n) => n.midi);
      const lo = Math.min(...midis) - 2;
      const hi = Math.max(...midis) + 2;
      const x = (b) => 12 + (b / score.beats) * (w - 24);
      const y = (m) => 10 + ((hi - m) / (hi - lo)) * (h - 20);
      const rowH = Math.max(1.5, (h - 20) / (hi - lo) - 0.4);
      const beat = player.beat;
      const live = player.playing;
      for (const n of score.notes) {
        const on = live && beat >= n.beat && beat < n.beat + n.dur;
        g.fillStyle = on ? "#1f2a22" : COLORS[n.track % COLORS.length];
        g.fillRect(
          x(n.beat),
          y(n.midi) - rowH / 2,
          Math.max(1.5, x(n.beat + n.dur) - x(n.beat) - 0.5),
          rowH,
        );
      }
      if (live || player.pos > 0) {
        g.fillStyle = "#234f3e";
        g.fillRect(x(beat) - 1, 0, 2, h);
      }
    }
    player.onState = (on) => {
      playBtn.textContent = on ? "暂停" : "播放";
      if (on) frame.add(drawRoll);
      else {
        frame.remove(drawRoll);
        requestAnimationFrame(drawRoll);
      }
    };
    new ResizeObserver(drawRoll).observe(canvas);
    new IntersectionObserver(
      ([e]) => !e.isIntersecting && player.pause(),
    ).observe(panel);

    playBtn.addEventListener("click", () => player.toggle());
    $("#xml-download").addEventListener(
      "click",
      () => bytes && download(bytes, score.title),
    );
    canvas.addEventListener("click", (e) => {
      if (!score) return;
      const r = canvas.getBoundingClientRect();
      player.seek(((e.clientX - r.left - 12) / (r.width - 24)) * score.beats);
      if (!player.playing) player.play();
      drawRoll();
    });

    async function readFile(file) {
      if (!file) return;
      $$(".sample", panel).forEach((b) => b.classList.remove("is-on"));
      if (/\.mxl$/i.test(file.name))
        return fail(
          "MXL 是压缩格式。请先解压出其中的 .musicxml，或者用琴伴网页版的「导入乐谱」直接打开。",
        );
      if (file.size > 30 * 1024 * 1024)
        return fail("文件超过 30 MB，这里只处理更小的 MusicXML。");
      convert(await file.text());
    }
    input.addEventListener("change", () => readFile(input.files[0]));
    for (const type of ["dragenter", "dragover"])
      drop.addEventListener(type, (e) => {
        e.preventDefault();
        drop.classList.add("is-over");
      });
    for (const type of ["dragleave", "drop"])
      drop.addEventListener(type, () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      readFile(e.dataTransfer.files[0]);
    });
    $$(".sample", panel).forEach((b) =>
      b.addEventListener("click", async () => {
        const sample = SAMPLES[b.dataset.sample];
        $$(".sample", panel).forEach((x) =>
          x.classList.toggle("is-on", x === b),
        );
        try {
          const res = await fetch(sample.url);
          if (!res.ok) throw new Error();
          convert(await res.text(), sample.credit);
        } catch {
          fail(
            "示例文件没有加载成功。请通过网址打开这个页面（直接双击本地 HTML 文件时浏览器不允许读取示例）。",
          );
        }
      }),
    );

    const thumb = $(".ode-thumb");
    if (window.VexFlow && thumb)
      drawSystem(thumb, bars(ODE, 0, 2), {
        barCount: 2,
        width: 420,
        first: true,
      });
  }

  /* ---------------- Live follow demo ---------------- */
  function initFollow() {
    const root = $(".live");
    const view = $(".live-view", root);
    const page = $(".live-page", root);
    const playBtn = $("#follow-play");
    const range = $(".tempo input", root);
    const out = $(".tempo output", root);
    const player = new Player({
      notes: ODE,
      bpm: 100,
      onEnd: () => view.scrollTo({ top: 0, behavior: "smooth" }),
    });
    let per = 4;
    let systems = [];
    let builtWidth = 0;
    let shown = -1;

    function build() {
      const width = page.clientWidth;
      if (width < 240 || !window.VexFlow) return;
      builtWidth = width;
      per = width >= 620 ? 4 : 2;
      page.replaceChildren();
      systems = [];
      for (let s = 0; s < 16 / per; s++) {
        const div = document.createElement("div");
        div.className = "system";
        const holder = document.createElement("div");
        const head = document.createElement("i");
        head.className = "playhead";
        div.append(holder, head);
        page.appendChild(div);
        const notes = drawSystem(holder, bars(ODE, s * per, s * per + per), {
          barCount: per,
          width,
          first: s === 0,
        });
        for (const n of notes) {
          n.global = s * per * 4 + n.beat;
          n.el.addEventListener("click", () => {
            player.seek(n.global);
            if (!player.playing) player.play();
          });
        }
        systems.push({ div, head, notes });
      }
      shown = -1;
      tick();
    }
    // Playhead x between the notes on either side of the current beat.
    const xAt = (notes, beat) => {
      let prev = notes[0];
      for (const n of notes) {
        if (n.beat <= beat) prev = n;
        else {
          const k = (beat - prev.beat) / (n.beat - prev.beat || 1);
          return prev.x + (n.x - prev.x) * clamp(k, 0, 1);
        }
      }
      return prev.x + 20;
    };
    function tick() {
      const beat = player.beat;
      const live = player.playing;
      const span = per * 4;
      const current = clamp(Math.floor(beat / span), 0, systems.length - 1);
      systems.forEach((s, i) => {
        const here = live && i === current;
        s.div.classList.toggle("is-current", here);
        const local = beat - i * span;
        for (const n of s.notes)
          n.el?.classList.toggle(
            "on",
            here && local >= n.beat - 1e-3 && local < n.beat + n.dur - 0.02,
          );
        if (here) {
          const svgEl = s.div.querySelector("svg");
          const scale = svgEl.clientWidth / builtWidth || 1;
          s.head.style.transform = `translateX(${xAt(s.notes, local) * scale}px)`;
        }
      });
      if (live && current !== shown) {
        shown = current;
        const el = systems[current].div;
        view.scrollTo({
          top: Math.max(
            0,
            el.offsetTop - (view.clientHeight - el.offsetHeight) / 2,
          ),
          behavior: reduceMotion ? "auto" : "smooth",
        });
      }
    }
    player.onState = (on) => {
      playBtn.textContent = on ? "暂停" : "播放";
      if (on) frame.add(tick);
      else {
        frame.remove(tick);
        shown = -1;
        requestAnimationFrame(tick);
      }
    };
    playBtn.addEventListener("click", () => player.toggle());
    const setTempo = () => {
      const v = Number(range.value);
      player.setTempo(v);
      out.textContent = `${v} BPM`;
    };
    range.addEventListener("input", setTempo);
    setTempo();
    new ResizeObserver(
      () => Math.abs(page.clientWidth - builtWidth) > 24 && build(),
    ).observe(page);
    new IntersectionObserver(
      ([e]) => !e.isIntersecting && player.pause(),
    ).observe(root);
    build();
  }

  /* ---------------- Red-pencil marks ---------------- */
  // Positions are fractions of the marked image: ring = [x0, y0, x1, y1] around something,
  // text = [x, y] of a note's top-left corner (top-right with right: true), arrow = from → to.
  // Values outside 0–1 sit in the margin.
  const MARKS = {
    engraving: [{ text: "♩ = 72", at: [0.3, 0.19], r: -4 }],
    hero: [
      { ring: [0.81, 0.375, 0.982, 0.66] },
      {
        text: "播到哪，亮到哪",
        at: [0.6, 0.29],
        arrow: [
          [0.74, 0.335],
          [0.8, 0.41],
        ],
      },
      { ring: [0.325, 0.885, 0.37, 1.01] },
      {
        text: "对应的琴键也亮",
        at: [0.385, 1.035],
        r: 1.5,
        arrow: [
          [0.38, 1.06],
          [0.362, 1.02],
        ],
      },
    ],
    rows: [
      { ring: [0.15, 0.37, 0.248, 0.69] },
      {
        text: "这一页找到 3 行",
        at: [0.33, 0.475],
        arrow: [
          [0.325, 0.53],
          [0.262, 0.53],
        ],
      },
    ],
    original: [
      { ring: [0.895, 0.395, 0.99, 0.457] },
      {
        text: "标着原谱第几页、第几行",
        at: [0.56, 0.355],
        arrow: [
          [0.83, 0.39],
          [0.885, 0.418],
        ],
      },
      {
        text: "播放线叠在原图上",
        at: [0.235, 0.775],
        r: 1.5,
        arrow: [
          [0.232, 0.8],
          [0.21, 0.76],
        ],
      },
    ],
    export: [
      { ring: [0.135, 0.46, 0.38, 0.565] },
      {
        text: "左右手分两轨",
        at: [0.47, 0.49],
        arrow: [
          [0.46, 0.52],
          [0.392, 0.515],
        ],
      },
    ],
    live: [
      {
        text: "点谱上任意一个音，从那里开始",
        at: [0.98, -0.12],
        right: true,
        arrow: [
          [0.84, -0.045],
          [0.74, 0.3],
        ],
      },
    ],
  };
  const SVGNS = "http://www.w3.org/2000/svg";
  const f1 = (v) => v.toFixed(1);
  // Same wobble on every visit.
  const seeded = (seed) => () =>
    (seed = (seed * 16807) % 2147483647) / 2147483647;
  // A smooth path through points (Catmull-Rom as cubic Béziers).
  function smooth(pts) {
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [p0, p1, p2, p3] = [
        pts[i - 1] || pts[i],
        pts[i],
        pts[i + 1],
        pts[i + 2] || pts[i + 1],
      ];
      d +=
        `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ` +
        `${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d;
  }
  // A loose loop drawn around a box: a bit more than one turn, opening slightly as it goes.
  function ringPath([x0, y0, x1, y1], rnd) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = (x1 - x0) / 2 + 3;
    const ry = (y1 - y0) / 2 + 3;
    const start = -2.5 + rnd() * 0.5;
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const a = start + t * Math.PI * 2.16;
      const k = 1.03 + 0.09 * t + (rnd() - 0.5) * 0.03;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return smooth(pts);
  }
  // A curved arrow: the shaft, then the head.
  function arrowPaths([ax, ay], [bx, by], rnd) {
    const bend = (0.16 + rnd() * 0.1) * (rnd() < 0.5 ? -1 : 1);
    const mx = (ax + bx) / 2 - (by - ay) * bend;
    const my = (ay + by) / 2 + (bx - ax) * bend;
    const ang = Math.atan2(by - my, bx - mx);
    const h = Math.min(12, Math.hypot(bx - ax, by - ay) * 0.4);
    const tip = (s) =>
      `${f1(bx - h * Math.cos(ang + s))} ${f1(by - h * Math.sin(ang + s))}`;
    return [
      `M${f1(ax)} ${f1(ay)}Q${f1(mx)} ${f1(my)} ${f1(bx)} ${f1(by)}`,
      `M${tip(0.5)}L${f1(bx)} ${f1(by)}L${tip(-0.42)}`,
    ];
  }

  // A layer lying exactly over the host's image (or the host itself), kept in place on resize.
  function overlay(host) {
    const target = $(":scope > img", host) || host;
    const over = document.createElement("div");
    over.className = "over";
    host.appendChild(over);
    const fit = () => {
      if (target === host) over.style.inset = "0";
      else
        Object.assign(over.style, {
          left: `${target.offsetLeft}px`,
          top: `${target.offsetTop}px`,
          width: `${target.offsetWidth}px`,
          height: `${target.offsetHeight}px`,
        });
    };
    fit();
    return { over, target, fit };
  }

  const layers = new Map();
  function annotate(host, seed) {
    const layer = overlay(host);
    layers.set(host, layer);
    const { over, target } = layer;
    const svg = document.createElementNS(SVGNS, "svg");
    svg.classList.add("marks");
    over.appendChild(svg);
    const path = (delay) => {
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("pathLength", "1");
      p.style.setProperty("--d", `${delay}s`);
      svg.appendChild(p);
      return p;
    };
    // Each mark is drawn after the previous one, like a teacher going over the page.
    let delay = 0.2;
    const parts = MARKS[host.dataset.notes].map((m) => {
      const part = { m };
      if (m.ring) {
        part.ring = path(delay);
        delay += 0.75;
      }
      if (m.text) {
        part.text = document.createElement("span");
        part.text.className = "mark-text";
        part.text.textContent = m.text;
        if (m.right) part.text.style.right = `${(1 - m.at[0]) * 100}%`;
        else part.text.style.left = `${m.at[0] * 100}%`;
        part.text.style.top = `${m.at[1] * 100}%`;
        part.text.style.setProperty("--r", `${m.r ?? -2}deg`);
        part.text.style.setProperty("--d", `${delay}s`);
        over.appendChild(part.text);
        delay += 0.7;
      }
      if (m.arrow) {
        part.arrow = [path(delay), path(delay + 0.45)];
        delay += 0.8;
      }
      return part;
    });
    const draw = () => {
      layer.fit();
      const w = over.clientWidth || target.offsetWidth;
      const h = over.clientHeight || target.offsetHeight;
      if (!w || !h) return;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      over.style.fontSize = `${clamp(w * 0.019, 12, 22)}px`;
      const rnd = seeded(seed * 97 + 13);
      const px = ([x, y]) => [x * w, y * h];
      for (const { m, ring, arrow } of parts) {
        if (ring)
          ring.setAttribute(
            "d",
            ringPath([...px(m.ring), ...px(m.ring.slice(2))], rnd),
          );
        if (arrow) {
          const [shaft, head] = arrowPaths(px(m.arrow[0]), px(m.arrow[1]), rnd);
          arrow[0].setAttribute("d", shaft);
          arrow[1].setAttribute("d", head);
        }
      }
    };
    draw();
    new ResizeObserver(draw).observe(target);
    if (reduceMotion || !("IntersectionObserver" in window))
      over.classList.add("drawn");
    else {
      const io = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          over.classList.add("drawn");
          io.disconnect();
        },
        { threshold: 0.45 },
      );
      io.observe(host);
    }
  }

  /* ---------------- Hero: the first line of 《致爱丽丝》 with a pencil following it ---------------- */
  function initHero() {
    const fig = $("#engraving");
    const data = window.QINBAN_HERO;
    const layer = layers.get(fig);
    if (!fig || !data || !layer) return;
    const btn = $("#listen");
    const { top, bottom, at } = data.system;
    const span = bottom - top;
    const hl = document.createElement("i");
    const reader = document.createElement("i");
    hl.className = "hl";
    reader.className = "reader";
    // The marker runs along the treble staff; the pencil line spans both hands.
    Object.assign(hl.style, {
      top: `${(top + span * 0.19) * 100}%`,
      height: `${span * 0.23 * 100}%`,
      left: `${(at[0][1] - 0.012) * 100}%`,
    });
    Object.assign(reader.style, {
      top: `${(top + span * 0.1) * 100}%`,
      height: `${span * 0.8 * 100}%`,
    });
    layer.over.prepend(hl, reader);
    const xAt = (beat) => {
      for (let i = 1; i < at.length; i++) {
        if (beat <= at[i][0]) {
          const [b0, x0] = at[i - 1];
          const [b1, x1] = at[i];
          return x0 + ((x1 - x0) * Math.max(0, beat - b0)) / (b1 - b0);
        }
      }
      return at[at.length - 1][1];
    };
    const player = new Player({ bpm: data.bpm });
    player.setNotes(
      data.notes.map(([beat, dur, midi, hand, vel]) => ({
        beat,
        dur,
        midi,
        hand,
        vel: Math.min(1, vel + 0.12),
      })),
      data.beats,
    );
    let fade = 0;
    const tick = () => {
      const x = xAt(player.beat);
      reader.style.left = `${x * 100}%`;
      hl.style.width = `${Math.max(0, x - at[0][1] + 0.012) * 100}%`;
    };
    player.onState = (on) => {
      clearTimeout(fade);
      fig.classList.toggle("is-playing", on);
      btn.textContent = on ? "■ 停" : "▶ 听第一行";
      if (on) {
        fig.classList.remove("is-fading");
        frame.add(tick);
      } else {
        frame.remove(tick);
        fig.classList.add("is-fading");
        fade = setTimeout(() => {
          player.pos = 0;
          tick();
        }, 900);
      }
    };
    player.onEnd = () => (player.pos = 0);
    btn.addEventListener("click", () => {
      if (!player.playing) player.pos = 0;
      player.toggle();
    });
    new IntersectionObserver(
      ([e]) => !e.isIntersecting && player.pause(),
    ).observe(fig);
  }

  /* ---------------- Boot ---------------- */
  for (const type of ["pointerdown", "keydown", "touchend"])
    addEventListener(type, () => Sound.unlock(), { capture: true });
  $$("[data-notes]").forEach((host, i) => {
    if (!MARKS[host.dataset.notes]) return;
    try {
      annotate(host, i + 1);
    } catch (err) {
      console.error("annotate failed", err);
    }
  });
  try {
    initHero();
  } catch (err) {
    console.error("initHero failed", err);
  }
  fontReady().then(() => {
    for (const init of [initConverter, initFollow]) {
      try {
        init();
      } catch (err) {
        console.error(`${init.name} failed`, err);
      }
    }
  });
})();
