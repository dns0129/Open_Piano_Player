// PDF pages and region images for the full-PDF import dialog: a serial render
// queue, one cached prepared page, page scanning and per-region crop assets.
import { prepareScoreImage } from "./score-image.js";
import { normalizeCropRect } from "../lib/score-image-layout.mjs";
import { completePianoSystemRects } from "../lib/full-score-review.mjs";
import {
  blobFromImage,
  canvasBlob,
  scopeLabel,
} from "./full-score-import-parts.js";

/** Renders one PDF page; pages render one at a time to bound canvas memory. */
export async function renderPage(
  ctx,
  pageNumber,
  targetWidth,
  { includePixels = false } = {},
) {
  const work = ctx.pdfQueue.then(async () => {
    if (ctx.disposed) throw new Error("PDF 已关闭。");
    const page = await ctx.pdf.getPage(pageNumber),
      base = page.getViewport({ scale: 1 });
    let scale = Math.min(
      includePixels ? 3 : 2.5,
      targetWidth / base.width,
      8000 / base.height,
    );
    if (base.width * base.height * scale * scale > 20000000)
      scale *= Math.sqrt(20000000 / (base.width * base.height * scale * scale));
    const viewport = page.getViewport({ scale }),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(20, Math.round(viewport.width));
    canvas.height = Math.max(20, Math.round(viewport.height));
    try {
      await page.render({ canvasContext: canvas.getContext("2d"), viewport })
        .promise;
      return {
        blob: await canvasBlob(canvas),
        width: canvas.width,
        height: canvas.height,
        pdfWidth: base.width,
        pdfHeight: base.height,
        scale,
        ...(includePixels
          ? {
              pixels: canvas
                .getContext("2d")
                .getImageData(0, 0, canvas.width, canvas.height),
            }
          : {}),
      };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  });
  ctx.pdfQueue = work.catch(() => {});
  return work;
}

export async function preparePage(ctx, pageNumber) {
  const { source } = ctx;
  const rendered = await renderPage(ctx, pageNumber, 2200);
  return prepareScoreImage(rendered.blob, {
    page: pageNumber,
    pianoSourceVerified: source.pianoSourceVerified === true,
    sourceLabel: source.instrumentEvidence || source.label || "",
    maxDetectionDimension: 1600,
  });
}

/** Returns the prepared page, keeping only the most recent one alive. */
export async function ensurePrepared(ctx, pageNumber) {
  if (ctx.activePrepared?.page === pageNumber) return ctx.activePrepared;
  if (ctx.preparedPromise) {
    await ctx.preparedPromise;
    if (ctx.activePrepared?.page === pageNumber) return ctx.activePrepared;
  }
  const task = preparePage(ctx, pageNumber).then((prepared) => {
    if (ctx.disposed) {
      prepared.destroy();
      throw new Error("预览已关闭。");
    }
    ctx.activePrepared?.destroy();
    ctx.activePrepared = prepared;
    return prepared;
  });
  ctx.preparedPromise = task;
  try {
    return await task;
  } finally {
    if (ctx.preparedPromise === task) ctx.preparedPromise = null;
  }
}

/**
 * Detects the piano systems on one page and adds the page, its thumbnail and
 * its region candidates to the draft. Returns false when scanning stopped.
 */
export async function scanPage(ctx, pageNumber) {
  const { draft, state, source, thumbnails } = ctx;
  // An 800px preview can erase thin staff lines in image-only PDFs after
  // resampling. Detect at 1600px; pages are still processed sequentially.
  const low = await renderPage(ctx, pageNumber, 1600, { includePixels: true });
  if (ctx.disposed || ctx.scanCancelled) return false;
  const prepared = await prepareScoreImage(low.blob, {
    page: pageNumber,
    pianoSourceVerified: source.pianoSourceVerified === true,
    sourceLabel: source.instrumentEvidence || source.label || "",
  });
  try {
    const highScale = Math.min(2.5, 2200 / low.pdfWidth, 8000 / low.pdfHeight);
    let safeScale = highScale;
    if (low.pdfWidth * low.pdfHeight * safeScale * safeScale > 20000000)
      safeScale *= Math.sqrt(
        20000000 / (low.pdfWidth * low.pdfHeight * safeScale * safeScale),
      );
    const width = Math.max(20, Math.round(low.pdfWidth * safeScale)),
      height = Math.max(20, Math.round(low.pdfHeight * safeScale));
    const sx = width / prepared.width,
      sy = height / prepared.height;
    const completeRects = new Map(
      completePianoSystemRects(low.pixels, prepared.layout).map((system) => [
        system.id,
        system.rect,
      ]),
    );
    const page = {
      page: pageNumber,
      scanned: true,
      width,
      height,
      pdfWidth: low.pdfWidth,
      pdfHeight: low.pdfHeight,
      assessment: prepared.assessment,
      decision: prepared.assessment.hasGrandStaff ? "include" : "pending",
      excludeReason: "",
    };
    draft.pages.push(page);
    thumbnails.set(pageNumber, {
      blob: low.blob,
      url: URL.createObjectURL(low.blob),
    });
    for (const system of prepared.systems) {
      const completeRect = completeRects.get(system.id) || system.rect;
      const rect = normalizeCropRect(
        {
          x: completeRect.x * sx,
          y: completeRect.y * sy,
          width: completeRect.width * sx,
          height: completeRect.height * sy,
        },
        width,
        height,
      );
      draft.regions.push({
        id: `p${pageNumber}-s${system.index + 1}`,
        page: pageNumber,
        system: system.index + 1,
        rect,
        pageWidth: width,
        pageHeight: height,
        staffLines: {
          right: system.staffs[0]?.lines.map((y) => y * sy) || [],
          left: system.staffs[1]?.lines.map((y) => y * sy) || [],
        },
        selected:
          system.staffs.length === 2 && prepared.assessment.hasGrandStaff,
        excludeReason: "",
        status: "pending",
        reviewed: false,
        assetId: `p${pageNumber}-s${system.index + 1}`,
      });
    }
    if (!state.activeRegionId)
      state.activeRegionId =
        draft.regions.find((region) => region.selected)?.id || "";
  } finally {
    prepared.destroy();
  }
  return true;
}

export function storeAsset(
  { assets },
  region,
  image,
  blob = blobFromImage(image),
) {
  const previous = assets.get(region.id);
  if (previous?.url) URL.revokeObjectURL(previous.url);
  const value = {
    id: region.id,
    page: region.page,
    system: region.system,
    mimeType: blob.type || "image/png",
    blob,
    url: URL.createObjectURL(blob),
  };
  assets.set(region.id, value);
  region.assetId = region.id;
  region.imageUrl = value.url;
  return value;
}

export async function cropRegion(ctx, prepared, region) {
  const rect = normalizeCropRect(region.rect, prepared.width, prepared.height);
  const [image] = prepared.getSelection({
    mode: "manual",
    rect,
    confirmedPiano: ctx.state.pianoConfirmed,
  });
  if (!image) throw new Error(`${scopeLabel(region)}未能生成谱面图片。`);
  storeAsset(ctx, region, image);
  return image;
}

/** The region's image: cached, else the job's saved crop, else a fresh crop. */
export async function ensureRegionAsset(ctx, region) {
  const { assets, state, api } = ctx;
  if (assets.has(region.id)) return assets.get(region.id);
  if (
    state.job?.regions?.find((candidate) => candidate.id === region.id)
      ?.image &&
    typeof api.readRegionImage === "function"
  ) {
    try {
      const response = await api.readRegionImage(state.job.id, region.id);
      const image = response?.image || response;
      if (image instanceof Blob) return storeAsset(ctx, region, null, image);
      if (image?.data) return storeAsset(ctx, region, image);
    } catch {
      /* The original uploaded PDF remains the local source of truth. */
    }
  }
  const prepared = await ensurePrepared(ctx, region.page);
  await cropRegion(ctx, prepared, region);
  return assets.get(region.id);
}
