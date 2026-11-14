# 琴伴互动首页：曲谱、声音与素材来源

## 《欢乐颂》前四小节

- 作曲：Ludwig van Beethoven（路德维希·范·贝多芬）。原曲旋律为公有领域。
- 数字谱：复用项目现有 `site/assets/samples/ode-to-joy.musicxml` 的双手教学编配，未将其声称为贝多芬原版钢琴谱。
- 按项目的 MusicXML 导入器提取前 16 拍：右手 15 个事件、左手 8 个二分音符，原速 100 BPM。左手 MIDI 音高依次为 48、55、43、50、48、55、43、50。
- 生成数据保留原时值、附点、左右手和音高；简谱、五线谱、卷帘和试听使用同一份数据。

## 巴赫《C 大调前奏曲》BWV 846

- 作曲：Johann Sebastian Bach（约翰·塞巴斯蒂安·巴赫）。排版：Tobias Erbsland。
- 来源：[Mutopia #5](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=5)，版本 `Mutopia-2011/09/12-5`，LilyPond 2.14.2。
- 许可：Public Domain。原 PDF 的第二页页脚明确说明排版者将该乐谱置于公有领域；此处保留完整两页 PDF 和其署名。
- 原谱：`samples/bwv846-source.pdf`，来自上述条目的 [A4 PDF](https://www.mutopiaproject.org/ftp/BachJS/BWV846/wtk1-prelude1/wtk1-prelude1-a4.pdf)。`samples/bwv846-page1.webp` 只是第一页的等比例栅格化，未改写音符。
- 数字谱：`score-repo/scores/full-score-7e87728f60040aa1f7178325cebffac4e8ad.json`，项目已有的逐行人工审核版本。展示时以 72 BPM 慢放；该项目源数据设定为 96 BPM。
- 谱行对应经原 PDF 目视核对：第一页第一行是第 1–3 小节（原曲第 0–12 拍），第二行是第 4–6 小节（第 12–24 拍）。每行含 48 个播放事件，延音按已审核数据合并。图片上的矩形以 PDF 实际几何位置标定，不是估算音符位置。
- 2026-11-14 使用源站同版本 [MIDI](https://www.mutopiaproject.org/ftp/BachJS/BWV846/wtk1-prelude1/wtk1-prelude1.mid) 独立核对：前六小节共 96 个事件的音高、拍位、时值、左右手逐项一致。没有用 MIDI 替换项目数字谱。
- 校对示例故意把第 1 小节第 2 拍的右手 E5（MIDI 76）显示为 F5（MIDI 77），点击后恢复原谱。此处为**可重置的教学疑点**，不是新上传、实时识谱或模型准确率展示；导出的标准数据始终保留正确音符。

### 文件核验

| 文件                    | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| 原始 A4 PDF             | `b1c5be9fb63954df9c1a3e7b651ae930c4e5e332a5ab3e14b197379cfa04c35a` |
| 项目已审核 BWV 846 JSON | `129e4a28a0f55318063714aa12368b8456db9ab4c28e23f207ec498c6d8bd1cb` |
| 项目《欢乐颂》MusicXML  | `9c9297140ad7ecfc066295ee94435b4d8327843d4644812673f5f1c2f5160362` |

## 钢琴采样、谱号与产品截图

- 钢琴：Salamander Grand Piano，Alexander Holm，Yamaha C5 录音，[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。使用项目 `assets/audio/piano/` 中已随库分发的 MP3；原始分发版本、作者和处理说明保留于 [ATTRIBUTION.txt](audio/piano/ATTRIBUTION.txt)。按最近采样根音移调和包络播放。未声称其他型号钢琴的实录。
- 记谱：项目已有 VexFlow 5（MIT）和 Bravura（SIL Open Font License 1.1）；字体授权见 [OFL.txt](fonts/OFL.txt)。
- 产品截图优先复用项目 `assets/shots/` 的真实琴伴界面，包括五线谱、简谱、原谱对照与导出窗口。首页的可交互乐谱由实际数据渲染。

## 重建

安装项目依赖后运行：

```sh
node scripts/build-practice-data.mjs
```

脚本从已提交的源 PDF、原有 MusicXML 和已审核 JSON 生成 `practice-data.js` 与第一页图片。PDF 的 SHA-256 发生变化时会停止，要求重新核对谱行映射。可选传入同版本发布者 MIDI 做独立对照：

```sh
node scripts/build-practice-data.mjs --verify-midi /path/to/wtk1-prelude1.mid
```
