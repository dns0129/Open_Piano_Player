import test from 'node:test';
import assert from 'node:assert/strict';
import MidiPackage from '@tonejs/midi/build/Midi.js';
import { XMLValidator } from 'fast-xml-parser';
import { PianoPlayer } from '../src/audio.js';
import { exportMidi, exportMusicXML } from '../lib/exporters.mjs';
const { Midi } = MidiPackage;

class FakeParam {
  value = 0;
  events = [];
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]); }
  setTargetAtTime(value, time) { this.value = value; this.events.push(['target', value, time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
}

class FakeNode {
  gain = new FakeParam(); frequency = new FakeParam(); detune = new FakeParam();
  playbackRate = new FakeParam(); Q = new FakeParam();
  threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam();
  attack = new FakeParam(); release = new FakeParam();
  stops = [];
  connect() {}
  disconnect() { this.disconnected = true; }
  start(time, offset = 0) { this.started = time; this.offset = offset; }
  stop(time) { this.stops.push(time); }
}

class FakeContext {
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  oscillators = [];
  bufferSources = [];
  filters = [];
  decodeCalls = 0;
  state = 'running';
  createGain() { return new FakeNode(); }
  createDynamicsCompressor() { return new FakeNode(); }
  createOscillator() { const node = new FakeNode(); this.oscillators.push(node); return node; }
  createBufferSource() { const node = new FakeNode(); this.bufferSources.push(node); return node; }
  createBiquadFilter() { const node = new FakeNode(); this.filters.push(node); return node; }
  async decodeAudioData() { this.decodeCalls++; return { duration: 8, length: 384000, sampleRate: 48000, numberOfChannels: 2 }; }
  async resume() {}
  async close() { this.state = 'closed'; }
}

const makeScore = (notes, extra = {}) => ({ version: 1, id: 'test', title: '测试', composer: 'Test',
  tempo: 120, timeSignature: [4, 4], keySignature: 0, source: { kind: 'original', label: '原创' },
  notes, durationBeats: Math.max(...notes.map(n => n.beat + n.duration)), ...extra });

function harness(score, options = {}) {
  const context = new FakeContext();
  const states = [], frames = [], instruments = [];
  let interval;
  const player = new PianoPlayer({ instrument: 'synth', ...options, audioContextFactory: () => context,
    setIntervalFn: fn => { interval = fn; return 1; }, clearIntervalFn: () => { interval = null; },
    requestFrame: () => 1, cancelFrame: () => {},
    onStateChange: state => states.push(state), onFrame: (beat, notes) => frames.push({ beat, notes }),
    onInstrumentState: state => instruments.push(state) });
  player.setScore(score);
  return { player, context, states, frames, instruments, advance(seconds) {
    context.currentTime += seconds;
    interval?.();
  } };
}

const sampleOptions = (overrides = {}) => ({ instrument: 'piano',
  sampleManifest: { version: 1, samples: [48, 60, 63].map(midi => ({ midi, file: `${midi}.mp3` })) },
  sampleFetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }), ...overrides });

test('sampled piano transposes the nearest root and shares decoded buffers across presets', async () => {
  const h = harness(makeScore([{ id: 'sample', beat: 0, duration: 8, midi: 61, hand: 'right' }]), sampleOptions());
  assert.equal(h.context.decodeCalls, 0, 'constructing and setting a score must not eagerly load audio');
  await h.player.play();
  assert.equal(h.player.instrumentState.status, 'ready');
  assert.equal(h.player.instrumentState.engine, 'samples');
  assert.equal(h.context.oscillators.length, 0, 'real sample mode must not secretly use an oscillator');
  const source = h.context.bufferSources[0];
  assert.ok(Math.abs(source.playbackRate.value - 2 ** (1 / 12)) < 1e-12, 'C#4 uses C4 at exactly one semitone up');
  assert.equal(h.context.decodeCalls, 3);
  h.advance(0.6);
  const beat = h.player.beat;
  await h.player.setInstrument('soft');
  assert.equal(h.player.state, 'playing');
  assert.equal(h.player.beat, beat);
  assert.equal(h.context.decodeCalls, 3, 'switching presets reuses the same decoded bank');
  assert.ok(h.context.filters.some(filter => filter.type === 'highshelf' && filter.gain.value < 0));
  await h.player.setInstrument('bright');
  assert.equal(h.context.decodeCalls, 3);
  assert.ok(h.context.filters.some(filter => filter.type === 'highshelf' && filter.gain.value > 0));
  await h.player.dispose();
});

test('sample pause cancels scheduled sources; seek resumes the original recording at its elapsed offset', async () => {
  const h = harness(makeScore([{ id: 'held', beat: 0, duration: 10, midi: 61, hand: 'right' }]), sampleOptions());
  await h.player.play();
  h.advance(0.4);
  const original = h.context.bufferSources[0];
  h.player.pause();
  assert.ok(original.stops.at(-1) <= h.context.currentTime + 0.016);
  h.player.seek(4);
  await h.player.play();
  const resumed = h.context.bufferSources.at(-1);
  assert.ok(Math.abs(resumed.offset - 2 * 2 ** (1 / 12)) < 1e-12,
    'at beat 4 / 120 BPM, seek enters two seconds into the resampled source instead of replaying its attack');
  h.player.configure({ volume: 0 });
  assert.equal(h.player._master.gain.value, 0);
  h.player.stop();
  assert.ok(h.context.bufferSources.every(source => source.stops.at(-1) <= h.context.currentTime + 0.016));
  await h.player.dispose();
});

