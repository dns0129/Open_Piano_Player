import {createPerformanceTimeline} from '../lib/score-representations.ts';
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
  playbackRate = new FakeParam(); Q = new FakeParam(); pan = new FakeParam();
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
  convolvers = [];
  stereoNodes = [];
  decodeCalls = 0;
  state = 'running';
  createGain() { return new FakeNode(); }
  createDynamicsCompressor() { return new FakeNode(); }
  createOscillator() { const node = new FakeNode(); this.oscillators.push(node); return node; }
  createBufferSource() { const node = new FakeNode(); this.bufferSources.push(node); return node; }
  createBiquadFilter() { const node = new FakeNode(); this.filters.push(node); return node; }
  createStereoPanner() { return new FakeNode(); }
  createChannelSplitter() { const node = new FakeNode(); this.stereoNodes.push(node); return node; }
  createChannelMerger() { const node = new FakeNode(); this.stereoNodes.push(node); return node; }
  createConvolver() { const node = new FakeNode(); this.convolvers.push(node); return node; }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, duration: length / sampleRate, getChannelData: channel => data[channel] };
  }
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

test('performed effects drive real piano scheduling, and typed 300 BPM keeps the audio clock in sync',async()=>{
  const h=harness(makeScore([
    {id:'tie-a',beat:0,duration:1,midi:60,hand:'right',velocity:.28,tieTo:'tie-b'},
    {id:'tie-b',beat:1,duration:1,midi:60,hand:'right'},
    ...[60,64,67].map((midi,i)=>({id:`arp-${i}`,beat:2,duration:1,midi,hand:'right',arpeggio:'down'})),
    {id:'trill',beat:3,duration:1,midi:64,hand:'right',ornament:'trill'},
  ],{durationBeats:8}),sampleOptions());
  await h.player.play();assert.equal(h.context.bufferSources.length,1,'tied heads use one sample attack');
  for(let i=0;i<5;i++)h.advance(.1);assert.equal(h.context.bufferSources.length,1,'the second tied head must not strike again');
  h.player.seek(2);const arp=h.context.bufferSources.slice(-3);assert.equal(arp.length,3);
  assert.ok(arp[0].started<arp[1].started&&arp[1].started<arp[2].started);
  assert.ok(arp[0].playbackRate.value>arp[1].playbackRate.value,'descending arpeggio starts on the highest pitch');
  h.player.configure({tempo:300});const before=h.player.beat;h.advance(.218);
  assert.ok(Math.abs(h.player.beat-before-1)<1e-8,'300 BPM advances five beats per second after the schedule anchor');
  const previewStart=h.context.bufferSources.length;
  await h.player.previewNotes(h.player._score,'trill');assert.equal(h.context.bufferSources.length-previewStart,8);
  const previewSources=h.context.bufferSources.slice(previewStart);h.player.stopPreview();
  assert.ok(previewSources.every(s=>s.stops.at(-1)<=h.context.currentTime+.016),'closing the editor cancels preview attacks without moving the practice beat');
  await h.player.dispose();
});

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

const bowedBank = (roots = [69], overrides = {}) => ({
  manifest: { samples: roots.map(midi => ({ midi, file: `${midi}.mp3`, loopStart: 0.9, loopEnd: 4.1, pan: -0.1 })) },
  fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }), ...overrides,
});

test('warm grand reuses piano recordings and shares one room across chord voices', async () => {
  const h = harness(makeScore([60, 64, 67].map((midi, i) => ({ id: `chord-${i}`, beat: 0, duration: 4, midi }))), sampleOptions({ instrument: 'warm' }));
  await h.player.play();
  assert.equal(h.context.decodeCalls, 3);
  assert.equal(h.context.bufferSources.length, 3);
  assert.equal(h.context.convolvers.length, 1);
  assert.ok(h.context.filters.some(filter => filter.type === 'peaking' && filter.gain.value > 0));
  const room = h.player._room;
  await h.player.setInstrument('piano');
  assert.equal(h.context.decodeCalls, 3);
  assert.equal(h.player._room, null, 'the previous room must stop on instrument changes');
  assert.ok(h.player._retiredRooms.has(room));
  await h.player.dispose();
  assert.equal(room.input.disconnected, true);
});

