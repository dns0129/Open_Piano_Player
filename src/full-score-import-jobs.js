// Server recognition jobs for the full-PDF import dialog: applying snapshots,
// polling, start/stop, retries and per-row or bulk human review.
import { validateScore } from "../lib/score.mjs";
import {
  normalizeFullScoreRegionResult,
  fullScoreRegionIssues,
  fullScoreScopeIssues,
} from "../lib/full-score-review.mjs";
import { prepareBulkReview } from "../lib/recognition-review-actions.mjs";
import {
  blobImage,
  canvasBlob,
  edited,
  errorText,
  finite,
  scopeLabel,
  unwrap,
} from "./full-score-import-parts.js";
import {
  activeRegion,
  assertAlive,
  beginOperation,
  cancelLateResponse,
  capability,
  isRunning,
  pageInfo,
  requireApi,
  retryEngine,
  selectedRegions,
} from "./full-score-import-context.js";
import {
  cropRegion,
  ensurePrepared,
  preparePage,
  storeAsset,
} from "./full-score-import-pages.js";

/** Merges a job snapshot into the draft without overwriting unsaved edits. */
export function applySnapshot(ctx, response) {
  const { draft, state, remoteSignatures } = ctx;
  const snapshot = unwrap(response);
  if (!snapshot?.id) return;
  state.job = { ...state.job, ...snapshot };
  state.engine = snapshot.engine === "deepseek" ? "deepseek" : "pi";
  state.riskReview = snapshot.metadata?.recognitionPlan?.review === "risk";
  state.progress = snapshot.progress || state.progress;
  for (const remote of snapshot.regions || []) {
    const index = draft.regions.findIndex((region) => region.id === remote.id);
    if (index < 0) continue;
    let local = draft.regions[index];
    if (remote.result) {
      const signature = JSON.stringify(remote.result);
      if (remoteSignatures.get(remote.id) !== signature && !local.dirty) {
        local = normalizeFullScoreRegionResult(local, remote.result);
        draft.regions[index] = local;
        remoteSignatures.set(remote.id, signature);
        if (!draft.tempo && remote.result.score?.tempo)
          draft.tempo = remote.result.score.tempo;
        if (!draft.timeSignature && remote.result.score?.timeSignature)
          draft.timeSignature = [...remote.result.score.timeSignature];
        if (
          draft.keySignature === undefined &&
          finite(remote.result.score?.keySignature)
        )
          draft.keySignature = remote.result.score.keySignature;
      }
      if (
        remote.status === "confirmed" ||
        remote.result.reviewStatus === "confirmed"
      )
        local.reviewed = !local.dirty;
      local.status = "complete";
    } else if (remote.status === "failed") {
      delete local.notes;
      delete local.score;
      local.reviewed = false;
      remoteSignatures.delete(remote.id);
      local.status = "failed";
      local.error =
        typeof remote.error === "object"
          ? remote.error.message
          : remote.error || "识别失败，请重试。";
    } else if (["running", "queued", "pending"].includes(remote.status))
      local.status = remote.status === "running" ? "running" : "pending";
  }
  const firstReady = selectedRegions(ctx).find(
    (region) => region.notes && !region.reviewed,
  );
  if (firstReady && (!activeRegion(ctx)?.notes || state.stage === "scope")) {
    state.activePage = firstReady.page;
    state.activeRegionId = firstReady.id;
    state.selectedNoteId = firstReady.notes[0]?.id || "";
    state.stage = "review";
    state.selecting = false;
  }
  state.message =
    snapshot.status === "draft"
      ? "任务已创建，正在保存原谱，尚未开始识别。"
      : snapshot.status === "running"
        ? "正在逐行识别；已完成的谱行现在可以开始校对。"
        : snapshot.status === "paused"
          ? "任务已暂停；已识别结果保留，可校对或继续剩余谱行。"
          : snapshot.status === "failed"
            ? "部分谱行失败，需重试或修正后才能完整导入。"
            : snapshot.status === "cancelled"
              ? "任务已停止，已完成结果仍可查看。"
              : snapshot.status === "complete"
                ? "所有谱行已通过审核，可导入练习。"
                : "识别结果已到达，可一键审核全部，或先拖拽修正有问题的音符。";
  ctx.render();
}

