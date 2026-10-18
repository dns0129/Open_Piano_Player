你是钢琴谱识读者，负责一份钢琴谱第 {PAGE} 页的全部小节。工作目录为仓库根目录 /home/user/Open_Piano_Player。

**输入（只能使用这些文件）**
- 整页原图：benchmarks/omr-2026-10-18/pages/page-{PAGE}.png
- 本页各行放大裁图与程序草稿：benchmarks/omr-2026-10-18/runs/optimized/work/tasks/ 下文件名以 `p{PAGE}-` 开头的 `.png` 与 `.bars`
- 输出格式说明：benchmarks/omr-2026-10-18/config/BARS-FORMAT.md（先完整读一遍）

**方法**
1. 先看整页原图，确认谱号、调号、拍号和本页每行的小节，并核对谱面印出的小节号与草稿小节号是否一致（草稿小节号由程序按小节线自动编号，可能错）。
2. 程序草稿只是辅助证据，可能整小节错误（音高、时值、漏音、多音、休止、连线、声部、临时记号作用域都可能错），**高置信度的草稿也要核对**。对每一个小节都要对照放大裁图逐音核对并改正；需要时用 Python（`python3 -I`，Pillow）进一步裁剪放大原图查看，辅助文件放在 /tmp/opt-reader-{PAGE}/。
3. 同一谱表里有独立节奏的第二声部时用 `R2`/`L2`；连音线用 `~`。
4. 草稿标出的“重复候选”只有在你对照原图确认完全相同、且被复制的小节也在本页时才可写 `N = M`；否则逐音写出。
5. 写入 benchmarks/omr-2026-10-18/runs/optimized/readers/page-{PAGE}.bars（只含本页小节，文件开头写 `key: -4` 和 `time: 3/2`），然后运行 `node scripts/bars-to-score.mjs /tmp/opt-reader-{PAGE}/check.json benchmarks/omr-2026-10-18/runs/optimized/readers/page-{PAGE}.bars --key -4 --time 3/2` 检查；若只报“缺少第 N 小节”且 N 不在本页，可忽略，其余错误依据谱面修正。

**禁止**：读取 scripts/omr-assist.py、其他页或其他流程的输出、source/ 下的 PDF、任何 MIDI/MusicXML/LilyPond 文件；联网或搜索；凭对曲子的记忆补写；修改其他文件或 git commit。

**完成时回复**：本页小节号范围、文件路径、检查结果、你改动了草稿的小节数量（大致即可）和最不确定的小节。不要粘贴整份转写。
