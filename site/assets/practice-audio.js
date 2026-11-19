/*
 * One beat clock for the playable homepage. No oscillator fallback: every note
 * uses the project's unmodified Salamander Grand Piano MP3s (Alexander Holm,
 * CC BY 3.0). See audio/piano/ATTRIBUTION.txt and LICENSE.txt.
 */
const SAMPLE_NAMES = [
  "A1",
  "C2",
  "Ds2",
  "Fs2",
  "A2",
  "C3",
  "Ds3",
  "Fs3",
  "A3",
  "C4",
  "Ds4",
  "Fs4",
  "A4",
  "C5",
  "Ds5",
  "Fs5",
  "A5",
  "C6",
  "Ds6",
  "Fs6",
  "A6",
  "C7",
];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const EPS = 1e-7;
let sharedContext;
let currentPlayer;

function sampleRoot(midi) {
  return (
    33 + clamp(Math.round((midi - 33) / 3), 0, SAMPLE_NAMES.length - 1) * 3
  );
}

function browserContext() {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) throw new Error("此浏览器暂不支持钢琴声音，请换用较新的浏览器。");
  if (!sharedContext || sharedContext.state === "closed")
    sharedContext = new Audio({ latencyHint: "interactive" });
  return sharedContext;
}

/**
 * All note times and durations use quarter-note beats. A single instance should
 * serve the hero, proofreading and arrangement; even separate instances yield
 * to one another before producing sound.
 */
export class PracticeAudio {
  constructor(options = {}) {
    this._contextFactory = options.contextFactory || browserContext;
    this._fetch = options.fetcher || globalThis.fetch.bind(globalThis);
    this._setTimer = options.setTimer || globalThis.setTimeout.bind(globalThis);
    this._clearTimer =
      options.clearTimer || globalThis.clearTimeout.bind(globalThis);
    this._requestFrame =
      options.requestFrame ||
      globalThis.requestAnimationFrame?.bind(globalThis);
    this._cancelFrame =
      options.cancelFrame || globalThis.cancelAnimationFrame?.bind(globalThis);
    this._document = options.document ?? globalThis.document;
    this._window = options.window ?? globalThis.window;
    this._listeners = new Set();
    if (options.onChange) this._listeners.add(options.onChange);
    this._raw = new Map();
    this._buffers = new Map();
    this._decoding = new Map();
    this._voices = new Set();
    this._scheduled = new Map();
    this._notes = [];
    this._scoreId = null;
    this._beats = 0;
    this._bpm = 96;
    this._hand = "both";
    this._loop = null;
    this._beat = 0;
    this._playing = false;
    this._loading = false;
    this._error = null;
    this._ended = false;
    this._intent = 0;
    this._pendingMode = null;
    this._preview = [];
    this._disposed = false;
    this._onVisibility = () => {
      if (this._document?.hidden) this.pause();
    };
    this._onPageHide = () => this.pause();
    this._document?.addEventListener("visibilitychange", this._onVisibility);
    this._window?.addEventListener("pagehide", this._onPageHide);
  }

  subscribe(listener) {
    this._listeners.add(listener);
    listener(this.getSnapshot());
    return () => this._listeners.delete(listener);
  }

  getSnapshot() {
    const beat = this._position();
    const now = this._ctx?.currentTime || 0;
    const activeNotes = this._playing
      ? this._notes.filter(
          (note) =>
            this._audible(note) &&
            note.beat <= beat + EPS &&
            note.beat + note.duration > beat + EPS,
        )
      : this._preview
          .filter((item) => item.until > now)
          .map((item) => item.note);
    return {
      playing: this._playing,
      beat,
      bpm: this._bpm,
      hand: this._hand,
      loop: this._loop ? { ...this._loop } : null,
      loading: this._loading,
      error: this._error,
      ready:
        this._notes.length > 0 &&
        this._notes.every((note) => this._buffers.has(sampleRoot(note.midi))),
      activeNotes,
      scoreId: this._scoreId,
      ended: this._ended,
    };
  }

  setScore({ id, notes, beats, bpm = 96 }) {
    this.pause();
    this._scoreId = id;
    this._notes = notes
      .map((note, index) => {
        if (
          !Number.isFinite(note.beat) ||
          note.beat < 0 ||
          !Number.isFinite(note.duration) ||
          note.duration <= 0 ||
          !Number.isFinite(note.midi)
        )
          throw new Error("乐谱中有无效的音符时间或音高。");
        return {
          ...note,
          id: note.id ?? `${id}-${index}`,
          hand: note.hand === "left" ? "left" : "right",
          velocity: note.velocity ?? 0.65,
          _index: index,
        };
      })
      .sort((a, b) => a.beat - b.beat || a._index - b._index);
    this._beats =
      beats ?? Math.max(0, ...notes.map((note) => note.beat + note.duration));
    this._bpm = clamp(Number(bpm) || 96, 20, 300);
    this._hand = "both";
    this._loop = null;
    this._beat = 0;
    this._ended = false;
    this._error = null;
    this.prefetch(this._notes);
    this._emit();
  }