test('warm grand damps treble sooner than bass and cleans up its tone and room filters', async () => {
  const h = harness(makeScore([{ id: 'key', beat: 0, duration: 1, midi: 60 }]), sampleOptions({ instrument: 'warm' }));
  for (const midi of [36, 60, 84]) await h.player.notePreview(midi);
  const ends = [...h.player._voices].map(voice => voice.end);
  assert.ok(ends[0] > ends[1] && ends[1] > ends[2], 'bass resonance lasts longer without blurring the treble');
  assert.ok(Math.abs((ends[0] - ends[2]) - 0.48) < 1e-8);
  assert.ok(h.context.filters.some(filter => filter.type === 'lowshelf' && filter.gain.value > 0), 'weight includes the low fundamental region');
  assert.ok(h.context.filters.some(filter => filter.type === 'peaking' && filter.gain.value < 0), 'low-mid boxiness is controlled separately');
  assert.ok(h.context.filters.some(filter => filter.type === 'highpass' && filter.frequency.value === 160), 'room tail cannot accumulate the boosted low bass');
  assert.equal(h.context.convolvers.length, 1, 'all registers share one room');
  await h.player.dispose();
  // The fake context does not dispatch the real AudioBufferSourceNode ended event.
  for (const source of h.context.bufferSources) source.onended?.();
  assert.ok(h.context.filters.every(filter => filter.disconnected), 'per-note EQ and shared room filters are all disconnected');
});

test('A3 reference shares recordings, preserves transport, and retires its focused stereo room', async () => {
  const h = harness(makeScore([{ id: 'held', beat: 0, duration: 16, midi: 60 }]), sampleOptions({ instrument: 'warm' }));
  await h.player.play(); h.advance(0.2);
  const beat = h.player.beat;
  await h.player.setInstrument('a3-reference');
  assert.equal(h.player.state, 'playing'); assert.equal(h.player.beat, beat);
  assert.equal(h.context.decodeCalls, 3, 'reference uses the existing piano bank');
  assert.equal(h.context.stereoNodes.length, 2, 'one splitter/merger pair for the shared room');
  assert.ok(h.context.filters.some(f => f.type === 'peaking' && f.frequency.value === 330));
  await h.player.setInstrument('warm');
  assert.equal(h.context.decodeCalls, 3);
  await h.player.dispose();
  assert.ok(h.context.stereoNodes.every(node => node.disconnected));
});

test('bowed strings sustain beyond the recording and seek into the transposed loop', async () => {
  const h = harness(makeScore([{ id: 'long', beat: 0, duration: 40, midi: 70 }]), {
    instrument: 'violin', sampleBanks: { violin: bowedBank() },
  });
  await h.player.play();
  const source = h.context.bufferSources[0];
  const rate = 2 ** (1 / 12);
  assert.equal(source.loop, true);
  assert.equal(source.loopStart, 0.9);
  assert.equal(source.loopEnd, 4.1);
  assert.ok(source.stops[0] > 20, 'a held note must not end at the eight-second source duration');
  h.player.seek(24);
  const resumed = h.context.bufferSources.at(-1);
  const expected = 0.9 + (12 * rate - 0.9) % 3.2;
  assert.ok(Math.abs(resumed.offset - expected) < 1e-9);
  assert.ok(resumed.offset >= resumed.loopStart && resumed.offset < resumed.loopEnd);
  await h.player.dispose();
});

