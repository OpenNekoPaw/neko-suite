# agent-execution-traceability Specification

## Purpose
TBD - created by archiving change improve-agent-traceability-and-session-boundaries. Update Purpose after archive.
## Requirements
### Requirement: Agent execution trace context is propagated across the turn
系统 SHALL 在每次 agent turn 开始时创建结构化 `AgentTraceContext`，并在 session、executor、think phase、act phase、hook chain、LLM service、tool registry、IDC workflow、approval、feedback、context compaction 和 subagent lifecycle 中传递该上下文。

`AgentTraceContext` MUST 至少能表达 `conversationId`、可选 `runId`、可选 turn identity、iteration、phase，以及下游 LLM/tool request identity。Trace 传递 MUST 使用显式参数、typed context 或 runtime metadata，不得依赖隐式全局可变状态。

#### Scenario: Session starts a traced turn
- **WHEN** `AgentSession.execute()` 接收用户输入并开始一次 turn
- **THEN** session 级 debug 日志包含 `trace.conversationId`、当前 execution mode、输入长度和可用的 `trace.runId`

#### Scenario: Executor iteration derives phase trace
- **WHEN** executor 进入某个 ReAct iteration 的 think、act 或 observe 阶段
- **THEN** 对应 debug 日志包含相同 `conversationId`、相同 `runId`、当前 iteration 和 phase

#### Scenario: Downstream request ids are linked to the parent trace
- **WHEN** LLM service 或 tool registry 生成自己的 `requestId`
- **THEN** 该请求日志包含本地 request id 和父级 trace 字段，使日志可以从 conversation/run/iteration 关联到具体 LLM 或 tool 调用

### Requirement: Execution hot path emits structured debug summaries
系统 SHALL 为执行热路径输出结构化 debug 摘要日志，覆盖 session entry/exit、iteration start/end、think start/end、act start/end、observe summary、hook entry/exit、tool partition、context compaction trigger/result/skip、IDC stage classification/activation、approval decision 和 subagent spawn/complete/error。

日志 payload MUST 默认使用摘要字段，例如 message count、tool count、tool names、duration、token count、compression ratio、decision reason 和 success/failure count。原始 prompt、原始 tool arguments、完整模型响应等敏感或大体积内容 MUST 只出现在现有 raw debug 通道或显式 raw 日志中。

#### Scenario: ReAct loop exposes iteration boundaries
- **WHEN** executor 完成一次包含 think、act、observe 的 iteration
- **THEN** debug 日志记录 iteration start、think end、act end、iteration end，并包含耗时、tool call 数量、tool result 成功/失败摘要和 token usage 摘要

#### Scenario: Hook chain exposes mutation and duration
- **WHEN** `MemoryHooks`、validation hooks、permission hooks、retry hooks 或 custom hooks 执行
- **THEN** hook debug 日志记录 hook name、event name、输入摘要、是否修改 context、耗时和错误/跳过原因

#### Scenario: Context compaction is diagnosable
- **WHEN** 自动或手动 context compaction 被触发、跳过或完成
- **THEN** debug 日志记录触发原因、压缩前后 token 数、压缩比例、失败次数或 circuit breaker 状态

### Requirement: Logger and EventBus remain complementary observability channels
系统 SHALL 保持 Logger 与 EventBus/JournalWriter 的职责分离。EventBus/JournalWriter MUST 继续记录可持久化的 high-level audit milestone；Logger MUST 提供实时开发调试所需的 fine-grained how/why 信息。

关键 workflow milestone MAY 同时写入 EventBus 和 Logger，但两者 payload MUST 符合各自职责：EventBus 记录审计事件，Logger 记录 trace、决策摘要、耗时和调试上下文。

#### Scenario: Stage activation is both auditable and debuggable
- **WHEN** IDC stage activation 被 planner 决定
- **THEN** EventBus 发出原有 activation event，并且 Logger 记录 trace、task shape、entry signal、activated stages、terminal stage 和 decision duration

#### Scenario: Journal replay does not depend on debug logs
- **WHEN** debug logging 被关闭
- **THEN** Journal/EventBus 仍然保留 run started、round activation、apply committed、run ended 等审计事件，不依赖 Logger 才能恢复 workflow projection

### Requirement: Trace-only metadata does not leak into provider payloads or tool arguments
系统 SHALL 防止 trace-only metadata 进入 provider-specific model payload、模型消息内容、模型 tool arguments 或用户可见 Webview protocol。Trace MAY 出现在 runtime metadata 和 structured log payload 中，但外部 provider adapter 接收的请求 MUST 只包含模型调用所需字段。

#### Scenario: Provider adapter receives no trace-only options
- **WHEN** platform service 使用 trace 调用 LLM provider adapter
- **THEN** adapter 收到的 provider options 和 projected messages 不包含 `AgentTraceContext` 或 trace-only 字段

#### Scenario: Tool arguments remain model-authored only
- **WHEN** tool registry 执行一个 traced tool call
- **THEN** tool arguments 与模型生成的 arguments 保持一致，trace 只存在于 runtime metadata 或日志 payload 中

### Requirement: Traceability is covered by targeted tests
系统 SHALL 为 trace propagation、日志 payload shape、hot-path instrumentation、raw content gating 和 provider payload isolation 提供 targeted tests。

#### Scenario: A test reconstructs a turn from logs
- **WHEN** 测试运行一次包含 LLM 调用和 tool 调用的 agent turn
- **THEN** 测试可以从 captured log entries 中按 `conversationId`、`runId`、iteration 和 request id 关联 session、executor、LLM 与 tool 日志

#### Scenario: Missing trace is reported without failing execution
- **WHEN** 轻量测试或 legacy caller 未提供 `conversationId` 或 `runId`
- **THEN** 日志 helper 以安全 fallback 记录可用字段，agent execution 不因缺少可选 trace 字段失败