  // Download only the recordings this excerpt needs. Fetching never opens an
  // AudioContext, so page load cannot make a sound or consume a user gesture.
  prefetch(notes = this._notes) {
    return Promise.allSettled(
      [...new Set(notes.map((note) => sampleRoot(note.midi)))].map((root) =>
        this._fetchRoot(root),
      ),
    );
  }

  async play() {
    if (this._disposed || !this._notes.length || this._document?.hidden)
      return false;
    if (this._playing) return true;
    this._claimSound();
    const intent = ++this._intent;
    this._pendingMode = "play";
    this._loading = true;
    this._error = null;
    this._emit();
    try {
      // Resume is deliberately called synchronously in the click handler,
      // before the first await. This also works with Safari's gesture policy.
      const resumed = this._openContext();
      await Promise.all([resumed, this._prepare(this._notes)]);
      if (intent !== this._intent || this._disposed || this._document?.hidden)
        return false;
      this._loading = false;
      this._pendingMode = null;
      this._ended = false;
      if (this._beat >= this._beats - EPS) this._beat = this._loop?.start ?? 0;
      this._playing = true;
      this._rebase(this._beat);
      this._startFrames();
      this._emit();
      return true;
    } catch (error) {
      if (intent !== this._intent) return false;
      this._loading = false;
      this._pendingMode = null;
      this._playing = false;
      this._error = error.message || "钢琴采样暂未就绪，请重试。";
      this._emit();
      return false;
    }
  }

  pause() {
    this._beat = this._position();
    this._playing = false;
    this._ended =
      !this._loop && this._beats > 0 && this._beat >= this._beats - EPS;
    this._loading = false;
    this._intent++;
    this._pendingMode = null;
    this._preview = [];
    this._stopClocks();
    this._stopVoices();
    this._scheduled.clear();
    if (currentPlayer === this) currentPlayer = null;
    this._emit();
  }

  seek(beat) {
    this._cancelPendingAudition();
    const target = clamp(Number(beat) || 0, 0, this._beats);
    // A deliberate seek outside the selected loop leaves the loop visible but
    // starts at its nearest boundary, keeping the advertised range truthful.
    const next = this._loop
      ? clamp(target, this._loop.start, this._loop.end - EPS)
      : target;
    this._ended = next >= this._beats;
    this._preview = [];
    if (this._playing) this._rebase(next);
    else {
      this._beat = next;
      this._stopVoices();
      this._stopClocks();
    }
    this._emit();
  }

  setTempo(bpm) {
    const beat = this._position();
    this._bpm = clamp(Number(bpm) || this._bpm, 20, 300);
    if (this._playing) this._rebase(beat);
    this._emit();
  }

  setHand(hand) {
    if (!["both", "right", "left"].includes(hand))
      throw new Error("未知的声部。");
    this._cancelPendingAudition();
    const beat = this._position();
    this._hand = hand;
    if (this._playing) this._rebase(beat);
    else {
      this._preview = [];
      this._stopVoices();
    }
    this._emit();
  }

  setLoop(loop) {
    let beat = this._position();
    if (
      loop &&
      (!Number.isFinite(loop.start) ||
        !Number.isFinite(loop.end) ||
        loop.start < 0 ||
        loop.end > this._beats ||
        loop.end <= loop.start)
    )
      throw new Error("循环范围必须位于乐谱内。");
    this._cancelPendingAudition();
    this._loop = loop ? { start: loop.start, end: loop.end } : null;
    if (loop && (beat < loop.start || beat >= loop.end)) beat = loop.start;
    if (this._playing) this._rebase(beat);
    else {
      this._beat = beat;
      this._preview = [];
      this._stopVoices();
      this._stopClocks();
    }
    this._ended = !this._loop && beat >= this._beats - EPS;
    this._emit();
  }

