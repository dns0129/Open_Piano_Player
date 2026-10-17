// Golden Hour · 网易云乐谱 664959（钢琴谱，编配：咲阿柚），9页55小节逐音转写。
// 原谱为12/8、E大调，每小节6个四分拍；每个声部的事件（含休止）必须恰好填满小节。
// 音名已按调号与临时记号写成实际音高；8va 段落直接写入实际（高八度）音高。
// 用法：node scripts/build-golden-hour.mjs  → 写入云端曲库 score-repo/scores/golden-hour-netease-664959.json
import { validateScore } from '../lib/score.mjs';
import { addScore } from '../lib/score-repository.mjs';

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = name => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`无效音名 ${name}`);
  return 12 * (Number(m[3]) + 1) + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const list = text => text.trim().split(/\s+/);
// 事件：[时值, ...音名]；无音名即休止。和弦音以 + 连接。
const ev = (duration, chord = '') => [duration, ...(chord ? chord.split('+') : [])];
const run = (duration, text) => list(text).map(chord => ev(duration, chord));
const six = text => run(0.25, text);
const dq = (...chords) => chords.map(chord => ev(1.5, chord));
const rest = duration => [ev(duration)];
const rep = (n, events) => Array.from({ length: n }, () => events).flat();

// 右手常用十六分音型
const RA = 'F#5 G#5 B5 C#6 B5 G#5';
const RF = 'E5 F#5 A5 B5 A5 F#5';
const RE = 'D#5 E5 F#5 G#5 F#5 E5';
const RL = 'F#4 G#4 B4 C#5 B4 G#4';
const RM = 'E4 F#4 A4 B4 A4 F#4';
const RD = 'D#4 E4 F#4 G#4 F#4 E4';
const OCT = 'D#5+D#6 E5+E6 F#5+F#6 G#5+G#6 F#5+F#6 E5+E6';
const top = (first, tail) => `${first} ${list(tail).slice(1).join(' ')}`;
const H = first => `${first} G#5 B5 C#6 B5 G#5`;
const J = first => `${first} G#5 B5 G#5 B5 G#5`;
const R = (...groups) => groups.flatMap(six);

// 左手常用十六分音型（高音谱号段落）
const LA = 'A4 C#5 E5 C#5 E5 C#5';
const LGs = 'G#4 B4 D#5 B4 D#5 B4';
const LGn = 'G4 B4 D#5 B4 D#5 B4';
const LF = 'F#4 A4 C#5 A4 C#5 A4';
const LE = 'E4 G#4 B4 G#4 B4 G#4';

