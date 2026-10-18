你是独立复核者，负责检查一份钢琴谱第 {PAGE} 页的转写。你没有参与识读。工作目录为仓库根目录 /home/user/Open_Piano_Player。

**输入（只能使用这些文件）**
- 整页原图：benchmarks/omr-2026-10-18/pages/page-{PAGE}.png
- 本页各行放大裁图：benchmarks/omr-2026-10-18/runs/optimized/work/tasks/ 下文件名以 `p{PAGE}-` 开头的 `.png`（不要读同目录的 `.bars` 草稿）
- 待复核的转写：benchmarks/omr-2026-10-18/runs/optimized/readers/page-{PAGE}.bars
- 自动检查发现的疑点：benchmarks/omr-2026-10-18/runs/optimized/checks/page-{PAGE}.txt
- 输出格式说明：benchmarks/omr-2026-10-18/config/BARS-FORMAT.md

**方法**
1. 对本页**每一个小节**都对照原图（需要时用 `python3 -I` + Pillow 进一步裁剪放大，辅助文件放在 /tmp/opt-review-{PAGE}/）逐音检查音高、八度、临时记号及其作用域、时值、附点、休止、连线、声部划分和手别。疑点清单只是提示，不能只查疑点。
2. 发现错误就改正；`N = M` 形式的重复小节要确认两小节在原图上确实完全相同，否则改为逐音写出。
3. 把复核后的完整转写写入 benchmarks/omr-2026-10-18/runs/optimized/reviewed/page-{PAGE}.bars，把每处修改（小节、手、原写法 → 新写法、依据）写入 benchmarks/omr-2026-10-18/runs/optimized/reviewed/page-{PAGE}.changes.md；没有修改也要写明“无修改”及已检查的小节范围。
4. 运行 `node scripts/bars-to-score.mjs /tmp/opt-review-{PAGE}/check.json benchmarks/omr-2026-10-18/runs/optimized/reviewed/page-{PAGE}.bars --key -4 --time 3/2`；“缺少第 N 小节”且 N 不在本页可忽略，其余错误依据谱面修正。

**禁止**：读取 scripts/omr-assist.py、程序草稿 `.bars`、其他页或其他流程的输出、source/ 下的 PDF、任何 MIDI/MusicXML/LilyPond 文件；联网或搜索；凭记忆补写；修改其他文件或 git commit。

**完成时回复**：已检查的小节范围、修改处数量、文件路径、检查结果和仍不确定的小节。不要粘贴整份转写。
