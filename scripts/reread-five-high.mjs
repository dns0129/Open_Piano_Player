#!/usr/bin/env node
// Default: source preflight only, zero model calls. --run starts/resumes new jobs.
import { readFile, writeFile, mkdir, access, rename } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { createFullScoreJobStore } from "../lib/full-score-jobs.mjs";
import { generateScoreRegion, normalizeGenerateInput } from "../lib/ai.mjs";
import { generateDigitalRegion } from "../lib/digital-recognition.mjs";
import { sharedCredential } from "../lib/auth.mjs";
import { SCORE_RECOGNITION } from "../lib/recognition-policy.mjs";
import {
  addScore,
  verifyRepository,
  DEFAULT_REPOSITORY,
} from "../lib/score-repository.mjs";

export const FIVE_SCORES = Object.freeze([
  { key: "merry", title: "Merry Christmas Mr. Lawrence", pages: 6 },
  { key: "eutopia-staff", title: "Eutopia", pages: 4 },
  { key: "sudi", title: "天龙八部之宿敌", pages: 5, requiredRow: "p3-s3" },
  { key: "ifyou", title: "IF YOU", pages: 6, requiredRow: "p1-s5" },
  { key: "golden", title: "golden hour", pages: 9 },
]);
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const save = async (path, value) => {
  const temporary = path + "." + process.pid + ".tmp";
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(temporary, path);
};
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const validId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);

/** Whitelist original source fields: old note answers/checkpoints never enter requests. */
export async function inspectFiveSources({
  sourceDirectory = resolve(".local/batch-five-20261018"),
  jobsDirectory = resolve(".local/full-score-jobs"),
} = {}) {
  const plans = [],
    entries = [],
    errors = [];
  let batch;
  try {
    batch = await read(join(sourceDirectory, "private-jobs.json"));
  } catch {
    errors.push(
      `缺少原谱任务索引：${join(sourceDirectory, "private-jobs.json")}`,
    );
  }
  for (const definition of FIVE_SCORES) {
    try {
      const candidates = (batch?.jobs || []).filter(
        (j) => j.key === definition.key,
      );
      if (candidates.length !== 1 || !validId(candidates[0].id))
        throw Error("找不到唯一的原始任务");
      const old = await read(join(jobsDirectory, candidates[0].id, "job.json"));
      if (old.totalPages !== definition.pages || old.excludedPages?.length)
        throw Error("原谱页数不符或存在排除页");
      if (!Array.isArray(old.regions) || !old.regions.length)
        throw Error("缺少原始谱行");
      const seen = new Set(),
        locations = new Set(),
        regions = [],
        hashes = [];
      for (const r of old.regions) {
        if (
          !validId(r.id) ||
          seen.has(r.id) ||
          !Number.isInteger(r.page) ||
          r.page < 1 ||
          r.page > definition.pages ||
          !Number.isInteger(r.system) ||
          r.system < 1
        )
          throw Error("原始谱行标识或页码无效");
        const location = `${r.page}:${r.system}`;
        if (locations.has(location)) throw Error("原始谱行重复");
        seen.add(r.id);
        locations.add(location);
        const buffer = await readFile(
          join(jobsDirectory, candidates[0].id, `${r.id}.image`),
        );
        const image = {
          mimeType: r.image?.mimeType,
          data: buffer.toString("base64"),
        };
        normalizeGenerateInput({
          provider: "pi",
          mode: "ocr",
          title: definition.title,
          images: [image],
        });
        regions.push({
          id: r.id,
          page: r.page,
          system: r.system,
          rect: r.rect,
          pageWidth: r.pageWidth,
          pageHeight: r.pageHeight,
          measureCount: r.measureCount,
          context:
            (r.context || "") +
            "\n速度统一以四分音符/分钟提交；若原谱用附点四分音符标速，换算成四分音符速度。",
          image,
        });
        hashes.push({
          id: r.id,
          page: r.page,
          system: r.system,
          sha256: sha(buffer),
        });
      }
      for (let page = 1; page <= definition.pages; page++) {
        const systems = regions
          .filter((r) => r.page === page)
          .map((r) => r.system)
          .sort((a, b) => a - b);
        if (!systems.length || systems.some((s, i) => s !== i + 1))
          throw Error(`第${page}页缺少谱行或序号不连续`);
      }
      if (definition.requiredRow && !seen.has(definition.requiredRow))
        throw Error(`此前缺行 ${definition.requiredRow} 仍未提供原图`);
      const pdf = await readFile(
        join(jobsDirectory, candidates[0].id, "original.pdf"),
      );
      if (
        !pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
        pdf.length > 50 * 1024 * 1024
      )
        throw Error("原始PDF无效");
      if ((await PDFDocument.load(pdf)).getPageCount() !== definition.pages)
        throw Error("实际PDF页数与原谱范围不符");
      // A prior practice BPM must not override the newly read first system's tempo.
      const { composer, timeSignature, keySignature, source } =
        old.metadata || {};
      const manifest = {
        title: definition.title + " · GPT‑6.1 high 升降号增强版",
        composer,
        timeSignature,
        keySignature,
        source,
        totalPages: definition.pages,
        engine: "pi",
        verify: false,
        recognitionPlan: { review: "off", maxCalls: 2, recover: true },
        needsUserScopeConfirmation: true,
        regions,
        originalPdf: {
          name: definition.title + ".pdf",
          mimeType: "application/pdf",
          buffer: pdf,
        },
      };
      plans.push({ definition, manifest });
      const sourceContextSha256 = sha(
        JSON.stringify({
          composer,
          timeSignature,
          keySignature,
          regions: regions.map(({ image, ...r }) => r),
        }),
      );
      entries.push({
        key: definition.key,
        title: definition.title,
        pages: definition.pages,
        rows: regions.length,
        pdfSha256: sha(pdf),
        sourceContextSha256,
        images: hashes,
      });
    } catch (error) {
      errors.push(`${definition.title}：${error.message}`);
    }
  }
  const preflight = {
    at: new Date().toISOString(),
    ready: errors.length === 0 && plans.length === 5,
    policy: SCORE_RECOGNITION,
    expectedScores: 5,
    expectedPages: 30,
    priorNoteAnswersProvidedToModel: false,
    modelCalls: 0,
    entries,
    errors,
  };
  return { preflight, plans, fingerprint: sha(JSON.stringify(entries)) };
}

