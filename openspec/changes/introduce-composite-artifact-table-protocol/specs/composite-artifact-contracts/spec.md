## ADDED Requirements

### Requirement: Composite artifact is a shared multimodal envelope
The system SHALL define `CompositeArtifact` as a host-agnostic shared contract for structured Agent artifacts. The contract MUST include schema version, artifact id, optional profile, title, ordered blocks, optional provenance, diagnostics, suggested actions, and namespaced extensions.

#### Scenario: Agent returns a composite artifact
- **WHEN** Agent completes a structured planning step for a comic-to-animation workflow
- **THEN** the result can include a `CompositeArtifact` containing text, table, gallery, domain, and diagnostic blocks
- **THEN** the persisted artifact contains stable data only and does not contain Webview URI, blob URL, inline base64, localhost URL, private cache path, or absolute local path values

#### Scenario: Unknown schema version is diagnosed
- **WHEN** a consumer receives a `CompositeArtifact` with an unsupported `schemaVersion`
- **THEN** the consumer reports a bounded diagnostic
- **THEN** the consumer does not expose execute actions from that artifact

### Requirement: V1 artifact block types are closed and degrade safely
The system SHALL treat V1 composite artifact block types as a closed base vocabulary. Unknown or future block types MUST be preserved when possible, rendered as diagnostic or raw fallback, and prevented from triggering projection or execution.

#### Scenario: Unknown block type is rendered as diagnostic
- **WHEN** a Webview receives an artifact block with a kind not supported by the V1 renderer registry
- **THEN** the Webview renders a placeholder, raw JSON summary, or diagnostic for that block
- **THEN** any execute action derived only from that block is disabled

#### Scenario: Domain block carries strong payload
- **WHEN** Agent needs to include a `StoryboardTable` inside a composite artifact
- **THEN** the artifact uses a `domain` block with a declared domain payload kind
- **THEN** storyboard-specific validation remains with the storyboard payload validator rather than the generic block validator

### Requirement: Generic table is a shared dynamic review table
The system SHALL define `GenericTable` as a host-agnostic shared contract for dynamic tables. The contract MUST include schema version, table id, optional profile, title, columns, rows, optional actions, diagnostics, and namespaced extensions.

#### Scenario: Non-storyboard table is represented
- **WHEN** Agent produces a comic shot asset prep table
- **THEN** the table can be represented as `GenericTable` without using `StoryboardTable`
- **THEN** the table remains reviewable even if no projector is registered for execution

#### Scenario: Table without profile is generic only
- **WHEN** a `GenericTable` has no profile
- **THEN** the system applies only base table validation and generic rendering
- **THEN** the table is not projected to a domain payload unless an explicit projector accepts that unprofiled table

### Requirement: V1 table cell types are closed and bounded
The system SHALL treat V1 generic table cell types as a closed base vocabulary. Cell values MUST be JSON-serializable, bounded in size, and free of runtime-only handles.

#### Scenario: Unsafe cell value is rejected
- **WHEN** a table cell contains a blob URL, Webview URI, inline base64 payload, function value, or private cache path
- **THEN** validation reports an unsafe value diagnostic
- **THEN** projection and execution actions for the affected row or table are disabled until corrected

#### Scenario: Json cell uses bounded validation
- **WHEN** a `json` cell contains nested data
- **THEN** the base validator checks JSON serializability, size limits, and unsafe values
- **THEN** complex structure validation is delegated to a profile shape check, `schemaRef`, or domain payload validator

### Requirement: Artifacts use stable multimodal references
The system SHALL represent images, video, audio, 3D assets, document pages, generated assets, Canvas nodes, Story sources, and tool-result assets through stable references or locators. Runtime display handles MUST be adapter-only.

#### Scenario: Image preview resolves through host adapter
- **WHEN** a Webview renders an artifact media block that references an image resource
- **THEN** the persisted artifact stores a stable resource reference or tool-result locator
- **THEN** the Extension Host resolves the reference to a Webview-safe URI only at render time

#### Scenario: Generated asset is referenced by stable id
- **WHEN** an artifact points to a generated video candidate
- **THEN** the artifact stores a generated asset reference or resource reference
- **THEN** it does not store provider-local temporary files or Webview-projected URLs as durable identity

### Requirement: Pre-1.0 artifact versions are lightweight
The system SHALL use lightweight pre-1.0 versioning for persisted artifacts and profiles. Persisted artifacts MUST carry schema version, and persisted shared-profile artifacts MUST carry profile version when the profile is shared or long-lived.

#### Scenario: Temporary chat artifact omits profile version
- **WHEN** Agent produces a short-lived chat-only artifact from a Skill-local profile
- **THEN** the artifact may omit `profileVersion`
- **THEN** validation uses the active Skill-local profile for the current session

#### Scenario: Persisted artifact pins profile version
- **WHEN** an artifact is written to project state, Dashboard state, Canvas, Cut, or a long-lived task record
- **THEN** it records the profile id and profile version when a profile is used

#### Scenario: Unsupported profile version degrades read-only
- **WHEN** a consumer cannot resolve the declared profile version for a persisted artifact
- **THEN** it reports a diagnostic and renders the artifact read-only
- **THEN** it does not silently validate against the newest profile descriptor
