# 琴伴 · 互动产品首页与使用指南

独立的静态网站，不参与 App 的 Vite 构建。首页让访客直接听谱、练习和校对；使用指南保留具体操作说明。发布时整个 `site/` 目录会原样复制到 App 网页版的 `/site/` 下。

- **首页 `index.html`**：标题为「拍下一页谱，从这一小节开始练。」首屏是《欢乐颂》前四小节双手谱。点「听这段谱」后，音符、小节、播放线和下方琴键一起回应；同一张谱可切换五线谱、简谱和钢琴卷帘，选择双手、右手或左手，切换慢速与原速，并循环第 2–3 小节。下方用 BWV 846 原谱演示选行、校对、试听，再用《欢乐颂》演示将第一拍 E4 改为 C4 · E4 · G4 三和弦、比较修改前后、撤销及打印 A4 练习谱。旧版功能卡片、案例瀑布流和「玩一下」已由这条连续体验替换。
- **使用指南 `guide.html`（对内，讲怎么用）**：按步骤讲三件事，配图都是琴伴本身的截图——
  1. **识谱**：照片 / PDF 逐行识别成数字谱，再导出 MIDI：找出谱行、在原谱上对照播放、导出窗口。
  2. **MusicXML 转 MIDI**：在浏览器里真实转换。拖入 `.musicxml` / `.xml`，或点两个示例，得到可试听、可下载的 MIDI，文件不上传。
  3. **跟谱播放**：用 VexFlow 绘制的《欢乐颂》16 小节，逐音高亮、自动翻行、点音符定位、20–300 BPM 变速；旁边是简谱视图和手机上的实机截图。

  开头是《致爱丽丝》原谱的第一行，点「听第一行」会播放这一行，荧光笔和铅笔线跟着声音走。脚本 `assets/guide.js`、样式 `assets/guide.css`。

首页保留暖纸色 `#F3EEE1`、谱纸 `#FCFAF3`、墨色 `#1F2A22`、深绿 `#234F3E`、左手铜色 `#A4735E` 和校对红 `#B4452F`。`assets/home.css` 提供基础布局，`assets/dynamic-home.css` 负责动态视觉层：标题以宋体与局部毛笔字形成层次，正文和操作标签保持清晰的无衬线字体；首屏谱线缓缓流动，标题与谱纸依次入场，下方区块随原生滚动展开。鼠标推动墨绿与铜色液墨，按住时加深，松手后继续回旋并消散。

使用指南继续加载 `assets/paper.css` 和 `assets/paper.js`，保留谱纸（`.ruled`）、胶带截图（`.photo`）、乐章标题（`.movement`）、谱条（`.strip`）、终止线（`.fine-mark`）及红铅笔批注。其脚本中的 `MARKS` 按 `data-notes` 绘制圈线、箭头和手写字；手写体使用系统字体，缺失时退回宋体。

## 首页实现与交互

| 文件                       | 职责                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `assets/home.js`           | 连接首屏练习、原谱对照、改编、A4 预览及可访问的页面状态；所有片段共用一个播放器实例                                             |
| `assets/practice-audio.js` | `PracticeAudio`：以同一拍位和 AudioContext 时钟调度钢琴采样、暂停、定位、变速、分手、循环与单音试听                             |
| `assets/practice-score.js` | `PracticeScore`：用 VexFlow / Bravura 绘制真实五线谱，并将同一音符数据映射到简谱、钢琴卷帘、音符高亮和播放线                    |
| `assets/practice-data.js`  | 《欢乐颂》四小节及项目左手伴奏、BWV 846 前两行、原谱区域与可重置的示例疑点；由 `scripts/build-practice-data.mjs` 从项目素材生成 |
| `assets/pencil-trail.js`   | `initPencilTrail()`：WebGL2 液墨的速度场、染料平流与回旋；无 WebGL2 时使用 Canvas2D 流动降级，返回清理函数                      |
| `assets/page-motion.js`    | `initPageMotion()`：标题和谱纸入场、滚动显现、装饰谱线与播放状态反馈；不改变乐谱拍位或音符坐标                                  |
| `assets/dynamic-home.css`  | 本地毛笔字子集、字体层次、装饰与过渡、移动端和减少动态效果适配                                                                  |
| `assets/home.css`          | 桌面与手机布局、谱面状态、键盘、练习设置和 A4 打印样式                                                                          |

