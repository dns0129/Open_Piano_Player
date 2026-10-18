# 独立验证曲目：Beethoven, Prelude in F minor, WoO 55

| 项目 | 内容 |
|---|---|
| 作品 | Ludwig van Beethoven, Prelude WoO 55（1787） |
| 排版来源 | Mutopia Project, maintainer Stelios Samelis, Mutopia-2007/03/24-939，据 Breitkopf & Härtel (1862–1865) |
| 授权 | Public Domain（LilyPond 源文件 header `copyright = "Public Domain"`） |
| 页面 | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=939 |
| PDF（A4） | https://www.mutopiaproject.org/ftp/BeethovenLv/WoO55/prelude_WoO55/prelude_WoO55-a4.pdf — sha256 `181ed719fbd2ccae56d743b7b91c2c87405d16b6081bc4eed1570f13447b0ace`，3 页 |
| MIDI（参考） | https://www.mutopiaproject.org/ftp/BeethovenLv/WoO55/prelude_WoO55/prelude_WoO55.mid — sha256 `8e12366d3faaf102e15fe5b269645650c73bdcacf3cee8fa07ca0a94729473c8` |
| LilyPond 源 | https://www.mutopiaproject.org/ftp/BeethovenLv/WoO55/prelude_WoO55/prelude_WoO55.ly — sha256 `e6958b14d80bdf7e6636b01ef534650cb478661bf80251991db6d917ec7811eb` |
| 下载时间 | 2026-10-18 08:12 UTC |

## 页清单（识谱输入，三组流程完全相同）

`pdftoppm -r 150 -png prelude_WoO55-a4.pdf page`，每页 1241×1754 像素：

| 页 | 文件 | sha256 前 16 位 |
|---|---|---|
| 1 | `pages/page-1.png` | 849facaad334a335 |
| 2 | `pages/page-2.png` | 16d3e6f794b64ad4 |
| 3 | `pages/page-3.png` | 272151467adf436e |

## 选择理由与限制

- 从未参与本项目任何调参或开发（仓库中此前没有出现 WoO 55）；识谱辅助工具在提交 `bc6dc13` 冻结后才选定此曲。
- 排版与开发集（Golden Hour，网易云图片，12/8、E 大调、每行 1 小节）明显不同：LilyPond 排版、3/2 拍、F 小调（4 个降号）、每行约 3 小节、两声部、行内换谱号。
- 参考数据来自同一 LilyPond 源生成的 MIDI：48 小节、882 个音符（右手 529、左手 353），连音线已合并，时值精确（无演奏缩短），起拍全部落在十六分音符网格上。
- **限制**：MIDI 与 PDF 出自同一源文件，二者一致性由 LilyPond 保证，但没有经过人工逐音独立核对；MIDI 不记录记谱拼写（如 G♯/A♭），因此评分以 MIDI 音高为准，不评拼写；两个声部同时奏同一音高时 MIDI 只保留一个音。
- 参考数据只在评分时读取；识谱流程只拿到 `pages/` 下的页图，没有拿到 PDF、MIDI 或 LilyPond 源（见运行日志中的输入清单）。
