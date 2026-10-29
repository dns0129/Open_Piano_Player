// Offline adapters only. This module never imports model transports or auth.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { decodeCompactRegion } from "./recognition-wire.mjs";
import { validateRegionResult } from "./score-region.mjs";
import {
  evaluateRecognitionRun,
  compareRecognitionRegression,
} from "./recognition-regression.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function regressionScopeFingerprint(suite) {
  const sources = new Map(suite.files.map((f) => [f.path, f.sha256]));
  const cases = suite.cases.map((c) => ({
    id: c.id,
    dataset: c.dataset,
    eventUnit: c.eventUnit,
    referenceLevel: c.referenceLevel,
    alignment: c.alignment,
    partition: c.partition || "development",
    referenceSha256: c.reference ? sha(JSON.stringify(c.reference)) : null,
    sourceSha256: c.sourceImage?.sha256 ?? null,
    sourceImageSet: c.sourceImages?.map((i) => i.sha256) ?? null,
    pdfSha256: sources.get(c.sourcePdf) ?? null,
    region: c.region ?? null,
  }));
  return sha(
    JSON.stringify({
      cases,
      runs: suite.runs.map((r) => ({ trial: r.trial, caseIds: r.caseIds })),
    }),
  );
}

export async function verifiedRegressionSuite(file) {
  const bytes = await readFile(file),
    suite = JSON.parse(bytes);
  if (
    suite.schema !== "recognition-regression-suite/v1" ||
    !Array.isArray(suite.cases) ||
    !Array.isArray(suite.runs)
  )
    throw Error("固定回归清单无效");
  for (const f of suite.files) {
    const b = await readFile(f.path);
    if (sha(b) !== f.sha256)
      throw Error("冻结来源、参考或响应已变化：" + f.path);
  }
  return { suite, sha256: sha(bytes) };
}
function canonical(result, status) {
  const evidence = new Map(
    (result.score?.recognitionEvidence?.notes || []).map((n) => [n.noteId, n]),
  );
  const notes = (result.score?.notes || []).flatMap((n) => {
    const e = evidence.get(n.id),
      p = e
        ? { step: e.step, alter: e.alter, octave: e.octave }
        : ["source", "edited"].includes(n.pitch?.provenance)
          ? n.pitch
          : null;
    return [
      {
        ...n,
        ...(p ? { written: p } : {}),
        ...(e ? { printed: e.printed } : {}),
      },
      ...(n.grace?.notes || []).map((g) => ({
        ...g,
        hand: n.hand,
        beat: n.beat,
        duration: 0,
        grace: true,
      })),
    ];
  });
  return {
    notes,
    rests: result.rests || result.score?.rests || [],
    measureDurations: result.coverage?.measureDurations,
    status,
    checksPassed: result.checks?.passed === true,
    usageAudit:
      result.usageAudit ||
      (result.requestAudit?.length && result.usage
        ? { actualRequests: result.requestAudit.length, usage: result.usage }
        : null),
  };
}
export function regressionPrediction(
  reading,
  c,
  { decode = decodeCompactRegion, validate = validateRegionResult } = {},
) {
  const status = reading.status || "failed";
  if (!reading.value) return { caseId: c.id, status, notes: [] };
  try {
    if (reading.format === "normalized-events")
      return {
        caseId: c.id,
        status,
        ...reading.value,
        notes: reading.value.notes || [],
      };
    if (reading.format === "photo-subset") {
      const raw = reading.value,
        starts = [];
      let offset = 0;
      for (const d of raw.bars || []) {
        starts.push(offset);
        offset += d;
      }
      const wanted = new Set(c.reference?.notes.map((n) => n.measure) || []),
        graces = new Set((raw.graces || []).map((g) => g[0]));
      const notes = (raw.notes || []).flatMap((n, i) => {
        const m = starts.findIndex(
          (b, j) => n[1] >= b - 1e-5 && n[1] < b + raw.bars[j] - 1e-5,
        );
        if (!wanted.has(m + 1)) return [];
        return [
          {
            id: "n" + i,
            midi: n[0],
            beat: n[1] - starts[m],
            duration: n[2],
            hand: n[3] > 0 ? "right" : "left",
            measure: m + 1,
            grace: graces.has(i),
          },
        ];
      });
      return {
        caseId: c.id,
        status,
        notes,
        checksPassed: raw.complete === true,
      };
    }
    const request = {
      metadata: { title: "Fixed regression input" },
      region: c.region,
      pass: reading.value.notes?.some?.(
        (n) => Array.isArray(n) && n.length === 4,
      )
        ? "verify"
        : "recognize",
    };
    const decoded =
      reading.format === "compact"
        ? decode(reading.value, request)
        : reading.value;
    const result = validate(
      decoded,
      c.region,
      {},
      {
        requirePositions: !(
          decoded.positionlessReview ||
          decoded.positionlessSource ||
          request.pass === "verify"
        ),
      },
    );
    return { caseId: c.id, ...canonical(result, status) };
  } catch (e) {
    return {
      caseId: c.id,
      status: "failed",
      notes: [],
      error: { code: e.code || "DECODE_FAILED", message: e.message },
    };
  }
}
export function evaluateRegressionSuite(suite, { adapter, onDecoded } = {}) {
  return suite.runs.map((run) => {
    const caseById = new Map(suite.cases.map((c) => [c.id, c]));
    const predictions = run.readings.map((r) => {
      const c = caseById.get(r.caseId);
      if (!c) throw Error("响应引用未知评分区域");
      return regressionPrediction(r, c, adapter);
    });
    const result = evaluateRecognitionRun(suite.cases, predictions, {
        caseIds: run.caseIds,
        trial: run.trial,
      }),
      pmap = new Map(predictions.map((p) => [p.caseId, p]));
    onDecoded?.({
      trial: run.trial,
      cases: run.caseIds.map((id) => {
        const c = caseById.get(id);
        return {
          caseId: id,
          reference: c.reference
            ? {
                ...c.reference,
                compareMeasure: c.alignment === "annotated-bar-local",
              }
            : null,
          prediction: pmap.get(id) || { notes: [] },
          expected: result.rows.find((r) => r.caseId === id).metrics,
        };
      }),
    });
    return result;
  });
}
export function compareRegressionSuites(baseline, current) {
  const runs = current.map((r, i) => ({
    trial: r.trial,
    ...compareRecognitionRegression(
      baseline[i] || { scopeRows: -1, rows: [], groups: [] },
      r,
    ),
  }));
  return {
    passed: baseline.length === current.length && runs.every((r) => r.passed),
    runs,
  };
}
