# agent-runtime-boundaries Specification

## Purpose
Defines dependency and responsibility boundaries for the Neko Agent Webview, Extension bridge, host-agnostic runtime, platform/provider bindings, and architecture guards.
## Requirements
### Requirement: Webview remains a UI and projection surface
The system SHALL keep `packages/neko-agent/packages/webview` responsible for rendering UI, collecting user interactions, sending typed Webview messages, and projecting received agent/workflow/task/artifact state. Webview MUST NOT import `vscode`, `@neko/agent`, `@neko/platform`, or `@neko/ai-sdk`, and MUST NOT implement agent turn assembly, provider selection, prompt generation, workflow planning, skill injection policy, or tool execution policy.

#### Scenario: Webview dependency guard passes
- **WHEN** the architecture guard scans Webview source files
- **THEN** it finds no direct imports from `vscode`, `@neko/agent`, `@neko/platform`, or `@neko/ai-sdk`

#### Scenario: Webview shows workflow state without owning strategy
- **WHEN** Webview receives a workflow run projection
- **THEN** it renders the run, nodes, tasks, subagents, and artifacts without generating the next workflow node or modifying runtime strategy

### Requirement: Extension remains a host adapter
The system SHALL keep `packages/neko-agent/packages/extension` responsible for VSCode commands, Webview `postMessage`, workspace/file access, URI conversion, Extension API access, provider/config injection, and lifecycle disposal. Extension MUST NOT own agent turn strategy, IDC stage strategy, prompt/schema generation policy, skill injection policy, workflow planning, or evaluator scoring logic.

#### Scenario: Agent turn bridge delegates assembly
- **WHEN** Extension handles a Webview send-message request
- **THEN** it creates host adapters and calls the runtime turn assembler instead of directly composing provider/settings/prompt/context/timeline/skill strategy

#### Scenario: Extension command bridge delegates business logic
- **WHEN** a VSCode command such as media generation, prompt building, model refresh, or internal chat is invoked
- **THEN** Extension collects host inputs and delegates business behavior to `@neko/agent/runtime` or `@neko/platform`

### Requirement: Agent runtime owns turn assembly
The system SHALL define host-agnostic runtime contracts for agent turn assembly. Runtime MUST assemble settings snapshots, provider source, base prompt, plan mode, active skill, workflow state, task manager, subagent policy, context packet, timeline packet, multimodal packet, and stream projection policy from typed inputs and host adapters.

#### Scenario: Turn assembly runs without VSCode
- **WHEN** a unit test invokes the turn assembler with mock host adapters
- **THEN** the assembler produces and executes an agent turn without importing or constructing VSCode objects

#### Scenario: Timeline context assembly is runtime-owned
- **WHEN** a user message includes editor or timeline context
- **THEN** Extension supplies raw host accessors and runtime builds the timeline/context packet used by the agent turn

### Requirement: Agent runner contract is host-agnostic
The system SHALL expose an `AgentRunnerPort` or equivalent runtime contract that does not extend `vscode.Disposable` and does not expose `vscode.Event`. Extension MAY adapt this contract to VSCode EventEmitter, but non-VSCode tests and future hosts MUST be able to consume the same runner contract.

#### Scenario: Runner port compiles without VSCode
- **WHEN** `@neko/agent/runtime` is type-checked in isolation
- **THEN** the runner port types compile without any `vscode` dependency

#### Scenario: VSCode runner adapter preserves lifecycle
- **WHEN** Extension creates a runner for a chat conversation
- **THEN** the VSCode adapter forwards start/stop/confirmation/subagent events and disposes runtime resources through the host-agnostic port

### Requirement: Platform and AI SDK remain host-agnostic
The system SHALL keep `@neko/platform` responsible for provider/tool/capability concrete bindings and keep `@neko/ai-sdk` responsible for model invocation adapters. These packages MUST NOT import VSCode, React, or Webview-specific APIs.

#### Scenario: Provider runtime can run in tests
- **WHEN** a provider or tool runtime is executed in a pure Node test
- **THEN** it can run with injected config/logger/tool dependencies and no VSCode/Webview globals

### Requirement: Architecture guard prevents boundary regression
The system SHALL provide automated checks for forbidden imports and known soft-boundary regressions. The checks MUST fail when Webview imports core agent runtime, when core runtime imports VSCode, when Extension imports React, or when Extension owns newly introduced agent strategy modules without a runtime counterpart.

#### Scenario: Forbidden import fails validation
- **WHEN** a developer adds `import * as vscode from 'vscode'` to `@neko/agent/runtime`
- **THEN** the architecture guard fails and reports the offending file

