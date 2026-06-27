## ADDED Requirements

### Requirement: Agent displays Canvas playback order without owning playback
Agent SHALL be able to display Canvas playback order summaries, route lists, diagnostics, and confirmation cards derived from `CanvasPlaybackPlan`, but MUST NOT maintain an independent route order, timeline, playhead, or video playback runtime.

#### Scenario: Display route summary
- **WHEN** Agent receives a `CanvasPlaybackPlan` summary for the active Canvas
- **THEN** Agent displays route title, entry source, unit count, duration when available, diagnostics, and ordered unit summary
- **THEN** Agent does not persist an `agentOrder` or private playback route model

#### Scenario: Agent does not play media
- **WHEN** the user asks Agent to play the Canvas route
- **THEN** Agent dispatches a reveal intent to the Canvas playback workspace
- **THEN** Agent Chat does not start its own media stream, decoder, playhead, or seek state

### Requirement: Agent reveals owning playback surfaces
Agent SHALL dispatch playback-related actions to the owning surface through typed reveal/open capabilities.

#### Scenario: Reveal Canvas playback workspace
- **WHEN** the user clicks "play in Canvas" from an Agent route card
- **THEN** Agent calls the Canvas reveal capability with source canvas URI, route id, and optional unit id
- **THEN** the Canvas Editor Webview displays or focuses `PlaybackWorkspace`

#### Scenario: Reveal Cut timeline
- **WHEN** the user asks to inspect imported Cut results from Agent
- **THEN** Agent calls the Cut reveal capability with project URI and optional sequence or clip id
- **THEN** Cut owns timeline focus and playback session

#### Scenario: Reveal media resource
- **WHEN** Agent displays a media resource card and the user asks to preview it
- **THEN** Agent dispatches a resource preview intent
- **THEN** `neko-preview` or Engine-owned media runtime handles playback and authorization

### Requirement: Agent applies approval policy to playback route mutations and imports
Agent SHALL classify playback-route actions by risk and must use approval or explicit user-instruction context before mutating `.nkc`, creating/updating `.nkv`, or dispatching high-impact Cut import actions.

#### Scenario: Read-only route query
- **WHEN** Agent calls `canvas.getPlaybackPlan`, `canvas.getPlaybackRoutes`, `cut.getTimelineInfo`, or a reveal/focus action
- **THEN** the action is treated as read-only or low risk and does not require confirmation unless it triggers resource authorization or a long-running task

#### Scenario: Explicit user reorder instruction
- **WHEN** the same Agent turn contains a specific user instruction such as "move scene 3 before scene 1"
- **THEN** `canvas.reorderPlaybackUnits` may be auto-approved according to capability policy
- **THEN** the resulting Canvas order is written through Canvas graph commands and reprojected into `CanvasPlaybackPlan`

#### Scenario: Agent-inferred reorder requires confirmation
- **WHEN** Agent infers a reorder from a broad request or quality suggestion without a specific user ordering instruction
- **THEN** Agent must request confirmation before mutating `.nkc`

#### Scenario: Cut import requires confirmation
- **WHEN** Agent is about to create or update an `.nkv` from a Canvas draft
- **THEN** Agent must present a confirmation card showing route, unit count, target project, and overwrite risk before dispatching Cut import
