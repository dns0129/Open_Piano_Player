import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  rm,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { validCloudId, validateCloudBundle } from "./cloud-library-format.mjs";
const missing = () =>
  Object.assign(new Error("本地没有这首下载曲目。"), {
    status: 404,
    code: "LOCAL_SCORE_NOT_FOUND",
    public: true,
  });
export function createDownloadLibrary({
  directory = resolve(".local/downloaded-scores"),
} = {}) {
  const path = (id) => {
    if (!validCloudId(id)) throw missing();
    return join(directory, id + ".json");
  };
  async function read(id) {
    try {
      return validateCloudBundle(JSON.parse(await readFile(path(id), "utf8")));
    } catch (e) {
      if (e.code === "ENOENT") throw missing();
      throw e;
    }
  }
  return {
    async save(input) {
      const b = validateCloudBundle(input);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const dest = path(b.score.id),
        temp =
          dest + `.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      try {
        await writeFile(temp, JSON.stringify(b), { mode: 0o600 });
        await rename(temp, dest);
      } finally {
        await rm(temp, { force: true });
      }
      return { id: b.score.id, saved: true };
    },
    async list() {
      let files;
      try {
        files = await readdir(directory);
      } catch (e) {
        if (e.code === "ENOENT") return { scores: [], warnings: [] };
        throw e;
      }
      const scores = [],
        warnings = [];
      for (const file of files.filter((f) => f.endsWith(".json")))
        try {
          const b = await read(file.slice(0, -5));
          scores.push({ score: b.score, downloaded: true });
        } catch {
          warnings.push("一份本地下载曲目无法读取。");
        }
      return { scores, warnings };
    },
    async source(id) {
      const b = await read(id);
      return {
        score: b.score,
        notation: b.sourceNotation
          ? {
              ...b.sourceNotation,
              systems: b.sourceNotation.systems.map((s) => ({
                ...s,
                imageUrl: `/api/local-downloads/${id}/images/${s.assetId || s.id}`,
              })),
            }
          : null,
        warnings: b.warnings,
        reviewStatus: b.reviewStatus,
      };
    },
    async image(id, assetId) {
      const b = await read(id),
        a = b.assets.find((a) => a.id === assetId);
      if (!a) throw missing();
      return { buffer: Buffer.from(a.data, "base64"), mimeType: a.mimeType };
    },
    async remove(id) {
      await rm(path(id), { force: true });
      return { id, deleted: true };
    },
  };
}