export function poll(ctx) {
  const { state } = ctx;
  clearTimeout(ctx.pollTimer);
  if (ctx.disposed || !state.job || state.job.status !== "running") return;
  const intent = ctx.operationVersion,
    jobId = state.job.id;
  ctx.pollTimer = setTimeout(async () => {
    if (ctx.disposed) return;
    try {
      const response = await requireApi(ctx, "getJob")(jobId);
      if (
        ctx.disposed ||
        ctx.operationCancelled ||
        intent !== ctx.operationVersion ||
        jobId !== state.job?.id
      )
        return;
      applySnapshot(ctx, response);
    } catch (error) {
      if (
        !ctx.disposed &&
        !ctx.operationCancelled &&
        intent === ctx.operationVersion
      ) {
        state.error = `读取任务进度失败：${errorText(error)}。识别结果不会当作已完成。`;
        ctx.render();
      }
    }
    if (!ctx.disposed && state.job?.status === "running") poll(ctx);
  }, 1500);
}

export async function startRecognition(ctx) {
  const { draft, state, api, assets, source, file } = ctx;
  if (state.scanning) throw new Error("请等待全部 PDF 页面检查完毕。");
  const issues = fullScoreScopeIssues(draft);
  if (issues.length) throw new Error(issues[0].message);
  if (!state.pianoConfirmed)
    throw new Error(
      "请先对照谱头/来源，确认上传的是钢琴双手谱，而非照片或其他乐器谱。",
    );
  const caps = capability(ctx);
  if (!caps[state.engine])
    throw new Error(
      state.engine === "deepseek"
        ? "请先配置 DeepSeek API Key，并选择 deepseek-flash。"
        : "Pi 识谱尚未连接，请先在 AI 设置中完成连接。",
    );
  const skippedMusic = draft.regions.some(
    (region) =>
      !region.selected &&
      region.excludeReason === "music" &&
      pageInfo(ctx, region.page)?.decision === "include",
  );
  if (skippedMusic)
    throw new Error(
      "当前整谱任务不能跳过同页中的音乐谱行。请保留这些行；封面和误检可明确排除。",
    );
  const intent = beginOperation(ctx);
  state.busy = true;
  state.uploaded = 0;
  state.error = "";
  state.message = `正在准备全部谱行，随后使用 ${state.engine === "deepseek" ? "DeepSeek Flash" : "GPT-6.1 Sol"} high 首次识别。`;
  ctx.render();
  try {
    const regions = selectedRegions(ctx);
    if (
      !state.job &&
      !state.riskReview &&
      state.pdfHash &&
      typeof api.findReviewedJob === "function"
    ) {
      const reused = await api.findReviewedJob(state.pdfHash, state.engine);
      assertAlive(ctx, intent);
      if (reused) {
        restoreScope(ctx, reused);
        applySnapshot(ctx, reused);
        state.message =
          "已复用同一服务商识别且已校对的相同 PDF，本次新增模型调用 0 次；请核对范围后导入。";
        ctx.render();
        return;
      }
    }
    if (!state.job) {
      const pageSystemCounts = new Map();
      const regionManifest = regions.map((region) => {
        const system = (pageSystemCounts.get(region.page) || 0) + 1;
        pageSystemCounts.set(region.page, system);
        region.jobSystem = system;
        return {
          id: region.id,
          page: region.page,
          system,
          rect: region.rect,
          pageWidth: region.pageWidth,
          pageHeight: region.pageHeight,
          staffLines: region.staffLines,
          context: `${scopeLabel(region)}，仅识别此行完整双手小节；禁止补写前后谱行。`,
          ...(region.expectedMeasureCount
            ? { expectedMeasureCount: region.expectedMeasureCount }
            : {}),
        };
      });
      const response = await requireApi(ctx, "createJob")(
        {
          title: draft.title,
          composer: draft.composer || undefined,
          source,
          totalPages: draft.totalPages,
          pages: draft.pages.map((page) => ({
            page: page.page,
            width: page.width,
            height: page.height,
            pdfWidth: page.pdfWidth,
            pdfHeight: page.pdfHeight,
          })),
          regions: regionManifest,
          excludedPages: draft.pages
            .filter((page) => page.decision === "exclude")
            .map((page) => ({ page: page.page, reason: page.excludeReason })),
          needsUserScopeConfirmation: true,
          engineChoice: state.engine,
          recognitionPlan: {
            review: state.riskReview ? "risk" : "off",
            maxCalls: 2,
            recover: true,
          },
          tempo: draft.tempo,
          timeSignature: draft.timeSignature,
          keySignature: draft.keySignature,
        },
        { signal: ctx.operationController.signal },
      );
      if (await cancelLateResponse(ctx, response, undefined, intent)) return;
      assertAlive(ctx, intent);
      applySnapshot(ctx, response);
    }
    if (!state.job.originalPdf?.uploaded && !state.job.originalPdf?.bytes) {
      const upload = api.uploadDocument || api.uploadPdf;
      if (typeof upload !== "function")
        throw new Error(
          "服务器尚未提供原始 PDF 上传接口，无法保存可恢复的识谱任务。",
        );
      state.message =
        "正在将原始 PDF 保存到本机任务，刷新后可以恢复；此步骤不调用模型。";
      ctx.render();
      const image = await blobImage(file);
      assertAlive(ctx, intent);
      const response = await upload(state.job.id, {
        ...image,
        mimeType: "application/pdf",
        name: file.name || "score.pdf",
      });
      assertAlive(ctx, intent);
      applySnapshot(ctx, response);
    }
    // Upload every pending row for GPT; retain already recognized legacy rows.
    // Preparing missing images must never erase approved historical results.
    let prepared, preparedPage;
    try {
      for (const region of regions) {
        assertAlive(ctx, intent);
        const existing = state.job.regions?.find(
          (candidate) => candidate.id === region.id,
        );
        if (existing?.image || existing?.result) {
          state.uploaded++;
          continue;
        }
        if (region.page !== preparedPage) {
          prepared?.destroy();
          prepared = await preparePage(ctx, region.page);
          preparedPage = region.page;
          assertAlive(ctx, intent);
        }
        const image = assets.has(region.id)
          ? await blobImage(assets.get(region.id).blob)
          : await cropRegion(ctx, prepared, region);
        assertAlive(ctx, intent);
        // Revalidate every actual crop even when an earlier manual preview cached it.
        if (assets.has(region.id))
          prepared.getSelection({
            mode: "manual",
            rect: region.rect,
            confirmedPiano: state.pianoConfirmed,
          });
        await requireApi(ctx, "uploadRegion")(
          state.job.id,
          region.id,
          { image: { data: image.data, mimeType: image.mimeType } },
          { signal: ctx.operationController.signal },
        );
        assertAlive(ctx, intent);
        state.uploaded++;
        state.message = `谱行已上传 ${state.uploaded} / ${regions.length}，全部源范围都保留在任务中。`;
        ctx.render();
      }
    } finally {
      prepared?.destroy();
    }
    assertAlive(ctx, intent);
    const started = await requireApi(ctx, "startJob")(
      state.job.id,
      {
        autoContinue: state.autoContinue,
        batchSize: 2,
        expectedVersion: state.job.runVersion,
      },
      { signal: ctx.operationController.signal },
    );
    if (await cancelLateResponse(ctx, started, state.job.id, intent)) return;
    applySnapshot(ctx, started);
    poll(ctx);
  } catch (error) {
    if (
      ctx.disposed ||
      ctx.operationCancelled ||
      intent !== ctx.operationVersion
    )
      return;
    throw error;
  } finally {
    if (intent === ctx.operationVersion) {
      state.busy = false;
      if (!ctx.disposed) ctx.render();
    }
  }
}

