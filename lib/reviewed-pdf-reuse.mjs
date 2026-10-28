/** Only token-authorized, fully reviewed GPT documents with identical PDF bytes. */
import { hasManualScoreRevision } from "./source-assessment.mjs";
import { RECOGNITION_PROMPT_VERSION } from "./recognition-prompts.mjs";
export async function findReviewedPdf(hash, ids, getJob, engine = "pi") {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  for (const id of ids) {
    try {
      const job = await getJob(id);
      if (
        (job.engine || "pi") !== engine ||
        job.originalPdf?.sha256 !== hash ||
        job.status !== "complete" ||
        job.result?.scope?.completeDocument !== true ||
        job.result?.reviewStatus !== "human-confirmed" ||
        !job.regions?.length
      )
        continue;
      if (
        job.regions.every(
          (r) =>
            !hasManualScoreRevision(r) &&
            r.status === "confirmed" &&
            r.result?.model ===
              (engine === "deepseek" ? "deepseek-flash" : "gpt-6.1-sol") &&
            r.result.reasoningEffort === "high" &&
            r.result.promptVersion === RECOGNITION_PROMPT_VERSION &&
            r.result.checks?.passed &&
            r.result.positions?.length === r.result.score?.notes.length,
        )
      )
        return { ...job, reusedExactPdf: true };
    } catch {
      /* Stale or unauthorized jobs provide no reusable result. */
    }
  }
  return null;
}
