#!/usr/bin/env node
// 把一个或多个逐小节文本（.bars）合并为琴伴乐谱 JSON：
//   node scripts/bars-to-score.mjs out.json a.bars b.bars ... [--key 4 --time 12/8 --tempo 141 --title 曲名 --id id]
// 每个声部都必须恰好填满小节；有任何错误时列出全部错误并以非零状态退出，不生成乐谱。
// --allow-missing 1：只检查文件中已有的小节（例如单页），缺少的小节不报错。
import { readFile, writeFile } from 'node:fs/promises';
import { barsToScore } from '../lib/bar-notation.mjs';

const args = process.argv.slice(2), overrides = {}, files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) overrides[args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = args[++i];
  else files.push(args[i]);
}
const [out, ...inputs] = files;
if (!out || !inputs.length) {
  console.error('用法：bars-to-score.mjs out.json a.bars [b.bars ...] [--key N --time 4/4 --tempo 90 --title 名称 --id id]');
  process.exit(2);
}
const source = (await Promise.all(inputs.map(file => readFile(file, 'utf8')))).join('\n');
const { errors, score, bars } = barsToScore(source, overrides);
if (errors.length) {
  for (const message of errors) console.error('✗ ' + message);
  process.exit(1);
}
await writeFile(out, JSON.stringify({ score }) + '\n');
console.log(`✓ ${bars} 小节，${score.notes.length} 个音符 → ${out}`);
