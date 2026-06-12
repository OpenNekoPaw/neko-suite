## MODIFIED Requirements

### Requirement: Canvas activates subsystems by node type
The Canvas Webview SHALL activate built-in subsystems by scanning actual node types in the opened Canvas file and by checking newly added or removed nodes at runtime. A subsystem MUST become active when at least one trigger node type is present and MUST deactivate its UI/controller state when the last trigger node is removed. The narrative subsystem trigger set MUST include `narrative-start`, `choice`, `merge`, `narrative-scene`, `narrative-note`, and `narrative-ending`.

#### Scenario: Narrative subsystem activates from Choice node
- **WHEN** a Canvas contains a `narrative-start`, `choice`, `merge`, `narrative-scene`, `narrative-note`, or `narrative-ending` node
- **THEN** the narrative subsystem is active and its renderers, connection rules, metadata defaults, panels, and playback controls become available as applicable

#### Scenario: Subsystem UI deactivates after last trigger node is removed
- **WHEN** the user removes the last trigger node for a subsystem
- **THEN** Canvas hides that subsystem's active UI/controller state while preserving already-loaded chunks in module cache

## ADDED Requirements

### Requirement: Narrative activation and traversal node sets are separate
The Canvas subsystem model SHALL expose separate constants or descriptors for narrative subsystem activation nodes and narrative runtime traversal nodes. Activation MUST include editor-only narrative nodes; traversal MUST include only playable runtime nodes.

#### Scenario: Narrative note activates but does not traverse
- **WHEN** a Canvas contains `narrative-note` and no playable narrative traversal nodes
- **THEN** the narrative subsystem can activate for node editing and note rendering
- **THEN** traversal APIs return no playable narrative path through the note

#### Scenario: Start and ending participate in traversal
- **WHEN** a Canvas contains `narrative-start`, `narrative-scene`, `choice`, `merge`, and `narrative-ending` nodes connected as a valid graph
- **THEN** traversal APIs include those node types in successors, default path resolution, cycle checks, and terminal analysis
- **THEN** they continue to exclude `narrative-note` from runtime traversal