#### Scenario: Known thick bridge is tracked
- **WHEN** `AgentTurnBridge` or `AgentRunner` still contains compatibility code
- **THEN** the guard or targeted tests identify the compatibility path so it cannot silently expand

### Requirement: Task lifecycle coordination remains compose-only
The Extension layer MAY provide a task lifecycle coordinator to connect Agent session interruption events, task metadata queries, and task or subagent cancellation ports. This coordinator SHALL be compose-only bridge wiring and MUST NOT own domain interruption policy, define lifecycle metadata defaults, advance task cost phase, write task or recovery storage, or generate Dashboard projections.

#### Scenario: Agent interruption event is bridged to cancellation ports
- **WHEN** Agent session code publishes a conversation interruption event
- **THEN** the Extension bridge coordinator queries task lifecycle metadata through a read-only port and invokes only the relevant cancellation ports

#### Scenario: Coordinator does not define policy
- **WHEN** a task's interrupt policy is evaluated during session interruption
- **THEN** the policy value comes from shared task lifecycle metadata and domain/runtime state rather than from hard-coded coordinator defaults

#### Scenario: Coordinator does not own projection
- **WHEN** Dashboard task rows or Chat replay payloads are generated
- **THEN** they are generated by the task projection/delivery services rather than by the lifecycle coordinator

### Requirement: Agent manager does not directly own task manager lifecycle
Agent session or manager code SHALL NOT directly depend on concrete `TaskManager` lifecycle operations to implement user Stop semantics. It MUST publish a session interruption event or call an injected narrow callback, allowing bridge composition to coordinate task cancellation without coupling Agent session internals to task manager implementation.

#### Scenario: Stop publishes interruption event
- **WHEN** a user stops an Agent conversation
- **THEN** Agent manager/session code cancels the foreground turn and publishes or calls a narrow interruption signal containing the conversation id and reason

#### Scenario: Stop does not import concrete task manager
- **WHEN** Agent manager/session code is type-checked
- **THEN** it does not import the concrete `TaskManager` implementation or call task-manager-specific lifecycle methods for async task cancellation

### Requirement: Session collaborator failure paths are covered by focused tests
The system SHALL provide focused tests for session collaborator failure paths
that are observable through public collaborator methods. Tests MUST cover
restore failures, persistence disposal warnings, background artifact sync
failures, task projection failures, feedback guidance persistence failures, and
prompt facade boundary cases without constructing a full `AgentSession`.

#### Scenario: Persistence dispose failure is warned
- **WHEN** `SessionPersistence` replaces or disposes a runtime state store whose
  async `dispose()` rejects
- **THEN** focused tests verify that the collaborator reports a warning and
  continues cleanup without throwing synchronously

#### Scenario: Artifact restore and write failures are tested
- **WHEN** `SessionArtifactFacade` restore rejects or an artifact write rejects
- **THEN** focused tests verify that restore failures are warned, write failures
  propagate to the caller, and the facade remains usable for later operations

#### Scenario: Background artifact queues swallow and warn
- **WHEN** observed artifact sync or IDC task projection work rejects inside a
  queued background operation
- **THEN** focused tests verify that the queue emits a warning, `flush()` still
  resolves, and later queued operations can still run

#### Scenario: Feedback guidance persistence failure is explicit
- **WHEN** `FeedbackRuntimeBridge` receives control-plane guidance but the stage
  transition persistence callback rejects
- **THEN** focused tests verify whether `captureCycle()` rejects or logs the
  failure according to the current collaborator contract

#### Scenario: Prompt facade boundary cases are tested independently
- **WHEN** `PromptRuntimeFacade` syncs prompts with no executor, no system
  history message, or empty composed sections
- **THEN** focused tests verify history behavior, executor cache updates, and
  debug summaries without relying on feedback bridge tests

### Requirement: Session collaborators expose focused capability ports
The system SHALL keep session runtime collaborators dependent on focused,
named capability ports rather than broad anonymous callback bags that implicitly
capture `AgentSession` internals. A collaborator MAY receive multiple ports, but
each port MUST represent one cohesive capability such as persistence scheduling,
IDC run storage, artifact synchronization, feedback guidance, or prompt sync.

#### Scenario: Collaborator port does not expose full session state
- **WHEN** a session collaborator needs to read or write runtime subdomain data
- **THEN** it receives a narrow port for that subdomain instead of a callback
  set that can access unrelated `AgentSession` fields

#### Scenario: AgentSession assembles collaborators without changing public API
- **WHEN** `AgentSession` constructs session collaborators
- **THEN** it wires focused ports internally while preserving existing
  `IAgentSession` methods and user-visible events

