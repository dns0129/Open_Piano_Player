// Offline-only: never imports model transports or writes the original benchmark.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { scoreDensePdfRow } from "../lib/dense-pdf-benchmark.mjs";
import { decodeCompactRegion } from "../lib/recognition-wire.mjs";
import { validateRegionResult } from "../lib/score-region.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJSON = async (file) => JSON.parse(await readFile(file, "utf8"));
const optional = async (file) => {
  try {
    return await readJSON(file);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
};
const counts = (items) => {
  const total = items.reduce(
    (a, s) => ({
      reference: a.reference + s.reference,
      predicted: a.predicted + s.predicted,
      correct: a.correct + s.correct,
    }),
    { reference: 0, predicted: 0, correct: 0 },
  );
  return {
    ...total,
    recall: total.reference ? total.correct / total.reference : null,
    precision: total.predicted ? total.correct / total.predicted : null,
  };
};
export async function replayRecognitionP0(root, output, baselineFile) {
  const baseline = await readJSON(baselineFile),
    inputs = baseline.files.filter((f) =>
      resolve(f.path).startsWith(resolve(root) + "/"),
    );
  if (!inputs.length) throw Error("缺少预先冻结的评测输入哈希");
  const frozen = new Map(inputs.map((f) => [resolve(f.path), f.sha256]));
  const checked = async (file) => {
    const bytes = await readFile(file);
    if (frozen.get(resolve(file)) !== sha(bytes))
      throw Error("冻结输入已变化或未冻结：" + file);
    return bytes;
  };
  // Verify EVERY frozen benchmark file, including rejected and unreturned rows.
  for (const f of inputs) await checked(resolve(f.path));
  const manifest = JSON.parse(await checked(join(root, "manifest.json"))),
    run = JSON.parse(await checked(join(root, "run.json")));
  const rows = [];
  for (const source of manifest) {
    const job = run.jobs.find((j) => j.key === source.id);
    if (!job) throw Error("缺少原始任务映射");
    const saved = JSON.parse(
      await checked(join(root, source.id, "final-state.json")),
    );
    for (const region of source.regions) {
      const refBytes = await checked(
        join(root, source.id, `reference-row-${region.system}.json`),
      );
      if (
        sha(refBytes) !== region.referenceSha256 ||
        sha(await checked(region.path)) !== region.sha256
      )
        throw Error("原谱或参考哈希不一致");
      const reference = JSON.parse(refBytes),
        prior = saved.regions.find((r) => r.id === region.id);
      const firstFile = join(
          root,
          "raw-calls",
          `${job.id}-${region.id}-first.json`,
        ),
        fallbackFile = join(
          root,
          "raw-calls",
          `${job.id}-${region.id}-fallback-wire.json`,
        );
      const first = await optional(firstFile),
        fallback = await optional(fallbackFile);
      if (first) await checked(firstFile);
      if (fallback) await checked(fallbackFile);
      let result = null,
        error = null,
        recoveredFrom = null;
      try {
        if (first?.result) {
          result = validateRegionResult(
            first.result,
            region,
            {},
            { requirePositions: !first.result.positionlessReview },
          );
          recoveredFrom = "first";
        } else if (fallback?.raw) {
          const sourceRaw = structuredClone(fallback.raw);
          result = validateRegionResult(
            decodeCompactRegion(sourceRaw, {
              metadata: { title: source.id },
              region,
              pass: "verify",
            }),
            region,
            {},
            { requirePositions: false },
          );
          if (JSON.stringify(sourceRaw) !== JSON.stringify(fallback.raw))
            throw Error("重放修改了原始响应");
          recoveredFrom = "historical-fallback";
        }
      } catch (e) {
        error = e.code || e.message;
      }
      const before = scoreDensePdfRow(reference, prior?.result),
        after = scoreDensePdfRow(reference, result);
      rows.push({
        source: source.id,
        system: region.system,
        referenceSha256: region.referenceSha256,
        sourceSha256: region.sha256,
        priorStatus: prior?.status || "missing",
        before: before.strict,
        after: after.strict,
        acceptedForReview: !!result,
        structurePassed: result?.checks.passed ?? false,
        structureErrors: result?.checks.errors || [],
        error,
        recoveredFrom,
        tempoEvidence: result?.score.tempoEvidence || null,
      });
    }
  }
  const report = {
    schema: "recognition-p0-replay/v1",
    mode: "offline-existing-responses",
    providerCalls: 0,
    baselineSha256: sha(await readFile(baselineFile)),
    referenceLevel:
      "same-edition independent MusicXML; ordinary written note events only",
    before: counts(rows.map((r) => r.before)),
    after: counts(rows.map((r) => r.after)),
    recoveredRows: rows.filter(
      (r) => r.priorStatus === "failed" && r.acceptedForReview,
    ).length,
    rows,
    limitation:
      "成果恢复评测；没有重新识图，不能作为模型视觉准确率提高的证据。失败行保留全部参考分母。",
  };
  await mkdir(output); // Existing directories are never overwritten.
  await writeFile(
    join(output, "replay.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  return report;
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const [root, output, baseline] = process.argv.slice(2);
  if (!root || !output || !baseline)
    throw Error(
      "用法：node scripts/replay-recognition-p0.mjs ORIGINAL_ROOT NEW_OUTPUT FROZEN_BASELINE",
    );
  const r = await replayRecognitionP0(
    resolve(root),
    resolve(output),
    resolve(baseline),
  );
  console.log(
    JSON.stringify(
      {
        providerCalls: r.providerCalls,
        before: r.before,
        after: r.after,
        recoveredRows: r.recoveredRows,
        rows: r.rows.length,
      },
      null,
      2,
    ),
  );
}
