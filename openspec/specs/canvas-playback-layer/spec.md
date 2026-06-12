# canvas-playback-layer Specification

## Purpose
TBD - created by archiving change add-canvas-playback-layer. Update Purpose after archive.
## Requirements
### Requirement: Canvas playback metadata is optional extension data
The system SHALL define shared Canvas playback metadata, node override, and connection override contracts as optional extension data. Playback metadata MUST NOT add required base fields to `CanvasNode`, MUST NOT introduce a file-level Canvas kind discriminator, and MUST NOT persist runtime URLs, timers, DOM state, or media element state.

#### Scenario: Existing Canvas opens without playback metadata
- **WHEN** a Canvas file has nodes, containers, and connections but no playback metadata
- **THEN** the playback layer derives a plan from existing structure or reports typed diagnostics without requiring a migration

#### Scenario: Playback metadata does not alter base node shape
- **WHEN** a node has playback role or order metadata
- **THEN** that metadata is read from Canvas playback metadata or extension metadata rather than from required `CanvasNodeBase` fields

### Requirement: Playback adapters project Canvas data into playback plans
The system SHALL provide a Canvas Playback Adapter Registry that converts `CanvasData` into a transient `CanvasPlaybackPlan`. The registry MUST support `auto`, `storyboard`, `narrative`, `media-sequence`, and `generic` adapter IDs, and MUST return diagnostics when no adapter can produce playable units.

#### Scenario: Auto adapter selects storyboard graph
- **WHEN** the selected node or Canvas graph primarily contains `scene` and `shot` nodes
- **THEN** adapter auto-detection uses storyboard rules to produce playback units and transitions

#### Scenario: Auto adapter selects narrative graph
- **WHEN** a Canvas contains narrative runtime nodes such as `narrative-start` and `narrative-scene`
- **THEN** adapter auto-detection can select narrative playback without admitting storyboard nodes into the narrative runtime node set

#### Scenario: Unsupported graph reports diagnostics
- **WHEN** no playable nodes or transitions can be resolved
- **THEN** the registry returns typed diagnostics that identify the unsupported graph shape and suggested playback surface

### Requirement: Adapter profile is separate from behavior mode
The system SHALL separate playback adapter/profile selection from behavior mode. Adapter/profile MUST determine how Canvas structure is interpreted, while behavior mode MUST determine how the produced plan advances during playback.

#### Scenario: Storyboard can run interactively
- **WHEN** storyboard playback is requested with behavior mode `interactive`
- **THEN** storyboard adapter projection remains unchanged while execution pauses for eligible branch choices

#### Scenario: Auto mode resolves adapter defaults
- **WHEN** playback metadata uses mode `auto`
- **THEN** storyboard defaults to linear advancement, narrative defaults to interactive advancement, media-sequence defaults to media-ended advancement, and generic defaults to linear advancement

### Requirement: Storyboard adapter plays scene and shot structures
The storyboard adapter SHALL support playback for `scene` containers and `shot` nodes. It MUST expand a selected Scene into playable Shot units by default, support starting from a selected Shot, and support Scene-to-Scene routes through playable connections.

#### Scenario: Scene expands to child shots
- **WHEN** a user starts storyboard playback from a Scene container with Shot children
- **THEN** the playback plan contains Shot units ordered by the storyboard ordering rules

#### Scenario: Selected shot starts within scene
- **WHEN** a user starts storyboard playback from a Shot that belongs to a Scene container
- **THEN** playback starts at that Shot and can continue through the remaining ordered Shot units

#### Scenario: Scene sequence continues to next scene
- **WHEN** one Scene has a playable `sequence` connection to another Scene
- **THEN** the storyboard playback plan can continue from the first Scene's final Shot into the next Scene's ordered Shots

### Requirement: Container playback uses organization order without owning containment
The playback layer SHALL consume container order from `container.childIds`, `container.childPlacements`, and layout metadata without making connections determine containment. Container expansion MUST support `self`, `children`, and `recursive` strategies.

#### Scenario: Group children play in container order
- **WHEN** generic playback starts from a Group with `children` expansion
- **THEN** playback units follow the resolved direct child order from organization metadata