桌面端左侧是标题和播放入口，右侧是较大的互动谱面。手机端优先呈现标题、播放入口和第一行谱；声部、速度和循环放在「练习设置」中。点音符可试听，点小节编号可定位。切换读法和速度保留当前拍位；分手操作改变实际发声，并用文字和淡化状态标明另一只手。第 2–3 小节循环对应 `[4, 12)` 拍，选到循环外的小节会退出循环。

首次发声需要用户点击。采样预取不启动声音；加载中或失败时显示状态，谱面和手动定位仍可操作。切换示例会停止前一个片段，切到后台会暂停并取消尚未完成的播放意图。声音只使用项目的钢琴录音采样，不以合成音冒充采样加载成功。

液墨画布不接收点击，不改变按钮或触屏滚动；仅对精细指针的 mouse / pen 启用，墨迹散尽后停止动画帧。切到后台时暂停装饰运动。系统开启「减少动态效果」时关闭液墨、持续装饰动画和入场过渡，页面内容直接可见，谱面直接更新位置与高亮。键盘焦点、声部文字和按钮状态保留。

原谱对照台明确标为「识谱流程演示」「示例乐谱」。访客可选择 BWV 846 的前两行，将第一行特意设置的 F5 疑点修正为 E5，再试听或重置。它使用已有项目数据演示校对，不上传文件、不调用识谱服务。

改编区将《欢乐颂》第一拍的右手单音变为三和弦。修改前后试听互相独占声音，撤销会恢复数字谱和打印内容。A4 预览显示当前编辑版本，使用浏览器打印可保存为 PDF；MusicXML、MIDI、JSON 导出通过琴伴练习室完成。

## 入口与能力边界

- 公开练习室：<https://dns0129.github.io/Open_Piano_Player/>。静态网页版提供曲库练习、数字谱导入、编辑和导出。
- 使用自己的照片 / PDF：首页链接到 `guide.html#scan`。先启动已配置识谱服务的琴伴本机完整版，再选择「导入乐谱 → 上传本地乐谱」，检查谱行后开始识别；已部署的账号版使用其「上传识谱」入口。
- 静态首页和 GitHub Pages 练习室不执行照片 / PDF 识别。源码中存在商业账号版不代表已有正式托管服务，首页不构造未经核验的商业版网址。

## 本地预览

在仓库根目录执行。项目要求 Node.js ≥ 22.19，推荐使用 `.nvmrc` 指定的版本。首页资源已随仓库提供，无需先运行 App 的 Vite 构建；页面使用 ES module 并通过 `fetch` 加载采样，需要用 HTTP 打开：

```sh
npm ci
python -m http.server 8817 --directory site
```

然后打开 `http://127.0.0.1:8817/`（首页）或 `http://127.0.0.1:8817/guide.html`（使用指南）。浏览器要求先有一次点击或按键才能发声。

## 首页验收

安装项目依赖后，单元测试与浏览器检查可以分别运行：

```sh
node --test tests/site-*.test.mjs
npx playwright install chromium
node scripts/check-homepage.mjs
node scripts/check-homepage-audio.mjs
```

前后台暂停检查会另外打开有界面的 Chromium，并核对浏览器真实发出的可见性事件。在没有桌面的 Linux 环境中，请安装 `xvfb`、`xauth` 和 `openbox`，然后用下面的命令运行首页检查（音频检查仍可直接运行）：

