## Why

当前 `scripts/agent-eval` 只能对部分单轮真实 TUI 场景执行基础断言，场景 authoring、配置矩阵、类型化运行证据、产物验证、质量 Judge、可比较报告和 baseline 仍没有统一契约。Prompt、Skill、Capability、Tool、Provider、AgentSession 或 TUI 行为变化因此无法稳定回答“应复用、更新还是新增哪个 Evaluation”，也无法用同一条 canonical path 证明结果、质量和 no-fallback。

## What Changes

- 将开发期 Agent Evaluation 收敛为仓库外部平台：所有 suite、场景编排、断言、Judge、聚合、报告和 baseline 继续由 `scripts/agent-eval` 拥有，并通过 TUI debug automation 驱动完整 TUI App、输入队列和真实 `AgentSession`。
- 建立 New Evaluation authoring 契约。每个相关变更必须形成 `reuse`、`update`、`create` 或 `excluded` 决策，并记录目标行为、canonical path、forbidden fallback、证据需求、fixture、配置矩阵和 coverage delta。
- 引入严格的 suite/scenario v2 schema，覆盖 Skill、Prompt、Capability、Tool、Model、Runtime 和 Workflow target，以及 case group、runtime profile、模型矩阵、重复采样、预算、hard assertions、artifact checks、rubric、holdout visibility 和 report policy。
- 扩展通用 TUI debug automation facts：类型化 Skill activation/injection、effective runtime configuration digest、模型身份、tool/task/continuation、artifact refs、usage/timing、diagnostics 和 dropped-count；不向 runtime 暴露 evaluation pass/fail、rubric、variant 或报告概念。
- Skill target 复用 portable Skill 与 Host projection 的身份边界：`name + source/provenance + rootId + relativePath` 标识本地 Skill，Host-computed `fingerprint` 标识被测开发内容快照；不引入 Skill semver、Market package version 或发布状态。
- 建立确定性硬门禁、领域产物 validator、受限 Judge、重复采样、可比性检查、baseline 和统一报告输出；Judge 不得覆盖 canonical path、权限、schema、任务终态、产物或 no-fallback 失败。
- 按纵向里程碑实施，先交付可运行的单场景 TUI 报告，再扩展 Skill/model/artifact facts、多轮 controller、Judge/baseline 和 CI lanes，避免长期只有横向基础设施而没有可验收闭环。
- **BREAKING**：未被 runner 实际执行的字段、case kind、assertion、Judge、setup 或 post-check 在创建 TUI session 前返回 configuration invalid；v1 manifest 只允许一次性 migration validation，不保留双执行或 silent fallback。

## Capabilities

### New Capabilities

- `agent-evaluation-authoring`: 定义变更到 suite 的选择、新增/更新/排除决策、coverage delta、证据设计和缺失 observability 处理。
- `agent-evaluation-suites`: 定义跨 Skill、Prompt、Capability、Tool、Model、Runtime 和 Workflow 的 v2 suite/scenario、真实 TUI 执行、配置矩阵、断言、产物和重复采样契约。
- `agent-evaluation-reporting`: 定义 hard gates、领域 Judge、失败分类、脱敏证据、baseline、可比性、报告和质量比较契约。

### Modified Capabilities

- `tui-debug-automation`: 增加 evaluation-neutral 的 session 配置投影、运行路径、产物、usage、timing、diagnostic 和 evidence-completeness facts。

## Impact

- 主要影响 `scripts/agent-eval/` 的 schema、suite、runner、controller、assertion、validator、Judge adapter、reporter、baseline、fixtures 和测试。
- 影响 `packages/neko-agent/packages/cli-tui/src/core/debug-automation/` 及其共享 facts/config contract、producer、protocol validator 和测试，但不增加 eval 专用 runtime 状态或第二套 session owner。
- 现有平铺 v1 scenarios 将一次性迁移到 `suites/skills/` 与 `suites/agent-runtime/`；旧字段和 metadata-only Judge 在迁移完成后删除。
- 影响 `.codex/skills/neko-agent-evaluation`、Agent 架构、贡献指南和 CI 文档；Skill 只保留方法论与证据判断，具体命令、协议和 schema 教程迁入脚本 README/catalog。
- 真实 provider/model/Judge 只在可信 focused 和 nightly Debug Functional 环境运行；默认 PR CI 保持 key-free 并严格验证 schema、runner 和所有 suite dry-run。
- Skill package id、semver、发布、安装和分发历史由 Market 管理，不在本 change 范围内。
