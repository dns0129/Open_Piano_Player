import { guitarTabNotes, GUITAR_TUNING } from '../lib/guitar.mjs';
import { scoreMeasureBounds, midiName } from '../lib/score.mjs';

const NS = 'http://www.w3.org/2000/svg';
function element(name, attrs, text) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
export function renderGuitarTab(container, score, options = {}) {
  const root = document.createElement('div'); root.className = 'notation-root guitar-notation';
  root.dataset.mode = 'tab';
  const help = document.createElement('p'); help.className = 'notation-help';
  help.textContent = '标准调弦 E A D G B E · 上方为1弦（高音E），数字为品位，0为空弦。横向按拍数排列，短横线表示持续时值。指法为自动建议；红色音名表示无法分配，请调整指法或编配。';
  const systems = document.createElement('div'); systems.className = 'notation-systems';
  root.append(help, systems); container.replaceChildren(root);
  const notes = guitarTabNotes(score), bars = [], hits = [];
  const barLength = score.timeSignature[0] * 4 / score.timeSignature[1];
  const count = score.measureMap?.length || Math.ceil(score.durationBeats / barLength);
  for (let index = 0; index < count; index++) {
    const bounds = scoreMeasureBounds(score, index);
    const local = notes.filter(n => n.beat >= bounds.start && n.beat < bounds.end);
    const beats = [...new Set(local.map(n => n.beat))].sort((a, b) => a - b);
    const minGap = Math.min(1, ...beats.slice(1).map((b, i) => b - beats[i]));
    const span = Math.max(260, bounds.length * 28 / Math.max(1 / 16, minGap));
    const width = span + 70, height = 224, x = beat => 52 + (beat - bounds.start) / bounds.length * span;
    const host = document.createElement('div'); host.className = 'notation-system guitar-tab-system';
    host.style.overflowX = 'auto';
    const svg = element('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': `第 ${index + 1} 小节吉他六线谱` });
    svg.style.minWidth = `${Math.min(width, 1800)}px`;
    const shade = element('rect', { x: 38, y: 25, width: width - 44, height: 188, fill: 'transparent', class: 'guitar-bar-shade' });
    svg.append(shade, element('text', { x: 12, y: 18, fill: '#7e8b82', 'font-size': 11 }, `${index + 1} · ${bounds.timeSignature.join('/')}`));
    for (let string = 1; string <= 6; string++) {
      const y = 44 + (string - 1) * 25;
      svg.append(element('line', { x1: 38, x2: width - 10, y1: y, y2: y, stroke: '#89968a', 'stroke-width': 1 }),
        element('text', { x: 8, y: y + 4, fill: '#697a6d', 'font-size': 12 }, `${string} ${['E', 'B', 'G', 'D', 'A', 'E'][string - 1]}`));
    }
    for (let beat = bounds.start; beat < bounds.end; beat++) svg.append(element('text', { x: x(beat), y: 210, fill: '#89968a', 'font-size': 10 }, `${+(beat - bounds.start + 1).toFixed(2)}`));
    for (const n of local) {
      const y = n.fingering ? 44 + (n.fingering.string - 1) * 25 : 24;
      const group = element('g', { role: 'button', tabindex: 0, 'data-note-id': n.id,
        'aria-label': `${midiName(n.midi)}，${n.fingering ? `${n.fingering.string}弦${n.fingering.fret}品` : '无法分配指法'}，持续${n.duration}拍` });
      const box = element('rect', { x: x(n.beat) - 11, y: y - 12, width: n.fingering ? 24 : 40, height: 23, rx: 4, fill: '#fffdf8' });
      group.append(element('line', { x1: x(n.beat) + 10, x2: Math.max(x(n.beat) + 12, x(Math.min(bounds.end, n.beat + n.duration)) - 6), y1: y + 8, y2: y + 8, stroke: '#a1b3a2', 'stroke-width': 2 }), box,
        element('text', { x: x(n.beat) + (n.fingering ? 0 : 8), y: y + 5, 'text-anchor': 'middle', fill: n.fingering ? '#304c3a' : '#b34132', 'font-size': n.fingering ? 17 : 10, 'font-weight': 600 }, n.fingering ? n.fingering.fret : midiName(n.midi)));
      const choose = () => options.onSelectNotes ? options.onSelectNotes([n.id]) : options.onSeek?.(n.beat);
      group.addEventListener('click', choose);
      group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
      svg.append(group); hits.push({ n, box });
    }
    host.append(svg); systems.append(host); bars.push({ bounds, host, shade });
  }
  let current = -1;
  return {
    setBeat(beat) {
      for (const { n, box } of hits) box.setAttribute('fill', beat >= n.beat && beat < n.beat + n.duration ? '#c9e2bf' : '#fffdf8');
      const index = bars.findIndex(b => beat >= b.bounds.start && beat < b.bounds.end);
      if (index !== current) {
        bars.forEach((b, i) => b.shade.setAttribute('fill', i === index ? '#edf4e9' : 'transparent'));
        if (options.autoScroll !== false && index >= 0 && current >= 0) bars[index].host.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        current = index;
      }
    },
    destroy() { root.remove(); },
  };
}

export function guitarFretboard() {
  return `<section id="practice-keyboard" class="practice-keyboard guitar-fretboard" aria-label="吉他指板"><div class="keyboard-caption"><span>标准调弦 · 0–12品 · 点击试听</span><button data-layout="keyboard" aria-controls="practice-keyboard">收起指板</button></div><div class="guitar-fret-scroll"><div class="guitar-fret-grid">${GUITAR_TUNING.map((open, i) => `<div class="guitar-string"><span>${i + 1}弦 ${['E4', 'B3', 'G3', 'D3', 'A2', 'E2'][i]}</span>${Array.from({ length: 13 }, (_, fret) => `<button data-midi="${open + fret}" aria-label="${i + 1}弦${fret}品 ${midiName(open + fret)}">${fret}</button>`).join('')}</div>`).join('')}</div></div></section>`;
}
