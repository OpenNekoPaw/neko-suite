# unified-entity-memory-semantic-index Specification

## Purpose
TBD - created by archiving change introduce-unified-entity-memory-semantic-index. Update Purpose after archive.
## Requirements
### Requirement: Semantic index contracts are shared and host-agnostic
The system SHALL define shared host-agnostic contracts for media semantic indexing and entity memory contributions. These contracts MUST include `MediaSemanticIndex`, `MediaTextSegment`, `MediaBoundingBox`, `SemanticTag`, `PerceptionCardRef`, `EntityMemoryContribution`, and `ContributionDiagnostic` without importing VSCode, React, Webview, filesystem, or provider implementation modules.

#### Scenario: Shared semantic index type is serializable
- **WHEN** a media semantic index records OCR text, a perception ref, an entity mention, and semantic tags for an asset
- **THEN** the record is JSON-serializable and contains stable source references rather than runtime handles

#### Scenario: Shared contribution type stays host independent
- **WHEN** a package constructs an entity memory contribution
- **THEN** the contribution can be validated in `neko-types` without loading Agent, Canvas, Cut, Story, Assets, Dashboard, VSCode, or Webview code

### Requirement: Semantic index uses existing stable source references
The system SHALL use `ContentStableSourceRef`-aligned references for `MediaSemanticIndex.sourceRef` and `CharacterMemorySourceRef`-aligned references for `MediaTextSegment.sourceRef` and `EntityMemoryContribution.sourceRef`. The protocol MUST NOT introduce a third durable source-ref family for the same content or evidence identity.

#### Scenario: Asset index references content source
- **WHEN** a media semantic index is created for an imported image, video, document, asset, media-library file, or generated asset
- **THEN** `sourceRef` uses a content-stable source reference compatible with content access

#### Scenario: Text segment references evidence source
- **WHEN** OCR, subtitle, ASR, script, canvas, cut, document, generated-asset, manual, or Agent evidence is converted to a media text segment
- **THEN** the segment contains a `CharacterMemorySourceRef`-compatible evidence source suitable for later `CharacterObservation.sourceRef` projection

### Requirement: Media text segments preserve provenance and source-kind mapping
The system SHALL require media text segments to include text kind, text value, provider provenance, source kind, optional confidence, optional language, and optional bounded range. Source kinds MUST map to `CharacterObservation.provenance.source` values or be rejected by validation.

#### Scenario: Comic OCR maps to character observation source
- **WHEN** a comic page OCR extractor emits a text segment for a panel
- **THEN** the segment provenance source kind maps to `comic`
- **THEN** its source range can preserve page, panel, and bounding-box evidence

#### Scenario: Agent inference preserves original evidence where possible
- **WHEN** Agent summarizes or infers a text segment from prior evidence
- **THEN** the segment keeps the original evidence source reference when available
- **THEN** it uses a tool-result source only when no stable original evidence location exists

### Requirement: Media bounding boxes are constrained
The system SHALL represent media bounding boxes with numeric `x`, `y`, `width`, and `height` fields plus optional unit `pixel` or `normalized`. Validators MUST reject non-numeric bounding boxes, negative dimensions, unsupported units, and unsafe nested payloads.

#### Scenario: OCR bounding box validates
- **WHEN** an OCR segment includes `{ x, y, width, height, unit: 'pixel' }`
- **THEN** validation accepts the bounding box if all numbers are finite and dimensions are non-negative

#### Scenario: Invalid bounding box is diagnosed
- **WHEN** an OCR segment includes a bounding box with a string coordinate or unsupported unit
- **THEN** validation reports a diagnostic for the bounding-box field and does not silently coerce the value

### Requirement: Range validation follows source reference kind
The system SHALL allow `MediaTextRange` to reuse the flat `CharacterMemorySourceRange` shape plus optional bounding box in the initial protocol. Validators MUST check field combinations against `sourceRef.kind` and report diagnostics for invalid or contradictory range fields.

