# 琴伴 · 宣传网站

独立的静态宣传站，不参与 App 的 Vite 构建。两页用同一套纸面风格：

- **首页 `index.html`（对外，展示功能）**：开头是一条横贯全屏、能用鼠标或手指拨响的五线谱，「让五线谱弹一句」会在上面弹《欢乐颂》；接着是关键数字、四步产品流程（I Moderato）、每张都能出声的功能卡片（II Vivace：三种视图、变速、分手、小节循环、移调、和弦替换、演奏效果、大小调、打印）、曲库原样数据的瀑布流案例（III Cantabile）和「玩一下」（IV Scherzo：自由弹奏、下落挑战、哼一句）。脚本 `assets/home.js`、样式 `assets/home.css`，案例数据 `assets/cases.js`。
- **使用指南 `guide.html`（对内，讲怎么用）**：按步骤讲三件事，配图都是琴伴本身的截图——
  1. **识谱**：照片 / PDF 逐行识别成数字谱，再导出 MIDI：找出谱行、在原谱上对照播放、导出窗口。
  2. **MusicXML 转 MIDI**：在浏览器里真实转换。拖入 `.musicxml` / `.xml`，或点两个示例，得到可试听、可下载的 MIDI，文件不上传。
  3. **跟谱播放**：用 VexFlow 绘制的《欢乐颂》16 小节，逐音高亮、自动翻行、点音符定位、20–300 BPM 变速；旁边是简谱视图和手机上的实机截图。

  开头是《致爱丽丝》原谱的第一行，点「听第一行」会播放这一行，荧光笔和铅笔线跟着声音走。脚本 `assets/guide.js`、样式 `assets/guide.css`。

共用的纸面风格在 `assets/paper.css` 和 `assets/paper.js`：纸张底纹和淡淡的五线谱纸（`.ruled`）、打印出来用胶带贴住的截图（`.photo`）、乐章式标题（`.movement`）、缓慢移动的巴赫 / 肖邦谱条（`.strip`）、Fine 和终止线（`.fine-mark`），以及老师式的红铅笔批注：两页脚本里的 `MARKS` 按 `data-notes` 标出圈、下划线、箭头和手写字，坐标是被标注元素宽高的比例，滚动到时逐笔画出。手写批注用系统自带的手写体（手札体、翩翩体、楷体），没有的系统退回宋体。两页的颜色一致：右手墨绿、左手铜色、批注红铅笔。

## 本地预览

页面通过 `fetch` 加载钢琴采样和示例文件，需要用 HTTP 打开：

```sh
python3 -m http.server 8817 --directory site
```

然后打开 `http://127.0.0.1:8817/`（首页）或 `http://127.0.0.1:8817/guide.html`（使用指南）。浏览器要求先有一次点击或按键才能发声。

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

- `assets/img/ink-*.webp`：从曲库的 Mutopia 原版 PDF 裁出的谱面，只留墨迹、染成墨绿色、背景透明：《致爱丽丝》开头两行（首屏）、巴赫《二部创意曲》第 8 首和肖邦 Op.28 No.7 各一行（段落间谱条）。
- `assets/scores.js`：使用指南首屏那一行的音符（取自 `score-repo/` 里的同一首曲子）和铅笔线在图上的位置。
- `assets/cases.js`：首页案例的片段，从曲库原样导出（《野蜂飞舞》取自 `output/scores/`，其余取自 `score-repo/scores/`），只截取片段，统计数字按整首计算。
- `assets/samples/`：《野蜂飞舞》为 App 导出的 MusicXML 原文件，《欢乐颂》由脚本按公版旋律写出。
- `assets/img/bee-page.webp`：《野蜂飞舞》原谱首页缩略图，取自本机未入库的 `evidence/` 原 PDF，缺失时保留已提交的图片。
- `assets/vendor/vexflow-core.js`（VexFlow 5，MIT）、`assets/fonts/Bravura.woff2`（SIL OFL 1.1，见 `OFL.txt`）、`assets/favicon.svg`（App 图标）。
- `assets/audio/piano/`：Salamander Grand Piano 的 22 个原始 MP3，CC BY 3.0，归属见同目录 `ATTRIBUTION.txt`。

曲目许可：《致爱丽丝》、BWV 779、BWV 846、Op.28 No.7 的 Mutopia 排版为公有领域；《野蜂飞舞》为 Kevin W. K. Yeung 钢琴编配，CC BY-SA 3.0（IMSLP）。

## 部署

推送到 `main` 后，`.github/workflows/pages.yml` 在构建 App 网页版之后把本目录原样复制到 `dist-pages/site/`，首页发布在 https://dns0129.github.io/Open_Piano_Player/site/ ，使用指南在 https://dns0129.github.io/Open_Piano_Player/site/guide.html 。整个目录也可直接放到任意其他静态托管。
