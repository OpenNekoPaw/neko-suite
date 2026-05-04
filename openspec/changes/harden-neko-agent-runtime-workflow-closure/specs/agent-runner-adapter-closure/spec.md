## ADDED Requirements

### Requirement: Extension runner separates runtime port adapter from VSCode event bridge
The system SHALL keep the runtime-facing `AgentRunnerPort` adapter separate from the VSCode event bridge implementation. The runtime adapter MUST remain host-agnostic and MUST NOT expose `vscode.Event` or `vscode.Disposable` in core contracts.

#### Scenario: Runtime adapter compiles without VSCode
- **WHEN** the runner runtime adapter is type-checked in isolation
- **THEN** it compiles without importing or referencing VSCode types

#### Scenario: VSCode bridge preserves public behavior
- **WHEN** Extension creates an agent runner for an existing chat conversation
- **THEN** start, stop, confirmation, subagent, cancellation, history load, and context compression events are forwarded through the existing VSCode-facing surface

### Requirement: New Extension consumers use unified runner port events
The system SHALL prefer `AgentRunnerPortEvent` for new Extension consumers. New usages of individual `onDidStart`, `onDidStop`, `onDidRequestConfirmation`, or `onDidSubAgentEvent` events MUST be blocked or reported unless they are inside the VSCode event bridge or an explicitly documented compatibility consumer.

#### Scenario: New consumer uses unified event stream
- **WHEN** a new Extension component needs runner lifecycle events
- **THEN** it subscribes to `onDidRunnerEvent` rather than individual VSCode event properties

#### Scenario: Direct event usage outside bridge is reported
- **WHEN** a new file outside the runner bridge subscribes to an individual VSCode event property
- **THEN** the targeted guard or regression test reports the direct usage as a compatibility regression

### Requirement: Runner adapter split remains behaviorally equivalent
The system SHALL preserve existing runner behavior while splitting adapter files. Targeted tests MUST prove no regression for configure, execute, cancel, confirmation, subagent event forwarding, history hydration, context compression, skill injection, and capability refresh.

#### Scenario: Split adapter forwards confirmation events
- **WHEN** a tool execution requests user confirmation
- **THEN** the VSCode event bridge and unified runner event stream both receive equivalent confirmation payloads