  async audition(noteOrNotes) {
    if (this._disposed || this._document?.hidden) return false;
    this.pause();
    this._claimSound();
    const notes = Array.isArray(noteOrNotes) ? noteOrNotes : [noteOrNotes];
    const intent = ++this._intent;
    this._pendingMode = "audition";
    this._loading = true;
    this._error = null;
    this._emit();
    try {
      const resumed = this._openContext();
      await Promise.all([resumed, this._prepare(notes)]);
      if (intent !== this._intent || this._disposed || this._document?.hidden)
        return false;
      this._loading = false;
      this._pendingMode = null;
      const now = this._ctx.currentTime;
      this._preview = notes.map((note) => {
        const duration = clamp(
          ((note.duration || 1) * 60) / this._bpm,
          0.18,
          1.4,
        );
        this._voice(note, now, duration, 0);
        return { note, until: now + duration };
      });
      this._tick();
      this._startFrames();
      this._emit();
      return true;
    } catch (error) {
      if (intent !== this._intent) return false;
      this._loading = false;
      this._pendingMode = null;
      this._error = error.message || "钢琴采样暂未就绪，请重试。";
      this._emit();
      return false;
    }
  }

  dispose() {
    this.pause();
    this._disposed = true;
    this._document?.removeEventListener("visibilitychange", this._onVisibility);
    this._window?.removeEventListener("pagehide", this._onPageHide);
    this._listeners.clear();
    this._bus?.disconnect();
  }

  _claimSound() {
    if (currentPlayer && currentPlayer !== this) currentPlayer.pause();
    currentPlayer = this;
  }

  _cancelPendingAudition() {
    if (this._pendingMode !== "audition") return;
    this._intent++;
    this._pendingMode = null;
    this._loading = false;
  }

  _openContext() {
    this._ctx ||= this._contextFactory();
    if (!this._bus) {
      this._bus = this._ctx.createGain();
      this._bus.gain.value = 0.62;
      this._bus.connect(this._ctx.destination);
    }
    return this._ctx.state !== "running"
      ? this._ctx.resume()
      : Promise.resolve();
  }

  _fetchRoot(root) {
    if (this._raw.has(root)) return this._raw.get(root);
    const name = SAMPLE_NAMES[(root - 33) / 3];
    const promise = (async () => {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await this._fetch(
          new URL(`./audio/piano/${name}.mp3`, import.meta.url),
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("missing");
        return await response.arrayBuffer();
      } catch {
        this._raw.delete(root);
        throw new Error("钢琴采样暂未加载成功。谱面仍可操作，点击播放可重试。");
      } finally {
        globalThis.clearTimeout(timeout);
      }
    })();
    this._raw.set(root, promise);
    return promise;
  }

  async _prepare(notes) {
    const roots = [...new Set(notes.map((note) => sampleRoot(note.midi)))];
    await Promise.all(
      roots.map((root) => {
        if (this._buffers.has(root)) return this._buffers.get(root);
        if (!this._decoding.has(root)) {
          const promise = this._fetchRoot(root)
            .then((bytes) => this._ctx.decodeAudioData(bytes.slice(0)))
            .then((buffer) => {
              this._buffers.set(root, buffer);
              return buffer;
            })
            .catch(() => {
              this._raw.delete(root);
              throw new Error(
                "钢琴采样暂未加载成功。谱面仍可操作，点击播放可重试。",
              );
            })
            .finally(() => this._decoding.delete(root));
          this._decoding.set(root, promise);
        }
        return this._decoding.get(root);
      }),
    );
  }

  _audible(note) {
    return (
      (this._hand === "both" || note.hand === this._hand) &&
      (!this._loop ||
        (note.beat < this._loop.end &&
          note.beat + note.duration > this._loop.start))
    );
  }

  _rawPosition() {
    return (
      this._anchorBeat +
      (Math.max(0, this._ctx.currentTime - this._anchorTime) * this._bpm) / 60
    );
  }

  _position() {
    if (!this._playing) return this._beat;
    const raw = this._rawPosition();
    if (this._loop && raw >= this._loop.end)
      return (
        this._loop.start +
        ((raw - this._loop.start) % (this._loop.end - this._loop.start))
      );
    return Math.min(raw, this._beats);
  }

  _rebase(beat) {
    this._stopVoices();
    this._scheduled.clear();
    this._preview = [];
    this._beat = beat;
    this._anchorBeat = beat;
    this._anchorTime = this._ctx.currentTime;
    this._clearTimer(this._timer);
    this._timer = null;
    this._tick();
  }

