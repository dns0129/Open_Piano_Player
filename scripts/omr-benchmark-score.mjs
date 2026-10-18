#!/usr/bin/env node
// 识谱结果评分：node scripts/omr-benchmark-score.mjs reference.json prediction.json [--json out.json]
//
// 评分单元：(小节, 手)。音符按起拍所在小节归属；连音线已合并为一个音（参考与识读结果都如此）。
// 三个匹配层级（同一单元内的多重集交集，一个参考音最多匹配一个识读音）：
//   P   音高：MIDI 音高相同
//   PO  音高 + 起拍：再要求起拍相同（四分音符拍，精确到 1e-3）
//   POD 音高 + 起拍 + 时值：再要求时值相同（即“音高与节奏同时正确”）
// matched = 交集大小；missing（漏音）= 参考音数 − matched；extra（多音）= 识读音数 − matched；
// recall = matched / 参考音数；precision = matched / 识读音数；F1 为二者调和平均。
// 完全正确单元：POD matched = 参考音数 = 识读音数；完全正确小节：左右手两个单元都完全正确。
// 手别错误（音放到另一只手）计为一个漏音加一个多音；另报“忽略手别的 PO”供诊断。
import { readFile, writeFile } from 'node:fs/promises';

const key = value => Math.round(value * 1000);

function units(notes, barBeats) {
  const map = new Map();
  for (const n of notes) {
    const bar = Math.floor(n.beat / barBeats + 1e-9) + 1;
    const id = `${bar}:${n.hand}`;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(n);
  }
  return map;
}

function intersect(a, b, keyOf) {
  const counts = new Map();
  for (const n of a) counts.set(keyOf(n), (counts.get(keyOf(n)) || 0) + 1);
  let matched = 0;
  for (const n of b) {
    const k = keyOf(n), c = counts.get(k) || 0;
    if (c > 0) { matched++; counts.set(k, c - 1); }
  }
  return matched;
}

const LEVELS = {
  P: n => `${n.midi}`,
  PO: n => `${key(n.beat)}:${n.midi}`,
  POD: n => `${key(n.beat)}:${n.midi}:${key(n.duration)}`,
};

function rates(matched, ref, pred) {
  const recall = ref ? matched / ref : 1, precision = pred ? matched / pred : 1;
  return { matched, missing: ref - matched, extra: pred - matched, recall, precision, f1: recall + precision ? 2 * recall * precision / (recall + precision) : 0 };
}

export function scoreTranscription(reference, prediction) {
  const barBeats = reference.barBeats, bars = reference.bars;
  const refUnits = units(reference.notes, barBeats), predUnits = units(prediction.notes, barBeats);
  const result = { bars, barBeats, hands: {}, total: {}, perBar: [] };
  const sums = { right: {}, left: {} };
  let exactBars = 0;
  for (let bar = 1; bar <= bars; bar++) {
    const row = { bar };
    let barExact = true;
    for (const hand of ['right', 'left']) {
      const ref = refUnits.get(`${bar}:${hand}`) || [], pred = predUnits.get(`${bar}:${hand}`) || [];
      const s = sums[hand];
      s.ref = (s.ref || 0) + ref.length;
      s.pred = (s.pred || 0) + pred.length;
      const unit = { ref: ref.length, pred: pred.length };
      for (const [level, keyOf] of Object.entries(LEVELS)) {
        const m = intersect(ref, pred, keyOf);
        s[level] = (s[level] || 0) + m;
        unit[level] = m;
      }
      unit.exact = unit.POD === ref.length && ref.length === pred.length;
      s.exactUnits = (s.exactUnits || 0) + (unit.exact ? 1 : 0);
      barExact &&= unit.exact;
      row[hand] = unit;
    }
    // 忽略手别的诊断：同一小节内左右手合并后的 PO
    const both = h => [...(h.get(`${bar}:right`) || []), ...(h.get(`${bar}:left`) || [])];
    row.handAgnosticPO = intersect(both(refUnits), both(predUnits), LEVELS.PO);
    row.exact = barExact;
    exactBars += barExact ? 1 : 0;
    result.perBar.push(row);
  }
  const outsideBars = prediction.notes.filter(n => Math.floor(n.beat / barBeats + 1e-9) + 1 > bars).length;
  for (const hand of ['right', 'left', 'total']) {
    const s = hand === 'total'
      ? Object.fromEntries(Object.keys(sums.right).map(k => [k, sums.right[k] + sums.left[k]]))
      : sums[hand];
    const extraOutside = hand === 'total' ? outsideBars : 0;
    const pred = s.pred + extraOutside;
    const out = { referenceNotes: s.ref, predictedNotes: pred };
    for (const level of Object.keys(LEVELS)) out[level] = rates(s[level], s.ref, pred);
    out.durationGivenOnset = s.PO ? s.POD / s.PO : 0;
    out.exactUnits = hand === 'total' ? s.exactUnits : s.exactUnits;
    out.units = hand === 'total' ? bars * 2 : bars;
    out.exactUnitRate = out.exactUnits / out.units;
    result[hand === 'total' ? 'total' : 'hands'][hand === 'total' ? 'all' : hand] = out;
  }
  result.total = result.total.all;
  result.total.exactBars = exactBars;
  result.total.exactBarRate = exactBars / bars;
  result.total.notesAfterLastBar = outsideBars;
  result.total.handAgnosticPO = result.perBar.reduce((sum, row) => sum + row.handAgnosticPO, 0);
  return result;
}

const pct = v => (100 * v).toFixed(1) + '%';
export function formatTable(name, r) {
  const lines = [`### ${name}`, '', '| 范围 | 参考音 | 识读音 | 音高 P（召回/精确） | 漏音/多音（P） | 音高+起拍 PO | 音高+起拍+时值 POD | 起拍对时时值正确 | 完全正确单元 |', '|---|---|---|---|---|---|---|---|---|'];
  for (const [label, s] of [['右手', r.hands.right], ['左手', r.hands.left], ['合计', r.total]])
    lines.push(`| ${label} | ${s.referenceNotes} | ${s.predictedNotes} | ${pct(s.P.recall)} / ${pct(s.P.precision)} | ${s.P.missing} / ${s.P.extra} | ${pct(s.PO.recall)} / ${pct(s.PO.precision)} | ${pct(s.POD.recall)} / ${pct(s.POD.precision)} | ${pct(s.durationGivenOnset)} | ${s.exactUnits}/${s.units}（${pct(s.exactUnitRate)}） |`);
  lines.push('', `完全正确小节（左右手都对）：${r.total.exactBars}/${r.bars}（${pct(r.total.exactBarRate)}）；忽略手别的 PO 匹配：${r.total.handAgnosticPO}；超出参考小节范围的识读音：${r.total.notesAfterLastBar}。`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [refPath, predPath, ...rest] = process.argv.slice(2);
  if (!refPath || !predPath) { console.error('用法：omr-benchmark-score.mjs reference.json prediction.json [--json out.json] [--name 名称]'); process.exit(2); }
  const reference = JSON.parse(await readFile(refPath, 'utf8'));
  const raw = JSON.parse(await readFile(predPath, 'utf8'));
  const prediction = raw.score || raw;
  const result = scoreTranscription(reference, prediction);
  const jsonAt = rest.indexOf('--json'), nameAt = rest.indexOf('--name');
  if (jsonAt >= 0) await writeFile(rest[jsonAt + 1], JSON.stringify(result, null, 1) + '\n');
  console.log(formatTable(nameAt >= 0 ? rest[nameAt + 1] : predPath, result));
}