test('sampled loop pre-schedules its next attack and keeps hand muting independent', async () => {
  const h = harness(makeScore([
    { id: 'right', beat: 1, duration: 0.25, midi: 61, hand: 'right' },
    { id: 'left', beat: 1, duration: 0.25, midi: 49, hand: 'left' },
  ], { durationBeats: 8 }), sampleOptions());
  h.player.configure({ loopEnabled: true, loopStart: 1, loopEnd: 2, leftEnabled: false });
  await h.player.play();
  const firstAttack = h.context.bufferSources[0].started;
  h.advance(0.45);
  assert.equal(h.context.bufferSources.length, 2, 'one right-hand source per loop; the left hand creates no audio source');
  assert.ok(Math.abs(h.context.bufferSources[1].started - firstAttack - 0.5) < 1e-9);
  h.advance(0.15);
  assert.ok(h.player.beat >= 1 && h.player.beat < 2);
  await h.player.dispose();
});

test('stop during sample loading prevents a delayed keyboard preview from sounding', async () => {
  let releaseFetch;
  const fetched = new Promise(resolve => { releaseFetch = resolve; });
  const h = harness(makeScore([{ id: 'preview', beat: 0, duration: 1, midi: 60, hand: 'right' }]), sampleOptions({
    sampleManifest: { samples: [{ midi: 60, file: 'C4.mp3' }] },
    sampleFetcher: async () => { await fetched; return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) }; },
  }));
  const preview = h.player.notePreview(60);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  h.player.stop();
  releaseFetch();
  await preview;
  assert.equal(h.context.bufferSources.length, 0);
  assert.equal(h.player.state, 'stopped');
  await h.player.notePreview(60);
  assert.equal(h.context.bufferSources.length, 1, 'a new explicit preview can use the completed cache');
  await h.player.dispose();
});

test('sample failure remains an explicit error until the user selects the synthesis fallback', async () => {
  const h = harness(makeScore([{ id: 'failed', beat: 0, duration: 2, midi: 60, hand: 'right' }]), sampleOptions({
    sampleFetcher: async () => ({ ok: false }),
  }));
  await assert.rejects(h.player.play(), /采样/);
  assert.equal(h.player.instrumentState.status, 'error');
  assert.equal(h.player.instrument, 'piano');
  assert.equal(h.context.oscillators.length, 0);
  assert.equal(h.context.bufferSources.length, 0);
  await h.player.setInstrument('synth');
  await h.player.play();
  assert.equal(h.player.instrumentState.engine, 'synth');
  assert.ok(h.context.oscillators.length > 0);
  await h.player.dispose();
});

test('audio clock maps tempo to quarter notes and keeps position while paused', async () => {
  const h = harness(makeScore([{ id: 'a', beat: 0, duration: 12, midi: 60, hand: 'right' }]));
  await h.player.play();
  h.advance(0.5);
  const first = h.player.beat;
  h.advance(0.5);
  assert.ok(Math.abs(h.player.beat - first - 1) < 1e-9, '120 BPM advances one beat every half second');
  h.player.pause();
  const paused = h.player.beat;
  const sounding = h.context.oscillators.slice();
  h.advance(10);
  assert.equal(h.player.beat, paused);
  assert.ok(sounding.every(node => node.stops.at(-1) <= 1.02), 'pause cancels every scheduled oscillator');
  h.player.configure({ tempo: 60 });
  await h.player.play();
  h.advance(0.5);
  const slower = h.player.beat;
  h.advance(0.5);
  assert.ok(Math.abs(h.player.beat - slower - 0.5) < 1e-9);
  assert.deepEqual(h.states, ['playing', 'paused', 'playing']);
  await h.player.dispose();
});

test('seek revoices a sustained note and hand switches cancel old audio', async () => {
  const h = harness(makeScore([
    { id: 'right', beat: 0, duration: 8, midi: 72, hand: 'right' },
    { id: 'left', beat: 0, duration: 8, midi: 48, hand: 'left' },
  ]));
  await h.player.play();
  const initial = h.context.oscillators.length;
  assert.ok(initial >= 12);
  h.player.seek(4);
  assert.ok(h.context.oscillators.length >= initial * 2, 'seeking into held notes sounds the remaining sustain');
  assert.equal(h.player.beat, 4);
  h.player.configure({ rightEnabled: false });
  assert.deepEqual(h.frames.at(-1).notes.map(note => note.id), ['left']);
  const active = h.context.oscillators.filter(node => node.stops.at(-1) > h.context.currentTime + 0.02);
  assert.equal(active.length, initial / 2, 'all old voices are cancelled and only one hand is scheduled');
  assert.ok(active[0].frequency.value > 130 && active[0].frequency.value < 132, 'the remaining fundamental is C3');
  h.player.stop();
  assert.equal(h.player.beat, 0);
  await h.player.dispose();
});

