import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createFullScoreJobStore } from "../lib/full-score-jobs.mjs";
import { generateScoreRegion } from "../lib/ai.mjs";
import { generateDigitalRegion } from "../lib/digital-recognition.mjs";
import { sharedCredential } from "../lib/auth.mjs";
const root = resolve(process.argv[2] || ".local/dense-pdf-benchmark-20261021");
try {
  await readFile(root + "/job-auth.json");
  throw new Error(
    "该目录已有首轮任务；禁止覆盖原始结果或无提示重跑。请使用新目录。",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const protocol = JSON.parse(await readFile(root + "/protocol.json"));
if (protocol.policy?.includes("gpt-6.1-sol high") !== true)
  throw new Error("必须先冻结当前框架与模型的评测口径。");
await sharedCredential();
console.log("LOGIN_VALID");
const manifest = JSON.parse(await readFile(root + "/manifest.json"));
await mkdir(root + "/raw-calls", { recursive: true });
async function logged(kind, request, options) {
  const file =
      root +
      "/raw-calls/" +
      request.jobId +
      "-" +
      request.region.id +
      "-" +
      kind +
      ".json",
    startedAt = new Date().toISOString();
  console.log("START", kind, request.jobId, request.region.id);
  try {
    const opts = { ...options, traceOptions: { path: root + "/usage.jsonl" } };
    const result =
      kind === "first"
        ? await generateScoreRegion(request, {}, opts)
        : await generateDigitalRegion(request, {
            ...opts,
            onParsed: async (raw) =>
              writeFile(
                file.replace(".json", "-wire.json"),
                JSON.stringify(raw),
                { mode: 0o600 },
              ),
          });
    await writeFile(
      file,
      JSON.stringify(
        { startedAt, endedAt: new Date().toISOString(), result },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "RESULT",
      kind,
      request.jobId,
      request.region.id,
      result.score.notes.length,
    );
    return result;
  } catch (e) {
    await writeFile(
      file,
      JSON.stringify(
        {
          startedAt,
          endedAt: new Date().toISOString(),
          error: {
            code: e.code,
            message: e.public ? e.message : "Model request failed",
          },
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "ERROR",
      kind,
      request.jobId,
      request.region.id,
      e.code || e.name,
    );
    throw e;
  }
}
const store = createFullScoreJobStore({
  directory: root + "/jobs",
  maxConcurrency: 4,
  recognizeRegion: (r, o) => logged("first", r, o),
  digitalFallback: true,
  digitalRecognizeRegion: (r, o) => logged("fallback", r, o),
});
const jobs = [];
for (const sample of manifest)
  for (const r of sample.regions) {
    const image = await readFile(r.path),
      reference = await readFile(
        root + "/" + sample.id + "/reference-row-" + r.system + ".json",
      );
    const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
    if (digest(image) !== r.sha256 || digest(reference) !== r.referenceSha256)
      throw new Error("冻结后的图像或参考发生变化，拒绝调用模型。");
  }
for (const [i, s] of manifest.entries()) {
  const regions = await Promise.all(
    s.regions.map(
      async ({
        referenceRange,
        referencePrintedRange,
        referenceSha256,
        path,
        sha256,
        staffCount,
        ...r
      }) => ({
        ...r,
        context:
          "本片段是原谱完整双手谱行。拍号4/4，调号四个升号。只读当前图片；上下谱表同属一行。",
        image: {
          mimeType: "image/png",
          data: (await readFile(path)).toString("base64"),
        },
      }),
    ),
  );
  const j = await store.createJob({
    title: `密集PDF盲测样本${i + 1}`,
    totalPages: 1,
    timeSignature: [4, 4],
    keySignature: 4,
    engine: "pi",
    source: { label: "固定单页评测片段" },
    regions,
  });
  jobs.push({ key: s.id, id: j.id, token: j.token });
}
await writeFile(root + "/job-auth.json", JSON.stringify(jobs), { mode: 0o600 });
await writeFile(
  root + "/run.json",
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      jobs: jobs.map(({ token, ...j }) => j),
    },
    null,
    2,
  ),
);
for (const j of jobs)
  await store.startJob(j.id, { token: j.token, forceFresh: true });
const states = await Promise.all(
  jobs.map(async (j) => {
    const state = await store.waitForIdle(j.id, j);
    await writeFile(
      root + "/" + j.key + "/final-state.json",
      JSON.stringify(state, null, 2),
      { mode: 0o600 },
    );
    console.log(
      "DONE",
      j.key,
      JSON.stringify(state.progress),
      JSON.stringify(state.calls),
    );
    return {
      key: j.key,
      status: state.status,
      progress: state.progress,
      calls: state.calls,
    };
  }),
);
await writeFile(
  root + "/run-summary.json",
  JSON.stringify({ endedAt: new Date().toISOString(), states }, null, 2),
);
await store.close();
