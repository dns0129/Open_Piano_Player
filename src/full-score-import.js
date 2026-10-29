import "./score-workbench.css";
import "./full-score-import.css";
import { assetURL } from "../lib/asset-url.mjs";
import { validateFullScorePdfUpload } from "../lib/full-score-review.mjs";
import { errorText, unwrap } from "./full-score-import-parts.js";
import { createImportContext } from "./full-score-import-context.js";
import { scanPage } from "./full-score-import-pages.js";
import {
  applySnapshot,
  cancel,
  poll,
  restoreScope,
} from "./full-score-import-jobs.js";
import { closePageWorkbench } from "./full-score-import-review.js";
import { render } from "./full-score-import-view.js";
import { bindActions } from "./full-score-import-actions.js";
import { bindNoteDrag } from "./full-score-import-drag.js";

/**
 * Generic PDF -> all-page scope -> asynchronous recognition -> per-line review.
 * Returns immediately so a modal can clean up while PDF loading is in flight.
 * `api` is injected; this module never reads credentials or calls a model itself.
 */
export function mountFullScoreImport(
  host,
  {
    file,
    source = {},
    resumeJob = null,
    onImport = () => {},
    onClose = () => {},
    api = {},
  } = {},
) {
  const root = document.createElement("section");
  root.className = "full-score-import";
  host.replaceChildren(root);
  const ctx = createImportContext({
    root,
    file,
    source,
    resumeJob,
    onImport,
    onClose,
    api,
  });
  const { draft, state, assets, thumbnails } = ctx;
  ctx.render = () => render(ctx);
  bindActions(ctx);
  bindNoteDrag(ctx);

  async function initialize() {
    await validateFullScorePdfUpload(file);
    let saved = unwrap(resumeJob);
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      const hash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      state.pdfHash = hash;
      if (saved?.originalPdf?.sha256 && hash !== saved.originalPdf.sha256)
        throw new Error(
          "恢复任务的 PDF 与原始文件不一致，不能复用先前音符与坐标。",
        );
    }
    const [pdfjs, capabilities] = await Promise.all([
      import("pdfjs-dist"),
      typeof api.getCapabilities === "function"
        ? Promise.resolve(api.getCapabilities()).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (ctx.disposed) return;
    state.capabilities = capabilities;
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
    ctx.documentTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      wasmUrl: assetURL("/pdfjs/wasm/"),
      standardFontDataUrl: assetURL("/pdfjs/standard_fonts/"),
      cMapUrl: assetURL("/pdfjs/cmaps/"),
      cMapPacked: true,
    });
    ctx.pdf = await ctx.documentTask.promise;
    if (ctx.disposed) return;
    if (ctx.pdf.numPages > 200)
      throw new Error(
        "PDF 超过 200 页，请先提取明确的练习范围。不会截取前 200 页冒充全谱。",
      );
    draft.totalPages = ctx.pdf.numPages;
    ctx.render();
    for (let pageNumber = 1; pageNumber <= ctx.pdf.numPages; pageNumber++) {
      if (ctx.disposed || ctx.scanCancelled) break;
      if (!(await scanPage(ctx, pageNumber))) break;
      state.scannedPages = pageNumber;
      state.message = `正在逐页检查：第 ${pageNumber} / ${ctx.pdf.numPages} 页，发现 ${draft.regions.length} 个谱行候选。`;
      ctx.render();
    }
    state.scanning = false;
    if (!ctx.scanCancelled && saved?.id) {
      restoreScope(ctx, saved);
      applySnapshot(ctx, saved);
      state.message = saved.reusedExactPdf
        ? `已复用相同 PDF 的已校对全谱：${draft.totalPages} 页、${draft.regions.length} 行，本次新增模型调用 0 次。原图与校对结果保留，请确认范围后导入。`
        : `已恢复保存的任务：${draft.totalPages} 页、${draft.regions.length} 行。原图、已识别结果与审核状态保留；请再次核对范围确认。`;
      if (saved.status === "running") poll(ctx);
      ctx.render();
      return;
    }
    state.message = ctx.scanCancelled
      ? "扫描已停止；未检查页面会阻止完整导入。请关闭并重新上传继续。"
      : `全部 ${ctx.pdf.numPages} 页已检查。请排除封面/空白页，核对每个谱行是否完整包含两只手。`;
    ctx.render();
  }

  function destroy() {
    if (ctx.disposed) return;
    ctx.disposed = true;
    closePageWorkbench(ctx);
    ctx.scanCancelled = true;
    ctx.operationCancelled = true;
    ctx.operationController.abort();
    clearTimeout(ctx.pollTimer);
    if (state.job?.status === "running" && typeof api.cancelJob === "function")
      void api.cancelJob(state.job.id).catch(() => {});
    ctx.selector?.destroy();
    ctx.previewRenderer?.destroy();
    ctx.activePrepared?.destroy();
    for (const asset of assets.values()) URL.revokeObjectURL(asset.url);
    for (const thumbnail of thumbnails.values())
      URL.revokeObjectURL(thumbnail.url);
    assets.clear();
    thumbnails.clear();
    void ctx.documentTask?.destroy();
    root.remove();
  }

  ctx.render();
  const ready = initialize().catch((error) => {
    if (!ctx.disposed) {
      state.scanning = false;
      state.error = errorText(error);
      state.message = "PDF 尚未完成检查，无法启动完整识谱。";
      ctx.render();
    }
  });
  return { ready, destroy, cancel: () => cancel(ctx), getDraft: () => draft };
}