```sh
xvfb-run -a --server-args="-screen 0 1600x1200x24" bash -c 'openbox >/tmp/qinban-homepage-openbox.log 2>&1 & exec node scripts/check-homepage.mjs'
```

两个浏览器检查脚本会各自启动临时 HTTP 服务，无需另开上面的预览服务器。Linux CI 如缺少浏览器系统依赖，可使用 `npx playwright install --with-deps chromium`。需要指定已有浏览器时，两个脚本均接受 `QINBAN_CHROMIUM`。

验收包括：

1. 桌面与约 375px 宽手机各走一次「播放 → 简谱 → 左手 → 慢一点 → 循环第 2–3 小节 → 暂停」，检查实际声部、音符、琴键和拍位一致；另检查小节定位、单音试听及其他读法。
2. 选择原谱的两行，修正并重置示例疑点，试听当前数字谱；将单音改为三和弦，对比修改前后，撤销并检查 A4 内容。
3. 检查页面无整体横向溢出、触控尺寸、焦点、减少动态效果、字体实际加载和入口；核对液墨出现、松手后的持续变化及最终消散，并录制实际操作短片；打印产物需按真实 A4 内容复核。
4. 用真实 Chromium 解码 MP3，并通过 OfflineAudioContext 渲染和实时 AudioContext / Analyser 检查钢琴声音；单元测试覆盖拍位连续、循环边界、声部分离及采样加载竞争。

`scripts/check-homepage.mjs` 的截图、A4 PDF 与 `report.json` 写入 `output/homepage/`；`scripts/check-homepage-audio.mjs` 的 WAV 和测量报告写入 `output/homepage-audio/`。GitHub Actions 的 **Homepage experience** 工作流运行这些检查，并将上述目录作为 `homepage-acceptance` 产物保留。结果以对应提交的实际工作流日志与产物为准；本说明不代表浏览器验收已经通过。环境不能启动浏览器时，应记录检查受阻，不能用单测通过替代浏览器结果。

## 截图

`npm run site:shots`（`scripts/capture-site-shots.mjs`，需本机 Chrome 和 Node ≥ 21）用无界面 Chrome 和一次性配置目录重新截取 `assets/shots/`：

- 公开网页版：《致爱丽丝》播放中的五线谱、简谱、导出窗口和手机视图；识谱得到的 BWV 846 叠在原谱上播放。
- 本机版（`QINBAN_URL`，默认 `http://127.0.0.1:8792/`）：导入肖邦 Op.28 No.7 PDF 后的谱行预览。只打开预览，不开始识谱，不会写入 `.local/`；本机服务没开时跳过，保留已有截图；先用 `启动琴伴.command` 或 `npm start` 打开本机版再截。

可以只截某一部分：`node scripts/capture-site-shots.mjs desktop source phone local`。

## 宣传视频

`video/qinban-promo.mp4`：30 秒，1920×1080，配乐《致爱丽丝》开头。依次讲：标题 → 拍照 / PDF 逐行识谱 → 跟谱播放 → 五线谱、简谱、手机三种视图 → 九项练习、改编、导出功能 → 结尾网址。场景切换都卡在小节线上。

画面是 `video/promo.html`，用 `window.seek(t)` 逐帧绘制，用的是上面的实机截图和 `img/ink-elise.webp`；曲谱和时间点在 `video/score.js`，画面和混音共用这一份。重新生成：

```sh
FFMPEG=/path/to/ffmpeg node scripts/render-promo-video.mjs
```

需本机 Chrome、带 libx264 的 ffmpeg（已在 PATH 上可省略 `FFMPEG=`）和 Node ≥ 21。钢琴声取自 `assets/audio/piano/` 的 Salamander 采样（CC BY 3.0，片尾已署名）。加 `--stills 2,9.6,14 --out 目录` 只截这几个时间点的 PNG，方便检查画面。要按实际速度无声预览，开本地预览后访问 `/video/promo.html`，`?t=12.3` 停在单帧。

