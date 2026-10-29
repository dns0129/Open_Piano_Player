// Rendering of the full-PDF import dialog: builds the view model, swaps in the
// markup while keeping scroll, focus and open sections, then mounts the crop
// selector or the original image for the active row.
import { mountScoreImageSelector } from "./score-image.js";
import {
  fullScoreRegionIssues,
  fullScoreReviewSummary,
} from "../lib/full-score-review.mjs";
import { errorText, finite } from "./full-score-import-parts.js";
import {
  activeRegion,
  isRunning,
  pageInfo,
  scopeLocked,
  selectedRegions,
} from "./full-score-import-context.js";
import {
  ensurePrepared,
  ensureRegionAsset,
} from "./full-score-import-pages.js";
import { updatePositionMarker } from "./full-score-import-review.js";
import { fullScoreImportMarkup } from "./full-score-import-markup.js";

/** Every value the markup needs, derived once per render. */
export function buildViewModel(ctx) {
  const { draft, state, assets, thumbnails, moveHistory } = ctx;
  const summary = fullScoreReviewSummary(draft),
    current = activeRegion(ctx),
    selected = selectedRegions(ctx);
  return {
    draft,
    state,
    summary,
    pageRegions: draft.regions.filter(
      (region) => region.page === state.activePage,
    ),
    current,
    selected,
    failedCount: (state.job?.regions || []).filter(
      (region) =>
        region.status === "failed" ||
        (region.status !== "confirmed" &&
          region.result?.checks?.passed === false),
    ).length,
    processed: state.progress
      ? (state.progress.needsReview || 0) +
        (state.progress.confirmed || 0) +
        (state.progress.failed || 0)
      : summary.recognizedCount,
    total: state.progress?.total || selected.length,
    running: isRunning(ctx),
    locked: scopeLocked(ctx),
    currentIssues:
      current?.status === "complete" ? fullScoreRegionIssues(current) : [],
    originalURL:
      current && state.stage === "review"
        ? assets.get(current.id)?.url
        : thumbnails.get(state.activePage)?.url,
    thumbnailURL: new Map(
      [...thumbnails].map(([page, thumbnail]) => [page, thumbnail.url]),
    ),
    activePageInfo: pageInfo(ctx, state.activePage),
    undoableMoves: moveHistory.length,
  };
}

