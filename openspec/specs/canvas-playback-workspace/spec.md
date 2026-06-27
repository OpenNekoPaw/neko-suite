# canvas-playback-workspace Specification

## Purpose
TBD - created by archiving change introduce-canvas-playback-workspace. Update Purpose after archive.
## Requirements
### Requirement: Canvas Editor Webview owns playback preview workspace
The Canvas editor SHALL provide playback preview through a `PlaybackWorkspace` inside the same `neko.canvasEditor` Webview that owns Canvas editing. The system MUST NOT open a second Canvas Preview Webview for the canonical playback route preview path.

#### Scenario: Reveal workspace from Canvas toolbar
- **WHEN** the user activates the Canvas preview/playback entry from the Canvas editor toolbar
- **THEN** the active `neko.canvasEditor` Webview displays or focuses `PlaybackWorkspace` without creating a separate Canvas Preview Webview

#### Scenario: Legacy preview path is not used as success path
- **WHEN** the canonical preview command is invoked after this change
- **THEN** the command reaches the same-Webview `PlaybackWorkspace` reveal path and does not return success through the legacy separate preview bridge

### Requirement: Playback workspace panes are independently visible
`PlaybackWorkspace` SHALL contain a Canvas viewport pane, playback stage, and playback route strip whose visibility can be independently changed without changing Canvas playback order.

#### Scenario: Hide playback stage while preserving route strip
- **WHEN** the user hides the playback stage while the route strip remains visible
- **THEN** the current route and current unit remain available in `PlaybackSession`
- **THEN** no private timeline order is written to `.nkc`

#### Scenario: Hide Canvas pane while preserving playback
- **WHEN** the user hides the Canvas viewport pane
- **THEN** the playback stage and route strip continue to use the current `CanvasPlaybackPlan`

### Requirement: Playback route strip uses CanvasPlaybackPlan as order source
The playback route strip SHALL render route segments from `CanvasPlaybackPlan` and MUST NOT store a separate order model.

#### Scenario: Render canonical route order
- **WHEN** a `CanvasPlaybackPlan` contains a selected route with ordered units
- **THEN** the route strip renders the units in plan order
- **THEN** the route strip stores only UI/session state such as visibility, hover, current unit, and playhead

#### Scenario: Reorder writes back to Canvas graph
- **WHEN** a user-triggered route reorder is supported
- **THEN** the reorder operation updates Canvas container, node, or connection ordering through Canvas graph commands
- **THEN** the displayed route is refreshed from a regenerated `CanvasPlaybackPlan`

### Requirement: Playback plan projection and cache invalidation are explicit
`CanvasPlaybackPlan` SHALL be treated as a derived projection of Canvas data and MUST be regenerated or invalidated when its source data, selected projection context, or resource-enrichment inputs change.

#### Scenario: Canvas graph change invalidates plan
- **WHEN** Canvas nodes, containers, connections, playback metadata, selected node, adapter, or mode change
- **THEN** cached playback plan data is invalidated before preview, Agent query, or Cut draft creation uses it

#### Scenario: Media enrichment invalidates on resource changes
- **WHEN** a preview-enriched plan includes duration, thumbnail, poster frame, availability, or probe metadata
- **THEN** changes to Asset index, ResourceRef resolver, ContentAccess revision, or media probe result invalidate the enriched cache

#### Scenario: Stale plan cannot import to Cut
- **WHEN** a route draft is requested from a plan whose source revision no longer matches the active Canvas data
- **THEN** the system returns a fail-visible stale-plan diagnostic instead of creating a Cut draft

### Requirement: Playback workspace handles keyboard focus and media lifecycle
The merged Canvas Editor Webview SHALL prevent editing and playback keyboard shortcuts from conflicting, and SHALL release, pause, or degrade playback resources when the workspace is hidden, stale, blurred, or disposed.

#### Scenario: Focus enters playback workspace
- **WHEN** focus moves from Canvas editing into `PlaybackWorkspace`
- **THEN** editing shortcuts that would mutate the graph are suppressed or passed through according to focus policy
- **THEN** playback shortcuts operate only on the active playback session

#### Scenario: Focus returns to Canvas editing
- **WHEN** focus returns from `PlaybackWorkspace` to Canvas editing
- **THEN** playback-only shortcuts no longer capture editing keystrokes

#### Scenario: Workspace hidden releases media resources
- **WHEN** `PlaybackWorkspace` is hidden, the Webview loses focus, or the playback session becomes stale
- **THEN** active media playback is paused, released, or downgraded according to media lifecycle policy
- **THEN** no Webview URI, stream token, or runtime media handle is written to `.nkc`
