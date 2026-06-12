# comic-animation-incremental-indexing Specification

## Purpose
TBD - created by archiving change add-comic-animation-incremental-indexing. Update Purpose after archive.
## Requirements
### Requirement: Assets can be registered before heavy indexing completes
The system SHALL register newly added comic or media assets with stable asset references before running heavy OCR, ASR, panel detection, mask extraction, embedding, or model-based perception.

#### Scenario: New comic page is immediately referenceable
- **WHEN** a comic page is added to the project
- **THEN** the system creates a stable asset reference and an initial indexing state
- **THEN** Agent and Canvas can reference the asset before OCR or panel detection completes

#### Scenario: Project open does not block on heavy indexing
- **WHEN** a project containing many comic pages opens
- **THEN** the system does not block project open on OCR, ASR, embedding, or full media probing
- **THEN** pending indexing work is represented through indexing state records

### Requirement: Indexed range state tracks local evidence tasks
The system SHALL define shared `IndexedRangeState` and `IndexTaskState` contracts for page, panel, frame, time, and bounding-box ranges. Each task MUST track status, provider identity when available, model version when available, confidence when available, diagnostics, and evidence references.

#### Scenario: Partial indexing is represented
- **WHEN** OCR completes for a page but visual occurrence extraction has not run
- **THEN** the page range state records OCR as complete
- **THEN** the visual occurrence task remains pending or partial without forcing the whole range to fail

#### Scenario: Stale range is reindexed locally
- **WHEN** the source asset hash or provider model version changes for an indexed range
- **THEN** the affected range task is marked stale
- **THEN** the system reuses unaffected range tasks and schedules only stale or missing work

### Requirement: Visual occurrence evidence is persisted as stable refs
The system SHALL define `VisualOccurrence` as visual evidence for a person or object occurrence in a source range. The contract MUST store stable source refs, range refs, optional bounding box, optional crop refs, optional mask refs, candidate entity refs, appearance text, provider provenance, and confidence. It MUST NOT persist Webview URI, blob URL, inline base64, provider temporary URL, or absolute local path.

#### Scenario: Character crop is reusable evidence
- **WHEN** person detection extracts a character crop from a comic panel
- **THEN** the crop is stored as a derived stable asset reference
- **THEN** the `VisualOccurrence` records the source panel range, crop ref, confidence, and provider provenance

#### Scenario: Unsafe visual reference is rejected
- **WHEN** a visual occurrence attempts to persist a blob URL, Webview URI, inline base64, or absolute local path
- **THEN** validation reports an unsafe reference diagnostic
- **THEN** the occurrence is not eligible for automatic entity binding or shot reference bundles

### Requirement: Perception capabilities are registered through typed facets
The system SHALL define a `PerceptionCapabilityFacet` for local, engine, builtin, plugin, MCP, and cloud perception providers. The facet MUST declare supported tasks, media kinds, execution mode, device tier, default concurrency, cache policy, confidence kind, and approval requirement.

#### Scenario: Local OCR provider is discoverable
- **WHEN** a local OCR implementation is available
- **THEN** it registers a perception capability facet with task `ocr`, source `local` or `engine`, supported media kinds, device tier, default concurrency, and confidence kind

#### Scenario: Pure projector does not need provider registration
- **WHEN** code only validates a payload or projects an existing table into an artifact
- **THEN** it does not need a perception capability facet because it does not perform IO, model execution, cache writes, or device-consuming work

#### Scenario: Confidence-less provider requires review
- **WHEN** a perception provider declares `confidenceKind` as `none`
- **THEN** its outputs are treated as `needs-review`
- **THEN** they do not enter automatic high-confidence entity binding or confirmed memory merge paths

### Requirement: Incremental indexing writes sidecar facts before cache projections
The system SHALL persist comic-to-animation evidence in sidecar or JSON facts before updating SQLite, FTS, or vector projections. SQLite and vector indexes MUST be rebuildable caches and MUST NOT be the only source of indexed evidence.

#### Scenario: Cache deletion does not delete evidence
- **WHEN** the `.neko/.cache` SQLite or vector projection is deleted
- **THEN** OCR segments, visual occurrences, entity mentions, and plot events remain recoverable from sidecar facts
- **THEN** the projection can be rebuilt from those facts

#### Scenario: Webview reads projected data
- **WHEN** Agent Webview or Canvas displays indexed evidence
- **THEN** it receives host-projected data or paged query results
- **THEN** it does not read local sidecar or cache files directly

