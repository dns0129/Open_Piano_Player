#!/usr/bin/env node
// 云端曲库仓库命令行：
//   node scripts/score-repo.mjs add <乐谱.json> [--description "说明"]   新增或更新曲目
//   node scripts/score-repo.mjs verify                                     校验整个曲库
//   node scripts/score-repo.mjs list                                       列出曲目
//   node scripts/score-repo.mjs index                                      重新生成 index.mjs
// 乐谱文件可以是琴伴 JSON 乐谱对象，也可以是 { "score": {...} } 包装（App 导出格式）。
import { readFile } from "node:fs/promises";
import {
  addScore,
  verifyRepository,
  readManifest,
  writeIndexModule,
} from "../lib/score-repository.mjs";

const [command, ...args] = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (command === "add") {
  const file = args.find(
    (arg) => !arg.startsWith("--") && arg !== option("--description"),
  );
  if (!file)
    throw new Error(
      '用法：score-repo.mjs add <乐谱.json> [--description "说明"]',
    );
  const data = JSON.parse(await readFile(file, "utf8"));
  const { entry, replaced } = await addScore(data.score ?? data, {
    description: option("--description"),
  });
  console.log(
    `${replaced ? "已更新" : "已加入"}：${entry.title}（${entry.id}）· ${entry.measures} 小节 · ${entry.notes} 个音符`,
  );
} else if (command === "verify") {
  const result = await verifyRepository();
  for (const problem of result.problems) console.error(`✗ ${problem}`);
  console.log(
    result.ok
      ? `✓ 曲库 ${result.count} 首曲目校验通过`
      : `曲库校验失败（${result.problems.length} 项）`,
  );
  process.exitCode = result.ok ? 0 : 1;
} else if (command === "list") {
  for (const entry of (await readManifest()).scores)
    console.log(
      `${entry.id}\t${entry.title}\t${entry.measures} 小节\t${entry.notes} 音符\t${entry.sourceKind}`,
    );
} else if (command === "index") {
  await writeIndexModule();
  console.log("已重新生成 score-repo/index.mjs");
} else {
  console.error("命令：add | verify | list | index");
  process.exitCode = 1;
}
