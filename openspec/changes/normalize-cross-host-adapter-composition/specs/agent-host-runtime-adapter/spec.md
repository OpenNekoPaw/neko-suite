## ADDED Requirements

### Requirement: Agent Webview consumes an injected host runtime

The Agent Webview SHALL communicate with its host through an injected host runtime adapter or equivalent context facade instead of treating VSCode transport as the cross-host API.

#### Scenario: Agent Webview sends a host message

- **WHEN** Agent Webview UI sends a conversation, settings, task, skill, project search, file, plugin, or capability message
- **THEN** it MUST send the message through the injected Agent host runtime adapter
- **AND** the Webview component MUST NOT directly depend on `window.vscodeApi` or a concrete Electron IPC bridge for that behavior

#### Scenario: Agent Webview receives a host message

- **WHEN** the host sends settings, config, conversation, task, skill, diagnostic, stream, or capability messages to Agent Webview
- **THEN** the injected adapter MUST deliver the message only to the owning Agent runtime
- **AND** the Agent Webview MUST process the same typed message contract across VSCode and Electron hosts

### Requirement: VSCode implements the Agent host runtime adapter

The VSCode host SHALL implement the Agent host runtime adapter by wrapping the Extension Webview transport and existing Agent route handlers.

#### Scenario: VSCode Agent Webview is mounted

- **WHEN** Agent Webview runs inside VSCode
- **THEN** the VSCode adapter MUST delegate transport to the canonical VSCode Webview bridge and Extension Host message router
- **AND** existing VSCode config, conversation, task, skill, file, command, and capability behavior MUST remain available through the adapter

### Requirement: Electron implements the Agent host runtime adapter

The Electron/Desktop host SHALL implement the Agent host runtime adapter through scoped preload and main-process IPC channels.

#### Scenario: Desktop Agent Webview requests config

- **WHEN** Desktop Agent Webview requests settings or config snapshots
- **THEN** Electron host adapter MUST read the same platform config runtime used by other Agent hosts
- **AND** it MUST return typed settings/config messages or explicit diagnostics rather than fake connected state

#### Scenario: Desktop Agent Webview requests an unsupported route

- **WHEN** Desktop receives a valid Agent message type whose route has not been implemented
- **THEN** Electron host adapter MUST return an unsupported-route diagnostic naming the message type
- **AND** it MUST NOT return an empty successful snapshot as a placeholder for missing behavior

### Requirement: TUI maps Agent behavior to runtime services

TUI SHALL remain the Node/headless adapter for Agent runtime behavior and SHALL NOT be required to implement Webview transport for parity.

#### Scenario: TUI starts an Agent session

- **WHEN** the TUI starts or resumes an Agent session
- **THEN** it MUST use shared Platform, Agent runtime, config, task, content access, skill, and command services directly through the Node adapter composition root
- **AND** it MUST NOT route terminal behavior through the Agent Webview host runtime adapter

### Requirement: Agent host route coverage is testable

The system SHALL expose route coverage or host capability assertions so VSCode and Electron Agent host adapters cannot silently omit message handlers required by the shared Agent Webview surface.

#### Scenario: A new Agent Webview message type is added

- **WHEN** a new Webview-to-host Agent message type is added to the shared message union
- **THEN** route coverage tests MUST require VSCode and Electron to classify the route as implemented, intentionally unsupported with diagnostic behavior, or host-inapplicable
- **AND** tests MUST fail if the route can produce a default success result without an explicit handler

### Requirement: Agent host state is runtime-scoped

The Agent host runtime adapter SHALL scope recoverable UI state to the owning Agent surface and host runtime.

#### Scenario: Multiple Agent or package surfaces exist

- **WHEN** multiple Agent surfaces or package runtimes are active
- **THEN** `getState` and `setState` behavior MUST apply only to the owning Agent runtime instance
- **AND** state from Cut, Canvas, or another package runtime MUST NOT be read as Agent state
