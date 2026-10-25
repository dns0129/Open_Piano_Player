/* 乐谱 promo site: sound engine, sequencer, notation renderers and every interactive demo. */
(() => {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const SVGNS = "http://www.w3.org/2000/svg";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* private mode: the preference just isn't remembered */
      }
    },
  };
  const CASES = window.LEPU_CASES || [];
  const caseById = (id) => CASES.find((c) => c.id === id);

  function svg(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const key in attrs) el.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(el);
    return el;
  }

  const SHARPS = [
    "C",
    "C♯",
    "D",
    "D♯",
    "E",
    "F",
    "F♯",
    "G",
    "G♯",
    "A",
    "A♯",
    "B",
  ];
  const FLATS = [
    "C",
    "D♭",
    "D",
    "E♭",
    "E",
    "F",
    "G♭",
    "G",
    "A♭",
    "A",
    "B♭",
    "B",
  ];
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(pcOf(m));
  const noteName = (m, flats) =>
    (flats ? FLATS : SHARPS)[pcOf(m)] + (Math.floor(m / 12) - 1);

  // Melodies written as jianpu in C: digit, ' = octave up, , = octave down, - = +1 beat, _ = eighth, . = dotted.
  function jianpu(text, { tonic = 60, hand = 0, vel = 0.62 } = {}) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const notes = [];
    let beat = 0;
    for (const token of text.trim().split(/\s+/)) {
      const digit = Number(token[0]);
      let dur = token.includes("_") ? 0.5 : 1;
      if (token.includes(".")) dur *= 1.5;
      dur += (token.match(/-/g) || []).length;
      const oct =
        (token.match(/'/g) || []).length - (token.match(/,/g) || []).length;
      notes.push({
        beat,
        dur,
        midi: tonic + SCALE[digit - 1] + 12 * oct,
        hand,
        vel,
      });
      beat += dur;
    }
    return notes;
  }
  const ODE = jianpu(
    "3 3 4 5 5 4 3 2 1 1 2 3 3. 2_ 2- 3 3 4 5 5 4 3 2 1 1 2 3 2. 1_ 1-",
  );
  const ODE_LEFT = [
    48, 55, 43, 50, 48, 55, 43, 50, 48, 55, 43, 50, 48, 55, 43, 48,
  ].map((midi, i) => ({
    beat: i * 2,
    dur: 2,
    midi,
    hand: 1,
    vel: 0.4,
  }));
  const TWINKLE = jianpu(
    "1 1 5 5 6 6 5- 4 4 3 3 2 2 1- 5 5 4 4 3 3 2- 5 5 4 4 3 3 2- 1 1 5 5 6 6 5- 4 4 3 3 2 2 1-",
  );
  const bars = (notes, from, to, bpb = 4) =>
    notes
      .filter((n) => n.beat >= from * bpb && n.beat < to * bpb)
      .map((n) => ({ ...n, beat: n.beat - from * bpb }));

  /* ---------------- Frame loop ---------------- */
  const frame = (() => {
    const fns = new Set();
    let raf = 0;
    const run = (t) => {
      raf = 0;
      for (const fn of [...fns]) fn(t);
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

  /* ---------------- Sound ---------------- */
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
    const listeners = new Set();
    let ctx = null;
    let out = null;
    let bus = null;
    let decoding = null;
    let enabled = store.get("lepu-sound") !== "off";
    let unlocked = false;
    let lastHover = 0;

    // Fetching needs no user gesture, so the bytes are usually here before the first click.
    function prefetch() {
      const order = Object.keys(SAMPLES)
        .map(Number)
        .sort((a, b) => Math.abs(a - 66) - Math.abs(b - 66));
      for (const midi of order) {
        raw.set(
          midi,
          fetch(`assets/audio/piano/${SAMPLES[midi]}.mp3`)
            .then((res) => (res.ok ? res.arrayBuffer() : null))
            .catch(() => null),
        );
      }
    }

    function decodeAll() {
      if (decoding) return decoding;
      decoding = Promise.all(
        [...raw].map(async ([midi, bytes]) => {
          const data = await bytes;
          if (!data) return;
          try {
            const buf = await new Promise((ok, fail) =>
              ctx.decodeAudioData(data.slice(0), ok, fail),
            );
            buffers.set(midi, buf);
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
        for (let i = 0; i < len; i++) {
          const fadeIn = i < rate * 0.012 ? i / (rate * 0.012) : 1;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4) * fadeIn;
        }
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
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC({ latencyHint: "interactive" });
        out = ctx.createGain();
        out.gain.value = enabled ? 1 : 0;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 20;
        comp.ratio.value = 3;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        bus = ctx.createGain();
        bus.gain.value = 0.8;
        const verb = ctx.createConvolver();
        verb.buffer = impulse(2.8);
        const wet = ctx.createGain();
        wet.gain.value = 0.24;
        const shelf = ctx.createBiquadFilter();
        shelf.type = "highshelf";
        shelf.frequency.value = 5000;
        shelf.gain.value = -8;
        bus.connect(comp);
        bus.connect(wet).connect(verb).connect(shelf).connect(comp);
        comp.connect(out).connect(ctx.destination);
        decodeAll();
        document.dispatchEvent(new CustomEvent("lepu:audio"));
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

    function piano(
      midi,
      { when = 0, dur = 0.5, vel = 0.7, hand = 0, silent = false } = {},
    ) {
      if (!init()) return null;
      const now = ctx.currentTime;
      const t = Math.max(now, when || now);
      const end = t + Math.max(0.06, dur);
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = clamp(
        700 + vel * vel * 9000 + (midi - 40) * 45,
        500,
        16000,
      );
      lp.Q.value = 0.4;
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
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        for (const [type, mul, amp] of [
          ["triangle", 1, 1],
          ["sine", 2, 0.3],
          ["sine", 3, 0.08],
        ]) {
          const osc = ctx.createOscillator();
          osc.type = type;
          osc.frequency.value = freq * mul;
          const og = ctx.createGain();
          og.gain.value = amp;
          osc.connect(og).connect(lp);
          sources.push(osc);
        }
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak * 0.55, t + 0.006);
        g.gain.setTargetAtTime(peak * 0.1, t + 0.006, 0.4);
        g.gain.setTargetAtTime(0, end, 0.1);
      }
      lp.connect(g).connect(bus);
      for (const s of sources) {
        s.start(t);
        s.stop(end + 1.2);
      }
      if (!silent)
        for (const fn of listeners)
          fn({ midi, time: t, dur: end - t, vel, hand });
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

    function click(when, accent) {
      if (!init()) return;
      const t = Math.max(ctx.currentTime, when);
      const osc = ctx.createOscillator();
      osc.frequency.value = accent ? 2200 : 1550;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(accent ? 0.3 : 0.17, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.08);
    }

    const PENTA = [0, 2, 4, 7, 9];
    function ui(kind, index = 0) {
      if (!ctx || ctx.state !== "running" || !enabled) return;
      const now = ctx.currentTime;
      const step = PENTA[index % 5] + 12 * (Math.floor(index / 5) % 2);
      if (kind === "hover") {
        if (now - lastHover < 0.06) return;
        lastHover = now;
        const osc = ctx.createOscillator();
        osc.frequency.value = 1046.5 * Math.pow(2, step / 12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.028, now + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        osc.connect(g).connect(bus);
        osc.start(now);
        osc.stop(now + 0.25);
      } else {
        piano(72 + step, { vel: 0.26, dur: 0.25, silent: true });
      }
    }

    function setEnabled(on) {
      enabled = on;
      store.set("lepu-sound", on ? "on" : "off");
      if (out) out.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.03);
    }

    prefetch();
    return {
      init,
      unlock,
      piano,
      click,
      ui,
      setEnabled,
      onNote: (fn) => listeners.add(fn),
      ready: () => decoding || Promise.resolve(),
      get ctx() {
        return ctx;
      },
      get now() {
        return ctx ? ctx.currentTime : 0;
      },
      get enabled() {
        return enabled;
      },
      get running() {
        return !!ctx && ctx.state === "running";
      },
      get unlocked() {
        return unlocked;
      },
    };
  })();

  /* ---------------- Sequencer ---------------- */
  // Keeps beat position through tempo, hand and transpose changes: everything not yet sounding is
  // rescheduled from the current beat, which is how the App's practice room behaves.
  class Player {
    constructor({
      notes = [],
      bpm = 100,
      length,
      beatsPerBar = 4,
      loop = null,
      onState,
      onLoop,
      onEnd,
    } = {}) {
      Object.assign(this, { bpm, beatsPerBar, loop, onState, onLoop, onEnd });
      this.mute = [false, false];
      this.transpose = 0;
      this.metronome = false;
      this.playing = false;
      this.pos = 0;
      this.voices = [];
      this.segs = [{ t: 0, b: 0 }];
      this.loops = 0;
      this.setNotes(notes, length);
    }
    setNotes(notes, length) {
      this.notes = notes
        .map((n) =>
          Array.isArray(n)
            ? {
                beat: n[0],
                dur: n[1],
                midi: n[2],
                hand: n[3] || 0,
                vel: n[4] ?? 0.7,
              }
            : { hand: 0, vel: 0.7, ...n },
        )
        .sort((a, b) => a.beat - b.beat);
      this.length =
        length ?? Math.max(0, ...this.notes.map((n) => n.beat + n.dur));
      if (this.playing && !this.starting) this.reschedule(this.beat);
    }
    get span() {
      return this.loop || [0, this.length];
    }
    get beat() {
      if (!this.playing || this.starting) return this.pos;
      const now = Sound.now;
      let seg = this.segs[0];
      for (const s of this.segs) if (s.t <= now) seg = s;
      return seg.b + ((now - seg.t) * this.bpm) / 60;
    }
    async play(from) {
      if (this.playing) return;
      if (Player.current && Player.current !== this) Player.current.pause();
      Player.current = this;
      if (!Sound.init()) return;
      this.playing = true;
      this.starting = true;
      this.onState?.(true);
      await Promise.race([
        Sound.ready(),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
      this.starting = false;
      if (!this.playing) return;
      const [a, b] = this.span;
      let start = from ?? this.pos;
      if (start < a || start >= b - 1e-6) start = a;
      this.loops = 0;
      this.reschedule(start);
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 25);
    }
    pause() {
      if (!this.playing) return;
      this.pos = this.starting ? this.pos : this.beat;
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
      const [a, b] = this.span;
      beat = clamp(beat, a, b - 1e-3);
      if (this.playing && !this.starting) this.reschedule(beat, true);
      else this.pos = beat;
    }
    setTempo(bpm) {
      const b = this.beat;
      this.bpm = bpm;
      if (this.playing && !this.starting) this.reschedule(b);
    }
    setMute(hand, muted) {
      this.mute[hand] = muted;
      if (this.playing && !this.starting) this.reschedule(this.beat);
    }
    setTranspose(n) {
      this.transpose = n;
      if (this.playing && !this.starting) this.reschedule(this.beat);
    }
    setLoop(loop) {
      this.loop = loop;
      if (!this.playing || this.starting) return;
      const b = this.beat;
      const [x, y] = this.span;
      this.reschedule(b >= x && b < y ? b : x);
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
      this.idx = this.indexAt(beat);
      clearTimeout(this.endTimer);
      this.endTimer = 0;
      this.tick();
    }
    indexAt(beat) {
      const i = this.notes.findIndex((n) => n.beat >= beat - 1e-6);
      return i < 0 ? this.notes.length : i;
    }
    tick() {
      if (!this.playing) return;
      const now = Sound.now;
      const horizon = now + 0.15;
      const [a, end] = this.span;
      for (let guard = 0; guard < 4; guard++) {
        const seg = this.segs[this.segs.length - 1];
        const spb = 60 / this.bpm;
        const tAt = (b) => seg.t + (b - seg.b) * spb;
        const hb = seg.b + (horizon - seg.t) / spb;
        const upto = Math.min(hb, end);
        while (
          this.idx < this.notes.length &&
          this.notes[this.idx].beat < upto - 1e-9
        ) {
          const n = this.notes[this.idx++];
          if (n.beat < this.cursor - 1e-6 || this.mute[n.hand]) continue;
          this.voices.push(
            Sound.piano(n.midi + this.transpose, {
              when: tAt(n.beat),
              dur: n.dur * spb,
              vel: n.vel,
              hand: n.hand,
            }),
          );
        }
        if (this.metronome) {
          for (let b = Math.ceil(this.cursor - 1e-6); b < upto - 1e-9; b++)
            Sound.click(tAt(b), b % this.beatsPerBar === 0);
        }
        this.cursor = upto;
        if (hb < end) break;
        if (this.loop) {
          const t = tAt(end);
          this.segs = [...this.segs.slice(-2), { t, b: a }];
          this.cursor = a;
          this.idx = this.indexAt(a);
          setTimeout(
            () => {
              if (!this.playing) return;
              this.loops += 1;
              this.onLoop?.(this.loops);
            },
            Math.max(0, (t - now) * 1000),
          );
          continue;
        }
        if (!this.endTimer) {
          this.endTimer = setTimeout(
            () => {
              this.pause();
              this.pos = a;
              this.onEnd?.();
            },
            Math.max(0, (tAt(end) - now) * 1000 + 40),
          );
        }
        break;
      }
      this.voices = this.voices.filter((v) => v && v.end > now - 0.3);
    }
  }
  Player.current = null;

  // A play button + player + frame callback, with "is-playing" on the card and auto-pause off screen.
  function bindPlayer(card, player, onFrame) {
    const tick = () => onFrame(player.beat, player.playing);
    const prevState = player.onState;
    player.onState = (on) => {
      card.classList.toggle("is-playing", on);
      if (on) frame.add(tick);
      else {
        frame.remove(tick);
        requestAnimationFrame(tick);
      }
      prevState?.(on);
    };
    const btn = $(".play-btn", card);
    btn?.addEventListener("click", () => player.toggle());
    new IntersectionObserver(([e]) => {
      if (!e.isIntersecting && player.playing) player.pause();
    }).observe(card);
    return tick;
  }

  /* ---------------- Notation ---------------- */
  const GL = {
    gclef: "",
    fclef: "",
    whole: "",
    half: "",
    black: "",
    flag8u: "",
    flag8d: "",
    flag16u: "",
    flag16d: "",
    flat: "",
    sharp: "",
    trill: "",
    mordent: "",
    digits: (n) =>
      [...String(n)]
        .map((d) => String.fromCharCode(0xe080 + Number(d)))
        .join(""),
  };

  function spell(midi, flats) {
    const pc = pcOf(midi);
    const oct = Math.floor(midi / 12) - 1;
    const L = flats
      ? [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]
      : [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
    const A = flats
      ? [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0]
      : [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
    return { step: oct * 7 + L[pc], acc: A[pc] };
  }

  function layout({
    beats,
    beatsPerBar = 4,
    width = 760,
    left = 64,
    right = 14,
    barGap = 12,
  }) {
    const barCount = Math.max(1, Math.ceil(beats / beatsPerBar - 1e-9));
    const ppb = (width - left - right - barGap * (barCount - 1)) / beats;
    const xAt = (b) =>
      left +
      b * ppb +
      Math.floor(clamp(b, 0, beats - 1e-6) / beatsPerBar + 1e-9) * barGap;
    const barX = (k) =>
      k >= barCount ? width - right : xAt(k * beatsPerBar) - barGap / 2;
    return { ppb, xAt, barX, barCount, width, left, right, beats, beatsPerBar };
  }

  function text(parent, str, x, y, attrs = {}) {
    const t = svg("text", { x, y, ...attrs }, parent);
    t.textContent = str;
    return t;
  }
  const glyph = (parent, ch, x, y, S, cls = "glyph") =>
    text(parent, ch, x, y, { class: `glyph ${cls}`, "font-size": S * 4 });

  function addPlayhead(root, y1, y2) {
    return svg("line", { class: "playhead", x1: 0, x2: 0, y1, y2 }, root);
  }

  // Staff: treble, bass or grand. Notes in the same beat and hand are drawn as one chord.
  function drawStaff(host, notes, o = {}) {
    const S = o.S || 9;
    const width = o.width || 760;
    const bpb = o.beatsPerBar || 4;
    const grand = o.clef === "grand";
    const T = o.padTop ?? 4.6 * S;
    const B = grand ? T + 9 * S : T;
    const height = B + 4 * S + (o.padBottom ?? 4.6 * S);
    const L = layout({
      beats: o.beats,
      beatsPerBar: bpb,
      width,
      left: o.left ?? (o.timeSig ? 6.6 * S : 4.4 * S),
      right: o.right ?? 1.2 * S,
      barGap: o.barGap ?? 1.4 * S,
    });
    const root = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: `notation ${o.className || ""}`,
    });
    const staves = grand
      ? [
          ["treble", T],
          ["bass", B],
        ]
      : [[o.clef === "bass" ? "bass" : "treble", T]];
    for (const [clef, y0] of staves) {
      for (let i = 0; i < 5; i++)
        svg(
          "line",
          {
            class: "staff-line",
            x1: S * 0.4,
            x2: width - L.right,
            y1: y0 + i * S,
            y2: y0 + i * S,
          },
          root,
        );
      glyph(
        root,
        clef === "treble" ? GL.gclef : GL.fclef,
        S * 0.9,
        clef === "treble" ? y0 + 3 * S : y0 + S,
        S,
        "clef",
      );
      if (o.timeSig) {
        glyph(root, GL.digits(o.timeSig[0]), S * 4, y0 + S, S, "timesig");
        glyph(root, GL.digits(o.timeSig[1]), S * 4, y0 + 3 * S, S, "timesig");
      }
    }
    const yTop = T;
    const yBottom = B + 4 * S;
    svg(
      "line",
      { class: "bar-line", x1: S * 0.4, x2: S * 0.4, y1: yTop, y2: yBottom },
      root,
    );
    for (let k = 1; k <= L.barCount; k++) {
      const x = L.barX(k);
      svg(
        "line",
        { class: "bar-line", x1: x, x2: x, y1: yTop, y2: yBottom },
        root,
      );
    }

    const pad = Math.min(L.ppb * 0.2, S * 0.9);
    const groups = new Map();
    for (const n of notes) {
      const key = `${n.beat.toFixed(3)}:${grand ? n.hand || 0 : 0}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    }
    const items = [];
    for (const chord of groups.values()) {
      const n0 = chord[0];
      const clef = grand
        ? n0.hand
          ? "bass"
          : "treble"
        : o.clef === "bass"
          ? "bass"
          : "treble";
      const y0 = grand && n0.hand ? B : T;
      const ref = clef === "treble" ? 30 : 18;
      const heads = chord
        .map((n) => {
          const sp = n.spell || spell(n.midi + (o.transpose || 0), o.flats);
          const p = sp.step - ref;
          return { n, p, acc: sp.acc, y: y0 + 4 * S - (p * S) / 2 };
        })
        .sort((a, b) => a.p - b.p);
      const x = L.xAt(n0.beat) + pad;
      const dur = Math.max(...chord.map((n) => n.dur));
      const avg = heads.reduce((s, h) => s + h.p, 0) / heads.length;
      const up = o.stemUp ?? avg < 4;
      items.push({
        chord,
        heads,
        x,
        dur,
        up,
        y0,
        beat: n0.beat,
        hand: grand ? n0.hand || 0 : 0,
      });
    }

    // Beam consecutive eighths / sixteenths of the same beat and hand.
    const beamed = new Set();
    const beams = [];
    const short = items
      .filter((it) => it.dur <= 0.5 && it.chord.length === 1)
      .sort((a, b) => a.beat - b.beat);
    for (let i = 0; i < short.length;) {
      const g = [short[i]];
      while (
        i + g.length < short.length &&
        Math.floor(short[i + g.length].beat + 1e-6) ===
          Math.floor(short[i].beat + 1e-6) &&
        short[i + g.length].hand === short[i].hand &&
        Math.abs(
          short[i + g.length].beat -
            (g[g.length - 1].beat + g[g.length - 1].dur),
        ) < 1e-6
      )
        g.push(short[i + g.length]);
      if (g.length > 1) {
        const avg = g.reduce((s, it) => s + it.heads[0].p, 0) / g.length;
        const up = avg < 4;
        const ys = g.map((it) => it.heads[0].y);
        const yb = up ? Math.min(...ys) - 3.3 * S : Math.max(...ys) + 3.3 * S;
        for (const it of g) {
          it.up = up;
          it.stemEnd = yb;
          beamed.add(it);
        }
        beams.push({ g, up, yb, sixteenth: g.every((it) => it.dur <= 0.25) });
      }
      i += g.length;
    }

    const els = [];
    for (const it of items) {
      const g = svg("g", { class: "n" }, root);
      const { heads, x, dur, up, y0 } = it;
      const hw = 1.18 * S;
      svg(
        "circle",
        {
          class: "halo",
          cx: x + hw / 2,
          cy: (heads[0].y + heads[heads.length - 1].y) / 2,
          r: 1.5 * S,
        },
        g,
      );
      let prevFlip = false;
      let accCol = [];
      for (let i = heads.length - 1; i >= 0; i--) {
        const h = heads[i];
        if (!h.acc) continue;
        const near = accCol.find((c) => c.col === 0 && Math.abs(c.p - h.p) < 6);
        const col = near ? 1 : 0;
        accCol.push({ p: h.p, col });
        glyph(
          g,
          h.acc > 0 ? GL.sharp : GL.flat,
          x - (h.acc > 0 ? 1.25 : 1.05) * S - col * 1.05 * S,
          h.y,
          S,
        );
      }
      for (let i = 0; i < heads.length; i++) {
        const h = heads[i];
        const flip = i > 0 && h.p - heads[i - 1].p === 1 && !prevFlip;
        prevFlip = flip;
        const hx = flip ? (up ? x + hw - 0.12 * S : x - hw + 0.12 * S) : x;
        for (let q = -2; q >= h.p; q -= 2) {
          const ly = y0 + 4 * S - (q * S) / 2;
          svg(
            "line",
            {
              class: "stem",
              x1: hx - 0.45 * S,
              x2: hx + hw + 0.45 * S,
              y1: ly,
              y2: ly,
              "stroke-width": 1.2,
            },
            g,
          );
        }
        for (let q = 10; q <= h.p; q += 2) {
          const ly = y0 + 4 * S - (q * S) / 2;
          svg(
            "line",
            {
              class: "stem",
              x1: hx - 0.45 * S,
              x2: hx + hw + 0.45 * S,
              y1: ly,
              y2: ly,
              "stroke-width": 1.2,
            },
            g,
          );
        }
        glyph(
          g,
          dur >= 4 ? GL.whole : dur >= 2 ? GL.half : GL.black,
          hx,
          h.y,
          S,
        );
        const dotted = [0.75, 1.5, 3].includes(dur);
        if (dotted)
          svg(
            "circle",
            {
              cx: x + hw + 0.55 * S,
              cy: h.p % 2 === 0 ? h.y - S / 2 : h.y,
              r: 0.2 * S,
            },
            g,
          );
      }
      if (dur < 4) {
        const sx = up ? x + hw - 0.06 * S : x + 0.06 * S;
        const far = up ? heads[heads.length - 1].y : heads[0].y;
        const near = up ? heads[0].y : heads[heads.length - 1].y;
        const endY = it.stemEnd ?? (up ? far - 3.4 * S : far + 3.4 * S);
        svg(
          "line",
          {
            class: "stem",
            x1: sx,
            x2: sx,
            y1: near + (up ? -0.15 : 0.15) * S,
            y2: endY,
            "stroke-width": 0.13 * S,
          },
          g,
        );
        if (!beamed.has(it) && dur <= 0.75) {
          const sixteenth = dur <= 0.375;
          glyph(
            g,
            up
              ? sixteenth
                ? GL.flag16u
                : GL.flag8u
              : sixteenth
                ? GL.flag16d
                : GL.flag8d,
            sx - 0.06 * S,
            endY,
            S,
          );
        }
        it.sx = sx;
      }
      if (o.ornaments?.[els.length]) {
        const top = Math.min(heads[heads.length - 1].y - 2.4 * S, y0 - 1.6 * S);
        glyph(g, o.ornaments[els.length], x - 0.2 * S, top, S);
      }
      els.push({ el: g, beat: it.beat, dur, chord: it.chord });
    }
    for (const bm of beams) {
      const x1 = bm.g[0].sx;
      const x2 = bm.g[bm.g.length - 1].sx;
      const th = 0.5 * S;
      const y = bm.up ? bm.yb : bm.yb - th;
      const g = els.find((e) => e.chord === bm.g[0].chord).el;
      svg("rect", { x: x1, y, width: x2 - x1 + 0.13 * S, height: th }, g);
      if (bm.sixteenth)
        svg(
          "rect",
          {
            x: x1,
            y: bm.up ? y + 0.75 * S : y - 0.75 * S,
            width: x2 - x1 + 0.13 * S,
            height: th,
          },
          g,
        );
    }
    const playhead = addPlayhead(root, yTop - 2 * S, yBottom + 2 * S);
    host.replaceChildren(root);
    return { root, els, L, playhead, S };
  }

  // Numbered notation aligned to the same x positions as the staff.
  const DEG = [
    ["1", 0],
    ["1", 1],
    ["2", 0],
    ["3", -1],
    ["3", 0],
    ["4", 0],
    ["4", 1],
    ["5", 0],
    ["6", -1],
    ["6", 0],
    ["7", -1],
    ["7", 0],
  ];
  function drawJianpu(host, notes, o = {}) {
    const width = o.width || 760;
    const height = o.height || 70;
    const fs = o.fs || 22;
    const bpb = o.beatsPerBar || 4;
    const tonic = o.tonic ?? 60;
    const L = layout({
      beats: o.beats,
      beatsPerBar: bpb,
      width,
      left: o.left ?? 64,
      right: o.right ?? 14,
      barGap: o.barGap ?? 12,
    });
    const root = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: `notation ${o.className || ""}`,
    });
    const y = height * 0.56;
    if (o.label)
      text(root, o.label, 8, y - 2, { class: "roll-label", "font-size": 12 });
    for (let k = 1; k <= L.barCount; k++) {
      const x = L.barX(k);
      svg(
        "line",
        {
          class: "bar-line",
          x1: x,
          x2: x,
          y1: y - fs * 0.9,
          y2: y + fs * 0.35,
        },
        root,
      );
    }
    const pad = Math.min(L.ppb * 0.2, 8) + fs * 0.32;
    const list = notes.filter((n) => !n.hand).sort((a, b) => a.beat - b.beat);
    const els = [];
    list.forEach((n, i) => {
      const rel = n.midi + (o.transpose || 0) - tonic;
      const oct = Math.floor(rel / 12);
      const [digit, acc] = DEG[pcOf(rel)];
      const x = L.xAt(n.beat) + pad;
      const g = svg("g", { class: "jp" }, root);
      if (o.changed?.(n)) g.classList.add("changed");
      text(g, digit, x, y, { "font-size": fs, "text-anchor": "middle" });
      if (acc)
        text(g, acc > 0 ? "♯" : "♭", x - fs * 0.5, y - fs * 0.38, {
          "font-size": fs * 0.55,
          "text-anchor": "middle",
        });
      for (let k = 0; k < oct; k++)
        svg(
          "circle",
          { class: "jp-dot", cx: x, cy: y - fs * 0.95 - k * 5, r: 2.2 },
          g,
        );
      const lines = n.dur <= 0.25 ? 2 : n.dur <= 0.75 ? 1 : 0;
      const next = list[i + 1];
      const joined =
        next &&
        lines &&
        Math.floor(next.beat + 1e-6) === Math.floor(n.beat + 1e-6) &&
        next.dur <= 0.75;
      const x2 = joined ? L.xAt(next.beat) + pad : x + fs * 0.32;
      for (let k = 0; k < lines; k++) {
        svg(
          "line",
          {
            class: "jp-line",
            x1: x - fs * 0.32,
            x2,
            y1: y + 5 + k * 4,
            y2: y + 5 + k * 4,
            stroke: "currentColor",
            "stroke-width": 1.6,
          },
          g,
        );
      }
      for (let k = 0; k < -oct; k++)
        svg(
          "circle",
          { class: "jp-dot", cx: x, cy: y + 8 + lines * 4 + k * 5, r: 2.2 },
          g,
        );
      if (n.dur === 1.5 || n.dur === 0.75)
        svg(
          "circle",
          { class: "jp-dot", cx: x + fs * 0.48, cy: y - fs * 0.22, r: 2.2 },
          g,
        );
      for (let k = 1; k < Math.round(n.dur); k++) {
        if (n.dur === 1.5) break;
        text(g, "–", L.xAt(n.beat + k) + pad, y - 2, {
          "font-size": fs,
          "text-anchor": "middle",
        });
      }
      els.push({ el: g, beat: n.beat, dur: n.dur });
    });
    const playhead = addPlayhead(root, 6, height - 6);
    host.replaceChildren(root);
    return { root, els, L, playhead };
  }

  function drawRoll(host, notes, o = {}) {
    const width = o.width || 760;
    const height = o.height || 150;
    const bpb = o.beatsPerBar || 4;
    const L = layout({
      beats: o.beats,
      beatsPerBar: bpb,
      width,
      left: o.left ?? 64,
      right: o.right ?? 14,
      barGap: o.barGap ?? 12,
    });
    const midis = notes.length ? notes.map((n) => n.midi) : [60];
    const lo = o.lo ?? Math.min(...midis) - 1;
    const hi = o.hi ?? Math.max(...midis) + 1;
    const padY = 8;
    const rowH = (height - padY * 2) / (hi - lo + 1);
    const root = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: `notation ${o.className || ""}`,
      preserveAspectRatio: "none",
    });
    for (let m = lo; m <= hi; m++) {
      const y = padY + (hi - m) * rowH;
      if (isBlack(m))
        svg(
          "rect",
          {
            class: "roll-row",
            x: L.left - 6,
            y,
            width: width - L.left - L.right + 6,
            height: rowH,
          },
          root,
        );
      if (o.labels !== false && (pcOf(m) === 0 || m === lo || m === hi)) {
        if (rowH >= 7 || pcOf(m) === 0)
          text(root, noteName(m), 8, y + rowH * 0.5 + 4, {
            class: "roll-label",
          });
      }
    }
    for (let k = 1; k < L.barCount; k++) {
      const x = L.barX(k);
      svg(
        "line",
        {
          class: "bar-line",
          x1: x,
          x2: x,
          y1: padY,
          y2: height - padY,
          "stroke-dasharray": "2 4",
        },
        root,
      );
    }
    const els = notes.map((n) => {
      const y = padY + (hi - n.midi) * rowH + 1;
      const el = svg(
        "rect",
        {
          class: `roll-note ${n.hand ? "l" : "r"}`,
          x: L.xAt(n.beat) + 1,
          y,
          width: Math.max(3, n.dur * L.ppb - 3),
          height: Math.max(2, rowH - 2),
        },
        root,
      );
      if (o.velocity)
        el.style.setProperty("--vo", (0.2 + (n.vel ?? 0.6) * 0.8).toFixed(2));
      return { el, beat: n.beat, dur: n.dur };
    });
    const playhead = addPlayhead(root, 2, height - 2);
    host.replaceChildren(root);
    return { root, els, L, playhead };
  }

  function paint(view, beat, live) {
    if (!view) return;
    view.root.classList.toggle("is-live", live);
    for (const e of view.els)
      e.el.classList.toggle(
        "on",
        live && beat >= e.beat - 1e-3 && beat < e.beat + e.dur - 0.02,
      );
    if (live)
      view.playhead.setAttribute(
        "transform",
        `translate(${view.L.xAt(clamp(beat, 0, view.L.beats))} 0)`,
      );
  }

  /* ---------------- DOM keyboard ---------------- */
  const KEYMAP = {
    a: 0,
    w: 1,
    s: 2,
    e: 3,
    d: 4,
    f: 5,
    t: 6,
    g: 7,
    y: 8,
    h: 9,
    u: 10,
    j: 11,
    k: 12,
    o: 13,
    l: 14,
    p: 15,
    ";": 16,
    "'": 17,
  };
  const KEY_LABEL = Object.fromEntries(
    Object.entries(KEYMAP).map(([k, v]) => [v, k.toUpperCase()]),
  );

  class Keyboard {
    constructor(
      host,
      { lo, hi, labels = false, base = 60, onDown, onUp } = {},
    ) {
      Object.assign(this, { host, labels, base, onDown, onUp });
      this.keys = new Map();
      this.pointers = new Map();
      this.build(lo, hi);
      host.addEventListener("pointerdown", (e) => this.pointer(e, "down"));
      host.addEventListener("pointermove", (e) => this.pointer(e, "move"));
      for (const type of ["pointerup", "pointercancel", "pointerleave"])
        host.addEventListener(type, (e) => this.pointer(e, "up"));
    }
    build(lo, hi, base = this.base) {
      this.lo = lo;
      this.hi = hi;
      this.base = base;
      this.keys.clear();
      this.host.replaceChildren();
      const whites = [];
      for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
      const ww = 100 / whites.length;
      for (let m = lo; m <= hi; m++) {
        const el = document.createElement("button");
        el.type = "button";
        el.tabIndex = -1;
        el.className = `key ${isBlack(m) ? "b" : "w"}`;
        el.dataset.midi = m;
        el.setAttribute("aria-label", noteName(m));
        if (isBlack(m)) {
          const i = whites.indexOf(m - 1);
          el.style.left = `calc(${(i + 1) * ww}% - ${ww * 0.31}%)`;
          el.style.width = `${ww * 0.62}%`;
        }
        if (this.labels) {
          const label = KEY_LABEL[m - this.base];
          if (label)
            el.insertAdjacentHTML(
              "beforeend",
              `<span class="kl">${label}</span>`,
            );
          if (pcOf(m) === 0)
            el.insertAdjacentHTML(
              "beforeend",
              `<span class="kn">${noteName(m)}</span>`,
            );
        }
        this.host.appendChild(el);
        this.keys.set(m, el);
      }
    }
    light(midi, on, hand = 0) {
      const el = this.keys.get(midi);
      if (!el) return;
      el.classList.toggle("on", on);
      el.classList.toggle("l", on && hand === 1);
    }
    pointer(e, kind) {
      if (!this.onDown) return;
      if (kind === "down") {
        e.preventDefault();
        this.host.setPointerCapture?.(e.pointerId);
      }
      if (kind === "up") {
        const m = this.pointers.get(e.pointerId);
        if (m != null) this.onUp?.(m);
        this.pointers.delete(e.pointerId);
        return;
      }
      if (kind === "move" && !this.pointers.has(e.pointerId)) return;
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest?.(".key");
      const m = el && this.host.contains(el) ? Number(el.dataset.midi) : null;
      const prev = this.pointers.get(e.pointerId);
      if (m === prev) return;
      if (prev != null) this.onUp?.(prev);
      if (m != null) {
        this.pointers.set(e.pointerId, m);
        this.onDown(m, el);
      } else this.pointers.set(e.pointerId, null);
    }
  }

  /* ---------------- Visual effects ---------------- */
  const FX = (() => {
    const canvas = $("#fx");
    const g = canvas.getContext("2d");
    const parts = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = innerWidth;
      h = innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    };
    resize();
    addEventListener("resize", resize);
    function step() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= p.decay;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        g.globalAlpha = Math.max(0, p.life);
        if (p.ring) {
          p.r += 2.2;
          g.strokeStyle = p.color;
          g.lineWidth = 2 * p.life;
          g.beginPath();
          g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          g.stroke();
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.glyph ? -0.01 : 0.06;
        p.vx *= 0.98;
        g.fillStyle = p.color;
        if (p.glyph) {
          g.font = `${p.size}px "Bravura", serif`;
          g.fillText(p.glyph, p.x, p.y);
        } else {
          g.beginPath();
          g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
      if (!parts.length) frame.remove(step);
    }
    const NOTE_GLYPHS = ["", "", ""];
    return {
      burst(
        x,
        y,
        { color = "#46f0b8", count = 10, glyph = false, spread = 1 } = {},
      ) {
        if (reduceMotion || parts.length > 400) return;
        for (let i = 0; i < count; i++) {
          parts.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 3.2 * spread,
            vy: -Math.random() * 3.2 - 0.8,
            r: 1 + Math.random() * 2.2,
            life: 1,
            decay: 0.014 + Math.random() * 0.02,
            color,
          });
        }
        if (glyph) {
          parts.push({
            x: x - 8,
            y,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -1.4 - Math.random(),
            life: 1,
            decay: 0.012,
            color,
            glyph: NOTE_GLYPHS[Math.floor(Math.random() * 3)],
            size: 26 + Math.random() * 12,
          });
        }
        frame.add(step);
      },
      ring(x, y, color = "#46f0b8") {
        if (reduceMotion) return;
        parts.push({ x, y, ring: true, r: 6, life: 1, decay: 0.03, color });
        frame.add(step);
      },
    };
  })();

  // The backdrop brightens with every note that sounds anywhere on the page.
  (() => {
    const aurora = $(".aurora");
    const blobs = $$(".blob", aurora);
    let energy = 0;
    let shown = -1;
    const step = () => {
      energy *= 0.93;
      if (Math.abs(energy - shown) > 0.004) {
        aurora.style.setProperty("--energy", energy.toFixed(3));
        shown = energy;
      }
      if (energy < 0.004) {
        aurora.style.setProperty("--energy", "0");
        shown = 0;
        frame.remove(step);
      }
    };
    Sound.onNote((ev) => {
      if (reduceMotion) return;
      setTimeout(
        () => {
          energy = Math.min(1, energy + ev.vel * 0.18);
          frame.add(step);
        },
        Math.max(0, (ev.time - Sound.now) * 1000),
      );
    });
    let mx = 0;
    let my = 0;
    addEventListener(
      "pointermove",
      (e) => {
        if (reduceMotion) return;
        mx = e.clientX / innerWidth - 0.5;
        my = e.clientY / innerHeight - 0.5;
        blobs.forEach((b, i) => {
          const k = (i + 1) * 14;
          b.style.setProperty("--px", `${mx * k}px`);
          b.style.setProperty("--py", `${my * k}px`);
        });
      },
      { passive: true },
    );
  })();

  /* ---------------- Page chrome ---------------- */
  function initChrome() {
    const unlock = () => Sound.unlock();
    addEventListener("pointerdown", unlock, { capture: true });
    addEventListener("keydown", unlock, { capture: true });
    addEventListener("touchend", unlock, { capture: true });

    const toggle = $("#sound-toggle");
    const label = $(".sound-label", toggle);
    const sync = () => {
      toggle.setAttribute("aria-pressed", String(Sound.enabled));
      label.textContent = Sound.enabled ? "声音开" : "声音关";
    };
    sync();
    toggle.addEventListener("click", () => {
      Sound.setEnabled(!Sound.enabled);
      sync();
    });

    // Glass spotlight follows the cursor.
    $$(".card, .stat, .cases, .play").forEach((el) => el.classList.add("spot"));
    addEventListener(
      "pointermove",
      (e) => {
        const el = e.target.closest?.(".spot");
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      },
      { passive: true },
    );

    $$(".magnetic").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.16}px, ${(e.clientY - r.top - r.height / 2) * 0.24}px)`;
      });
      el.addEventListener("pointerleave", () => (el.style.transform = ""));
    });

    // Interface sounds: a glass tick on hover, a soft piano note on click (pentatonic, so it never clashes).
    const order = new WeakMap();
    let counter = 0;
    const indexOf = (el) => {
      if (!order.has(el)) order.set(el, counter++);
      return order.get(el);
    };
    const SOUNDY = "a, button, .chip, .stat";
    let lastHover = null;
    document.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const el = e.target.closest?.(SOUNDY);
      if (
        !el ||
        el === lastHover ||
        el.closest(".key, [data-silent], .keyboard")
      ) {
        if (!el) lastHover = null;
        return;
      }
      lastHover = el;
      Sound.ui("hover", indexOf(el));
    });
    document.addEventListener("click", (e) => {
      const el = e.target.closest?.("a, button");
      if (
        !el ||
        el.closest(
          ".key, [data-silent], .chord-chips, .effect-chips, .stepper",
        ) ||
        el.disabled
      )
        return;
      Sound.ui("tap", indexOf(el));
    });

    // Reveal on scroll, staggered within a parent.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    $$("[data-reveal]").forEach((el) => {
      const siblings = [...el.parentElement.children].filter((c) =>
        c.hasAttribute("data-reveal"),
      );
      el.style.setProperty(
        "--delay",
        `${Math.min(siblings.indexOf(el), 6) * 0.07}s`,
      );
      io.observe(el);
    });

    // Nav: sliding pill on the section in view.
    const links = $$(".nav-links a");
    const pill = $(".nav-pill");
    const movePill = (a) => {
      links.forEach((l) => l.classList.toggle("is-active", l === a));
      if (!a) {
        pill.style.opacity = "0";
        return;
      }
      pill.style.opacity = "1";
      pill.style.width = `${a.offsetWidth}px`;
      pill.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    const sections = links.map((a) => $(a.getAttribute("href")));
    const onScroll = () => {
      const y = innerHeight * 0.4;
      let active = null;
      sections.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        if (r.top <= y && r.bottom > y) active = links[i];
      });
      if (active !== movePill.last) {
        movePill.last = active;
        movePill(active);
      }
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", () => movePill(movePill.last));
    onScroll();

    // Count-up numbers.
    const counters = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        counters.unobserve(e.target);
        const target = Number(e.target.dataset.count);
        const t0 = performance.now();
        const run = (t) => {
          const k = Math.min(1, (t - t0) / 1400);
          const v = Math.round(target * (1 - Math.pow(1 - k, 4)));
          e.target.textContent = v.toLocaleString("en-US");
          if (k < 1) requestAnimationFrame(run);
        };
        if (!reduceMotion) requestAnimationFrame(run);
      }
    });
    $$("[data-count]").forEach((el) => counters.observe(el));
  }

  // Segmented control with a sliding pill.
  function seg(root, onSelect) {
    const pill = $(".seg-pill", root);
    const buttons = $$("button", root);
    const place = () => {
      const b = buttons.find((x) => x.getAttribute("aria-selected") === "true");
      if (!b || !pill) return;
      pill.style.width = `${b.offsetWidth}px`;
      pill.style.transform = `translateX(${b.offsetLeft}px)`;
    };
    buttons.forEach((b) =>
      b.addEventListener("click", () => {
        buttons.forEach((x) =>
          x.setAttribute("aria-selected", String(x === b)),
        );
        place();
        onSelect(b);
      }),
    );
    requestAnimationFrame(place);
    addEventListener("resize", place);
    if (document.fonts) document.fonts.ready.then(place);
    new ResizeObserver(place).observe(root);
  }

  function chips(root, onSelect) {
    const buttons = $$("button", root);
    buttons.forEach((b) =>
      b.addEventListener("click", () => {
        buttons.forEach((x) => x.classList.toggle("on", x === b));
        onSelect(b);
      }),
    );
  }

  /* ---------------- Hero: playable staff ---------------- */
  function initStrings() {
    const host = $("#strings");
    const root = $(".strings-svg", host);
    const labels = $(".strings-labels", host);
    const hint = $("#strings-hint");
    const LINES = [77, 74, 71, 67, 64]; // F5 D5 B4 G4 E4, top to bottom
    const SPACES = [76, 72, 69, 65]; // E5 C5 A4 F4
    const JP = {
      64: "3",
      65: "4",
      67: "5",
      69: "6",
      71: "7",
      72: "1̇",
      74: "2̇",
      76: "3̇",
      77: "4̇",
    };
    let W = 0;
    let H = 0;
    let gap = 0;
    let top = 0;
    const lines = [];
    const spaces = [];

    function build() {
      W = host.clientWidth;
      H = host.clientHeight;
      gap = Math.min(30, H / 6.4);
      top = H / 2 - 2 * gap;
      root.setAttribute("viewBox", `0 0 ${W} ${H}`);
      root.replaceChildren();
      const defs = svg("defs", {}, root);
      const grad = svg(
        "linearGradient",
        { id: "spaceGlow", x1: 0, x2: 1 },
        defs,
      );
      svg(
        "stop",
        { offset: 0, "stop-color": "#46f0b8", "stop-opacity": 0 },
        grad,
      );
      svg(
        "stop",
        { offset: 0.5, "stop-color": "#46f0b8", "stop-opacity": 0.32 },
        grad,
      );
      svg(
        "stop",
        { offset: 1, "stop-color": "#63c7ff", "stop-opacity": 0 },
        grad,
      );
      spaces.length = 0;
      SPACES.forEach((m, i) => {
        spaces.push(
          svg(
            "rect",
            {
              class: "space",
              x: 0,
              y: top + i * gap + 3,
              width: W,
              height: gap - 6,
            },
            root,
          ),
        );
      });
      LINES.forEach((m, i) => {
        const y = top + i * gap;
        const el = svg(
          "path",
          { class: "string", d: `M0 ${y} L${W} ${y}` },
          root,
        );
        lines[i] = { el, y, amp: 0, px: 0.5, t0: 0, lit: 0 };
      });
      text(root, GL.gclef, Math.max(16, W / 2 - 600), top + 3 * gap, {
        class: "clef",
        "font-size": gap * 4,
      });
    }

    function animate(t) {
      let busy = false;
      for (const line of lines) {
        if (!line.amp) continue;
        const s = (t - line.t0) / 1000;
        const env = line.amp * Math.exp(-s * 3);
        if (Math.abs(env) < 0.15) {
          line.amp = 0;
          line.el.setAttribute("d", `M0 ${line.y} L${W} ${line.y}`);
          line.el.classList.remove("lit");
          line.el.style.strokeWidth = "";
          continue;
        }
        busy = true;
        const d = env * Math.cos(2 * Math.PI * 7.5 * s);
        line.el.setAttribute(
          "d",
          `M0 ${line.y} Q${line.px * W} ${line.y + 2 * d} ${W} ${line.y}`,
        );
        line.el.style.strokeWidth = `${1.4 + Math.abs(env) * 0.18}`;
      }
      if (!busy) frame.remove(animate);
    }

    function label(midi, x, y) {
      const el = document.createElement("span");
      el.className = "pluck-label";
      el.innerHTML = `${noteName(midi)}<small>简谱 ${JP[midi]}</small>`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      labels.appendChild(el);
      setTimeout(() => el.remove(), 1100);
    }

    function pluck(i, x, force = 6, vel = 0.6) {
      const line = lines[i];
      line.amp = clamp(force, 3, gap * 0.42) * (Math.random() < 0.5 ? -1 : 1);
      line.px = clamp(x / W, 0.05, 0.95);
      line.t0 = performance.now();
      line.el.classList.add("lit");
      frame.add(animate);
      Sound.piano(LINES[i], { vel, dur: 1.6 });
      sparkle(LINES[i], x, line.y);
    }
    function ring(i, x, vel = 0.5) {
      const el = spaces[i];
      el.animate?.([{ opacity: 1 }, { opacity: 0 }], {
        duration: 800,
        easing: "ease-out",
      });
      Sound.piano(SPACES[i], { vel, dur: 1.4 });
      sparkle(SPACES[i], x, top + i * gap + gap / 2);
    }
    function sparkle(midi, x, y) {
      const r = host.getBoundingClientRect();
      FX.burst(r.left + x, r.top + y, {
        count: 7,
        glyph: Math.random() < 0.45,
        color: midi > 70 ? "#63c7ff" : "#46f0b8",
      });
      label(midi, x, y - 18);
    }

    let last = null;
    let lastTime = 0;
    host.addEventListener("pointermove", (e) => {
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const now = performance.now();
      if (last && (e.pointerType === "mouse" || e.buttons)) {
        const dy = Math.abs(y - last.y);
        const speed = dy / Math.max(8, now - lastTime);
        const vel = clamp(0.35 + speed * 0.25, 0.32, 0.92);
        lines.forEach((line, i) => {
          if ((last.y - line.y) * (y - line.y) < 0)
            pluck(i, x, 4 + speed * 10, vel);
        });
        SPACES.forEach((m, i) => {
          const sy = top + i * gap + gap / 2;
          if ((last.y - sy) * (y - sy) < 0) ring(i, x, vel * 0.85);
        });
        if (!hint.classList.contains("is-done") && Sound.running)
          hint.classList.add("is-done");
      }
      last = { x, y };
      lastTime = now;
    });
    host.addEventListener("pointerleave", () => (last = null));
    host.addEventListener("pointerdown", (e) => {
      const r = host.getBoundingClientRect();
      last = { x: e.clientX - r.left, y: e.clientY - r.top };
      lastTime = performance.now();
    });

    // "让五线谱弹一句": Ode to Joy in G major lies entirely on the treble lines and spaces.
    const btn = $("#hero-play");
    const btnLabel = $("span", btn);
    const SONG = jianpu(
      "3 3 4 5 5 4 3 2 1 1 2 3 3. 2_ 2- 3 3 4 5 5 4 3 2 1 1 2 3 2. 1_ 1-",
      { tonic: 67 },
    );
    let timers = [];
    const stop = () => {
      timers.forEach(clearTimeout);
      timers = [];
      btnLabel.textContent = "让五线谱弹一句";
      btn.classList.remove("is-on");
    };
    btn.addEventListener("click", () => {
      if (timers.length) return stop();
      Sound.init();
      btnLabel.textContent = "停止";
      btn.classList.add("is-on");
      const spb = 60 / 116;
      const total = SONG[SONG.length - 1].beat + 2;
      Sound.ready().then(() => {
        SONG.forEach((n) => {
          timers.push(
            setTimeout(
              () => {
                const x = W * (0.12 + 0.76 * (n.beat / total));
                const li = LINES.indexOf(n.midi);
                if (li >= 0) pluck(li, x, 9, 0.62);
                else ring(SPACES.indexOf(n.midi), x, 0.6);
              },
              n.beat * spb * 1000 + 60,
            ),
          );
        });
        timers.push(setTimeout(stop, total * spb * 1000));
      });
    });

    build();
    new ResizeObserver(build).observe(host);
    const hintText = $(".hint-text", hint);
    const unlocked = () =>
      (hintText.textContent = "声音已开启，用鼠标或手指划过五线谱");
    if (Sound.unlocked) unlocked();
    else document.addEventListener("lepu:audio", unlocked, { once: true });
  }

  /* ---------------- Product story ---------------- */
  function initStory() {
    const device = $("#device");
    const title = $("#device-title");
    const steps = $$(".step");
    const TITLES = [
      "导入乐谱",
      "识谱任务 · 逐行检测",
      "练习室 · 欢乐颂",
      "编辑与改编",
    ];

    // Paper "photo": three grand-staff systems in ink.
    const paperHost = $("#paper-staff");
    const left = (n) =>
      ODE_LEFT.filter((x) => x.beat >= n * 4 && x.beat < (n + 2) * 4);
    for (const [i, from] of [0, 2, 4].entries()) {
      const div = document.createElement("div");
      paperHost.appendChild(div);
      const notes = [
        ...bars(ODE, from, from + 2),
        ...left(from).map((n) => ({ ...n, beat: n.beat - from * 4 })),
      ];
      drawStaff(div, notes, {
        beats: 8,
        clef: "grand",
        className: "ink",
        timeSig: i === 0 ? [4, 4] : null,
        S: 7,
        width: 520,
        padTop: 18,
        padBottom: 14,
      });
    }
    const placeBoxes = () => {
      const systems = $$(":scope > div", paperHost);
      const paper = $("#paper");
      ["rb1", "rb2", "rb3"].forEach((cls, i) => {
        const s = systems[i];
        const box = $(`.${cls}`, paper);
        if (!s || !box) return;
        box.style.top = `${s.offsetTop + 4}px`;
        box.style.height = `${s.offsetHeight - 6}px`;
      });
    };

    // Practice scene: digital staff + jianpu + keyboard, loop of bars 1–2.
    const digital = $("#device-digital");
    const staffHost = document.createElement("div");
    const jpHost = document.createElement("div");
    digital.append(staffHost, jpHost);
    const phrase = bars(ODE, 0, 2);
    const staffView = drawStaff(staffHost, phrase, {
      beats: 8,
      timeSig: [4, 4],
      left: 60,
      width: 560,
      barGap: 12,
    });
    const jpView = drawJianpu(jpHost, phrase, {
      beats: 8,
      left: 60,
      width: 560,
      label: "1=C",
      height: 54,
      fs: 20,
    });
    const keys = new Keyboard($("#device-keys"), { lo: 60, hi: 72 });
    const player = new Player({
      notes: [...phrase, ...ODE_LEFT.filter((n) => n.beat < 8)],
      bpm: 92,
      loop: [0, 8],
    });
    const stage = $(".scene-practice");
    let lit = new Set();
    const render = (beat, live) => {
      paint(staffView, beat, live);
      paint(jpView, beat, live);
      const now = new Set(
        live
          ? phrase
              .filter((n) => beat >= n.beat && beat < n.beat + n.dur - 0.05)
              .map((n) => n.midi)
          : [],
      );
      for (const m of lit) if (!now.has(m)) keys.light(m, false);
      for (const m of now) if (!lit.has(m)) keys.light(m, true);
      lit = now;
    };
    const ghostT0 = performance.now();
    const ghost = (t) => {
      if (player.playing) return render(player.beat, true);
      render((((t - ghostT0) / 1000) * (92 / 60)) % 8, true);
    };
    $("#device-play").addEventListener("click", () => player.toggle());
    player.onState = (on) => stage.classList.toggle("is-playing", on);

    // Edit scene: one note became a G major chord, another carries a trill.
    const edit = [
      ...bars(ODE, 0, 2).filter((n) => n.beat !== 4),
      { beat: 4, dur: 1, midi: 67 },
      { beat: 4, dur: 1, midi: 71 },
      { beat: 4, dur: 1, midi: 74 },
    ];
    edit.sort((a, b) => a.beat - b.beat);
    const editView = drawStaff($("#device-edit"), edit, {
      beats: 8,
      timeSig: [4, 4],
      width: 560,
      left: 60,
      ornaments: { 6: GL.trill },
    });
    editView.els[4]?.el.classList.add("on");
    editView.playhead.remove();

    let current = -1;
    let onScreen = false;
    const sync = () => {
      if (current === 2 && onScreen) frame.add(ghost);
      else {
        frame.remove(ghost);
        player.pause();
      }
    };
    const set = (i) => {
      if (i === current) return;
      current = i;
      device.dataset.scene = String(i);
      steps.forEach((s, k) => s.classList.toggle("is-active", k === i));
      title.textContent = TITLES[i];
      sync();
      if (i <= 1) placeBoxes();
    };
    new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    }).observe($("#product"));
    // On phones the device sticks to the top, so steps activate in the band below it.
    let io = null;
    const narrow = matchMedia("(max-width: 900px)");
    const observe = () => {
      io?.disconnect();
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries)
            if (e.isIntersecting) set(Number(e.target.dataset.step));
        },
        {
          rootMargin: narrow.matches
            ? "-72% 0px -24% 0px"
            : "-48% 0px -48% 0px",
        },
      );
      steps.forEach((s) => io.observe(s));
    };
    observe();
    narrow.addEventListener?.("change", observe);
    set(0);
    new ResizeObserver(placeBoxes).observe(paperHost);
    if (document.fonts) document.fonts.ready.then(placeBoxes);

    const stageEl = $(".story-stage");
    stageEl.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || reduceMotion) return;
      const r = stageEl.getBoundingClientRect();
      device.style.setProperty(
        "--ry",
        `${((e.clientX - r.left) / r.width - 0.5) * 6}deg`,
      );
      device.style.setProperty(
        "--rx",
        `${-((e.clientY - r.top) / r.height - 0.5) * 6}deg`,
      );
    });
    stageEl.addEventListener("pointerleave", () => {
      device.style.setProperty("--rx", "0deg");
      device.style.setProperty("--ry", "0deg");
    });
  }

  /* ---------------- Features ---------------- */
  function initViews() {
    const card = $("#f-views");
    const melody = bars(ODE, 0, 4);
    const opts = { beats: 16, left: 64, width: 680, barGap: 12 };
    const views = {
      staff: drawStaff($(".view-staff", card), melody, {
        ...opts,
        timeSig: [4, 4],
      }),
      jianpu: drawJianpu($(".view-jianpu", card), melody, {
        ...opts,
        label: "1=C 4/4",
        height: 80,
        fs: 24,
      }),
      roll: drawRoll($(".view-roll", card), melody, {
        ...opts,
        height: 150,
        lo: 59,
        hi: 68,
      }),
    };
    const player = new Player({ notes: melody, bpm: 104, loop: [0, 16] });
    const render = bindPlayer(card, player, (beat, live) =>
      Object.values(views).forEach((v) => paint(v, beat, live)),
    );
    const box = $(".views", card);
    seg($(".seg", card), (b) => {
      box.dataset.view = b.dataset.view;
      render();
    });
  }

  function initTempo() {
    const card = $("#f-tempo");
    const range = $(".range", card);
    const input = $(".bpm input", card);
    const arm = $(".metronome .arm", card);
    const metro = $(".switch input", card);
    const player = new Player({
      notes: [...ODE, ...ODE_LEFT],
      bpm: 100,
      loop: [0, 32],
    });
    player.metronome = metro.checked;
    metro.addEventListener("change", () => {
      player.metronome = metro.checked;
      if (player.playing) player.setTempo(player.bpm);
    });
    bindPlayer(card, player, (beat, live) => {
      arm.style.transform = live
        ? `rotate(${Math.cos(Math.PI * beat) * 26}deg)`
        : "";
    });
    const apply = (v) => {
      player.setTempo(v);
      range.value = v;
      input.value = v;
      range.style.setProperty("--p", `${((v - 20) / 280) * 100}%`);
    };
    range.addEventListener("input", () => apply(Number(range.value)));
    const commit = () => {
      const v = Number(input.value);
      if (Number.isInteger(v) && v >= 20 && v <= 300) apply(v);
      else input.value = player.bpm;
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
    $(".range-marks span:nth-child(2)", card).addEventListener("click", () =>
      apply(100),
    );
    apply(100);
  }

  function initHands() {
    const card = $("#f-hands");
    const piece = caseById("invention-1");
    if (!piece) return;
    const notes = piece.notes.map(([beat, dur, midi, hand, vel]) => ({
      beat,
      dur,
      midi,
      hand,
      vel,
    }));
    const view = drawRoll($(".hand-roll", card), notes, {
      beats: piece.beats,
      width: 520,
      height: 180,
      left: 8,
      right: 8,
      barGap: 6,
      labels: false,
    });
    const player = new Player({
      notes,
      bpm: piece.tempo,
      loop: [0, piece.beats],
    });
    bindPlayer(card, player, (beat, live) => paint(view, beat, live));
    $$(".hand", card).forEach((b) =>
      b.addEventListener("click", () => {
        const on = !b.classList.contains("on");
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
        const hand = Number(b.dataset.hand);
        player.setMute(hand, !on);
        view.els.forEach((e, i) => {
          if (notes[i].hand === hand) e.el.style.opacity = on ? "" : "0.15";
        });
      }),
    );
  }

  function initLoop() {
    const card = $("#f-loop");
    const host = $(".bars", card);
    const melody = bars(ODE, 0, 4);
    const status = $(".loop-range", card);
    const count = $(".loop-count", card);
    let range = [2, 3];
    let pick = null;
    const barEls = [0, 1, 2, 3].map((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bar";
      b.innerHTML = `<span class="fill"></span><span class="bar-no">第 ${k + 1} 小节</span>`;
      const s = svg(
        "svg",
        { viewBox: "0 0 100 54", preserveAspectRatio: "none" },
        b,
      );
      melody
        .filter((n) => n.beat >= k * 4 && n.beat < k * 4 + 4)
        .forEach((n) =>
          svg(
            "rect",
            {
              x: (n.beat - k * 4) * 25 + 2,
              y: (67 - n.midi) * 5 + 4,
              width: n.dur * 25 - 4,
              height: 5,
              rx: 2,
            },
            s,
          ),
        );
      host.appendChild(b);
      b.addEventListener("click", () => {
        if (pick === null) {
          pick = k;
          range = [k, k];
          status.textContent = `循环 第 ${k + 1} 小节 · 再点一个设终点`;
        } else {
          range = [Math.min(pick, k), Math.max(pick, k)];
          pick = null;
          status.textContent =
            range[0] === range[1]
              ? `循环 第 ${range[0] + 1} 小节`
              : `循环 第 ${range[0] + 1}–${range[1] + 1} 小节`;
        }
        update();
        player.setLoop([range[0] * 4, range[1] * 4 + 4]);
      });
      return b;
    });
    const update = () =>
      barEls.forEach((b, k) =>
        b.classList.toggle("in", k >= range[0] && k <= range[1]),
      );
    const player = new Player({
      notes: melody,
      bpm: 108,
      loop: [8, 16],
      onLoop: (n) => (count.textContent = `已播放 ${n + 1} 遍`),
    });
    const prev = player.onState;
    player.onState = (on) => {
      prev?.(on);
      if (on) count.textContent = "已播放 1 遍";
    };
    bindPlayer(card, player, (beat, live) => {
      barEls.forEach((b, k) => {
        const f = live ? clamp((beat - k * 4) / 4, 0, 1) : 0;
        $(".fill", b).style.transform =
          `scaleX(${live && beat >= k * 4 && beat < k * 4 + 4 ? f : 0})`;
      });
    });
    update();
  }

  function initTranspose() {
    const card = $("#f-transpose");
    const melody = bars(ODE, 0, 2);
    const host = $(".transpose-staff", card);
    const KEYS = [
      "C",
      "D♭",
      "D",
      "E♭",
      "E",
      "F",
      "F♯",
      "G",
      "A♭",
      "A",
      "B♭",
      "B",
    ];
    let semis = 0;
    let view;
    const draw = () => {
      const flats = [1, 3, 5, 8, 10].includes(pcOf(semis));
      view = drawStaff(host, melody, {
        beats: 8,
        timeSig: [4, 4],
        transpose: semis,
        flats,
        width: 400,
        S: 8,
        barGap: 8,
        padTop: 40,
        padBottom: 30,
      });
      $(".key-name", card).textContent = semis
        ? `C → ${KEYS[pcOf(semis)]}`
        : "C 大调";
      $(".semi", card).textContent = `${semis > 0 ? "+" : ""}${semis} 半音`;
    };
    const player = new Player({ notes: melody, bpm: 112, loop: [0, 8] });
    bindPlayer(card, player, (beat, live) => paint(view, beat, live));
    $$(".stepper button", card).forEach((b) =>
      b.addEventListener("click", () => {
        semis = clamp(semis + Number(b.dataset.step), -6, 6);
        draw();
        player.setTranspose(semis);
        Sound.piano(64 + semis, { vel: 0.5, dur: 0.4 });
      }),
    );
    draw();
  }

  function initChords() {
    const card = $("#f-chords");
    const CH = {
      maj: {
        iv: [0, 4, 7],
        name: "C 大三和弦",
        tones: "C – E – G",
        rule: "大三度 + 小三度",
      },
      min: {
        iv: [0, 3, 7],
        name: "Cm 小三和弦",
        tones: "C – E♭ – G",
        rule: "小三度 + 大三度",
        flats: true,
      },
      dom7: {
        iv: [0, 4, 7, 10],
        name: "C7 属七和弦",
        tones: "C – E – G – B♭",
        rule: "大三和弦 + 小七度",
        flats: true,
      },
      maj7: {
        iv: [0, 4, 7, 11],
        name: "Cmaj7 大七和弦",
        tones: "C – E – G – B",
        rule: "大三和弦 + 大七度",
      },
      min7: {
        iv: [0, 3, 7, 10],
        name: "Cm7 小七和弦",
        tones: "C – E♭ – G – B♭",
        rule: "小三和弦 + 小七度",
        flats: true,
      },
      dim: {
        iv: [0, 3, 6],
        name: "C° 减三和弦",
        tones: "C – E♭ – G♭",
        rule: "两个小三度",
        flats: true,
      },
      sus4: {
        iv: [0, 5, 7],
        name: "Csus4 挂四和弦",
        tones: "C – F – G",
        rule: "三音换成纯四度",
      },
    };
    const staffHost = $(".chord-staff", card);
    const keys = new Keyboard($(".chord-keys", card), { lo: 60, hi: 76 });
    const readout = $(".chord-readout", card);
    drawStaff(staffHost, [{ beat: 0, dur: 2, midi: 60 }], {
      beats: 2,
      beatsPerBar: 2,
      width: 200,
      S: 9,
      left: 50,
      right: 10,
    });
    let timers = [];
    $$(".chord-chips button", card).forEach((b) =>
      b.addEventListener("click", () => {
        $$(".chord-chips button", card).forEach((x) =>
          x.classList.toggle("on", x === b),
        );
        const c = CH[b.dataset.chord];
        const midis = c.iv.map((i) => 60 + i);
        Player.current?.pause();
        drawStaff(
          staffHost,
          midis.map((midi) => ({ beat: 0, dur: 2, midi })),
          {
            beats: 2,
            beatsPerBar: 2,
            width: 200,
            S: 9,
            left: 50,
            right: 10,
            flats: c.flats,
          },
        );
        staffHost.querySelector(".n")?.classList.add("on");
        readout.innerHTML = `<b>${c.name}</b> · ${c.tones} · ${c.rule}`;
        timers.forEach(clearTimeout);
        timers = [];
        keys.keys.forEach((_, m) => keys.light(m, false));
        const now = Sound.init()?.currentTime ?? 0;
        midis.forEach((m) => {
          Sound.piano(m, { when: now, dur: 0.9, vel: 0.55 });
          keys.light(m, true);
        });
        timers.push(
          setTimeout(
            () => keys.keys.forEach((_, m) => keys.light(m, false)),
            900,
          ),
        );
        [...midis, 72].forEach((m, i) => {
          Sound.piano(m, {
            when: now + 1 + i * 0.14,
            dur: 1.2 - i * 0.1,
            vel: 0.5,
          });
          timers.push(setTimeout(() => keys.light(m, true), 1000 + i * 140));
        });
        timers.push(
          setTimeout(
            () => keys.keys.forEach((_, m) => keys.light(m, false)),
            2200,
          ),
        );
        const r = b.getBoundingClientRect();
        FX.burst(r.left + r.width / 2, r.top, { count: 12, glyph: true });
      }),
    );
  }

  function initEffects() {
    const card = $("#f-effects");
    const host = $(".effect-roll", card);
    const readout = $(".effect-readout", card);
    const G4 = 67;
    const FXS = {
      plain: {
        text: "原音：一个四分音符，力度 mf。",
        notes: [{ beat: 0, dur: 1, midi: G4, vel: 0.55 }],
      },
      dyn: {
        text: "pp → ff：力度改变实际发声的音量和明暗，也可以设 0–100% 自定义力度。",
        notes: [0.18, 0.32, 0.5, 0.7, 0.95].map((vel, i) => ({
          beat: i * 0.75,
          dur: 0.6,
          midi: G4,
          vel,
        })),
      },
      accent: {
        text: "重音 / 强重音：在原力度上加强，第 1、3 个音带重音。",
        notes: [0.92, 0.4, 0.92, 0.4].map((vel, i) => ({
          beat: i * 0.5,
          dur: 0.45,
          midi: G4,
          vel,
        })),
      },
      staccato: {
        text: "断奏：谱面时值不变，发声缩短到 45%。",
        notes: [0, 1, 2, 3].map((b) => ({
          beat: b * 0.75,
          dur: 0.75 * 0.45,
          midi: G4,
          vel: 0.6,
        })),
      },
      trill: {
        text: "颤音：主音与上方辅助音交替，约每拍 8 个音。",
        notes: Array.from({ length: 16 }, (_, i) => ({
          beat: i * 0.125,
          dur: 0.12,
          midi: i % 2 ? 69 : G4,
          vel: 0.5,
        })),
      },
      mordent: {
        text: "波音：先主音、再辅助音、再回到主音。辅助音按书写字母和调号确定。",
        notes: [
          { beat: 0, dur: 0.12, midi: G4, vel: 0.6 },
          { beat: 0.125, dur: 0.12, midi: 69, vel: 0.55 },
          { beat: 0.25, dur: 1.25, midi: G4, vel: 0.55 },
        ],
      },
      arp: {
        text: "琶音：同一时刻、同一只手的整个和弦按方向错开起奏，各音保留原结束时刻。",
        notes: [60, 64, 67, 72].map((midi, i) => ({
          beat: i * 0.14,
          dur: 2 - i * 0.14,
          midi,
          vel: 0.55,
        })),
      },
    };
    let view = null;
    let timer = 0;
    const player = new Player({ bpm: 100 });
    const tick = () => paint(view, player.beat, player.playing);
    player.onState = (on) => {
      if (on) frame.add(tick);
      else {
        frame.remove(tick);
        paint(view, 0, false);
      }
    };
    const show = (key, play) => {
      const fx = FXS[key];
      view = drawRoll(host, fx.notes, {
        beats: 2.25,
        beatsPerBar: 4,
        width: 520,
        height: 140,
        left: 10,
        right: 10,
        lo: 58,
        hi: 73,
        labels: false,
        velocity: true,
      });
      readout.textContent = fx.text;
      if (!play) return;
      clearTimeout(timer);
      player.pause();
      player.setNotes(fx.notes, 2.25);
      player.pos = 0;
      player.play(0);
    };
    chips($(".effect-chips", card), (b) => show(b.dataset.fx, true));
    $(".effect-chips button", card).classList.add("on");
    show("plain", false);
  }

  function initMode() {
    const card = $("#f-mode");
    const host = $(".mode-jianpu", card);
    const sw = $(".mode-switch", card);
    const readout = $(".mode-readout", card);
    const major = bars(TWINKLE, 0, 4);
    const MINOR = { 64: 63, 69: 68, 71: 70 };
    const minor = major.map((n) => ({
      ...n,
      midi: MINOR[n.midi] ?? n.midi,
      changed: n.midi in MINOR,
    }));
    let mode = "major";
    let views;
    const draw = () => {
      const notes = mode === "major" ? major : minor;
      const jp = document.createElement("div");
      const st = document.createElement("div");
      host.replaceChildren(st, jp);
      views = [
        drawStaff(st, notes, {
          beats: 16,
          timeSig: [4, 4],
          flats: true,
          width: 560,
          S: 8,
          left: 54,
          barGap: 10,
        }),
        drawJianpu(jp, notes, {
          beats: 16,
          width: 560,
          left: 54,
          barGap: 10,
          fs: 21,
          height: 64,
          tonic: mode === "major" ? 60 : 63,
          label: mode === "major" ? "1=C" : "1=♭E",
          changed: (n) => n.changed,
        }),
      ];
      readout.textContent =
        mode === "major"
          ? "1 = C · 大调 · 《小星星》前 4 小节，播放中也可以切换"
          : "1 = ♭E · 以 6 为主音 · E→E♭、A→A♭，改写 4 个音，调外音 0 个";
    };
    const player = new Player({ notes: major, bpm: 100, loop: [0, 16] });
    bindPlayer(card, player, (beat, live) =>
      views.forEach((v) => paint(v, beat, live)),
    );
    $$("button", sw).forEach((b) =>
      b.addEventListener("click", () => {
        mode = b.dataset.mode;
        sw.dataset.mode = mode;
        $$("button", sw).forEach((x) =>
          x.setAttribute("aria-checked", String(x === b)),
        );
        draw();
        player.setNotes(mode === "major" ? major : minor, 16);
      }),
    );
    draw();
  }

  function initPrint() {
    const card = $("#f-print");
    const sheet = $(".sheet", card);
    $$(".sheet-staff", sheet).forEach((host, i) => {
      const from = [0, 3, 6][i];
      const to = [3, 6, 8][i];
      drawStaff(host, bars(ODE, from, to), {
        beats: (to - from) * 4,
        timeSig: i === 0 ? [4, 4] : null,
        width: 520,
        S: 8,
        barGap: 8,
      });
    });
    $$(".opt-chips", card).forEach((group) =>
      chips(group, (b) => {
        sheet.dataset[group.dataset.opt] = b.dataset.v;
      }),
    );
  }

  /* ---------------- Waterfall (cases + game) ---------------- */
  class Waterfall {
    constructor(canvas, { interactive = false, labels = false, onKey } = {}) {
      Object.assign(this, { canvas, interactive, labels, onKey });
      this.g = canvas.getContext("2d");
      this.notes = [];
      this.lit = new Map();
      this.hidden = [false, false];
      this.flash = new Map();
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.resize();
    }
    // Keys span exactly the notes in use (to the nearest white key), so lanes stay wide on phones.
    setRange(lo, hi) {
      this.lo = isBlack(lo) ? lo - 1 : lo;
      this.hi = isBlack(hi) ? hi + 1 : hi;
      this.layoutKeys();
    }
    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = this.canvas.getBoundingClientRect();
      this.w = r.width;
      this.h = r.height;
      this.canvas.width = Math.max(1, r.width * dpr);
      this.canvas.height = Math.max(1, r.height * dpr);
      this.dpr = dpr;
      this.keyH = clamp(this.h * 0.18, 64, 110);
      this.hitY = this.h - this.keyH;
      if (this.lo != null) this.layoutKeys();
      this.redraw?.();
    }
    layoutKeys() {
      const whites = [];
      for (let m = this.lo; m <= this.hi; m++) if (!isBlack(m)) whites.push(m);
      const ww = this.w / whites.length;
      this.rects = new Map();
      whites.forEach((m, i) =>
        this.rects.set(m, { x: i * ww, w: ww, black: false }),
      );
      for (let m = this.lo; m <= this.hi; m++) {
        if (!isBlack(m)) continue;
        const left = this.rects.get(m - 1);
        if (left)
          this.rects.set(m, {
            x: left.x + ww - ww * 0.31,
            w: ww * 0.62,
            black: true,
          });
      }
    }
    keyAt(x, y) {
      if (y < this.hitY) return null;
      for (const [m, r] of this.rects)
        if (
          r.black &&
          x >= r.x &&
          x <= r.x + r.w &&
          y < this.hitY + this.keyH * 0.62
        )
          return m;
      for (const [m, r] of this.rects)
        if (!r.black && x >= r.x && x <= r.x + r.w) return m;
      return null;
    }
    draw(beat, { bpm, beatsPerBar = 4, barOffset = 0, active = [] } = {}) {
      const { g, w, h, hitY, keyH } = this;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const ppb = ((hitY / 3.2) * 60) / bpm;
      const visible = hitY / ppb;
      // bar lines
      g.font = "11px -apple-system, PingFang SC, sans-serif";
      for (
        let b =
          Math.ceil((beat - barOffset) / beatsPerBar) * beatsPerBar + barOffset;
        b < beat + visible;
        b += beatsPerBar
      ) {
        if (b < 0) continue;
        const y = hitY - (b - beat) * ppb;
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fillRect(0, y, w, 1);
        g.fillStyle = "rgba(255,255,255,0.3)";
        const bar =
          Math.round((b - barOffset) / beatsPerBar) + 1 + (barOffset ? 1 : 0);
        g.fillText(`${bar}`, 8, y - 4);
      }
      // lanes for black keys
      for (const [, r] of this.rects) {
        if (!r.black) continue;
        g.fillStyle = "rgba(255,255,255,0.025)";
        g.fillRect(r.x, 0, r.w, hitY);
      }
      // notes
      const COLORS = [
        ["#46f0b8", "rgba(70,240,184,0.55)"],
        ["#63c7ff", "rgba(99,199,255,0.55)"],
      ];
      for (const n of this.notes) {
        if (n.beat > beat + visible || n.beat + n.dur < beat - 0.05) continue;
        const r = this.rects.get(n.midi);
        if (!r) continue;
        const y1 = hitY - (n.beat - beat) * ppb;
        const y0 = y1 - n.dur * ppb;
        const top = Math.max(-4, y0);
        const bottom = Math.min(hitY, y1);
        if (bottom <= top) continue;
        const on = beat >= n.beat && beat < n.beat + n.dur;
        const hidden = this.hidden[n.hand];
        const [solid, soft] = COLORS[n.hand];
        g.globalAlpha = hidden ? 0.14 : n.hit === false ? 0.3 : 1;
        const pad = r.black ? 1 : 3;
        const grad = g.createLinearGradient(0, top, 0, bottom);
        grad.addColorStop(0, soft);
        grad.addColorStop(1, solid);
        g.fillStyle = on || n.hit ? "#ffffff" : grad;
        if (on && !hidden) {
          g.shadowColor = solid;
          g.shadowBlur = 18;
        }
        roundRect(
          g,
          r.x + pad,
          top,
          r.w - pad * 2,
          Math.max(4, bottom - top - 1),
          Math.min(6, (r.w - pad * 2) / 2),
        );
        g.fill();
        g.shadowBlur = 0;
        if (this.labels && !n.done && n.beat > beat) {
          const label = KEY_LABEL[n.midi - 60];
          if (label && bottom - top > 18) {
            g.fillStyle = "rgba(3,20,13,0.85)";
            g.font = "600 12px SF Mono, Menlo, monospace";
            g.textAlign = "center";
            g.fillText(label, r.x + r.w / 2, bottom - 6);
            g.textAlign = "left";
          }
        }
      }
      g.globalAlpha = 1;
      // hit line
      const hl = g.createLinearGradient(0, 0, w, 0);
      hl.addColorStop(0, "rgba(70,240,184,0)");
      hl.addColorStop(0.5, "rgba(70,240,184,0.9)");
      hl.addColorStop(1, "rgba(99,199,255,0)");
      g.fillStyle = hl;
      g.fillRect(0, hitY - 1, w, 2);
      // keys
      const lit = new Map(active.map((n) => [n.midi, n.hand]));
      for (const [m, hand] of this.flash) lit.set(m, hand);
      for (const black of [false, true]) {
        for (const [m, r] of this.rects) {
          if (r.black !== black) continue;
          const kh = black ? keyH * 0.62 : keyH;
          const hand = lit.get(m);
          if (hand != null) {
            g.fillStyle = hand ? "#63c7ff" : "#46f0b8";
            g.shadowColor = g.fillStyle;
            g.shadowBlur = 24;
          } else g.fillStyle = black ? "#0d1719" : "rgba(255,255,255,0.13)";
          roundRect(
            g,
            r.x + (black ? 0 : 1.5),
            hitY + 2,
            r.w - (black ? 0 : 3),
            kh - 4,
            black ? 4 : 7,
          );
          g.fill();
          g.shadowBlur = 0;
          if (!black) {
            g.fillStyle = "rgba(255,255,255,0.08)";
            g.fillRect(r.x + 1.5, hitY + 2, r.w - 3, 2);
          }
          if (this.labels) {
            const label = KEY_LABEL[m - 60];
            if (label) {
              g.fillStyle = black
                ? "rgba(255,255,255,0.45)"
                : "rgba(255,255,255,0.5)";
              g.font = "11px SF Mono, Menlo, monospace";
              g.textAlign = "center";
              g.fillText(label, r.x + r.w / 2, hitY + kh - 10);
              g.textAlign = "left";
            }
          }
          if (!black && pcOf(m) === 0 && r.w > 26) {
            g.fillStyle = "rgba(255,255,255,0.32)";
            g.font = "10px -apple-system, sans-serif";
            g.textAlign = "center";
            g.fillText(
              noteName(m),
              r.x + r.w / 2,
              hitY + kh - (this.labels ? 26 : 10),
            );
            g.textAlign = "left";
          }
        }
      }
      return ppb;
    }
    keyCenter(midi) {
      const r = this.rects.get(midi);
      const c = this.canvas.getBoundingClientRect();
      return r ? { x: c.left + r.x + r.w / 2, y: c.top + this.hitY } : null;
    }
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    w = Math.max(0, w);
    h = Math.max(0, h);
    if (g.roundRect) g.roundRect(x, y, w, h, clamp(r, 0, Math.min(w, h) / 2));
    else g.rect(x, y, w, h);
  }

  /* ---------------- Cases ---------------- */
  function initCases() {
    const root = $("#case-player");
    const TEXT = {
      bumblebee: {
        tab: "高速难曲",
        kicker: "案例 01 · 7 页矢量 PDF 直接转写",
        tip: "右手 814 个音几乎全是十六分音符的半音阶；前 8 小节只有右手，第 9 小节左手和弦进来。先点「50%」循环这一段，手指顺了再回到原谱 185 BPM。",
      },
      "fur-elise": {
        tab: "经典入门",
        kicker: "案例 02 · 左右手交替",
        tip: "开头 E–D♯ 的来回最容易乱。先只开右手、用 50% 速度循环，再打开左手，听分解和弦怎样接住旋律。",
      },
      moonlight: {
        tab: "慢板 · 三连音",
        kicker: "案例 03 · 三连音与低音八度",
        tip: "右手三连音要均匀，左手八度长音要撑满整小节。先单独听右手，再打开左手对齐每小节第一拍。",
      },
      bwv846: {
        tab: "PDF 识谱成果",
        kicker: "案例 04 · 用户上传 PDF 识谱",
        tip: "这份谱来自用户上传的 PDF：逐行识别、每行独立复读一次，再人工逐行审核后进入曲库，35 小节、549 个音全部可播放。",
      },
      "chopin-7": {
        tab: "短小完整",
        kicker: "案例 05 · 一首完整的曲子",
        tip: "全曲只有 17 小节、168 个音。用 75% 速度整首循环，先熟悉每两小节一句的呼吸，再练和弦同时触键。",
      },
    };
    const list = CASES.filter((c) => TEXT[c.id]);
    if (!list.length) return;
    const tabs = $(".case-tabs", root);
    const canvas = $(".case-canvas", root);
    const label = $(".case-bar-label", root);
    const fall = new Waterfall(canvas);
    const player = new Player({});
    let piece = null;
    let rate = 1;
    let prevActive = new Set();
    const fmtTime = (s) =>
      s >= 60
        ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
        : `${s} 秒`;

    const render = () => {
      if (!piece) return;
      const beat = player.beat;
      const live = player.playing;
      const active = live
        ? fall.notes.filter(
            (n) =>
              beat >= n.beat && beat < n.beat + n.dur && !fall.hidden[n.hand],
          )
        : [];
      fall.draw(live ? beat : Math.max(player.pos, 0) - 0.01, {
        bpm: player.bpm,
        beatsPerBar: piece.bpb,
        barOffset: piece.pickup,
      });
      const ids = new Set(active.map((n) => n.id));
      for (const n of active) {
        if (prevActive.has(n.id)) continue;
        const c = fall.keyCenter(n.midi);
        if (c)
          FX.burst(c.x, c.y, {
            count: 5,
            color: n.hand ? "#63c7ff" : "#46f0b8",
            spread: 0.6,
          });
      }
      prevActive = ids;
      const bar = Math.max(
        1,
        Math.floor((beat - piece.pickup) / piece.bpb) + (piece.pickup ? 2 : 1),
      );
      label.textContent = `${piece.excerpt} · 第 ${bar} 小节 · ${Math.round(player.bpm)} BPM`;
    };
    fall.redraw = render;

    const select = (c) => {
      player.pause();
      piece = c;
      const [num, den] = c.timeSignature;
      piece.bpb = (num * 4) / den;
      piece.pickup = c.id === "fur-elise" ? 0.5 : 0;
      fall.notes = c.notes.map(([beat, dur, midi, hand, vel], id) => ({
        id,
        beat,
        dur,
        midi,
        hand,
        vel,
      }));
      const midis = fall.notes.map((n) => n.midi);
      fall.setRange(Math.min(...midis), Math.max(...midis));
      player.setNotes(fall.notes, c.beats);
      player.loop = [0, c.beats];
      player.bpm = c.tempo * rate;
      player.pos = 0;
      player.mute = [...fall.hidden];
      const t = TEXT[c.id];
      $(".case-kicker", root).textContent = t.kicker;
      $(".case-title", root).textContent = c.title;
      $(".case-sub", root).textContent = `${c.subtitle} · ${c.composer}`;
      const cells = [
        ["全曲小节", c.stats.bars],
        ["全曲音符", c.stats.notes.toLocaleString("en-US")],
        ["右手 / 左手", `${c.stats.right} / ${c.stats.left}`],
        ["播放速度", `${c.tempo} BPM`],
        ["全曲时长", fmtTime(c.stats.seconds)],
        [
          c.pages ? "原谱页数" : "拍号",
          c.pages ? `${c.pages} 页` : c.timeSignature.join("/"),
        ],
      ];
      $(".case-stats", root).innerHTML = cells
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
        .join("");
      $(".case-tip", root).textContent = t.tip;
      $(".case-source", root).innerHTML = c.sourceUrl
        ? `许可：${c.license} · 来源 <a href="${c.sourceUrl}" target="_blank" rel="noopener">${c.sourceLabel}</a>`
        : `许可：${c.license} · 识谱数据保存在乐谱曲库`;
      $$(".case-tab", tabs).forEach((b) =>
        b.setAttribute("aria-selected", String(b.dataset.id === c.id)),
      );
      updateBpm();
      render();
    };
    const updateBpm = () =>
      ($(".case-bpm", root).textContent =
        `当前 ${Math.round(piece.tempo * rate)} BPM`);

    list.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "case-tab";
      b.setAttribute("role", "tab");
      b.dataset.id = c.id;
      b.innerHTML = `<b>${c.title}</b><small>${TEXT[c.id].tab}</small>`;
      b.addEventListener("click", () => select(c));
      tabs.appendChild(b);
    });

    player.onState = (on) => {
      root.classList.toggle("is-playing", on);
      if (on) frame.add(render);
      else {
        frame.remove(render);
        prevActive = new Set();
        requestAnimationFrame(render);
      }
    };
    $(".case-big-play", root).addEventListener("click", () => player.toggle());
    chips($(".case-speed", root), (b) => {
      rate = Number(b.dataset.rate);
      player.setTempo(piece.tempo * rate);
      updateBpm();
      render();
    });
    $$(".case-controls .hand", root).forEach((b) =>
      b.addEventListener("click", () => {
        const on = !b.classList.contains("on");
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
        const hand = Number(b.dataset.hand);
        fall.hidden[hand] = !on;
        player.setMute(hand, !on);
        render();
      }),
    );

    // Drag the waterfall to move the playback position.
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, beat: player.beat, was: player.playing };
      if (player.playing) player.pause();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const ppb = ((fall.hitY / 3.2) * 60) / player.bpm;
      player.seek(drag.beat + (e.clientY - drag.y) / ppb);
      render();
    });
    const end = () => {
      if (!drag) return;
      const moved = Math.abs(player.pos - drag.beat) > 0.05;
      if (moved ? drag.was : !drag.was) player.play();
      drag = null;
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    new IntersectionObserver(
      ([e]) => !e.isIntersecting && player.pause(),
    ).observe(root);

    select(list[0]);
  }

  /* ---------------- Play: free piano ---------------- */
  const CHORDS = [
    [[0, 4, 7], "", "大三和弦"],
    [[0, 3, 7], "m", "小三和弦"],
    [[0, 4, 7, 10], "7", "属七和弦"],
    [[0, 4, 7, 11], "maj7", "大七和弦"],
    [[0, 3, 7, 10], "m7", "小七和弦"],
    [[0, 3, 6], "°", "减三和弦"],
    [[0, 3, 6, 9], "°7", "减七和弦"],
    [[0, 5, 7], "sus4", "挂四和弦"],
    [[0, 4, 8], "+", "增三和弦"],
  ];
  const INTERVALS = [
    "纯八度",
    "小二度",
    "大二度",
    "小三度",
    "大三度",
    "纯四度",
    "三全音",
    "纯五度",
    "小六度",
    "大六度",
    "小七度",
    "大七度",
  ];
  function chordName(midis) {
    const sorted = [...midis].sort((a, b) => a - b);
    if (sorted.length === 2)
      return `${INTERVALS[(sorted[1] - sorted[0]) % 12]}`;
    const pcs = [...new Set(sorted.map(pcOf))];
    if (pcs.length < 3) return "";
    for (const root of pcs) {
      const rel = pcs
        .map((p) => (p - root + 12) % 12)
        .sort((a, b) => a - b)
        .join(",");
      const hit = CHORDS.find(([iv]) => iv.join(",") === rel);
      if (hit) return `${SHARPS[root]}${hit[1]} · ${hit[2]}`;
    }
    return "";
  }

  function liveScore(staffHost, jpHost) {
    return (notes) => {
      const width = Math.max(320, staffHost.clientWidth || 900);
      const MAX = clamp(Math.floor((width - 60) / 52), 6, 16);
      const shown = notes
        .slice(-MAX)
        .map((n, i) => ({ ...n, beat: i, dur: 1, hand: 0 }));
      const opts = { beats: MAX, beatsPerBar: 4, width, left: 50, barGap: 10 };
      const st = drawStaff(staffHost, shown, {
        ...opts,
        S: 9,
        padTop: 26,
        padBottom: 26,
      });
      st.root.setAttribute("preserveAspectRatio", "xMinYMid meet");
      const jp = drawJianpu(jpHost, shown, { ...opts, height: 64, fs: 22 });
      jp.root.setAttribute("preserveAspectRatio", "xMinYMid meet");
      const last = st.els[st.els.length - 1];
      last?.el.classList.add("on");
      jp.els[jp.els.length - 1]?.el.classList.add("on");
      st.root.classList.add("is-live");
      return { st, jp };
    };
  }

  function playActive(pane) {
    const section = $("#play");
    const r = section.getBoundingClientRect();
    return (
      pane.classList.contains("is-active") &&
      r.top < innerHeight * 0.7 &&
      r.bottom > innerHeight * 0.3
    );
  }
  const typing = (e) =>
    /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey;

  function initFree() {
    const pane = $('.pane[data-pane="free"]');
    const chordEl = $("#free-chord");
    const recBtn = $("#free-rec");
    const replayBtn = $("#free-replay");
    const draw = liveScore($("#free-staff"), $("#free-jianpu"));
    const held = new Map();
    let played = [];
    let base = 60;
    let rec = null;
    let take = [];
    const host = $("#free-keys");
    const span = () => (host.clientWidth >= 720 ? 24 : 12);
    const kb = new Keyboard(host, {
      lo: 60,
      hi: 84,
      labels: true,
      base,
      onDown: (m) => down(m),
      onUp: (m) => up(m),
    });
    const rebuild = () => {
      kb.build(base, base + span(), base);
      $("#oct-label").textContent =
        `${noteName(base)}–${noteName(base + span())}`;
    };
    rebuild();
    new ResizeObserver(() => {
      if (kb.hi - kb.lo !== span()) rebuild();
    }).observe(host);

    function down(m) {
      if (held.has(m)) return;
      const voice = Sound.piano(m, { dur: 8, vel: 0.68 });
      held.set(m, voice);
      kb.light(m, true);
      played.push({ midi: m });
      if (played.length > 64) played = played.slice(-32);
      draw(played);
      chordEl.textContent = chordName([...held.keys()]);
      if (rec) take.push({ t: performance.now() - rec, midi: m, on: true });
      const el = kb.keys.get(m);
      if (el) {
        const r = el.getBoundingClientRect();
        FX.burst(r.left + r.width / 2, r.top + 10, {
          count: 8,
          glyph: Math.random() < 0.3,
        });
      }
    }
    function up(m) {
      const v = held.get(m);
      if (!v) return;
      v.release();
      held.delete(m);
      kb.light(m, false);
      if (rec) take.push({ t: performance.now() - rec, midi: m, on: false });
      if (held.size === 0)
        setTimeout(() => !held.size && (chordEl.textContent = ""), 900);
      else chordEl.textContent = chordName([...held.keys()]);
    }

    const pressed = new Map();
    addEventListener("keydown", (e) => {
      if (typing(e) || !playActive(pane)) return;
      const k = e.key.toLowerCase();
      if (k === "z" || k === "x") {
        shift(k === "z" ? -12 : 12);
        return;
      }
      if (!(k in KEYMAP) || e.repeat) return;
      e.preventDefault();
      const m = base + KEYMAP[k];
      pressed.set(k, m);
      down(m);
    });
    addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      const m = pressed.get(k);
      if (m == null) return;
      pressed.delete(k);
      up(m);
    });
    const shift = (d) => {
      base = clamp(base + d, 36, 84);
      rebuild();
    };
    $("#oct-down").addEventListener("click", () => shift(-12));
    $("#oct-up").addEventListener("click", () => shift(12));
    $("#free-clear").addEventListener("click", () => {
      played = [];
      draw(played);
      chordEl.textContent = "";
    });
    recBtn.addEventListener("click", () => {
      if (rec) {
        rec = null;
        recBtn.classList.remove("is-recording");
        $("span", recBtn).textContent = "录音";
        replayBtn.disabled = !take.length;
      } else {
        take = [];
        rec = performance.now();
        recBtn.classList.add("is-recording");
        $("span", recBtn).textContent = "停止录音";
        replayBtn.disabled = true;
      }
    });
    replayBtn.addEventListener("click", () => {
      const ctx = Sound.init();
      if (!ctx || !take.length) return;
      const t0 = ctx.currentTime + 0.1;
      const start = take[0].t;
      take.forEach((ev, i) => {
        if (!ev.on) return;
        const off = take.slice(i + 1).find((x) => !x.on && x.midi === ev.midi);
        const dur = ((off ? off.t : ev.t + 400) - ev.t) / 1000;
        Sound.piano(ev.midi, {
          when: t0 + (ev.t - start) / 1000,
          dur: Math.max(0.1, dur),
          vel: 0.65,
        });
        setTimeout(() => kb.light(ev.midi, true), 100 + ev.t - start);
        setTimeout(
          () => kb.light(ev.midi, false),
          100 + ev.t - start + dur * 1000,
        );
      });
    });
    draw([]);
  }

  /* ---------------- Play: falling-notes game ---------------- */
  function initGame() {
    const pane = $('.pane[data-pane="game"]');
    const canvas = $(".game-canvas", pane);
    const overlay = $("#g-overlay");
    const judgeEl = $("#g-judge");
    const fall = new Waterfall(canvas, { labels: true });
    const elise = caseById("fur-elise");
    const accomp = (roots) =>
      roots.flatMap((pair, bar) =>
        pair.map((midi, i) => ({
          beat: bar * 4 + i * 2,
          dur: 2,
          midi,
          hand: 1,
          vel: 0.3,
        })),
      );
    const SONGS = [
      {
        id: "ode",
        name: "欢乐颂",
        level: "入门",
        notes: ODE,
        bass: accomp([
          [48, 48],
          [43, 43],
          [48, 48],
          [43, 43],
          [48, 48],
          [43, 43],
          [48, 48],
          [43, 48],
        ]),
      },
      {
        id: "twinkle",
        name: "小星星",
        level: "入门",
        notes: TWINKLE,
        bass: accomp([
          [48, 48],
          [41, 48],
          [41, 48],
          [43, 48],
          [48, 41],
          [48, 43],
          [48, 41],
          [48, 43],
          [48, 48],
          [41, 48],
          [41, 48],
          [43, 48],
        ]),
      },
    ];
    if (elise) {
      const all = elise.notes.map(([beat, dur, midi, hand, vel]) => ({
        beat,
        dur,
        midi,
        hand,
        vel,
      }));
      SONGS.push({
        id: "elise",
        name: "致爱丽丝",
        level: "挑战",
        notes: all.filter((n) => !n.hand),
        bass: all
          .filter((n) => n.hand)
          .map((n) => ({ ...n, vel: n.vel * 0.7 })),
        tempoScale: 0.75,
      });
    }
    let song = SONGS[0];
    let bpm = 96;
    let state = null;

    const songsEl = $("#game-songs");
    SONGS.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${s.name} · ${s.level}`;
      if (!i) b.classList.add("on");
      b.dataset.id = s.id;
      songsEl.appendChild(b);
    });
    chips(songsEl, (b) => {
      song = SONGS.find((s) => s.id === b.dataset.id);
      stop(true);
      prepare();
    });
    chips($("#game-speed"), (b) => {
      bpm = Number(b.dataset.bpm);
      stop(true);
      prepare();
    });

    const effBpm = () => Math.round(bpm * (song.tempoScale || 1));
    function prepare() {
      fall.notes = song.notes.map((n, id) => ({
        ...n,
        id,
        hand: 0,
        hit: undefined,
        done: false,
      }));
      const midis = fall.notes.map((n) => n.midi);
      fall.setRange(Math.min(60, ...midis), Math.max(...midis));
      fall.draw(-4, { bpm: effBpm() });
      hud(0, 0, null);
    }
    function hud(score, combo, acc) {
      $("#g-score").textContent = score;
      $("#g-combo").textContent = combo;
      $("#g-acc").textContent = acc == null ? "—" : `${acc}%`;
    }
    function judge(kind) {
      judgeEl.className = "game-judge";
      void judgeEl.offsetWidth;
      judgeEl.textContent = { perfect: "Perfect", good: "Good", miss: "Miss" }[
        kind
      ];
      judgeEl.classList.add(kind, "pop");
    }

    function start(demo) {
      const ctx = Sound.init();
      if (!ctx) return;
      Player.current?.pause();
      prepare();
      overlay.classList.add("is-hidden");
      const b = effBpm();
      const spb = 60 / b;
      Sound.ready().then(() => {
        const t0 = ctx.currentTime + 0.25 + 4 * spb; // four count-in clicks
        for (let i = 0; i < 4; i++) Sound.click(t0 - (4 - i) * spb, i === 0);
        const bass = song.bass.map((n) =>
          Sound.piano(n.midi, {
            when: t0 + n.beat * spb,
            dur: n.dur * spb,
            vel: n.vel,
            hand: 1,
          }),
        );
        state = {
          t0,
          spb,
          demo,
          score: 0,
          combo: 0,
          best: 0,
          counts: { perfect: 0, good: 0, miss: 0 },
          bass,
          end: song.notes[song.notes.length - 1].beat + 2,
        };
        if (demo) {
          state.auto = fall.notes.map((n) =>
            Sound.piano(n.midi, {
              when: t0 + n.beat * spb,
              dur: n.dur * spb * 0.95,
              vel: 0.62,
            }),
          );
        }
        frame.add(loop);
      });
    }
    function stop(silent) {
      if (!state) return;
      frame.remove(loop);
      const now = Sound.now;
      for (const v of [...state.bass, ...(state.auto || [])]) {
        if (!v) continue;
        if (v.start > now) v.cancel();
        else v.release();
      }
      const s = state;
      state = null;
      fall.flash.clear();
      if (silent) {
        overlay.classList.remove("is-hidden");
        overlay.innerHTML = intro;
        bindOverlay();
        return;
      }
      if (s.demo) {
        overlay.innerHTML = `<p class="go-title">看明白了？轮到你了</p><p class="go-sub">按键盘上对应的字母，或直接点屏幕下方的琴键。</p><div class="go-actions"><button class="btn btn-primary" id="g-start" type="button" data-silent>开始</button></div>`;
      } else {
        const total = song.notes.length;
        const acc = Math.round(
          ((s.counts.perfect + s.counts.good * 0.6) / total) * 100,
        );
        const grade =
          acc >= 95
            ? "S"
            : acc >= 85
              ? "A"
              : acc >= 70
                ? "B"
                : acc >= 50
                  ? "C"
                  : "D";
        overlay.innerHTML = `<p class="go-grade">${grade}</p><p class="go-title">${song.name} · ${effBpm()} BPM</p><p class="go-sub">准确率 ${acc}% · 最大连击 ${s.best} · Perfect ${s.counts.perfect} / Good ${s.counts.good} / Miss ${s.counts.miss}</p><p class="go-sub">太快就选「慢 70」——在乐谱里练琴也是这样：先降速，再循环。</p><div class="go-actions"><button class="btn btn-primary" id="g-start" type="button" data-silent>再来一次</button><button class="btn btn-glass" id="g-demo" type="button" data-silent>看演示</button></div>`;
        if (acc >= 85) {
          const r = canvas.getBoundingClientRect();
          for (let i = 0; i < 6; i++)
            setTimeout(
              () =>
                FX.burst(
                  r.left + r.width * Math.random(),
                  r.top + r.height * 0.4,
                  { count: 16, glyph: true, spread: 2 },
                ),
              i * 120,
            );
        }
      }
      overlay.classList.remove("is-hidden");
      bindOverlay();
    }
    const beatNow = () => (Sound.now - state.t0) / state.spb;
    const WIN_GOOD = 0.16;
    const WIN_PERFECT = 0.075;
    function loop() {
      if (!state) return;
      const beat = beatNow();
      const active = [];
      for (const n of fall.notes) {
        if (state.demo) {
          if (!n.done && beat >= n.beat) {
            n.done = true;
            n.hit = true;
            const c = fall.keyCenter(n.midi);
            if (c) FX.burst(c.x, c.y, { count: 6 });
          }
        } else if (!n.done && (beat - n.beat) * state.spb > WIN_GOOD) {
          n.done = true;
          n.hit = false;
          state.combo = 0;
          state.counts.miss += 1;
          judge("miss");
        }
        if (beat >= n.beat && beat < n.beat + n.dur && (state.demo || n.hit))
          active.push(n);
      }
      fall.draw(beat, { bpm: effBpm(), active });
      const judged =
        state.counts.perfect + state.counts.good + state.counts.miss;
      hud(
        state.score,
        state.combo,
        judged
          ? Math.round(
              ((state.counts.perfect + state.counts.good * 0.6) / judged) * 100,
            )
          : null,
      );
      if (beat > state.end) stop(false);
    }
    function press(m) {
      const voice = Sound.piano(m, { dur: 0.7, vel: 0.66 });
      fall.flash.set(m, 0);
      setTimeout(() => fall.flash.delete(m), 160);
      if (!state) {
        fall.draw(-4, { bpm: effBpm() });
        return voice;
      }
      if (state.demo) return voice;
      const beat = beatNow();
      let best = null;
      for (const n of fall.notes) {
        if (n.done || n.midi !== m) continue;
        const dt = Math.abs(n.beat - beat) * state.spb;
        if (dt <= WIN_GOOD && (!best || dt < best.dt)) best = { n, dt };
      }
      if (best) {
        best.n.done = true;
        best.n.hit = true;
        const kind = best.dt <= WIN_PERFECT ? "perfect" : "good";
        state.counts[kind] += 1;
        state.combo += 1;
        state.best = Math.max(state.best, state.combo);
        state.score +=
          (kind === "perfect" ? 100 : 60) + Math.min(state.combo, 30) * 2;
        judge(kind);
        const c = fall.keyCenter(m);
        if (c) {
          FX.burst(c.x, c.y, {
            count: kind === "perfect" ? 14 : 8,
            glyph: kind === "perfect",
          });
          FX.ring(c.x, c.y);
        }
      }
      return voice;
    }

    canvas.addEventListener("pointerdown", (e) => {
      const r = canvas.getBoundingClientRect();
      const m = fall.keyAt(e.clientX - r.left, e.clientY - r.top);
      if (m != null) press(m);
    });
    const keysDown = new Set();
    addEventListener("keydown", (e) => {
      if (typing(e) || !playActive(pane)) return;
      const k = e.key.toLowerCase();
      if (!(k in KEYMAP)) return;
      e.preventDefault();
      if (e.repeat || keysDown.has(k)) return;
      keysDown.add(k);
      press(60 + KEYMAP[k]);
    });
    addEventListener("keyup", (e) => keysDown.delete(e.key.toLowerCase()));

    const intro = overlay.innerHTML;
    function bindOverlay() {
      $("#g-start")?.addEventListener("click", () => start(false));
      $("#g-demo")?.addEventListener("click", () => start(true));
    }
    bindOverlay();
    fall.redraw = () =>
      !state && fall.notes.length && fall.draw(-4, { bpm: effBpm() });
    prepare();
    return { stop: () => stop(true) };
  }

  /* ---------------- Play: humming ---------------- */
  function initHum() {
    const canvas = $(".hum-canvas");
    const g = canvas.getContext("2d");
    const noteEl = $("#hum-note");
    const hzEl = $("#hum-hz");
    const startBtn = $("#hum-start");
    const playBtn = $("#hum-play");
    const draw = liveScore($("#hum-staff"), $("#hum-jianpu"));
    let stream = null;
    let analyser = null;
    let buf = null;
    let trace = [];
    let notes = [];
    let cur = null;
    let silent = 0;
    let shift = 0;
    const LO = 45;
    const HI = 84;

    function size() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, r.width * dpr);
      canvas.height = Math.max(1, r.height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintTrace();
    }
    new ResizeObserver(size).observe(canvas);

    // McLeod normalised square difference on a 2× decimated frame.
    function pitch(data, rate) {
      const n = data.length >> 1;
      const x = new Float32Array(n);
      let rms = 0;
      for (let i = 0; i < n; i++) {
        x[i] = (data[2 * i] + data[2 * i + 1]) / 2;
        rms += x[i] * x[i];
      }
      rms = Math.sqrt(rms / n);
      if (rms < 0.012) return null;
      const sr = rate / 2;
      const minLag = Math.floor(sr / 1000);
      const maxLag = Math.min(Math.floor(sr / 75), n - 1);
      const nsdf = new Float32Array(maxLag + 2);
      for (let lag = minLag; lag <= maxLag; lag++) {
        let acf = 0;
        let m = 0;
        for (let i = 0; i < n - lag; i++) {
          acf += x[i] * x[i + lag];
          m += x[i] * x[i] + x[i + lag] * x[i + lag];
        }
        nsdf[lag] = m ? (2 * acf) / m : 0;
      }
      let max = 0;
      const peaks = [];
      for (let lag = minLag + 1; lag < maxLag; lag++) {
        if (
          nsdf[lag] > 0 &&
          nsdf[lag] >= nsdf[lag - 1] &&
          nsdf[lag] > nsdf[lag + 1]
        ) {
          peaks.push(lag);
          max = Math.max(max, nsdf[lag]);
        }
      }
      if (max < 0.72) return null;
      const lag = peaks.find((l) => nsdf[l] >= max * 0.9);
      const a = nsdf[lag - 1];
      const b = nsdf[lag];
      const c = nsdf[lag + 1];
      const shiftLag = (a - c) / (2 * (a - 2 * b + c) || 1);
      return sr / (lag + shiftLag);
    }

    function paintTrace() {
      const r = canvas.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      g.clearRect(0, 0, w, h);
      const yOf = (m) => h - 14 - ((m - LO) / (HI - LO)) * (h - 28);
      g.font = "10px SF Mono, Menlo, monospace";
      for (let m = LO; m <= HI; m++) {
        const y = yOf(m);
        g.fillStyle =
          pcOf(m) === 0
            ? "rgba(255,255,255,0.12)"
            : isBlack(m)
              ? "rgba(255,255,255,0.02)"
              : "rgba(255,255,255,0.05)";
        g.fillRect(40, y, w - 40, 1);
        if (pcOf(m) === 0) {
          g.fillStyle = "rgba(255,255,255,0.4)";
          g.fillText(noteName(m), 6, y + 3);
        }
      }
      const now = performance.now();
      const pps = 90;
      const xOf = (t) => w - 20 - ((now - t) / 1000) * pps;
      for (const n of notes) {
        const x1 = xOf(n.t0);
        const x2 = xOf(n.t1 ?? now);
        if (x2 < 40) continue;
        g.fillStyle = "rgba(70,240,184,0.22)";
        roundRect(
          g,
          Math.max(40, x1),
          yOf(n.midi) - 6,
          x2 - Math.max(40, x1),
          12,
          6,
        );
        g.fill();
      }
      g.strokeStyle = "#46f0b8";
      g.lineWidth = 2.5;
      g.shadowColor = "#46f0b8";
      g.shadowBlur = 10;
      g.beginPath();
      let pen = false;
      for (const p of trace) {
        const x = xOf(p.t);
        if (x < 40 || p.m == null) {
          pen = false;
          continue;
        }
        const y = yOf(clamp(p.m, LO, HI));
        if (pen) g.lineTo(x, y);
        else g.moveTo(x, y);
        pen = true;
      }
      g.stroke();
      g.shadowBlur = 0;
    }

    function commit() {
      if (!cur) return;
      cur.t1 = performance.now();
      if (cur.t1 - cur.t0 < 120) {
        notes.pop();
      } else {
        const median = notes.map((n) => n.midi).sort((a, b) => a - b)[
          notes.length >> 1
        ];
        shift = 12 * Math.round((71 - median) / 12);
        draw(notes.map((n) => ({ midi: n.midi + shift })));
        playBtn.disabled = false;
      }
      cur = null;
    }

    function loop() {
      if (!analyser) return;
      analyser.getFloatTimeDomainData(buf);
      const f = pitch(buf, Sound.ctx.sampleRate);
      const now = performance.now();
      const m = f ? 69 + 12 * Math.log2(f / 440) : null;
      trace.push({ t: now, m });
      trace = trace.filter((p) => now - p.t < 9000);
      if (m != null && m > LO - 6 && m < HI + 6) {
        const r = Math.round(m);
        noteEl.textContent = noteName(r);
        hzEl.textContent = `${f.toFixed(1)} Hz`;
        silent = 0;
        if (!cur || Math.abs(m - cur.mf) > 0.75) {
          if (cur && cur.pending > 0 && Math.abs(m - cur.pendingM) < 0.6)
            cur.pending += 1;
          else if (cur) {
            cur.pending = 1;
            cur.pendingM = m;
          }
          if (!cur || cur.pending >= 4) {
            commit();
            cur = { midi: r, mf: m, t0: now, pending: 0 };
            notes.push(cur);
            if (notes.length > 40) notes.shift();
          }
        } else {
          cur.mf = cur.mf * 0.85 + m * 0.15;
          cur.midi = Math.round(cur.mf);
          cur.pending = 0;
        }
      } else {
        silent += 1;
        if (silent > 6) {
          commit();
          noteEl.textContent = "—";
          hzEl.textContent = "在听…";
        }
      }
      paintTrace();
    }

    async function start() {
      const ctx = Sound.init();
      if (!ctx) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        hzEl.textContent = "这个浏览器不支持麦克风";
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch {
        hzEl.textContent = "没有拿到麦克风权限";
        return;
      }
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      buf = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      startBtn.textContent = "关闭麦克风";
      hzEl.textContent = "在听…";
      frame.add(loop);
    }
    function stop() {
      frame.remove(loop);
      commit();
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      analyser = null;
      startBtn.textContent = "打开麦克风";
      noteEl.textContent = "—";
      hzEl.textContent = notes.length
        ? `记下 ${notes.length} 个音`
        : "等待声音";
    }
    startBtn.addEventListener("click", () => (stream ? stop() : start()));
    playBtn.addEventListener("click", () => {
      const ctx = Sound.init();
      if (!ctx || !notes.length) return;
      if (stream) stop();
      const first = notes[0].t0;
      const at = ctx.currentTime + 0.1;
      notes.forEach((n) =>
        Sound.piano(n.midi + shift, {
          when: at + (n.t0 - first) / 1000,
          dur: Math.max(0.15, ((n.t1 ?? n.t0 + 300) - n.t0) / 1000),
          vel: 0.62,
        }),
      );
    });
    $("#hum-clear").addEventListener("click", () => {
      notes = [];
      trace = [];
      cur = null;
      draw([]);
      playBtn.disabled = true;
      paintTrace();
    });
    draw([]);
    return { stop: () => stream && stop() };
  }

  function initPlay() {
    initFree();
    const game = initGame();
    const hum = initHum();
    const panes = $$(".pane");
    seg($(".play-tabs"), (b) => {
      panes.forEach((p) =>
        p.classList.toggle("is-active", p.dataset.pane === b.dataset.pane),
      );
      Player.current?.pause();
      game.stop();
      hum.stop();
    });
  }

  /* ---------------- Boot ---------------- */
  initChrome();
  // Each section starts on its own, so one failing demo never takes the rest of the page down.
  const boot = () => {
    for (const init of [
      initStrings,
      initStory,
      initViews,
      initTempo,
      initHands,
      initLoop,
      initTranspose,
      initChords,
      initEffects,
      initMode,
      initPrint,
      initCases,
      initPlay,
    ]) {
      try {
        init();
      } catch (err) {
        console.error(`${init.name} failed`, err);
      }
    }
  };
  // Glyph metrics come from Bravura, so draw once it is ready (or after a short wait).
  if (document.fonts?.load) {
    Promise.race([
      document.fonts.load('40px "Bravura"', ""),
      new Promise((r) => setTimeout(r, 1500)),
    ]).then(boot, boot);
  } else boot();
})();
