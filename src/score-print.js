import {createDisplayRepresentation} from '../lib/score-representations.ts';
import { PDFDocument } from 'pdf-lib';
import { renderNotation, fontsReady } from './notation.js';
import { assetURL } from '../lib/asset-url.mjs';
// Use the same embedded fonts as the on-screen engraver, including offline exports.
import { Bravura } from '../node_modules/vexflow/build/esm/src/fonts/bravura.js';
import { Academico } from '../node_modules/vexflow/build/esm/src/fonts/academico.js';

const WIDTH = 750, HEIGHT = WIDTH * 297 / 210, MARGIN = 28, SCALE = 3;
const CONTENT = WIDTH - 2 * MARGIN;
const HEADER = 90;

function canvas(width, height) {
  const node = document.createElement('canvas');
  node.width = Math.ceil(width * SCALE); node.height = Math.ceil(height * SCALE);
  const ctx = node.getContext('2d');
  ctx.scale(SCALE, SCALE); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
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
async function svgImage(svg) {
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
  copy.prepend(style);
  const box = svg.viewBox.baseVal;
  const width = box.width || Number(svg.getAttribute('width'));
  const height = box.height || Number(svg.getAttribute('height'));
  copy.setAttribute('width', width); copy.setAttribute('height', height);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
  try { return { image: await loadImage(url), width, height }; }
  finally { URL.revokeObjectURL(url); }
}

/** Build every system at a fixed paper width, independent of screen size and lazy rendering. */
export async function createScorePages(score, { mode = 'staff', sourceNotation } = {}) {
  score=createDisplayRepresentation(score).score;
  const pages = []; let renderer, host;
  const newPage = () => {
    const page = canvas(WIDTH, HEIGHT); pages.push(page);
    const { ctx } = page;
    ctx.fillStyle = '#202820'; ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillText(score.title || '钢琴乐谱', MARGIN, MARGIN + 22, CONTENT);
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#555';
    ctx.fillText(`${score.composer || '钢琴谱'} · ${score.timeSignature.join('/')} · ♩ = ${score.tempo} · ${{ staff: '五线谱', numbered: '简谱', source: '原图参考' }[mode]}`, MARGIN, MARGIN + 43, CONTENT);
    const draft = score.source?.reviewRequired || /draft|^audio-transcription$|^image-ai$|^full-score-model-reviewed$/.test(score.source?.kind || '');
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText([draft ? '待校对草稿' : '', score.source?.label, score.source?.license].filter(Boolean).join(' · '), MARGIN, MARGIN + 59, CONTENT);
    return page;
  };
  let page = newPage(), y = MARGIN + HEADER;
  const place = ({ image, width, height }) => {
    const w = Math.min(CONTENT, (HEIGHT - 2 * MARGIN - HEADER - 20) * width / height), h = w * height / width;
    if (y + h > HEIGHT - MARGIN - 20) { page = newPage(); y = MARGIN + HEADER; }
    page.ctx.drawImage(image, MARGIN + (CONTENT - w) / 2, y, w, h); y += h + 14;
  };
  try {
    if (mode === 'source') {
      if (!sourceNotation?.systems?.length) throw new Error('当前乐谱没有可打印的原谱图片，请选择五线谱。');
      for (const system of sourceNotation.systems) {
        const image = await loadImage(assetURL(system.imageUrl));
        place({ image, width: image.naturalWidth, height: image.naturalHeight });
      }
    } else {
      await fontsReady; await document.fonts.ready;
      host = document.createElement('div');
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${CONTENT}px;background:white;pointer-events:none`;
      host.setAttribute('aria-hidden', 'true'); document.body.append(host);
      renderer = renderNotation(host, score, { mode, autoScroll: false, renderAll: true });
      const error = host.querySelector('.notation-error');
      if (error) throw new Error(`此谱暂不能完整导出：${error.textContent}`);
      const systems = [...host.querySelectorAll('.notation-system > svg')];
      if (!systems.length) throw new Error('乐谱为空，无法导出。');
      for (const svg of systems) place(await svgImage(svg));
    }
    pages.forEach(({ ctx }, i) => {
      ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = '#777';
      ctx.fillText(`琴伴 · ${i + 1} / ${pages.length}`, MARGIN, HEIGHT - MARGIN);
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
