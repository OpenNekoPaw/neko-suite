## ADDED Requirements

### Requirement: Character dialogue business orchestration is runtime-owned
The system SHALL keep character dialogue business orchestration in host-agnostic Agent runtime or domain services. Extension controllers MAY manage VSCode commands, Webview messages, tab state, QuickPick prompts, file/URI adapters, and lifecycle disposal, but MUST NOT own durable default rules for profile enrichment, transcript evaluation, fallback report generation, suggestion policy, headless probe orchestration, or NPC fact inference.

#### Scenario: Controller delegates character dialogue evaluation
- **WHEN** Character Dialogue needs to evaluate a transcript, enrich a profile, build a fallback report, or choose suggested profile changes
- **THEN** the Extension controller calls a runtime/domain service through typed ports rather than executing the default business policy directly

#### Scenario: Runtime service runs without VSCode
- **WHEN** character dialogue orchestration is tested with fake profile, evidence, evaluation, probe, save, and apply ports
- **THEN** the runtime service executes without importing `vscode`, React, Webview modules, or Extension-only services

### Requirement: Webview cannot generate durable entity memory contributions
The system SHALL prevent Webview presenter or handler code from generating durable `EntityMemoryContribution` objects or authoritative entity memory facts. Webview MAY render contribution previews, collect user confirmation, and send typed intent messages to Extension/runtime.

#### Scenario: Webview renders contribution projection
- **WHEN** an entity memory analysis result is displayed in Webview
- **THEN** the Webview renders a runtime/domain-provided projection and does not compute persistent contribution candidates, observation dimensions, confidence scores, or source-approved memory payloads itself

#### Scenario: Durable contribution is built by runtime or domain service
- **WHEN** user intent requires creating an `EntityMemoryContribution`
- **THEN** Extension forwards the request to a host-agnostic Agent/entity service that returns a validated contribution or diagnostics

### Requirement: Host adapters expose narrow effect ports
The system SHALL expose host capabilities to runtime services through narrow effect ports rather than broad controller callback bags. A port MUST represent one cohesive capability such as file reading, VSCode command query, contribution persistence, suggestion application, evidence source read, or probe execution.

#### Scenario: Runtime receives focused save port
- **WHEN** a runtime character dialogue service needs to save or apply a suggestion
- **THEN** it calls a focused save/apply port supplied by the Extension adapter rather than receiving access to controller internals

#### Scenario: Port tests do not construct Webview controller
- **WHEN** runtime service tests exercise character dialogue, evidence, or contribution behavior
- **THEN** they use fake ports and do not construct VSCode Webview panels, controller tab state, or `vscode.Disposable` resources

### Requirement: Boundary guard tracks migrated host files
The system SHALL include architecture guard coverage or focused tests for known high-risk Agent host files after migration. The guard MUST report new Webview durable contribution inference, new Agent-local projectSearch shim imports, new Extension-owned strategy helpers without runtime counterpart, and new runtime imports from VSCode or React.

#### Scenario: New Webview memory inference is reported
- **WHEN** Webview code adds a module that constructs durable `EntityMemoryContribution` values directly
- **THEN** the boundary guard or focused test reports the Webview boundary violation

#### Scenario: New Extension strategy helper is reported
- **WHEN** Agent Extension adds a new helper that owns default evidence, profile, suggestion, evaluation, or search aggregation strategy without a runtime/domain counterpart
- **THEN** the boundary guard, review checklist, or targeted test reports the host-boundary risk
