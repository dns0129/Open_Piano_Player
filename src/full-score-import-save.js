// Saving from the full-PDF import dialog: the human-reviewed full score, or the
// unreviewed AI draft, each with its original row crops and page images.
import { validateScore } from "../lib/score.mjs";
import {
  fullScoreReviewSummary,
  assembleFullScoreReview,
} from "../lib/full-score-review.mjs";
import { unwrap } from "./full-score-import-parts.js";
import { requireApi, selectedRegions } from "./full-score-import-context.js";
import { ensureRegionAsset } from "./full-score-import-pages.js";
import { applySnapshot } from "./full-score-import-jobs.js";

function retainOriginalPages({ draft, thumbnails }, notation, selectedAssets) {
  notation.pages = draft.pages
    .filter((p) => p.decision === "include" && thumbnails.has(p.page))
    .map((p) => {
      const id = `original-page-${p.page}`,
        image = thumbnails.get(p.page);
      selectedAssets.push({
        id,
        page: p.page,
        blob: image.blob,
        mimeType: image.blob.type,
      });
      return {
        page: p.page,
        assetId: id,
        width: p.width,
        height: p.height,
        imageUrl: image.url,
      };
    });
}

export async function importUnreviewed(ctx) {
  const { draft, state, assets } = ctx;
  if (!state.scopeReviewed || !state.pianoConfirmed)
    throw new Error("请先确认钢琴谱身份和全部页、谱行范围。");
  state.importing = true;
  state.error = "";
  ctx.render();
  try {
    const response = unwrap(
        await requireApi(ctx, "exportDraft")(state.job.id, {
          scopeConfirmed: true,
        }),
      ),
      final = response.result;
    if (!final?.score || !final.sourceNotation)
      throw new Error("整谱草稿尚未完整识别。");
    const score = validateScore({
        ...final.score,
        title: draft.title + " · AI草稿（待校对）",
      }),
      selectedAssets = [];
    for (const region of selectedRegions(ctx)) {
      const asset = await ensureRegionAsset(ctx, region);
      selectedAssets.push({
        id: region.id,
        page: region.page,
        system: region.system,
        blob: asset.blob,
        mimeType: asset.mimeType,
        rect: { ...region.rect },
      });
    }
    const sourceNotation = {
      ...final.sourceNotation,
      title: score.title,
      scoreId: score.id,
      coordinateUnit: "page-image-pixels",
      systems: final.sourceNotation.systems.map((system) => ({
        ...system,
        assetId: system.id,
        imageUrl: assets.get(system.id).url,
        staffLines: draft.regions.find((r) => r.id === system.id)?.staffLines,
      })),
    };
    retainOriginalPages(ctx, sourceNotation, selectedAssets);
    await ctx.onImport({
      score,
      sourceNotation,
      measureMap: final.measureMap,
      assets: selectedAssets,
      warnings: final.warnings,
      reviewStatus: {
        method: "ai-unreviewed",
        complete: false,
        humanConfirmed: false,
      },
    });
  } finally {
    state.importing = false;
    if (!ctx.disposed) ctx.render();
  }
}

export async function importReviewed(ctx) {
  const { draft, state, assets } = ctx;
  const summary = fullScoreReviewSummary(draft);
  if (!summary.canImport)
    throw new Error(summary.issues[0]?.message || "尚未完成全部校对。");
  if (!state.scopeReviewed)
    throw new Error("请先确认已逐页核对全部谱行范围与排除项。");
  state.importing = true;
  state.error = "";
  ctx.render();
  try {
    if (state.job)
      applySnapshot(
        ctx,
        await requireApi(ctx, "confirmJob")(state.job.id, {
          scopeConfirmed: true,
        }),
      );
    const local = assembleFullScoreReview(draft),
      final = state.job?.result;
    if (
      !final?.score ||
      !final.sourceNotation ||
      state.job.status !== "complete"
    )
      throw new Error(
        "服务器尚未确认所有谱行及跨行连续性；不会导入部分结果冒充全谱。",
      );
    // The server merges cross-line ties and preserves the actual pickup and
    // measure map. Do not replace its timeline with fixed-length measures.
    const score = validateScore({
      ...final.score,
      title: local.score.title,
      tempo: draft.tempo || final.score.tempo,
      source: local.score.source,
    });
    const selectedAssets = [];
    for (const region of summary.selected) {
      const asset = await ensureRegionAsset(ctx, region);
      selectedAssets.push({
        id: region.id,
        page: region.page,
        system: region.system,
        blob: asset.blob,
        mimeType: asset.mimeType,
        rect: { ...region.rect },
      });
    }
    const sourceNotation = {
      ...final.sourceNotation,
      title: score.title,
      scoreId: score.id,
      source: score.source,
      coordinateUnit: "page-image-pixels",
      measureMap: final.measureMap || final.sourceNotation.measureMap,
      systems: final.sourceNotation.systems.map((system) => {
        const region = summary.selected.find(
          (candidate) =>
            candidate.id === system.id ||
            (candidate.page === system.page &&
              (candidate.jobSystem || candidate.system) === system.system),
        );
        return {
          ...system,
          assetId: region?.id || system.assetId || system.id,
          imageUrl: region ? assets.get(region.id).url : system.imageUrl,
          staffLines: region?.staffLines || system.staffLines,
          pageWidth: region?.pageWidth || system.pageWidth,
          pageHeight: region?.pageHeight || system.pageHeight,
        };
      }),
    };
    const warnings = [
      ...new Set([
        ...(final.warnings || []),
        ...summary.selected.flatMap((region) => region.warnings || []),
      ]),
    ];
    retainOriginalPages(ctx, sourceNotation, selectedAssets);
    await ctx.onImport({
      score,
      sourceNotation,
      measureMap: final.measureMap || sourceNotation.measureMap,
      assets: selectedAssets,
      warnings,
      reviewStatus: {
        ...local.reviewStatus,
        method: final.reviewStatus || local.reviewStatus.method,
      },
    });
    if (!ctx.disposed) {
      state.message = "已保存完整乐谱与原始谱行图片。";
      ctx.render();
    }
  } finally {
    state.importing = false;
    if (!ctx.disposed) ctx.render();
  }
}
