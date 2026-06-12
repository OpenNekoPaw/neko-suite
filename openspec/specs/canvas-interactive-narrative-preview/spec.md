# canvas-interactive-narrative-preview Specification

## Purpose
TBD - created by archiving change add-canvas-interactive-narrative-preview. Update Purpose after archive.
## Requirements
### Requirement: Canvas stores branching narrative graphs in `.nkc`
The system SHALL use Canvas `.nkc` documents as the single source of truth for branching interactive narrative graphs. Narrative scene content MUST be referenced as standard `.fountain` files through `narrative-scene` metadata. The new workflow MUST NOT introduce or depend on `.nks`, `.story`, or standalone `.nkstory` graph files.

#### Scenario: Branching graph references Fountain scenes
- **WHEN** a user authors a branching narrative in Canvas
- **THEN** the graph nodes, connections, variables, genre, locale, and entry metadata are persisted in the `.nkc` document
- **THEN** each scene body is referenced by a `.fountain` file path or resource reference rather than embedded as a custom story language

#### Scenario: Deprecated formats are not accepted as graph sources
- **WHEN** Narrative Preview opens or exports a Canvas interactive narrative
- **THEN** it loads the graph from the `.nkc` narrative nodes and connections
- **THEN** it does not read `.nks`, `.story`, or standalone `.nkstory` files as the branching graph source

### Requirement: Narrative node semantics include explicit start and ending nodes
The system SHALL support `narrative-start` and `narrative-ending` Canvas node types for interactive narrative graphs. A narrative graph MUST allow at most one `narrative-start`, `narrative-start` MUST NOT accept incoming runtime edges, and `narrative-ending` MUST NOT emit outgoing runtime edges.

#### Scenario: Start node is selected as graph entry
- **WHEN** a narrative graph contains a `narrative-start` node
- **THEN** traversal and Preview startup use that node as the graph entry before falling back to `metadata.entryNodeId` or the first traversal node

#### Scenario: Ending node is a valid terminal
- **WHEN** traversal reaches a `narrative-ending` node
- **THEN** the runtime enters the ended state and reports ending metadata and play statistics
- **THEN** the ending is not reported as an accidental dead end

### Requirement: Narrative traversal excludes editor-only note nodes
The system SHALL distinguish narrative activation node types from narrative runtime traversal node types. `narrative-note` MUST activate the narrative subsystem as an editor node and MUST NOT appear in default paths, successor lists, choice routing, dead-end diagnostics, or Preview runtime playback.

#### Scenario: Note activates editing tools without entering playback
- **WHEN** a Canvas contains only a `narrative-note` narrative node
- **THEN** the narrative subsystem UI can activate for editing support
- **THEN** Narrative Preview reports that no runtime entry path is available instead of playing the note node

#### Scenario: Runtime path ignores connected notes
- **WHEN** a graph contains `narrative-start`, `narrative-scene`, `choice`, `merge`, `narrative-ending`, and `narrative-note` nodes
- **THEN** traversal snapshots include only runtime traversal nodes in playable paths
- **THEN** note nodes remain available as editor annotations outside the playable path

### Requirement: Canvas provides revisioned narrative graph snapshots
The system SHALL expose a typed `NarrativeGraphSnapshot` extracted from the open Canvas editor provider's in-memory document model. Snapshot extraction MUST include unsaved changes and MUST carry a monotonically increasing `revision` plus caller-supplied `requestId` for Preview message ordering.

#### Scenario: Unsaved Canvas edit appears in Preview
- **WHEN** the user adds or edits a narrative node without saving the `.nkc` file
- **THEN** `NarrativePreviewBridge` extracts the updated graph from the in-memory Canvas document model
- **THEN** the next Preview refresh uses the unsaved edit

#### Scenario: Preview drops stale snapshots
- **WHEN** Preview receives two graph snapshots with different revisions out of order
- **THEN** it applies the highest accepted revision
- **THEN** it discards messages with revisions older than the current runtime graph

### Requirement: Canvas and Narrative Preview communicate through typed bridge messages
The system SHALL route Canvas-to-Preview and Preview-to-Canvas messages through the Extension Host using typed envelopes. Every graph-loading, refresh, jump, variable update, highlight, and choice message MUST include `requestId`; graph-mutating or graph-dependent messages MUST include `revision`.

#### Scenario: Canvas jump requests update Preview
- **WHEN** the user selects "preview from here" on a runtime narrative node
- **THEN** Canvas sends a `preview:jumpTo` message through `NarrativePreviewBridge` with `requestId`, target node ID, and current revision
- **THEN** Preview jumps only if the message revision is not stale

#### Scenario: Preview branch choice highlights Canvas
- **WHEN** the user selects a choice in Narrative Preview
- **THEN** Preview sends `canvas:choiceMade` and path highlight messages through the bridge
- **THEN** Canvas highlights the current node, chosen edge, and visited path without persisting runtime-only state

