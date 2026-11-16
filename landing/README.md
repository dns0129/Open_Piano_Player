# 琴伴 · 宣传首页

纸面乐谱风格的静态宣传站。GitHub Pages 把它放在站点根目录，网页版练习室在 [`/app/`](https://dns0129.github.io/Open_Piano_Player/app/)。资源都用相对路径，因此同一份文件可以用 `file://` 打开，也可以挂在 `/Open_Piano_Player/` 下。

## 本地预览

双击 `index.html` 即可（字体、图片、钢琴采样都已内置，不需要服务器）。`index.html?nointro` 跳过开场动画。需要按真实 Pages 路径检查时，在仓库根目录执行 `npm run build:pages`，再把 `dist-pages/` 挂到 `/Open_Piano_Player/` 下用 HTTP 打开。

## 目录

| 路径 | 内容 |
| --- | --- |
| `index.html` | 页面文案 |
| `css/style.css` | 样式，颜色集中在文件顶部 `:root` |
| `js/engrave.js` | 迷你五线谱排版（Bravura / SMuFL） |
| `js/audio.js` | 钢琴采样播放（Web Audio） |
| `js/main.js` | 开场、谱带、练习演示、键盘、翻页 |
| `audio/` | Salamander Grand Piano 采样（CC BY 3.0，见 `ATTRIBUTION.txt`），内嵌在 `samples.js` |
| `fonts/` | 本地字体，均为 SIL OFL，见 `LICENSES.txt` |
| `img/` | App 实机截图、Logo、乐谱装饰条 |
| `tools/subset_fonts.py` | 改文案后重新裁剪中文字体（需 fonttools 与 brotli，字体路径按本机调整） |

设计核对用的整页截图不入库，也不进入 `dist-pages/`。

## 发布

`npm run build:pages` 把本目录的页面和资源复制到 `dist-pages/` 根目录，把网页版构建到 `dist-pages/app/`。「在线打开网页版」指向 <https://dns0129.github.io/Open_Piano_Player/app/>。页面最底部仍留着下载链接和联系方式的占位，发布安装包或联系方式后再补。

互动练习首页仍是仓库里的 `site/`，发布在 <https://dns0129.github.io/Open_Piano_Player/site/>。
