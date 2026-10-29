import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { sourceContextFromPdf } from "../lib/recognition-regions.mjs";
import { generateScoreRegion } from "../lib/ai.mjs";
import { scoreDensePdfRow } from "../lib/dense-pdf-benchmark.mjs";
import { RECOGNITION_PROMPT_VERSION } from "../lib/recognition-prompts.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
export async function benchmarkP1(
  root,
  out,
  { run = false, withContext = false } = {},
) {
  const manifest = await json(join(root, "manifest.json"));
  const choices = [
      ["rachmaninoff-op3-2", 3],
      ["etude-op10-4", 1],
    ],
    inputs = [];
  for (const [id, system] of choices) {
    const source = manifest.find((s) => s.id === id),
      r = source?.regions.find((r) => r.system === system);
    if (!r) throw Error("固定测试范围不存在");
    const bytes = await readFile(r.path);
    if (sha(bytes) !== r.sha256) throw Error("原图变化，不能继续固定实验");
    const context = withContext
      ? await sourceContextFromPdf(await readFile(join(root, id, "score.pdf")))
      : null;
    inputs.push({
      id,
      region: {
        id: r.id,
        page: r.page,
        system: r.system,
        rect: r.rect,
        pageWidth: r.pageWidth,
        pageHeight: r.pageHeight,
        ...(context ? { detailImages: [context] } : {}),
        image: {
          mimeType: "image/png",
          data: bytes.toString("base64"),
          sha256: r.sha256,
        },
      },
      referenceFile: join(root, id, `reference-row-${system}.json`),
      referenceSha256: r.referenceSha256,
    });
  }
  await mkdir(out);
  const protocol = {
    version: 1,
    startedAt: new Date().toISOString(),
    mode: run ? "bounded-live-first-read" : "prepare-only",
    model: "gpt-6.1-sol",
    reasoning: "high",
    promptVersion: RECOGNITION_PROMPT_VERSION,
    maxProviderCalls: 2,
    policy:
      "one call per fixed row, no repair, no independent review, no source changes; references loaded only after responses",
    scope: inputs.map((i) => ({
      source: i.id,
      region: i.region.id,
      sourceSha256: i.region.image.sha256,
      referenceSha256: i.referenceSha256,
      contextSha256: i.region.detailImages?.[0]?.sha256 ?? null,
    })),
    metrics:
      "strict hand/MIDI/onset/duration, tolerance 1e-4; spelling requires separate source reference; failed rows retain denominator",
  };
  await writeFile(
    join(out, "protocol.json"),
    JSON.stringify(protocol, null, 2) + "\n",
    { mode: 0o600 },
  );
  if (!run) return protocol;
  const rows = [];
  let stop = false;
  for (const input of inputs) {
    let result, error;
    if (stop) {
      rows.push({
        input,
        error: {
          code: "NOT_DISPATCHED",
          message: "Previous request had an unresolved provider failure",
        },
      });
      continue;
    }
    try {
      result = await generateScoreRegion(
        {
          engine: "pi",
          metadata: { title: "Fixed source row" },
          region: input.region,
          requireNotation: true,
        },
        {},
        { maxCalls: 1, traceOptions: { path: join(out, "usage.jsonl") } },
      );
    } catch (e) {
      if (
        [
          "MODEL_REQUEST_FAILED",
          "MODEL_RATE_LIMIT",
          "PI_AUTH_REQUIRED",
        ].includes(e.code)
      )
        stop = true;
      error = {
        code: e.code || "RECOGNITION_FAILED",
        message: e.expose
          ? e.message
          : "Provider did not return a usable result",
      };
    }
    await writeFile(
      join(out, input.id + "-result.json"),
      JSON.stringify({ result, error }, null, 2) + "\n",
      { mode: 0o600 },
    );
    rows.push({ input, result, error });
  }
  // Frozen independent reference is used only by the offline scorer.
  const scored = [];
  for (const row of rows) {
    const bytes = await readFile(row.input.referenceFile);
    if (sha(bytes) !== row.input.referenceSha256) throw Error("独立参考变化");
    const reference = JSON.parse(bytes),
      score = scoreDensePdfRow(reference, row.result);
    scored.push({
      source: row.input.id,
      system: row.input.region.system,
      score: score.strict,
      structurePassed: row.result?.checks?.passed ?? false,
      issues: row.result?.checks?.errors || [],
      error: row.error || null,
      spellingAccuracy: null,
    });
  }
  const summary = {
    protocol,
    rows: scored,
    limitation:
      "Two development rows only; this is not holdout or full-score accuracy. Structure checks are not visual truth.",
  };
  await writeFile(
    join(out, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    { mode: 0o600 },
  );
  return summary;
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const [root, out, ...flags] = process.argv.slice(2);
  if (!root || !out)
    throw Error(
      "用法：node scripts/benchmark-recognition-p1.mjs BENCHMARK_ROOT NEW_OUTPUT [--with-context] [--run]",
    );
  const result = await benchmarkP1(resolve(root), resolve(out), {
    run: flags.includes("--run"),
    withContext: flags.includes("--with-context"),
  });
  console.log(
    JSON.stringify(
      result.rows?.map((r) => ({
        source: r.source,
        correct: r.score.correct,
        reference: r.score.reference,
        predicted: r.score.predicted,
        structurePassed: r.structurePassed,
        error: r.error,
      })) || result.scope,
      null,
      2,
    ),
  );
}
