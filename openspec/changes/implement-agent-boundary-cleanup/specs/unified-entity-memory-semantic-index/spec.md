## ADDED Requirements

### Requirement: Entity memory contribution inference is host-agnostic
The system SHALL provide host-agnostic entity memory contribution inference for Markdown analysis tables, entity candidates, character observations, confidence scoring, diagnostics, and reviewable `EntityMemoryContribution` construction. The inference implementation MUST NOT depend on Webview, React, VSCode, DOM, or local filesystem APIs.

#### Scenario: Markdown table inference runs in runtime test
- **WHEN** a runtime or domain unit test supplies Markdown analysis table content and source metadata
- **THEN** the inference service returns reviewable entity memory contribution candidates and diagnostics without constructing a Webview presenter

#### Scenario: Confidence scoring is deterministic
- **WHEN** the same analysis table and source metadata are passed to the inference service
- **THEN** entity candidate confidence, observation dimension classification, and contribution diagnostics are deterministic and covered by tests

### Requirement: Webview contribution UI is projection-only
The system SHALL keep Webview contribution UI responsible for rendering inferred contribution projections, local selection state, and user intent messages. Webview MUST NOT create durable contribution payloads, assign authoritative confidence values, or choose review policies that affect persistence.

#### Scenario: Webview confirms runtime contribution
- **WHEN** a user confirms an inferred entity memory contribution in Webview
- **THEN** the Webview sends typed confirmation intent referencing the runtime/domain-provided contribution or draft id rather than reconstructing the durable payload locally

#### Scenario: Webview edit returns user intent
- **WHEN** a user edits a contribution preview before persistence
- **THEN** the Webview sends typed edits or override intent to Extension/runtime and the domain service returns the validated contribution payload

### Requirement: Contributions remain reviewable before writes
The system SHALL treat inferred `EntityMemoryContribution` results as reviewable evidence envelopes. Inference MAY propose entity candidates, observations, media text segments, semantic tags, and diagnostics, but confirmed entity facts or accepted character memory writes MUST require the existing delegated review or persistence command path.

#### Scenario: Inferred observation is not accepted automatically
- **WHEN** contribution inference produces a high-confidence character observation from a Markdown analysis table
- **THEN** the observation remains draft or reviewable until an explicit review or delegated write operation accepts it

#### Scenario: Persistence command validates runtime contribution
- **WHEN** Extension receives a request to persist an inferred contribution
- **THEN** it passes the runtime/domain contribution through existing validation and processing commands rather than trusting a Webview-generated durable object