#### Scenario: Cut range accepts timeline fields
- **WHEN** a media text segment uses a `cut-range` source reference
- **THEN** validation accepts timeline, track, element, start, and end fields relevant to Cut evidence

#### Scenario: Story range rejects unrelated bounding box
- **WHEN** a story script text segment includes only line-based source evidence
- **THEN** validation reports unrelated visual bounding-box fields as invalid or unnecessary according to the validator policy

### Requirement: Perception cards are referenced and projected, not embedded
The system SHALL keep `PerceptionCard` as upstream perception evidence and SHALL store only lightweight `PerceptionCardRef` values plus selected searchable projections in `MediaSemanticIndex`. The semantic index MUST NOT embed full perception cards, inline base64 payloads, Webview URIs, file URIs, or provider-specific runtime payloads.

#### Scenario: Perception transcript projects into text segment
- **WHEN** a PerceptionCard contains transcript or description evidence for an asset
- **THEN** the semantic index can store a `PerceptionCardRef` and projected `MediaTextSegment` records for searchable text

#### Scenario: Full card is not persisted in semantic index
- **WHEN** a semantic index is persisted
- **THEN** it stores card identity metadata and selected projections only
- **THEN** it does not duplicate the full PerceptionCard object

### Requirement: Contributions are reviewable and non-authoritative
The system SHALL treat `EntityMemoryContribution` as a reviewable evidence envelope. Contributions MAY include entity candidates, character observations, media text segments, asset requirements, semantic tags, and diagnostics, but they MUST NOT directly mutate confirmed entity facts, character records, asset metadata, or media files.

#### Scenario: Contribution enters review queue
- **WHEN** a package emits an entity memory contribution with draft character observations
- **THEN** Agent or Dashboard can render it for review without confirming the observations as facts

#### Scenario: Contribution cannot confirm facts alone
- **WHEN** a contribution contains a high-confidence observation and `source-approved` review policy
- **THEN** the system still requires a delegated lifecycle command or explicit review event before writing accepted facts

### Requirement: Review policy controls default handling only
The system SHALL define contribution review policies `draft-only`, `requires-user-review`, and `source-approved`. These policies MUST control default review status, queue priority, and fast-review behavior only; they MUST NOT grant write authority or accepted status by themselves.

#### Scenario: Draft-only contribution remains draft
- **WHEN** a contribution uses `draft-only`
- **THEN** generated observations are initialized as draft evidence unless an explicit reviewer changes their status

#### Scenario: Source-approved contribution does not bypass review authority
- **WHEN** a trusted source package uses `source-approved`
- **THEN** the review surface can prioritize it for fast approval
- **THEN** the contribution does not directly write `accepted` observations without a delegated approval operation

### Requirement: Semantic evidence is safe to persist
The system SHALL reject or diagnose semantic index and contribution payloads that contain runtime handles, absolute host paths, Webview URIs, file URIs, blob URLs, inline base64 media, oversized payloads, non-serializable values, or unsafe extension namespaces.

#### Scenario: Webview URI is rejected
- **WHEN** a media text segment, semantic tag, or contribution source reference contains a Webview URI as durable identity
- **THEN** validation reports an unsafe runtime handle diagnostic

#### Scenario: Large inline media is rejected
- **WHEN** a semantic index attempts to persist base64 image or audio payloads
- **THEN** validation rejects the payload and requires a stable resource reference instead

### Requirement: Semantic evidence can project to character memory
The system SHALL allow accepted or reviewable media text segments, entity mentions, and semantic tags to project into `CharacterObservation` records while preserving source references, provenance, confidence, and review status.

#### Scenario: Dialogue text becomes reviewable observation
- **WHEN** a subtitle or OCR dialogue segment is linked to a speaker entity or candidate
- **THEN** Agent can create a `CharacterObservation` with dialogue or voice dimensions using the segment source reference and provenance

#### Scenario: Low-confidence evidence remains reviewable
- **WHEN** a text segment has low confidence or ambiguous speaker identity
- **THEN** the projected character observation is marked draft or needs-review and carries diagnostics instead of being accepted automatically

