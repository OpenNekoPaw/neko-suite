## ADDED Requirements

### Requirement: Agent config snapshots flow through canonical host adapters

Agent config and settings snapshots SHALL be exposed through the canonical Agent host runtime path for VSCode and Electron, while TUI consumes the same platform config runtime directly through the Node adapter.

#### Scenario: VSCode Agent opens a Webview surface

- **WHEN** Agent Webview opens inside VSCode and requests a config/settings snapshot
- **THEN** the VSCode Agent host adapter MUST load the snapshot through the canonical platform/config runtime
- **AND** the response MUST use the shared Agent host message contract

#### Scenario: Desktop Agent opens a Webview surface

- **WHEN** Agent Webview opens inside Desktop and requests a config/settings snapshot
- **THEN** the Electron Agent host adapter MUST load the snapshot through the same platform/config runtime
- **AND** it MUST surface missing, invalid, empty, or unreadable config diagnostics rather than returning fake provider/model data

#### Scenario: TUI starts an Agent session

- **WHEN** TUI starts or resumes an Agent session
- **THEN** the Node adapter MUST read the effective config through the shared platform/config runtime
- **AND** it MUST NOT depend on Webview host messages for config parity

### Requirement: Settings updates remain runtime-scoped

Agent settings updates sent through VSCode or Electron host adapters SHALL remain runtime/session-scoped unless an explicit config authoring flow is invoked.

#### Scenario: Webview updates runtime settings

- **WHEN** Agent Webview sends an update for execution mode, prompt mode, selected model, or another runtime setting through the host adapter
- **THEN** the host adapter MUST route it to runtime/session settings logic
- **AND** it MUST NOT write user or workspace TOML config files as a side effect
