import { renderGuitarTab } from "./guitar-notation.js";
import { createDisplayRepresentation } from "../lib/score-representations.ts";
import { VexFlow, Font } from "vexflow/core";
import {
  normalizePrintStyle,
  printSVGColor,
  PRINT_TEXT_FONTS,
  PRINT_PAGE_STYLES,
} from "../lib/score-print-style.mjs";
import { PDFDocument } from "pdf-lib";
import { renderNotation, fontsReady } from "./notation.js";
import { assetURL } from "../lib/asset-url.mjs";
// Exported pages inline their fonts. Bravura and Academico come from the on-screen
// font files (already cached); the print-only faces are embedded here.
import { musicFontDataURL } from "./notation-fonts.js";
import { Gonville } from "../node_modules/vexflow/build/esm/src/fonts/gonville.js";
import { Petaluma } from "../node_modules/vexflow/build/esm/src/fonts/petaluma.js";
import { PetalumaScript } from "../node_modules/vexflow/build/esm/src/fonts/petalumascript.js";
const PRINT_ONLY_MUSIC_DATA = { Gonville, Petaluma };
// notation-fonts.js registers Bravura and Academico. Register the
// print-only faces too, so layout measures the same glyphs the exported page draws.
const printFontsReady =
  typeof FontFace === "undefined"
    ? Promise.resolve()
    : Promise.allSettled([
        Font.load("Gonville", Gonville, { display: "block" }),
        Font.load("Petaluma", Petaluma, { display: "block" }),
        Font.load("Petaluma Script", PetalumaScript, { display: "swap" }),
      ]);

const WIDTH = 750,
  HEIGHT = (WIDTH * 297) / 210;
// Pixels per layout unit: 3 is about 270 dpi on A4. Phones and tablets cap the
// memory one page may take, so they render at about 225 dpi.
const SCALE = globalThis.matchMedia?.("(pointer: coarse)").matches ? 2.5 : 3;

