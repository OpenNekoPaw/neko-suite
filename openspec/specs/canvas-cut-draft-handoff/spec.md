# canvas-cut-draft-handoff Specification

## Purpose
TBD - created by archiving change introduce-canvas-playback-workspace. Update Purpose after archive.
## Requirements
### Requirement: Canvas route can be projected to a Cut draft snapshot
The system SHALL project a selected Canvas playback route to a `CanvasCutDraftPayload` snapshot that Cut can import as an editable `.nkv` draft.

#### Scenario: Create draft from selected route
- **WHEN** a Canvas playback route is selected and the user or Agent requests a Cut draft
- **THEN** the system creates a `CanvasCutDraftPayload` containing source canvas URI, source revision, route id, project name, and ordered units
- **THEN** each unit includes source node mapping and available scene or shot mapping

#### Scenario: Missing route prevents draft creation
- **WHEN** no valid route is selected or inferable for draft creation
- **THEN** the system returns a fail-visible diagnostic and does not call Cut import

### Requirement: Draft payload preserves media and cue provenance
`CanvasCutDraftPayload` SHALL preserve media references and cue values as import snapshots with source mapping, while not becoming the durable authority for Story, Canvas node content, or Cut timeline facts.

#### Scenario: Include media references without runtime handles
- **WHEN** a draft unit has media available through a durable asset path or `ResourceRef`
- **THEN** the payload includes the durable reference or asset path
- **THEN** the payload does not include Webview URI, stream token, temporary preview URL, or unapproved absolute host path

#### Scenario: Cue conflict is diagnosed
- **WHEN** dialogue, voiceOver, soundCue, or text cue values conflict across Canvas node metadata, Story projection, or Agent projection
- **THEN** draft projection fails visibly or includes a diagnostic
- **THEN** it does not silently pick an arbitrary source

### Requirement: Draft extension metadata is namespaced and limited
`CanvasCutDraftPayload` SHALL allow only Neko package-namespaced extension metadata for low-risk optional fields and MUST reject extension entries that attempt to carry timeline semantics, authorization state, or unmanaged paths.

#### Scenario: Valid Neko extension metadata
- **WHEN** a draft contains `extensions["neko.canvas"]` or another declared Neko package namespace
- **THEN** the payload validator accepts the extension metadata if it contains only optional metadata

#### Scenario: Invalid extension namespace
- **WHEN** a draft contains a bare extension key, third-party undeclared prefix, or another package's namespace
- **THEN** validation fails visibly before Cut import

#### Scenario: Extension attempts to carry timeline semantics
- **WHEN** extension metadata contains ordering, track, clip, effect, export setting, approval, or file authorization semantics
- **THEN** validation fails visibly and requires an explicit contract field or owning-domain protocol

### Requirement: Cut import owns timeline after draft handoff
After Cut imports a `CanvasCutDraftPayload`, Cut SHALL own the `.nkv` timeline, clips, tracks, effects, subtitles, audio, preview playback, and export state.

#### Scenario: Import creates editable Cut draft
- **WHEN** Cut imports a valid `CanvasCutDraftPayload`
- **THEN** Cut creates or updates an `.nkv` draft with ordered editable timeline elements
- **THEN** imported elements retain source canvas, route, node, scene, or shot mapping metadata

#### Scenario: Cut edits do not rewrite Canvas order
- **WHEN** the user edits clip order, trim, effects, subtitles, or audio in Cut after import
- **THEN** Cut updates `.nkv`
- **THEN** Canvas `.nkc` order is not rewritten by default

### Requirement: Cut-to-Canvas sync remains minimal
Cut-to-Canvas synchronization SHALL use `CanvasTimelineSyncPayload` or its validated successor for minimal operational metadata only.

#### Scenario: Sync import metadata
- **WHEN** Cut finishes importing a Canvas draft
- **THEN** Canvas may receive importedAt, projectName, duration, thumbnail, selectedInTimeline, and source shot/node mapping

#### Scenario: Full timeline backflow is rejected
- **WHEN** Cut attempts to sync tracks, clips, effects, subtitles, audio, export settings, or Cut timeline order back to Canvas
- **THEN** Canvas rejects the payload or reports a fail-visible diagnostic
