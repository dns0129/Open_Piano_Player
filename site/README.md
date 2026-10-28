# 琴伴 · 宣传网站

独立的静态宣传页，不参与 App 的 Vite 构建。页面讲三件事，配图都是琴伴本身的截图：

1. **识谱**：照片 / PDF 逐行识别成数字谱，再导出 MIDI。用三张实机截图说明：找出谱行、在原谱上对照播放、导出窗口。
2. **MusicXML 转 MIDI**：在浏览器里真实转换。拖入 `.musicxml` / `.xml`，或点两个示例，得到可试听、可下载的 MIDI，文件不上传。
3. **跟谱播放**：用 VexFlow 绘制的《欢乐颂》16 小节，逐音高亮、自动翻行、点音符定位、20–300 BPM 变速；旁边是简谱视图和手机上的实机截图。

视觉上是一张练琴的书桌：纸张底纹和淡淡的五线谱纸，截图像打印出来用胶带贴住，老师式的红铅笔圈注（`site.js` 里的 `MARKS`，坐标是图片宽高的比例，滚动到时逐笔画出）。开头是《致爱丽丝》原谱的第一行，点「听第一行」会播放这一行，荧光笔和铅笔线跟着声音走。三个部分按乐章写成 I Adagio / II Presto / III A tempo，段落之间是缓慢移动的巴赫、肖邦谱条，结尾是 Fine 和终止线。手写批注用系统自带的手写体（手札体、翩翩体、楷体），没有的系统退回宋体。

## 本地预览

页面通过 `fetch` 加载钢琴采样和示例文件，需要用 HTTP 打开：

```sh
python3 -m http.server 8817 --directory site
```

然后打开 `http://127.0.0.1:8817/`。浏览器要求先有一次点击或按键才能发声。

## 截图

`npm run site:shots`（`scripts/capture-site-shots.mjs`，需本机 Chrome 和 Node ≥ 21）用无界面 Chrome 和一次性配置目录重新截取 `assets/shots/`：

- 公开网页版：《致爱丽丝》播放中的五线谱、简谱、导出窗口和手机视图；识谱得到的 BWV 846 叠在原谱上播放。
- 本机版（`QINBAN_URL`，默认 `http://127.0.0.1:8792/`）：导入肖邦 Op.28 No.7 PDF 后的谱行预览。只打开预览，不开始识谱，不会写入 `.local/`；本机服务没开时跳过，保留已有截图；先用 `启动琴伴.command` 或 `npm start` 打开本机版再截。

可以只截某一部分：`node scripts/capture-site-shots.mjs desktop source phone local`。

## MusicXML → MIDI 的范围

`assets/site.js` 中的 `parseMusicXML` / `writeMidi`（也挂在 `window.LepuConvert`）处理 partwise MusicXML：和弦、`backup` / `forward`、连音（按 `<duration>`）、连线、速度与力度标记；每个声部的每个谱表输出一条 MIDI 轨（钢琴即右手、左手两轨），480 ticks / 四分音符。倚音不计入，反复记号按书写顺序，不展开。压缩的 MXL 请在 App 中导入。

核对结果：《野蜂飞舞》示例转出的 1,313 个音（右手 814、左手 499）与 App 导出的 `output/scores/野蜂飞舞-Yeung-完整7页.mid` 逐音一致（音高、起始 tick、时值）；`public/guitar-beginner-sources/` 的 8 个 MusicXML 与各自随附的 MIDI 也逐音一致。

## 其他素材

`npm run site:assets`（`scripts/build-site-assets.mjs`，pdf.js 需要 Node ≥ 22）生成：

- `assets/img/ink-*.webp`：从曲库的 Mutopia 原版 PDF 裁出的谱面，只留墨迹、染成墨绿色、背景透明：《致爱丽丝》开头两行（首屏）、巴赫《二部创意曲》第 8 首和肖邦 Op.28 No.7 各一行（段落间谱条）。
- `assets/scores.js`：首屏那一行的音符（取自 `score-repo/` 里的同一首曲子）和铅笔线在图上的位置。
- `assets/samples/`：《野蜂飞舞》为 App 导出的 MusicXML 原文件，《欢乐颂》由脚本按公版旋律写出。
- `assets/img/bee-page.webp`：《野蜂飞舞》原谱首页缩略图，取自本机未入库的 `evidence/` 原 PDF，缺失时保留已提交的图片。
- `assets/vendor/vexflow-core.js`（VexFlow 5，MIT）、`assets/fonts/Bravura.woff2`（SIL OFL 1.1，见 `OFL.txt`）、`assets/favicon.svg`（App 图标）。
- `assets/audio/piano/`：Salamander Grand Piano 的 22 个原始 MP3，CC BY 3.0，归属见同目录 `ATTRIBUTION.txt`。

曲目许可：《致爱丽丝》、BWV 779、BWV 846、Op.28 No.7 的 Mutopia 排版为公有领域；《野蜂飞舞》为 Kevin W. K. Yeung 钢琴编配，CC BY-SA 3.0（IMSLP）。

## 部署

推送到 `main` 后，`.github/workflows/pages.yml` 在构建 App 网页版之后把本目录原样复制到 `dist-pages/site/`，发布在 https://dns0129.github.io/Open_Piano_Player/site/ 。整个目录也可直接放到任意其他静态托管。
