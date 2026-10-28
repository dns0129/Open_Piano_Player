import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { revisionBaseHash, prepareScoreRevision } from "./score-diagnosis.mjs";
import { normalizeSourceAssessment } from "./source-assessment.mjs";
const copy = (v) => structuredClone(v);
const fail = (message, code = "DIAGNOSIS_CONFLICT", status = 409) =>
  Object.assign(new Error(message), { code, status, expose: true });
/** Ownership, consent, a stale-result guard, persisted proposals and bounded model calls. */
export function createScoreDiagnosisWorkflow({
  locked,
  mutate,
  snapshot,
  directory,
  settingsProvider,
  diagnose,
  derivedStatus,
  timeoutMs,
}) {
  const active = new Map();
  let closed = false;
  const target = (job, id) => {
    const r = job.regions.find((r) => r.id === id);
    if (!r) throw fail("谱行不存在。", "REGION_NOT_FOUND", 404);
    return r;
  };
  async function run(id, regionId, input, auth, phase) {
    if (closed) throw fail("服务已关闭。", "STORE_CLOSED", 503);
    if (phase === "diagnose" && input?.confirmed !== true)
      throw fail(
        "请先确认移交诊断与修订智能体。",
        "DIAGNOSIS_CONSENT_REQUIRED",
        422,
      );
    let request, baseHash, requestId;
    const controller = new AbortController();
    await locked(id, auth, async (job) => {
      if (job.status === "running" || active.has(id))
        throw fail("请先等待当前任务完成。", "JOB_RUNNING");
      const r = target(job, regionId);
      if (!r.image) throw fail("请先上传原始谱行。", "IMAGE_REQUIRED", 422);
      if (
        phase === "diagnose" &&
        !normalizeSourceAssessment(r.sourceAssessment)
      )
        throw fail("请先由识谱智能体评估疑点。", "ASSESSMENT_REQUIRED", 422);
      if ((r.diagnosisAttempts || 0) >= 4)
        throw fail(
          "本行已达到4次评估/诊断上限，请人工校对或更换清晰原图后重试。",
          "DIAGNOSIS_LIMIT",
          422,
        );
      if (
        input?.baseHash &&
        input.baseHash !== revisionBaseHash(r, job.metadata)
      )
        throw fail("谱行已有新修改，请重新查看。");
      baseHash = revisionBaseHash(r, job.metadata);
      requestId = randomBytes(12).toString("hex");
      const image = {
        ...r.image,
        data: (await readFile(join(directory, id, `${r.id}.image`))).toString(
          "base64",
        ),
      };
      const index = job.regions.indexOf(r),
        contextImages = [];
      for (const neighbor of [
        job.regions[index - 1],
        job.regions[index + 1],
      ].filter((n) => n?.image && n.page === r.page))
        contextImages.push({
          ...neighbor.image,
          data: (
            await readFile(join(directory, id, `${neighbor.id}.image`))
          ).toString("base64"),
        });
      request = {
        jobId: id,
        phase,
        engine: job.engine,
        metadata: copy(job.metadata),
        region: {
          id: r.id,
          page: r.page,
          system: r.system,
          rect: r.rect,
          context: r.context,
          image,
        },
        contextImages,
        priorResult: copy(r.result),
        observations: {
          checks: r.result?.checks || null,
          error: r.error,
          sourceAssessment: r.sourceAssessment || null,
        },
      };
      r.diagnosisAttempts = (r.diagnosisAttempts || 0) + 1;
      r.diagnosis = {
        id: requestId,
        status: "running",
        phase,
        baseHash,
        startedAt: new Date().toISOString(),
        handoffConfirmed: phase === "diagnose",
      };
      job.calls[phase === "assess" ? "assessment" : "diagnosis"] =
        (job.calls[phase === "assess" ? "assessment" : "diagnosis"] || 0) + 1;
      active.set(id, controller);
      await mutate(job);
    });
    try {
      const raw = await diagnose(request, await settingsProvider(), {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(timeoutMs),
        ]),
      });
      controller.signal.throwIfAborted();
      const report = prepareScoreRevision(
        {
          ...raw,
          engine: request.engine,
          sourceTranscription:
            phase === "assess" ? undefined : raw.sourceTranscription,
          edits: phase === "assess" ? [] : raw.edits,
        },
        { ...request.region, result: request.priorResult },
        request.metadata,
      );
      return await locked(id, auth, async (job) => {
        const r = target(job, regionId);
        if (
          r.diagnosis?.id !== requestId ||
          revisionBaseHash(r, job.metadata) !== baseHash
        )
          throw fail("诊断期间谱行已改变，旧方案未覆盖新修改。");
        if (phase === "assess") r.sourceAssessment = report.assessment;
        r.diagnosis = {
          ...r.diagnosis,
          status: "ready",
          finishedAt: new Date().toISOString(),
          report,
          model: raw.model || "unverified",
          reasoningEffort: raw.reasoningEffort || null,
          usage: raw.usage
            ? Object.fromEntries(
                ["input", "output", "totalTokens"]
                  .filter((k) => Number.isFinite(raw.usage[k]))
                  .map((k) => [k, raw.usage[k]]),
              )
            : null,
        };
        await mutate(job);
        return snapshot(job);
      });
    } catch (e) {
      await locked(id, auth, async (job) => {
        const r = target(job, regionId);
        if (r.diagnosis?.id === requestId) {
          r.diagnosis = {
            ...r.diagnosis,
            status: "failed",
            error: {
              code: e.code || "DIAGNOSIS_FAILED",
              message: e.expose
                ? String(e.message).slice(0, 500)
                : "诊断未完成；已有乐谱保持不变，可稍后重试。",
            },
          };
          await mutate(job);
        }
      });
      throw e;
    } finally {
      if (active.get(id) === controller) active.delete(id);
    }
  }
  return {
    cancelDiagnosis(id) {
      active.get(id)?.abort();
    },
    assessRegion: (id, r, input, auth) => run(id, r, input, auth, "assess"),
    diagnoseRegion: (id, r, input, auth) => run(id, r, input, auth, "diagnose"),
    async applyRevision(id, regionId, input, auth) {
      return locked(id, auth, async (job) => {
        if (input?.confirmed !== true)
          throw fail("请先接受此修订方案。", "REVISION_CONSENT_REQUIRED", 422);
        if (job.status === "running" || active.has(id))
          throw fail("当前任务尚未完成。", "JOB_RUNNING");
        const r = target(job, regionId),
          d = r.diagnosis;
        if (
          !d ||
          d.phase !== "diagnose" ||
          d.status !== "ready" ||
          d.id !== input.proposalId ||
          !d.handoffConfirmed ||
          !d.report?.canApply
        )
          throw fail("没有可应用的修订方案。");
        if (d.baseHash !== revisionBaseHash(r, job.metadata))
          throw fail("方案基于旧版本，请重新诊断。");
        const before = {
            result: copy(r.result),
            status: r.status,
            confirmedAt: r.confirmedAt,
            error: copy(r.error),
          },
          date = new Date().toISOString();
        r.result = copy(d.report.candidate);
        r.result.warnings = r.result.warnings
          .filter((w) => !w.startsWith("人工修订候选："))
          .map((w) =>
            w.startsWith("算法与模型") ? w : "原始识读记录（修订前）：" + w,
          );
        r.result.warnings.push(
          `人工修订（用户已接受）：第${r.page}页第${r.system}行共${d.report.changes.length}处修改；原图未改动，修改前后及依据已保存于修订记录。`,
        );
        r.result.reviewStatus = "unreviewed";
        r.status = "needs-review";
        r.confirmedAt = null;
        r.error = null;
        r.recognitionCheckpoint = null;
        r.revisionHistory ||= [];
        r.revisionHistory.push({
          id: d.id,
          appliedAt: date,
          before,
          changes: copy(d.report.changes),
          assessment: copy(d.report.assessment),
          explanation: d.report.explanation,
          afterHash: revisionBaseHash(r, job.metadata),
          undoneAt: null,
        });
        r.diagnosis = { ...d, status: "applied" };
        job.status = "needs-review";
        derivedStatus(job);
        await mutate(job);
        return snapshot(job);
      });
    },
    async undoRevision(id, regionId, input, auth) {
      return locked(id, auth, async (job) => {
        if (job.status === "running" || active.has(id))
          throw fail("当前任务尚未完成。", "JOB_RUNNING");
        const r = target(job, regionId),
          entry = r.revisionHistory?.filter((h) => !h.undoneAt).at(-1);
        if (!entry || entry.id !== input?.revisionId)
          throw fail("没有可撤销的修订。");
        if (entry.afterHash !== revisionBaseHash(r, job.metadata))
          throw fail("应用后已有人工修改；为保留新修改，不能直接撤销旧方案。");
        Object.assign(r, copy(entry.before));
        r.recognitionCheckpoint = null;
        entry.undoneAt = new Date().toISOString();
        r.diagnosis = null;
        job.status = "needs-review";
        derivedStatus(job);
        await mutate(job);
        return snapshot(job);
      });
    },
    close() {
      closed = true;
      for (const c of active.values()) c.abort();
    },
  };
}
