# creative-workbench-shell Specification

## Purpose
Define the shared creative Workbench shell contract for covered editor packages, toolbar placement, panel layout, and status projection.
## Requirements
### Requirement: Creative Workbench package scope
The system SHALL apply the creative Workbench shell contract to `neko-cut`, `neko-canvas`, `neko-audio`, `neko-puppet`, `neko-model`, and `neko-sketch` as the first covered package set.

#### Scenario: Covered package is migrated
- **WHEN** a covered package changes its Webview shell or toolbar placement after this change starts
- **THEN** the package follows the creative Workbench shell contract for left toolbar, main panel, right panel, and VSCode StatusBar ownership

#### Scenario: Non-workbench package is changed
- **WHEN** Agent, Dashboard, Market, Story, Tools, Preview, or another non-creative-Workbench Webview changes its layout
- **THEN** this capability does not require it to adopt the creative Workbench shell contract

### Requirement: Canonical shell regions
The system SHALL model creative editor Webviews as left toolbar, main panel, optional right panel, optional bottom panel, and VSCode native StatusBar regions.

#### Scenario: Creative Webview renders shell regions
- **WHEN** a covered package renders its editor shell
- **THEN** its source or DOM exposes a left toolbar region, a main creative panel region, and either a right panel region or an explicitly documented right-inspector alternative

#### Scenario: Status information is passive
- **WHEN** editor-wide state is passive status such as selected item, object count, active layer, zoom, projection, engine, proxy, or subsystem state
- **THEN** the state is projected to VSCode native StatusBar or documented as an existing StatusBar-backed package status

### Requirement: Left toolbar responsibility
The left toolbar SHALL contain common/global editor actions, established primary tool selections, non-Cut common command buttons moved out of horizontal command rows, and visibility toggles for main-panel controls, right panels, overlays, or panel stacks.

#### Scenario: Visibility toggle controls main panel controls
- **WHEN** a left toolbar button shows or hides timeline controls, transport controls, drawing/canvas overlays, HUD overlays, or another main-panel control region
- **THEN** the button uses `aria-controls` and `aria-expanded` or equivalent accessible state pointing at the controlled main-panel control region

#### Scenario: Horizontal toolbar button is classified
- **WHEN** a package-specific horizontal toolbar contains command buttons such as track creation, timeline edit toggles, viewport commands, audio analysis commands, zoom, fit view, or export
- **THEN** each button is classified by responsibility as a left-toolbar common action, main-panel contextual control, right-panel local control, or VSCode-native command/status item before migration

#### Scenario: Non-Cut command row is removed
- **WHEN** `neko-model`, `neko-puppet`, `neko-audio`, `neko-canvas`, or `neko-sketch` would render a standalone horizontal command toolbar above or over the main panel
- **THEN** its common command buttons render in the left toolbar, right-panel-local buttons render in the right panel, and the standalone horizontal command toolbar is not rendered

#### Scenario: Property mutation button is reviewed
- **WHEN** a button changes a brush parameter, edits selected-object properties, switches inspector sections, or applies local right-panel settings
- **THEN** the button is placed in the main panel or right panel rather than the left toolbar unless it is a package's established primary tool-selection action

#### Scenario: Primary tool rail remains valid for drawing editors
- **WHEN** `neko-sketch` or `neko-canvas` uses a left rail for primary tool selection or high-frequency global editor tools
- **THEN** the left rail remains valid as long as contextual controls and selected-object properties stay in the main panel or right panel

### Requirement: Main panel control ownership
The main panel SHALL own the primary creative surface and embedded controls that operate as part of that surface, including preview controls, transport controls, timeline surfaces, Cut timeline controls, waveform/viewport/canvas surfaces, brush controls, canvas zoom/minimap controls, and animation controls.

