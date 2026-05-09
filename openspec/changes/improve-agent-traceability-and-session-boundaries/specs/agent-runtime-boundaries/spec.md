## ADDED Requirements

### Requirement: AgentSession remains a stable thin facade
系统 SHALL 保持 `IAgentSession` 作为 CLI、Extension、TUI 和测试可使用的稳定 facade。`AgentSession` MUST 委托具体 runtime 子域给 focused collaborators，而不是直接拥有这些子域的内部状态、定时器、持久化 sink、反馈循环、artifact 同步队列或 prompt module 细节。

Focused collaborators SHOULD cover runtime state persistence, IDC run lifecycle, artifact synchronization, feedback guidance/runtime bridge, prompt module orchestration, and trace-aware execution coordination. Public facade methods MUST remain source-compatible unless proposal/spec explicitly标记 breaking change。

#### Scenario: Facade delegates runtime persistence
- **WHEN** session 需要 restore、persist、flush 或 dispose IDC runtime state
- **THEN** `AgentSession` 通过 persistence collaborator 完成该行为，而不是直接管理 persistence timer、sink subscription 和 snapshot serialization 细节

#### Scenario: Facade delegates artifact synchronization
- **WHEN** draft、plan 或 task artifact 被写入、恢复或投射到 task plane
- **THEN** `AgentSession` 通过 artifact collaborator 或 artifact service 完成同步，不直接维护 artifact sync queue 和 projection cleanup 细节

#### Scenario: Public session behavior remains compatible
- **WHEN** 现有 caller 调用 `configure()`、`execute()`、`cancel()`、`confirmTool()`、history 方法、context compression 方法或 skill injection 方法
- **THEN** 方法签名和用户可见 AgentEvent 行为保持兼容

### Requirement: Runtime collaborators preserve package boundaries
系统 SHALL 将新增 runtime collaborators 放在 `packages/neko-agent/packages/agent` 的合适 runtime/session 子域中，并遵守现有依赖方向。Runtime collaborators MUST NOT import VSCode、React、Webview APIs 或 Extension-only modules。

Extension MAY assemble host adapters and inject dependencies. Webview MUST remain a UI/projection surface and MUST NOT import runtime collaborators.

#### Scenario: Runtime collaborator compiles without VSCode
- **WHEN** `@neko/agent` runtime/session collaborators 被 type-check
- **THEN** 它们不引用 `vscode.Event`、`vscode.Disposable`、React types 或 Webview-only APIs

#### Scenario: Extension remains host adapter
- **WHEN** Extension 创建 agent session 或 runner
- **THEN** Extension 注入 service、tool registry、workspace fsOps、logger 和 host callbacks，但不实现 trace propagation、IDC lifecycle、feedback coordination 或 artifact synchronization 策略

### Requirement: Session boundary regressions are guarded by tests
系统 SHALL 提供 targeted tests 或 architecture guard，用于防止 `AgentSession` 继续吸收新的 runtime 子域实现细节。Guard MUST 至少覆盖 forbidden imports、Webview/runtime 依赖方向，以及新增 session 字段是否属于允许的 facade state 或 collaborator reference。

#### Scenario: New runtime detail in AgentSession is reported
- **WHEN** 新增代码把 persistence sink、timer、feedback guidance state、artifact sync queue 或 stage transition buffer 直接加入 `AgentSession`
- **THEN** targeted test、architecture guard 或 review checklist 报告该状态应迁移到对应 collaborator

#### Scenario: Webview boundary remains enforced
- **WHEN** Webview source files 被 architecture guard 扫描
- **THEN** guard 继续阻止 Webview 导入 `@neko/agent`、`@neko/platform`、`@neko/ai-sdk` 或 `vscode`

### Requirement: Facade thinning is behavior-preserving and incremental
系统 SHALL 以增量方式瘦身 `AgentSession`。每次迁移一个子域到 collaborator 时，MUST 先保留或新增 characterization tests，证明 streaming execution、journal persistence、tool confirmation、history projection、context compression、IDC run close、artifact write/restore、feedback guidance 和 prompt sync 行为未回退。

#### Scenario: Execution stream remains equivalent after extraction
- **WHEN** `execute()` 内部逻辑迁移到 trace-aware execution coordinator 或其他 collaborator 后
- **THEN** 对相同 mock executor、journal writer、feedback coordinator 和 compressor 的输入，输出 AgentEvent 序列与迁移前保持等价

#### Scenario: Dispose releases collaborator resources
- **WHEN** session dispose 被调用
- **THEN** 所有由 persistence、artifact、feedback、IDC 或 prompt collaborators 注册的 subscriptions、watchers、timers 和 sinks 都被显式释放
