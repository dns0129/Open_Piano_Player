# 完整 PDF 识谱与校对对话框的模块划分

`mountFullScoreImport(host, { file, source, resumeJob, onImport, onClose, api })` 仍是唯一入口，返回 `{ ready, destroy, cancel, getDraft }`。原先所有内部函数共享一个闭包；现在共享一个显式的上下文对象 `ctx`，各模块的函数都以 `ctx` 为第一个参数。行为不变：同一事件触发同样的状态修改、同样的接口调用顺序和同样的标记。

## 上下文 `ctx`（跨模块传递的唯一对象）

由 `full-score-import-context.js` 的 `createImportContext` 创建：

- 入参：`root`、`file`、`source`、`resumeJob`、`api`、`onImport`、`onClose`。
- 数据：`draft`（标题、页面、谱行）、`state`（界面与任务状态）、`assets`（谱行裁图）、`thumbnails`（页面缩略图）、`remoteSignatures`（已应用的服务器结果）、`moveHistory`（拖拽撤销栈）。
- 运行期句柄：`pdf`、`documentTask`、`pdfQueue`、`activePrepared`、`preparedPromise`、`selector`、`previewRenderer`、`noteDrag`、`pageWorkbench*`。
- 取消纪元：`disposed`、`scanCancelled`、`operationCancelled`、`operationVersion`、`operationController`、`pollTimer`、`renderEpoch`、`manualSequence`。
- `ctx.render()`：由入口装上的重绘函数。其他模块只经由它重绘，因此模块之间没有循环依赖。

同一模块还提供只读选择器（`selectedRegions`、`activeRegion`、`pageInfo`、`isRunning`、`scopeLocked`）和操作纪元工具：`beginOperation` 开启一次新的用户操作并返回其纪元；`assertAlive` 在纪元过期或对话框关闭后中止；`cancelLateResponse` 取消已被停止的操作晚到的服务器任务。

## 模块与依赖方向

依赖只按下列顺序向下指，不出现循环：

| 模块 | 职责 | 依赖 |
| --- | --- | --- |
| `full-score-import-parts.js` | 与闭包无关的小工具：图片/Blob 转换、标签、OMR 疑点标记 | — |
| `full-score-import-context.js` | 创建 `ctx`、选择器、操作纪元、`requireApi`、服务商能力 | parts |
| `full-score-import-pages.js` | PDF 渲染队列、页面预处理缓存、逐页扫描、谱行裁图资产 | context |
| `full-score-import-jobs.js` | 任务快照、轮询、开始/停止/重试/审核、诊断工具、恢复范围 | context、pages |
| `full-score-import-save.js` | 保存已审核全谱与导入 AI 草稿 | context、pages、jobs |
| `full-score-import-review.js` | 选中音符、移动与撤销、手动框选、转写预览、整页工作台 | context、pages |
| `full-score-import-drag.js` | 原图圆点与音高网格的指针拖拽、方向键微调 | context、review |
| `full-score-import-markup.js` | 纯函数：视图模型 → HTML 字符串，不读 DOM、不改状态 | parts、written-editor、diagnosis-card |
| `full-score-import-view.js` | 由 `ctx` 生成视图模型；重绘时保存/恢复滚动、焦点与展开状态；挂载框选器和原图 | context、pages、review、markup |
| `full-score-import-actions.js` | `data-action` 点击动作表、`change`/`input` 字段处理 | 以上全部 |
| `full-score-import.js` | 入口：建 `ctx`、装 `render`、绑定事件、初始化扫描与恢复、销毁 | 以上全部 |

## 接缝

- **视图模型**：`buildViewModel(ctx)` 一次算出 `summary`、当前页谱行、当前谱行、已选谱行、失败数、进度、`running`/`locked` 等派生值；`fullScoreImportMarkup(vm)` 只读这些值。原本 `render()` 中反复调用的选择器在一次重绘内结果相同，因此合并计算不改变输出。
- **动作表**：`clickActions` 以 `data-action` 名为键，值为 `(ctx, element) => …`。忙碌时被屏蔽的动作集中在 `BUSY_BLOCKED_ACTIONS`。分发器保持原有顺序：先处理原图点击定位与选中标记，再查表；运行前清空错误，异常统一显示为错误提示。
- **操作纪元**：开始识别、重试、批量审核都经 `beginOperation` 递增纪元；停止和关闭使旧纪元失效。晚到的响应只在纪元仍然有效时写入状态。

## 发布门禁

上述所有 `src/full-score-import*.js` 都在 `recognitionReleaseFingerprint`（`lib/recognition-governance.mjs`）的固定清单中；修改任何一个都需要重新执行固定回归并更新 `docs/recognition-release-evidence.json`。