export function assertNewReading(result) {
  if (
    result?.model !== SCORE_RECOGNITION.model ||
    result.reasoningEffort !== "high" ||
    result.promptVersion !== SCORE_RECOGNITION.promptVersion ||
    !result.requestAudit?.length ||
    result.requestAudit.some(
      (a) =>
        a.model !== SCORE_RECOGNITION.model || a.reasoningEffort !== "high",
    )
  ) {
    throw Error("实际识别请求未通过 GPT‑6.1 Sol high / 新提示词版本核验");
  }
}

export function withFreshTempoContext(request, firstReading) {
  const tempo = firstReading?.score?.tempo;
  const inherited = Number.isFinite(tempo) && tempo >= 20 && tempo <= 300;
  return {
    ...request,
    metadata: { ...request.metadata, ...(inherited ? { tempo } : {}) },
    region: {
      ...request.region,
      context:
        (request.region.context || "") +
        "\n速度处理：原图明确印出的速度及音符单位优先；没有数字标速时，" +
        (inherited
          ? `沿用本轮首页新识读的 ${tempo} 四分音符/分钟`
          : "暂用90四分音符/分钟作为可编辑的练习默认速度，并在warnings说明未印数字标速") +
        "。此数值仅用于练习播放，不是推断音符的依据；不能仅因当前行未印速度而拒绝识读。",
    },
  };
}

