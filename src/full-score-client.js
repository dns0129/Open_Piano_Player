import { findReviewedPdf } from "../lib/reviewed-pdf-reuse.mjs";
import { decodeFullScoreRecovery } from "../lib/full-score-recovery.mjs";

export function createFullScoreClient({
  api,
  vault,
  onComplete = async () => {},
}) {
  const route = (id, action = "", region = "") =>
    "/api/full-score-jobs/" +
    encodeURIComponent(id) +
    (action ? "/" + action : "") +
    (region ? "/" + encodeURIComponent(region) : "");
  async function request(path, body, id, options = {}) {
    await vault.initialize();
    return api.json(path, body, options.signal, {
      headers: id ? { "X-Fullscore-Token": vault.get(id) || "" } : {},
    });
  }
  async function blob(id, action, region) {
    await vault.initialize();
    return api.blob(route(id, action, region), {
      headers: { "X-Fullscore-Token": vault.get(id) || "" },
    });
  }
  const completed = async (job) => {
    if (job.status === "complete") await onComplete();
    return job;
  };
  return {
    findReviewedJob: async (hash, engine = "pi") => {
      await vault.initialize();
      return findReviewedPdf(
        hash,
        vault.ids().slice(-30).reverse(),
        (id) => request(route(id), undefined, id),
        engine,
      );
    },
    getCapabilities: async () => (await api.refreshStatus()).fullScore || {},
    createJob: async (raw, options = {}) => {
      const data = await request(
        "/api/full-score-jobs",
        raw,
        undefined,
        options,
      );
      await vault.set(data.id, data.token);
      return {
        ...data.snapshot,
        id: data.id,
        token: data.token,
        snapshot: data.snapshot,
      };
    },
    uploadRegion: (id, region, input, options = {}) =>
      request(route(id, "region", region), input, id, options),
    uploadDocument: (id, input, options = {}) =>
      request(route(id, "document"), input, id, options),
    startJob: (id, input = {}, options = {}) =>
      request(route(id, "start"), input, id, options),
    getJob: (id, options = {}) => request(route(id), undefined, id, options),
    restoreJob: async (code) => {
      await vault.initialize();
      const { id, token } = decodeFullScoreRecovery(code),
        previous = vault.get(id);
      await vault.set(id, token);
      try {
        return await request(route(id), undefined, id);
      } catch (error) {
        if (previous) await vault.set(id, previous);
        else await vault.remove(id);
        throw error;
      }
    },
    readRegionImage: (id, region) => blob(id, "region", region),
    readDocument: (id) => blob(id, "document"),
    retryRegion: (id, region, input = {}, options = {}) =>
      request(route(id, "retry", region), input, id, options),
    retryRegions: (id, input = {}, options = {}) =>
      request(route(id, "retry-failed"), input, id, options),
    cancelJob: (id) => request(route(id, "cancel"), {}, id),
    confirmRegion: async (id, region, result) =>
      completed(
        await request(route(id, "confirm-region", region), { result }, id),
      ),
    assessRegion: (id, region) =>
      request(route(id, "assess-source", region), {}, id),
    diagnoseRegion: (id, region, input) =>
      request(route(id, "diagnose-source", region), input, id),
    applyRevision: (id, region, input) =>
      request(route(id, "apply-revision", region), input, id),
    undoRevision: (id, region, input) =>
      request(route(id, "undo-revision", region), input, id),
    exportDraft: (id, input = {}) => request(route(id, "draft"), input, id),
    confirmJob: async (id, input = {}) =>
      completed(await request(route(id, "confirm"), input, id)),
  };
}
