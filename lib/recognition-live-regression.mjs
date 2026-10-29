import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  verifiedRegressionSuite,
  regressionPrediction,
} from "./recognition-regression-io.mjs";
import {
  evaluateRecognitionRun,
  compareRecognitionRegression,
} from "./recognition-regression.mjs";
import { sourceContextFromPdf } from "./recognition-regions.mjs";
import { fileURLToPath } from "node:url";
import {
  recognitionPromptFingerprint,
  recognitionReleaseFingerprint,
} from "./recognition-governance.mjs";

// Explicitly paid entry point; offline tools never import a model transport.
export async function runLiveRecognitionRegression({
  suiteFile,
  output,
  maxCalls,
  read,
  context = sourceContextFromPdf,
}) {
  const { suite, sha256 } = await verifiedRegressionSuite(suiteFile),
    scope = suite.cases.filter((c) => c.sourceImage && c.sourcePdf),
    caseIds = scope.map((c) => c.id);
  if (
    !scope.length ||
    !Number.isInteger(maxCalls) ||
    maxCalls < scope.length ||
    maxCalls > 1000
  )
    throw Error(
      "真实回归需要明确的调用预算，且须覆盖全部固定 PDF 谱行；未发起请求",
    );
  const seed = suite.runs.find((r) => r.trial === "dense-p0-offline-recovery");
  if (!seed || JSON.stringify(seed.caseIds) !== JSON.stringify(caseIds))
    throw Error("真实回归缺少完全相同范围的冻结基线");
  await mkdir(output);
  let requests = 0,
    unknownRequestCounts = 0,
    stopped = false;
  const predictions = [],
    responses = [],
    contexts = new Map();
  const root = fileURLToPath(new URL("..", import.meta.url)),
    prompt = await recognitionPromptFingerprint(root),
    implementation = await recognitionReleaseFingerprint(root);
  const protocol = {
    schema: "recognition-live-protocol/v1",
    caseIds,
    suiteSha256: sha256,
    maxCalls,
    model: "gpt-6.1-sol",
    reasoningEffort: "high",
    referenceSentToModel: false,
    promptFingerprint: prompt.digest,
    implementationFingerprint: implementation.digest,
    startedAt: new Date().toISOString(),
  };
  await writeFile(
    join(output, "protocol.json"),
    JSON.stringify(protocol, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  const reader =
    read ||
    ((...args) =>
      import("./ai.mjs").then((m) =>
        m.generateScoreRegion(args[0], {}, args[1]),
      ));
  for (const [index, c] of scope.entries()) {
    if (stopped) {
      predictions.push({ caseId: c.id, status: "missing", notes: [] });
      continue;
    }
    const name = "row-" + String(index + 1).padStart(3, "0");
    await writeFile(
      join(output, name + "-pending.json"),
      JSON.stringify({
        caseId: c.id,
        state: "pending",
        sourceSha256: c.sourceImage.sha256,
      }) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    let result,
      error,
      attemptCount = null,
      providerInvoked = false;
    try {
      if (!contexts.has(c.sourcePdf))
        contexts.set(c.sourcePdf, await context(await readFile(c.sourcePdf)));
      const extra = contexts.get(c.sourcePdf),
        image = {
          mimeType: "image/png",
          data: (await readFile(c.sourceImage.path)).toString("base64"),
          sha256: c.sourceImage.sha256,
        };
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
        ]
          .filter((k) => c.region[k] !== undefined)
          .map((k) => [k, c.region[k]]),
      );
      providerInvoked = true;
      result = await reader(
        {
          engine: "pi",
          metadata: { title: "固定原谱区域" },
          region: {
            ...sourceRegion,
            image,
            detailImages: extra ? [extra] : [],
          },
          requireNotation: true,
        },
        { maxCalls: 1, traceOptions: { path: join(output, "usage.jsonl") } },
      );
      attemptCount =
        result.usageAudit?.actualRequests ??
        result.requestAudit?.length ??
        null;
      if (
        result.model !== "gpt-6.1-sol" ||
        result.reasoningEffort !== "high" ||
        !result.requestAudit?.length ||
        result.requestAudit.some(
          (a) => a.model !== "gpt-6.1-sol" || a.reasoningEffort !== "high",
        )
      )
        throw Error("实际模型与档位凭据缺失或不符");
      predictions.push(
        regressionPrediction(
          { status: "returned", format: "region-result", value: result },
          c,
        ),
      );
    } catch (e) {
      error = {
        code: e.code || "LIVE_REGRESSION_FAILED",
        message: e.expose ? e.message : "真实读取未完整返回",
      };
      attemptCount ??=
        e.usageAudit?.actualRequests ??
        e.providerCalls ??
        (providerInvoked ? null : 0);
      predictions.push({
        caseId: c.id,
        status: e.code === "NEEDS_SOURCE" ? "refused" : "failed",
        notes: [],
        usageAudit: e.usageAudit || null,
      });
      if (
        ![
          "NEEDS_SOURCE",
          "INVALID_COMPACT_REGION",
          "INCOMPLETE_REGION",
          "NO_REGION_RESULT",
        ].includes(e.code)
      )
        stopped = true;
    }
    if (Number.isInteger(attemptCount) && attemptCount >= 0)
      requests += attemptCount;
    else {
      unknownRequestCounts++;
      stopped = true;
    }
    responses.push({ caseId: c.id, result, error });
    await writeFile(
      join(output, name + "-response.json"),
      JSON.stringify({ caseId: c.id, result, error }, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    if (requests > maxCalls) {
      stopped = true;
      throw Error("提供方请求计数超出声明预算，已停止；保留全部记录");
    }
  }
  const after = evaluateRecognitionRun(suite.cases, predictions, {
      caseIds,
      trial: "live-first-read",
    }),
    byId = new Map(suite.cases.map((c) => [c.id, c]));
  const before = evaluateRecognitionRun(
    suite.cases,
    seed.readings.map((r) => regressionPrediction(r, byId.get(r.caseId))),
    { caseIds, trial: "live-first-read" },
  );
  const report = {
    schema: "recognition-live-result/v1",
    providerCalls: unknownRequestCounts ? null : requests,
    knownProviderCalls: requests,
    unknownRequestCounts,
    protocol,
    before,
    after,
    comparison: compareRecognitionRegression(before, after),
    responses,
  };
  await writeFile(
    join(output, "live-result.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  return report;
}