### Requirement: Session collaborators have focused unit coverage
The system SHALL provide focused unit tests for `SessionPersistence`,
`IdcRunLifecycle`, `SessionArtifactFacade`, `FeedbackRuntimeBridge`, and
`PromptRuntimeFacade`. These tests MUST cover behavior observable through each
collaborator's public methods, including resource cleanup and relevant trace
debug summaries.

#### Scenario: Persistence collaborator is tested independently
- **WHEN** `SessionPersistence` restores, schedules persistence, flushes, or
  disposes runtime state
- **THEN** focused tests verify sink calls, debounce behavior, restore fallback,
  and cleanup without constructing a full `AgentSession`

#### Scenario: Artifact collaborator is tested independently
- **WHEN** `SessionArtifactFacade` restores artifacts, creates write context, or
  drains sync/projection queues
- **THEN** focused tests verify artifact service interaction and queue cleanup
  without relying only on `AgentSession` characterization tests

#### Scenario: Feedback and prompt collaborators are tested independently
- **WHEN** feedback cycle capture, guidance application, prompt sync, or prompt
  cache refresh occurs
- **THEN** focused tests verify collaborator-level behavior and trace/log
  summaries without requiring an end-to-end session turn

### Requirement: Phase trace derivation does not mutate shared agent context
The system SHALL derive phase-local trace contexts through explicit local values,
typed phase dependencies, or return values. Executor, think, act, and observe
paths MUST NOT rely on overwriting shared `AgentContext.trace` to communicate
the active phase.

#### Scenario: Think phase receives explicit trace
- **WHEN** executor enters the think phase
- **THEN** it passes a phase trace explicitly and leaves the turn-level
  `AgentContext.trace` value stable for later phases

#### Scenario: Act phase receives explicit trace
- **WHEN** executor enters the act phase or dispatches tool calls
- **THEN** tool execution receives the derived tool trace through typed runtime
  options rather than through mutation of shared context

#### Scenario: Trace integration remains reconstructable
- **WHEN** a traced session turn emits session, executor, LLM, tool, compaction,
  approval, feedback, and subagent logs
- **THEN** logs can still be reconstructed by conversation, run, turn,
  iteration, phase, and downstream request ids

### Requirement: AgentSession field ownership guard reports high-risk categories
The system SHALL guard new `AgentSession` private fields by both allowlist and
high-risk ownership categories. New fields that directly own timers, persistence
sinks, artifact or task queues, feedback guidance state, IDC transition buffers,
or prompt module instances MUST be reported unless they are explicitly
documented as legacy migration debt or collaborator references.

#### Scenario: New queue field is reported
- **WHEN** a new private field with queue-like ownership is added directly to
  `AgentSession`
- **THEN** the architecture guard reports that the queue belongs in the relevant
  collaborator or facade

#### Scenario: New prompt module instance is reported
- **WHEN** a new prompt module instance field is added directly to
  `AgentSession`
- **THEN** the architecture guard reports that prompt module ownership belongs
  behind `PromptRuntimeFacade` or the prompt orchestrator

#### Scenario: Collaborator references remain allowed
- **WHEN** `AgentSession` holds a reference to a focused runtime collaborator
- **THEN** the architecture guard allows the field if it is an approved facade
  collaborator reference and does not own subdomain internals directly

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

### Requirement: Agent Webview projects character dialogue as a distinct conversation kind
The Agent Webview SHALL project Character Dialogue sessions with a `character-dialogue` conversation kind. Webview MUST NOT use `npc-test` as the active conversation kind for new role workflow sessions.

#### Scenario: Character dialogue tab renders isolated session state
- **WHEN** the Extension sends a Character Dialogue session projection to the Webview
- **THEN** the Webview renders a `character-dialogue` tab with character identity, profile inspection, transcript messages, and exit controls

#### Scenario: Character dialogue hides authoring controls
- **WHEN** the active conversation kind is `character-dialogue`
- **THEN** the Webview hides ordinary model selector, execution mode selector, and media generation controls for that tab

### Requirement: Agent extension owns character role command dispatch
The Agent Extension SHALL register core commands for `neko.agent.characterDialogue` and `neko.agent.embodyCharacter`. The Extension MUST NOT register `neko.agent.testNpc`, `neko.agent.characterPerspective`, `neko.agent.validateCharacter`, or `neko.agent.improveCharacter` as public core commands after this migration.

#### Scenario: Character dialogue command launches isolated session
- **WHEN** the Extension receives a valid `neko.agent.characterDialogue` request
- **THEN** it focuses the Agent panel and delegates launch to the character dialogue controller

