## ADDED Requirements

### Requirement: Canvas playback Preview uses a stage-first player shell
The system SHALL render Canvas playback Preview as a stage-first player shell when a `CanvasPlaybackPlan` is available. The main stage MUST display the active playback unit's primary content, and playback controls MUST NOT be placed in a fixed top toolbar as the default layout.

#### Scenario: Playback plan opens player shell
- **WHEN** Canvas Preview receives a `CanvasPlaybackPlan` with playable units
- **THEN** the Preview displays a primary stage for the active unit
- **THEN** transport controls and route progress are placed in the bottom control area

#### Scenario: Stage overlay replaces fixed top bar
- **WHEN** the active unit has a title, kind, warning, branch state, or metadata action
- **THEN** the Preview may show compact overlay affordances inside the stage
- **THEN** it does not reserve a persistent top narrow bar for default playback metadata

### Requirement: Canvas playback Preview renders multiple content kinds in the main stage
The system SHALL render active playback units through stage renderers selected by `CanvasPlaybackUnit.kind` and `CanvasPlaybackUnit.renderMode`. Stage renderers MUST support media, image preview sources, text or Fountain-derived script excerpts, storyboard shot or scene summaries, narrative summaries, and generic node fallback states without changing playback route construction.

#### Scenario: Media unit renders media stage
- **WHEN** the active playback unit has kind `media` or render mode `media-playback`
- **THEN** the stage uses host-resolved preview variants or media playback affordances for the unit
- **THEN** unresolved media shows an explicit unavailable state instead of hiding the stage

#### Scenario: Shot unit renders storyboard stage
- **WHEN** the active playback unit has kind `shot`
- **THEN** the stage displays available shot visual content, generated preview imagery, action/dialogue/script text, or a bounded storyboard fallback
- **THEN** route controls continue to operate independently from the chosen shot renderer

#### Scenario: Generic unit renders fallback stage
- **WHEN** the active playback unit has kind `node` or `container` without a specialized renderer
- **THEN** the stage displays a node summary or selected-node preview fallback
- **THEN** Canvas highlighting can still identify the source node

### Requirement: Canvas playback Preview uses one segmented route timeline
The system SHALL expose route position and elapsed playback through one segmented timeline/progress rail. The segmented timeline MUST replace separate duplicate stage-progress and numeric timeline rows in the default playback layout.

#### Scenario: Segment maps to playback unit
- **WHEN** a route contains multiple playback units
- **THEN** the timeline renders one segment per route unit
- **THEN** the active segment indicates current unit progress and completed segments indicate elapsed route progress

#### Scenario: Segment navigation jumps to unit
- **WHEN** the user activates a timeline segment
- **THEN** playback stops or seeks according to the active advance policy
- **THEN** the active unit changes to the segment's playback unit

#### Scenario: Interactive branch route remains bounded
- **WHEN** playback pauses at an interactive branch before a target is chosen
- **THEN** the segmented timeline represents the current chosen route
- **THEN** unchosen branches are exposed as choices rather than prefilled route segments

### Requirement: Canvas playback Preview keeps transport controls in the bottom control area
The system SHALL place previous, play or pause, next, current time, total time, and route progress controls in a bottom control area. Media-specific controls such as volume or playback speed MUST be shown only when the active unit or route policy supports them.

#### Scenario: Timer playback shows time controls
- **WHEN** the playback plan advances by timer
- **THEN** the bottom controls show play or pause, previous, next, current time, total time, and timeline progress

#### Scenario: User-input playback disables unsupported auto-play
- **WHEN** the playback plan advances by user input
- **THEN** the bottom controls do not present unsupported automatic playback as available
- **THEN** branch or next-step choices remain reachable through the player UI

#### Scenario: Media-ended playback keeps media controls scoped
- **WHEN** the active unit advances by media-ended policy and exposes media playback capabilities
- **THEN** media-specific controls are associated with the media unit stage or bottom control area
- **THEN** generic storyboard and node units do not display irrelevant volume controls

### Requirement: Canvas playback Preview exposes metadata and diagnostics as secondary surfaces
The system SHALL expose Info, Branches, Diagnostics, adapter/mode/policy, and resource-reference details through secondary surfaces such as drawers, popovers, or compact overlays. These details MUST NOT occupy a permanent right-side inspector column in the default player layout.

#### Scenario: User opens diagnostics
- **WHEN** the playback plan contains diagnostics
- **THEN** the player exposes a diagnostics affordance
- **THEN** activating it reveals diagnostic details without replacing or permanently shrinking the main stage

#### Scenario: Branch choices appear at playback decision point
- **WHEN** the active playback unit has multiple enabled outgoing choices in interactive mode
- **THEN** the player displays branch choices as playback decisions near the stage or controls
- **THEN** selecting a choice updates the active route and notifies Canvas through the existing bridge message contract

#### Scenario: Technical metadata stays secondary
- **WHEN** the user needs adapter, behavior mode, advance policy, source node ID, or resource reference details
- **THEN** the player makes those details available through an inspector affordance
- **THEN** the default stage remains focused on preview content

### Requirement: Canvas playback player layout preserves runtime resource boundaries
The Canvas playback player SHALL keep layout state, current playback position, route history, resolved preview URLs, media element state, object URLs, and diagnostics drawer state out of persisted Canvas data. The player MUST continue to consume durable node IDs, unit IDs, resource references, and host-resolved runtime preview outputs through bridge messages.

#### Scenario: Save omits player runtime state
- **WHEN** the user saves a Canvas document while the Preview player is open and mid-playback
- **THEN** the saved `.nkc` contains stable Canvas data and optional playback metadata
- **THEN** it does not contain current time, active route history, drawer state, resolved Webview URIs, object URLs, or media element state

#### Scenario: Resource failure is localized to stage
- **WHEN** a stage renderer cannot resolve a preview image, audio source, video poster, or media URL
- **THEN** the player shows an unavailable state for that unit
- **THEN** route navigation, diagnostics, and source node highlighting remain usable

### Requirement: Canvas playback Preview supports internationalized player text
The system SHALL render Canvas playback Preview visible player text through VSCode localization resources. The Extension Host MUST produce localized labels, status messages, control text, empty states, and metadata labels, and the Webview MUST consume them as injected runtime data instead of directly calling VSCode APIs.

#### Scenario: Preview opens with localized shell text
- **WHEN** Canvas Preview creates the playback Webview
- **THEN** the Webview document uses the current VSCode locale attributes
- **THEN** title, status, transport controls, inspector labels, timeline labels, and unavailable states use localized text

#### Scenario: Webview localization respects sandbox boundaries
- **WHEN** the Preview Webview needs dynamic player text
- **THEN** it reads from the Extension Host injected localization dictionary
- **THEN** it does not import or call VSCode APIs from the Webview context
