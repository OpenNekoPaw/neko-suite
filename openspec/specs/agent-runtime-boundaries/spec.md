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
