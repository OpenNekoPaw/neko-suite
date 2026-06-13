## MODIFIED Requirements

### Requirement: Webview remains a UI and projection surface
The system SHALL keep `packages/neko-agent/packages/webview` responsible for rendering UI, collecting user interactions, sending typed Webview messages, and projecting received agent/workflow/task/artifact state. Webview MUST NOT import `vscode`, `@neko/agent`, `@neko/platform`, or `@neko/ai-sdk`, and MUST NOT implement agent turn assembly, provider selection, prompt generation, workflow planning, skill injection policy, tool execution policy, durable domain contribution inference, or prelaunch legacy compatibility projection. Webview compatibility helper shims MUST be deleted once callers use canonical presenters or protocol projections.

#### Scenario: Webview dependency guard passes
- **WHEN** the architecture guard scans Webview source files
- **THEN** it finds no direct imports from `vscode`, `@neko/agent`, `@neko/platform`, or `@neko/ai-sdk`

#### Scenario: Webview shows workflow state without owning strategy
- **WHEN** Webview receives a workflow run projection
- **THEN** it renders the run, nodes, tasks, subagents, and artifacts without generating the next workflow node or modifying runtime strategy

#### Scenario: Webview legacy helper shim is unreferenced
- **WHEN** a Webview helper file only re-exports canonical presenter functions and has no internal imports
- **THEN** it is removed instead of being retained as a compatibility surface

### Requirement: Extension remains a host adapter
The system SHALL keep `packages/neko-agent/packages/extension` responsible for VSCode commands, Webview `postMessage`, workspace/file access, URI conversion, Extension API access, provider/config injection, and lifecycle disposal. Extension MUST NOT own agent turn strategy, IDC stage strategy, prompt/schema generation policy, skill injection policy, workflow planning, evaluator scoring logic, or old unpublished protocol/schema compatibility. Extension MAY host adapter bridges only when they connect current runtime services to VSCode APIs and include explicit cleanup metadata if they are temporary.

#### Scenario: Agent turn bridge delegates assembly
- **WHEN** Extension handles a Webview send-message request
- **THEN** it creates host adapters and calls the runtime turn assembler instead of directly composing provider/settings/prompt/context/timeline/skill strategy

#### Scenario: Extension command bridge delegates business logic
- **WHEN** a VSCode command such as media generation, prompt building, model refresh, or internal chat is invoked
- **THEN** Extension collects host inputs and delegates business behavior to `@neko/agent/runtime` or `@neko/platform`

#### Scenario: Old compatibility command path is no longer used
- **WHEN** an Extension path only forwards to a canonical package entrypoint and no current imports remain
- **THEN** it is deleted and a guard prevents reintroducing the old path
