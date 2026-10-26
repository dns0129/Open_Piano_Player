/* 乐谱 promo site: sound, playback, notation, the MusicXML → MIDI converter and the page artwork. */
(() => {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const SVGNS = "http://www.w3.org/2000/svg";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SCORES = window.LEPU_SCORES || {};
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

  function svg(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const key in attrs) el.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function text(parent, str, x, y, attrs = {}) {
    const t = svg("text", { x, y, ...attrs }, parent);
    t.textContent = str;
    return t;
  }
  const unpack = (rows) =>
    rows.map(([beat, dur, midi, hand, vel]) => ({
      beat,
      dur,
      midi,
      hand,
      vel,
    }));

  const pcOf = (m) => ((m % 12) + 12) % 12;
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(pcOf(m));
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

    // Fetching needs no user gesture, so the bytes are usually here before the first click.
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
        bus = ctx.createGain();
        bus.gain.value = 0.8;
        const verb = ctx.createConvolver();
        verb.buffer = impulse(2.6);
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
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        for (const [type, mul, amp] of [
          ["triangle", 1, 1],
          ["sine", 2, 0.3],
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
      for (const fn of listeners) fn({ time: t, vel });
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

    function setEnabled(on) {
      enabled = on;
      store.set("lepu-sound", on ? "on" : "off");
      if (out) out.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.03);
    }

    return {
      init,
      unlock,
      piano,
      setEnabled,
      onNote: (fn) => listeners.add(fn),
      ready: () => decoding || Promise.resolve(),
      get now() {
        return ctx ? ctx.currentTime : 0;
      },
      get enabled() {
        return enabled;
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
      let seg = this.segs[0];
      for (const s of this.segs) if (s.t <= now) seg = s;
      return seg.b + ((now - seg.t) * this.bpm) / 60;
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
        new Promise((r) => setTimeout(r, 1500)),
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

  /* ---------------- Notation ---------------- */
  const GL = {
    gclef: "",
    fclef: "",
    whole: "",
    half: "",
    black: "",
    flag8u: "",
    flag8d: "",
    sharp: "",
    digits: (n) =>
      [...String(n)]
        .map((d) => String.fromCharCode(0xe080 + Number(d)))
        .join(""),
  };

  function spell(midi) {
    const pc = pcOf(midi);
    const L = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
    const A = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
    return { step: (Math.floor(midi / 12) - 1) * 7 + L[pc], acc: A[pc] };
  }

  function layout({ beats, beatsPerBar = 4, width, left, right, barGap }) {
    const barCount = Math.max(1, Math.ceil(beats / beatsPerBar - 1e-9));
    const ppb = (width - left - right - barGap * (barCount - 1)) / beats;
    const xAt = (b) =>
      left +
      b * ppb +
      Math.floor(clamp(b, 0, beats - 1e-6) / beatsPerBar + 1e-9) * barGap;
    const barX = (k) =>
      k >= barCount ? width - right : xAt(k * beatsPerBar) - barGap / 2;
    return { ppb, xAt, barX, barCount, beats };
  }
  const glyph = (parent, ch, x, y, S, cls = "glyph") =>
    text(parent, ch, x, y, { class: `glyph ${cls}`, "font-size": S * 4 });
  const addPlayhead = (root, y1, y2) =>
    svg("line", { class: "playhead", x1: 0, x2: 0, y1, y2 }, root);

  // Treble or grand staff. Notes in the same beat and hand are drawn as one chord.
  function drawStaff(host, notes, o) {
    const S = o.S || 9;
    const width = o.width;
    const grand = o.clef === "grand";
    const T = o.padTop ?? 4.6 * S;
    const B = grand ? T + 9 * S : T;
    const height = B + 4 * S + (o.padBottom ?? 4.6 * S);
    const right = 1.2 * S;
    const L = layout({
      beats: o.beats,
      width,
      left: o.timeSig ? 6.6 * S : 4.4 * S,
      right,
      barGap: 1.4 * S,
    });
    const root = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: `notation ${o.className || ""}`,
    });
    for (const [clef, y0] of grand
      ? [
          ["treble", T],
          ["bass", B],
        ]
      : [["treble", T]]) {
      for (let i = 0; i < 5; i++)
        svg(
          "line",
          {
            class: "staff-line",
            x1: S * 0.4,
            x2: width - right,
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
    const yBottom = B + 4 * S;
    for (let k = 0; k <= L.barCount; k++) {
      const x = k === 0 ? S * 0.4 : L.barX(k);
      svg(
        "line",
        { class: "bar-line", x1: x, x2: x, y1: T, y2: yBottom },
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
    const items = [...groups.values()].map((chord) => {
      const n0 = chord[0];
      const bass = grand && n0.hand;
      const y0 = bass ? B : T;
      const heads = chord
        .map((n) => {
          const sp = spell(n.midi);
          const p = sp.step - (bass ? 18 : 30);
          return { p, acc: sp.acc, y: y0 + 4 * S - (p * S) / 2 };
        })
        .sort((a, b) => a.p - b.p);
      const avg = heads.reduce((s, h) => s + h.p, 0) / heads.length;
      return {
        chord,
        heads,
        y0,
        x: L.xAt(n0.beat) + pad,
        beat: n0.beat,
        hand: grand ? n0.hand || 0 : 0,
        dur: Math.max(...chord.map((n) => n.dur)),
        up: avg < 4,
      };
    });

    // Beam consecutive eighths in the same beat and hand.
    const beamed = new Map();
    const short = items
      .filter((it) => it.dur <= 0.5 && it.chord.length === 1)
      .sort((a, b) => a.beat - b.beat);
    for (let i = 0; i < short.length;) {
      const g = [short[i]];
      while (
        i + g.length < short.length &&
        Math.floor(short[i + g.length].beat + 1e-6) ===
          Math.floor(short[i].beat + 1e-6) &&
        short[i + g.length].hand === short[i].hand
      )
        g.push(short[i + g.length]);
      if (g.length > 1) {
        const up = g.reduce((s, it) => s + it.heads[0].p, 0) / g.length < 4;
        const ys = g.map((it) => it.heads[0].y);
        const yb = up ? Math.min(...ys) - 3.3 * S : Math.max(...ys) + 3.3 * S;
        for (const it of g) Object.assign(it, { up, stemEnd: yb });
        beamed.set(g[0], { g, up, yb });
        for (const it of g.slice(1)) beamed.set(it, null);
      }
      i += g.length;
    }

    const hw = 1.18 * S;
    const els = items.map((it) => {
      const g = svg("g", { class: "n" }, root);
      const { heads, x, dur, up, y0 } = it;
      svg(
        "ellipse",
        {
          class: "halo",
          cx: x + hw / 2,
          cy: (heads[0].y + heads[heads.length - 1].y) / 2,
          rx: 1.4 * S,
          ry: 1.1 * S + (heads[heads.length - 1].y - heads[0].y) / 2,
        },
        g,
      );
      for (const h of heads) {
        if (h.acc) glyph(g, GL.sharp, x - 1.25 * S, h.y, S);
        for (let q = -2; q >= h.p; q -= 2) {
          const ly = y0 + 4 * S - (q * S) / 2;
          svg(
            "line",
            {
              class: "stem",
              x1: x - 0.45 * S,
              x2: x + hw + 0.45 * S,
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
              x1: x - 0.45 * S,
              x2: x + hw + 0.45 * S,
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
          x,
          h.y,
          S,
        );
        if ([0.75, 1.5, 3].includes(dur))
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
        const near = up ? heads[0].y : heads[heads.length - 1].y;
        const far = up ? heads[heads.length - 1].y : heads[0].y;
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
        it.sx = sx;
        if (!beamed.has(it) && dur <= 0.75)
          glyph(g, up ? GL.flag8u : GL.flag8d, sx - 0.06 * S, endY, S);
      }
      return { el: g, beat: it.beat, dur };
    });
    for (const [first, beam] of beamed) {
      if (!beam) continue;
      const last = beam.g[beam.g.length - 1];
      const th = 0.5 * S;
      svg(
        "rect",
        {
          x: first.sx,
          y: beam.up ? beam.yb : beam.yb - th,
          width: Math.max(0, last.sx - first.sx + 0.13 * S),
          height: th,
        },
        els[items.indexOf(first)].el,
      );
    }
    const playhead = addPlayhead(root, T - 2 * S, yBottom + 2 * S);
    host.replaceChildren(root);
    return { root, els, L, playhead };
  }

  // Numbered notation for one hand.
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
  function drawJianpu(host, notes, o) {
    const width = o.width;
    const height = o.height || 70;
    const fs = o.fs || 22;
    const L = layout({
      beats: o.beats,
      width,
      left: 56,
      right: 14,
      barGap: 12,
    });
    const root = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: `notation ${o.className || ""}`,
    });
    const y = height * 0.56;
    if (o.label) text(root, o.label, 6, y - 4, { class: "roll-label" });
    for (let k = 0; k <= L.barCount; k++) {
      const x = k === 0 ? 48 : L.barX(k);
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
    const list = notes
      .filter((n) => (n.hand || 0) === (o.hand || 0))
      .sort((a, b) => a.beat - b.beat);
    const els = list.map((n, i) => {
      const rel = n.midi - 60;
      const oct = Math.floor(rel / 12);
      const [digit, acc] = DEG[pcOf(rel)];
      const x = L.xAt(n.beat) + pad;
      const g = svg("g", { class: "jp" }, root);
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
      for (let k = 0; k < lines; k++)
        svg(
          "line",
          {
            x1: x - fs * 0.32,
            x2,
            y1: y + 5 + k * 4,
            y2: y + 5 + k * 4,
            stroke: "currentColor",
            "stroke-width": 1.6,
          },
          g,
        );
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
      if (n.dur !== 1.5)
        for (let k = 1; k < Math.round(n.dur); k++)
          text(g, "–", L.xAt(n.beat + k) + pad, y - 2, {
            "font-size": fs,
            "text-anchor": "middle",
          });
      return { el: g, beat: n.beat, dur: n.dur };
    });
    const playhead = addPlayhead(root, 6, height - 6);
    host.replaceChildren(root);
    return { root, els, L, playhead };
  }

  function drawRoll(host, notes, o) {
    const { width, height, beats } = o;
    const L = layout({
      beats,
      beatsPerBar: o.beatsPerBar || 4,
      width,
      left: 6,
      right: 6,
      barGap: 0,
    });
    const midis = notes.map((n) => n.midi);
    const lo = Math.min(...midis) - 1;
    const hi = Math.max(...midis) + 1;
    const rowH = (height - 12) / (hi - lo + 1);
    const root = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: "notation",
      preserveAspectRatio: "none",
    });
    for (let m = lo; m <= hi; m++)
      if (isBlack(m))
        svg(
          "rect",
          {
            class: "roll-row",
            x: 0,
            y: 6 + (hi - m) * rowH,
            width,
            height: rowH,
          },
          root,
        );
    const els = notes.map((n) => {
      const el = svg(
        "rect",
        {
          class: `roll-note ${n.hand ? "l" : "r"}`,
          x: L.xAt(n.beat) + 1,
          y: 6 + (hi - n.midi) * rowH + 0.5,
          width: Math.max(2.5, n.dur * L.ppb - 2),
          height: Math.max(2, rowH - 1),
          rx: 2,
        },
        root,
      );
      return { el, beat: n.beat, dur: n.dur, hand: n.hand };
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
        .slice(0, 60) || "乐谱"
    }.mid`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  window.LepuConvert = { parseMusicXML, writeMidi };

  /* ---------------- Page chrome ---------------- */
  function initChrome() {
    const unlock = () => Sound.unlock();
    for (const type of ["pointerdown", "keydown", "touchend"])
      addEventListener(type, unlock, { capture: true });

    const toggle = $("#sound-toggle");
    const sync = () => {
      toggle.setAttribute("aria-pressed", String(Sound.enabled));
      $(".sound-label", toggle).textContent = Sound.enabled
        ? "声音开"
        : "声音关";
    };
    sync();
    toggle.addEventListener("click", () => {
      Sound.setEnabled(!Sound.enabled);
      sync();
    });

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
        `${Math.min(siblings.indexOf(el), 4) * 0.1}s`,
      );
      io.observe(el);
    });

    const links = $$(".nav-links a");
    const pill = $(".nav-pill");
    const sections = links.map((a) => $(a.getAttribute("href")));
    let current;
    const place = (a) => {
      links.forEach((l) => l.classList.toggle("is-active", l === a));
      pill.style.opacity = a ? "1" : "0";
      if (!a) return;
      pill.style.width = `${a.offsetWidth}px`;
      pill.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    const onScroll = () => {
      const y = innerHeight * 0.4;
      const i = sections.findIndex((s) => {
        const r = s.getBoundingClientRect();
        return r.top <= y && r.bottom > y;
      });
      if (links[i] !== current) place((current = links[i]));
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", () => place(current));
    onScroll();

    // Stage lighting: the cool (digital) light swells with every note; both lights follow the cursor a little.
    const backdrop = $(".backdrop");
    const lights = $$(".light", backdrop);
    let energy = 0;
    const decay = () => {
      energy *= 0.93;
      backdrop.style.setProperty(
        "--energy",
        energy < 0.004 ? "0" : energy.toFixed(3),
      );
      if (energy < 0.004) frame.remove(decay);
    };
    Sound.onNote(({ time, vel }) => {
      if (reduceMotion) return;
      setTimeout(
        () => {
          energy = Math.min(1, energy + vel * 0.14);
          frame.add(decay);
        },
        Math.max(0, (time - Sound.now) * 1000),
      );
    });
    addEventListener(
      "pointermove",
      (e) => {
        if (reduceMotion) return;
        lights.forEach((l, i) => {
          l.style.setProperty(
            "--px",
            `${(e.clientX / innerWidth - 0.5) * (i ? -30 : 30)}px`,
          );
          l.style.setProperty(
            "--py",
            `${(e.clientY / innerHeight - 0.5) * (i ? -24 : 24)}px`,
          );
        });
      },
      { passive: true },
    );
  }

  function seg(root, onSelect) {
    const pill = $(".seg-pill", root);
    const buttons = $$("button", root);
    const place = () => {
      const b = buttons.find((x) => x.getAttribute("aria-selected") === "true");
      pill.style.width = `${b.offsetWidth}px`;
      pill.style.transform = `translateX(${b.offsetLeft}px)`;
    };
    buttons.forEach((b) =>
      b.addEventListener("click", () => {
        buttons.forEach((x) =>
          x.setAttribute("aria-selected", String(x === b)),
        );
        place();
        onSelect(b.dataset.view);
      }),
    );
    new ResizeObserver(place).observe(root);
  }

  /* ---------------- Hero: the page, a reading light, and a river of MIDI ---------------- */
  // A soft light moves across the real 《致爱丽丝》 page bar by bar; each note it passes leaves the
  // paper as a streak of light and travels right as a MIDI bar (right hand jade, left hand gold).
  function initHero() {
    const S = SCORES.elise;
    const stage = $("#stage");
    const front = $(".page.front", stage);
    const canvas = $(".river", stage);
    if (!S || !stage) return;
    const g = canvas.getContext("2d");
    const notes = unpack(S.notes);
    const L = S.beats;
    const lo = Math.min(...notes.map((n) => n.midi));
    const hi = Math.max(...notes.map((n) => n.midi));
    let W = 0;
    let H = 0;
    let dpr = 1;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width;
      H = r.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    };
    new ResizeObserver(resize).observe(stage);
    resize();

    const player = new Player({ notes, bpm: S.bpm });
    const btn = $("#hero-play");
    player.onState = (on) => {
      btn.classList.toggle("is-playing", on);
      $("span", btn).textContent = on ? "暂停" : "听这一页";
    };
    btn.addEventListener("click", () => player.toggle());

    const reading = (beat) => {
      const sys =
        S.systems.find((s) => beat >= s.from && beat < s.to) ||
        S.systems[S.systems.length - 1];
      const k = clamp((beat - sys.from) / (sys.to - sys.from), 0, 1);
      return {
        x: sys.x[0] + k * (sys.x[1] - sys.x[0]),
        y: (sys.top + sys.bottom) / 2,
      };
    };
    const streaks = [];
    let idle = 0;
    let last = 0;
    let lastT = performance.now();
    let visible = true;

    function draw(t) {
      const dt = Math.min(0.1, (t - lastT) / 1000);
      lastT = t;
      let beat;
      if (player.playing && !player.starting) beat = idle = player.beat;
      else beat = idle = (idle + (dt * S.bpm) / 60) % L;
      const here = reading(beat);
      front.style.setProperty("--lx", `${(here.x * 100).toFixed(2)}%`);
      front.style.setProperty("--ly", `${(here.y * 100).toFixed(2)}%`);

      const sr = stage.getBoundingClientRect();
      const fr = front.getBoundingClientRect();
      const x0 = fr.right - sr.left - 6;
      const cy = fr.top - sr.top + fr.height * 0.36;
      const band = Math.min(H * 0.62, 320);
      const yOf = (m) => cy + band / 2 - ((m - lo) / (hi - lo || 1)) * band;
      const ppb = Math.max(46, (W - x0) / 5.5);
      const px = fr.left - sr.left + here.x * fr.width;
      const py = fr.top - sr.top + here.y * fr.height;

      // Notes the light just passed leave the page.
      const wrapped = beat < last;
      for (const n of notes) {
        const crossed = wrapped
          ? n.beat >= last || n.beat < beat
          : n.beat >= last && n.beat < beat;
        if (crossed && !reduceMotion)
          streaks.push({
            x: px + (Math.random() - 0.5) * 18,
            y: py + (Math.random() - 0.5) * 14,
            m: n.midi,
            hand: n.hand,
            life: 1,
          });
      }
      last = beat;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      // five faint guide lines: the staff the notes came from, stretched into MIDI lanes
      for (let i = 0; i < 5; i++) {
        const gy = cy - band / 2 + (band * (i + 0.5)) / 5;
        const guide = g.createLinearGradient(x0, 0, W, 0);
        guide.addColorStop(0, "rgba(243,220,166,0.16)");
        guide.addColorStop(1, "rgba(243,220,166,0)");
        g.fillStyle = guide;
        g.fillRect(x0, gy, W - x0, 1);
      }
      g.globalCompositeOperation = "lighter";
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i];
        s.life -= dt * 2.2;
        if (s.life <= 0) {
          streaks.splice(i, 1);
          continue;
        }
        const ty = yOf(s.m);
        const grad = g.createLinearGradient(s.x, s.y, x0, ty);
        const c = s.hand ? "217,180,108" : "95,227,184";
        grad.addColorStop(0, `rgba(${c},0)`);
        grad.addColorStop(1, `rgba(${c},${0.7 * s.life})`);
        g.strokeStyle = grad;
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(s.x, s.y);
        g.quadraticCurveTo((s.x + x0) / 2, Math.min(s.y, ty) - 30, x0, ty);
        g.stroke();
      }
      for (const n of notes) {
        for (let k = 0; k < 3; k++) {
          const age = beat - (n.beat - k * L);
          if (age < 0) continue;
          const head = x0 + age * ppb;
          if (head - n.dur * ppb > W) continue;
          const tail = Math.max(x0, head - Math.max(0.12, n.dur) * ppb + 2);
          const fade = clamp(1 - (head - x0) / (W - x0 + 1), 0, 1);
          const live = age < n.dur;
          const y = yOf(n.midi);
          const h = n.hand ? 7 : 6;
          g.globalAlpha = (live ? 1 : 0.85) * (0.3 + 0.7 * fade);
          g.shadowColor = n.hand ? "#d9b46c" : "#5fe3b8";
          g.shadowBlur = live ? 22 : 10;
          g.fillStyle = live ? "#fff6dc" : n.hand ? "#d9b46c" : "#5fe3b8";
          g.beginPath();
          if (g.roundRect)
            g.roundRect(tail, y - h / 2, Math.max(2, head - tail), h, h / 2);
          else g.rect(tail, y - h / 2, Math.max(2, head - tail), h);
          g.fill();
        }
      }
      g.globalAlpha = 1;
      g.shadowBlur = 0;
      // the seam where paper becomes MIDI
      const seam = g.createLinearGradient(
        0,
        cy - band / 2 - 20,
        0,
        cy + band / 2 + 20,
      );
      seam.addColorStop(0, "rgba(95,227,184,0)");
      seam.addColorStop(0.5, "rgba(159,243,255,0.5)");
      seam.addColorStop(1, "rgba(95,227,184,0)");
      g.fillStyle = seam;
      g.fillRect(x0 - 0.5, cy - band / 2 - 20, 1.5, band + 40);
    }
    const run = (t) => visible && draw(t);
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) {
        lastT = performance.now();
        frame.add(run);
      } else frame.remove(run);
    }).observe(stage);

    // The pages lean a little toward the cursor.
    const hero = $(".hero");
    hero.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || reduceMotion) return;
      const r = hero.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      for (const p of $$(".page", stage)) {
        p.style.setProperty("--tx", `${dx * 18}px`);
        p.style.setProperty("--ty", `${dy * 14}px`);
      }
    });
  }

  /* ---------------- 01 Score photo → MIDI ---------------- */
  function initOcr() {
    const S = SCORES.chopin;
    if (!S) return;
    const photo = $(".photo");
    const status = $("#ocr-status");
    const runBtn = $("#ocr-run");
    const playBtn = $("#ocr-play");
    const dlBtn = $("#ocr-download");
    const notes = unpack(S.notes);
    const boxes = S.systems.map((s, i) => {
      const box = document.createElement("div");
      box.className = "sys-box";
      box.style.top = `${s.top * 100}%`;
      box.style.height = `${(s.bottom - s.top) * 100}%`;
      box.innerHTML = `<span>第 ${i + 1} 行 · 复读一致</span>`;
      $(".sys-boxes", photo).appendChild(box);
      return box;
    });
    const roll = drawRoll($(".ocr-roll"), notes, {
      width: 560,
      height: 250,
      beats: S.beats,
      beatsPerBar: 3,
    });
    const player = new Player({ notes, bpm: S.bpm });
    const tick = () => {
      const beat = player.beat;
      const live = player.playing;
      paint(roll, beat, live);
      S.systems.forEach((s, i) =>
        boxes[i].classList.toggle(
          "playing",
          live && beat >= s.from && beat < s.to,
        ),
      );
    };
    player.onState = (on) => {
      playBtn.classList.toggle("is-playing", on);
      $("span", playBtn).textContent = on ? "暂停" : "播放 MIDI";
      if (on) frame.add(tick);
      else {
        frame.remove(tick);
        requestAnimationFrame(tick);
      }
    };
    new IntersectionObserver(
      ([e]) => !e.isIntersecting && player.pause(),
    ).observe(photo);

    const sweep = (from, to, ms) =>
      new Promise((done) => {
        const t0 = performance.now();
        const step = (t) => {
          const k = clamp((t - t0) / ms, 0, 1);
          const y =
            from +
            (to - from) *
              (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
          photo.style.setProperty("--scan", `${y * 100}%`);
          photo.style.setProperty("--reveal", `${y * 100}%`);
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let running = false;
    runBtn.addEventListener("click", async () => {
      if (running) return;
      running = true;
      player.pause();
      runBtn.disabled = playBtn.disabled = dlBtn.disabled = true;
      roll.els.forEach((e) => e.el.classList.remove("shown"));
      boxes.forEach((b) => b.classList.remove("read"));
      photo.style.setProperty("--reveal", "0%");
      photo.dataset.state = "scanning";
      await wait(900);
      let at = 0;
      for (const [i, s] of S.systems.entries()) {
        status.textContent = `正在识别第 ${i + 1} 行…`;
        await sweep(at, s.bottom, reduceMotion ? 50 : 1500);
        at = s.bottom;
        boxes[i].classList.add("read");
        const fresh = roll.els.filter((e) => e.beat >= s.from && e.beat < s.to);
        fresh.forEach((e, k) =>
          setTimeout(() => e.el.classList.add("shown"), k * 8),
        );
        status.innerHTML = `第 ${i + 1} 行 · 识别完成 · <b>复读一致</b>`;
        await wait(fresh.length * 8 + 250);
      }
      await sweep(at, 1, 300);
      const right = notes.filter((n) => !n.hand).length;
      status.innerHTML = `完成：16 小节 · 右手 ${right} 个音 · 左手 ${notes.length - right} 个音 → <b>双轨 MIDI</b>`;
      photo.dataset.state = "done";
      runBtn.textContent = "重新识别";
      runBtn.disabled = playBtn.disabled = dlBtn.disabled = false;
      running = false;
    });
    playBtn.addEventListener("click", () => player.toggle());
    dlBtn.addEventListener("click", () => {
      const tracks = [
        { name: "右手", notes: notes.filter((n) => !n.hand) },
        { name: "左手", notes: notes.filter((n) => n.hand) },
      ];
      download(
        writeMidi({
          title: "肖邦 A 大调前奏曲 Op.28 No.7",
          tracks,
          tempos: [{ beat: 0, bpm: S.bpm }],
          timeSig: [3, 4],
        }),
        "肖邦-A大调前奏曲-Op28No7",
      );
    });
  }

  /* ---------------- 02 MusicXML → MIDI converter ---------------- */
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
          "里姆斯基-科萨科夫 曲 · Kevin W. K. Yeung 钢琴编配 · CC BY-SA 3.0（IMSLP）· 由乐谱从 7 页原版 PDF 转写",
      },
    };
    const COLORS = ["#5fe3b8", "#d9b46c", "#9ff3ff", "#ff9f8a"];
    const player = new Player({});
    let score = null;
    let bytes = null;

    // Sample thumbnail for 《欢乐颂》, and the slow drift of real MusicXML behind the panel.
    drawStaff($(".ode-thumb"), bars(ODE, 0, 2), {
      beats: 8,
      clef: "grand",
      className: "ink",
      timeSig: [4, 4],
      S: 6.5,
      width: 300,
      padTop: 18,
      padBottom: 14,
    });
    const STEPS = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
    const TYPES = { 0.5: "eighth", 1: "quarter", 1.5: "quarter", 2: "half" };
    const xml = [];
    ODE_RIGHT.forEach((n, i) => {
      if (n.beat % 4 === 0) xml.push(`<measure number="${n.beat / 4 + 1}">`);
      xml.push(
        `  <note><pitch><step>${STEPS[n.midi % 12]}</step><octave>${Math.floor(n.midi / 12) - 1}</octave></pitch>` +
          `<duration>${n.dur * 2}</duration><type>${TYPES[n.dur]}</type><staff>1</staff></note>`,
      );
      if ((ODE_RIGHT[i + 1]?.beat ?? 64) % 4 === 0) xml.push("</measure>");
    });
    const art = $(".xml-art");
    art.innerHTML = `<div>${[...xml, ...xml].map((l) => l.replace(/</g, "&lt;")).join("\n")}</div>`;

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
        score.tracks.map((t) => t.name).join(" / "),
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
        ["MIDI 音符", score.notes.length.toLocaleString("en-US")],
        ["轨道", score.tracks.length],
        ["速度 BPM", score.tempos.length > 1 ? `${bpm}+` : bpm],
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
        `读取 ${score.noteTags.toLocaleString("en-US")} 个 <note>${skipped ? `（${skipped}）` : ""} → ${score.notes.length.toLocaleString("en-US")} 个 MIDI 音符 · ` +
        `MIDI 文件 ${(bytes.length / 1024).toFixed(1)} KB · 用时 ${ms} ms` +
        (score.tempos.length > 1
          ? ` · 文件保留全部 ${score.tempos.length} 处速度变化，试听按首个速度`
          : "") +
        (credit ? ` · ${credit}` : "");
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
      g.globalCompositeOperation = "lighter";
      for (const n of score.notes) {
        const on = live && beat >= n.beat && beat < n.beat + n.dur;
        const c = COLORS[n.track % COLORS.length];
        g.fillStyle = on ? "#fff6dc" : c;
        g.shadowColor = c;
        g.shadowBlur = on ? 12 : 3;
        g.globalAlpha = on ? 1 : 0.78;
        g.fillRect(
          x(n.beat),
          y(n.midi) - rowH / 2,
          Math.max(1.5, x(n.beat + n.dur) - x(n.beat) - 0.5),
          rowH,
        );
      }
      g.globalAlpha = 1;
      g.shadowBlur = 0;
      g.globalCompositeOperation = "source-over";
      if (live || player.pos > 0) {
        const grad = g.createLinearGradient(x(beat) - 30, 0, x(beat) + 2, 0);
        grad.addColorStop(0, "rgba(217,180,108,0)");
        grad.addColorStop(1, "rgba(243,220,166,0.35)");
        g.fillStyle = grad;
        g.fillRect(x(beat) - 30, 0, 32, h);
        g.fillStyle = "#f3dca6";
        g.fillRect(x(beat) - 1, 0, 2, h);
      }
    }
    player.onState = (on) => {
      playBtn.classList.toggle("is-playing", on);
      $("span", playBtn).textContent = on ? "暂停" : "播放";
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
          "MXL 是压缩格式：请先解压出其中的 .musicxml，或直接在乐谱 App 里导入 MXL。",
        );
      if (file.size > 30 * 1024 * 1024)
        return fail("文件超过 30 MB，这里的在线转换只处理更小的 MusicXML。");
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
          fail("示例文件没有加载成功，请用 HTTP 方式打开这个页面后再试。");
        }
      }),
    );
  }

  /* ---------------- 03 Follow playback on paper ---------------- */
  function initFollow() {
    const panel = $("#follower");
    const view = $(".follow-view", panel);
    const page = $(".follow-page", panel);
    const playBtn = $("#follow-play");
    const range = $(".range", panel);
    const out = $(".tempo output", panel);
    const player = new Player({
      notes: ODE,
      bpm: 100,
      onEnd: () => view.scrollTo({ top: 0, behavior: "smooth" }),
    });
    let mode = "staff";
    let per = 4;
    let systems = [];
    let builtWidth = 0;
    let shown = -1;

    function build() {
      const width = page.clientWidth;
      if (width < 240) return; // mid-resize or hidden: wait for a real width
      builtWidth = width;
      per = width >= 640 ? 4 : 2;
      const S = width >= 640 ? 9 : 7.5;
      page.replaceChildren();
      systems = [];
      for (let s = 0; s < 16 / per; s++) {
        const div = document.createElement("div");
        div.className = "system";
        page.appendChild(div);
        const notes = bars(ODE, s * per, s * per + per);
        const views = [];
        if (mode === "staff") {
          views.push(
            drawStaff(div, notes, {
              beats: per * 4,
              clef: "grand",
              className: "ink",
              timeSig: s ? null : [4, 4],
              S,
              width,
              padTop: 4 * S,
              padBottom: 3.6 * S,
            }),
          );
        } else {
          const r = document.createElement("div");
          const l = document.createElement("div");
          div.append(r, l);
          const o = {
            beats: per * 4,
            width,
            fs: width >= 640 ? 24 : 20,
            height: 62,
            className: "ink",
          };
          views.push(
            drawJianpu(r, notes, { ...o, hand: 0, label: "右手" }),
            drawJianpu(l, notes, { ...o, hand: 1, label: "左手" }),
          );
        }
        for (const v of views)
          for (const e of v.els) e.el.dataset.beat = s * per * 4 + e.beat;
        systems.push({ div, views });
      }
      shown = -1;
      tick();
    }
    function tick() {
      const beat = player.beat;
      const live = player.playing;
      const span = per * 4;
      const current = Math.min(systems.length - 1, Math.floor(beat / span));
      systems.forEach((s, i) => {
        s.div.classList.toggle("is-current", live && i === current);
        for (const v of s.views)
          paint(v, beat - i * span, live && i === current);
      });
      view.classList.toggle("is-live", live);
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
      playBtn.classList.toggle("is-playing", on);
      playBtn.setAttribute("aria-label", on ? "暂停" : "播放");
      if (on) frame.add(tick);
      else {
        frame.remove(tick);
        shown = -1;
        requestAnimationFrame(tick);
      }
    };
    playBtn.addEventListener("click", () => player.toggle());
    page.addEventListener("click", (e) => {
      const el = e.target.closest?.("[data-beat]");
      if (!el) return;
      player.seek(Number(el.dataset.beat));
      if (!player.playing) player.play();
    });
    const setTempo = () => {
      const v = Number(range.value);
      player.setTempo(v);
      out.textContent = `${v} BPM`;
      range.style.setProperty("--p", `${((v - 20) / 280) * 100}%`);
    };
    range.addEventListener("input", setTempo);
    setTempo();
    seg($(".seg", panel), (v) => {
      mode = v;
      build();
    });
    new ResizeObserver(
      () => Math.abs(page.clientWidth - builtWidth) > 24 && build(),
    ).observe(page);
    new IntersectionObserver(
      ([e]) => !e.isIntersecting && player.pause(),
    ).observe(panel);
    build();
  }

  /* ---------------- Boot ---------------- */
  initChrome();
  // Each part starts on its own, so one failing demo never takes the rest of the page down.
  const boot = () => {
    for (const init of [initHero, initOcr, initConverter, initFollow]) {
      try {
        init();
      } catch (err) {
        console.error(`${init.name} failed`, err);
      }
    }
  };
  // Staff glyphs come from Bravura, so draw once it is ready (or after a short wait).
  if (document.fonts?.load) {
    Promise.race([
      document.fonts.load('40px "Bravura"', ""),
      new Promise((r) => setTimeout(r, 1500)),
    ]).then(boot, boot);
  } else boot();
})();
