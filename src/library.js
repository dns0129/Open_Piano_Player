import { createBrowserLibrary } from "./library-indexeddb.js";
import { readLegacySources, sourceMatchesScore } from "./source-library.js";
import { readScoreDocument } from "../lib/score-document.ts";
import {
  contentHash,
  normalizeLibraryRecord,
  createLibraryBackup,
  readLibraryBackup,
} from "../lib/library-format.ts";

// Groups records so each restore request stays well below the server JSON limit;
// a record larger than the limit is sent alone (single saves allow up to 72 MB).
export function restoreBatches(records, limit = 24_000_000) {
  const batches = [];
  let current = [],
    size = 0;
  for (const record of records) {
    const length = JSON.stringify(record).length;
    if (current.length && size + length > limit) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(record);
    size += length;
  }
  if (current.length) batches.push(current);
  return batches;
}
export function createDiskLibrary(api, { restoreBatchChars } = {}) {
  return {
    list: () =>
      api.json("/api/library", undefined, undefined, { timeoutMs: 30_000 }),
    get: (id) => api.json("/api/library/records/" + encodeURIComponent(id)),
    save: (record, options) => api.json("/api/library", { record, ...options }),
    remove: (id) =>
      api.json(
        "/api/library/records/" + encodeURIComponent(id) + "/delete",
        {},
      ),
    backup: () => api.json("/api/library/backup"),
    async restore(backup) {
      // Verify the whole backup once here, then send it in independently verified parts.
      const restored = [],
        conflicts = [];
      for (const batch of restoreBatches(
        await readLibraryBackup(backup),
        restoreBatchChars,
      )) {
        const result = await api.json("/api/library/restore", {
          backup: await createLibraryBackup(batch),
        });
        restored.push(...result.restored);
        conflicts.push(...result.conflicts);
      }
      return { restored, conflicts };
    },
  };
}
const migrationContents = (record) => [
  record.document,
  record.assets,
  record.sourceReference,
  record.downloaded,
  record.reviewStatus,
  record.warnings,
];
const base64 = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
};
export async function preserveOriginalFile(file) {
  return {
    name: file.name || "原始乐谱",
    mimeType: file.type || "application/octet-stream",
    data: await base64(file),
  };
}

/** Both adapters obey the same save/revision/backup interface. LocalStorage is
 * read exactly for migration, then removed only after durable writes succeed.
 */
