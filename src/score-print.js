import {createDisplayRepresentation} from '../lib/score-representations.ts';
import { VexFlow } from 'vexflow';
import { normalizePrintStyle, printSVGColor, PRINT_TEXT_FONTS, PRINT_PAGE_STYLES } from '../lib/score-print-style.mjs';
import { PDFDocument } from 'pdf-lib';
import { renderNotation, fontsReady } from './notation.js';
import { assetURL } from '../lib/asset-url.mjs';
// Use the same embedded fonts as the on-screen engraver, including offline exports.
import { Bravura } from '../node_modules/vexflow/build/esm/src/fonts/bravura.js';
import { Academico } from '../node_modules/vexflow/build/esm/src/fonts/academico.js';
import { Gonville } from '../node_modules/vexflow/build/esm/src/fonts/gonville.js';
import { Petaluma } from '../node_modules/vexflow/build/esm/src/fonts/petaluma.js';
import { PetalumaScript } from '../node_modules/vexflow/build/esm/src/fonts/petalumascript.js';
const MUSIC_DATA = { Bravura, Gonville, Petaluma };

const WIDTH = 750, HEIGHT = WIDTH * 297 / 210, SCALE = 3;

function canvas(width, height, paper) {
  const node = document.createElement('canvas');
  node.width = Math.ceil(width * SCALE); node.height = Math.ceil(height * SCALE);
  const ctx = node.getContext('2d');
  ctx.scale(SCALE, SCALE); ctx.fillStyle = paper; ctx.fillRect(0, 0, width, height);
  return { node, ctx };
}
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('谱面图片加载失败，请重新加载原谱后重试。'));
    image.src = url;
  });
}
async function svgImage(svg, appearance) {
  const copy = svg.cloneNode(true);
  // Standalone SVG images do not inherit page CSS.
  const originals = [svg, ...svg.querySelectorAll('*')];
  const copies = [copy, ...copy.querySelectorAll('*')];
  originals.forEach((node, i) => {
    const style = getComputedStyle(node);
    for (const key of ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor']) copies[i].style.setProperty(key, style.getPropertyValue(key));
  });
  copy.querySelectorAll('.notation-hit,.notation-measure-shade,.notation-cursor').forEach(node => node.remove());
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `@font-face{font-family:Bravura;src:url("${Bravura}")}@font-face{font-family:Academico;src:url("${Academico}")}`;
  style.textContent += `@font-face{font-family:${appearance.musicFont};src:url("${MUSIC_DATA[appearance.musicFont]}")}@font-face{font-family:'Petaluma Script';src:url("${PetalumaScript}")}`;
  copy.prepend(style);
  const palette = PRINT_PAGE_STYLES[appearance.pageStyle];
  for (const node of copy.querySelectorAll('*')) {
    for (const property of ['fill', 'stroke']) {
      const value = node.style.getPropertyValue(property);
      if (value) node.style.setProperty(property, printSVGColor(value, palette));
    }
  }
  for (const node of copy.querySelectorAll('.notation-pitch,.notation-measure-label,.notation-key-label,.notation-row-label,.notation-tuplet text')) node.style.fontFamily = PRINT_TEXT_FONTS[appearance.textFont].family;
  const box = svg.viewBox.baseVal;
  const width = box.width || Number(svg.getAttribute('width'));
  const height = box.height || Number(svg.getAttribute('height'));
  copy.setAttribute('width', width); copy.setAttribute('height', height);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
  try { return { image: await loadImage(url), width, height }; }
  finally { URL.revokeObjectURL(url); }
}

/** Build every system at a fixed paper width, independent of screen size and lazy rendering. */
export async function createScorePages(score, { mode = 'staff', sourceNotation, appearance: rawAppearance, preview = false } = {}) {
  score = createDisplayRepresentation(score).score;
  const appearance = normalizePrintStyle(rawAppearance, score);
  const palette = PRINT_PAGE_STYLES[appearance.pageStyle], font = PRINT_TEXT_FONTS[appearance.textFont].family;
  const margin = appearance.marginMM * WIDTH / 210, content = WIDTH - 2 * margin;
  const pages = []; let renderer, host, contentTop = 0, previewOverflow = false;
  const newPage = () => {
    const page = canvas(WIDTH, HEIGHT, palette.paper); pages.push(page);
    const { ctx } = page;
    const left = appearance.headerFormat === 'left', inset = appearance.headerFormat === 'framed' ? 14 : 0;
    const textWidth = content - 2 * inset;
    let y = margin;
    const line = (value, size, align = 'left', weight = '', color = palette.ink) => {
      if (!value) return;
      ctx.font = `${weight} ${size}px ${font}`.trim(); ctx.fillStyle = color; ctx.textAlign = align;
      const x = align === 'center' ? WIDTH / 2 : align === 'right' ? WIDTH - margin - inset : margin + inset;
      let row = '';
      for (const char of Array.from(value)) {
        if (row && ctx.measureText(row + char).width > textWidth) {
          y += size * 1.35; ctx.fillText(row, x, y); row = '';
        }
        row += char;
      }
      if (row) { y += size * 1.35; ctx.fillText(row, x, y); }
    };
    line(appearance.title, appearance.titleSize, left ? 'left' : 'center', '600');
    const credit = [appearance.creditLabel, appearance.credit].filter(Boolean).join('：');
    if (appearance.creditPosition === 'under-title' && appearance.credit) line(credit, 12, left ? 'left' : 'center');
    line(appearance.subtitle, 13, left ? 'left' : 'center', '', palette.muted);
    if (appearance.showDetails) line(`${score.timeSignature.join('/')} · ♩ = ${score.tempo} · ${{ staff: '五线谱', numbered: '简谱', source: '原图参考' }[mode]}`, 10, left ? 'left' : 'center', '', palette.muted);
    if (!['hidden', 'under-title'].includes(appearance.creditPosition) && appearance.credit) line(credit, 12, appearance.creditPosition);
    const draft = score.source?.reviewRequired || /draft|^audio-transcription$|^image-ai$|^full-score-model-reviewed$/.test(score.source?.kind || '');
    line([draft ? '待校对草稿' : '', score.source?.label, score.source?.license].filter(Boolean).join(' · '), 8, 'left', '', palette.muted);
    y += 12;
    ctx.strokeStyle = palette.accent; ctx.lineWidth = appearance.headerFormat === 'framed' ? 1 : 0.6;
    if (appearance.headerFormat === 'framed') ctx.strokeRect(margin, margin - 3, content, y - margin + 5);
    else if (appearance.pageStyle !== 'classic') { ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(WIDTH - margin, y); ctx.stroke(); }
    contentTop = y + 18;
    return page;
  };
  // Text faces and glyph faces must be ready before measuring the page or SVG.
  await fontsReady;
  await document.fonts.load(`24px ${font}`);
  await document.fonts.load(`32px ${appearance.musicFont}`);
  await document.fonts.load('12px "Petaluma Script"');
  await document.fonts.ready;
  let page = newPage(), y = contentTop;
  const place = ({ image, width, height }) => {
    const w = Math.min(content, (HEIGHT - margin - 24 - contentTop) * width / height), h = w * height / width;
    if (y + h > HEIGHT - margin - 24 + 0.01) {
      if (preview) { previewOverflow = true; return false; }
      page = newPage(); y = contentTop;
    }
    page.ctx.drawImage(image, margin + (content - w) / 2, y, w, h); y += h + (appearance.pageStyle === 'clean' ? 20 : 14);
    return true;
  };
  try {
    if (mode === 'source') {
      if (!sourceNotation?.systems?.length) throw new Error('当前乐谱没有可打印的原谱图片，请选择五线谱。');
      for (const system of sourceNotation.systems) {
        const image = await loadImage(assetURL(system.imageUrl));
        if (!place({ image, width: image.naturalWidth, height: image.naturalHeight })) break;
      }
    } else {
      host = document.createElement('div');
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.round(content * 100 / appearance.scoreScale)}px;background:white;pointer-events:none`;
      host.setAttribute('aria-hidden', 'true'); document.body.append(host);
      // VexFlow font selection is global; keep the entire synchronous engraving
      // scoped so an export never changes the live practice renderer's fonts.
      const previousFonts = VexFlow.getFonts();
      try {
        VexFlow.setFonts(...new Set([appearance.musicFont, 'Bravura', appearance.musicFont === 'Petaluma' ? 'Petaluma Script' : 'Academico']));
        renderer = renderNotation(host, score, { mode, autoScroll: false, renderAll: true });
      } finally { VexFlow.setFonts(...previousFonts); }
      const error = host.querySelector('.notation-error');
      if (error) throw new Error(`此谱暂不能完整导出：${error.textContent}`);
      const systems = [...host.querySelectorAll('.notation-system > svg')];
      if (!systems.length) throw new Error('乐谱为空，无法导出。');
      for (const svg of systems) if (!place(await svgImage(svg, appearance))) break;
    }
    if (appearance.showPageNumbers) pages.forEach(({ ctx }, i) => {
      ctx.font = `9px ${font}`; ctx.fillStyle = palette.muted; ctx.textAlign = 'right';
      ctx.fillText(`琴伴 · ${i + 1} / ${previewOverflow ? '…' : pages.length}`, WIDTH - margin, HEIGHT - margin);
    });
    return pages.map(page => page.node);
  } finally { renderer?.destroy(); host?.remove(); }
}

export async function scorePagesPDF(pages, title) {
  const pdf = await PDFDocument.create(); pdf.setTitle(title); pdf.setCreator('琴伴');
  for (const canvas of pages) {
    const image = await pdf.embedPng(canvas.toDataURL('image/png'));
    const page = pdf.addPage([595.28, 841.89]);
    page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  return pdf.save();
}

export async function printScorePages(pages, title) {
  const frame = document.createElement('iframe');
  frame.title = '打印乐谱'; frame.style.cssText = 'position:fixed;width:1px;height:1px;right:0;bottom:0;border:0';
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open(); doc.write('<!doctype html><html><head><style>@page{size:A4;margin:0}body{margin:0}img{display:block;width:210mm;height:297mm;break-after:page}img:last-child{break-after:auto}</style></head><body></body></html>'); doc.close();
  doc.title = title;
  try {
    await Promise.all(pages.map(canvas => new Promise((resolve, reject) => {
      const image = doc.createElement('img'); image.onload = resolve; image.onerror = reject;
      image.src = canvas.toDataURL('image/png'); doc.body.append(image);
    })));
    frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    frame.contentWindow.focus(); frame.contentWindow.print();
    // Some mobile browsers do not emit afterprint.
    setTimeout(() => frame.remove(), 300000);
  } catch (error) { frame.remove(); throw error; }
}
