# 密集复杂 PDF 识谱评测（2026-10-21）

本次使用现有框架 `1051b5a1fba3429d11fffdc19187eb583ba203f8`、
`gpt-6.1-sol / high`、`piano-system-pairing-v4-20261021`，完成三份公开 PDF 的固定抽页压力测试。
原谱共19页；测试3页、16个完整双手系统行、54个小节、1292个普通书写音符事件。
模型只接收原谱裁图和可见拍号、调号，请求标题匿名，印刷页眉保留；没有提供参考答案。

| 样本 | PDF页 | 返回行 | 严格正确/全部参考 | 严格召回 | 返回音符精确率 |
|---|---:|---:|---:|---:|---:|
| 肖邦练习曲 Op.10 No.4 | 1 | 3/6 | 211/484 | 43.6% | 100.0% |
| 肖邦幻想即兴曲 Op.66 | 1 | 5/5 | 361/361 | 100.0% | 100.0% |
| 拉赫玛尼诺夫前奏曲 Op.3 No.2 | 2 | 3/5 | 259/447 | 57.9% | 99.2% |
| 合计 | 3页 | 11/16 | 831/1292 | 64.3% | 99.8%（831/833） |

严格匹配同时要求手别、MIDI、行内起始拍与纸面时值正确；容差1e-4四分音符拍，
每行从0开始，不在小节内重新对齐；重复和额外预测全部保留，使用一对一最大匹配。
以 MusicXML 的有声部书写音符事件计数，共享图形音头的不同声部独立计；不比较声部编号和等音拼写。
延音按未合并的书写事件计，不把延音、休止、演奏记号或播放效果纳入准确率。
失败行保留全部参考分母，未知/空分母不填写100%。
独立参考来自同版 MusicXML，由 Python XML 解析器读取；JS评分另由独立Python计数程序复算。
这是清晰电子排版 PDF 的抽页结果，不能外推整曲、照片、扫描PDF或所有复杂钢琴谱。

## 具体发现

- 4行模型明确请求更清晰来源（`NEEDS_SOURCE`）；其中3行来自练习曲，1行来自前奏曲。
- 前奏曲印刷第27、28小节的右手 B♯4（MIDI72）被识别为MIDI70，两处均低2个半音。
- 前奏曲第2页第5行首次调用未提交工具结果（`NO_REGION_RESULT`）。框架自动JSON回退
  返回102个音符事件，独立比对102/102正确，但速度为0，未通过20–300的校验，整行仍失败。
  只读重放本地校验确认该原因；没有改速度、改音、主动重跑或人工确认来提高得分。
- 最终5行失败；11行留待审核，10行在本次普通音符和小节时长指标上完全一致。
- 值得优先验证的改进：拒识密集行的高清双手分段重试、未知速度独立待确认、临时升降号回归。
  本次评测不修改运行中App的识谱行为，不导入用户曲库。

## 来源和许可

三个完整 PDF 及同版 MusicXML 的发布页：

- [肖邦练习曲 Op.10 No.4](https://noctavepiano.com/partitions/chopin-etude-op10-4/)：6页，CC BY4.0。
  First Editions of Fryderyk Chopin’s Music / The Fryderyk Chopin Institute；Noctave重排版。
- [肖邦幻想即兴曲 Op.66](https://noctavepiano.com/partitions/chopin-fantaisie-impromptu-op66/)：9页，CC0 1.0。
  Guy D. Lederfein / Mutopia Project；Noctave版。
- [拉赫玛尼诺夫前奏曲 Op.3 No.2](https://noctavepiano.com/en/sheet-music/rachmaninov-prelude-op3-2/)：4页，CC BY-SA4.0。
  Petro Kostandy / Mutopia Project；Noctave双谱表重排版，未测试历史四谱表版本。

原文件未改动，下载来源、时间、哈希和许可署名随本地报告保留。
原谱和逐行音符文件仅作为本地评测交付，没有新增公开曲库曲目。

## 文件与复算

本机交付：`output/密集复杂PDF识谱评测-20261021/`：
`report.md`、`results.csv`、`results.json`、`independent-verification.json`，
以及各样本的完整PDF、同版参考、抽页图和 `recognized-rows.json`。
隔离任务、首轮解析结果、失败和回退响应、usage位于
`.local/dense-pdf-benchmark-20261021/`，包含访问令牌的任务凭证留在忽略目录，不进入Git或交付包。

```bash
node scripts/report-dense-pdf-benchmark.mjs
python3 scripts/verify-dense-pdf-benchmark.py
node --test tests/dense-pdf-benchmark.test.mjs
```

新一轮测试应使用新目录，先保存三份PDF/MXL及 `sources.json`，再运行
`prepare-dense-pdf-benchmark.mjs <新目录>`、
`freeze-dense-pdf-reference.py <新目录>`、
`run-dense-pdf-benchmark.mjs <新目录>`。
准备器/参考冻结器适用于本文三份具体版本，其他谱面必须重新核对小节映射。
冻结后拒绝重新裁图或覆盖参考；已有任务的目录拒绝无提示重跑。
复跑前确认模型调用授权和当前模型策略，新结果不能沿用本次原图核对结论。

实际17个适配器调用、17个提供方请求，并发上限4；16次usage已知、1次未知。
已知input39702、output73743、totalTokens126245（各字段按提供方口径独立累加，不推算差值）。
墙钟15.6分钟，调用耗时相加43.3分钟；现金成本未知。

验证：16个谱行图像及参考哈希在新目录复现一致；Python独立计数与JS两阶段及回退评分一致；
新增5个评分测试通过，`npm run check` 431项测试与60首曲库校验通过。
