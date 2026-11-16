# 琴伴 · 宣传网站

GitHub Pages 的站点根目录。练习室网页版发布在同站点的 `/app/`，不在这个目录里。

页面用相对路径引用 `css/`、`js/`、`fonts/`、`img/` 和 `audio/`。在仓库子路径 `https://dns0129.github.io/Open_Piano_Player/` 下打开时，这些资源仍落在 `/Open_Piano_Player/` 里。「在线打开网页版」指向 `https://dns0129.github.io/Open_Piano_Player/app/`。

本地可以直接打开 `index.html`（`file://`）。字体、图片和钢琴采样都在目录内。`index.html?nointro` 跳过开场动画。

`npm run build:pages` 把本目录（不含本说明）复制到 `dist-pages/` 的根上，并把练习室构建到 `dist-pages/app/`。`.github/workflows/pages.yml` 把 `dist-pages/` 发布到 `gh-pages` 分支。Pages 来源保持 “Deploy from a branch · gh-pages · /(root)”。

字体为 SIL OFL，说明见 `fonts/LICENSES.txt` 与 `fonts/OFL.txt`。钢琴采样为 Salamander Grand Piano，CC BY 3.0，见 `audio/ATTRIBUTION.txt`。

页面底部仍留着下载链接和联系方式的占位，等有安装包和联系方式后再补。当前标志使用 App 图标 `img/logo.svg`。

本地预览截图和字体子集脚本没有放进仓库。改文案后若要重新裁剪中文字体，在本机用 fonttools 与 brotli 处理即可。
