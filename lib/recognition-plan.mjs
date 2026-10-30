import { recognitionDisposition } from "./recognition-disposition.mjs";
import { compareRegionReadings } from "./recognition-comparison.mjs";
import { validateRegionResult } from "./score-region.mjs";
import {
  enhanceRecognitionRegion,
  splitRecognitionRegion,
  sourceContextFromPdf,
} from "./recognition-regions.mjs";
import { aggregateRecognitionUsage } from "./recognition-accounting.mjs";

export function recognitionRisk(result) {
  const e = result.score.recognitionEvidence,
    reasons = [];
  if (Math.abs(result.score.keySignature) >= 4) reasons.push("key-signature");
  if (
    result.score.notes.length / Math.max(1, result.coverage.measureCount) >=
    24
  )
    reasons.push("dense-heads");
  if (e?.clefs.length > 2) reasons.push("clef-change");
  if (e?.notes.filter((n) => n.printed !== null).length >= 8)
    reasons.push("accidentals");
  if (e?.notes.some((n) => n.shift)) reasons.push("octave-shift");
  if (
    result.warnings?.some(
      (w) =>
        !w.includes("不能证明") &&
        !w.includes("原谱速度") &&
        !w.includes("弱起"),
    )
  )
    reasons.push("source-warning");
  if (result.checks?.errors.length) reasons.push("validation-issues");
  return reasons;
}
export function normalizeRecognitionPlan(raw = {}) {
  if (
    !["off", "risk"].includes(raw.review ?? "off") ||
    !Number.isInteger(raw.maxCalls ?? 2) ||
    (raw.maxCalls ?? 2) < 1 ||
    (raw.maxCalls ?? 2) > 6 ||
    (raw.recover !== undefined && typeof raw.recover !== "boolean")
  )
    throw Object.assign(
      new Error("识别策略须指定 off/risk 复读模式及 1–6 次总调用预算。"),
      { code: "INVALID_RECOGNITION_PLAN", expose: true, status: 422 },
    );
  return {
    version: 1,
    review: raw.review ?? "off",
    maxCalls: raw.maxCalls ?? 2,
    recover: raw.recover ?? true,
  };
}

