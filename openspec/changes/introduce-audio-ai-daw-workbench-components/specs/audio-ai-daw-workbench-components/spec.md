## ADDED Requirements

### Requirement: Lightweight AI DAW component set

`neko-audio` SHALL expose a lightweight AI DAW workbench component set composed around the existing transport bar, left toolbar, central timeline, compact bottom mixer, and right dock. The component set MUST prioritize common editing, AI cleanup, review, mixing, and export-readiness workflows over standalone full-DAW browsing or device graph workflows.

#### Scenario: Workbench opens with core component regions

- **WHEN** a `.nka` project opens in `neko-audio`
- **THEN** the Webview SHALL keep transport, left toolbar, timeline, compact mixer, and right dock as the primary regions
- **AND** the additional AI DAW components SHALL attach to those regions instead of creating a separate standalone DAW shell.

#### Scenario: Standalone DAW-only surfaces are absent

- **WHEN** the lightweight AI DAW workbench is rendered
- **THEN** it MUST NOT require a full plugin browser, sample browser, device graph, MIDI piano roll, routing matrix, or multi-window mixer to complete basic edit, AI cleanup, and export workflows.

### Requirement: Mode-gated right dock tasks

The right dock SHALL present task-oriented audio panels. Basic mode SHALL expose quick AI/edit/export flows, while professional mode SHALL add precision editing panels without creating a separate project state or alternate processing path.

#### Scenario: Basic mode shows quick workflow panels

- **WHEN** the right dock is in basic mode
- **THEN** it SHALL expose AI operations, Inspector, Presets, Recording, and Export panels when those panels are available
- **AND** it SHALL hide precision-only panels that are not required for quick cleanup or export.

#### Scenario: Professional mode shows precision panels

- **WHEN** the right dock is in professional mode
- **THEN** it SHALL expose AI operations, Inspector, Effects, Markers/Regions, Recording, Export, and Presets panels when those panels are available
- **AND** all panels SHALL read and modify the same `.nka` project facts used by basic mode.

### Requirement: Selection action bar

The workbench SHALL provide a selection action bar for selected clips or time regions. The bar MUST expose high-frequency actions and MUST make disabled or invalid targets visible instead of silently ignoring user input.

#### Scenario: Clip selection exposes clip actions

- **WHEN** a user selects a timeline clip
- **THEN** the selection action bar SHALL expose applicable actions such as split, trim, fade, gain, denoise, normalize, silence cleanup, and send to AI
- **AND** invoking an action SHALL route through the canonical clip, project operation, or existing audio command path for that action.

#### Scenario: No valid selection disables target-specific actions

- **WHEN** no clip or region is selected
- **THEN** target-specific actions SHALL be disabled or replaced with visible diagnostics
- **AND** the workbench MUST NOT report success for a selection-targeted action that has no valid target.

### Requirement: Timeline tool modes

The workbench SHALL provide explicit timeline tool modes for common editing operations. Tool mode changes MUST be visible and keyboard/focus safe inside the VS Code Webview.

#### Scenario: User switches editing mode

- **WHEN** a user selects a timeline mode such as select, split, trim, fade, gain, marker, or automation
- **THEN** the timeline SHALL visually indicate the active mode
- **AND** pointer interaction SHALL use the handler registered for that mode.

#### Scenario: Unknown tool mode fails visibly

- **WHEN** the Webview receives or attempts to activate an unregistered timeline tool mode
- **THEN** the workbench SHALL show a visible diagnostic or fail the action path in tests
- **AND** it MUST NOT silently keep editing under an unintended mode.

### Requirement: Inspector panel

The workbench SHALL provide an Inspector panel that projects the current selection into typed clip, track, region, marker, or master controls. Inspector edits MUST route through typed audio operations and MUST preserve preview/commit semantics where the underlying control supports them.

#### Scenario: Clip inspector reflects selected clip

- **WHEN** a user selects a clip
- **THEN** the Inspector SHALL show clip identity and editable properties such as name, start, duration, trim/fade/gain, mute state, and related AI operation markers when available
- **AND** committed edits SHALL update the project through canonical element operations.

#### Scenario: Track inspector reflects selected track

- **WHEN** a user selects a track or focuses a track header
- **THEN** the Inspector SHALL show track controls such as name, color, mute, solo, volume, pan, effects summary, automation summary, and input/output status when available
- **AND** committed edits SHALL update the project through canonical track or track mix operations.

### Requirement: AI operation panel

The workbench SHALL provide an AI operation panel for quick actions, natural-language requests, operation status, affected target review, and retry/cancel affordances where supported. AI operations MUST be auditable and tied to stable project targets.

#### Scenario: User runs an AI quick action

