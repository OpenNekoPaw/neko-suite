## Why

当前 `neko experiment`、`ExperimentRunner` 和 `AblationToggles` 在 Neko Agent 内部直接构造 `AgentSession`、拥有 variants/presets/repetition/comparison/report 语义，形成了与真实 TUI Evaluation 平行的执行路径。它能提供开发期性能数据，却不能证明 TUI 输入队列、Skill lifecycle、任务观察、产物投递或 no-fallback，因此不应继续作为独立实验系统扩展。

## What Changes

- 将消融实验定义为 Agent Evaluation 平台的 `ablation` mode，复用同一套 suite、真实 TUI driver、fixtures、hard gates、领域 Judge、metrics、报告、baseline 和 comparison。
- 将比较证据明确拆成三层：deterministic hard gates 只证明路径、配置、格式和 correctness；usage/timing/cost 只描述执行效率；只有真实模型输出经 suite-owned 内容 rubric、领域 validator 或 blind Judge 评分后，才能形成模型输出质量比较。
- 区分 configuration ablation 与 implementation ablation：真实支持的 runtime configuration 通过 session-scoped immutable profile 比较；仅用于移除内部实现的实验通过隔离 revision/worktree/build 执行，不向生产 runtime 增加永久 feature flag。
- 将 baseline、variant、preset、repetition、isolation、evaluator、aggregation 和 comparison/report ownership 从 `packages/neko-agent` 迁移到 `scripts/agent-eval`。
- Agent runtime 只保留真实产品配置、配置校验/应用、effective-config snapshot/digest 和中立 usage/timing/tool/task/artifact facts；领域运行时继续拥有真实 `QualityEvidence`。
- Skill-targeted ablation 复用平台的 Host Skill identity/fingerprint 和本地 development history evidence；不使用 Market package version 标识 base/variant。
- **BREAKING**：删除直接创建 `AgentSession` 的 canonical `ExperimentRunner` 路径、仅为实验服务的 `__ablation` marker/no-op branches 和产品 CLI `neko experiment`；不保留 alias、dual-runner 或 direct-session fallback。
- 更新此前允许 experiment 作为独立 validation utility 的架构结论，使开发期消融只通过外部 Evaluation 平台执行。

## Capabilities

### New Capabilities

- `agent-evaluation-ablation`: 定义配置消融、实现消融、variant 隔离、有效配置证据、性能/质量比较和 no-experiment-runtime-contamination 契约。

### Modified Capabilities

- `legacy-fallback-surface-elimination`: 删除旧 experiment direct-session owner、CLI 入口、ablation marker 和平行成功路径，并证明新消融请求不能回退旧实现。

## Impact

- 主要删除或迁移 `packages/neko-agent/packages/agent/src/experiment/` 与 `packages/neko-agent/packages/cli-tui/src/core/experiment.ts` 的 orchestration/preset/reporting 职责，以及 CLI `experiment` command 和相关 presentation/tests。
- 在 `scripts/agent-eval/` 增加 ablation suite mode、variant profiles、重复采样、隔离执行和性能/质量 comparison；复用平台 contracts，不复制 evaluator 或 reporter。
- 两个 focused pilot 都必须声明内容质量 rubric 和 Judge profile；hard-gate 通过率、结构化字段命中率、延迟、token 或 cost 不得映射成 content-quality score，也不得用于宣称模型质量提升。
- 影响 runtime session/config assembly：实验专用 marker 被删除，真实配置通过 canonical typed config path 应用并由 debug facts 投影 effective digest。
- 为使真实 pilot 能启动 canonical TUI，修复已确认的 host-neutral workspace subpath ESM contract 与 CLI raw-TypeScript bundling 缺口；不改变 VS Code extension 的 CJS 主入口，也不增加 Evaluation-only runtime loader 或 fallback。
- 需要迁移现有 experiment fixtures/reports；它们不作为真实 Agent acceptance baseline，迁移后由 focused TUI ablation pilots 重新建立证据。