// Each call crosses the same acceptance seam. Review requests contain only
// source context; previous answers never enter the independent review prompt.
export async function runRecognitionPlan(
  request,
  {
    read,
    prepare = enhanceRecognitionRegion,
    split = splitRecognitionRegion,
    pdf,
    signal,
    onCheckpoint = async () => {},
    policy = {},
    checkpoint,
    firstRegion,
    sourceContext,
  },
) {
  if (
    pdf &&
    !request.region.detailImages?.some((i) => i.kind === "source-context")
  ) {
    const context =
      sourceContext ||
      (await sourceContextFromPdf(pdf, {
        pageNumber: firstRegion?.page || 1,
        firstRegion,
      }));
    request = {
      ...request,
      region: {
        ...request.region,
        detailImages: [
          ...(request.region.detailImages || []).slice(0, 2),
          context,
        ],
      },
    };
  }
  const plan = normalizeRecognitionPlan(policy),
    history = structuredClone(checkpoint?.history || []);
  let calls = checkpoint?.calls || 0,
    result = structuredClone(
      history
        .filter(
          (h) => h.result && ["first", "source-recovery"].includes(h.stage),
        )
        .at(-1)?.result,
    ),
    lastError;
  const call = async (req, stage) => {
    const prior = history.find(
      (h) => h.stage === stage && h.regionId === req.region.id,
    );
    if (prior) {
      if (prior.result) return structuredClone(prior.result);
      throw Object.assign(
        new Error(
          prior.error?.message || "先前请求状态未确认，不能自动重复调用。",
        ),
        {
          code: prior.error?.code || "UNCERTAIN_PROVIDER_STATE",
          expose: true,
          sourceAssessment: prior.error?.sourceAssessment,
          issues: prior.error?.issues,
        },
      );
    }
    if (calls >= plan.maxCalls)
      throw Object.assign(new Error("本行调用预算已用完，已保存结果。"), {
        code: "RECOGNITION_BUDGET",
        expose: true,
      });
    signal?.throwIfAborted();
    calls++;
    const entry = {
      stage,
      regionId: req.region.id,
      startedAt: new Date().toISOString(),
      imageSha256: req.region.image.sha256 ?? null,
      source:
        req.region.recoveryImage ??
        (req.region.parentMapping
          ? {
              kind: "verified-measure-segment",
              parentMapping: req.region.parentMapping,
              selection: req.region.selection,
            }
          : null),
    };
    history.push(entry);
    await onCheckpoint({ calls, history: structuredClone(history) });
    try {
      const value = await read(
        { ...req, requireNotation: true },
        { signal, maxCalls: 1 },
      );
      entry.result = value;
      return value;
    } catch (error) {
      entry.error = {
        code: error.code || "RECOGNITION_FAILED",
        message: error.expose ? error.message : "本行请求失败",
        ...(error.usageAudit ? { usageAudit: error.usageAudit } : {}),
        recognitionDisposition: recognitionDisposition(error),
        ...(error.issues ? { issues: error.issues } : {}),
        ...(error.sourceAssessment
          ? { sourceAssessment: error.sourceAssessment }
          : {}),
      };
      lastError = error;
      throw error;
    } finally {
      entry.endedAt = new Date().toISOString();
      await onCheckpoint({ calls, history: structuredClone(history) });
    }
  };
  if (!result)
    try {
      result = await call(request, "first");
    } catch (error) {
      lastError = error;
    }
  const recoverable = [
    "NEEDS_SOURCE",
    "INCOMPLETE_REGION",
    "NO_REGION_RESULT",
    "INVALID_COMPACT_REGION",
    "INVALID_DIGITAL_REGION",
  ];
  let partial = result?.checks?.passed === false ? result : null;
  if (partial) {
    result = null;
    lastError = Object.assign(new Error("原图字段存在矛盾"), {
      code: "INVALID_COMPACT_REGION",
      issues: partial.checks.errors,
      sourceAssessment: partial.sourceAssessment,
    });
  }
  if (
    !result &&
    plan.recover &&
    calls < plan.maxCalls &&
    recoverable.includes(lastError?.code) &&
    recognitionDisposition(lastError).retryWithSource
  ) {
    try {
      const enhanced = await prepare(request.region, { pdf });
      enhanced.detailImages = [
        ...(enhanced.detailImages || []).slice(0, 2),
        ...(request.region.detailImages || []).filter(
          (i) => i.kind === "source-context",
        ),
      ].slice(0, 3);
      result = await call(
        {
          ...request,
          region: enhanced,
          ...(partial
            ? {
                repair: {
                  issues: partial.checks.errors,
                  previousSubmission: partial.submissionAudit?.at(-1)?.raw,
                },
              }
            : {}),
        },
        "source-recovery",
      );
      if (result.checks?.passed === false) {
        partial = result;
        result = null;
        lastError = Object.assign(new Error("局部重读仍有结构疑点"), {
          code: "INVALID_COMPACT_REGION",
          issues: partial.checks.errors,
          sourceAssessment: partial.sourceAssessment,
        });
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (
    !result &&
    plan.recover &&
    calls + 2 <= plan.maxCalls &&
    recoverable.includes(lastError?.code) &&
    recognitionDisposition(lastError).retryWithSource
  ) {
    try {
      const parts = await split(request.region),
        readings = [];
      for (const region of parts)
        readings.push(await call({ ...request, region }, "measure-segment"));
      result = mergeRecognitionParts(readings, parts, request);
    } catch (error) {
      lastError = error;
    }
  }
  if (!result && partial) result = partial;
  if (!result)
    throw Object.assign(lastError || new Error("未完成识别"), {
      recognitionPlan: { ...plan, calls, history },
      recognitionDisposition: recognitionDisposition(lastError),
    });
  const risks = recognitionRisk(result);
  let review = { status: "not-requested", riskReasons: risks };
  if (
    plan.review === "risk" &&
    risks.length &&
    (calls < plan.maxCalls ||
      history.some((h) => h.stage === "independent-risk-review"))
  ) {
    const { region, metadata, engine, jobId } = request;
    const sourceRegion = Object.fromEntries(
      [
        "id",
        "page",
        "system",
        "rect",
        "pageWidth",
        "pageHeight",
        "measureCount",
        "context",
        "image",
        "detailImages",
      ]
        .filter((k) => region[k] !== undefined)
        .map((k) => [k, region[k]]),
    );
    const sourceMetadata = Object.fromEntries(
      ["title", "composer", "timeSignature", "keySignature", "tempo"]
        .filter((k) => metadata[k] !== undefined)
        .map((k) => [k, metadata[k]]),
    );
    try {
      const second = await call(
        {
          engine,
          jobId,
          metadata: sourceMetadata,
          region: sourceRegion,
          pass: "verify",
          requireNotation: true,
        },
        "independent-risk-review",
      );
      const comparison = compareRegionReadings(result, second);
      review = {
        status: comparison.exactMatch ? "agreement" : "disagreement",
        riskReasons: risks,
        comparison,
        reading: second,
        humanConfirmed: false,
      };
      if (!comparison.exactMatch) {
        result = {
          ...result,
          checks: {
            ...result.checks,
            passed: false,
            errors: [
              ...result.checks.errors,
              {
                code: "READING_DISAGREEMENT",
                message: "独立原图复读存在分歧，首轮结果保留，须按原图裁决。",
              },
            ],
          },
          reviewStatus: "needs-correction",
        };
      }
    } catch (error) {
      review = {
        status: "unavailable",
        riskReasons: risks,
        error: { code: error.code || "REVIEW_FAILED" },
        humanConfirmed: false,
      };
    }
  } else if (plan.review === "risk" && risks.length)
    review = {
      status: "budget-exhausted",
      riskReasons: risks,
      humanConfirmed: false,
    };
  const audits = history.map(
    (h) =>
      h.result?.usageAudit ||
      h.error?.usageAudit || {
        usage: h.result?.usage ?? null,
        actualRequests: h.result?.requestAudit?.length ?? null,
      },
  );
  const usageAudit = aggregateRecognitionUsage(audits);
  return {
    ...result,
    usage: usageAudit.usage,
    usageAudit,
    verification: review,
    recognitionDisposition: result.checks?.passed
      ? {
          category: "structural-pass",
          action: "source-review-still-required",
          retryWithSource: false,
        }
      : recognitionDisposition(result),
    recognitionPlan: { ...plan, calls, history },
  };
}

export function mergeRecognitionParts(readings, parts, request) {
  const score = {
      ...readings[0].score,
      notes: [],
      rests: [],
      measureMap: [],
      tempoMap: [],
      fermatas: [],
      recognitionEvidence: {
        version: 1,
        notes: [],
        rests: [],
        clefs: [],
        keys: [],
        voices: [],
        graces: [],
      },
    },
    positions = [],
    bars = [],
    ties = [];
  let offset = 0;
  const continuity = { tieIn: [], tieOut: [] };
  for (const [i, r] of readings.entries()) {
    if (
      r.coverage.measureCount !== parts[i].measureCount ||
      !r.score.recognitionEvidence
    )
      throw Object.assign(new Error("分段未完整覆盖已确认小节，不能拼接。"), {
        code: "INCOMPLETE_REGION",
        expose: true,
      });
    const prefix = "part" + i + "-",
      rename = (id) => prefix + id,
      map = parts[i].parentMapping,
      e = r.score.recognitionEvidence;
    const mapPositions = (positions) =>
      positions?.map((p) => ({
        ...p,
        x: map.x + ((p.x - parts[i].rect.x) / parts[i].rect.width) * map.width,
      }));
    const ownBars =
      r.score.measureMap ||
      r.coverage.measureDurations.map((duration, j, all) => ({
        beat: all.slice(0, j).reduce((a, b) => a + b, 0),
        duration,
        timeSignature: r.score.timeSignature,
      }));
    score.measureMap.push(
      ...ownBars.map((b) => ({ ...b, beat: b.beat + offset })),
    );
    score.tempoMap.push(
      ...(r.score.tempoMap || []).map((t) => ({ ...t, beat: t.beat + offset })),
    );
    score.fermatas.push(
      ...(r.score.fermatas || []).map((t) => ({ ...t, beat: t.beat + offset })),
    );
    for (const p of r.positions || []) {
      const x = (p.x - parts[i].rect.x) / parts[i].rect.width;
      if (
        parts[i].selection &&
        (x < parts[i].selection.from - 1e-4 || x > parts[i].selection.to + 1e-4)
      )
        throw Object.assign(
          new Error("分段结果包含上下文重叠区音符，不能自动合并。"),
          { code: "INCOMPLETE_REGION", expose: true },
        );
    }
    for (const n of r.score.notes)
      score.notes.push({
        ...n,
        ...(n.sourcePositions
          ? { sourcePositions: mapPositions(n.sourcePositions) }
          : {}),
        id: rename(n.id),
        beat: n.beat + offset,
        ...(n.tieTo ? { tieTo: rename(n.tieTo) } : {}),
      });
    for (const rest of r.rests || [])
      score.rests.push({
        ...rest,
        ...(rest.sourcePositions
          ? { sourcePositions: mapPositions(rest.sourcePositions) }
          : {}),
        id: rename(rest.id),
        beat: rest.beat + offset,
      });
    for (const p of r.positions || [])
      positions.push({
        ...p,
        noteId: rename(p.noteId),
        x: map.x + ((p.x - parts[i].rect.x) / parts[i].rect.width) * map.width,
      });
    score.recognitionEvidence.notes.push(
      ...e.notes.map((n) => ({ ...n, noteId: rename(n.noteId) })),
    );
    score.recognitionEvidence.rests.push(
      ...e.rests.map((n) => ({ ...n, restId: rename(n.restId) })),
    );
    score.recognitionEvidence.graces.push(
      ...(e.graces || []).map((g) => ({
        ...g,
        noteId: rename(g.noteId),
        anchor: rename(g.anchor),
        beat: g.beat + offset,
      })),
    );
    for (const key of ["clefs", "keys"])
      score.recognitionEvidence[key].push(
        ...e[key].map((c) => ({ ...c, beat: c.beat + offset })),
      );
    score.recognitionEvidence.voices.push(
      ...e.voices.map((v) => ({
        ...v,
        from: v.from + offset,
        to: v.to + offset,
      })),
    );
    ties.push(
      ...r.internalTies.map((t) => ({
        fromNoteId: rename(t.fromNoteId),
        toNoteId: rename(t.toNoteId),
      })),
    );
    if (i === 0)
      continuity.tieIn = r.continuity.tieIn.map((t) => ({
        ...t,
        noteId: rename(t.noteId),
      }));
    if (i === readings.length - 1)
      continuity.tieOut = r.continuity.tieOut.map((t) => ({
        ...t,
        noteId: rename(t.noteId),
      }));
    if (i) {
      const previous = readings[i - 1];
      const remaining = [...r.continuity.tieIn];
      for (const a of previous.continuity.tieOut) {
        const j = remaining.findIndex(
          (b) => a.midi === b.midi && a.hand === b.hand,
        );
        if (j < 0)
          throw Object.assign(new Error("切分边界的延音缺少独立接续证据。"), {
            code: "INCOMPLETE_REGION",
            expose: true,
          });
        ties.push({
          fromNoteId: "part" + (i - 1) + "-" + a.noteId,
          toNoteId: rename(remaining.splice(j, 1)[0].noteId),
        });
      }
      if (remaining.length)
        throw Object.assign(new Error("切分边界存在没有起点的延音。"), {
          code: "INCOMPLETE_REGION",
          expose: true,
        });
    }
    offset += r.score.durationBeats;
    bars.push(...r.coverage.measureDurations);
  }
  score.durationBeats = offset;
  score.recognitionEvidence.source = {
    page: request.region.page,
    system: request.region.system,
    rect: request.region.rect,
    imageSha256: request.region.image.sha256 ?? null,
  };
  score.recognitionEvidence.sources = parts.map((p) => ({
    regionId: p.id,
    imageSha256: p.image.sha256,
    parentMapping: p.parentMapping,
    selection: p.selection,
  }));
  const raw = {
    score,
    rests: score.rests,
    positions,
    internalTies: ties,
    continuity,
    coverage: {
      complete: true,
      measureCount: bars.length,
      measureDurations: bars,
    },
    warnings: readings.flatMap((r) => r.warnings || []),
  };
  return {
    ...validateRegionResult(raw, request.region, request.metadata, {
      requirePositions: readings.every((r) => !r.positionlessReview),
    }),
    positionlessReview: readings.some((r) => r.positionlessReview),
  };
}
