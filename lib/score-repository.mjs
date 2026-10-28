// 云端曲库仓库：score-repo/ 随 Git 仓库同步（GitHub main 即云端副本）。
// 每首曲目一个 score-repo/scores/<id>.json，index.json 记录元数据与 SHA-256，
// index.mjs 由本模块生成并静态导入全部曲目，浏览器与 Node 共用同一份数据。
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScore } from "./score.mjs";

export const DEFAULT_REPOSITORY = resolve(
  fileURLToPath(new URL("../score-repo", import.meta.url)),
);
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const serialize = (score) => JSON.stringify(score) + "\n";

async function atomicWrite(path, text) {
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, text);
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function readManifest(dir = DEFAULT_REPOSITORY) {
  try {
    const manifest = JSON.parse(
      await readFile(join(dir, "index.json"), "utf8"),
    );
    if (manifest?.version !== 1 || !Array.isArray(manifest.scores))
      throw new Error("曲库清单格式无效。");
    return manifest;
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, scores: [] };
    throw error;
  }
}

export function renderIndexModule(manifest) {
  const lines = [
    "// 由 scripts/score-repo.mjs 生成，请勿手工编辑。",
    "import { validateScore } from '../lib/score.mjs';",
  ];
  manifest.scores.forEach((entry, i) =>
    lines.push(
      `import s${i} from './scores/${entry.id}.json' with { type: 'json' };`,
    ),
  );
  lines.push("", "export const repositoryScores = [");
  manifest.scores.forEach((entry, i) =>
    lines.push(
      `  { ...validateScore(s${i}), description: ${JSON.stringify(entry.description)} },`,
    ),
  );
  lines.push("];", "");
  return lines.join("\n");
}

export function manifestEntry(
  score,
  { description = "", addedAt = new Date().toISOString() } = {},
) {
  const bar = (score.timeSignature[0] * 4) / score.timeSignature[1];
  return {
    id: score.id,
    title: score.title,
    composer: score.composer,
    description: String(description).slice(0, 200),
    timeSignature: score.timeSignature,
    keySignature: score.keySignature,
    tempo: score.tempo,
    measures:
      score.measureMap?.length ?? Math.ceil(score.durationBeats / bar - 1e-9),
    notes: score.notes.length,
    durationBeats: score.durationBeats,
    sourceKind: score.source.kind,
    sha256: sha256(serialize(score)),
    addedAt,
  };
}

// 新增或替换一首曲目；替换时保留首次入库时间。
export async function addScore(
  raw,
  {
    dir = DEFAULT_REPOSITORY,
    description,
    now = () => new Date().toISOString(),
  } = {},
) {
  const score = validateScore(raw);
  if (!ID.test(score.id))
    throw new Error(`曲目 ID 只能用小写字母、数字和连字符：${score.id}`);
  const manifest = await readManifest(dir);
  const previous = manifest.scores.find((entry) => entry.id === score.id);
  const entry = manifestEntry(score, {
    description: description ?? previous?.description ?? "",
    addedAt: previous?.addedAt ?? now(),
  });
  await mkdir(join(dir, "scores"), { recursive: true });
  await atomicWrite(join(dir, "scores", `${score.id}.json`), serialize(score));
  manifest.scores = [
    ...manifest.scores.filter((item) => item.id !== score.id),
    entry,
  ].sort((a, b) => a.id.localeCompare(b.id));
  await atomicWrite(
    join(dir, "index.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await atomicWrite(join(dir, "index.mjs"), renderIndexModule(manifest));
  return { entry, replaced: Boolean(previous) };
}

// 核对清单、曲目文件、SHA-256、乐谱结构与生成的导入模块是否一致。
export async function verifyRepository(dir = DEFAULT_REPOSITORY) {
  const problems = [];
  const manifest = await readManifest(dir);
  const ids = new Set();
  for (const entry of manifest.scores) {
    if (!ID.test(entry.id ?? "")) {
      problems.push(`无效曲目 ID：${entry.id}`);
      continue;
    }
    if (ids.has(entry.id)) problems.push(`曲目 ID 重复：${entry.id}`);
    ids.add(entry.id);
    let text;
    try {
      text = await readFile(join(dir, "scores", `${entry.id}.json`), "utf8");
    } catch {
      problems.push(`缺少曲目文件：scores/${entry.id}.json`);
      continue;
    }
    if (sha256(text) !== entry.sha256) {
      problems.push(`${entry.id}：文件内容与清单 SHA-256 不一致`);
      continue;
    }
    let score;
    try {
      score = validateScore(JSON.parse(text));
    } catch (error) {
      problems.push(`${entry.id}：${error.message}`);
      continue;
    }
    if (score.id !== entry.id)
      problems.push(`${entry.id}：文件内的曲目 ID 为 ${score.id}`);
    if (serialize(score) !== text)
      problems.push(
        `${entry.id}：文件不是规范化后的乐谱，请用 scores:add 重新写入`,
      );
    const expected = manifestEntry(score, entry);
    for (const key of [
      "title",
      "composer",
      "tempo",
      "keySignature",
      "measures",
      "notes",
      "durationBeats",
      "sourceKind",
    ])
      if (JSON.stringify(expected[key]) !== JSON.stringify(entry[key]))
        problems.push(`${entry.id}：清单字段 ${key} 与曲目不一致`);
  }
  let generated = "";
  try {
    generated = await readFile(join(dir, "index.mjs"), "utf8");
  } catch {}
  if (generated !== renderIndexModule(manifest))
    problems.push(
      "index.mjs 未与清单同步，请运行 npm run scores:add 或 scores:index",
    );
  return { ok: problems.length === 0, count: manifest.scores.length, problems };
}

export async function writeIndexModule(dir = DEFAULT_REPOSITORY) {
  await atomicWrite(
    join(dir, "index.mjs"),
    renderIndexModule(await readManifest(dir)),
  );
}
