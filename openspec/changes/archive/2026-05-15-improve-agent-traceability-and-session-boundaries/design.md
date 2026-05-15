## Context

`neko-agent` 的核心包已经具备清晰的分层、适配器、注册表、hook 链、EventBus 与 JournalWriter，但当前调试体验存在两个相互放大的缺口。

第一，执行链路缺少一等 trace 契约。`conversationId`、IDC `runId`、LLM `requestId`、tool `requestId` 与 Journal `eventId` 分散在各自模块内，日志无法从一次用户消息重建完整调用链。LLM service 与 tool registry 已有较完整的 debug 日志，但 executor、think/act phase、hooks、context compaction、stage activation、approval、subagent lifecycle 缺少同等粒度。

第二，`AgentSession` 目前同时持有 session state、runtime persistence、IDC lifecycle、artifact sync、feedback guidance、prompt modules、approval、autoheal、journal 与 compaction 状态。它作为 CLI、Extension、TUI 的统一 Facade 是合理的，但实现层对内部状态知道过多，导致新增 trace 或拆分运行时边界时很容易继续扩大该类。

修改前的三个架构判断：

- 是否符合现有架构：符合。该变更沿用现有 Logger、EventBus、JournalWriter、ExecutorHooks、runtime service 与 DI 模式，不引入跨层依赖。
- 如何进一步降低耦合：通过显式 trace 调用上下文和 focused runtime collaborators，把观测数据、持久化、反馈、artifact、IDC 生命周期从 `AgentSession` 具体实现中剥离。
- 是否易于扩展与测试：是。trace payload、hook 日志、phase 边界和 facade delegation 都可以通过 mock logger、mock service、mock tool registry 与 architecture guard 做单元验证。

五层分析：

- 职责：Logger 负责实时调试，EventBus/Journal 负责审计；Session 负责统一入口，协作者负责具体 runtime 子域。
- 依赖：`agent` 可依赖 `@neko/shared` 的 trace 类型；`platform` 可消费 trace 调用上下文；Webview 和 Extension 不接触 trace 实现细节。
- 接口：新增可选 trace 上下文与 helper，保持 `IAgentSession` 与用户可见协议兼容。
- 扩展：后续可把 trace 投射到诊断面板、测试快照或 telemetry sink，而不改变执行主链 API。
- 测试：先用结构化日志 payload 单测和无 provider 泄漏测试兜底，再逐步补 runtime 边界 guard。

## Goals / Non-Goals

**Goals:**

- 为一次 agent turn 建立稳定的 `AgentTraceContext`，贯穿 session、executor、think/act、hooks、LLM service、tool registry、IDC、feedback、approval、compaction、subagent 路径。
- 在执行热路径补齐结构化 debug 日志，能按 `conversationId`、`runId`、iteration、phase、LLM requestId、tool requestId 过滤并重建调用链。
- 保持 Logger 与 EventBus 的职责分离：Logger 解释 how/why，EventBus/Journal 记录 what happened。
- 将 `AgentSession` 从细节拥有者收敛为薄 Facade，优先抽出 runtime state persistence、IDC lifecycle、artifact sync、feedback runtime bridge、prompt runtime facade。
- 保持现有 CLI、Extension、TUI、Webview 行为兼容。

**Non-Goals:**

- 不替换现有 Logger 基础设施，不要求引入 OpenTelemetry、AsyncLocalStorage 或外部 tracing 服务。
- 不改变 Webview 协议，不新增用户可见调试 UI。
- 不重写 ReAct loop、IDC planner、approval strategy、feedback evaluator 或 provider adapter。
- 不把所有大文件一次性拆完；本变更聚焦可追踪执行链和 `AgentSession` 最有风险的边界。

## Decisions

### Decision 1: 新增 AgentTraceContext，但不修改 LogEntry 结构

定义 agent 专用的 `AgentTraceContext`，至少包含：

- `conversationId`
- `runId?`
- `turnId?`
- `iteration?`
- `phase?`
- `parentRequestId?`
- `llmRequestId?`
- `toolRequestId?`

日志 helper 统一把 trace 放入 `data.trace`，例如 `withTrace(trace, payload)`。`LogEntry` 继续保持 L0 logger 抽象，不加入 agent 专用字段。

替代方案：

- 修改 `LogEntry` 增加 trace 字段。拒绝原因：会把 agent 语义推入 `neko-types` 的通用 logger 层，影响其他包。
- 使用 AsyncLocalStorage。拒绝原因：Webview、测试、未来非 Node host 的一致性较差，也会隐藏依赖传递。

### Decision 2: 显式传递调用上下文，不把 trace 混入 provider options

