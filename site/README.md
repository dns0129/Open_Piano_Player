# 乐谱 · 宣传网站

独立的静态宣传页（产品介绍、功能介绍、示范案例、玩一下），不参与 App 的 Vite 构建。名称「乐谱」为暂定名。

## 本地预览

页面通过 `fetch` 加载钢琴采样，需要用 HTTP 打开（直接双击 `index.html` 时采样加载失败，会退回合成音色）：

```sh
python3 -m http.server 8817 --directory site
```

然后打开 `http://127.0.0.1:8817/`。浏览器要求先有一次点击或按键才能发声，页面会提示。

## 内容来源

- 案例数据 `assets/cases.js` 由 `npm run site:assets`（`scripts/build-site-assets.mjs`）从曲库生成：《野蜂飞舞》取自 `output/scores/`，其余取自 `score-repo/scores/`，音符、力度、左右手原样导出，只截取片段；统计数字按整首计算。改动案例后重新运行即可。
- 钢琴音色：`assets/audio/piano/` 为 Salamander Grand Piano 的 22 个原始 MP3（A1–C7），CC BY 3.0，归属见同目录 `ATTRIBUTION.txt`。
- 谱面字形：`assets/fonts/Bravura.woff2` 为 VexFlow 5 内置的 Bravura（未修改），SIL OFL 1.1，见 `assets/fonts/OFL.txt`。
- 《欢乐颂》《小星星》旋律为公版，直接写在 `assets/site.js` 中。

## 文件

- `index.html`：全部文案与结构。
- `assets/site.css`：玻璃质感样式，颜色集中在 `:root` 变量。
- `assets/site.js`：音频引擎（采样 + 混响，无采样时合成兜底）、播放器（改速 / 分手 / 移调 / 循环都从当前拍继续）、五线谱 / 简谱 / 卷帘渲染，以及各个互动演示、下落挑战和哼唱识音。

## 部署

整个 `site/` 目录可直接放到任意静态托管。现有 GitHub Pages 工作流只发布 App 网页版，不包含本目录。
