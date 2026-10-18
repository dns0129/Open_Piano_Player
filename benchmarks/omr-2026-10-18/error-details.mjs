// 列出每个流程在 POD 层级未匹配的音（漏音 / 多音），并标注“同一起拍同音高重复”（两声部共用符头、参考 MIDI 只保留一个音）。
// 用法：node benchmarks/omr-2026-10-18/error-details.mjs reference.json prediction.json
import { readFile } from 'node:fs/promises';
const [refPath, predPath] = process.argv.slice(2);
const ref = JSON.parse(await readFile(refPath, 'utf8'));
const raw = JSON.parse(await readFile(predPath, 'utf8')), pred = raw.score || raw;
const N = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'], name = m => N[m % 12] + (Math.floor(m / 12) - 1);
const k = n => `${Math.round(n.beat * 1000)}:${n.midi}:${Math.round(n.duration * 1000)}:${n.hand}`;
const pool = new Map();
for (const n of ref.notes) pool.set(k(n), (pool.get(k(n)) || 0) + 1);
const extra = [];
for (const n of pred.notes) { const c = pool.get(k(n)) || 0; if (c) pool.set(k(n), c - 1); else extra.push(n); }
const predPool = new Map();
for (const n of pred.notes) predPool.set(k(n), (predPool.get(k(n)) || 0) + 1);
const missing = [];
for (const n of ref.notes) { const c = predPool.get(k(n)) || 0; if (c) predPool.set(k(n), c - 1); else missing.push(n); }
const where = n => `第${Math.floor(n.beat / ref.barBeats) + 1}小节 ${n.hand === 'right' ? '右' : '左'}手 拍${+(n.beat % ref.barBeats + 1).toFixed(3)} ${name(n.midi)} 时值${+n.duration.toFixed(3)}`;
const dupe = n => pred.notes.filter(m => m !== n && m.hand === n.hand && Math.abs(m.beat - n.beat) < 1e-6 && m.midi === n.midi).length > 0;
const near = n => { const r = missing.find(m => m.hand === n.hand && Math.abs(m.beat - n.beat) < 1e-6 && m.midi === n.midi); return r ? `（参考同音时值 ${+r.duration.toFixed(3)}）` : ''; };
console.log(`多音 ${extra.length}：`);
for (const n of extra) console.log('  + ' + where(n) + (dupe(n) ? ' [同起拍同音高重复]' : '') + near(n));
console.log(`漏音/不匹配 ${missing.length}：`);
for (const n of missing) console.log('  - ' + where(n));