  _tick() {
    this._timer = null;
    const now = this._ctx.currentTime;
    if (this._playing) {
      const raw = this._rawPosition();
      if (!this._loop && raw >= this._beats - EPS) {
        this._beat = this._beats;
        this._playing = false;
        this._ended = true;
        this._emit();
      } else {
        const spb = 60 / this._bpm;
        const horizon = raw + 0.12 / spb;
        const length = this._loop ? this._loop.end - this._loop.start : 0;
        const cycle = length
          ? Math.max(0, Math.floor((raw - this._loop.start) / length))
          : 0;
        const lastCycle = length
          ? Math.max(cycle, Math.floor((horizon - this._loop.start) / length))
          : 0;
        for (const [key, scheduledCycle] of this._scheduled)
          if (scheduledCycle < cycle - 1) this._scheduled.delete(key);
        for (let pass = cycle; pass <= lastCycle; pass++) {
          for (const note of this._notes) {
            if (!this._audible(note)) continue;
            const start =
              Math.max(note.beat, this._loop?.start ?? 0) + pass * length;
            const end =
              Math.min(
                note.beat + note.duration,
                this._loop?.end ?? this._beats,
              ) +
              pass * length;
            const key = `${pass}:${note._index}`;
            if (
              end <= raw + EPS ||
              start >= horizon ||
              this._scheduled.has(key)
            )
              continue;
            const atBeat = Math.max(raw, start);
            const when = this._anchorTime + (atBeat - this._anchorBeat) * spb;
            const offset =
              Math.max(0, atBeat - pass * length - note.beat) * spb;
            this._voice(
              note,
              when,
              (end - atBeat) * spb,
              offset,
              Boolean(
                this._loop && note.beat + note.duration >= this._loop.end - EPS,
              ),
            );
            this._scheduled.set(key, pass);
          }
        }
      }
    }
    this._preview = this._preview.filter((item) => item.until > now);
    if (this._playing || this._preview.length)
      this._timer = this._setTimer(() => this._tick(), 25);
    else {
      this._stopClocks();
      this._emit();
    }
  }

  _voice(note, when, duration, offset, hardBoundary = false) {
    const root = sampleRoot(note.midi);
    const buffer = this._buffers.get(root);
    if (!buffer) return;
    const source = this._ctx.createBufferSource();
    const gain = this._ctx.createGain();
    const filter = this._ctx.createBiquadFilter();
    const rate = Math.pow(2, (note.midi - root) / 12);
    const velocity = clamp(note.velocity ?? 0.65, 0, 1);
    source.buffer = buffer;
    source.playbackRate.value = rate;
    filter.type = "lowpass";
    filter.frequency.value = clamp(
      1800 + velocity * 5800 + (note.midi - 60) * 35,
      1200,
      12000,
    );
    const at = Math.max(this._ctx.currentTime, when);
    const end = when + duration;
    if (end <= at) return;
    const peak = 0.08 + Math.pow(velocity, 1.55) * 0.7;
    gain.gain.setValueAtTime(0, at);
    const attackEnd = Math.min(end, at + 0.006);
    gain.gain.linearRampToValueAtTime(peak, attackEnd);
    gain.gain.setValueAtTime(
      peak,
      hardBoundary ? Math.max(attackEnd, end - 0.008) : end,
    );
    // The release is part of this same scheduled event. Transport edits cancel
    // both sounding notes and future sources, so a muted hand cannot leak back.
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      hardBoundary ? end : end + 0.22,
    );
    source.connect(filter).connect(gain).connect(this._bus);
    const voice = { source, gain, filter };
    this._voices.add(voice);
    source.onended = () => {
      this._voices.delete(voice);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(
      at,
      Math.min(offset * rate, Math.max(0, buffer.duration - 0.025)),
    );
    source.stop(hardBoundary ? end : end + 0.24);
  }

  _stopVoices() {
    if (!this._ctx) return;
    const now = this._ctx.currentTime;
    for (const voice of this._voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(0, now);
      try {
        voice.source.stop(now);
      } catch {
        // A source can already have finished between the UI event and here.
      }
    }
    this._voices.clear();
  }

  _startFrames() {
    if (!this._requestFrame || this._frame) return;
    const frame = () => {
      this._frame = null;
      this._emit();
      if (this._playing || this._preview.length)
        this._frame = this._requestFrame(frame);
    };
    this._frame = this._requestFrame(frame);
  }

  _stopClocks() {
    this._clearTimer(this._timer);
    this._timer = null;
    if (this._frame) this._cancelFrame?.(this._frame);
    this._frame = null;
  }

  _emit() {
    if (!this._listeners.size) return;
    const snapshot = this.getSnapshot();
    for (const listener of this._listeners) listener(snapshot);
  }
}
