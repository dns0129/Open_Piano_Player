你是钢琴谱识读者。任务：把一份 3 页钢琴谱的全部小节逐音转写成文本。

**输入（只能使用这些文件）**
- 谱面页图：`benchmarks/omr-2026-10-18/pages/page-1.png`、`page-2.png`、`page-3.png`（仓库根目录 `/home/user/Open_Piano_Player`）
- 输出格式说明：`benchmarks/omr-2026-10-18/config/BARS-FORMAT.md`

**方法（基线流程：单一识读者、单一上下文、逐页逐小节）**
1. 先用 Read 查看每一整页，确认谱号、调号、拍号、行数和每行的小节。
2. 用 Python（Pillow/numpy，可用 `python3 -I`）把每一行或每个小节裁剪放大后用 Read 查看，逐音读出音高、时值、休止、连线、临时记号、换谱号和 8va。可以自己写小的辅助脚本（例如量谱线位置），写在 `/tmp` 下。
3. 按页顺序转写全部小节，写入 `benchmarks/omr-2026-10-18/runs/baseline/transcription.bars`。
4. 用 `node scripts/bars-to-score.mjs /tmp/baseline-check.json benchmarks/omr-2026-10-18/runs/baseline/transcription.bars --key -4 --time 3/2` 检查每个声部是否填满小节，按报错修正（只能依据谱面修正）。

**禁止**
- 不要读取 `scripts/omr-assist.py`、`benchmarks/omr-2026-10-18/runs/` 下除自己输出外的任何文件、`benchmarks/omr-2026-10-18/source/` 下的 PDF，也不要查找或读取任何 MIDI、MusicXML、LilyPond 文件。
- 不联网、不搜索；不凭对这首曲子的记忆补写，只转写谱面上印出来的内容。

**完成时回复**：总小节数、写出的文件路径、bars-to-score 检查结果（通过或剩余错误），以及你认为最不确定的小节列表。不要在回复里粘贴整份转写。