/** Stops scanning and the running operation; asks the server to stop the job. */
export async function cancel(ctx) {
  const { state, api } = ctx;
  ctx.scanCancelled = true;
  ctx.operationCancelled = true;
  ctx.operationVersion++;
  ctx.operationController.abort();
  clearTimeout(ctx.pollTimer);
  if (
    state.job &&
    (state.job.status === "running" || state.busy) &&
    typeof api.cancelJob === "function"
  ) {
    try {
      applySnapshot(ctx, await api.cancelJob(state.job.id));
    } catch (error) {
      if (!ctx.disposed)
        state.error = `停止请求失败：${errorText(error)}。请重试停止。`;
    }
  }
  if (!ctx.disposed) {
    state.busy = false;
    state.message = state.scanning
      ? "已停止继续扫描；尚未检查的页面会阻止完整导入。请关闭后重新导入以继续。"
      : "任务已停止，已完成的结果保留。";
    ctx.render();
  }
}

export async function confirmRegion(
  ctx,
  region = activeRegion(ctx),
  batch = false,
) {
  const { draft, state } = ctx;
  if (!region) return;
  if (state.job?.status === "running")
    throw new Error(
      "可以先编辑校对；请等待识别任务结束或停止后再提交此行审核。",
    );
  const issues = fullScoreRegionIssues(region);
  if (issues.length) throw new Error(issues[0].message);
  if (!state.job) throw new Error("此谱行没有对应的服务器识别任务。");
  const rawScore = {
    ...region.score,
    title: `${draft.title} · ${scopeLabel(region)}`,
    durationBeats: region.durationBeats,
    notes: region.notes,
    ...(region.score?.recognitionEvidence ? { rests: region.rests } : {}),
  };
  const score = region.notes.length
    ? validateScore(rawScore)
    : { ...rawScore, notes: [] };
  const originals = new Map(region.notes.map((note) => [note.id, note]));
  score.notes = score.notes.map((note) => ({
    ...note,
    voice: originals.get(note.id)?.voice || `${note.hand}-1`,
  }));
  const editedResult = {
    score,
    positions: region.notes
      .filter((note) => finite(note.x) && finite(note.y))
      .map((note) => ({
        noteId: note.id,
        x: note.x,
        y: note.y,
        coordinateSpace: "page",
      })),
    rests: region.rests || [],
    coverage: { ...region.coverage, complete: region.coverageComplete },
    continuity: region.continuity || {},
    internalTies: region.internalTies || [],
    corrections: region.corrections || [],
    sourceHeadAudit: region.sourceHeadAudit,
    tieAudit: region.tieAudit,
    warnings: region.warnings || [],
  };
  state.busy = true;
  state.error = "";
  state.message = `正在提交${scopeLabel(region)}的人工审核。`;
  ctx.render();
  try {
    const response = await requireApi(ctx, "confirmRegion")(
      state.job.id,
      region.id,
      editedResult,
    );
    region.reviewed = true;
    region.dirty = false;
    applySnapshot(ctx, response);
    const now = draft.regions.find((candidate) => candidate.id === region.id);
    if (now) {
      now.reviewed = true;
      now.dirty = false;
    }
    state.message = `${scopeLabel(region)}已审核；音符修改后会要求重新确认。`;
  } finally {
    if (!batch) state.busy = false;
    if (!ctx.disposed) ctx.render();
  }
}

