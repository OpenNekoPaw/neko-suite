# agent-capability-telemetry Specification

## Purpose
TBD - created by archiving change harden-neko-agent-runtime-workflow-closure. Update Purpose after archive.
## Requirements
### Requirement: Capability telemetry records manifest field utilization
The system SHALL record telemetry for capability manifest fields encountered during registration and injection. Telemetry MUST distinguish used, unknown, unsupported, withheld, policy-skipped, and ablation-skipped fields without recording sensitive prompt fragment content by default.

#### Scenario: Unknown manifest field is recorded
- **WHEN** a market or local skill manifest includes a field outside the supported schema
- **THEN** capability telemetry records the field name, contribution id, source, manifest version, and reason `unknown-field`

#### Scenario: Unsupported known field is recorded
- **WHEN** runtime recognizes a manifest field but cannot inject it in the current implementation version
- **THEN** capability telemetry records the reason `unsupported-field` without treating the manifest as invalid

### Requirement: Capability telemetry separates registration and injection outcomes
The system SHALL keep registration diagnostics, injection diagnostics, and telemetry distinct. Registration diagnostics MUST report manifest validity; injection diagnostics MUST report per-turn skip reasons; telemetry MUST report ecosystem field usage and evolution over time.

#### Scenario: Valid field is withheld by policy
- **WHEN** a valid prompt fragment is not injected because trust policy or workflow node policy blocks it
- **THEN** injection diagnostics report the per-turn skip and telemetry records a `policy-skipped` field utilization event

#### Scenario: Ablation skip remains discoverable
- **WHEN** skill injection is disabled by an ablation toggle
- **THEN** the skill remains registered, injection diagnostics report ablation skip, and telemetry records `ablation-skipped`

### Requirement: Telemetry protects sensitive capability content
The system SHALL avoid storing raw prompt fragment text, large schemas, file payloads, or user content in capability telemetry by default. It MAY store stable hashes, field names, contribution ids, source ids, versions, and reason codes.

#### Scenario: Prompt fragment telemetry uses hash
- **WHEN** a prompt fragment is withheld or changed
- **THEN** telemetry stores the fragment id and stable hash rather than the prompt text

### Requirement: Capability telemetry supports dynamic evolution debugging
The system SHALL expose telemetry snapshots that help debug skill install, update, remove, schema change, provider card change, and workflow fragment change events.

#### Scenario: Market skill update changes unsupported field count
- **WHEN** a market skill update adds a new manifest field that runtime does not yet support
- **THEN** telemetry shows the new unsupported field count, contribution version, and update event

