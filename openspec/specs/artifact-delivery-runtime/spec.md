# artifact-delivery-runtime Specification

## Purpose
TBD - created by archiving change introduce-composite-artifact-table-protocol. Update Purpose after archive.
## Requirements
### Requirement: Agent produces composite artifacts through a small protocol kernel
The Agent runtime SHALL support a small artifact protocol kernel consisting of composite artifacts, generic tables, resource refs, diagnostics, suggested actions, validation dispatch, renderer dispatch, projector dispatch, approval gates, and execution summaries. Agent core MUST NOT hardcode every domain profile.

#### Scenario: Unknown profile degrades safely
- **WHEN** Agent receives or produces an artifact with an unknown profile
- **THEN** Agent attempts base validation and renders a bounded diagnostic or raw summary
- **THEN** Agent does not expose execute actions unless a registered projector and capability explicitly accept the artifact

#### Scenario: Domain payload uses registered validator
- **WHEN** a composite artifact contains a `domain` block for `StoryboardTable`
- **THEN** Agent dispatches validation to the storyboard validator
- **THEN** generic artifact validation does not duplicate storyboard domain rules

### Requirement: Agent Webview transfer carries artifact snapshots and pages
The Agent transfer protocol SHALL support composite artifact snapshots, block pages, backfills, and execution summaries. Transfer payloads MUST remain serializable and MUST NOT include host-only objects or runtime display handles.

#### Scenario: Small artifact travels as snapshot
- **WHEN** a tool result includes a small composite artifact
- **THEN** the artifact can be delivered as an artifact snapshot sub-payload on the existing `toolResult` or `toolResultBackfill` message

#### Scenario: Large artifact uses block paging
- **WHEN** an artifact exceeds the configured snapshot threshold or includes large galleries/comparisons
- **THEN** the initial transfer includes artifact id, manifest, block summaries, and page cursors
- **THEN** the Webview loads block payloads through artifact block page messages or requests

#### Scenario: Transfer omits Webview URI
- **WHEN** an artifact media block is delivered to Webview
- **THEN** the transfer contains stable resource refs and metadata
- **THEN** Webview-safe URIs are resolved by the host render adapter rather than persisted in the artifact payload

### Requirement: Artifact backfill merges background results
The Agent runtime SHALL merge artifact backfills into the originating conversation and tool-call context when asynchronous tasks complete after the initial response.

#### Scenario: Background generation returns artifact
- **WHEN** a media generation task completes and produces a comparison gallery artifact
- **THEN** Agent sends an artifact backfill associated with the original conversation and tool call
- **THEN** the Webview merges it into the existing message state instead of creating an unrelated artifact surface

#### Scenario: Backfill does not mark unexecuted actions as done
- **WHEN** a backfilled artifact includes suggested execute actions
- **THEN** those actions remain suggested or unavailable until validation, provider lookup, and approval occur

### Requirement: Artifact state restores after Webview rebuild
The Agent delivery layer SHALL restore artifact snapshots, block cursors, and terminal execution summaries after Webview reload using the same conversation-scoped projection model as task lifecycle recovery.

#### Scenario: Webview reload restores artifact
- **WHEN** the Webview reloads while a conversation contains an artifact with paged blocks
- **THEN** the delivery layer can replay the artifact manifest, restored snapshot metadata, and block cursors
- **THEN** the UI does not lose the artifact or show stale execute status

#### Scenario: Completed execution summary is replayed
- **WHEN** an artifact action completed while Webview was unavailable
- **THEN** the recovered conversation projection includes the execution summary
- **THEN** the UI can show the completed, failed, or degraded result state

### Requirement: Renderer dispatch uses generic fallback
The system SHALL dispatch artifact and block rendering through registered renderers with generic fallback. Missing renderers MUST NOT prevent base artifact review.

#### Scenario: Missing domain renderer falls back
- **WHEN** a package lacks a renderer for a domain block
- **THEN** the system renders a generic diagnostic or raw summary for that block
- **THEN** the rest of the composite artifact remains visible

#### Scenario: Generic table renderer is shared
- **WHEN** Dashboard, Agent, Story, Canvas, or Cut receives a `GenericTable`
- **THEN** each consumer can use a shared generic table renderer or a package-enhanced renderer
- **THEN** package-enhanced renderers remain optional and cannot grant execution rights

### Requirement: PerceptionCard remains upstream of artifact schema
The system SHALL treat `PerceptionCard` as an upstream media observation and `CompositeArtifact` as a task-facing structured artifact. Artifacts MAY reference PerceptionCard asset refs or summaries but MUST NOT embed complete perception pipeline state.

#### Scenario: Comic panels become artifact blocks
- **WHEN** the perception pipeline detects comic panel candidates from an image
- **THEN** Agent can use those observations to create a source-panel gallery block and shot-plan table
- **THEN** the artifact references stable asset refs rather than embedding the complete `PerceptionCard`

#### Scenario: Perception card remains available separately
- **WHEN** Agent needs deeper media evidence after artifact generation
- **THEN** it can query or reference the relevant `PerceptionCard`
- **THEN** it does not rely on the artifact payload as the perception authority
