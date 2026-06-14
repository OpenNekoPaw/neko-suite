## ADDED Requirements

### Requirement: Canvas documents declare optional creative scope
The system SHALL allow Canvas `.nkc` documents to declare optional creative scope metadata for long-form and interactive production. Scope metadata MUST be advisory and MUST NOT restrict valid Canvas node types, subsystem metadata, or playback adapter selection.

#### Scenario: Sequence board declares scene range
- **WHEN** a Canvas document represents a sequence or beat group containing multiple storyboard scenes
- **THEN** its creative scope can declare `kind: "sequence"` with stable sequence identity and related scene IDs
- **THEN** the Canvas remains valid when it also contains media, narrative, annotation, gallery, or project reference nodes

#### Scenario: Existing Canvas has no scope
- **WHEN** an existing `.nkc` document omits creative scope metadata
- **THEN** the loader accepts it without migration failure
- **THEN** UI and Agent context treat the scope as unknown or generic

### Requirement: Canvas scope supports long-form video work units
Canvas creative scope SHALL support at least episode overview, sequence, scene, shot-cluster, and interactive-narrative work units. The system MUST NOT require one Canvas per scene or one Canvas per episode.

#### Scenario: Episode overview links to sequence boards
- **WHEN** an episode overview Canvas references multiple sequence boards
- **THEN** the navigation layer exposes those boards as related workspaces without requiring all sequence details to be embedded in the overview Canvas

#### Scenario: Scene board remains valid
- **WHEN** a creator opens a focused Canvas for a single complex scene
- **THEN** the Canvas can declare scene scope and still use SceneGroupNode and ShotNode structures for detailed visual editing

#### Scenario: Shot cluster board remains valid
- **WHEN** a creator extracts a small action beat or complex transformation into a focused board
- **THEN** the Canvas can declare shot-cluster scope with stable shot IDs
- **THEN** the original storyboard and sequence boards can link to that board through related-board refs

### Requirement: Scoped Canvas navigation uses durable board references
The system SHALL represent related Canvas boards using durable workspace-relative paths, resource refs, project refs, or other portable board references. Navigation metadata MUST NOT persist absolute local paths or Webview-only runtime URIs.

#### Scenario: Related board opens from overview
- **WHEN** a creator selects a related sequence board from an episode overview
- **THEN** the Extension Host resolves the durable board reference and opens the target `.nkc`
- **THEN** the Webview does not receive or persist an absolute filesystem path as the source of truth

#### Scenario: Missing related board is diagnosed
- **WHEN** a scoped Canvas references a related board that cannot be resolved
- **THEN** the UI surfaces a typed missing-board diagnostic
- **THEN** the rest of the Canvas remains editable

### Requirement: Storyboard import preserves scope intent
Canvas storyboard import SHALL use storyboard, episode, sequence, or scene metadata to name and scope created Canvas documents or imported scene groups. Import behavior MUST avoid naming a multi-scene board solely from the first scene title when broader scope metadata is available.

#### Scenario: Multi-scene storyboard creates sequence-scoped board
- **WHEN** Agent sends a StoryboardTable with sequence or episode context to Canvas import
- **THEN** the created or updated Canvas can record sequence or episode-related scope metadata
- **THEN** created SceneGroupNodes still preserve individual scene IDs and scene titles

#### Scenario: Single-scene import remains simple
- **WHEN** Story or Agent imports a single scene storyboard without sequence context
- **THEN** Canvas may create or update a scene-scoped board named from that scene
- **THEN** no episode or sequence scope is required

### Requirement: Canvas context summaries expose scope without leaking internals
Canvas Agent context, execution summaries, and Dashboard projections SHALL expose compact scope and related-board summaries when available. They MUST NOT expose raw Webview state, DOM state, generation history blobs, or full internal node trees outside the Canvas boundary.

#### Scenario: Agent sees active sequence context
- **WHEN** Agent requests active Canvas context for a sequence-scoped board
- **THEN** the result includes scope kind, stable scope IDs, current selected scene/shot summaries, and related-board summaries where available
- **THEN** it omits runtime-only Webview URLs and raw internal node rendering state

#### Scenario: Dashboard lists scoped boards
- **WHEN** Dashboard or project overview consumes Canvas board metadata
- **THEN** it can group boards by episode, sequence, scene, shot-cluster, or interactive-narrative scope using compact summaries
- **THEN** it does not need to parse every Canvas node to infer the board purpose