executor 与 phase 通过 `AgentContext.trace` 或等价显式字段传递 trace。LLM service 使用独立的可选 `ServiceCallContext` 接收 trace，而不是把 trace 放进 `ServiceOptions`。Tool registry 可通过 `ToolExecuteOptions` 的 runtime metadata 或显式 trace 字段记录 trace，但 tool arguments MUST 保持不变。

替代方案：

- 把 trace 放入 `ServiceOptions`。拒绝原因：`ServiceOptions` 会被投影到 provider chat options，容易把观测字段泄露到 provider adapter 或外部请求。
- 只在 logger 调用点手工拼字段。拒绝原因：容易遗漏，且无法统一 requestId 关联。

### Decision 3: 先补执行链 trace，再拆 AgentSession

实施顺序先建立 trace 类型、日志 helper、executor/hooks/service/tool registry 贯穿，然后抽 `AgentSession` 协作者。这样拆分过程本身可以被 trace 与测试验证。

替代方案：

- 先全面重构 `AgentSession`。拒绝原因：没有调用链观测时，重构回归更难定位。
- 只加日志不拆边界。拒绝原因：会继续把新状态与新 helper 堆进 `AgentSession`，加重根因。

### Decision 4: AgentSession 保留 Facade API，内部按子域协作者收敛

优先抽取以下协作者：

- `SessionPersistence`：runtime snapshot restore/persist、sink/timer、dispose/flush。
- `IdcRunLifecycle`：run start/close/restore、stage transitions、run-bound event projection。
- `SessionArtifactFacade`：artifact restore、write context、sync queue、task projection bridge。
- `FeedbackRuntimeBridge`：feedback cycle capture、guidance state、control-plane action application。
- `PromptRuntimeFacade`：prompt module sync、system prompt refresh、prompt cache options。

`AgentSession` 保留 `IAgentSession` 方法与少量执行入口编排；公开方法应委托到协作者或 executor。

替代方案：

- 直接拆成多个 public session 类。拒绝原因：会破坏 CLI/Extension/TUI 的统一入口。
- 仅移动私有函数但继续共享所有字段。拒绝原因：降低行数但不降低耦合。

### Decision 5: EventBus 与 Logger 双写关键阶段，但语义不同

IDC stage activation、apply committed、autoheal、run start/end 等高层 milestone 继续走 EventBus/Journal；同一节点需要实时诊断时补充 Logger debug，payload 包含 trace、阶段、决策摘要与耗时。Logger 不替代持久审计。

替代方案：

- 只依赖 EventBus。拒绝原因：EventBus 粒度偏审计，不解释 hook 链、工具过滤、压缩比、分区策略等调试问题。
- 把所有 debug 日志也持久化。拒绝原因：成本、噪声和敏感内容风险过高。

## Risks / Trade-offs

- Trace 字段散落导致格式不一致 -> 通过 `AgentTraceContext` 类型、`deriveTrace()`、`withTrace()` helper 和日志 payload 测试约束。
- Debug 日志过多影响开发体验 -> 默认只记录摘要；原 `.raw` 日志保持现有显式 raw 语义，不扩大默认敏感内容面。
- Trace metadata 泄露到 provider 请求 -> 新增 provider adapter 假实现测试，断言 trace 不进入 provider payload、tool arguments 或 message content。
- `AgentSession` 拆分引入行为回归 -> 先加 characterization tests，再按协作者逐步迁移，每一步保持 `IAgentSession` 行为不变。
- 协作者过多导致间接性上升 -> 每个协作者只拥有一个子域状态，Session constructor/factory 负责装配，公共入口保持少量清晰委托。

## Migration Plan

1. 新增 trace 类型、日志 helper 和测试，不改变现有行为。
2. 在 session/executor/think/act/hooks/service/tool registry 中贯穿 trace，并补齐结构化 debug 日志。
3. 为 context compaction、IDC stage activation、approval、subagent lifecycle 增加 trace-aware 摘要日志。
4. 抽取 `SessionPersistence`、`IdcRunLifecycle`、`SessionArtifactFacade`、`FeedbackRuntimeBridge`、`PromptRuntimeFacade`，每一步保留现有 facade 方法。
5. 增加 architecture guard 或 targeted tests，防止 Webview/Extension/runtime 边界回退，以及防止 trace-only 字段进入 provider payload。
6. 运行 `pnpm check`、相关 Vitest，以及必要的包级测试。

Rollback 策略：trace 字段均为可选 additive 字段；若某个协作者迁移出现问题，可保留 helper 和日志，回退该协作者迁移而不影响公开 API。

## Open Questions

- `turnId` 是否直接复用 Journal `eventId`，还是生成独立 turn-level id？
- 是否需要把 debug trace 投射到未来诊断 UI，还是仅保留 OutputChannel/console 可读日志？
- `AgentSession` 的目标行数是否作为硬性 guard，还是仅以私有字段类别和新增状态所有权作为 guard？