## MusicXML → MIDI 的范围

`assets/guide.js` 中的 `parseMusicXML` / `writeMidi`（也挂在 `window.LepuConvert`）处理 partwise MusicXML：和弦、`backup` / `forward`、连音（按 `<duration>`）、连线、速度与力度标记；每个声部的每个谱表输出一条 MIDI 轨（钢琴即右手、左手两轨），480 ticks / 四分音符。倚音不计入，反复记号按书写顺序，不展开。压缩的 MXL 请在 App 中导入。

核对结果：《野蜂飞舞》示例转出的 1,313 个音（右手 814、左手 499）与 App 导出的 `output/scores/野蜂飞舞-Yeung-完整7页.mid` 逐音一致（音高、起始 tick、时值）；`public/guitar-beginner-sources/` 的 8 个 MusicXML 与各自随附的 MIDI 也逐音一致。

## 其他素材

`npm run site:assets`（`scripts/build-site-assets.mjs`，pdf.js 需要 Node ≥ 22）生成：

- `assets/img/ink-*.webp`：从曲库的 Mutopia 原版 PDF 裁出的谱面，只留墨迹、染成墨绿色、背景透明：《致爱丽丝》开头两行用于指南首屏等素材，巴赫《二部创意曲》第 8 首和肖邦 Op.28 No.7 各一行用于谱条。
- `assets/scores.js`：使用指南首屏那一行的音符（取自 `score-repo/` 里的同一首曲子）和铅笔线在图上的位置。
- `assets/cases.js`：保留的旧版首页案例素材，从曲库原样导出（《野蜂飞舞》取自 `output/scores/`，其余取自 `score-repo/scores/`），只截取片段，统计数字按整首计算；当前互动首页不加载此文件。
- `assets/samples/`：《野蜂飞舞》为 App 导出的 MusicXML 原文件，《欢乐颂》由脚本按公版旋律写出。
- `assets/img/bee-page.webp`：《野蜂飞舞》原谱首页缩略图，取自本机未入库的 `evidence/` 原 PDF，缺失时保留已提交的图片。
- `assets/vendor/vexflow-core.js`（VexFlow 5，MIT）、`assets/fonts/Bravura.woff2`（SIL OFL 1.1，见 `OFL.txt`）、`assets/favicon.svg`（App 图标）。
- `assets/audio/piano/`：Salamander Grand Piano 的 22 个原始 MP3，CC BY 3.0，归属见同目录 `ATTRIBUTION.txt`。

曲目许可：《致爱丽丝》、BWV 779、BWV 846、Op.28 No.7 的 Mutopia 排版为公有领域；《野蜂飞舞》为 Kevin W. K. Yeung 钢琴编配，CC BY-SA 3.0（IMSLP）。

新首页使用的《欢乐颂》教学伴奏、BWV 846 原谱 PDF / 页面图与数字谱、VexFlow / Bravura 和 Salamander 钢琴采样均沿用项目素材。原谱页面和可交互数据由 `node scripts/build-practice-data.mjs` 准备，来源、范围与许可详见 [首页素材来源与许可](assets/HOMEPAGE-SOURCES.md)；音频的 `ATTRIBUTION.txt`、`LICENSE.txt` 和字体的 `OFL.txt` 保留。需要产品截图时优先复用 `assets/shots/`，现有指南和宣传视频仍使用这些素材。

## 部署

推送到 `main` 并通过 **Engineering checks** 后，`.github/workflows/pages.yml` 在构建 App 网页版之后把本目录原样复制到 `dist-pages/site/`，首页发布在 <https://dns0129.github.io/Open_Piano_Player/site/>，使用指南在 <https://dns0129.github.io/Open_Piano_Player/site/guide.html>。整个目录也可直接放到其他静态托管；保持相对资源路径即可。
