import { hasApprovedAgentReview } from "./review-approval.mjs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { validateScore } from "./score.mjs";

const validId = (id) =>
  typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
const missing = () =>
  Object.assign(new Error("本机曲库中没有这份已校对乐谱。"), {
    status: 404,
    code: "SCORE_NOT_FOUND",
    public: true,
  });

// Completed job.json and its images are the durable source of truth. Never expose
// task tokens, unfinished transcriptions, or unconfirmed scope to other browsers.
export function createLocalLibrary({
  directory = resolve(".local/full-score-jobs"),
} = {}) {
  async function read(id) {
    if (!validId(id)) throw missing();
    try {
      await stat(join(directory, id, ".library-removed"));
      throw missing();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    let job;
    try {
      job = JSON.parse(await readFile(join(directory, id, "job.json"), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") throw missing();
      throw error;
    }
    const result = job.result;
    const modelReviewed =
      result?.reviewStatus === "model-reviewed" &&
      result.review?.method === "source-image-check" &&
      result.review.humanConfirmed === false &&
      typeof result.review.model === "string" &&
      result.review.model.length > 0 &&
      typeof result.review.reasoning === "string" &&
      result.review.reasoning.length > 0 &&
      typeof result.review.completedAt === "string" &&
      Number.isFinite(Date.parse(result.review.completedAt)) &&
      result.review.checkedRegions === job.regions?.length;
    const humanReviewed = result?.reviewStatus === "human-confirmed";
    if (
      job.id !== id ||
      job.status !== "complete" ||
      job.needsUserScopeConfirmation ||
      (!humanReviewed && !modelReviewed) ||
      result.checks?.passed !== true ||
      !job.regions?.length ||
      !job.regions.every(
        (r) => r.status === (modelReviewed ? "model-reviewed" : "confirmed"),
      ) ||
      !result.sourceNotation?.systems?.length
    )
      throw missing();
    const approved = modelReviewed && hasApprovedAgentReview(job);
    const score = validateScore({
      ...result.score,
      source: {
        ...result.score.source,
        kind: approved
          ? "full-score-agent-approved"
          : modelReviewed
            ? "full-score-model-reviewed"
            : result.scope?.completeDocument === false
              ? "pdf-excerpt-reviewed"
              : "full-pdf-reviewed",
        ...(modelReviewed ? { reviewRequired: !approved } : {}),
      },
    });
    if (score.id !== `full-score-${id}`) throw missing();
    for (const system of result.sourceNotation.systems) {
      const region = job.regions.find((r) => r.id === system.id);
      if (
        !validId(system.id) ||
        !region?.image ||
        !["image/png", "image/jpeg", "image/webp"].includes(
          region.image.mimeType,
        )
      )
        throw missing();
      if (!(await stat(join(directory, id, `${system.id}.image`))).size)
        throw missing();
    }
    return { job, score };
  }
  return {
    async remove(id) {
      await read(id);
      await writeFile(
        join(directory, id, ".library-removed"),
        "Removed from local library; recognition history preserved.\n",
        { mode: 0o600 },
      );
      return { id, deleted: true };
    },
    async list() {
      let ids;
      try {
        ids = await readdir(directory);
      } catch (error) {
        if (error.code === "ENOENT") return { scores: [], warnings: [] };
        throw error;
      }
      const scores = [],
        warnings = [];
      for (const id of ids.filter(validId))
        try {
          const { job, score } = await read(id);
          scores.push({ jobId: id, score, updatedAt: job.updatedAt });
        } catch (error) {
          if (error.code !== "SCORE_NOT_FOUND")
            warnings.push(`任务 ${id} 的曲库文件未能读取。`);
        }
      scores.sort((a, b) =>
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
      );
      return { scores, warnings };
    },
    async source(id) {
      const { job, score } = await read(id);
      return {
        score,
        notation: {
          ...job.result.sourceNotation,
          systems: job.result.sourceNotation.systems.map((s) => ({
            ...s,
            imageUrl: `/api/local-library/${id}/images/${s.id}`,
          })),
        },
        warnings: job.result.warnings || [],
        reviewStatus: job.result.reviewStatus,
        ...(job.result.review ? { review: job.result.review } : {}),
      };
    },
    async image(id, regionId) {
      const { job } = await read(id);
      if (
        !validId(regionId) ||
        !job.result.sourceNotation.systems.some((s) => s.id === regionId)
      )
        throw missing();
      return {
        buffer: await readFile(join(directory, id, `${regionId}.image`)),
        mimeType: job.regions.find((r) => r.id === regionId).image.mimeType,
      };
    },
    async document(id) {
      const { job } = await read(id);
      if (!job.originalPdf) return null;
      return {
        buffer: await readFile(join(directory, id, "original.pdf")),
        mimeType: "application/pdf",
        name: job.originalPdf.name || "原谱.pdf",
      };
    },
  };
}
