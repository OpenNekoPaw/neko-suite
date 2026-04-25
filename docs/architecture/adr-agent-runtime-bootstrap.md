# ADR: Neko Agent Runtime Bootstrap 收口

## 状态

Accepted

## 背景

在这轮收口前，`AgentSession` 的创建入口虽然名义上统一，但实际组装仍然分散在多个宿主：

- VSCode extension 在 `AgentRunner` 里手工拼 `stageTracking`、`workspace`、`promptFragments`、`journalWriter`
- CLI runner 在不同 callsite 各自注入 `conversationId`、`journalWriter`、`projectMemoryManager`
- TUI hook 直接构造 `AgentSessionConfig`，与 CLI/extension 的 runtime 语义逐步漂移

这带来三个问题：

1. IDC 主链相关依赖没有统一入口，`stageTracking` / `workspace` 是否接通取决于各宿主是否“记得传”
2. prompt、artifact、feedback、capability 等运行时平面耦合在宿主代码里，后续 P1/P2/P3 很容易继续分叉
3. extension、CLI、TUI 虽然都使用 `AgentSession`，但并没有共享一套稳定的 bootstrap 契约

P0 的目标不是增加功能，而是先冻结“最小可运行契约”和“统一入口”，把后续 IDC、capability、artifact、feedback 的扩展点固定下来。

## 决策

### 1. 在 `@neko/agent` 内定义本地 runtime 契约

最小运行契约定义在 `packages/neko-agent/packages/agent/src/runtime/types.ts`，由四个 plane 组成：

- `workflowRuntime`
- `artifactStore`
- `capabilityRuntime`
- `feedbackLoop`

对应接口为：

- `IWorkflowRuntime`
- `IArtifactStore`
- `ICapabilityRuntime`
- `IFeedbackLoop`

统一外层配置名为 `AgentRuntimeConfig`。

当前 contract 上已经开始承载后续阶段收口所需的最小入口，例如：

- `IWorkflowRuntime.idcTaskProjection`：把 IDC Task checklist 投影进统一任务平面
- `IFeedbackLoop.feedbackCoordinator`：把 artifact observation / self-eval / memory extraction 收口为单一 feedback runtime，并提供最小 `signal -> decision` 查询面

补充约束：

- 宿主若已经拥有共享 `TaskManager`，必须显式通过 `workflowRuntime.idcTaskProjection` 注入，不允许在某个 `createAgentSession*` 分支里临时偷建任务平面
- CLI / TUI 的 Node 宿主 bootstrap 需要先确定 `TaskManager` 生命周期，再决定是否额外创建 `Platform`
- extension 必须复用 service bootstrap 产出的同一个 `TaskManager`，避免 IDC checklist 与 UI 任务面出现双写分叉

### 2. 宿主统一通过 runtime bootstrap 创建 session

`@neko/agent` 暴露两个统一入口：

- `buildAgentSessionConfigWithRuntime(config)`
- `createAgentSessionWithRuntime(config)`

职责边界如下：

- runtime plane 负责表达宿主提供的运行时能力
- bootstrap helper 负责把 plane 投影回 `AgentSessionConfig`
- `AgentSession` 本身仍然只消费最终的 `AgentSessionConfig`

这保证 extension、CLI、TUI 都通过同一套 bootstrap 规则创建 session，而不是在各自宿主里复制映射逻辑。

### 3. 采用“显式 session 配置优先，runtime 作为默认层”的覆盖规则

覆盖优先级固定为：

1. 显式 `AgentSessionConfig` 字段
2. `runtime.*` plane 提供的默认值
3. `AgentSession` 内部默认值

这条规则是后续扩展的硬约束，避免 runtime plane 抢占调用方显式配置。

### 4. Node 宿主统一复用 `createNodeArtifactStore()`

为避免 extension / CLI / TUI 各自手写 Node 文件系统桥接，`@neko/agent/runtime` 提供：

- `createNodeRuntimeWorkspaceFsOps()`
- `createNodeArtifactStore()`

它们负责统一组装：

- workspace-backed artifact fsOps
- global `preferences.md` 默认路径
- conversation-scoped journal writer factory

Node 宿主不再直接手工拼 `artifactStore` 字面量。

## 明确不做的事

本 ADR 只解决“入口统一”和“契约冻结”，暂不处理以下问题：

- 不把旧的 shared `AgentRuntimeConfig` 强行迁移成新契约
- 不在这一步默认开启 IDC
- 不在这一步补 capability discovery 的全部接线
- 不在这一步把 Draft / Plan / Task 升级成正式 ArtifactService
- 不在这一步处理 approval state 持久化

这些属于后续 P1-P5 的增量工作，必须建立在统一 bootstrap 已经稳定的前提上。

## 结果与影响

### 正面影响

- extension、CLI、TUI 已统一通过 `createAgentSessionWithRuntime()` 创建 session
- runtime plane 成为 IDC、artifact、capability、feedback 的唯一 bootstrap 汇合点
- 后续 `stageTracking`、`workspace`、`toolGroupRegistry`、`skillRegistry`、`feedback coordinator` 等接线，都有了稳定入口
- workspace-backed `ArtifactService` 负责从 `.neko/cache/artifact-index.json` + artifact markdown 做 startup rehydrate，并暴露 run-scoped query surface（`listRunIds` / `listByRunId`），宿主不再手写 artifact 恢复逻辑
- `idc-runtime.json` 的 startup restore 统一由 session runtime 负责回灌 stage / run / approval 快照，宿主不再各自拼接恢复顺序
- `FeedbackCoordinator` 已从零散 hook 组合器推进为最小 feedback runtime：当前统一接入 `artifact-invalid` / `self-eval-requested` / `memory-extraction` 三类信号，并能产出内存态 decision cycle，供 session / 宿主查询

### 代价与约束

- 新 runtime 契约当前位于 `@neko/agent` 包内，而非 `@neko/shared`
- 宿主需要显式构造 runtime plane，不能再随意向 `AgentSessionConfig` 散射新字段
- 新能力若影响 session 创建路径，必须优先评估是否应进入 runtime plane，而不是直接堆到宿主入口

## 后续演进

基于本 ADR，后续阶段按以下方向推进：

1. P1：真正把 `stageTracking`、`workspace`、run lifecycle、approval persistence 接进主链
2. P2：把 prompt / skill / command 编排统一收敛到 runtime-capability plane 可见的入口
3. P3：让 capability discovery 的 tool / skill / toolGroup 全部经过统一 runtime bootstrap 注入
4. P4-P5：让 artifact 与 feedback 形成正式 runtime 服务，而不是零散 helper