export async function approveAll(ctx) {
  const { draft, state } = ctx;
  if (!state.pianoConfirmed) throw new Error("请先确认这是钢琴双手五线谱。");
  if (isRunning(ctx) || state.importing || state.scanning) return;
  const { summary } = prepareBulkReview(draft);
  if (!summary.canImport) {
    const issue = summary.issues[0];
    const region = draft.regions.find((r) => r.id === issue?.regionId);
    if (region) {
      state.activeRegionId = region.id;
      state.activePage = region.page;
      state.stage = "review";
    }
    throw new Error(
      `${region ? scopeLabel(region) + "：" : ""}${issue?.message || "没有可审核的谱行。"}`,
    );
  }
  const intent = beginOperation(ctx);
  // The action itself acknowledges scope and per-row review flags.
  state.scopeReviewed = true;
  for (const candidate of summary.selected) {
    const local = draft.regions.find((r) => r.id === candidate.id);
    if (
      !local.coverageComplete ||
      local.sourceHeadAudit?.reviewed === false ||
      local.tieAudit?.reviewed === false
    )
      edited(local);
    Object.assign(local, {
      coverageComplete: true,
      ...(candidate.sourceHeadAudit
        ? { sourceHeadAudit: candidate.sourceHeadAudit }
        : {}),
      ...(candidate.tieAudit ? { tieAudit: candidate.tieAudit } : {}),
    });
  }
  state.busy = true;
  ctx.render();
  try {
    for (const candidate of summary.selected) {
      assertAlive(ctx, intent);
      const region = draft.regions.find((r) => r.id === candidate.id);
      if (!region.reviewed || region.dirty)
        await confirmRegion(ctx, region, true);
    }
    assertAlive(ctx, intent);
    applySnapshot(
      ctx,
      await requireApi(ctx, "confirmJob")(state.job.id, {
        scopeConfirmed: true,
      }),
    );
    state.message = `已审核全部 ${summary.selectedCount} 行。可继续修正音符，或点击“保存到曲库”。`;
  } finally {
    state.busy = false;
    if (!ctx.disposed) ctx.render();
  }
}

