## Context

`improve-agent-traceability-and-session-boundaries` 已经把
`SessionPersistence`、`IdcRunLifecycle`、`SessionArtifactFacade`、
`FeedbackRuntimeBridge`、`PromptRuntimeFacade` 从 `AgentSession` 中提取出来，
并用 architecture guard 阻止 Webview/Extension/runtime 依赖方向回退。

剩余问题集中在三类：

- 协作者 options 里存在较多 lambda 回调，降低了字段所有权，但仍把
  `AgentSession` 的内部上下文以闭包形式暴露给协作者。
- 协作者缺少独立单元测试，当前主要依赖 `AgentSession` characterization 和
  集成路径兜底。
- executor phase trace 仍有局部通过 `agentContext.trace = ...` mutation 派生的
  代码路径，未来如果执行循环并发化，容易出现共享上下文 trace 被覆盖的问题。

修改前的三个架构判断：

- 是否符合现有架构：符合。该变更继续沿用 DI、契约优先、runtime collaborator
  和 architecture guard 模式。
- 如何进一步降低耦合：把 lambda option bags 收敛为小 port 接口，让协作者依赖
  能力而不是 `AgentSession` 闭包；对 phase trace 使用显式局部值。
- 是否易于扩展与测试：是。每个 collaborator 的端口、dispose、错误路径和 trace
  summary 都可以通过 focused unit tests 验证。

五层分析：

- 职责：`AgentSession` 保持 facade 和 turn 编排入口；协作者拥有各自子域状态；
  ports 表达跨边界能力。
- 依赖：runtime/session 协作者仍只依赖 agent/shared 类型，不引入 VSCode、React、
  Webview 或 Extension 模块。
- 接口：新增或收敛小接口，例如 persistence clock/sink、IDC run store port、
  artifact queue port、feedback guidance port、prompt sync port。
- 扩展：后续拆 `ExecutionOrchestrator` 或 `FeedbackObserver` 时，可以复用这些
  port，而不是继续向 `AgentSession` 增加闭包。
- 测试：先补 collaborator unit tests，再调整 options/trace 传递，并用 guard
  阻止字段所有权回退。

## Goals / Non-Goals

**Goals:**

- 为五个 session collaborators 增加独立单元测试，覆盖正常路径、空依赖路径、
  dispose/flush、错误或 skip 路径，以及 trace summary。
- 将高耦合 collaborator option bags 收敛为命名 port 接口，优先处理回调数量最多、
  状态最复杂的 `IdcRunLifecycle` 和 `SessionArtifactFacade`。
- 避免 think/act/observe phase 通过修改共享 `AgentContext.trace` 来表达局部 trace。
- 扩展 architecture guard，按字段类别报告新增 timer、sink、queue、guidance state、
  transition buffer、prompt module instance 等直接 session 状态。
- 保持公开 session API、Webview 协议、provider payload、tool arguments 和现有日志
  payload source-compatible。

**Non-Goals:**

- 不一次性把 `AgentSession` 压缩到 600 行。
- 不重写 ReAct loop、approval strategy、artifact service、feedback evaluator 或 prompt
  module orchestrator。
- 不归档前一个 OpenSpec change；本变更可以在其实现结果之上继续迭代。
- 不引入外部 tracing/telemetry 依赖。

## Decisions

### Decision 1: 先补 collaborator 单测，再改边界

每个 collaborator 增加 focused unit tests：

- `SessionPersistence`：restore gate、persist debounce、flush、dispose、sink cleanup。
- `IdcRunLifecycle`：start/restore/close、stage transition buffering、missing store fallback。
- `SessionArtifactFacade`：artifact restore、write context、observed artifact sync queue、
  task projection queue、dispose cleanup。
- `FeedbackRuntimeBridge`：cycle capture/skip、guidance snapshot、control-plane guidance
  application、trace-aware debug summary。
- `PromptRuntimeFacade`：prompt sync、system prompt composition、executor cache section update。

替代方案是先重构 options，再补测试。拒绝原因：当前协作者是新边界，先加测试能把
后续 port 收敛的行为风险降到最低。

### Decision 2: 用小 port 接口替代宽 callback bags

协作者 options 可以保留构造时注入，但注入对象应按能力命名，而不是大量匿名回调。
例如：

- `IdcRunLifecyclePorts` 聚合 run store、event sink、stage transition writer、clock。
- `SessionArtifactPorts` 聚合 artifact service、history/projector、task projection sink。
- `PromptRuntimePorts` 聚合 prompt orchestrator、composer、executor prompt cache。

端口接口必须小而专注，允许一个协作者拥有多个 port，但不允许一个 port 暴露完整
session 状态。

替代方案是把所有依赖合并成一个 `SessionRuntimeContext`。拒绝原因：这会形成新的
God context，只是把 `AgentSession` 字段换了名字。

### Decision 3: Phase trace 使用显式局部变量

`AgentContext.trace` 可以作为 turn-level 输入存在，但 phase 派生应通过局部常量或
phase deps 显式传递，例如 `const thinkTrace = deriveAgentTraceContext(baseTrace, ...)`。
如果某个下游必须知道 phase trace，应通过函数参数、deps 或返回值携带，而不是覆盖
共享 context。

替代方案是保留 mutation 并靠当前同步循环保证安全。拒绝原因：这把并发化约束藏在
实现细节里，后续 subagent/parallel tool expansion 会放大风险。

### Decision 4: Guard 报告新增类别，而不是追求立即清零

当前 `AgentSession` 仍有历史字段，guard 继续允许 legacy 白名单，但新增字段必须
通过类别规则检查。字段名或类型命中 `Timer`、`Sink`、`Queue`、`GuidanceState`、
`TransitionBuffer`、`PromptModule` 等高风险类别时，测试应提示迁移到 collaborator
或对应 facade。

替代方案是立刻缩短白名单到 10 个字段。拒绝原因：会把本次目标扩大为大规模重构，
也会掩盖真正要防止的新增状态回退。

## Risks / Trade-offs

- Port 接口过度抽象导致间接性上升 -> 每个 port 只服务一个 collaborator 子域，
  并用单测证明可读性与行为。
- 单测过度 mock 内部细节 -> 测试公共方法、可观察副作用、trace 日志和 dispose 行为，
  避免断言私有实现。
- Phase trace 改造遗漏某个日志点 -> 复用现有 trace integration test，并补充
  focused assertion 覆盖 think/act/observe trace 不覆盖 turn trace。
- Guard 对历史字段过于宽松 -> 明确区分 legacy allowlist 和 new-field category
  violation，在文档中记录剩余迁移债务。

## Migration Plan

1. 为五个 collaborators 增加 focused unit tests，先锁定现有行为。
2. 把 `IdcRunLifecycle` 与 `SessionArtifactFacade` 的高耦合 option bags 收敛为小 port
   接口，保持构造调用点行为不变。
3. 将 executor phase trace 派生改为显式局部变量/phase deps，保留日志 payload 兼容。
4. 扩展 architecture guard，按新增字段类别报告 session 边界回退。
5. 运行 collaborator 单测、trace 集成测试、architecture guard、package compile 和
   `pnpm check`；若仓库基线仍失败，记录与本变更无关的失败项。

Rollback 策略：port 接口是内部重构；如果某个协作者收敛出现风险，可以保留单测和
trace mutation 修复，只回退该协作者的 options 形态。

## Open Questions

- 是否在本变更中提取 `ExecutionOrchestrator`，还是作为下一轮专门 change？
- prompt module 10 个实例是否立即迁移到 `PromptRuntimeFacade`，还是先用 guard 标记为
  legacy field debt？