test('piano, solo violin and ensemble keep independent caches and preserve transport on switches', async () => {
  const h = harness(makeScore([{ id: 'low', beat: 0, duration: 20, midi: 37, hand: 'left' }]), sampleOptions({
    sampleBanks: { violin: bowedBank(), strings: bowedBank([36, 60]) },
  }));
  await h.player.play();
  h.advance(0.4);
  const beat = h.player.beat;
  await h.player.setInstrument('violin');
  const violinBuffer = h.context.bufferSources.at(-1).buffer;
  await h.player.setInstrument('strings');
  assert.equal(h.player.beat, beat);
  assert.equal(h.player.state, 'playing');
  assert.equal(h.context.bufferSources.at(-1).playbackRate.value, 2 ** (1 / 12), 'low ensemble note uses its cello root');
  assert.notEqual(h.context.bufferSources.at(-1).buffer, violinBuffer);
  assert.equal(h.context.decodeCalls, 6);
  await h.player.setInstrument('warm');
  await h.player.setInstrument('violin');
  assert.equal(h.context.decodeCalls, 6);
  assert.equal(h.context.bufferSources.at(-1).buffer, violinBuffer);
  await h.player.dispose();
});

test('a slower bank load cannot replace the most recently selected instrument', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const h = harness(makeScore([{ beat: 0, duration: 12, midi: 69 }]), {
    sampleBanks: {
      violin: bowedBank([69], { fetcher: async () => { await waiting; return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) }; } }),
      strings: bowedBank([60]),
    },
  });
  await h.player.play();
  const pending = h.player.setInstrument('violin');
  await Promise.resolve();
  await h.player.setInstrument('strings');
  const selectedBuffer = h.context.bufferSources.at(-1).buffer;
  release();
  await pending;
  assert.equal(h.player.instrumentState.activeId, 'strings');
  assert.equal(h.player.instrumentState.id, 'strings');
  h.player.seek(1);
  assert.equal(h.context.bufferSources.at(-1).buffer, selectedBuffer);
  await h.player.dispose();
});

