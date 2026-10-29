// The full-PDF import dialog's shared context: one object every module receives,
// plus the selectors and operation-epoch guards that only read or bump it.
import { unwrap } from "./full-score-import-parts.js";

/** Builds the draft, view state and runtime handles for one mounted dialog. */
export function createImportContext({
  root,
  file,
  source,
  resumeJob,
  onImport,
  onClose,
  api,
}) {
  source = source && typeof source === "object" ? source : {};
  const draft = {
    id: `pdf-${Date.now().toString(36)}`,
    title: (file?.name || source.songName || "钢琴谱").replace(/\.pdf$/i, ""),
    composer: "",
    source,
    totalPages: 0,
    pages: [],
    regions: [],
    tempo: undefined,
    timeSignature: undefined,
    keySignature: undefined,
  };
  const state = {
    scanning: true,
    scannedPages: 0,
    busy: false,
    importing: false,
    activePage: 1,
    activeRegionId: "",
    selectedNoteId: "",
    selecting: false,
    stage: "scope",
    pianoConfirmed: source.pianoSourceVerified === true,
    scopeReviewed: false,
    capabilities: null,
    engine: "pi",
    riskReview: false,
    retryEngine: "current",
    retryEnlarge: true,
    pdfHash: null,
    selectedHeadIndex: null,
    autoContinue: true,
    job: null,
    error: "",
    message: "正在打开 PDF，随后逐页检查钢琴双手谱表。",
    uploaded: 0,
    progress: null,
  };
  return {
    root,
    file,
    source,
    resumeJob,
    onImport,
    onClose,
    api,
    draft,
    state,
    assets: new Map(),
    thumbnails: new Map(),
    remoteSignatures: new Map(),
    moveHistory: [],
    documentTask: undefined,
    pdf: undefined,
    disposed: false,
    scanCancelled: false,
    operationCancelled: false,
    operationVersion: 0,
    operationController: new AbortController(),
    pollTimer: 0,
    renderEpoch: 0,
    manualSequence: 0,
    previewRenderer: undefined,
    selector: undefined,
    activePrepared: undefined,
    preparedPromise: undefined,
    pdfQueue: Promise.resolve(),
    noteDrag: null,
    pageWorkbench: undefined,
    pageWorkbenchHost: undefined,
    restoreParentInert: undefined,
    /** Installed by the entry module; every other module redraws through it. */
    render: () => {},
  };
}

export const selectedRegions = ({ draft }) =>
  draft.regions
    .filter(
      (region) =>
        region.selected &&
        draft.pages.some(
          (page) => page.page === region.page && page.decision === "include",
        ),
    )
    .sort(
      (a, b) => a.page - b.page || a.rect.y - b.rect.y || a.rect.x - b.rect.x,
    );
export const activeRegion = ({ draft, state }) =>
  draft.regions.find((region) => region.id === state.activeRegionId);
export const pageInfo = ({ draft }, page) =>
  draft.pages.find((candidate) => candidate.page === page);
export const isRunning = ({ state }) =>
  state.busy || state.job?.status === "running";
export const scopeLocked = ({ state }) =>
  Boolean(state.job) || state.busy || state.scanning;

/** Starts a user operation; later responses from older epochs are ignored. */
export function beginOperation(ctx) {
  const intent = ++ctx.operationVersion;
  ctx.operationCancelled = false;
  if (ctx.operationController.signal.aborted)
    ctx.operationController = new AbortController();
  return intent;
}
export const assertAlive = (ctx, intent) => {
  if (
    ctx.disposed ||
    ctx.operationCancelled ||
    (intent !== undefined && intent !== ctx.operationVersion)
  )
    throw new Error("操作已停止。");
};
export async function cancelLateResponse(ctx, response, fallbackId, intent) {
  if (
    !ctx.disposed &&
    !ctx.operationCancelled &&
    (intent === undefined || intent === ctx.operationVersion)
  )
    return false;
  // A later explicit restart owns the job now; an old response must neither
  // overwrite that state nor cancel the new user-authorized run.
  if (
    !ctx.disposed &&
    !ctx.operationCancelled &&
    intent !== ctx.operationVersion
  )
    return true;
  const id = unwrap(response)?.id || fallbackId;
  if (id && typeof ctx.api.cancelJob === "function")
    await ctx.api.cancelJob(id).catch(() => {});
  return true;
}
export const requireApi = ({ api }, name) => {
  if (typeof api[name] !== "function")
    throw new Error(`服务器尚未提供 ${name} 接口，请刷新后重试。`);
  return api[name];
};
export const setMessage = (ctx, message, error = "") => {
  ctx.state.message = message;
  ctx.state.error = error;
  ctx.render();
};

export function capability({ state }) {
  const raw = state.capabilities?.fullScore || state.capabilities || {};
  return {
    pi: raw.pi?.ready !== false && raw.pi?.available !== false,
    deepseek: raw.deepseek?.ready === true,
  };
}
export function retryEngine(ctx) {
  const { state } = ctx;
  const engine =
    state.retryEngine === "current" ? state.engine : state.retryEngine;
  if (!capability(ctx)[engine])
    throw new Error(
      engine === "deepseek"
        ? "请先在 AI 设置连接 DeepSeek。"
        : "请先在 AI 设置连接 Pi / ChatGPT。",
    );
  return engine;
}