const bar = {};
bar[1] = { rh: R(RA, RA, RA, RA), lh: R(LA, LA, LA, LA) };
bar[2] = { rh: R(RA, RA, RA, RA), lh: R(LGs, LGs, LGs, LGn) };
bar[3] = { rh: R(RF, RF, RF, RF), lh: R(LF, LF, LF, LF) };
bar[4] = { rh: R(RE, RE, RE, RE), lh: R(LE, LE, LE, LE) };
bar[5] = { rh: R(RA, H('G#5+G#6'), RA, RA), lh: R(LA, LA, LA, LA) };
bar[6] = { rh: bar[5].rh, lh: bar[2].lh };
bar[7] = { rh: R(RF, top('F#5+F#6', RF), RF, top('F#5+F#6', RF)), lh: R(LF, LF, LF, LF) };
bar[8] = { rh: R(RE, top('D#5+D#6', RE), top('E5+E6', RE), top('F#5+F#6', RE)), lh: R(LE, LE, LE, LE) };
bar[9] = { rh: R(RL, RL, RL, RL), lh: dq('A1+A2', 'A3+C#4+E4', 'A1+A2', 'E3+A3+E4') };
bar[10] = { rh: R(RL, RL, RL, RL), lh: dq('G#1+G#2', 'G#3+B3+D#4', 'G#1+G#2', 'G1+G2') };
bar[11] = { rh: R(RM, top('E4+E5', RM), RM, top('E4+E5', RM)), lh: dq('F#1+F#2', 'F#3+A3+C#4', 'F#1+F#2', 'C#3+A3+C#4') };
bar[12] = { rh: dq('G#3+G#4', 'C#4+C#5', 'E4+E5', 'F#4+F#5'), lh: [...run(0.5, rep(9, ['G#1+G#2']).join(' ')), ...rest(1.5)] };
bar[13] = { rh: R(H('G#5+G#6'), RA, RA, RA), lh: [...dq('A1+A2', 'E3+A3+C#4'), ev(3, 'G#4+A4+C#5+E5')] };
bar[14] = { rh: R(H('C#5+C#6'), H('D#5+D#6'), H('B5+B6'), H('A5+A6')), lh: dq('A1+A2', 'A3+C#4+E4', 'A4+C5+E5+G#5', 'A4+C5+E5') };
bar[15] = { rh: R(H('G#5+G#6'), RA, RE, OCT), lh: dq('E1+E2', 'E3+G#3+B3+D#4', 'C#4+E4+G#4+B4', 'E4+G#4+B4') };
bar[16] = { rh: R(RE, J('D#5+D#6'), J('E5+E6'), 'F#5+F#6 E5+G#5 F#5+B5 G#5+C#6 F#5+B5 E5+G#5'), lh: dq('E1+E2', 'E3+G#3+B3', 'F#1+F#2', 'G#1+G#2') };
bar[17] = bar[13];
bar[18] = bar[14];
bar[19] = { rh: R(top('G#5+G#6', RE), RE, RE, OCT), lh: dq('E1+E2', 'E3+G#3+B3+D#4', 'E4+G#4+B4', 'E4+G#4+B4') };
const R20 = R(RE, RE, top('B4+D#5', RE), 'E4+D#5 G#4+E5 B4+F#5 G#4+G#5 B4+F#5 G#4+E5');
bar[20] = { rh: R20, lh: dq('E1+E2', 'E3+G#3+B3+D#4', 'E3+G#3+B3+D4', 'E3+G#3+B3+E4') };
bar[21] = bar[5];
for (let n = 22; n <= 26; n++) bar[n] = bar[n - 16];
bar[27] = { rh: bar[11].rh, lh: [...dq('F#1+F#2'), ...run(0.5, 'A3+C#4+G#4 E4 C#4'), ...dq('F#1+F#2', 'C#3+A3+C#4')] };
bar[28] = { rh: R(RD, RD, RD, RD), lh: [...dq('E1+E2'), ...run(0.5, 'E3+G#3+B3 A3 B3'), ...dq('E1+E2', 'E3+B3')] };
const kick = (low, tail) => [ev(0.5, low), ...six(tail).slice(0, 4)];
bar[29] = { rh: R(RL, RL, RL, RL), lh: [...kick('A1+A2', 'E4 C#4 E4 C#4'), ...six('A3+C#4+E4 C#4 E4 C#4 E4 C#4'), ...kick('A1+A2', 'E4 C#4 E4 C#4'), ...six('E3+A3+E4 C#4 E4 C#4 E4 C#4')] };
bar[30] = { rh: R(RL, RL, RL, RL), lh: [...kick('G#1+G#2', 'D#4 B3 D#4 B3'), ...six('G#3+B3+D#4 B3 D#4 B3 D#4 B3'), ...kick('G#1+G#2', 'D#4 B3 D#4 B3'), ...kick('G1+G2', 'D#4 B3 D#4 B3')] };
bar[31] = { rh: bar[11].rh, lh: run(0.5, 'F#1+D#2+F#2 F#2+F#3 F#2+F#3 F#2+F#3 F#2+F#3 F#2+F#3 F#1+D#2+F#2 F#2+F#3 F#2+F#3 F#2+F#3 F#2+F#3 F#2+F#3') };
bar[32] = bar[12];
bar[33] = bar[13];
bar[34] = bar[14];
bar[35] = bar[15];
bar[36] = bar[16];
const L37 = [...kick('A1+A2', 'E4 C#4 E4 C#4'), ...dq('E3+A3+C#4', 'G#4+A4+C#5+E5'), ...six('A4 C#5 E5 C#5 E5 C#5')];
bar[37] = { rh: R(H('G#5+G#6'), RA, RA, RA), lh: L37 };
const L38 = [...kick('A1+A2', 'E4 C#4 E4 C#4'), ...six('A3+C#4+E4 C#4 E4 C#4 E4 C#4'), ...dq('A4+C5+E5+G#5', 'A4+C5+E5')];
bar[38] = { rh: bar[14].rh, lh: L38 };
const L39 = [...kick('E1+E2', 'B3 G#3 B3 G#3'), ...six('E3+G#3+B3+D#4 G#3 B3 G#3 B3 G#3'), ...dq('E4+G#4+B4', 'E4+G#4+B4')];
bar[39] = { rh: bar[19].rh, lh: L39 };
bar[40] = { rh: R20, lh: [...dq('E1+E2', 'E3+G#3+B3+D#4'), ev(3, 'E3+G#3+B3+D4')] };
bar[41] = { rh: [ev(6, 'G#5+G#6')], lh: [ev(4, 'A4'), ...rest(1.5), ev(0.5, 'D#4')] };
bar[42] = { rh: dq('C#5+C#6', 'D#5+D#6', 'B5+B6', 'A5+A6'), lh: [ev(2, 'C#4+A4'), ...rest(0.5), ev(0.5, 'B3'), ev(3, 'E4+A4+C5')] };
bar[43] = { rh: [ev(3, 'G#5+G#6'), ...R(RE, top('A4+D#5', RE))], lh: [ev(2, 'E3+E4'), ...run(0.5, 'C#4 E4'), ...dq('B4'), ...six('E3 G#3 B3 G#3 B3 G#3')] };
bar[44] = { rh: bar[8].rh, lh: [...six('E3 G#3 B3 G#3 B3 G#3'), ...six('E3 G#3 B3 G#3 B3 G#3'), ...dq('E1+E2', 'E1+F#2')] };
bar[45] = { rh: R(H('G#5+C#6+G#6'), RA, RA, RA), lh: L37 };
bar[46] = { rh: R(H('C#5+C#6'), H('D#5+D#6'), H('B5+F#6+B6'), H('A5+E6+A6')), lh: L38 };
bar[47] = { rh: R(top('G#5+D#6+G#6', RE), RE, RE, OCT), lh: L39 };
bar[48] = { rh: R(RE, RE, RE, 'E4+D#5 G#4+E5 B4+F#5 G#4+G#5 B4+F#5 G#4+E5'), lh: dq('E1+E2', 'E3+G#3+B3+D#4', 'E3+G#3+B3+D4', 'G#3+B3+D#4') };
bar[49] = { rh: [...dq('G#5+G#6', 'E5+E6'), ev(3, 'C#5+C#6')], lh: [ev(6, 'C#4+E4+A4')] };
bar[50] = { rh: [...dq('G#5+G#6', 'D#5+D#6'), ev(3, 'B4+B5')], lh: [ev(6, 'B3+D#4+G#4')] };
bar[51] = { rh: dq('F5+F6', 'C#5+C#6', 'C5+C6', 'G#4+G#5'), lh: [ev(6, 'G3+B3+F4')] };
bar[52] = { rh: [...dq('F5+F6', 'C#5+C#6'), ev(3, 'C5+C6')], lh: [ev(6, 'G#3+C4')] };
bar[53] = { rh: dq('D#5+D#6', 'A#4+A#5', 'D#5+D#6', 'F#5+F#6'), lh: [ev(6, 'D#3+F#3')] };
bar[54] = { rh: [...dq('A4+C5+F5'), ...rest(0.5), ...run(0.5, 'A4 C4 F4 C5 E5 F5 C5 A5')], lh: [ev(6, 'A3')] };
// 末小节：F5 附点八分 + C6 附点八分连至附点四分（合并为一个2.25拍的音），其后附点二分休止。
bar[55] = { rh: [ev(0.75, 'F5'), ev(2.25, 'C6'), ...rest(3)], lh: rest(6) };

