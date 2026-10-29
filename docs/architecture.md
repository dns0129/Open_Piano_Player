# 乐谱文档、演奏与曲库

运行环境为 Node.js >= 22.19；核心 TypeScript 只使用 Node 可直接擦除的类型语法，Vite 负责浏览器构建。运行 npm run typecheck 检查类型，npm run check 检查类型、测试与仓库曲目。

邀请制账号版已新增独立 `/api/v1` 服务和 hosted 构建，复用乐谱文档、播放和编辑器。当前以本机 PGlite PostgreSQL 与私有文件目录验收，生产数据库与邮件尚未接通；详见 [实现与验证](account-private-library-implementation.md) 和 [设计](account-private-library-design.md)。下文的原有本机与静态浏览器模式仍独立运行。

## 商业版与基础版边界

8792 默认启动 `developerMode=true`，保留原有图片/PDF 识谱、任务恢复、模型连接/设置、找谱、网易云导入、数字谱编辑与播放。状态接口返回原有识谱状态；本机接口继续检查回环地址、同源、会话与 CSRF。商业账号 `/api/v1` 在本机服务明确拒绝，原本机 `/api` 识谱路由正常运行。静态 Pages 仍不能调用本机识谱服务。旧任务与原谱保留在原目录。

商业入口为 8793 `/`，练习室为 `/practice.html`，由 hosted 多入口构建产生。只调用同源 `/api/v1`，不使用旧本机 API、恢复 token 或 Codex/Pi 凭据。`recognition-source.mjs` 只渲染与裁图；`recognition-provider.mjs` 持有服务端凭据和 Responses 协议；`recognition-budget.mjs` 串行锁定任务和成本账本；`recognition-jobs.mjs` 管理持久队列、检查点和主动重试；`operations.mjs` 集中角色、近期验证和审计。复用的纯乐谱校验与拼接下沉到 `score-region.mjs`，不依赖旧本机任务或认证。

任务内容、裁图、原谱与反馈受账号 RLS 约束；全站控制表只存任务 UUID、账号 UUID、状态与成本等运营元数据。服务端读取具体用户反馈时按所属账号事务取回；运营 API 不提供其他用户曲谱或图片下载。前端 Service Worker 只提供不含私有内容的断网提示，不缓存账号数据。详细状态、预算算法与运维规则见 [商业版实现](commercial-app-implementation.md)。

## 三种表示

- lib/score-document.ts：唯一持久乐谱文档为 schema: qinban.score / version: 2。保存书写音名（step、alter、octave）、记号、独立的谱表与演奏手、声部、休止、音头与 tieTo、变拍变调、演奏设置及原图定位。
- lib/score-representations.ts：createPerformanceTimeline 从文档生成实际起音、装饰音、力度与速度时间轴；createDisplayRepresentation 生成供五线谱、简谱、卷帘和打印调用的书写表示。演奏展开不会改写文档。
- lib/score.mjs：validateScore 为原有编辑器与调用方保留 v1 形状的兼容投影，附带书写信息；不要从演奏事件反推乐谱文档。MusicXML 导入、导出保留音名和延音音头；MIDI 使用实际演奏表示。

lib/notation-rhythm.mjs 集中处理倍全至二百五十六分音符、0–3 附点及任意整数比例连音；notation-segments.mjs 处理小节边界、空隙和延续音头。VexFlow 与简谱共用时值、分组和嵌套比例，打印复用同一渲染器。布局按真实起音密度安排宽度，不把细分音压回十六分网格。

音符和休止可带 `rhythm: {type, dots, tuplets?: [{actual, normal, group?}]}`。tuplets 按外至内记录，最多四层，比例 1–1024，group 可保留书写组；运行时校验其总拍数与 duration 一致。MusicXML 保留原类型、附点与标准 time-modification；嵌套书写信息附带 qinban-expression 扩展。直接修改拍数会清除过期的书写时值，旧 v1/v2 缺少 rhythm 时按时值推断，无需重写已有曲库。

仅 MIDI 显示可闭合不超过 1/128 拍、通向相邻起音或小节末的松键间隙。既有演奏事件、文档、卷帘和音频均不改变；无明确书写信息的非常规比例会显示推导比例。复声部仍合并显示为和弦及延音线，不能据此宣称恢复了原版声部或装饰音排版。

## v1 迁移规则

1. 保留已有 ID、标题、来源、MIDI 音高、四分音符拍位、时值、力度、演奏效果、速度和小节时间轴；缺少 ID 时用输入内容生成稳定迁移 ID。原文件不改写。
2. v1 没有书写音名时，根据当时调号推断拼写，标记 pitch.provenance: inferred；不能据此宣称恢复了原谱的 C-sharp / D-flat 区别。
3. 缺少谱表时按演奏手映射到 1 / 2；缺少声部时填 1。未记录的时间空隙生成 inferred 休止；原有明确休止保留 source / edited 标记。migration.inferred 列出推断字段。
4. v1 已合并的延音音头不能凭空恢复，保留其总时值；新 MusicXML 导入保留独立音头和延音关系。原图坐标可作为定位信息附入文档。
5. 没有历史关系的 v1，以自身 ID 作为当前已知版本根，不根据标题猜原曲。首次编辑另存新 ID，lineage.originalId / parentId 记录来源；已有编辑版继续保存相同 ID 并增加修订。
6. v2 输入需通过运行时校验：音名与 MIDI 一致，ID 唯一，谱表、声部、休止、连音和时间轴有效。现代文档不使用 v1 的重复 ID 修复规则。