#### Scenario: Reference connection does not add a child
- **WHEN** a node has a `reference` connection to a container member
- **THEN** playback projection does not treat the referenced node as contained unless organization metadata also contains it

#### Scenario: Recursive expansion preserves direct membership
- **WHEN** playback recursively expands nested containers
- **THEN** each expanded child is still resolved through explicit parent and child IDs rather than inferred by position

### Requirement: Connection playback is deterministic and branch-aware
The playback layer SHALL treat `sequence`, `default`, and `choice` connections as playable transitions by default, SHALL exclude `reference` connections from playback routes by default, and SHALL sort multiple outgoing playable transitions deterministically by playback override order, connection priority, connection array order, and connection id.

#### Scenario: Linear mode chooses first eligible transition
- **WHEN** a playback unit has multiple eligible outgoing transitions in linear mode
- **THEN** playback follows the first transition after deterministic sorting

#### Scenario: Interactive mode displays branch choices
- **WHEN** a playback unit has multiple eligible outgoing transitions in interactive mode
- **THEN** playback pauses and exposes branch choices using playback label, `choiceText`, connection label, or a default continue label

#### Scenario: Reference edge is ignored by playback route
- **WHEN** a node has only `reference` outgoing connections
- **THEN** playback does not follow those connections as route transitions unless an adapter explicitly opts in

### Requirement: Playback resolves entry and terminal units consistently
The playback layer SHALL resolve entry units from explicit playback entry IDs, node playback role `start`, adapter-specific starts, zero-playable-in-degree units, selected node fallback, and first playable unit fallback. Terminal units SHALL resolve from node playback role `end`, adapter-specific endings, or absence of eligible outgoing transitions.

#### Scenario: Explicit entry wins
- **WHEN** playback metadata declares an entry ID that maps to a playable unit
- **THEN** playback starts from that unit even if another adapter-specific start exists

#### Scenario: Narrative ending remains adapter-specific terminal
- **WHEN** narrative playback reaches a `narrative-ending` unit
- **THEN** the unit is terminal according to narrative adapter semantics

#### Scenario: Dead end becomes terminal outside narrative validation
- **WHEN** generic playback reaches a playable unit without eligible outgoing transitions
- **THEN** the unit is treated as a terminal playback unit and may also produce a diagnostic if the adapter expects an explicit end

### Requirement: Preview surfaces consume playback plans without persisting runtime resources
Canvas and Preview surfaces SHALL be able to consume `CanvasPlaybackPlan` messages. Plans MUST identify source nodes, unit kinds, durable resource references, and transitions, but MUST NOT persist or require Webview-only runtime URLs.

#### Scenario: Preview loads playback plan
- **WHEN** Canvas opens a generic playback preview for a storyboard or grouped graph
- **THEN** the Preview surface receives a playback plan and renders or highlights the current unit according to its unit kind

#### Scenario: Media unit uses runtime resolver
- **WHEN** a playback unit references a media node
- **THEN** Preview resolves runtime media access through existing preview/content access adapters rather than reading a runtime URL from the plan

#### Scenario: Narrative preview remains compatible
- **WHEN** a Narrative Preview is opened for a valid narrative graph
- **THEN** existing narrative load and refresh messages remain supported alongside any generic playback plan entry point

### Requirement: Playback diagnostics explain unsupported surfaces
The system SHALL provide user-visible diagnostics when the requested playback surface cannot play the selected graph. Diagnostics MUST distinguish non-narrative storyboard nodes, missing playable units, missing entries, unsupported connection types, and filtered branches.

#### Scenario: Scene opened in narrative surface
- **WHEN** a Canvas containing only `scene` and `shot` nodes is opened in the Narrative Preview surface
- **THEN** the user sees a diagnostic explaining that Narrative Preview requires narrative runtime nodes and suggesting storyboard or generic playback

#### Scenario: Branch filtered by condition
- **WHEN** a branch transition is disabled by condition evaluation
- **THEN** playback exposes a diagnostic or disabled choice state that identifies the filtered transition

#### Scenario: Missing media preview source
- **WHEN** a media playback unit cannot resolve a preview source
- **THEN** playback reports a typed diagnostic and keeps the rest of the plan navigable