export function render(ctx) {
  const { root, state } = ctx;
  if (ctx.disposed) return;
  const sameRegion = root.dataset.viewRegion === state.activeRegionId;
  const scrollPositions = sameRegion
    ? [
        ".fsi-original",
        ".fsi-roll-scroll",
        ".fsi-review-table",
        ".fsi-pages",
      ].map((selector) => {
        const element = root.querySelector(selector);
        return {
          selector,
          top: element?.scrollTop || 0,
          left: element?.scrollLeft || 0,
        };
      })
    : [];
  const jobSettingsOpen =
    root.dataset.jobId === (state.job?.id || "") &&
    root.querySelector(".fsi-job-settings")?.open;
  root.dataset.jobId = state.job?.id || "";
  const noteDetailsOpen =
    sameRegion && root.querySelector(".fsi-note-details")?.open;
  const writtenOpen =
    sameRegion && root.querySelector(".fsi-written-evidence")?.open;
  root.dataset.viewRegion = state.activeRegionId;
  const focus = root.contains(document.activeElement)
    ? {
        noteId: document.activeElement.dataset.noteId,
        field: document.activeElement.dataset.noteField,
        meta: document.activeElement.dataset.meta,
        restField: document.activeElement.dataset.restField,
        restIndex: document.activeElement.dataset.restIndex,
        start: document.activeElement.selectionStart,
      }
    : null;
  const advancedOpen = root.querySelector(".fsi-advanced")?.open;
  const epoch = ++ctx.renderEpoch;
  ctx.selector?.destroy();
  ctx.selector = null;
  ctx.previewRenderer?.destroy();
  ctx.previewRenderer = null;
  root.innerHTML = fullScoreImportMarkup(buildViewModel(ctx));
  if (state.busy || state.importing)
    for (const input of root.querySelectorAll(
      "[data-note-field],[data-written-kind],[data-region-duration],[data-region-coverage],[data-rest-field],[data-measure-durations],[data-continuity],[data-tie-direction],[data-internal-tie],[data-head-reviewed],[data-tie-reviewed],[data-scope-reviewed],[data-source-note],[data-roll-note]",
    ))
      input.disabled = true;
  if (state.job)
    for (const input of root.querySelectorAll(
      '[data-meta="timeSignature"],[data-meta="keySignature"]',
    ))
      input.disabled = true;
  if (advancedOpen && root.querySelector(".fsi-advanced"))
    root.querySelector(".fsi-advanced").open = true;
  if (jobSettingsOpen && root.querySelector(".fsi-job-settings"))
    root.querySelector(".fsi-job-settings").open = true;
  if (noteDetailsOpen && root.querySelector(".fsi-note-details"))
    root.querySelector(".fsi-note-details").open = true;
  if (writtenOpen && root.querySelector(".fsi-written-evidence"))
    root.querySelector(".fsi-written-evidence").open = true;
  for (const { selector, top, left } of scrollPositions) {
    const element = root.querySelector(selector);
    if (element) {
      element.scrollTop = top;
      element.scrollLeft = left;
    }
  }
  if (focus) {
    const input =
      focus.noteId && focus.field
        ? [...root.querySelectorAll("[data-note-field]")].find(
            (element) =>
              element.dataset.noteId === focus.noteId &&
              element.dataset.noteField === focus.field,
          )
        : focus.meta
          ? [...root.querySelectorAll("[data-meta]")].find(
              (element) => element.dataset.meta === focus.meta,
            )
          : focus.restField
            ? [...root.querySelectorAll("[data-rest-field]")].find(
                (element) =>
                  element.dataset.restField === focus.restField &&
                  element.dataset.restIndex === focus.restIndex,
              )
            : null;
    input?.focus();
    if (input?.type === "text" && finite(focus.start))
      input.setSelectionRange(focus.start, focus.start);
  }
  void renderActiveView(ctx, epoch).catch((error) => {
    if (!ctx.disposed && epoch === ctx.renderEpoch) {
      state.error = errorText(error);
      const alert = document.createElement("p");
      alert.className = "fsi-error";
      alert.setAttribute("role", "alert");
      alert.textContent = state.error;
      root.querySelector(".fsi-view")?.append(alert);
    }
  });
}

async function renderActiveView(ctx, epoch) {
  const { root, state, assets } = ctx;
  const region = activeRegion(ctx);
  if (state.selecting) {
    const prepared = await ensurePrepared(ctx, state.activePage);
    if (ctx.disposed || epoch !== ctx.renderEpoch) return;
    const wrapped = {
      ...prepared,
      getAssessment: (options) =>
        prepared.getAssessment({
          ...options,
          confirmedPiano: state.pianoConfirmed || options?.confirmedPiano,
        }),
      getSelection: (options) =>
        prepared.getSelection({
          ...options,
          confirmedPiano: state.pianoConfirmed || options?.confirmedPiano,
        }),
    };
    ctx.selector = mountScoreImageSelector(
      root.querySelector("[data-crop-selector]"),
      wrapped,
    );
  } else if (state.stage === "review" && region?.notes) {
    if (!assets.has(region.id)) await ensureRegionAsset(ctx, region);
    if (ctx.disposed || epoch !== ctx.renderEpoch) return;
    const image = root.querySelector("[data-original-image]");
    if (image) {
      image.addEventListener("load", () => updatePositionMarker(ctx), {
        once: true,
      });
      if (image.src !== assets.get(region.id).url)
        image.src = assets.get(region.id).url;
    } else {
      ctx.render();
      return;
    }
    updatePositionMarker(ctx);
  }
}
