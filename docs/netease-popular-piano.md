# 网易云热门纯音乐钢琴谱批处理

`scripts/netease-popular-piano.mjs` 使用本机现有网易云会话和琴伴识谱入口，把来源、下载、识别、问题行恢复、Skill 制谱和本机曲库导入分别保存为可续跑阶段。需要 Node.js 22.19 以上。

## 使用

```sh
node scripts/netease-popular-piano.mjs discover
node scripts/netease-popular-piano.mjs prepare
node scripts/netease-popular-piano.mjs run
node scripts/netease-popular-piano.mjs repair
node scripts/netease-popular-piano.mjs run
node scripts/netease-popular-piano.mjs artifacts
node scripts/netease-popular-piano.mjs report
```

第二个参数可指定私有工作目录，默认 `.local/netease-top100-20261029`。`pipeline` 等待已登记的当前识谱进程结束，再执行至多四轮来源准备与补位、两轮有界的定点恢复与续跑、Skill 产物和报告。`reconcile` 从已落盘成果恢复来源选择索引；`backfill` 将当前尚不适合自动处理的候选保留为排除项，再按原排序补位。运行锁和准备锁分别保护模型队列与来源选择写入，避免重复调用和并发丢失进度。进程存活不能由某个任务 JSON 的 `running` 字段代替判断；不要用第二个存储实例读取仍由另一个进程运行的任务。

## 排序和来源

- 网易云没有在本次返回的榜单清单中提供独立的纯音乐百强榜。批处理检索纯音乐歌单，选择高播放量歌单建立候选池，以接口的歌曲 `pop` 排序；同分按入选歌单出现次数和累计歌单播放量排序。这是可追溯的候选排序，不能称为网易云官方 Top 100。
- 按曲名及已核验的中外文作品别名去重。歌曲页、钢琴谱页、歌单来源、排除项和编配版本都保留；无法自动处理的版本不代表原站没有其他版本。
- 下载前后核验来源页数、谱页编号、图片类型、重复页和双谱表。简谱、合奏、缺页和不明确版式不被静默导入。
- 部分旧图片端点 `p101.music.126.net`、`p201.music.126.net` 不提供可用 TLS。仅当乐谱 API 原本给出 HTTP 时保留该协议，路径和查询参数不变；原本 HTTPS 的地址不降级，图片下载不携带账号 cookie，域名和公网地址校验仍执行。

## 识别与恢复

模型固定沿用项目 `gpt-6.1-sol / high`，四首滚动任务共享16个物理请求位置。默认每行两次调用预算，不追加全谱第二遍；成功行直接保留。再次续跑只处理未完成行，结构疑点允许有界的定点重读，每行最多两轮任务调度。明确限额或认证失败会停止后续模型请求。

本批处理的裁切恢复保留上下系统之间的可用空白，用于避免截断低音加线、符杠和八度标记；不改变 App 已发布的默认几何检测策略。`repair` 仅替换已经停止任务的问题行，保留旧裁切、任务源历史、成功行及原 PDF。替换来源会同时清除识别检查点与计划检查点，不能复用旧图片的识别答案。

## 导入与证据

只有全部谱行具备完整结果并通过结构及跨行延音检查，才通过现有本机曲库存储写入，并重新读取音符、原谱和来源定位。新 ID 使用 `netease-popular-20261029-<sheetId>`，不覆盖其他曲目；已成功写入的版本不会在续跑时覆盖用户编辑。曲目明确标为“AI草稿待校对”。

`artifacts` 使用已安装的 `piano-score-to-musicxml` Skill，将书写证据转换为 `transcription.json`，生成 MusicXML、MIDI、重新排版 SVG 和校验报告。源页哈希、实际 provider usage、模型和档位一并保留。缺少人工复核或符号适配时使用草稿状态；不能通过补签人工确认来消除阻塞。

原谱、会话、任务 token、模型响应、曲库资源和 Skill 成果只写入 `.local`，不随代码发布到 GitHub。`report.html` / `report.json` 分别提供可阅读的100首链接状态表和机器报告。链接找到、原谱准备、模型识别、曲库读回及浏览器播放是不同状态。

本次发布回归使用原有固定42个来源案例、9组离线重放和独立评分器；没有为回归新增模型调用，也不据此宣称本批谱面识别准确率提高。
