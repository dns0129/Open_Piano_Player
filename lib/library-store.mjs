import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  rm,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import {
  validLibraryId,
  normalizeLibraryRecord,
  createLibraryBackup,
  readLibraryBackup,
  encodeLibraryResources,
  decodeLibraryResources,
  referencedResources,
  contentHash,
  librarySummary,
} from "./library-format.ts";

const missing = () =>
  Object.assign(new Error("本机曲库中没有这份乐谱。"), {
    code: "LIBRARY_NOT_FOUND",
    status: 404,
    public: true,
  });
const conflict = () =>
  Object.assign(
    new Error("这份乐谱已在其他窗口修改，请重新打开最新版本后保存。"),
    { code: "REVISION_CONFLICT", status: 409, public: true },
  );
const directoryQueues = new Map();

/** Disk is authoritative. A whole score, its assets and history share one atomic
 * rename. Legacy files remain untouched; tombstones prevent migration revival.
 */
export function createLibraryStore({
  directory = resolve(".local/library-v2"),
  legacyLibrary,
  legacyDownloads,
} = {}) {
  directory = resolve(directory);
  let migration,
    migrationWarnings = [];
  const locked = (fn) => {
    const task = (directoryQueues.get(directory) || Promise.resolve())
      .catch(() => {})
      .then(fn);
    directoryQueues.set(directory, task);
    return task;
  };
  const path = (id) => {
    if (!validLibraryId(id)) throw missing();
    return join(
      directory,
      createHash("sha256").update(id).digest("hex") + ".json",
    );
  };
  async function readRaw(id) {
    try {
      return JSON.parse(await readFile(path(id), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async function hydrate(raw) {
    const resources = {};
    for (const hash of referencedResources([raw])) {
      const data = await readFile(join(directory, "resources", hash), "utf8");
      if ((await contentHash(data)) !== hash)
        throw new Error("原谱资源完整性校验失败。");
      resources[hash] = data;
    }
    return decodeLibraryResources([raw], resources)[0];
  }
  async function write(id, value) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let packed = value;
    if (!value.deleted) {
      const payload = await encodeLibraryResources([value]);
      packed = payload.records[0];
      await mkdir(join(directory, "resources"), {
        recursive: true,
        mode: 0o700,
      });
      for (const [hash, data] of Object.entries(payload.resources)) {
        const asset = join(directory, "resources", hash);
        if (
          (await readFile(asset, "utf8").catch((error) => {
            if (error.code === "ENOENT") return null;
            throw error;
          })) === data
        )
          continue;
        const temp = asset + "." + randomBytes(6).toString("hex") + ".tmp";
        try {
          await writeFile(temp, data, { mode: 0o600 });
          await rename(temp, asset);
        } finally {
          await rm(temp, { force: true });
        }
      }
    }
    const destination = path(id),
      temp = destination + "." + randomBytes(6).toString("hex") + ".tmp";
    try {
      await writeFile(temp, JSON.stringify(packed), { mode: 0o600 });
      await rename(temp, destination);
    } finally {
      await rm(temp, { force: true });
    }
  }
  async function migrate() {
    if (migration) return migration;
    migration = locked(async () => {
      migrationWarnings = [];
      for (const [adapter, downloaded] of [
        [legacyDownloads, true],
        [legacyLibrary, false],
      ]) {
        if (!adapter?.list) continue;
        let listing;
        try {
          listing = await adapter.list();
        } catch {
          migrationWarnings.push("旧曲库目录未能读取，原数据保留。");
          continue;
        }
        migrationWarnings.push(...(listing.warnings || []));
        for (const entry of listing.scores) {
          if (await readRaw(entry.score.id)) continue;
          let record;
          try {
            const source = await adapter.source(entry.jobId || entry.score.id),
              assets = [];
            for (const system of source.notation?.systems || []) {
              const id = system.assetId || system.id,
                image = await adapter.image(entry.jobId || entry.score.id, id);
              assets.push({
                id,
                page: system.page,
                system: system.system,
                mimeType: image.mimeType,
                data: image.buffer.toString("base64"),
              });
            }
            const file = adapter.document
              ? await adapter.document(entry.jobId || entry.score.id)
              : null;
            record = normalizeLibraryRecord({
              score: source.score,
              sourceNotation: source.notation,
              assets,
              downloaded,
              ...(file
                ? {
                    originalFile: {
                      name: file.name,
                      mimeType: file.mimeType,
                      data: file.buffer.toString("base64"),
                    },
                  }
                : {}),
              reviewStatus: source.reviewStatus,
              warnings: source.warnings,
            });
          } catch {
            migrationWarnings.push(
              "旧乐谱“" + entry.score.title + "”尚未迁移，原文件保留。",
            );
            continue;
          }
          // Storage failures abort. Bad legacy input cannot hide saved records.
          await write(record.id, record);
        }
      }
    }).finally(() => {
      migration = null;
    });
    return migration;
  }
  async function records() {
    let files;
    try {
      files = await readdir(directory);
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    const records = [];
    for (const name of files.filter((f) => /^[a-f0-9]{64}\.json$/.test(f))) {
      const raw = JSON.parse(await readFile(join(directory, name), "utf8"));
      if (raw && !raw.deleted) records.push(librarySummary(raw));
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return {
    async list() {
      await migrate();
      return { records: await records(), warnings: [...migrationWarnings] };
    },
    async get(id) {
      await migrate();
      const raw = await readRaw(id);
      if (!raw || raw.deleted) throw missing();
      return hydrate(raw);
    },
    async save(input, { expectedRevision } = {}) {
      await migrate();
      return locked(async () => {
        const id = input.document?.id || input.score?.id || input.id,
          raw = await readRaw(id),
          active = raw && !raw.deleted ? await hydrate(raw) : undefined;
        const previous =
          active || (raw?.record ? await hydrate(raw.record) : undefined);
        if (
          expectedRevision !== undefined &&
          expectedRevision !== (active?.revision || 0)
        )
          throw conflict();
        const record = normalizeLibraryRecord(input, previous);
        await write(record.id, record);
        return record;
      });
    },
    async remove(id) {
      await migrate();
      return locked(async () => {
        const prior = await readRaw(id);
        if (!prior || prior.deleted) throw missing();
        await write(id, {
          id,
          deleted: true,
          removedAt: new Date().toISOString(),
          record: prior,
        });
        return { id, deleted: true };
      });
    },
    async backup() {
      await migrate();
      return locked(async () =>
        createLibraryBackup(
          await Promise.all(
            (await records()).map(async (r) => hydrate(await readRaw(r.id))),
          ),
        ),
      );
    },
    async restore(input) {
      const incoming = await readLibraryBackup(input);
      await migrate();
      return locked(async () => {
        const restored = [],
          conflicts = [];
        // Conflicts preserve the current copy. Validated incoming records can be
        // restored after removal, or into a fresh library without any conversion.
        for (const record of incoming) {
          const existing = await readRaw(record.id);
          if (existing && !existing.deleted) {
            conflicts.push(record.id);
            continue;
          }
          await write(record.id, record);
          restored.push(record.id);
        }
        return { restored, conflicts };
      });
    },
  };
}
