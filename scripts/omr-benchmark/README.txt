琴伴识谱对照实验，2026-10-17

本目录是原 App 仓库内的评测脚本。报告包中的脚本副本用于审计，运行依赖原仓库的 lib/auth.mjs、Pi SDK、Node 22.19+、Audiveris 5.11.0，以及 Python ReportLab/Pillow/pypdf。报告 HTML/PDF/CSV 阅读不需要运行脚本或登录。

测试范围：10份所选公开曲库版本的全部15页；3630个书写音头，26个倚音另计。严格事件指标在延音合并后匹配音高、全曲起拍、时值和上下谱表。逐小节指标保留为诊断。反复不展开。

原始标准答案是固定Git提交的MusicXML；由独立排版器Verovio 6.3.0生成谱面，PDF内嵌图与GPT收到的PNG逐像素相同。输入中未嵌入MusicXML或标准答案。所有正式识别结果未做人工修正。

以下命令在原 App 项目根目录运行：
  node --test scripts/omr-benchmark/score.test.mjs
  python3 scripts/omr-benchmark/reference_test.py
  node scripts/omr-benchmark/analyze.mjs
  python3 scripts/omr-benchmark/verify_independent.py
  node scripts/omr-benchmark/verify-runs.mjs
  node scripts/omr-benchmark/report.mjs
  python3 scripts/omr-benchmark/report_pdf.py
以上均为本机分析/报告，不调用模型。

真实识别命令：
  node scripts/omr-benchmark/run.mjs omr
  node scripts/omr-benchmark/run.mjs ai
ai 命令会通过现有 Pi/Codex 登录调用 gpt-6.1-sol high，使用账号额度。每份整谱只请求一次，不复读，不重试；600秒超时。脚本跳过已有 run.json 的样本，包括失败结果。开启新一轮实验应另建目录并固定新的协议，不要删除旧结果再冒充首次测试。

目录约定：
  .local/omr-benchmark-20261017/ 存原输入、标准答案、原始识别输出、计时和来源；
  evidence/omr-vs-sol-high-20261017/ 存汇总指标、逐音差异和独立校验；
  output/识谱对照实验-20261017/ 为交付报告与可复核样本包。

原始源文件及初始参考解析版本均保留。修正记录 reference-correction.json 解释了三份弱起小节未标 implicit 属性，以及超长小节不得截断的解析修复；修复没有改变图片或识别器输出，也没有因此重跑识别。初始漏线的图片渲染预检不计入正式比较，相关预检结果单列保存。