#### Scenario: Embody command starts isolated feedback session
- **WHEN** the Extension receives a valid `neko.agent.embodyCharacter` request
- **THEN** it focuses the Agent panel and delegates launch to an Embody Character controller/runtime path that does not impersonate the character and does not route through ordinary creative message handling

### Requirement: Skill automation composes primitive ports
The Agent runtime and Extension SHALL expose character role primitives through narrow ports that Skills can compose. Automated validation and improvement MUST NOT be implemented as Webview-owned session kinds or Dashboard-owned runtime workflows.

#### Scenario: Validation Skill uses primitive ports
- **WHEN** the character validation Skill runs
- **THEN** it can assemble a character profile, run no-tool headless dialogue probes, evaluate transcript evidence, and save project-scoped artifacts through Agent-owned primitive ports

#### Scenario: Improvement Skill uses suggestion ports
- **WHEN** the character improvement Skill runs
- **THEN** it can collect project evidence and produce suggestions that route through existing user-confirmed entity mutation ports

### Requirement: Character role modes enforce capability policy below Webview
The Agent system SHALL enforce Character Dialogue and Embody Character capability policies in Extension/runtime/controller layers rather than relying on Webview presentation or prompt text alone.

#### Scenario: Webview cannot grant creative tools
- **WHEN** Webview sends a message from an `embody-character` tab
- **THEN** Extension/runtime routing determines the isolated feedback session and blocked capabilities regardless of client-side UI state

#### Scenario: Prompt-only restrictions are insufficient
- **WHEN** a role mode forbids creative authoring or skill activation
- **THEN** the forbidden tools and skills are removed from the responder capability surface before LLM execution rather than only described as prompt instructions

### Requirement: Embody Character owns a runtime counterpart
The Agent Extension SHALL NOT own Embody Character strategy as an ad hoc ordinary chat prompt. A host-agnostic runtime session or equivalent domain primitive SHALL define Embody Character turn semantics, transcript behavior, and capability policy.

#### Scenario: Extension delegates turn semantics
- **WHEN** Extension routes an Embody Character user message
- **THEN** it delegates the turn to an Embody Character runtime/session primitive with injected host adapters instead of composing feedback behavior inside Webview or command glue

#### Scenario: Runtime compiles without Webview
- **WHEN** Embody Character runtime tests run in `@neko/agent`
- **THEN** they can exercise turn behavior and capability policy without importing React, VSCode Webview code, or Dashboard implementation modules

### Requirement: SubAgent tool policy is explicit
The system SHALL support an explicit SubAgent tool policy with `none`, `all`, and `allow-list` modes. The runtime MUST interpret `none` as an empty tool registry, `all` as the full available registry, and `allow-list` as a filter over registered tool names. New isolation-sensitive sessions MUST NOT rely on `allowedTools: []` to mean no tools.

#### Scenario: None policy creates empty registry
- **WHEN** a SubAgent or Character Dialogue session is created with `toolPolicy: { kind: 'none' }`
- **THEN** the Agent config passed to the executor contains zero tool definitions

#### Scenario: Allow-list filters tools
- **WHEN** a SubAgent is created with `toolPolicy: { kind: 'allow-list', tools: ['Read'] }`
- **THEN** the executor receives only the registered `Read` tool definition and no other tools

#### Scenario: All policy preserves unfiltered behavior
- **WHEN** a SubAgent is created with `toolPolicy: { kind: 'all' }`
- **THEN** the executor receives the unfiltered tool registry available to that runtime

### Requirement: Character Dialogue runtime sessions preserve Agent boundaries
The system SHALL keep Character Dialogue session orchestration in Extension host and host-agnostic Agent runtime boundaries. Webview MUST render Character Dialogue session projections only; Extension MUST manage VSCode command handling, project-root resolution, and character role artifact file writes; runtime packages MUST NOT import VSCode, React, or Webview APIs to implement character prompt or evaluator projection.

#### Scenario: Webview renders Character Dialogue projection only
- **WHEN** the Agent Webview displays a Character Dialogue tab
- **THEN** it consumes typed Character Dialogue session projection data and does not import `@neko/agent`, `@neko/platform`, or VSCode APIs

#### Scenario: Extension owns project file write
- **WHEN** a Character Dialogue transcript or evaluation artifact is saved
- **THEN** Extension host code resolves the current project root and writes `.neko/character-tests/*.json` through host file APIs

#### Scenario: Runtime projector remains host-agnostic
- **WHEN** Character Dialogue prompt and evaluator projector modules are type-checked
- **THEN** they compile without VSCode, React, Webview, Story, Dashboard, or entity store implementation imports
