# 乐谱文档、演奏与曲库

运行环境为 Node.js >= 22.19；核心 TypeScript 只使用 Node 可直接擦除的类型语法，Vite 负责浏览器构建。运行 npm run typecheck 检查类型，npm run check 检查类型、测试与仓库曲目。

## 三种表示

- lib/score-document.ts：唯一持久乐谱文档为 schema: qinban.score / version: 2。保存书写音名（step、alter、octave）、记号、独立的谱表与演奏手、声部、休止、音头与 tieTo、变拍变调、演奏设置及原图定位。
- lib/score-representations.ts：createPerformanceTimeline 从文档生成实际起音、装饰音、力度与速度时间轴；createDisplayRepresentation 生成供五线谱、简谱、卷帘和打印调用的书写表示。演奏展开不会改写文档。
- lib/score.mjs：validateScore 为原有编辑器与调用方保留 v1 形状的兼容投影，附带书写信息；不要从演奏事件反推乐谱文档。MusicXML 导入、导出保留音名和延音音头；MIDI 使用实际演奏表示。

现有 VexFlow 排版规则继续使用，复杂节奏、合并显示声部等既有限制仍须根据原谱核验。数据保留与排版能力是两个独立约束。

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

capabilities.js 明确区分 local / browser 模式；api-client.js 是本机请求的统一接口，处理会话、CSRF 和一次过期恢复。静态模式在发送前拒绝本机请求，不修改全局 fetch。普通资源、模型与原谱图片加载不受影响。

本机曲库接口均沿用同源会话和 CSRF 检查：

- GET /api/library：元数据与可练习投影
- POST /api/library：record、expectedRevision；冲突返回 409
- GET /api/library/records/:encodedId：单份完整记录
- POST /api/library/records/:encodedId/delete：本地删除
- GET /api/library/backup：完整备份
- POST /api/library/restore：backup；返回 restored / conflicts

app.js 保留页面协调与练习控制；曲库、找谱、音频转谱、打印导出、整谱请求和恢复凭据分别由独立模块负责。

## 测试素材

自动测试的核心数据为合成数据，不调用模型。两项原图回归可选读取私有 evidence 图片；干净克隆没有这些图片时明确 skip，几何、记谱、迁移与存储测试仍正常执行。不要将用户原谱或实验目录作为默认公开测试依赖。