function canvas(width, height, paper) {
  const node = document.createElement("canvas");
  node.width = Math.ceil(width * SCALE);
  node.height = Math.ceil(height * SCALE);
  const ctx = node.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  return { node, ctx };
}
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("谱面图片加载失败，请重新加载原谱后重试。"));
    image.src = url;
  });
}
async function svgImage(svg, appearance) {
  const copy = svg.cloneNode(true);
  // Standalone SVG images do not inherit page CSS.
  const originals = [svg, ...svg.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  originals.forEach((node, i) => {
    const style = getComputedStyle(node);
    for (const key of [
      "fill",
      "fill-opacity",
      "stroke",
      "stroke-width",
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "text-anchor",
    ])
      copies[i].style.setProperty(key, style.getPropertyValue(key));
  });
  copy
    .querySelectorAll(".notation-hit,.notation-measure-shade,.notation-cursor")
    .forEach((node) => node.remove());
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  const [bravura, academico] = await Promise.all([
    musicFontDataURL("Bravura"),
    musicFontDataURL("Academico"),
  ]);
  const musicData = PRINT_ONLY_MUSIC_DATA[appearance.musicFont] ?? bravura;
  style.textContent = `@font-face{font-family:Bravura;src:url("${bravura}")}@font-face{font-family:Academico;src:url("${academico}")}`;
  style.textContent += `@font-face{font-family:${appearance.musicFont};src:url("${musicData}")}@font-face{font-family:'Petaluma Script';src:url("${PetalumaScript}")}`;
  copy.prepend(style);
  const palette = PRINT_PAGE_STYLES[appearance.pageStyle];
  for (const node of copy.querySelectorAll("*")) {
    for (const property of ["fill", "stroke"]) {
      const value = node.style.getPropertyValue(property);
      if (value)
        node.style.setProperty(property, printSVGColor(value, palette));
    }
  }
  for (const node of copy.querySelectorAll(
    ".notation-pitch,.notation-measure-label,.notation-key-label,.notation-row-label,.notation-tuplet text",
  ))
    node.style.fontFamily = PRINT_TEXT_FONTS[appearance.textFont].family;
  const box = svg.viewBox.baseVal;
  const width = box.width || Number(svg.getAttribute("width"));
  const height = box.height || Number(svg.getAttribute("height"));
  copy.setAttribute("width", width);
  copy.setAttribute("height", height);
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(copy)], {
      type: "image/svg+xml",
    }),
  );
  try {
    return { image: await loadImage(url), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Lay out every system at a fixed paper width, independent of screen size and
 * lazy rendering. Pages are drawn one at a time by `render(index)`, so a long
 * score never holds all of its page bitmaps at once (phones cap canvas memory).
 * With `preview`, layout stops after the first page and `complete` is false.
 */
export async function layoutScorePages(
  score,
  {
    mode = "staff",
    sourceNotation,
    appearance: rawAppearance,
    preview = false,
    showFingering = true,
  } = {},
) {
  score = createDisplayRepresentation(score).score;
  const appearance = normalizePrintStyle(rawAppearance, score);
  const palette = PRINT_PAGE_STYLES[appearance.pageStyle],
    font = PRINT_TEXT_FONTS[appearance.textFont].family;
  const margin = (appearance.marginMM * WIDTH) / 210,
    content = WIDTH - 2 * margin,
    bottom = HEIGHT - margin - 24,
    gap = appearance.pageStyle === "clean" ? 20 : 14;
  const left = appearance.headerFormat === "left",
    framed = appearance.headerFormat === "framed",
    inset = framed ? 14 : 0,
    textWidth = content - 2 * inset;
  const credit = [appearance.creditLabel, appearance.credit]
    .filter(Boolean)
    .join("：");
  const details = appearance.showDetails
    ? `${score.timeSignature.join("/")} · ♩ = ${score.tempo} · ${{ staff: "五线谱", numbered: "简谱", source: "原图参考", tab: "吉他六线谱 · 自动建议指法" }[mode]}`
    : "";
  const provenance = [
    /待校对|待人工确认|待核/.test(score.source?.label || "")
      ? ""
      : score.source?.label,
    score.source?.license,
  ]
    .filter(Boolean)
    .join(" · ");

  // The title block opens the first page only. Later pages carry a one-line
  // running title, which leaves the paper to the music.
  // Passing no context measures; both passes share one code path.
  function drawHeader(ctx, first) {
    const measure = ctx || scratch;
    let y = margin;
    const line = (
      value,
      size,
      align = "left",
      weight = "",
      color = palette.ink,
    ) => {
      if (!value) return;
      measure.font = `${weight} ${size}px ${font}`.trim();
      const x =
        align === "center"
          ? WIDTH / 2
          : align === "right"
            ? WIDTH - margin - inset
            : margin + inset;
      if (ctx) {
        ctx.fillStyle = color;
        ctx.textAlign = align;
      }
      let row = "";
      for (const char of Array.from(value)) {
        if (row && measure.measureText(row + char).width > textWidth) {
          y += size * 1.35;
          ctx?.fillText(row, x, y);
          row = "";
        }
        row += char;
      }
      if (row) {
        y += size * 1.35;
        ctx?.fillText(row, x, y);
      }
    };
    if (!first) {
      line(appearance.title, 9, "left", "", palette.muted);
      return y + 12;
    }
    line(
      appearance.title,
      appearance.titleSize,
      left ? "left" : "center",
      "600",
    );
    if (appearance.creditPosition === "under-title" && appearance.credit)
      line(credit, 12, left ? "left" : "center");
    line(appearance.subtitle, 13, left ? "left" : "center", "", palette.muted);
    const side = ["left", "right"].includes(appearance.creditPosition)
      ? appearance.creditPosition
      : "";
    const sideCredit = side && appearance.credit ? credit : "";
    measure.font = `10px ${font}`;
    const detailsWidth = details ? measure.measureText(details).width : 0;
    measure.font = `12px ${font}`;
    const creditWidth = sideCredit ? measure.measureText(sideCredit).width : 0;
    if (details && sideCredit && detailsWidth + creditWidth + 24 <= textWidth) {
      // Meter and tempo share a row with the credit, as on an engraved first page.
      const rowTop = y + 6;
      y = rowTop;
      line(details, 10, side === "right" ? "left" : "right", "", palette.muted);
      y = rowTop - 2.7;
      line(sideCredit, 12, side);
    } else {
      line(details, 10, left ? "left" : "center", "", palette.muted);
      if (sideCredit) line(sideCredit, 12, side);
      else if (appearance.creditPosition === "center" && appearance.credit)
        line(credit, 12, "center");
    }
    line(provenance, 8, "left", "", palette.muted);
    y += 12;
    if (ctx) {
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = framed ? 1 : 0.6;
      if (framed) ctx.strokeRect(margin, margin - 3, content, y - margin + 5);
      else if (appearance.pageStyle !== "classic") {
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(WIDTH - margin, y);
        ctx.stroke();
      }
    }
    return y + 18;
  }

  // Text faces and glyph faces must be ready before measuring the page or SVG.
  await fontsReady;
  await printFontsReady;
  await document.fonts.load(`24px ${font}`);
  await document.fonts.load(`32px ${appearance.musicFont}`);
  await document.fonts.load('12px "Petaluma Script"');
  await document.fonts.ready;
  const scratch = document.createElement("canvas").getContext("2d");
  const tops = [drawHeader(null, true), drawHeader(null, false)];
  const top = (index) => tops[index ? 1 : 0];

  // pages[n] = placed items: { load(), x, y, w, h }
  const pages = [[]];
  let y = top(0),
    complete = true;
  const place = (item) => {
    let page = pages.length - 1;
    const fit = (index) => {
      const w = Math.min(
        content,
        ((bottom - top(index)) * item.width) / item.height,
      );
      return { w, h: (w * item.height) / item.width };
    };
    let size = fit(page);
    if (pages[page].length && y + size.h > bottom + 0.01) {
      if (preview) {
        complete = false;
        return false;
      }
      pages.push([]);
      page++;
      y = top(page);
      size = fit(page);
    }
    pages[page].push({
      load: item.load,
      x: margin + (content - size.w) / 2,
      y,
      ...size,
    });
    y += size.h + gap;
    return true;
  };

  let renderer, host;
  try {
    if (mode === "source") {
      if (!sourceNotation?.systems?.length)
        throw new Error("当前乐谱没有可打印的原谱图片，请选择五线谱。");
      for (const system of sourceNotation.systems) {
        const url = assetURL(system.imageUrl);
        // Scans are large: measure now, decode again when their page is drawn.
        const image = await loadImage(url);
        if (
          !place({
            width: image.naturalWidth,
            height: image.naturalHeight,
            load: () => loadImage(url),
          })
        )
          break;
      }
    } else {
      host = document.createElement("div");
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.round((content * 100) / appearance.scoreScale)}px;background:white;pointer-events:none`;
      host.setAttribute("aria-hidden", "true");
      document.body.append(host);
      // VexFlow font selection is global; keep the entire synchronous engraving
      // scoped so an export never changes the live practice renderer's fonts.
      const previousFonts = VexFlow.getFonts();
      try {
        VexFlow.setFonts(
          ...new Set([
            appearance.musicFont,
            "Bravura",
            appearance.musicFont === "Petaluma"
              ? "Petaluma Script"
              : "Academico",
          ]),
        );
        renderer = (mode === "tab" ? renderGuitarTab : renderNotation)(
          host,
          score,
          {
            mode,
            autoScroll: false,
            renderAll: true,
            showFingering,
            showHelp: false,
            showReviewMarks: false,
          },
        );
      } finally {
        VexFlow.setFonts(...previousFonts);
      }
      const error = host.querySelector(".notation-error");
      if (error) throw new Error(`此谱暂不能完整导出：${error.textContent}`);
      const systems = [...host.querySelectorAll(".notation-system > svg")];
      if (!systems.length) throw new Error("乐谱为空，无法导出。");
      for (const svg of systems) {
        const drawn = await svgImage(svg, appearance);
        if (!place({ ...drawn, load: () => drawn.image })) break;
      }
    }
  } finally {
    renderer?.destroy();
    host?.remove();
  }

  // A page that continues overleaf spreads its systems down to the bottom
  // margin (within reason), rather than leaving a ragged band above the footer.
  pages.forEach((items, index) => {
    if (index === pages.length - 1 && complete) return;
    const last = items.at(-1);
    if (!last || items.length < 2) return;
    const spare = bottom - (last.y + last.h);
    const extra = Math.min(spare / (items.length - 1), gap * 1.5);
    if (extra > 0.5) items.forEach((item, i) => (item.y += i * extra));
  });

  return {
    count: pages.length,
    complete,
    appearance,
    async render(index) {
      const page = canvas(WIDTH, HEIGHT, palette.paper);
      drawHeader(page.ctx, index === 0);
      for (const item of pages[index])
        page.ctx.drawImage(await item.load(), item.x, item.y, item.w, item.h);
      if (appearance.showPageNumbers) {
        page.ctx.font = `9px ${font}`;
        page.ctx.fillStyle = palette.muted;
        page.ctx.textAlign = "right";
        page.ctx.fillText(
          `琴伴 · ${index + 1} / ${complete ? pages.length : "…"}`,
          WIDTH - margin,
          HEIGHT - margin,
        );
      }
      return page.node;
    },
  };
}

/** Every page as a canvas. Use layoutScorePages to draw long scores page by page. */
export async function createScorePages(score, options = {}) {
  const layout = await layoutScorePages(score, options);
  const pages = [];
  for (let index = 0; index < layout.count; index++)
    pages.push(await layout.render(index));
  return pages;
}

const releaseCanvas = (canvas) => {
  canvas.width = canvas.height = 0;
};
const canvasBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("页面图像生成失败，请重试。")),
      type,
      quality,
    ),
  );

/**
 * A4 PDF of a layout (or of ready canvases). Each page is drawn, embedded and
 * released before the next one; `onPage(done, total)` reports progress.
 */
export async function scorePagesPDF(source, title, onPage = () => {}) {
  const layout = Array.isArray(source)
    ? { count: source.length, render: (index) => source[index], keep: true }
    : source;
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("琴伴");
  pdf.setProducer("琴伴 Qinban");
  for (let index = 0; index < layout.count; index++) {
    const canvas = await layout.render(index);
    // The paper is opaque, so lossless PNG needs no alpha mask in the file.
    const bytes = await (await canvasBlob(canvas, "image/png")).arrayBuffer();
    if (!layout.keep) releaseCanvas(canvas);
    const image = await pdf.embedPng(bytes);
    const page = pdf.addPage([595.28, 841.89]);
    page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
    onPage(index + 1, layout.count);
    // Let the page paint progress between pages.
    await new Promise((resolve) => setTimeout(resolve));
  }
  return pdf.save();
}

export async function printScorePages(source, title) {
  const layout = Array.isArray(source)
    ? { count: source.length, render: (index) => source[index], keep: true }
    : source;
  const frame = document.createElement("iframe");
  frame.title = "打印乐谱";
  frame.style.cssText =
    "position:fixed;width:1px;height:1px;right:0;bottom:0;border:0";
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(
    "<!doctype html><html><head><style>@page{size:A4;margin:0}body{margin:0}img{display:block;width:210mm;height:297mm;break-after:page}img:last-child{break-after:auto}</style></head><body></body></html>",
  );
  doc.close();
  doc.title = title;
  const urls = [];
  const cleanUp = () => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    frame.remove();
  };
  try {
    for (let index = 0; index < layout.count; index++) {
      const canvas = await layout.render(index);
      const url = URL.createObjectURL(await canvasBlob(canvas, "image/png"));
      if (!layout.keep) releaseCanvas(canvas);
      urls.push(url);
      await new Promise((resolve, reject) => {
        const image = doc.createElement("img");
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
        doc.body.append(image);
      });
    }
    frame.contentWindow.addEventListener("afterprint", cleanUp, {
      once: true,
    });
    frame.contentWindow.focus();
    frame.contentWindow.print();
    // Some mobile browsers do not emit afterprint.
    setTimeout(cleanUp, 300000);
  } catch (error) {
    cleanUp();
    throw error;
  }
}