## 曲库接口

应用只通过 src/library.js 保存、读取、删除、修订、导入下载、备份和恢复。lib/library-format.ts 负责数据契约与校验。

- 本机：lib/library-store.mjs，事实源为 .local/library-v2/。乐谱 ID 可包含中文；磁盘文件名使用 ID 的 SHA-256，不能通过 ID 访问目录外文件。记录采用临时文件加原子重命名；原谱资源按内容散列存放，修订共用资源。列表不载入图片或原始 PDF。
- 网页：src/library-indexeddb.js，事实源为 IndexedDB qinban-library-v2。records、resources、metadata 分开保存，记录和资源在同一事务中提交。写入同时检查 revision，避免其他窗口的改动被旧编辑覆盖。
- localStorage：仅用于布局、音色、当前曲目等偏好。旧 qinban-scores 在成功持久保存后删除；其原始文本先归档至私有 metadata，旧原图数据库仍保留。发生同 ID 内容分歧时迁移为独立版本，保留双方数据。
- 识谱任务恢复凭据由 task-vault.js 存入私有 metadata。旧 qinban-fullscore-jobs 只在迁移成功后删除；凭据不进入曲库备份或公开发布。

本机首次读取会将原有已校对任务及下载目录接入新曲库，原目录和识别记录保留。删除写入标记，后续扫描不会把删除的曲目再次导入。新完成任务仍会自动接入。

旧目录或个别旧记录损坏时，曲库显示迁移警告并保留原文件，已经迁移的曲目仍可使用；磁盘写入失败会中止当前保存，不报告成功。

## 修订、原图与发布

每个已知 ID 有递增 revision 和不可覆盖的历史快照。恢复旧修订会创建新修订。改变音高、时值或身份后的编辑版不会错误复用原图跟随；原图和原始文件仍随版本保存。

上传原始 MusicXML / MIDI / JSON 会保存原文件；已完成识谱任务迁移时包含已有原 PDF。仅导出 v2 乐谱 JSON 时包含数字谱与坐标，不含图片二进制；要转移全部资源，使用“备份完整曲库”。

公开发布发送文档、练习投影与经用户确认的原图包；不发送私有原 PDF、修订历史、恢复凭据和模型设置。lineage.publishedFromId 与本机 publication 的源修订、commit 记录已发布版本。main 写入成功与 Pages 发布完成仍是不同状态。

## 完整备份

备份格式为 qinban-library-backup / version: 1，包含所有当前曲目、历史修订、图片和已保存的原始文件；资源按内容去重，并对整个载荷计算 SHA-256。

恢复前验证校验值和全部记录。已有同 ID 曲目保留并返回 conflicts，不静默覆盖；可先备份当前版本、删除本地副本后恢复指定备份。浏览器批量恢复使用单次事务；本机逐记录原子写入，若存储中断可用同一备份再次恢复。已删除的曲目、未完成识谱任务与账号密钥不包含在曲库备份内。恢复文件最大 512 MB。

## 请求与功能能力

capabilities.js 明确区分 local / browser / hosted 模式；api-client.js 是本机请求的统一接口，处理会话、CSRF 和一次过期恢复。静态模式在发送前拒绝本机请求，不修改全局 fetch。普通资源、模型与原谱图片加载不受影响。

本机曲库接口均沿用同源会话和 CSRF 检查：

- GET /api/library：元数据与可练习投影
- POST /api/library：record、expectedRevision；冲突返回 409
- GET /api/library/records/:encodedId：单份完整记录
- POST /api/library/records/:encodedId/delete：本地删除
- GET /api/library/backup：完整备份
- POST /api/library/restore：backup；返回 restored / conflicts

五线谱使用 vexflow/core，Bravura 与 Academico 作为带哈希的 woff2（src/fonts/，由 scripts/extract-music-fonts.mjs 从已安装的 vexflow 提取，测试校验一致）单独加载并长期缓存，不再以 base64 打进首屏脚本；打印导出从缓存读取同一文件转为 data URL 内联。两个服务对构建产物发送 ETag 与 Last-Modified，未变化的音色采样、pdf.js 与模型文件以 304 复用缓存。

两个 Node 服务共用 lib/http-kit.mjs：安全响应头、请求体大小限制、JSON 解析、静态文件与有序路由表。server.mjs 的接口在会话和 CSRF 检查之后按路由表分派；lib/accounts/http.mjs 分三段路由：未登录可用（支付回调、目录、登录上下文）、任何会话可用（登录、恢复、设备）、正常账号可用（订阅、识谱、曲库、运营）。新增接口时登记到对应阶段，而不是在处理函数里自行检查会话。

app.js 保留页面协调与练习控制；曲库、找谱、音频转谱、打印导出、整谱请求和恢复凭据分别由独立模块负责。

## 测试素材

自动测试的核心数据为合成数据，不调用模型。两项原图回归可选读取私有 evidence 图片；干净克隆没有这些图片时明确 skip，几何、记谱、迁移与存储测试仍正常执行。不要将用户原谱或实验目录作为默认公开测试依赖。
