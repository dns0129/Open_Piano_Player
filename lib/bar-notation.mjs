// 逐小节文本格式（识读者填写）→ 琴伴乐谱。
//   title: 曲名 / key: 4 / time: 12/8 / tempo: 141     可选的头信息
//   5 R: F#5:1/4 G#5+G#6:1/4 r:1/2 ...                第5小节右手；音名(+音名):时值，r 为休止
//   5 R2: C6:3                                        同一只手的第二声部（各声部各自填满小节）
//   22 = 6                                            与第6小节完全相同（两只手、所有声部）
// 时值以四分音符为 1（可写分数）；音名末尾 ~ 表示连到下一个同音（可跨小节）；# 开头为注释。
import { validateScore } from './score.mjs';

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ALTER = { '': 0, '#': 1, '##': 2, x: 2, b: -1, bb: -2, n: 0 };

export function parsePitch(text) {
  const m = /^([A-Ga-g])(##|#|x|bb|b|n)?(-?\d)(~?)$/.exec(text);
  if (!m) throw new Error(`无效音名“${text}”`);
  return { midi: 12 * (Number(m[3]) + 1) + STEP[m[1].toUpperCase()] + ALTER[m[2] || ''], tie: m[4] === '~' };
}

export function parseDuration(text) {
  if (!/^\d+(\.\d+)?(\/\d+)?$|^\.\d+$/.test(text)) throw new Error(`无效时值“${text}”`);
  const [a, b] = text.split('/');
  const value = Number(a) / (b ? Number(b) : 1);
  if (!(value > 0)) throw new Error(`无效时值“${text}”`);
  return value;
}

export function parseBars(source) {
  const meta = {}, bars = new Map(), copies = new Map(), errors = [];
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) return;
    const where = `第 ${index + 1} 行`;
    let m;
    if ((m = /^(title|key|time|tempo|composer):\s*(.+)$/i.exec(line))) { meta[m[1].toLowerCase()] = m[2].trim(); return; }
    if ((m = /^(\d+)\s*=\s*(\d+)$/.exec(line))) { copies.set(Number(m[1]), Number(m[2])); return; }
    if (!(m = /^(\d+)\s+([RL])(\d?)\s*:\s*(.*)$/i.exec(line))) { errors.push(`${where}：无法解析“${line}”`); return; }
    const bar = Number(m[1]), hand = m[2].toUpperCase() === 'R' ? 'right' : 'left', voice = Number(m[3] || 1);
    try {
      const events = m[4].trim().split(/\s+/).filter(Boolean).map(token => {
        const at = token.lastIndexOf(':');
        if (at < 1) throw new Error(`“${token}”缺少时值`);
        const pitches = token.slice(0, at), duration = parseDuration(token.slice(at + 1));
        return { duration, notes: pitches.toLowerCase() === 'r' ? [] : pitches.split('+').map(parsePitch) };
      });
      if (!bars.has(bar)) bars.set(bar, []);
      bars.get(bar).push({ hand, voice, events, where });
    } catch (error) { errors.push(`${where}（第${bar}小节）：${error.message}`); }
  });
  return { meta, bars, copies, errors };
}

/** 按拍号检查每个声部填满小节，展开重复，合并延音，生成乐谱。 */
export function barsToScore(source, overrides = {}) {
  const { meta, bars, copies, errors } = parseBars(source);
  const info = { ...meta, ...overrides };
  const [num, den] = String(info.time || '4/4').split('/').map(Number);
  const barBeats = num * 4 / den;
  for (const [bar, from] of copies) {
    let target = from, guard = 0;
    while (copies.has(target) && guard++ < 1000) target = copies.get(target);
    if (!bars.has(target)) errors.push(`第${bar}小节 = 第${from}小节，但第${from}小节没有内容`);
    else bars.set(bar, bars.get(target));
  }
  const numbers = [...bars.keys()].sort((a, b) => a - b);
  const last = numbers.at(-1) || 0;
  // allowMissing：只检查已有的小节（例如单页转写），缺少的小节不报错也不补写
  if (!info.allowMissing || info.allowMissing === '0') for (let n = 1; n <= last; n++) if (!bars.has(n)) errors.push(`缺少第${n}小节`);
  const notes = [], open = new Map();
  for (const n of numbers) {
    const start = (n - 1) * barBeats;
    for (const hand of ['right', 'left'])
      if (!bars.get(n).some(v => v.hand === hand)) errors.push(`第${n}小节缺少${hand === 'right' ? '右' : '左'}手`);
    for (const { hand, voice, events, where } of bars.get(n)) {
      const total = events.reduce((sum, e) => sum + e.duration, 0);
      if (Math.abs(total - barBeats) > 1e-6) errors.push(`${where}：第${n}小节${hand === 'right' ? '右' : '左'}手声部${voice}共 ${+total.toFixed(4)} 拍，应为 ${barBeats} 拍`);
      let beat = start;
      for (const event of events) {
        for (const { midi, tie } of event.notes) {
          const key = `${hand}:${voice}:${midi}`, held = open.get(key);
          if (held && Math.abs(held.beat + held.duration - beat) < 1e-6) { held.duration += event.duration; if (!tie) open.delete(key); continue; }
          const note = { id: `b${n}-${hand[0]}${voice}-${notes.length}`, beat, duration: event.duration, midi, hand, velocity: hand === 'right' ? 0.7 : 0.5 };
          notes.push(note);
          if (tie) open.set(key, note); else open.delete(key);
        }
        beat += event.duration;
      }
    }
  }
  if (errors.length) return { errors, score: null };
  const score = validateScore({
    version: 1, id: info.id || 'bars-score', title: info.title || '未命名乐谱', composer: info.composer || '未知', tempo: Number(info.tempo || 90),
    timeSignature: [num, den], keySignature: Number(info.key || 0), durationBeats: last * barBeats,
    source: info.source || { kind: 'image-ai', label: '逐小节识读' }, notes,
  });
  return { errors: [], score, bars: last };
}
