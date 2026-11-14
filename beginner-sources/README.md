# 初级钢琴曲目来源与授权

两批共 20 首素材取自 Mutopia Project（2026-10-20 下载）。逐曲原始地址、文件 SHA-256、排版署名与许可见仓库 `score-repo/beginner-sources.json`。每个子目录保留原始 MIDI、LilyPond 和 PDF，均未修改。云端搜索“第2批”可单独查看新加入的 10 首。

## 第一批

| 曲目 | Mutopia ID | 排版 | 素材与衍生数字谱许可 |
| --- | --- | --- | --- |
| 舒曼：旋律 Op.68 No.1 | 647 | Philippe Hézaine | CC BY-SA 2.5 |
| 舒曼：士兵进行曲 Op.68 No.2 | 650 | Philippe Hézaine | CC BY-SA 2.5 |
| 舒曼：哼唱曲 Op.68 No.3 | 651 | Philippe Hézaine | CC BY-SA 3.0 |
| 舒曼：圣咏 Op.68 No.4 | 782 | Philippe Hézaine | CC BY-SA 2.5 |
| 舒曼：小曲 Op.68 No.5 | 653 | Philippe Hézaine | CC BY-SA 2.5 |
| 舒曼：可怜的孤儿 Op.68 No.6 | 687 | Philippe Hézaine | CC BY-SA 2.5 |
| 舒曼：民歌 Op.68 No.9 | 675 | Philippe Hézaine | CC BY-SA 2.5 |
| 舒曼：快乐的农夫 Op.68 No.10 | 659 | Philippe Hézaine | CC BY-SA 2.5 |
| 布格缪勒：坦诉 Op.100 No.1 | 202 | Bas Wassink | Public Domain |
| 布格缪勒：阿拉伯风格曲 Op.100 No.2 | 203 | Bas Wassink | Public Domain |

## 第二批

第二批以初级进阶为主，适合在第一批曲目之后继续学习。

| 曲目 | Mutopia ID | 排版 | 素材与衍生数字谱许可 |
| --- | --- | --- | --- |
| 舒曼：猎人之歌 Op.68 No.7 | 691 | Philippe Hézaine | CC BY-SA 3.0 |
| 舒曼：西西里舞曲 Op.68 No.11 | 783 | Philippe Hézaine | CC BY-SA 2.5 |
| 舒曼：五月，可爱的五月 Op.68 No.13 | 662 | Philippe Hézaine | CC BY-SA 2.5 |
| 舒曼：初次的悲伤 Op.68 No.16 | 676 | Philippe Hézaine | CC BY-SA 2.5 |
| 舒曼：收割者之歌 Op.68 No.18 | 663 | Philippe Hézaine | CC BY-SA 2.5 |
| 布格缪勒：牧歌 Op.100 No.3 | 218 | Bas Wassink | Public Domain |
| 布格缪勒：天真 Op.100 No.5 | 214 | Bas Wassink | Public Domain |
| 布格缪勒：前进 Op.100 No.6 | 215 | Bas Wassink | Public Domain |
| 布格缪勒：优美 Op.100 No.8 | 217 | Bas Wassink | Public Domain |
| 布格缪勒：娇嫩的花朵 Op.100 No.10 | 221 | Bas Wassink | Public Domain |

许可：[CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/)、[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)、[Mutopia 许可说明](https://www.mutopiaproject.org/legal.html)。原作公共领域不意味着所有排版都没有附加许可；这里按每个具体版本保留署名及相同方式共享条款。这些曲目数据的许可独立于 App 代码许可。

琴伴的改动：从原 MIDI 导入实际音高、节奏、力度和速度，并依据 upper/lower 音轨确定双手，生成 v2 文档和练习投影。MIDI 中反复段已展开；音名拼写、声部、休止及延音音头是推断数据，不等同于原 PDF 排版。指法、连奏线、表情与原页定位以随附 PDF / LilyPond 为准。本批覆盖初级至初级进阶，难度标签是编选建议，不是考试等级认证。

在仓库根目录执行 `node scripts/import-beginner-scores.mjs` 可离线重建曲库包；附加 `--local` 可接入本机曲库，已有同 ID 曲目保留。
