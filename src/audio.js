import {createPerformanceTimeline} from '../lib/score-representations.ts';
import { DEFAULT_PIANO_INSTRUMENT, SAMPLE_BANK_URLS, pianoInstrument, pianoSampleProfile, PianoSampleBank } from '../lib/piano-voices.mjs';
import { assetURL } from '../lib/asset-url.mjs';
import { createInstrumentRoom } from '../lib/instrument-room.mjs';
import { INSTRUMENT_PREVIEW } from '../lib/instrument-demo.mjs';
import { performanceNotes, tieChains } from '../lib/note-effects.mjs';
import { createScoreTimeline } from '../lib/score-timing.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const EPSILON = 1e-7;

/** Web Audio score transport. Beats are always quarter notes, including in 6/8. */
export class PianoPlayer {
  constructor(options = {}) {
    this.onFrame = options.onFrame || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.onInstrumentState = options.onInstrumentState || (() => {});
    this._instrumentId = options.instrument || DEFAULT_PIANO_INSTRUMENT;
    const initialInstrument = pianoInstrument(this._instrumentId);
    this._activeInstrument = initialInstrument.engine === 'synth' ? 'synth' : null;
    this._instrumentState = { id: this._instrumentId, status: this._activeInstrument ? 'ready' : 'idle',
      engine: initialInstrument.engine, progress: this._activeInstrument ? 1 : 0, loaded: 0, total: 0,
      message: this._activeInstrument ? '轻量合成已就绪' : '首次播放时加载本机乐器采样' };
    this._sampleOptions = { manifestURL: options.sampleManifestURL, manifest: options.sampleManifest, fetcher: options.sampleFetcher };
    this._bankOptions = options.sampleBanks || {};
    this._sampleBanks = new Map();
    this._retiredRooms = new Map();
    this._instrumentGeneration = 0;
    this._disposed = false;
    this._contextFactory = options.audioContextFactory || (() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('当前浏览器不支持 Web Audio，请使用新版 Chrome、Edge 或 Safari。');
      return new Context();
    });
    this._requestFrame = options.requestFrame || ((fn) => globalThis.requestAnimationFrame(fn));
    this._cancelFrame = options.cancelFrame || ((id) => globalThis.cancelAnimationFrame(id));
    this._setInterval = options.setIntervalFn || ((fn, delay) => globalThis.setInterval(fn, delay));
    this._clearInterval = options.clearIntervalFn || ((id) => globalThis.clearInterval(id));
    this._state = 'stopped';
    this._beat = 0;
    this._score = null;
    this._notes = [];
    this._voices = new Set();
    this._config = {
      tempo: 88, volume: 0.72, rightEnabled: true, leftEnabled: true,
      metronome: false, loopEnabled: false, loopStart: 0, loopEnd: null,
    };
    this._timer = null;
    this._raf = null;
    this._lastHiddenFrameTime = -Infinity;
    this._visibilityHandler = () => {
      if (this._state === 'playing') {
        this._schedule();
        this._emitFrame();
      }
    };
    globalThis.document?.addEventListener('visibilitychange', this._visibilityHandler);
  }

  get state() { return this._state; }
  get instrument() { return this._instrumentId; }
  get instrumentState() { return { ...this._instrumentState, activeId: this._activeInstrument }; }
  get _performanceBeat() {
    return this._state === 'playing' ? this._positionAt(this._context.currentTime) : this._beat;
  }

  get beat() { return this._writtenBeat(this._performanceBeat); }
  get elapsedSeconds() { return this._performanceBeat * 60 / this._config.tempo; }
  get durationSeconds() { return (this._duration||0) * 60 / this._config.tempo; }
  timeAtBeat(beat) { return this._performedBeat(beat) * 60 / this._config.tempo; }
  _performedBeat(beat) { return this._timeline ? this._timeline.secondsAt(beat)*this._baseTempo/60 : beat; }
  _writtenBeat(beat) { return this._timeline ? this._timeline.beatAt(beat*60/this._baseTempo) : beat; }

  setScore(score) {
    this.stop();
    const performance=score?createPerformanceTimeline({...score,notes:score.notes.map(n=>({...n,hand:n.hand==='left'?'left':'right'}))}):null;
    score=performance?.score || score;
    this._score = score || null;
    this._baseTempo = score?.tempo || 88;
    this._timeline = performance?.timing || createScoreTimeline(score || {notes:[],tempo:88,durationBeats:0});
    this._notes = (performance?.notes || [])
      .filter((note) => Number.isFinite(note.midi) && Number.isFinite(note.beat) && note.duration > 0)
      .map((note, index) => ({ ...note, writtenBeat:note.beat, beat:this._performedBeat(note.beat), duration:this._performedBeat(note.beat+note.duration)-this._performedBeat(note.beat), id: note.id ?? `note-${index}`, hand: note.hand === 'left' ? 'left' : 'right' }))
      .sort((a, b) => a.beat - b.beat);
    this._duration = this._timeline.durationSeconds*this._baseTempo/60;
    this._clicks=[];
    const unit=4/(score?.timeSignature?.[1]||4),numerator=score?.timeSignature?.[0]||4;
    for(let tick=0;tick*unit<(score?.durationBeats||0);tick++)this._clicks.push({beat:this._performedBeat(tick*unit),accent:tick%numerator===0});
    this._config.tempo = clamp(score?.tempo || 88, 20, 300);
    this._config.loopStart = 0;
    this._config.loopEnd = this._duration;
    this._config.loopEnabled = false;
    this._emitFrame();
  }

  async play() {
    if (!this._score || !this._duration || this._state === 'playing') return;
    const generation = this._playGeneration = (this._playGeneration || 0) + 1;
    await this._ensureAudio();
    // A stop/pause while the browser's audio permission promise is pending wins.
    await this._context.resume();
    await this._prepareInstrument();
    if (generation !== this._playGeneration) return;
    let position = this._beat >= this._duration - EPSILON ? 0 : this._beat;
    const loop = this._loopBounds();
    if (loop && (position < loop.start || position >= loop.end)) position = loop.start;
    this._state = 'playing';
    this._resetSchedule(position);
    this.onStateChange(this._state);
    this._timer = this._setInterval(() => {
      this._schedule();
      // rAF is suspended in background tabs; this still derives position from audio time.
      if (globalThis.document?.hidden && this._context.currentTime - this._lastHiddenFrameTime >= 0.2) {
        this._lastHiddenFrameTime = this._context.currentTime;
        this._emitFrame();
      }
    }, 25);
    this._frame();
  }

  pause() {
    this._playGeneration = (this._playGeneration || 0) + 1;
    if (this._state !== 'playing') return;
    this._beat = this._performanceBeat;
    this._halt();
    this._state = 'paused';
    this.onStateChange(this._state);
    this._emitFrame();
  }

  stop() {
    this._playGeneration = (this._playGeneration || 0) + 1;
    this._halt();
    this._beat = 0;
    const changed = this._state !== 'stopped';
    this._state = 'stopped';
    if (changed) this.onStateChange(this._state);
    this._emitFrame();
  }

  seek(beat) {
    let position = clamp(this._performedBeat(beat), 0, this._duration || 0);
    const loop = this._loopBounds();
    if (loop && (position < loop.start || position >= loop.end)) position = loop.start;
    this._beat = position;
    if (this._state === 'playing') this._resetSchedule(position);
    this._emitFrame();
  }

  configure(changes = {}) {
    const position = this._performanceBeat;
    const before = { ...this._config };
    if ('tempo' in changes) this._config.tempo = clamp(changes.tempo, 20, 300);
    if ('volume' in changes) this._config.volume = clamp(changes.volume, 0, 1);
    for (const key of ['rightEnabled', 'leftEnabled', 'metronome', 'loopEnabled']) {
      if (key in changes) this._config[key] = Boolean(changes[key]);
    }
    if ('loopStart' in changes) this._config.loopStart = clamp(this._performedBeat(changes.loopStart), 0, this._duration || 0);
    if ('loopEnd' in changes) this._config.loopEnd = clamp(this._performedBeat(changes.loopEnd), 0, this._duration || 0);
    if (this._master && before.volume !== this._config.volume) {
      this._master.gain.setTargetAtTime(this._config.volume * 0.72, this._context.currentTime, 0.015);
    }
    const reschedule = ['tempo', 'rightEnabled', 'leftEnabled', 'metronome', 'loopEnabled', 'loopStart', 'loopEnd']
      .some((key) => before[key] !== this._config[key]);
    if (reschedule && this._state === 'playing') {
      const loop = this._loopBounds();
      this._resetSchedule(loop && (position < loop.start || position >= loop.end) ? loop.start : position);
    }
    this._emitFrame();
  }

  async notePreview(midi, velocity = 0.7) {
    const generation = this._playGeneration || 0;
    await this._ensureAudio();
    await this._context.resume();
    await this._prepareInstrument();
    if (generation !== (this._playGeneration || 0)) return;
    this._piano(clamp(midi, 21, 108), this._context.currentTime + 0.005, 0.65, velocity);
  }

  async previewInstrument() {
    this.pause();
    this._cancelVoices();
    const generation = this._playGeneration;
    await this._ensureAudio();
    await this._context.resume();
    await this._prepareInstrument();
    if (generation !== this._playGeneration) return;
    const start = this._context.currentTime + 0.015;
    for (const note of INSTRUMENT_PREVIEW) {
      this._piano(note.midi, start + note.beat * 60 / 96, note.duration * 60 / 96, note.velocity);
    }
  }

  _bankFor(instrument) {
    if (!this._sampleBanks.has(instrument.bank)) {
      const options = { ...(instrument.bank === 'piano' ? this._sampleOptions : {}), ...this._bankOptions[instrument.bank] };
      options.manifestURL ||= assetURL(SAMPLE_BANK_URLS[instrument.bank]);
      this._sampleBanks.set(instrument.bank, new PianoSampleBank(this._context, options));
    }
    return this._sampleBanks.get(instrument.bank);
  }

  async previewNotes(score,id) {
    this.pause();
    const request=this._previewGeneration=(this._previewGeneration||0)+1, generation=this._playGeneration||0;
    await this._ensureAudio(); await this._context.resume(); await this._prepareInstrument();
    if(request!==this._previewGeneration || generation!==(this._playGeneration||0)) return;
    this._cancelVoices();
    const selected=score.notes.find(n=>n.id===id); if(!selected) return;
    const chain=tieChains(score.notes).get(id);
    const ids=new Set(selected.arpeggio?score.notes.filter(n=>n.hand===selected.hand&&Math.abs(n.beat-selected.beat)<EPSILON).map(n=>n.id):[id]);
    const events=performanceNotes(score).filter(n=>n.sourceIds.some(key=>ids.has(key)));
    const start=Math.min(chain?.start??selected.beat,...events.map(n=>n.beat));
    const timeline=createScoreTimeline(score), scale=score.tempo/this._config.tempo, end=start+8, now=this._context.currentTime+.018;
    for(const n of events) if(n.beat<end)
      this._piano(n.midi,now+(timeline.secondsAt(n.beat)-timeline.secondsAt(start))*scale,(timeline.secondsAt(Math.min(n.beat+n.duration,end))-timeline.secondsAt(n.beat))*scale,n.velocity);
  }

  stopPreview() {
    this._previewGeneration=(this._previewGeneration||0)+1;
    if(this._state!=='playing') this._cancelVoices();
  }

  setInstrument(id) {
    if (this._disposed) return Promise.reject(new DOMException('播放器已关闭。', 'AbortError'));
    const instrument = pianoInstrument(id);
    if (id === this._instrumentId && this._instrumentState.status === 'loading' && this._instrumentPromise) return this._instrumentPromise;
    if (id === this._activeInstrument && this._instrumentState.status === 'ready') return Promise.resolve(this.instrumentState);
    const generation = ++this._instrumentGeneration;
    this._instrumentId = id;
    if (instrument.engine === 'synth') {
      this._activateInstrument(id);
      this._setInstrumentState({ id, status: 'ready', engine: 'synth', progress: 1, loaded: 0, total: 0, message: '轻量合成已就绪' });
      return Promise.resolve(this.instrumentState);
    }
    this._setInstrumentState({ id, status: 'loading', engine: 'samples', progress: 0, loaded: 0, total: 0, message: `正在准备${instrument.label}…` });
    const pending = (async () => {
      try {
        await this._ensureAudio();
        const bank = this._bankFor(instrument);
        await bank.load(progress => {
          if (generation !== this._instrumentGeneration) return;
          this._setInstrumentState({ id, status: 'loading', engine: 'samples', ...progress,
            message: `正在加载${instrument.label} ${progress.loaded} / ${progress.total || '…'}` });
        });
        if (generation !== this._instrumentGeneration) return this.instrumentState;
        this._activateInstrument(id);
        this._setInstrumentState({ id, status: 'ready', engine: 'samples', progress: 1,
          loaded: bank._progress.loaded, total: bank._progress.total,
          message: `${instrument.label} · 真实采样已就绪` });
        return this.instrumentState;
      } catch (error) {
        if (generation !== this._instrumentGeneration) return this.instrumentState;
        this._setInstrumentState({ id, status: 'error', engine: 'samples', progress: 0, loaded: 0, total: 0,
          error: error.message, message: error.message || '音色采样加载失败，请重试或选择轻量合成。' });
        throw error;
      } finally {
        if (this._instrumentPromise === pending) this._instrumentPromise = null;
      }
    })();
    this._instrumentPromise = pending;
    return pending;
  }

  _setInstrumentState(state) {
    this._instrumentState = state;
    this.onInstrumentState(this.instrumentState);
  }

  _activateInstrument(id) {
    const position = this._performanceBeat;
    this._activeInstrument = id;
    this._sampleBank = this._sampleBanks.get(pianoInstrument(id).bank);
    if (this._state === 'playing') this._resetSchedule(position);
    else this._cancelVoices();
  }

  async _prepareInstrument() {
    while (this._activeInstrument !== this._instrumentId || this._instrumentState.status !== 'ready') {
      if (this._disposed) throw new DOMException('播放器已关闭。', 'AbortError');
      const pending = this._instrumentPromise || this.setInstrument(this._instrumentId);
      await pending;
    }
  }

  async dispose() {
    this.stop();
    this._disposed = true;
    this._instrumentGeneration++;
    for (const bank of this._sampleBanks.values()) bank.dispose();
    this._sampleBanks.clear();
    this._sampleBank = null;
    for (const [room, timer] of this._retiredRooms) {
      globalThis.clearTimeout(timer);
      room.dispose();
    }
    this._retiredRooms.clear();
    globalThis.document?.removeEventListener('visibilitychange', this._visibilityHandler);
    if (this._context && this._context.state !== 'closed') await this._context.close();
    this._context = null;
  }

  async _ensureAudio() {
    if (this._disposed) throw new DOMException('播放器已关闭。', 'AbortError');
    if (this._context) return;
    this._context = this._contextFactory();
    this._master = this._context.createGain();
    this._master.gain.value = this._config.volume * 0.72;
    const compressor = this._context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    this._master.connect(compressor);
    compressor.connect(this._context.destination);
  }

  _loopBounds() {
    const start = this._config.loopStart;
    const end = this._config.loopEnd ?? this._duration;
    return this._config.loopEnabled && end - start > 1 / 960 ? { start, end, length: end - start } : null;
  }

  _absoluteAt(time) {
    return this._anchorBeat + Math.max(0, time - this._anchorTime) * this._config.tempo / 60;
  }

  _positionAt(time) {
    const absolute = this._absoluteAt(time);
    const loop = this._loopBounds();
    if (loop) return loop.start + ((absolute - loop.start) % loop.length + loop.length) % loop.length;
    return Math.min(this._duration || 0, absolute);
  }

  _resetSchedule(beat) {
    this._cancelVoices();
    this._beat = beat;
    this._anchorBeat = beat;
    this._anchorTime = this._context.currentTime + 0.018;
    this._nextAbsoluteBeat = beat;
    this._includeOverlap = true;
    this._schedule();
  }

  _schedule() {
    if (this._state !== 'playing') return;
    const now = this._context.currentTime;
    const absoluteNow = this._absoluteAt(now);
    const loop = this._loopBounds();
    if (!loop && absoluteNow >= this._duration - EPSILON) {
      this._beat = this._duration;
      // Voices already end at the score boundary plus their release. Let their
      // dampers and room decay naturally; explicit pause/stop still fades all.
      this._halt(false);
      this._state = 'stopped';
      this.onStateChange(this._state);
      this.onFrame(this._writtenBeat(this._beat), []);
      return;
    }
    const lookAhead = globalThis.document?.hidden ? 5 : 0.16;
    const horizon = this._absoluteAt(now + lookAhead);
    // If the browser was suspended longer than the buffer, skip past expired attacks
    // and revoice any sustained notes at the current clock position.
    if (this._nextAbsoluteBeat < absoluteNow - this._config.tempo / 60 * 0.06) {
      this._cancelVoices();
      this._nextAbsoluteBeat = absoluteNow;
      this._includeOverlap = true;
    }
    let from = this._nextAbsoluteBeat;
    let includeOverlap = this._includeOverlap;
    while (from < horizon - EPSILON) {
      let cycleBase = 0;
      let localFrom = from;
      let localEnd = this._duration;
      if (loop) {
        const cycle = Math.floor((from - loop.start + EPSILON) / loop.length);
        cycleBase = cycle * loop.length;
        localFrom = from - cycleBase;
        localEnd = loop.end;
      }
      const absoluteTo = Math.min(horizon, cycleBase + localEnd);
      const localTo = absoluteTo - cycleBase;
      if (localTo <= localFrom + EPSILON) break;
      const overlaps = includeOverlap || Boolean(loop && Math.abs(localFrom - loop.start) < EPSILON);
      this._scheduleSegment(localFrom, localTo, cycleBase, localEnd, overlaps);
      from = absoluteTo;
      includeOverlap = false;
      if (!loop && from >= this._duration - EPSILON) break;
    }
    this._nextAbsoluteBeat = from;
    this._includeOverlap = false;
  }

  _scheduleSegment(from, to, base, boundary, includeOverlap) {
    const secondsPerBeat = 60 / this._config.tempo;
    const timeFor = (beat) => Math.max(this._context.currentTime + 0.002,
      this._anchorTime + (base + beat - this._anchorBeat) * secondsPerBeat);
    for (const note of this._notes) {
      if (note.beat >= to - EPSILON) break;
      if (!this._config[`${note.hand}Enabled`]) continue;
      const isAttack = note.beat >= from - EPSILON;
      if (!isAttack && !(includeOverlap && note.beat + note.duration > from + EPSILON)) continue;
      const start = Math.max(from, note.beat);
      const end = Math.min(note.beat + note.duration, boundary, this._duration);
      if (end <= start + EPSILON) continue;
      this._piano(note.midi, timeFor(start), (end - start) * secondsPerBeat, note.velocity ?? 0.72,
        (start - note.beat) * secondsPerBeat);
    }
    if (this._config.metronome) {
      for(const tick of this._clicks)if(tick.beat>=from-EPSILON&&tick.beat<to-EPSILON)this._click(timeFor(tick.beat),tick.accent);
    }
  }

  _piano(midi, start, duration, velocity, elapsed = 0) {
    if (velocity <= 0) return;
    if (this._activeInstrument !== 'synth') {
      this._samplePiano(midi, start, duration, velocity, elapsed);
      return;
    }
    const ctx = this._context;
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const loudness = clamp(velocity, 0.05, 1);
    const release = Math.max(0.08, Math.min(0.32, 0.38 - (midi - 21) / 320));
    const end = start + duration;
    const stopAt = end + release;
    const nodes = [];
    const output = ctx.createGain();
    output.gain.value = 1;
    output.connect(this._master);
    const voice = { output, nodes, end: stopAt, cancelled: false };
    this._voices.add(voice);
    // Two slightly detuned strings plus progressively faster-decaying, inharmonic
    // upper partials reproduce a struck string without an external sample service.
    const partials = [
      [1, 0.62, -2.1], [1, 0.39, 2.1], [2, 0.31, 0],
      [3, 0.15, 0.7], [4, 0.085, 1.4], [5, 0.038, 2.2], [7, 0.016, 3.5],
    ];
    let remaining = 0;
    for (const [harmonic, weight, detune] of partials) {
      if (frequency * harmonic > ctx.sampleRate * 0.43) continue;
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * harmonic * Math.sqrt(1 + 0.000075 * harmonic * harmonic);
      oscillator.detune.value = detune;
      const gain = ctx.createGain();
      const amplitude = Math.max(0.00002, weight * loudness * 0.25);
      const attack = Math.min(0.006, duration * 0.25);
      const decay = (5.5 - clamp((midi - 21) / 87, 0, 1) * 3.5) / harmonic ** 0.72;
      const held = Math.max(0.00002, amplitude * Math.exp(-Math.max(0, duration - attack) / decay));
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(amplitude, start + attack);
      gain.gain.exponentialRampToValueAtTime(held, Math.max(start + attack + 0.0001, end));
      gain.gain.exponentialRampToValueAtTime(0.00001, stopAt);
      oscillator.connect(gain);
      gain.connect(output);
      nodes.push(oscillator, gain);
      remaining++;
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        if (--remaining === 0) {
          output.disconnect();
          this._voices.delete(voice);
        }
      };
      oscillator.start(start);
      oscillator.stop(stopAt);
    }
    if (!remaining) {
      output.disconnect();
      this._voices.delete(voice);
    }
  }

  _samplePiano(midi, start, duration, velocity, elapsed) {
    const ctx = this._context;
    const profile = pianoSampleProfile(this._activeInstrument);
    if (!profile || !this._sampleBank?.ready) throw new Error('乐器采样尚未准备好。');
    const sample = this._sampleBank.sampleFor(midi);
    const rate = 2 ** ((midi - sample.midi) / 12);
    const looping = Number.isFinite(sample.loopEnd);
    let offset = elapsed * rate;
    if (looping && offset >= sample.loopEnd) {
      offset = sample.loopStart + (offset - sample.loopStart) % (sample.loopEnd - sample.loopStart);
    }
    if (!looping && offset >= sample.buffer.duration - 0.004) return;
    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = rate;
    if (looping) {
      source.loop = true;
      source.loopStart = sample.loopStart;
      source.loopEnd = sample.loopEnd;
    }
    const output = ctx.createGain();
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = Math.min(ctx.sampleRate * 0.45, profile.cutoff - (profile.velocityCutoff || 0) * (1 - clamp(velocity, 0, 1)));
    lowpass.Q.value = 0.45;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 2400;
    shelf.gain.value = profile.shelf;
    source.connect(lowpass);
    lowpass.connect(shelf);
    const nodes = [source, lowpass, shelf];
    let tail = shelf;
    if (profile.body) {
      const body = ctx.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 320;
      body.Q.value = 0.7;
      body.gain.value = profile.body;
      tail.connect(body); tail = body; nodes.push(body);
    }
    if (sample.pan) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = sample.pan;
      tail.connect(panner); tail = panner; nodes.push(panner);
    }
    tail.connect(output);
    if (profile.room && !this._room) this._room = createInstrumentRoom(ctx, this._master, profile.room);
    output.connect(this._room?.input || this._master);
    const amplitude = profile.gain * clamp(velocity, 0.01, 1) ** profile.velocityExponent;
    const naturalDuration = looping ? duration + profile.release : (sample.buffer.duration - offset) / rate;
    const releaseAt = start + Math.min(duration, naturalDuration);
    const stopAt = Math.min(start + naturalDuration, releaseAt + profile.release);
    const attack = Math.min(elapsed > 0 ? 0.006 : profile.attack, duration / 4, (stopAt - start) / 4);
    output.gain.setValueAtTime(0, start);
    output.gain.linearRampToValueAtTime(amplitude, start + attack);
    output.gain.setValueAtTime(amplitude, Math.max(start + attack, releaseAt));
    output.gain.linearRampToValueAtTime(0, Math.max(start + attack + 0.001, stopAt));
    const voice = { output, nodes, end: stopAt, cancelled: false };
    this._voices.add(voice);
    source.onended = () => {
      for (const node of nodes) node.disconnect();
      output.disconnect();
      this._voices.delete(voice);
    };
    source.start(start, offset);
    source.stop(stopAt);
  }

  _click(start, accent) {
    const oscillator = this._context.createOscillator();
    const output = this._context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = accent ? 1320 : 880;
    output.gain.setValueAtTime(0, start);
    output.gain.linearRampToValueAtTime(accent ? 0.19 : 0.12, start + 0.002);
    output.gain.exponentialRampToValueAtTime(0.00001, start + 0.045);
    oscillator.connect(output);
    output.connect(this._master);
    const voice = { output, nodes: [oscillator], end: start + 0.05, cancelled: false };
    this._voices.add(voice);
    oscillator.onended = () => {
      oscillator.disconnect();
      output.disconnect();
      this._voices.delete(voice);
    };
    oscillator.start(start);
    oscillator.stop(start + 0.05);
  }

  _cancelVoices() {
    if (!this._context) return;
    const now = this._context.currentTime;
    for (const voice of this._voices) {
      if (voice.cancelled) continue;
      voice.cancelled = true;
      // Cancel future notes as well as currently sounding notes. A short gain fade
      // avoids clicks, and oscillator.stop replaces its original scheduled stop.
      voice.output.gain.cancelScheduledValues(now);
      voice.output.gain.setValueAtTime(voice.output.gain.value, now);
      voice.output.gain.linearRampToValueAtTime(0, now + 0.012);
      for (const node of voice.nodes) {
        if (typeof node.stop === 'function') {
          try { node.stop(now + 0.015); } catch { /* a node may already have ended */ }
        }
      }
    }
    this._voices.clear();
    if (this._room) {
      const room = this._room;
      this._room = null;
      room.fadeOut(now);
      const timer = globalThis.setTimeout(() => {
        room.dispose();
        this._retiredRooms.delete(room);
      }, 30);
      this._retiredRooms.set(room, timer);
    }
  }

  _halt(cancelVoices = true) {
    if (this._timer !== null) this._clearInterval(this._timer);
    if (this._raf !== null) this._cancelFrame(this._raf);
    this._timer = null;
    this._raf = null;
    if (cancelVoices) this._cancelVoices();
  }

  _frame() {
    if (this._state !== 'playing') return;
    this._emitFrame();
    this._raf = this._requestFrame(() => this._frame());
  }

  _emitFrame() {
    const beat = this._performanceBeat;
    const active = this._notes.filter((note) => this._config[`${note.hand}Enabled`]
      && note.beat <= beat + EPSILON && note.beat + note.duration > beat + EPSILON);
    this.onFrame(this._writtenBeat(beat), active.map(n=>({...n,beat:n.writtenBeat??n.beat})));
  }
}