- **WHEN** a user chooses an AI quick action for a selected clip, region, track, or master target
- **THEN** the AI panel SHALL create a visible operation item with target, status, and action name
- **AND** completed operations SHALL expose affected track, element, effect, marker, or operation ids when the provider or tool path returns them.

#### Scenario: AI operation fails

- **WHEN** an AI operation cannot run because the target, provider, tool, or required capability is unavailable
- **THEN** the AI panel SHALL show a visible failed or unsupported state
- **AND** it MUST NOT mutate project state or report success.

### Requirement: AI result comparison

The workbench SHALL provide AI result comparison controls for previewable AI or processing results. Comparison controls MUST distinguish previewable, apply-only, failed, and unsupported results.

#### Scenario: Previewable AI result is reviewed

- **WHEN** an AI operation produces a previewable result
- **THEN** the workbench SHALL allow the user to compare original and processed output before applying the result
- **AND** applying the result SHALL route through the canonical edit or effect path for the affected target.

#### Scenario: Result has no preview

- **WHEN** an AI operation produces an apply-only result without preview data
- **THEN** the workbench SHALL label the result as apply-only or unsupported for comparison
- **AND** it MUST NOT present a fake A/B comparison.

### Requirement: Add source and track entry points

The workbench SHALL provide visible add/import/record/generate entry points for empty projects and active timelines. These entry points MUST reuse VS Code and Extension-owned file authorization/import paths.

#### Scenario: Empty project entry points

- **WHEN** a `.nka` project has no tracks or no elements
- **THEN** the timeline SHALL expose entry points for importing audio, recording, adding a track, using a VS Code-selected file where available, and generating audio with AI where available.

#### Scenario: Import uses authorized project source path

- **WHEN** the user imports a source through the workbench
- **THEN** the Webview SHALL route the request through the existing Extension-owned project add-source path
- **AND** it MUST NOT read arbitrary local files directly from the Webview.

### Requirement: Markers and regions

The workbench SHALL support marker and region navigation as a lightweight structure layer for audio review, editing, and AI notes.

#### Scenario: Marker panel lists timeline markers

- **WHEN** a project contains markers or regions
- **THEN** the Markers/Regions panel SHALL list them with names, positions, durations where applicable, and navigation actions
- **AND** selecting an item SHALL focus or seek the relevant timeline position.

#### Scenario: Marker edit uses canonical operation

- **WHEN** the user creates, updates, or removes a marker or region
- **THEN** the change SHALL route through the canonical audio marker operation path
- **AND** the marker list and timeline marker lane SHALL stay consistent with the same project state.

### Requirement: Effects mini rack

The workbench SHALL provide an effects mini rack for common track and master chains. The mini rack MUST expose compact controls for enabled effects and MUST fail visibly for unsupported or unrenderable effects.

#### Scenario: User edits common effect

- **WHEN** a user adds or edits a supported effect in the mini rack
- **THEN** the effect SHALL be represented in the target track or master effect chain
- **AND** the change SHALL route through the canonical effect operation path.

#### Scenario: Effect is planned-only or unsupported

- **WHEN** a requested effect is planned-only or unsupported by the render path
- **THEN** the mini rack SHALL show a warning or unsupported state
- **AND** the workbench MUST NOT silently add an effect that the project mix/export path will ignore as success.

### Requirement: Master loudness and export readiness

The workbench SHALL provide compact master/loudness visibility for project readiness. The component MUST show peak, loudness, clipping, and export-readiness state when analysis data is available.

#### Scenario: Loudness data is available

- **WHEN** loudness or peak analysis has completed
- **THEN** the workbench SHALL show the master/loudness state in the compact mixer or export summary
- **AND** export readiness SHALL include visible clipping or target loudness diagnostics where available.

#### Scenario: Loudness data is not available

- **WHEN** no loudness analysis has been run for the current project or selection
- **THEN** the workbench SHALL present an explicit analyze action or pending/unavailable state
- **AND** it MUST NOT imply that the project has passed loudness or clipping checks.

### Requirement: VS Code Webview integration

The component set SHALL remain compatible with VS Code Webview constraints, theme tokens, keyboard focus, dock resizing, and Extension Host message boundaries.

#### Scenario: Webview focus and keyboard shortcuts

- **WHEN** the audio Webview has keyboard focus
- **THEN** timeline tools, transport shortcuts, panel shortcuts, and text inputs SHALL not steal each other's events unexpectedly
- **AND** focus-sensitive commands SHALL only run when the audio Webview is the intended target.

#### Scenario: Theme and layout constraints

- **WHEN** the user switches VS Code theme or resizes the editor/right dock
- **THEN** the workbench components SHALL preserve readable contrast, stable dimensions, and non-overlapping controls
- **AND** validation SHALL include a real VS Code Webview functional scenario for layout and interaction-sensitive behavior.
