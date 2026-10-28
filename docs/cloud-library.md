# 云端曲库与本地副本

“云端曲库”提供下载；“本地曲库”只展示下载、导入和本机已完成的识谱结果。

- 网页版下载：下载的乐谱与原谱图片在同一次 IndexedDB 事务中保存在当前浏览器；手动导入的既有乐谱沿用 localStorage。删除本地副本不会删除云端；重新下载可恢复。清理网站数据也会清除此浏览器的副本。
- 本机版下载：完整曲目包保存在 `.local/downloaded-scores/`，跨浏览器与重启可见；删除时移除该曲目包。下载和本地删除均不需要 GitHub 登录。
- 本机识谱结果从本地曲库移除后，在原任务目录写入 `.library-removed` 标记，后续自动同步不会将其加回；原始识别任务和原谱仍保留供历史审核，不作破坏性清理。
- 云端删除：从云端下载目录和下载包移除曲目，保留他人已有的本地副本。删除记录保存在 Git 历史；`deletedIds` 防止重新导出时自动恢复已删除的曲目。
- 本机曲目卡片的“上传云端”可将新导入或修改后的曲目及原谱图片发布到同一云端目录。普通访客的本地导入不会自动公开。

云端沿用公开仓库 `dns0129/Open_Piano_Player` 的 `main` 和 GitHub Pages。可下载资源位于 `public/cloud-library/index.json`、`public/cloud-library/scores/<id>.json`。`npm run cloud:prepare` 默认只收集仓库中已公开的曲库；只有显式指定 `--include-local` 才包含本机完整识谱结果，不上传任务凭证、原 PDF、密钥或识别日志；常规构建只复制已准备的下载目录，不自动发布用户数据。

## 管理接口

管理操作只在本机服务开放，沿用本机访问检查、同源会话与 CSRF 校验，并通过本机已登录的 `gh` 执行 GitHub 写操作。GitHub 凭据不会发送给浏览器，也不会放入公开网页。需要已安装 GitHub CLI、登录有仓库写权限的账号。

| 操作 | 接口 |
| --- | --- |
| 云端目录 | `GET /api/cloud-library` |
| 下载曲目包 | `GET /api/cloud-library/<id>` |
| 发布或替换一首曲目 | `POST /api/cloud-library`，正文为曲目包 |
| 删除云端曲目 | `DELETE /api/cloud-library/<id>`，或 `POST /api/cloud-library/<id>/delete` |
| 本机下载目录 | `GET /api/local-downloads` |
| 保存本机下载副本 | `POST /api/local-downloads`，正文为曲目包 |
| 删除本机下载副本 | `DELETE /api/local-downloads/<id>`，或 `POST /api/local-downloads/<id>/delete` |
| 从本机曲库移除识谱结果 | `POST /api/local-library/<jobId>/delete` |

写请求必须携带 `X-CSRF-Token`。在本机页面的控制台，可使用如下示例删除明确指定的云端曲目：

```js
const { csrfToken } = await (await fetch('/api/status')).json();
const response = await fetch('/api/cloud-library/这里替换为曲目ID', {
  method: 'DELETE',
  headers: { 'X-CSRF-Token': csrfToken },
});
console.log(await response.json());
```

每次云端变更将目录和曲目包提交到同一个 Git commit，再以 `force:false` 更新 `main`；若其他任务已更新 main，该请求失败，刷新后重试。接口成功返回 `commit` 和 `deployment:'pending'` 只证明云端 main 写入成功，公开下载需等待现有 Pages 工作流完成。

初始下载目录只包含仓库中原本已经公开的曲目与原谱资源。本机完整识谱结果另行准备，获得具体公开授权后才能同步；未完成的识谱任务不作为可下载全谱发布。AI 校对版保留“待人工确认”标记。

## 搜索与发现（2026-10-28）

主导航「搜索」统一承接原云端曲库，钢琴与吉他分别展示各自的公开目录。「我的曲库」只显示已保存的曲目。

- 默认显示精选推荐榜、入门练习榜、进阶挑战榜。精选顺序来自明确的曲目 ID 和目录元数据；页面标明「精选推荐 · 非播放量排名」。未标注难度的谱面单列，不能据音符数推断难度。
- 「搜索热榜／我的热搜」来自当前浏览器、当前乐器分区最近保留的 20 个搜索词及各词累计次数，按次数与最后搜索时间排序；不代表全站热度。搜索记录仅存于 localStorage，可一起清空。无记录时展示空状态，不填入虚假热度数字。
- 曲库搜索支持 Unicode／重音符号归一化、常见简繁体字、已知作品中英文别名和作曲家别名。所有关键词都要匹配，曲名匹配优先，同等相关度下标注完整的版本优先于片段。结果始终来自实际目录。
- 搜索框提供最多 6 条曲名建议，支持上下方向键、Enter、Escape 和中文输入法；历史词、榜单项、灵感词均可点选搜索。
- 支持难度、原谱图片筛选，以及相关度、曲名、速度排序；未知速度排在最后。结果每次显示 12 份，可继续加载。已下载曲目提供「打开练习」，下载与保存继续沿用原有曲库事务。
- 本机版可携带当前词切换到「全网谱源」，沿用多渠道搜索、来源状态、格式筛选和导入校验。静态网页版提供外部搜索链接；不伪装为已在页面内完成全网检索。

界面参考：[MuseScore 的曲目发现与分类](https://musescore.com/)、[NN/g 的站内搜索建议](https://www.nngroup.com/articles/site-search-suggestions/)。保留琴伴原有字体和绿色视觉体系。

本次同时修复全网搜索将空请求体 `null` 解释成 POST 的旧问题：调用搜索接口时不传请求体，实际发送 GET，并用 `createApiClient` 与搜索页联动测试覆盖该路径。2026-10-28 的隔离验证中，完整工程检查为 489 项通过、2 项跳过，60 首仓库曲目校验通过；浏览器实测「卡农」返回 11 个谱源（3/7 渠道有结果），不代表所有渠道持续可用。公开版完成曲库搜索、下载与打开练习室验证；390px iframe 验证属于浏览器布局测试，不是真机测试。
