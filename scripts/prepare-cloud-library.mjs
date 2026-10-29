import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { library } from "../lib/catalog.mjs";
import {
  hantingNotation,
  hantingNotationMatched,
} from "../lib/scores/hanting.mjs";
import {
  bumblebeeYeungNotation,
  sourceNotationMatched,
} from "../lib/scores/bumblebee-yeung-notation.mjs";
import { createLocalLibrary } from "../lib/local-library.mjs";
import {
  validateCloudBundle,
  cloudEntry,
} from "../lib/cloud-library-format.mjs";
const root = resolve("public/cloud-library");
await mkdir(join(root, "scores"), { recursive: true });
let index;
try {
  index = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  index = { version: 1, scores: [], deletedIds: [] };
}
const store = createLocalLibrary();
const local = process.argv.includes("--include-local")
  ? (await store.list()).scores
  : [];
const entries = new Map(index.scores.map((s) => [s.id, s]));
for (const score of library) {
  if (index.deletedIds?.includes(score.id)) continue;
  const notation = hantingNotationMatched(score)
    ? hantingNotation
    : sourceNotationMatched(score)
      ? bumblebeeYeungNotation
      : null;
  const assets = [];
  if (notation)
    for (const s of notation.systems) {
      const buffer = await readFile(
        join("public", s.imageUrl.replace(/^\//, "")),
      );
      assets.push({
        id: s.id,
        page: s.page,
        system: s.system,
        mimeType: s.imageUrl.endsWith(".png") ? "image/png" : "image/jpeg",
        data: buffer.toString("base64"),
      });
    }
  const bundle = validateCloudBundle({
    score,
    sourceNotation: notation,
    assets,
  });
  await writeFile(
    join(root, "scores", score.id + ".json"),
    JSON.stringify(bundle) + "\n",
  );
  entries.set(score.id, cloudEntry(bundle));
}
for (const entry of local) {
  if (index.deletedIds?.includes(entry.score.id)) continue;
  const source = await store.source(entry.jobId),
    assets = [];
  for (const s of source.notation.systems) {
    const image = await store.image(entry.jobId, s.id);
    assets.push({
      id: s.id,
      page: s.page,
      system: s.system,
      mimeType: image.mimeType,
      data: image.buffer.toString("base64"),
    });
  }
  const bundle = validateCloudBundle({
    score: source.score,
    sourceNotation: source.notation,
    assets,
    warnings: source.warnings,
    reviewStatus: { method: source.reviewStatus, ...source.review },
  });
  await writeFile(
    join(root, "scores", entry.score.id + ".json"),
    JSON.stringify(bundle) + "\n",
  );
  entries.set(entry.score.id, cloudEntry(bundle));
}
index.scores = [...entries.values()].sort((a, b) => a.id.localeCompare(b.id));
index.updatedAt = new Date().toISOString();
await writeFile(
  join(root, "index.json"),
  JSON.stringify(index, null, 2) + "\n",
);
console.log(
  `云端下载目录已准备：${index.scores.length} 首（包含 ${local.length} 份本机完整识谱结果），仅准备文件，尚未上传。默认仅使用仓库已有公开内容；--include-local 会包含本机资料。`,
);
