## ADDED Requirements

### Requirement: Canvas exposes scene-level storyboard execution summaries
The system SHALL expose a read-only Canvas storyboard execution summary for Story and Agent consumers. The summary MUST project Canvas scene and shot state into stable DTOs and MUST NOT require consumers to inspect Canvas Webview internals, composable content trees, or raw generation history arrays.

#### Scenario: Story requests summary for a script scene
- **WHEN** Story requests Canvas execution state for a source script URI and scene ID
- **THEN** Canvas returns the matching scene node ID, shot count, generated shot count, failed shot count, selected thumbnail reference, and current execution status when available

#### Scenario: No Canvas binding exists
- **WHEN** Story requests Canvas execution state for a scene that has not been imported
- **THEN** Canvas returns an empty or not-found summary without creating Canvas nodes

### Requirement: Execution summaries preserve Story and Canvas authority boundaries
The system SHALL keep Story scene metadata and Canvas execution metadata separate. Story scene title, line range, and script-derived duration remain Story-owned; Canvas shot descriptions, generated assets, candidate selection, and generation statuses remain Canvas-owned.

#### Scenario: Story displays Canvas progress
- **WHEN** Story receives a Canvas execution summary
- **THEN** Story displays downstream progress without mutating Canvas shot data

#### Scenario: Canvas summary omits script parsing
- **WHEN** Canvas produces an execution summary
- **THEN** Canvas uses existing scene bindings and node data and does not parse Fountain or infer script structure

### Requirement: Shot execution summaries contain generation-relevant fields
The system SHALL include shot-level execution summaries inside a scene summary when requested. Each shot summary MUST include stable shot identity, shot number, duration, generation status, optional selected asset reference, optional thumbnail reference, optional generated video reference, and optional timeline import metadata.

#### Scenario: Generated shot has selected visual
- **WHEN** a ShotNode has a selected generated image or generated asset reference
- **THEN** the shot summary includes a selected visual reference and generation status done

#### Scenario: Failed shot is reported
- **WHEN** a ShotNode generation status indicates error or failed output
- **THEN** the shot summary reports failed status and contributes to the scene failed shot count

#### Scenario: Timeline-imported shot is reported
- **WHEN** a ShotNode has timeline import metadata
- **THEN** the shot summary includes the last imported project and import timestamp

### Requirement: Summary thumbnails and large previews remain Canvas responsibilities
The system SHALL expose thumbnail or preview references in execution summaries, but large preview rendering, candidate comparison, and image/video inspection MUST remain in Canvas or dedicated preview extensions.

#### Scenario: Story shows Canvas thumbnail summary
- **WHEN** a scene summary has a selected thumbnail reference
- **THEN** Story may display it as a progress cue while keeping large preview and candidate switching actions in Canvas

#### Scenario: User needs to inspect generated output
- **WHEN** a user wants to inspect or compare generated shot candidates
- **THEN** Story routes the user to Canvas rather than rendering a candidate comparison surface inside Story

### Requirement: Execution summary contract supports Agent context extraction
The system SHALL make execution summaries available to Agent workflows as structured context. Agent consumers MUST be able to request scene and shot progress without relying on Webview-only runtime URLs or UI state.

#### Scenario: Agent receives Canvas execution context
- **WHEN** Agent analyzes a scene that has Canvas execution state
- **THEN** Agent can receive scene node ID, shot IDs, shot statuses, selected asset references, and missing generation outputs as structured context

#### Scenario: Runtime URLs are sanitized
- **WHEN** Canvas summary includes generated previews
- **THEN** the summary uses stable asset references or safe thumbnail references and excludes blob URLs, engine tokens, player state, and other runtime-only fields

### Requirement: Story can correlate script scenes to Canvas scene groups
The system SHALL correlate Story scenes to Canvas scene groups using stable `sceneId` and source script URI where available. Correlation MUST fall back to stored Story scene bindings when direct Canvas lookup is unavailable.

#### Scenario: Imported storyboard has scene IDs
- **WHEN** Story or Agent imports storyboard payload into Canvas with source scene IDs
- **THEN** Canvas stores enough metadata to later produce execution summaries for those scene IDs

#### Scenario: Stored binding is used
- **WHEN** Story has a stored Canvas scene binding for a scene
- **THEN** Story can use that binding to open the Canvas scene even if summary lookup is temporarily unavailable

### Requirement: Execution summary APIs are additive and failure-tolerant
The system SHALL add execution summary APIs or commands without breaking existing Canvas node APIs. Consumers MUST receive typed empty or error states when Canvas is not open, the extension is unavailable, or a linked Canvas file cannot be read.

#### Scenario: Canvas extension unavailable
- **WHEN** Story attempts to retrieve execution summaries and Canvas is unavailable
- **THEN** Story marks Canvas state as unknown or not available and continues rendering script readiness

#### Scenario: Existing Canvas node tools continue to work
- **WHEN** Agent uses existing Canvas node list, get, update, create, and generation tools
- **THEN** those tools remain compatible and do not require execution summary adoption

### Requirement: Canvas remains the formal shot-level storyboard workspace
The system SHALL keep shot-level editing, GalleryNode visual reference management, generated candidate selection, large previews, generation controls, Sketch editing, and Cut import actions in Canvas.

#### Scenario: User opens shot execution details
- **WHEN** a user clicks from Story into a scene that has Canvas execution state
- **THEN** Canvas opens or focuses the SceneGroup and provides shot-level editing and visual review controls

#### Scenario: Story does not duplicate Canvas workflow controls
- **WHEN** Story displays a Canvas execution summary
- **THEN** Story does not provide controls for candidate selection, shot prompt editing, Gallery cell editing, or direct Cut import from individual shots