export async function retryRegion(
  ctx,
  regionId = ctx.state.activeRegionId,
  phase = "recognize",
) {
  const { draft, state, remoteSignatures } = ctx;
  const region = draft.regions.find((candidate) => candidate.id === regionId);
  if (!region || !state.job) throw new Error("请先创建识别任务。");
  const intent = beginOperation(ctx);
  region.reviewed = false;
  region.dirty = false;
  remoteSignatures.delete(region.id);
  state.busy = true;
  state.error = "";
  ctx.render();
  try {
    const saved = state.job.regions?.find(
      (candidate) => candidate.id === region.id,
    );
    if (!saved?.image) {
      const prepared = await ensurePrepared(ctx, region.page),
        image = await cropRegion(ctx, prepared, region);
      assertAlive(ctx, intent);
      const uploaded = await requireApi(ctx, "uploadRegion")(
        state.job.id,
        region.id,
        { image: { data: image.data, mimeType: image.mimeType } },
        { signal: ctx.operationController.signal },
      );
      assertAlive(ctx, intent);
      applySnapshot(ctx, uploaded);
    }
    const response = await requireApi(ctx, "retryRegion")(
      state.job.id,
      region.id,
      {
        engine: retryEngine(ctx),
        expectedVersion: state.job.runVersion,
        phase,
      },
      { signal: ctx.operationController.signal },
    );
    if (await cancelLateResponse(ctx, response, state.job.id, intent)) return;
    applySnapshot(ctx, response);
    poll(ctx);
  } catch (error) {
    if (
      ctx.disposed ||
      ctx.operationCancelled ||
      intent !== ctx.operationVersion
    )
      return;
    throw error;
  } finally {
    if (intent === ctx.operationVersion) {
      state.busy = false;
      if (!ctx.disposed) ctx.render();
    }
  }
}

