# 乐谱 · 宣传网站

独立的静态宣传页，不参与 App 的 Vite 构建。名称「乐谱」为暂定名。页面只讲三件事：

1. **乐谱转 MIDI**：照片 / PDF 识谱过程的演示动画，结束后可播放并下载真实生成的双轨 MIDI。
2. **MusicXML 转 MIDI**：在浏览器里真实转换。拖入 `.musicxml` / `.xml`（或用两个示例），得到可试听、可下载的 MIDI，文件不上传。
3. **在线跟随播放**：《欢乐颂》16 小节，五线谱 / 简谱逐音高亮、自动翻行，点音符定位，20–300 BPM 变速。

## 本地预览

页面通过 `fetch` 加载钢琴采样和示例文件，需要用 HTTP 打开：

```sh
python3 -m http.server 8817 --directory site
```

然后打开 `http://127.0.0.1:8817/`。浏览器要求先有一次点击或按键才能发声。

## MusicXML → MIDI 的范围

`assets/site.js` 中的 `parseMusicXML` / `writeMidi`（也挂在 `window.LepuConvert`）处理 partwise MusicXML：和弦、`backup` / `forward`、连音（按 `<duration>`）、连线、速度与力度标记；每个声部的每个谱表输出一条 MIDI 轨（钢琴即右手、左手两轨），480 ticks / 四分音符。倚音不计入，反复记号按书写顺序，不展开。压缩的 MXL 请在 App 中导入。

核对结果：《野蜂飞舞》示例转出的 1,313 个音（右手 814、左手 499）与 App 导出的 `output/scores/野蜂飞舞-Yeung-完整7页.mid` 逐音一致（音高、起始 tick、时值）；`public/guitar-beginner-sources/` 的 8 个 MusicXML 与各自随附的 MIDI 也逐音一致。

## 内容来源

- `npm run site:assets`（`scripts/build-site-assets.mjs`）生成 `assets/samples/`：《野蜂飞舞》为 App 导出的 MusicXML 原文件（Kevin W. K. Yeung 编配，CC BY-SA 3.0），《欢乐颂》由脚本按公版旋律写出；同时复制钢琴采样和字体。
- 钢琴音色：`assets/audio/piano/` 为 Salamander Grand Piano 的 22 个原始 MP3（A1–C7），CC BY 3.0，归属见同目录 `ATTRIBUTION.txt`。
- 谱面字形：`assets/fonts/Bravura.woff2` 为 VexFlow 5 内置的 Bravura（未修改），SIL OFL 1.1，见 `assets/fonts/OFL.txt`。

## 部署

推送到 `main` 后，`.github/workflows/pages.yml` 在构建 App 网页版之后把本目录原样复制到 `dist-pages/site/`，发布在 https://dns0129.github.io/Open_Piano_Player/site/ 。整个目录也可直接放到任意其他静态托管。