export function createUnifiedLibrary({
  adapter,
  metadata,
  storage = globalThis.localStorage,
  legacySources = readLegacySources,
  fetchImpl = (...args) => fetch(...args),
  migrateLegacy = true,
} = {}) {
  let cache = [],
    warnings = [],
    initialization;
  let cacheGeneration = 0;
  const checkGeneration = (generation) => {
    if (generation !== cacheGeneration)
      throw Object.assign(new Error("账号已切换，旧操作已停止。"), {
        code: "IDENTITY_CHANGED",
      });
  };
  const urls = new Map();
  async function refresh() {
    const result = await adapter.list();
    cache = result.records;
    warnings = result.warnings || [];
    return cache;
  }
  async function migrate() {
    const live = storage?.getItem("qinban-scores"),
      legacy = await legacySources();
    const backup = live || (await metadata.get("legacy-localStorage-backup"));
    if (!backup && !legacy.length) return;
    const index = legacy.map((r) => [
      r.id,
      r.savedAt,
      r.downloaded,
      r.score,
      r.reference,
    ]);
    const oldFingerprint = await contentHash([backup || null, index]);
    const completed = (hash) => "legacy-receipt-v2:" + hash;
    if (await metadata.get(completed(oldFingerprint))) {
      if (live) storage.removeItem("qinban-scores");
      return;
    }
    // Use a retained backup only if the old migration recorded its completion.
    const previouslyMigrated = await metadata.get(
      "legacy-receipt:" + oldFingerprint,
    );
    const raw = live || (previouslyMigrated ? backup : null);
    const receipt = completed(
      raw === backup ? oldFingerprint : await contentHash([raw || null, index]),
    );
    if (await metadata.get(receipt)) return;
    let saved = [];
    if (raw) {
      try {
        saved = JSON.parse(raw);
      } catch {
        throw new Error("旧浏览器曲库 JSON 损坏，原数据已保留，请先导出恢复。");
      }
      if (!Array.isArray(saved))
        throw new Error("旧浏览器曲库不是乐谱列表，原数据已保留。");
    }
    const scores = new Map(
      legacy.filter((r) => r.score).map((r) => [r.id, r.score]),
    );
    for (const score of saved) scores.set(score.id, score);
    const prior = new Map((await adapter.list()).records.map((r) => [r.id, r]));
    // Archive the original browser representation before any cleanup.
    if (live) await metadata.set("legacy-localStorage-backup", live);
    for (const [id, score] of scores) {
      const existing = prior.get(id);
      const original = legacy.find((s) => s.id === id);
      const oldId =
        "migrated-" +
        (await contentHash([score, original?.reference])).slice(0, 32);
      if (prior.get(oldId)?.document?.lineage?.parentId === id) {
        const old = await adapter.get(oldId);
        if (old.sourceNotation && old.sourceReference?.id === id) {
          await adapter.save(
            {
              ...old,
              sourceReference: { ...old.sourceReference, id: oldId },
              sourceNotation: { ...old.sourceNotation, scoreId: oldId },
            },
            { expectedRevision: old.revision },
          );
        }
        if (previouslyMigrated) continue;
      }
      if (previouslyMigrated && !existing && !live) continue;
      const assets = [];
      for (const asset of original?.assets || [])
        assets.push({
          id: asset.id,
          page: asset.page,
          system: asset.system,
          mimeType: asset.blob.type,
          data: await base64(asset.blob),
        });
      const candidate = normalizeLibraryRecord({
        score,
        sourceNotation: original?.notation,
        assets,
        downloaded: original?.downloaded === true,
        sourceReference: original?.reference,
        reviewStatus: original?.reviewStatus,
        warnings: original?.warnings,
      });
      if (!existing) {
        await adapter.save(candidate, { expectedRevision: 0 });
        continue;
      }
      const current = await adapter.get(id);
      const signature = await contentHash(migrationContents(candidate));
      // Include history so a later edit doesn't resurrect an already migrated version.
      let alreadySaved = false;
      for (const revision of [current, ...current.history]) {
        if ((await contentHash(migrationContents(revision))) === signature) {
          alreadySaved = true;
          break;
        }
      }
      if (alreadySaved) continue;
      const migratedId = "migrated-" + signature.slice(0, 32);
      if (prior.has(migratedId)) continue;
      const document = {
        ...candidate.document,
        id: migratedId,
        title: candidate.document.title + "（旧曲库迁移版本）",
        lineage: {
          originalId: existing.document.lineage.originalId,
          parentId: id,
        },
      };
      await adapter.save(
        {
          ...candidate,
          id: migratedId,
          document,
          sourceReference: candidate.sourceReference && {
            ...candidate.sourceReference,
            id: migratedId,
          },
          sourceNotation: candidate.sourceNotation && {
            ...candidate.sourceNotation,
            scoreId: migratedId,
          },
        },
        { expectedRevision: 0 },
      );
    }
    await metadata.set(receipt, true);
    if (live) storage.removeItem("qinban-scores");
  }
  function release(id) {
    for (const url of urls.get(id) || []) URL.revokeObjectURL(url);
    urls.delete(id);
  }
  function source(record) {
    if (!record.sourceNotation) return null;
    release(record.id);
    const links = new Map(),
      owned = [],
      assets = [];
    for (const a of record.assets) {
      const bytes = Uint8Array.from(atob(a.data), (c) => c.charCodeAt(0)),
        blob = new Blob([bytes], { type: a.mimeType }),
        url = URL.createObjectURL(blob);
      links.set(a.id, url);
      owned.push(url);
      assets.push({
        id: a.id,
        page: a.page,
        system: a.system,
        mimeType: a.mimeType,
        blob,
      });
    }
    urls.set(record.id, owned);
    return {
      id: record.id,
      reference: record.sourceReference,
      assets,
      notation: {
        ...record.sourceNotation,
        pages: record.sourceNotation.pages?.map((p) => ({
          ...p,
          imageUrl: links.get(p.assetId),
        })),
        systems: record.sourceNotation.systems.map((s) => ({
          ...s,
          imageUrl: links.get(s.assetId || s.id),
        })),
      },
      warnings: record.warnings,
      reviewStatus: record.reviewStatus,
    };
  }
  return {
    initialize() {
      return (initialization ||= (migrateLegacy ? migrate() : Promise.resolve())
        .then(refresh)
        .catch((error) => {
          initialization = null;
          throw error;
        }));
    },
    refresh,
    get catalogue() {
      return cache.map((record) => record.score || record.summary);
    },
    get scores() {
      return cache.flatMap((record) => (record.score ? [record.score] : []));
    },
    async loadPractice(id) {
      const generation = cacheGeneration;
      const opened = await adapter.openPractice(id);
      checkGeneration(generation);
      return {
        score: opened.score,
        warnings: opened.warnings,
        async readSource(current) {
          const record = await opened.readRecord();
          checkGeneration(generation);
          return record &&
            current() &&
            sourceMatchesScore(opened.score, {
              reference: record.sourceReference,
            })
            ? source(record)
            : null;
        },
      };
    },
    get records() {
      return cache;
    },
    get warnings() {
      return warnings;
    },
    async save(
      score,
      {
        sourceRecord,
        downloaded = false,
        publication,
        originalFile,
        expectedRevision,
      } = {},
    ) {
      const generation = cacheGeneration;
      const known = cache.find((r) => r.id === score.id),
        parent = score.lineage?.parentId;
      let previous;
      try {
        previous = await adapter.get(score.id);
      } catch (e) {
        if (e.code !== "LIBRARY_NOT_FOUND") throw e;
      }
      let original = previous;
      if (!original && parent)
        try {
          original = await adapter.get(parent);
        } catch (e) {
          if (e.code !== "LIBRARY_NOT_FOUND") throw e;
        }
      let sourceNotation = original?.sourceNotation || null,
        assets = original?.assets || [],
        sourceReference = original?.sourceReference;
      if (sourceRecord) {
        sourceNotation = sourceRecord.notation;
        sourceReference = sourceRecord.reference;
        assets = [];
        const supplied = Array.isArray(sourceRecord.assets)
          ? sourceRecord.assets
          : [];
        for (const s of [
          ...sourceNotation.systems,
          ...(sourceNotation.pages || []),
        ]) {
          const sourceAsset =
            supplied.find((asset) => asset.id === (s.assetId || s.id)) ||
            supplied.find(
              (asset) =>
                Number.isInteger(s.page) &&
                Number.isInteger(s.system) &&
                asset.page === s.page &&
                asset.system === s.system,
            );
          let blob;
          if (sourceAsset) {
            if (!(sourceAsset.blob instanceof Blob) || !sourceAsset.blob.size)
              throw new Error(
                "原谱图片数据为空，乐谱未保存。请重新打开原谱后再试。",
              );
            blob = sourceAsset.blob;
          } else {
            try {
              const response = await fetchImpl(s.imageUrl);
              if (!response.ok)
                throw new Error("Image response was not successful");
              blob = await response.blob();
            } catch (cause) {
              throw Object.assign(
                new Error(
                  "原谱图片读取失败。已有乐谱和审核结果仍保留，请重新打开后再保存。",
                  { cause },
                ),
                { code: "SOURCE_IMAGE_READ_FAILED" },
              );
            }
          }
          assets.push({
            id: s.assetId || s.id,
            page: s.page,
            system: s.system,
            mimeType: blob.type || sourceAsset?.mimeType,
            data: await base64(blob),
          });
        }
      }
      const document = readScoreDocument(
        score,
        sourceNotation ? { sourceNotation } : {},
      );
      checkGeneration(generation);
      const record = await adapter.save(
        {
          document,
          sourceNotation,
          sourceReference,
          assets,
          reviewStatus: sourceRecord?.reviewStatus || original?.reviewStatus,
          warnings: sourceRecord?.warnings || original?.warnings,
          downloaded: downloaded || previous?.downloaded,
          publication,
          originalFile: originalFile || original?.originalFile,
        },
        { expectedRevision: expectedRevision ?? known?.revision ?? 0 },
      );
      await refresh();
      checkGeneration(generation);
      const saved = cache.find(
        (item) => item.id === record.id && item.revision === record.revision,
      );
      if (saved?.summary) saved.score = record.score;
      return record.score;
    },
    async saveBundle(bundle) {
      const existing = cache.find((r) => r.id === bundle.score.id);
      const record = await adapter.save(
        { ...bundle, downloaded: true },
        { expectedRevision: existing?.revision || 0 },
      );
      await refresh();
      return record.score;
    },
    async readSource(score, current = () => true) {
      const generation = cacheGeneration;
      const record = await adapter.get(score.id);
      checkGeneration(generation);
      return current() &&
        sourceMatchesScore(score, { reference: record.sourceReference })
        ? source(record)
        : null;
    },
    async remove(id) {
      await adapter.remove(id);
      release(id);
      await refresh();
    },
    async backup() {
      return adapter.backup();
    },
    async restore(backup) {
      const result = await adapter.restore(backup);
      await refresh();
      return result;
    },
    async revisions(id) {
      return (await adapter.get(id)).history;
    },
    async restoreRevision(id, revision) {
      const record = await adapter.get(id),
        snapshot = record.history.find((r) => r.revision === revision);
      if (!snapshot) throw new Error("这份修订不存在。");
      await adapter.save(snapshot, { expectedRevision: record.revision });
      await refresh();
    },
    async package(id) {
      return adapter.get(id);
    },
    release,
    reset() {
      cacheGeneration++;
      for (const id of urls.keys()) release(id);
      cache = [];
      warnings = [];
      initialization = null;
    },
  };
}

export function createLibraryClient({
  capabilities,
  api,
  storage = globalThis.localStorage,
  browser = createBrowserLibrary(),
  legacySources,
  hosted,
} = {}) {
  const adapter =
    capabilities.mode === "hosted"
      ? hosted
      : capabilities.mode === "local"
        ? createDiskLibrary(api)
        : browser;
  const client = createUnifiedLibrary({
    adapter,
    metadata:
      capabilities.mode === "hosted" ? hosted.metadata : browser.metadata,
    storage,
    migrateLegacy: capabilities.mode !== "hosted",
    ...(legacySources ? { legacySources } : {}),
  });
  client.metadata =
    capabilities.mode === "hosted" ? hosted.metadata : browser.metadata;
  return client;
}
