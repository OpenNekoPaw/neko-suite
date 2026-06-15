# 文档治理 Gap 分析

快照日期：2026-06-15
检查范围：根文档入口、`docs/` 目录、Agent 发现路径、架构/领域/调研/状态文档分类。

## 当前状态

- 根目录保留 `README_CN.md` / `README.md` 作为项目入口。
- 根目录保留 `ARCHITECTURE_CN.md` / `ARCHITECTURE.md` 作为系统架构总览入口。
- `docs/` 已恢复为文档导航层，并区分 `architecture/`、`domains/`、`research/`、`status/`。
- `AGENTS.md` 已增加文档治理和发现路径规则。
- `README`、`ARCHITECTURE`、`CONTRIBUTING` 已补充 `docs/` 入口。

## 缺口

- 旧架构专题文档已清理，目前 `docs/architecture/` 只有索引，没有专题 ADR 正文。
- 领域目录目前只有总索引，尚未为 `video/`、`audio/`、`agent/` 等领域创建具体入口。
- 调研目录只有分类和竞品模板，尚未迁入实际竞品或技术 spike。
- 状态目录只有治理快照，尚未覆盖包健康度、迁移进度或功能 gap。
- 当前没有自动化 Markdown 链接检查脚本，链接有效性依赖人工和 `rg` 检查。

## 风险

- 如果后续直接把领域架构写进 `docs/architecture/`，系统级约束和领域内部设计会再次混淆。
- 如果调研或状态文档不标注日期，过期观察可能被误读为当前事实。
- 如果每个领域没有 `README.md`，Agent 仍可能需要读取过多文件才能定位上下文。

## 建议动作

1. 优先为高频创作目标创建入口：`docs/domains/video/README.md`、`docs/domains/audio/README.md`、`docs/domains/model/README.md`、`docs/domains/2d/README.md`、`docs/domains/interactive/README.md`。
2. 从当前实际开发需求倒推恢复架构专题，不批量复原旧 ADR。
3. 为竞品分析按赛道建文档，例如 `docs/research/competitors/agent-workflows.md`。
4. 后续可增加 Markdown 链接检查命令，并纳入 `pnpm check` 或文档维护脚本。

## 行动项流转

- 高频领域入口：若需要一次性创建多个领域文档，应转入 OpenSpec change；若只是排队补齐，可转入 `TODO_CN.md`。
- 架构专题恢复：按实际开发需求逐项转入 `docs/architecture/`，不要在本状态文档内持续推进。
- 竞品分析：按赛道转入 `docs/research/competitors/`。
- Markdown 链接检查：若决定纳入自动化检查，应转入 OpenSpec change 或 `TODO_CN.md`。

## 稳定结论归档

- 文档分类规则已归档到 `docs/README.md`。
- 系统架构与领域架构的边界已归档到 `docs/architecture/README.md` 与 `docs/domains/README.md`。
- Agent 读写规则已归档到 `AGENTS.md`。
