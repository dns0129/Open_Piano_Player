# scripts/

这里是由 `package.json`、CI、测试或文档引用、需要持续维护的工具：启动与构建（`dev`、`launch`、`prepare-*`）、曲库（`score-repo`）、识谱回归与发布核验（`recognition-regression`、`check-recognition-*`，受识谱发布证据绑定）、基准测试与站点素材等。

`experiments/` 保存一次性的识谱实验脚本（如 hanting、five-high、batch-five 系列）。它们记录了某次实验如何得出结论，但不被任何命令或测试调用，也不随接口变化维护；通常依赖 `.local/` 下的私有数据，运行前请先阅读脚本。新的实验脚本请直接放进 `experiments/`，确定要长期使用时再移回这里并接入 `package.json` 或测试。