test('loop wraps on audio time and pre-schedules the next iteration without a timer gap', async () => {
  const h = harness(makeScore([{ id: 'loop', beat: 1, duration: 0.25, midi: 60, hand: 'right' }], { durationBeats: 8 }));
  h.player.configure({ loopEnabled: true, loopStart: 1, loopEnd: 2 });
  await h.player.play();
  const firstAttack = h.context.oscillators[0].started;
  h.advance(0.45);
  const laterAttack = h.context.oscillators.find(node => node.started > firstAttack + 0.4)?.started;
  assert.ok(laterAttack, 'the next loop is scheduled before the wrap is reached');
  assert.ok(Math.abs(laterAttack - firstAttack - 0.5) < 1e-9);
  h.advance(0.15);
  assert.ok(h.player.beat >= 1 && h.player.beat < 2);
  h.advance(5);
  assert.ok(h.player.beat >= 1 && h.player.beat < 2, 'a delayed browser callback does not accumulate transport drift');
  assert.equal(h.player.state, 'playing');
  await h.player.dispose();
});

test('end preserves the last beat, cancels sound, and restart begins at zero', async () => {
  const h = harness(makeScore([{ id: 'end', beat: 0, duration: 1, midi: 60, hand: 'right' }]));
  await h.player.play();
  h.advance(0.7);
  assert.equal(h.player.state, 'stopped');
  assert.equal(h.player.beat, 1);
  assert.deepEqual(h.frames.at(-1), { beat: 1, notes: [] });
  await h.player.play();
  assert.equal(h.player.beat, 0);
  await h.player.dispose();
});

test('stop wins over an audio context permission promise', async () => {
  const h = harness(makeScore([{ id: 'pending', beat: 0, duration: 1, midi: 60, hand: 'right' }]));
  let resume;
  h.context.resume = () => new Promise(resolve => { resume = resolve; });
  const playing = h.player.play();
  await Promise.resolve();
  h.player.stop();
  resume();
  await playing;
  assert.equal(h.player.state, 'stopped');
  assert.equal(h.context.oscillators.length, 0);
  await h.player.dispose();
});

test('MIDI preserves both hands, tempo, onset, duration and piano program', () => {
  const score = makeScore([
    { id: 'r', beat: 1, duration: 1.5, midi: 64, hand: 'right', velocity: 0.8 },
    { id: 'l', beat: 0, duration: 4, midi: 48, hand: 'left', velocity: 0.5 },
  ], { tempo: 60, timeSignature: [3, 4] });
  const bytes = exportMidi(score);
  assert.ok(bytes instanceof Uint8Array);
  const midi = new Midi(bytes);
  assert.equal(midi.header.tempos[0].bpm, 60);
  assert.deepEqual(midi.header.timeSignatures[0].timeSignature, [3, 4]);
  assert.equal(midi.tracks.length, 2);
  assert.equal(midi.tracks[0].notes[0].time, 1);
  assert.equal(midi.tracks[0].notes[0].duration, 1.5);
  assert.equal(midi.tracks[1].notes[0].midi, 48);
  assert.ok(midi.tracks.every(track => track.instrument.number === 0));
});

test('MusicXML round-trips polyphony, chord, rests, crossed bar ties and tuplets', async () => {
  const { importMusicXML } = await import('../lib/importers.mjs');
  const score = makeScore([
    { id: 'r1', beat: 0, duration: 5, midi: 60, hand: 'right' },
    { id: 'r2', beat: 0, duration: 5, midi: 64, hand: 'right' },
    { id: 'r3', beat: 1, duration: 1 / 3, midi: 67, hand: 'right' },
    { id: 'r4', beat: 3, duration: 0.5, midi: 69, hand: 'right' },
    { id: 'l1', beat: 1, duration: 1.5, midi: 49, hand: 'left' },
  ], { title: '<练习> & "乐曲"', composer: 'A & B', keySignature: -3,
    source: { kind: 'original', label: '我的 <原创>', license: 'CC0', url: 'https://example.com/?a=1&b=2' }, durationBeats: 5.5 });
  const xml = exportMusicXML(score);
  assert.equal(XMLValidator.validate(xml), true);
  assert.ok(xml.includes('<chord/>'));
  assert.ok(xml.includes('<tied type="start"/>'));
  assert.ok(xml.includes('<time-modification>'));
  assert.ok(xml.includes('&lt;练习&gt; &amp; &quot;乐曲&quot;'));
  const { score: imported } = importMusicXML(xml);
  assert.equal(imported.title, score.title);
  assert.equal(imported.composer, score.composer);
  assert.equal(imported.tempo, 120);
  assert.equal(imported.keySignature, -3);
  assert.equal(imported.durationBeats, 5.5);
  const signature = notes => notes.map(n => [n.beat, Number(n.duration.toFixed(5)), n.midi, n.hand])
    .sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  assert.deepEqual(signature(imported.notes), signature(score.notes));
});