/** Uploads the saved crop upscaled (at most 2x) before a reread. */
async function enlargeRegion(ctx, region, intent) {
  const { state, remoteSignatures } = ctx;
  let bitmap, canvas;
  try {
    const original = await requireApi(ctx, "readRegionImage")(
      state.job.id,
      region.id,
    );
    assertAlive(ctx, intent);
    bitmap = await createImageBitmap(original);
    assertAlive(ctx, intent);
    const scale = Math.min(
      2,
      4000 / bitmap.width,
      4000 / bitmap.height,
      Math.sqrt(12000000 / (bitmap.width * bitmap.height)),
    );
    // Images already at the size limit can still be reread or sent to another model.
    if (scale <= 1) return;
    canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas),
      image = await blobImage(blob);
    assertAlive(ctx, intent);
    const uploaded = await requireApi(ctx, "uploadRegion")(
      state.job.id,
      region.id,
      { image },
      { signal: ctx.operationController.signal },
    );
    assertAlive(ctx, intent);
    storeAsset(ctx, region, image, blob);
    remoteSignatures.delete(region.id);
    applySnapshot(ctx, uploaded);
  } finally {
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export async function retryFailed(
  ctx,
  { single = false, enlarge = ctx.state.retryEnlarge } = {},
) {
  const { draft, state, remoteSignatures } = ctx;
  if (!state.job || isRunning(ctx)) return;
  const engine = retryEngine(ctx);
  const ids = single
    ? [state.activeRegionId]
    : state.job.regions
        .filter(
          (r) =>
            r.status === "failed" ||
            (r.status !== "confirmed" && r.result?.checks?.passed === false),
        )
        .map((r) => r.id);
  const regions = ids.map((id) => draft.regions.find((r) => r.id === id));
  if (!regions.length) throw new Error("没有需要重新识别的失败谱行。");
  if (regions.some((r) => !r || r.reviewed))
    throw new Error("已审核谱行请通过人工校对修改。");
  const intent = beginOperation(ctx);
  clearTimeout(ctx.pollTimer);
  state.busy = true;
  state.error = "";
  state.message = `正在准备重新识别 ${ids.length} 个谱行。`;
  ctx.render();
  try {
    if (enlarge)
      for (const region of regions) {
        assertAlive(ctx, intent);
        await enlargeRegion(ctx, region, intent);
      }
    assertAlive(ctx, intent);
    const response = await requireApi(ctx, "retryRegions")(
      state.job.id,
      { engine, regionIds: ids, expectedVersion: state.job.runVersion },
      { signal: ctx.operationController.signal },
    );
    if (await cancelLateResponse(ctx, response, state.job.id, intent)) return;
    for (const region of regions) {
      region.dirty = false;
      region.reviewed = false;
      remoteSignatures.delete(region.id);
    }
    applySnapshot(ctx, response);
    poll(ctx);
  } finally {
    if (intent === ctx.operationVersion) {
      state.busy = false;
      if (!ctx.disposed) ctx.render();
    }
  }
}

export async function retryEnlargedRegion(ctx) {
  await retryFailed(ctx, { single: true, enlarge: true });
}

/** Replaces the detected scope with a saved job's pages and regions. */
export function restoreScope(ctx, saved) {
  const { draft, state } = ctx;
  const metadata = saved.metadata || {};
  draft.id = saved.id;
  draft.title = metadata.title || saved.title || draft.title;
  draft.composer = metadata.composer || draft.composer;
  draft.tempo = metadata.tempo;
  draft.timeSignature = metadata.timeSignature;
  draft.keySignature = metadata.keySignature;
  const excluded = new Map(
    (saved.excludedPages || []).map((page) => [page.page, page.reason]),
  );
  for (const page of draft.pages) {
    page.decision = excluded.has(page.page) ? "exclude" : "include";
    page.excludeReason = excluded.get(page.page) || "";
  }
  const detected = new Map(draft.regions.map((region) => [region.id, region]));
  draft.regions = (saved.regions || []).map((region) => ({
    ...detected.get(region.id),
    id: region.id,
    page: region.page,
    system: region.system,
    jobSystem: region.system,
    rect: { ...region.rect },
    pageWidth: region.pageWidth || pageInfo(ctx, region.page)?.width,
    pageHeight: region.pageHeight || pageInfo(ctx, region.page)?.height,
    selected: true,
    excludeReason: "",
    status: "pending",
    reviewed: false,
    assetId: region.id,
  }));
  state.activeRegionId = draft.regions[0]?.id || "";
  state.activePage = draft.regions[0]?.page || 1;
}