export async function runFive({
  run = false,
  importScores = false,
  publish = false,
  sourceDirectory,
  jobsDirectory = resolve(".local/full-score-jobs"),
  outputDirectory = resolve(".local/batch-five-high-accidentals-v2"),
  concurrency = 16,
} = {}) {
  const { preflight, plans, fingerprint } = await inspectFiveSources({
    sourceDirectory,
    jobsDirectory,
  });
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await save(join(outputDirectory, "preflight.json"), preflight);
  console.log(JSON.stringify(preflight, null, 2));
  if (!preflight.ready) {
    process.exitCode = 2;
    return { status: "missing_sources", preflight };
  }
  if (!run) return { status: "preflight_only", preflight };
  if (publish && !importScores) throw Error("--publish 必须同时使用 --import");
  if (
    publish &&
    execFileSync("git", ["diff", "--cached", "--name-only"], {
      encoding: "utf8",
    }).trim()
  )
    throw Error("请先处理已有暂存内容，以免误提交其它修改");
  await sharedCredential(); // Existing local Pi/Codex login only; never write credentials.
  const statePath = join(outputDirectory, "private-jobs.json");
  let state;
  try {
    await access(statePath);
    state = await read(statePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    state &&
    (state.fingerprint !== fingerprint ||
      state.promptVersion !== SCORE_RECOGNITION.promptVersion)
  )
    throw Error("原谱或提示词已变化，请用新的 --out 目录创建独立批次");
  state ||= {
    startedAt: new Date().toISOString(),
    fingerprint,
    promptVersion: SCORE_RECOGNITION.promptVersion,
    jobs: [],
  };
  const callsDirectory = join(outputDirectory, "raw-calls");
  await mkdir(callsDirectory, { recursive: true, mode: 0o700 });
  const adapter = async (request, options) => {
    const startedAt = new Date().toISOString();
    const task = state.jobs.find((j) => j.id === request.jobId);
    const snapshot = await store.getJob(request.jobId, { token: task.token });
    const first = snapshot.regions[0];
    const enriched = withFreshTempoContext(
      request,
      first.result || first.recognitionCheckpoint?.result,
    );
    const result = await generateScoreRegion(
      enriched,
      {},
      {
        ...options,
        traceOptions: { path: join(outputDirectory, "usage.jsonl") },
      },
    );
    await save(
      join(
        callsDirectory,
        `${request.jobId}-${request.region.id}-${request.pass}-${Date.now()}.json`,
      ),
      { startedAt, endedAt: new Date().toISOString(), result },
    );
    assertNewReading(result);
    return result;
  };
  const digitalAdapter = async (request, options) => {
    const startedAt = new Date().toISOString(),
      task = state.jobs.find((j) => j.id === request.jobId);
    const snapshot = await store.getJob(request.jobId, { token: task.token }),
      first = snapshot.regions[0];
    const enriched = withFreshTempoContext(
      request,
      first.result || first.recognitionCheckpoint?.result,
    );
    const result = await generateDigitalRegion(enriched, {
      ...options,
      traceOptions: { path: join(outputDirectory, "usage.jsonl") },
    });
    assertNewReading(result);
    await save(
      join(
        callsDirectory,
        `${request.jobId}-${request.region.id}-${request.pass}-digital-${Date.now()}.json`,
      ),
      { startedAt, endedAt: new Date().toISOString(), result },
    );
    return result;
  };
  const concurrencyUsed = Math.max(1, Math.min(100, concurrency));
  const store = createFullScoreJobStore({
    directory: jobsDirectory,
    maxConcurrency: concurrencyUsed,
    recognizeRegion: adapter,
    digitalFallback: true,
    digitalRecognizeRegion: digitalAdapter,
  });
  let stopping = false;
  const cancel = () => {
    stopping = true;
    void Promise.allSettled(
      state.jobs.map((j) => store.cancelJob(j.id, { token: j.token })),
    );
  };
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    for (const plan of plans) {
      if (state.jobs.some((j) => j.key === plan.definition.key)) continue;
      const created = await store.createJob(plan.manifest);
      state.jobs.push({
        key: plan.definition.key,
        id: created.id,
        token: created.token,
        started: false,
      });
      await save(statePath, state);
    }
    // Use the first real row as a paid preflight, keeping its successful result.
    // A payload audit alone is not proof that the service can return music.
    const first = state.jobs[0],
      firstAuth = { token: first.token };
    const firstBefore = await store.getJob(first.id, firstAuth);
    if (!firstBefore.regions[0].result) {
      await store.startJob(first.id, {
        ...firstAuth,
        regionIds: [firstBefore.regions[0].id],
        forceFresh: true,
      });
      const checked = await store.waitForIdle(first.id, firstAuth),
        row = checked.regions[0];
      await save(join(outputDirectory, "preflight-row.json"), {
        at: new Date().toISOString(),
        job: checked,
      });
      if (!row.result?.coverage?.complete || row.error) {
        throw Error("首行实际识读未返回完整结果，整批未继续调用；已保留现场。");
      }
    }
    // All books share the same physical gate; a slow final row in one book
    // must not prevent unrelated pages in the other books from being read.
    for (const task of state.jobs) {
      if (stopping) break;
      await store.startJob(task.id, {
        token: task.token,
        forceFresh: !task.started,
      });
      task.started = true;
      await save(statePath, state);
    }
    const outcomes = [];
    for (const task of state.jobs) {
      if (stopping) break;
      const job = await store.waitForIdle(task.id, { token: task.token });
      await save(join(outputDirectory, task.key + "-job.json"), job);
      const incomplete = job.regions.filter(
        (r) => !r.result?.coverage?.complete || !r.result.checks?.passed,
      );
      const summary = {
        key: task.key,
        jobId: task.id,
        pages: job.totalPages,
        rows: job.regions.length,
        status: job.status,
        calls: job.calls,
        incompleteRows: incomplete.map((r) => r.id),
        recognitionPasses: 1,
        cacheHits: job.reuse.hits,
      };
      outcomes.push(summary);
      await save(join(outputDirectory, "progress.json"), outcomes);
      console.log(JSON.stringify(summary));
    }
    const ready =
      !stopping &&
      outcomes.length === 5 &&
      outcomes.every((o) => !o.incompleteRows.length);
    const report = {
      startedAt: state.startedAt,
      endedAt: new Date().toISOString(),
      policy: SCORE_RECOGNITION,
      fingerprint,
      concurrencyUsed,
      globalConcurrencyLimit: 100,
      ready,
      priorAnswersProvided: false,
      outcomes,
      imported: [],
      published: false,
    };
    await save(join(outputDirectory, "report.json"), report);
    if (importScores && ready) {
      const drafts = [];
      for (const task of state.jobs) {
        const exported = await store.exportDraft(
          task.id,
          { token: task.token },
          { scopeConfirmed: true },
        );
        if (
          !exported.result.checks.passed ||
          !exported.result.scope.completeDocument
        )
          throw Error(`${task.key} 跨行结构或完整性检查未通过，未导入本批曲库`);
        const definition = FIVE_SCORES.find((s) => s.key === task.key);
        const score = {
          ...exported.result.score,
          id: `reread-gpt61-high-v2-${task.key}`,
          title: definition.title + " · GPT‑6.1 high 新策略（待校对）",
        };
        drafts.push({ score, key: task.key });
        await save(join(outputDirectory, task.key + "-score.json"), {
          score,
          warnings: exported.result.warnings,
          reviewStatus: "ai-unreviewed",
        });
      }
      for (const { score, key } of drafts) {
        const imported = await addScore(score, {
          description: `${SCORE_RECOGNITION.promptVersion} · 原谱全页首次识别 · AI草稿待逐音校对`,
        });
        report.imported.push({
          key,
          id: score.id,
          sha256: imported.entry.sha256,
          notes: score.notes.length,
        });
      }
      const checked = await verifyRepository();
      if (!checked.ok)
        throw Error("曲库校验失败：" + checked.problems.join("；"));
      await save(join(outputDirectory, "report.json"), report);
      execFileSync(
        process.platform === "win32" ? "npm.cmd" : "npm",
        ["run", "build"],
        { stdio: "inherit" },
      );
      report.localBuildPassed = true;
      await save(join(outputDirectory, "report.json"), report);
      if (publish) {
        if (
          execFileSync("git", ["diff", "--cached", "--name-only"], {
            encoding: "utf8",
          }).trim()
        )
          throw Error(
            "识谱期间出现了其它暂存内容，曲库已保留，请先处理后再发布",
          );
        const paths = [
          "score-repo/index.json",
          "score-repo/index.mjs",
          ...report.imported.map((s) =>
            relative(
              process.cwd(),
              join(DEFAULT_REPOSITORY, "scores", s.id + ".json"),
            ),
          ),
        ];
        execFileSync("git", ["add", "--", ...paths], { stdio: "inherit" });
        if (
          execFileSync("git", ["diff", "--cached", "--name-only"], {
            encoding: "utf8",
          }).trim()
        )
          execFileSync(
            "git",
            [
              "commit",
              "-m",
              "Add five fresh GPT-6.1 high accidental-aware transcriptions",
            ],
            { stdio: "inherit" },
          );
        execFileSync("git", ["push", "origin", "HEAD:main"], {
          stdio: "inherit",
        });
        report.published = true;
      }
    }
    await save(join(outputDirectory, "report.json"), report);
    if (!ready) process.exitCode = 2;
    console.log(
      JSON.stringify({
        ready,
        imported: report.imported,
        published: report.published,
        report: join(outputDirectory, "report.json"),
      }),
    );
    return report;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    await store.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2),
    value = (key) =>
      args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
  const allowed = new Set([
    "--run",
    "--import",
    "--publish",
    "--source",
    "--jobs",
    "--out",
    "--concurrency",
  ]);
  for (const arg of args.filter((a) => a.startsWith("--")))
    if (!allowed.has(arg)) throw Error("未知参数：" + arg);
  await runFive({
    run: args.includes("--run"),
    importScores: args.includes("--import"),
    publish: args.includes("--publish"),
    sourceDirectory: value("--source") && resolve(value("--source")),
    jobsDirectory: value("--jobs") && resolve(value("--jobs")),
    outputDirectory: value("--out") && resolve(value("--out")),
    concurrency: Number(value("--concurrency")) || 16,
  });
}
