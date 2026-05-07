# agent-runtime-boundaries Specification

## Purpose
TBD - created by archiving change unify-neko-agent-runtime-workflow-boundaries. Update Purpose after archive.
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