#### Scenario: Preview and timeline editor
- **WHEN** `neko-cut` renders preview playback controls, timeline surfaces, or timeline command buttons
- **THEN** preview playback controls, timeline surfaces, and timeline command controls remain in the main panel while the left toolbar exposes visibility toggles for timeline main-panel controls and right properties

#### Scenario: Viewport editor
- **WHEN** `neko-model` or `neko-puppet` renders viewport command buttons, fit-view controls, animation controls, or timeline/keyframe controls
- **THEN** common viewport command buttons render in the left toolbar, timeline/keyframe surfaces remain in main or bottom panel regions, and shell-level horizontal toolbar rows are not rendered

#### Scenario: Audio editor
- **WHEN** `neko-audio` renders transport, waveform, spectrum display, loudness display, or analysis command buttons
- **THEN** transport, waveform, spectrum display, and loudness display remain in the audio main panel, analysis and spectrum command buttons render in the left toolbar, and a separate horizontal analysis toolbar is not rendered

#### Scenario: Canvas or drawing editor
- **WHEN** `neko-canvas` or `neko-sketch` renders zoom, minimap, brush, vector, drawing, or contextual canvas controls
- **THEN** those controls render inside the canvas/drawing main panel, in the left primary tool rail when that is the established global tool pattern, or in the right panel when they are properties

### Requirement: Right panel ownership
The right panel SHALL own selected-object properties, inspectors, outliners, layer stacks, node libraries, side-panel sections, and local panel tabs or controls.

#### Scenario: Inspector controls remain local
- **WHEN** a right panel exposes property groups, tabs, local section switches, reset/apply buttons, layer controls, effect chains, recording settings, export settings, or node library sections
- **THEN** those controls remain in the right panel and are not duplicated in the left toolbar

#### Scenario: Canvas uses right-anchored floating panels
- **WHEN** `neko-canvas` uses right-anchored floating property panels or a right node library instead of a fixed right dock
- **THEN** the panels satisfy the right panel responsibility as long as their role is inspector, property, or creation-library content

### Requirement: VSCode StatusBar boundary
The system SHALL use VSCode native StatusBar for passive editor status and SHALL NOT recreate passive editor status in package Webview chrome when a native projection exists.

#### Scenario: StatusBar projection exists
- **WHEN** a package has native StatusBar projection for a passive status value
- **THEN** the Webview shell does not render an additional topbar, lower-corner badge, or side-panel-only duplicate for that same passive status

#### Scenario: Interactive control remains in Webview
- **WHEN** a status-related surface requires rich interaction, scrubbers, preview media, progress detail, or frequent creative manipulation
- **THEN** the surface remains in the Webview main panel or right panel rather than moving to StatusBar

### Requirement: Horizontal toolbar guardrail
The system SHALL prevent new package-specific shell-level horizontal toolbar rows above the main creative surface for covered creative Workbench packages, except for `neko-cut` timeline controls that are part of the timeline control component.

#### Scenario: New horizontal control row is proposed
- **WHEN** a covered package introduces a new horizontal control row adjacent to the top of the main shell
- **THEN** the implementation classifies each button as a left-toolbar common action, main-panel embedded control, right-panel local control, or VSCode native command/status item before acceptance

#### Scenario: Existing main-panel header remains allowed
- **WHEN** a Cut timeline control/header, transport strip, canvas overlay, or viewport overlay is semantically part of the main panel
- **THEN** it may remain horizontal because it is not shell-level chrome

### Requirement: Migration evidence
Each covered package migration SHALL include targeted evidence that the package follows the shell responsibilities without changing domain command ownership.

#### Scenario: Package migration completes
- **WHEN** a covered package completes its shell migration
- **THEN** tests or source/DOM assertions prove left toolbar responsibility, main-panel control placement, right-panel placement, and StatusBar boundary behavior for that package

#### Scenario: Shared shell primitives are adopted
- **WHEN** a package adopts shared shell primitives
- **THEN** the package keeps command callbacks, store ownership, and extension message contracts in its own adapter or package code