### Requirement: Narrative Preview plays branching stories with runtime state
The system SHALL provide a host-independent `NarrativeRuntime` and `NarrativePlayer` that can load a `NarrativeGraphSnapshot`, evaluate choices, apply variable effects, maintain history, step back, jump to nodes, and report idle, playing, waiting-choice, and ended states.

#### Scenario: Choice applies variable effects and advances
- **WHEN** the runtime is waiting on a `choice` node and the user selects an enabled choice
- **THEN** it applies the choice's variable effects through typed variable operations
- **THEN** it advances to the target node and records the choice in history

#### Scenario: Back step restores previous node
- **WHEN** the user activates the Preview back control after visiting multiple nodes
- **THEN** the runtime restores the previous node and variable snapshot according to its history model
- **THEN** Canvas receives an updated highlight for the restored path

### Requirement: Conditions are evaluated without dynamic code execution
The system SHALL evaluate narrative conditions through a whitelisted condition evaluator. Preview and export MUST NOT use `eval`, `new Function`, dynamic import, or untrusted script execution to evaluate Canvas condition strings.

#### Scenario: Supported comparison controls a choice
- **WHEN** a choice condition is `closeness >= 3` and the runtime variables contain `closeness: 2`
- **THEN** the choice is marked unavailable or hidden according to the locked-choice policy
- **THEN** no arbitrary JavaScript is executed

#### Scenario: Unsupported condition is explicit
- **WHEN** a choice condition uses unsupported syntax
- **THEN** the evaluator returns a structured unsupported-condition result
- **THEN** Preview renders a diagnostic state instead of treating the condition as true

### Requirement: Fountain scene content is parsed as standard Fountain
The system SHALL extend the existing Story parser package with `FountainPlayParser` that converts standard Fountain elements into `PlayDirective` records for scene headings, action, dialogue, parentheticals, transitions, and notes. The parser MUST NOT require non-standard Fountain branch, choice, or variable syntax.

#### Scenario: Dialogue becomes play directives
- **WHEN** a `.fountain` scene contains a scene heading, action, character line, parenthetical, and dialogue
- **THEN** `FountainPlayParser` emits ordered play directives preserving the original text and structured character/dialogue fields

#### Scenario: Branching stays in Canvas
- **WHEN** a `.fountain` file contains only standard Fountain screenplay content
- **THEN** Narrative Preview obtains branching choices, conditions, and target nodes from the `.nkc` graph rather than from custom Fountain directives

### Requirement: Play renderers are registered by story genre
The system SHALL dispatch Narrative Preview rendering through a renderer registry keyed by `StoryGenre`. The first implementation MUST support `IllustratedTextRenderer` for the core loop, and the registry MUST allow `VisualNovelRenderer` and `InteractiveFilmRenderer` to be added without changing the runtime state machine.

#### Scenario: Genre selects renderer
- **WHEN** a graph snapshot metadata genre is `illustrated-text`
- **THEN** Narrative Preview renders scenes and choices through `IllustratedTextRenderer`
- **THEN** the runtime state machine remains independent of the renderer implementation

#### Scenario: Missing renderer falls back explicitly
- **WHEN** the graph requests a genre with no registered renderer
- **THEN** Preview shows an unsupported-renderer state with the requested genre
- **THEN** it does not mutate graph data or silently choose an unrelated renderer

### Requirement: Narrative assets use durable refs and injected resolvers
The system SHALL represent narrative media using `NarrativeAssetRef` values aligned with `ResourceRef` or project-relative path refs. Preview renderers and runtime code MUST obtain usable URLs or paths through an injected `NarrativeAssetResolver` and MUST NOT persist Webview URIs, blob URLs, object URLs, engine tokens, or resolved runtime handles.

#### Scenario: Preview resolves background through injected resolver
- **WHEN** a narrative scene metadata background uses a `NarrativeAssetRef`
- **THEN** the Preview renderer asks the injected resolver for `interactive-preview` content
- **THEN** the `.nkc` document stores only the durable ref and no resolved Webview URI

#### Scenario: Runtime handle is rejected as durable asset
- **WHEN** scene metadata contains only a Webview URI, blob URL, object URL, or engine token as an asset source
- **THEN** validation reports a non-durable narrative asset reference
- **THEN** export and package operations do not treat it as source content

### Requirement: HTML5 export reuses the Preview runtime
The system SHALL implement HTML5 interactive story export by packaging the same host-independent runtime, renderer components, graph snapshot, Fountain scene content, and resolved assets used by Narrative Preview. Export MUST swap host adapters and resource intents instead of maintaining a separate playback implementation.

#### Scenario: Export packages source assets
- **WHEN** the user exports an interactive narrative to HTML5
- **THEN** the exporter resolves narrative assets with `final-export` or `package` intent
- **THEN** the generated bundle uses relative packaged assets rather than Preview Webview URIs

#### Scenario: Preview and export share playback behavior
- **WHEN** a graph path reaches a choice, applies variable effects, and reaches an ending in Preview
- **THEN** the exported HTML5 runtime follows the same graph semantics for that path
- **THEN** only host adapters and asset resolution outputs differ

