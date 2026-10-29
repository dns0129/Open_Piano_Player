import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { scoreDensePdfRow } from "../lib/dense-pdf-benchmark.mjs";
const root = resolve(process.argv[2] || ".local/dense-pdf-benchmark-20261021");
const output = resolve(
  process.argv[3] || "output/密集复杂PDF识谱评测-20261021",
);
const manifest = JSON.parse(await readFile(join(root, "manifest.json"))),
  protocol = JSON.parse(await readFile(join(root, "protocol.json")));
const run = JSON.parse(await readFile(join(root, "run.json"))),
  summary = JSON.parse(await readFile(join(root, "run-summary.json")));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const readJSON = async (p) => JSON.parse(await readFile(p));
const optional = async (p) => {
  try {
    return await readJSON(p);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
};
const rows = [];
await mkdir(output, { recursive: true });
for (const source of manifest) {
  const job = run.jobs.find((j) => j.key === source.id),
    state = await readJSON(join(root, source.id, "final-state.json"));
  const transcriptions = [];
  for (const region of source.regions) {
    const bytes = await readFile(
      join(root, source.id, `reference-row-${region.system}.json`),
    );
    if (
      sha(bytes) !== region.referenceSha256 ||
      sha(await readFile(region.path)) !== region.sha256
    )
      throw Error("Frozen source/reference changed");
    const reference = JSON.parse(bytes),
      first = await optional(
        join(root, "raw-calls", `${job.id}-${region.id}-first.json`),
      ),
      fallback = await optional(
        join(root, "raw-calls", `${job.id}-${region.id}-fallback.json`),
      ),
      final = state.regions.find((r) => r.id === region.id);
    transcriptions.push({
      system: region.system,
      originalPdfPage: source.selectedPage,
      printedMeasures: region.referencePrintedRange,
      status: final.status,
      error: final.error || null,
      first: first?.result || null,
      firstError: first?.error || null,
      fallback: fallback?.result || null,
      framework: final.result || null,
    });
    rows.push({
      source: source.id,
      title: source.title,
      pdfPage: source.selectedPage,
      system: region.system,
      printedMeasures: region.referencePrintedRange,
      status: final.status,
      error: final.error || first?.error || null,
      firstError: first?.error || null,
      fallbackError: fallback?.error || null,
      fallbackUsed: !!fallback,
      fallback: fallback?.result
        ? scoreDensePdfRow(reference, fallback.result)
        : null,
      first: scoreDensePdfRow(reference, first?.result),
      framework: scoreDensePdfRow(reference, final.result),
      checks: final.result?.checks || null,
      sourceImageSha256: region.sha256,
      referenceSha256: region.referenceSha256,
    });
  }
  const target = join(output, source.id);
  await mkdir(target, { recursive: true });
  await writeFile(
    join(target, "recognized-rows.json"),
    JSON.stringify(transcriptions, null, 2),
  );
  for (const file of [
    "score.pdf",
    "reference.mxl",
    "reference.musicxml",
    "selected-page.png",
  ])
    await copyFile(join(root, source.id, file), join(target, file));
  await writeFile(
    join(target, "NOTICE.txt"),
    `${source.title}\n${source.license}\n${source.attribution}\nLicense: ${source.license === "CC0 1.0" ? "https://creativecommons.org/publicdomain/zero/1.0/" : source.license === "CC BY 4.0" ? "https://creativecommons.org/licenses/by/4.0/" : "https://creativecommons.org/licenses/by-sa/4.0/"}\nSource: ${source.pageUrl}\nPDF: ${source.pdfUrl}\nMusicXML: ${source.referenceUrl}\nDownloaded: ${source.retrievedAt}\nOriginal files are unchanged.\n`,
  );
}
let ledger = [];
try {
  ledger = (await readFile(join(root, "usage.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
function aggregate(selected, pass) {
  const sum = (metric) => {
    const all = selected.map((r) => r[pass][metric]);
    const reference = all.reduce((s, r) => s + r.reference, 0),
      predicted = all.reduce((s, r) => s + r.predicted, 0),
      correct = all.reduce((s, r) => s + r.correct, 0);
    return {
      reference,
      predicted,
      correct,
      recall: reference ? correct / reference : null,
      precision: predicted ? correct / predicted : null,
      f1:
        reference + predicted ? (2 * correct) / (reference + predicted) : null,
    };
  };
  return {
    strict: sum("strict"),
    pitchAndHand: sum("pitchAndHand"),
    pitchHandOnset: sum("pitchHandOnset"),
    grace: sum("grace"),
    returnedRows: selected.filter((r) => r[pass].returned).length,
    exactRows: selected.filter(
      (r) =>
        r[pass].returned &&
        r[pass].strict.missing.length === 0 &&
        r[pass].strict.extra.length === 0 &&
        r[pass].barDurationsExact,
    ).length,
  };
}
const totals = {
  first: aggregate(rows, "first"),
  framework: aggregate(rows, "framework"),
};
const usage = {
  recordedCalls: ledger.length,
  actualRequests: ledger.reduce((s, e) => s + e.actualRequests, 0),
  knownUsageCalls: ledger.filter((e) => e.usageKnown).length,
  unknownUsageCalls: ledger.filter((e) => !e.usageKnown).length,
  knownTokens: ledger
    .filter((e) => e.usageKnown)
    .reduce(
      (a, e) => ({
        input: a.input + e.usage.input,
        output: a.output + e.usage.output,
        totalTokens: a.totalTokens + e.usage.totalTokens,
      }),
      { input: 0, output: 0, totalTokens: 0 },
    ),
  summedCallSeconds: ledger.reduce((s, e) => s + e.elapsedSeconds, 0),
  wallSeconds: (Date.parse(summary.endedAt) - Date.parse(run.startedAt)) / 1000,
  cashCost: null,
};
const observations = await optional(join(root, "observations.json"));
const results = {
  protocol,
  observations,
  sources: manifest.map(({ regions, ...s }) => s),
  rows,
  totals,
  usage,
};
await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2));
const pct = (x) => (x === null ? "未知" : (100 * x).toFixed(1) + "%");
const compact = (m) => `${m.correct}/${m.reference}（${pct(m.recall)}）`;
const table = [
  "| 样本与原PDF页码 | 参考音符事件 | 返回行/总行 | 首次严格召回 | 含自动回退的严格召回 | 音高+手别多重集召回 | 严格精确率 |",
  "|---|---:|---:|---:|---:|---:|---:|",
];
for (const s of manifest) {
  const rr = rows.filter((r) => r.source === s.id),
    f = aggregate(rr, "first"),
    a = aggregate(rr, "framework");
  table.push(
    `| ${s.title} · 第${s.selectedPage}页 | ${a.strict.reference} | ${a.returnedRows}/${rr.length} | ${compact(f.strict)} | ${compact(a.strict)} | ${compact(a.pitchAndHand)} | ${pct(a.strict.precision)} |`,
  );
}
table.push(
  `| 合计 | ${totals.framework.strict.reference} | ${totals.framework.returnedRows}/${rows.length} | ${compact(totals.first.strict)} | ${compact(totals.framework.strict)} | ${compact(totals.framework.pitchAndHand)} | ${pct(totals.framework.strict.precision)} |`,
);
const details = rows
  .map(
    (r) =>
      `| ${r.title} | ${r.pdfPage}/${r.system} | ${r.printedMeasures.join("–")} | ${compact(r.first.strict)} | ${compact(r.framework.strict)} | ${r.status}${r.fallbackUsed ? "；自动回退" : ""} | ${(r.error?.code || "") + (r.error?.message ? "：" + r.error.message : "")} |`,
  )
  .join("\n");
const report = `# 密集复杂 PDF 识谱压力测试\n\n日期：2026-10-21。框架版本：${protocol.revision}。模型：gpt-6.1-sol / high。提示词：piano-system-pairing-v4-20261021。\n\n## 结果\n\n${table.join("\n")}\n\n首轮流程有 ${rows.filter((r) => r.status === "failed").length} 行失败，${rows.filter((r) => r.fallbackUsed).length} 行触发现有自动 JSON 回退。${totals.framework.exactRows}/${rows.length} 行在本次计分的全部普通音符事件与小节时长上完全一致；这不包含演奏记号的完整性。结构检查通过 ${rows.filter((r) => r.checks?.passed).length}/${rows.length} 行，不能据此推断音符正确。\n\n## 发现的具体问题\n\n${(observations?.paragraphs || []).join("\n\n")}\n\n## 范围与独立参考\n\n收集三份完整公开 PDF，共 ${manifest.reduce((s, m) => s + m.totalPdfPages, 0)} 页；在调用模型前固定其中三页、16个完整双手谱行，共 ${totals.framework.strict.reference} 个普通书写音符事件、${rows.reduce((s, r) => s + r.framework.expectedBars.length, 0)} 个小节。Op.10 No.4 第1页含编号0的弱起，实际1拍；其余谱行按事先冻结的印刷小节号映射。拉赫玛尼诺夫使用 Noctave 的双谱表重排版，未测试历史四谱表版本。\n\n参考来自同一发布者提供的同版 MusicXML，用独立 Python XML 解析器读取，再核对原图的页、行、小节号、首尾音和谱号；不是第二次模型答案，也不是人工全谱逐音确认。选定页与所有参考 JSON、图像的哈希均在识别前冻结；模型未收到参考或上次答案，请求中的标题匿名；原图裁切保留了印刷页眉，部分包含曲名，因此这是不提供参考答案的测试，不是严格的曲名盲测。参考解析器按 MusicXML 实际音高，不另加八度；所选范围无 octave-shift 元素。\n\n严格召回 = 手别、MIDI音高、行内起始拍、纸面时值同时正确的音符事件数 / 全部参考音符事件数。以独立声部的书写音符为事件，共享图形音头而属于不同声部的音符分别计数；不比较声部编号或等音拼写。时间单位为四分音符拍，容差1e-4；使用一对一最大匹配，重复/额外音符事件不消失。每个原始输入谱行从0开始，只在行界归零；不在小节间重置或事后移动拍位补分。严格精确率分母是全部预测音符事件。失败行仍占完整参考分母；严格不匹配包含音高/节奏/手别错误，不能全称作漏音。\n\n“音高+手别多重集召回”忽略行内顺序和节奏，只检查这一行各音高与手别出现次数，用于区分音高和时间轴问题；它不是可播放准确率。延音不提前合并，按书写音符事件计算；此次未把延音连接、休止、力度、速度、装饰音、踏板、连奏弧与琶音完整性纳入准确率。所选范围参考倚音数 ${totals.framework.grace.reference}，无分母时不报告100%。\n\n这是三份清晰电子排版 PDF 的固定抽页压力测试，不能外推整曲、扫描PDF、手机照片或所有复杂钢琴谱。没有人工改音、主动第二轮重读、确认或导入用户曲库。首次解码失败的原始错误、框架自动回退与最终可用结果均独立留存。\n\n## 逐行结果\n\n| 样本 | 原PDF页/系统行 | 印刷小节号 | 首次严格召回 | 框架严格召回 | 状态 | 失败原因 |\n|---|---:|---|---:|---:|---|---|\n${details}\n\n## 来源、文件和许可\n\n${manifest.map((s) => `- [${s.title} 来源](${s.pageUrl})：${s.totalPdfPages}页，${s.license}；${s.attribution}。本目录 ${s.id}/score.pdf 为未改动原文件，reference.mxl / reference.musicxml 为独立参考，recognized-rows.json 为首轮逐行识别数据，selected-page.png 为本次抽页。`).join("\n")}\n\n请随原文件保留各目录 NOTICE.txt 中的来源与署名；CC BY-SA 版本的衍生谱面也需遵守相同许可。\n\n## 实际调用与可追溯性\n\n记录 ${usage.recordedCalls} 个适配器调用，实际发出 ${usage.actualRequests} 个提供方请求。已知 usage ${usage.knownUsageCalls} 次，缺失 ${usage.unknownUsageCalls} 次；已知输入 ${usage.knownTokens.input}、输出 ${usage.knownTokens.output}、合计 ${usage.knownTokens.totalTokens} token。各usage字段按提供方原值分别累加，totalTokens不强制等于input+output；缺失usage未填0。订阅调用的现金成本未知。墙钟 ${(usage.wallSeconds / 60).toFixed(1)} 分钟，调用耗时相加 ${(usage.summedCallSeconds / 60).toFixed(1)} 分钟；并发上限4，两者不可混用。\n\nresults.json 保存每行独立参考比对及严格不匹配音符事件，results.csv 方便筛选。隔离原始任务、首轮解析结果、错误、回退响应与提供方usage位于本机 ${root}；其中访问令牌不进入报告或Git。\n`;
await writeFile(join(output, "report.md"), report);
const columns = [
  "source",
  "pdfPage",
  "system",
  "referenceHeads",
  "firstCorrect",
  "finalCorrect",
  "predictedHeads",
  "strictRecall",
  "strictPrecision",
  "pitchRecall",
  "returned",
  "fallback",
  "status",
  "errorCode",
];
const csv =
  [
    columns.join(","),
    ...rows.map((r) =>
      [
        r.source,
        r.pdfPage,
        r.system,
        r.framework.strict.reference,
        r.first.strict.correct,
        r.framework.strict.correct,
        r.framework.strict.predicted,
        r.framework.strict.recall,
        r.framework.strict.precision,
        r.framework.pitchAndHand.recall,
        r.framework.returned,
        r.fallbackUsed,
        r.status,
        r.error?.code || "",
      ].join(","),
    ),
  ].join("\n") + "\n";
await writeFile(join(output, "results.csv"), csv);
await writeFile(
  join(output, "protocol.json"),
  JSON.stringify(protocol, null, 2),
);
const addendum = await optional(join(root, "protocol-addendum.json"));
if (addendum)
  await writeFile(
    join(output, "protocol-addendum.json"),
    JSON.stringify(addendum, null, 2),
  );
console.log(JSON.stringify({ output, totals, usage }, null, 2));
