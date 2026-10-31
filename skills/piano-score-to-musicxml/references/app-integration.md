# 琴伴接入

<!-- recognition-current {"release":"recognition-skill133-app-v1-20261031","prompt":"piano-written-evidence-v9-skill133-20261031","accidentals":"accidentals-v2-20261018","wire":"compact-v6","cache":"reviewed-source-v5-skill133","geometry":"geometry-native-pdf-v1","corpus":"recognition-corpus-v1-20261028","skill":"1.3.3","nodeMinimum":"22.19.0","nodePreferred":"24"} -->

`recognitionTranscription(job, manifest, {sourceGraceNotation})` 可接收另行原图核对的纸面倚音清单：每项包含已有全局 `noteId`、`type`、`slash`、可选 `chordGroup` 和当前系统图 `sourceImageSha256`。只映射已有倚音，保留原书写音名与显式记号；不从 MIDI 重建拼写，不从播放借时推断纸面符值。缺少符值/斜线证据的倚音仍留在 `unhandled`，不自动确认。当前八度移位倚音须先单独适配，不静默丢弃源写法。

## 模型和凭据

优先复用目标项目的已认证后端；Skill 不包含登录 cookie、API key、Pi OAuth、用户配额或预设远程服务。执行前读取目标仓库的 AGENTS.md 和启动方式。用户指定模型与思考强度优先；不要静默降档、换供应商或用本机 OMR 替代。

琴伴参考实现：[Open_Piano_Player](https://github.com/dns0129/Open_Piano_Player)。本 Skill 1.3 承接 2026-10-28 的 P1 转录契约与 P2 交付治理；路由与字段以当前仓库源码为准。

主线 `24f8d1e` 已取消全谱第二遍 AI 校验。此 Skill 默认同样不自动启动额外全谱复读；逻辑上分音高/节奏/符号填写不等于多次调用。独立复读仅在用户要求或具体疑点需要时执行。

## 识谱入口的能力边界

- `lib/recognition-prompts.mjs` 保存 `accidentals-v2-20261018` 升降号规则。
- `lib/digital-recognition.mjs` / `lib/ai.mjs` 的新提交采用 compact-v5：保留 MIDI 事件，同时提交 notation 中的原谱字母、八度、有效升降值、显式记号、谱表、谱号、休止与声部区间。单图按完整双谱表系统分区，再进入与整谱相同的接收与组装流程。
- `lib/recognition-transcription.mjs` 提供 App→Skill 的显式转换，旧的 MIDI 四元组不能反推成纸面证据。转换不会自动确认 checked/reviewed；尚未适配的倚音写法、独立谱表调号、未知调式等进入未解决清单。协议仍不包含全部重音、力度、波音或踏板证据，不能宣称全符号零丢失。只在已核对小节边界后按完整小节分段，不截掉后半页。
- `scripts/recognize-full-score.mjs` 历史上含特定曲目的参数。把其用于新曲目前检查谱名、拍号、速度、行数等硬编码；不要当作任意多页谱的通用执行器。

## P0/P1 提交校验与成果保存

App 的 compact-v5 接受未知速度并保存 `tempoEvidence`，与可编辑练习速度分开。首读后只对明确的数据或结构疑点补救一次；默认每行两次调用预算，不默认追加全谱复读。原谱上下文与局部恢复共用预算；仅在配置允许且有已核对小节边界时才能分段。高风险独立复读为默认关闭的实验选项，第二次只看原图与谱号/调拍号上下文，不获取首轮答案；不一致保留首轮并待原图裁决。本机策略允许显式设置1–6次预算，托管最多2次且每次另行预留费用。托管流程的第二次补救必须另行通过现有预算预留，缺失 usage、限流或认证失败时停止。提交、错误、修改前后的数据保留在任务私有记录中。

App 的原图复核批准现在需有 `review.approval.basis`，通过 `lib/review-approval.mjs` 的 `agentReviewBasis(job)` 在真实复核之后记录。乐谱内容或来源改变后，旧批准不能继续获得免复核状态；旧记录保留，不自动补签。此字段与 Skill 的逐小节 evidence 是不同范围的证据，不可直接互换。

## 并发、缓存、超时

复用项目队列和成功行缓存，识别前确认用户的缓存策略。用户要求无缓存时使用独立运行 ID，不能借用旧识别答案；原始 PDF 栅格图/确定性裁切是否可复用需与识别结果缓存区分，并如实报告。

100是用户历史配置的并发上限，不是每次必须创建100个请求。按谱面总行数、供应商实际并发与限额启动滚动队列，避免所有调用同时重试。超时只补失败行；以当前后端可观察到的运行状态确认是否仍活跃，避免同一行重复花费。未收到 response/usage 不能推断实际消耗为0。额度耗尽时保留已完成数据，报告剩余页/行与下一步，不循环空耗。

本 Skill 工具只做确定性转换，不会自动发出模型请求。若使用 Codex 当前视觉直接读谱，也必须说明实际执行模型/档位来自宿主，Skill 文件中的偏好不是调用证明。

## 导入和发布

仅在用户请求时执行写入。原版本保留，新版本使用不同 ID；AI校对版不自动冒充人工确认。

1. 通过当前 App 支持的导入入口加载 `score.musicxml` 或 `score.qinban.json`；原谱拼写和更多谱面记号以 MusicXML + transcription.json 为完整源，琴伴 JSON 有数据表达边界。
2. 如果使用本机曲库 API，先核对当前 `server.mjs` 的真实 schema/路由。写入后重新读取落盘曲目；浏览器 localStorage 不代表持久本机曲库。
3. 从头到尾播放并验证首尾音、左右手、延音/装饰音和跟谱游标；等待自然终止。仅拖到结尾不算完整播放；加速播放需报告倍率。
4. GitHub 曲库提交要使用项目已有 `scripts/score-repo.mjs` 的当前帮助和 schema；确认授权的仓库、分支及可见性，不上传未经要求公开的原谱、私有证据或凭据。推送后读回远端文件与索引。
5. 云端 App 需另行确认部署状态，并在云端浏览器实际打开曲目；代码推送、目录可见与完整播放是三种不同证据。

如果本次仅创建制谱产物，不启动 App、不改变曲库、不清理缓存、不自动发布曲目。生成 Skill 本身也不授权未来每次使用都公开用户乐谱。

## P2 版本、回归与用量

App 的组件版本由 `lib/recognition-versions.mjs` 统一登记；提示词、协议、升降规则、缓存和 Skill 版本各有语义。仓库检查会阻止当前文档与实际版本漂移；历史报告保留原值。

固定回归把同版独立 MusicXML、未经人工确认的视觉子集和既有模型/人工校对稿分开。离线回放不调用模型；只有显式 live 和足够预算才执行新识读，参考答案不传给读取请求。修改模型输入文本或图像预处理不能沿用旧响应宣称视觉质量已验证。

DeepSeek 为实验 / 第二意见，保持用户选择的 high，不自动切换供应商或降低思考强度。官方 Chat Completions 在思考模式不支持 required / 指名工具选择；使用 auto 并严格验收。同一次响应中的完整 JSON 可以进入公共校验，普通说明和缺字段不能充当完成结果。[官方接口说明](https://api-docs.deepseek.com/api/create-chat-completion/)

整个计划的 usage 包含首读、恢复与复读；同一审计 ID 续跑不重复累计。未返回的 total / 缓存 / 思考字段保留未知，托管仍按原有有效 input/output 结算规则处理，不将未知消耗当作免费。