const BAR = 6, BARS = 55;
const notes = [];
for (let n = 1; n <= BARS; n++) {
  const b = bar[n];
  if (!b) throw new Error(`缺少第 ${n} 小节`);
  for (const [hand, events] of [['right', b.rh], ['left', b.lh]]) {
    let beat = 0, index = 0;
    for (const [duration, ...pitches] of events) {
      pitches.forEach((name, voice) => {
        const value = midi(name);
        const soft = n >= 54;
        // 每组首音上方加的八度/和弦音是旋律，略微突出。
        const accent = hand === 'right' && pitches.length > 1 && voice === pitches.length - 1;
        notes.push({ id: `gh-m${n}-${hand[0]}${++index}`, beat: (n - 1) * BAR + beat, duration, midi: value, hand,
          velocity: hand === 'right' ? (accent ? 0.82 : soft ? 0.55 : 0.68) : soft ? 0.4 : 0.5 });
      });
      beat += duration;
    }
    if (Math.abs(beat - BAR) > 1e-9) throw new Error(`第 ${n} 小节${hand === 'right' ? '右' : '左'}手共 ${beat} 拍，应为 ${BAR} 拍`);
  }
}

const score = validateScore({
  version: 1,
  id: 'golden-hour-netease-664959',
  title: 'Golden Hour · 钢琴谱（9页全谱）',
  composer: 'JVKE（Jake Lawson、Zac Lawson）· 编配：咲阿柚',
  // 原谱标注“=94”（12/8，附点四分音符为拍），App 以四分音符计速：94 × 1.5 = 141。
  tempo: 141,
  timeSignature: [12, 8],
  keySignature: 4,
  durationBeats: BARS * BAR,
  source: {
    kind: 'image-ai',
    label: '网易云乐谱 664959 · 9页原图逐音AI转写（55小节）· 待对照原谱校对',
    url: 'https://music.163.com/st/h5-music-score-v2/detail/index.html?musicSheetId=664959&songId=1958557540',
  },
  notes,
});
await addScore(score, { description: '网易云9页55小节逐音转写 · E 大调 12/8 · 待对照原谱校对' });
console.log(`Golden Hour: ${BARS} 小节, ${score.notes.length} 个音符, ${score.durationBeats} 拍`);