test('stop cancels every future attack of an instrument preview and its room', async () => {
  const h = harness(makeScore([{ beat: 0, duration: 4, midi: 69 }]), {
    instrument: 'violin', sampleBanks: { violin: bowedBank() },
  });
  await h.player.previewInstrument();
  assert.equal(h.context.bufferSources.length, 6);
  assert.ok(h.context.bufferSources.at(-1).started > 2);
  h.player.stop();
  assert.ok(h.context.bufferSources.every(source => source.stops.at(-1) <= 0.016));
  assert.equal(h.player._room, null);
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

test('natural end preserves the last beat and scheduled release; restart begins at zero', async () => {
  const h = harness(makeScore([{ id: 'end', beat: 0, duration: 1, midi: 60, hand: 'right' }]));
  await h.player.play();
  const voices = h.context.oscillators.slice();
  const scheduledStops = voices.map(node => node.stops[0]);
  h.advance(0.7);
  assert.equal(h.player.state, 'stopped');
  assert.equal(h.player.beat, 1);
  assert.deepEqual(voices.map(node => node.stops), scheduledStops.map(time => [time]), 'natural completion must preserve the release envelope');
  assert.deepEqual(h.frames.at(-1), { beat: 1, notes: [] });
  await h.player.play();
  assert.equal(h.player.beat, 0);
  assert.ok(voices.every(node => node.stops.at(-1) <= 0.716), 'restarting cancels any previous tail');
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
  assert.deepEqual(signature(createPerformanceTimeline(imported).notes), signature(createPerformanceTimeline(score).notes));
});

test('tempo steps schedule exact attacks and keep seek, speed scaling and audio progress aligned',async()=>{
 const h=harness(makeScore([{id:'a',beat:0,duration:4,midi:60,hand:'right'},{id:'b',beat:4,duration:4,midi:64,hand:'right'}],{durationBeats:8,tempoMap:[{beat:2,bpm:60,curve:'step'}]}));
 const attacks=[];h.player._piano=(midi,time,duration,velocity,elapsed)=>attacks.push({midi,time,duration,elapsed});
 await h.player.play();assert.equal(h.player.durationSeconds,7);assert.ok(Math.abs(attacks[0].duration-3)<1e-8);
 h.advance(1.518);assert.ok(Math.abs(h.player.beat-2.5)<1e-8);
 h.player.seek(4);assert.equal(h.player.beat,4);assert.equal(attacks.at(-1).midi,64);assert.ok(Math.abs(attacks.at(-1).duration-4)<1e-8);
 h.player.configure({tempo:60});assert.equal(h.player.durationSeconds,14);h.advance(1.018);assert.ok(Math.abs(h.player.beat-4.5)<1e-8);
 await h.player.dispose();
});

test('fermata freezes written position while elapsed time advances; pause/resume and loops retain the hold',async()=>{
 const h=harness(makeScore([{id:'held',beat:0,duration:2,midi:60,hand:'right',fermata:{holdBeats:2}},{id:'after',beat:2,duration:2,midi:64,hand:'right'}],{durationBeats:4}));
 const attacks=[];h.player._piano=(midi,time,duration,velocity,elapsed)=>attacks.push({midi,time,duration,elapsed});
 await h.player.play();assert.equal(h.player.durationSeconds,3);assert.equal(attacks[0].duration,2);
 h.advance(1.518);assert.equal(h.player.beat,2);const seconds=h.player.elapsedSeconds;h.player.pause();h.advance(8);assert.equal(h.player.elapsedSeconds,seconds);
 await h.player.play();h.advance(.218);assert.equal(h.player.beat,2);h.advance(.4);assert.ok(h.player.beat>2);
 h.player.pause();h.player.configure({loopEnabled:true,loopStart:0,loopEnd:2});h.player.seek(0);await h.player.play();
 const initial=attacks.at(-1).time;h.advance(1.95);assert.ok(Math.abs(attacks.at(-1).time-initial-2)<1e-8,'next loop includes the full final fermata');h.advance(.2);assert.ok(h.player.beat<1);
 await h.player.dispose();
});

test('linear ramp and grace actual audio events match MIDI timing without rewriting written score',async()=>{
 const score=makeScore([{id:'main',beat:0,duration:4,midi:60,hand:'right',grace:{notes:[{midi:62},{midi:64}],placement:'on',slash:true,stealBeats:.25}},{id:'left',beat:0,duration:4,midi:48,hand:'left'}],{tempoMap:[{beat:0,bpm:120,curve:'linear'},{beat:4,bpm:60,curve:'step'}]});
 const h=harness(score),attacks=[];h.player._piano=(midi,time,duration)=>attacks.push({midi,time,duration});await h.player.play();
 for(let i=0;i<10;i++)h.advance(.1);
 const midi=new Midi(exportMidi(score)),notes=midi.tracks.flatMap(t=>t.notes);for(const a of attacks){const n=notes.find(n=>n.midi===a.midi);assert.ok(n);assert.ok(Math.abs(a.time-.018-n.time)<.003);assert.ok(Math.abs(a.duration-n.duration)<.003);}
 assert.equal(score.notes[0].beat,0);assert.equal(score.notes[0].duration,4);await h.player.dispose();
});

test('previewing a before-beat grace group starts at its first grace instead of scheduling in the past',async()=>{
 const score=makeScore([{id:'main',beat:4,duration:2,midi:60,hand:'right',grace:{notes:[{midi:62},{midi:64}],placement:'before',slash:true,stealBeats:.25}}]);const h=harness(score),events=[];h.player._piano=(midi,time,duration)=>events.push({midi,time,duration});await h.player.previewNotes(score,'main');assert.equal(events.length,3);assert.equal(events[0].midi,62);assert.ok(events.every(e=>e.time>=h.context.currentTime+.018));assert.ok(events[0].time<events[1].time&&events[1].time<events[2].time);await h.player.dispose();
});
