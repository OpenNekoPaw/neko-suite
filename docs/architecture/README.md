# 架构文档

`docs/architecture/` 用于记录系统级架构约束、ADR 和跨领域不变量。根目录 [`../../ARCHITECTURE_CN.md`](../../ARCHITECTURE_CN.md) 是当前系统架构总览；本目录承载更细的决策记录和专题说明。

## 放入本目录

- Webview、Extension Host、Rust Engine、共享契约之间的边界。
- Protobuf、路径系统、资源 URI、Engine 权威等跨层约束。
- 影响多个领域或多个包的 ADR。
- 全局质量门禁、安全边界、依赖方向和运行时策略。

## 不放入本目录

| 内容 | 应放位置 |
|------|----------|
| 单个领域内部架构 | `docs/domains/<domain>/architecture.md` |
| 竞品、市场、技术调研 | `docs/research/` |
| 当前 gap、迁移进度、健康度快照 | `docs/status/` |
| 尚未稳定的开发变更 | `openspec/changes/` |
| 单包实现细节 | `packages/<pkg>/docs/` |

## 写作要求

架构文档应说明当前决策、约束、风险和后果。避免保存过时代码样例、命令输出、阶段完成日志或只对单次实现有意义的状态。

当领域决策上升为全系统约束时，将稳定结论提升到本目录，并从对应 `docs/domains/<domain>/` 文档链接回来。
