// Optional developer export: requires Playwright + Chromium and a Vite server.
// The app itself has no Playwright dependency. See README for invocation.
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const { chromium } = await import(process.env.QINBAN_PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.argv[2] || 'http://127.0.0.1:5173';
const destination = resolve(fileURLToPath(new URL('../output/timbres/', import.meta.url)));
await mkdir(destination, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'qinban-timbres-'));
const browser = await chromium.launch({ executablePath: process.env.QINBAN_CHROMIUM || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true });
const metadata = [];
try {
  const page = await browser.newPage();
  await page.route('**/instrument-demo-render', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>琴伴音色导出</title>' }));
  await page.goto(new URL('/instrument-demo-render', baseURL).href);
  for (const [id, label, file] of [['warm', '醇厚三角钢琴', 'warm-grand.mp3'], ['violin', '温暖小提琴', 'violin.mp3'], ['strings', '柔和弦乐合奏', 'strings.mp3']]) {
    const result = await page.evaluate(async instrument => {
      const { PianoPlayer } = await import('/src/audio.js');
      const { instrumentDemoScore } = await import('/lib/instrument-demo.mjs');
      const score = instrumentDemoScore(instrument);
      const sampleRate = 44100;
      const length = Math.ceil((score.durationBeats * 60 / score.tempo + 3) * sampleRate);
      const context = new OfflineAudioContext(2, length, sampleRate);
      const player = new PianoPlayer({ instrument, audioContextFactory: () => context });
      await player.setInstrument(instrument);
      // Use the app's voice scheduler, gain, filtering and shared room unchanged.
      for (const note of score.notes) player._piano(note.midi, 0.05 + note.beat * 60 / score.tempo, note.duration * 60 / score.tempo, note.velocity);
      const rendered = await context.startRendering();
      const left = rendered.getChannelData(0), right = rendered.getChannelData(1);
      const pcm = new Uint8Array(length * 4);
      const view = new DataView(pcm.buffer);
      let peak = 0, energy = 0, phraseEnergy = 0;
      for (let frame = 0; frame < length; frame++) {
        for (const [channel, data] of [[0, left], [1, right]]) {
          const value = data[frame];
          peak = Math.max(peak, Math.abs(value));
          energy += value * value;
          if (frame < sampleRate * 4.6) phraseEnergy += value * value;
          view.setInt16(frame * 4 + channel * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true);
        }
      }
      let binary = '';
      for (let i = 0; i < pcm.length; i += 16384) binary += String.fromCharCode(...pcm.subarray(i, i + 16384));
      await player.dispose();
      return { pcm: btoa(binary), sampleRate, seconds: length / sampleRate, peak, rms: Math.sqrt(energy / (length * 2)), phraseRms: Math.sqrt(phraseEnergy / (sampleRate * 4.6 * 2)) };
    }, id);
    const pcm = Buffer.from(result.pcm, 'base64');
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
    header.writeUInt32LE(result.sampleRate, 24); header.writeUInt32LE(result.sampleRate * 4, 28);
    header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    const wav = join(temporary, `${id}.wav`);
    await writeFile(wav, Buffer.concat([header, pcm]));
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '192k', '-metadata', `title=${label} · 暖光`, join(destination, file)]);
    const { pcm: omitted, ...stats } = result;
    metadata.push({ id, label, file, ...stats });
    console.log(JSON.stringify(metadata.at(-1)));
  }
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(metadata, null, 2) + '\n');
  await writeFile(join(destination, 'README.txt'),
    '暖光 · 琴伴原创音色试听\n\n' +
    'warm-grand.mp3：醇厚三角钢琴，参考 Steinway 听感，以 Salamander Yamaha C5 录音调音。\n' +
    'violin.mp3：温暖小提琴，独奏旋律与持续长音。\n' +
    'strings.mp3：柔和弦乐合奏，分音区声部与持续和弦。\n\n' +
    '均由应用同一套 Web Audio 发声与效果处理离线导出，44.1 kHz 立体声，MP3 192 kbps。\n' +
    '钢琴与合奏第二段加入低音和弦；小提琴保持独奏。末尾长音用于试听延音。\n' +
    '钢琴录音：Salamander Grand Piano，Alexander Holm，CC BY 3.0。\n' +
    'https://creativecommons.org/licenses/by/3.0/\n' +
    'https://github.com/Tonejs/audio/tree/869b6f8d9cddb47d966238c012041480b1ce517a/salamander\n' +
    '调整：移调、EQ、包络、空间混响及旋律编排。\n' +
    '弦乐录音：VSCO 2 CE，Sam Gossner / Simon Dalzell，剪辑 Elan Hickler / Soundemote，CC0。\n' +
    'https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e\n');
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
