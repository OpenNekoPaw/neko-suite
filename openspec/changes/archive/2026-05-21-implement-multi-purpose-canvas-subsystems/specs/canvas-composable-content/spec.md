## ADDED Requirements

### Requirement: Nodes can expose inline expanded editors
The Canvas Webview SHALL allow node renderers or composable content descriptors to expose a collapsed summary state and an inline expanded editing state. Inline expanded editors MUST write through existing node data update paths and MUST NOT create a second source of truth outside `node.data`.

#### Scenario: Shot expands inline for detailed editing
- **WHEN** the user expands a Shot node
- **THEN** Canvas shows editable Shot details inside the node and writes changes to the Shot node data fields

#### Scenario: Selecting another node collapses current editor
- **WHEN** one node is expanded and the user selects another node
- **THEN** Canvas collapses the previous expanded editor and preserves any committed data changes

### Requirement: Floating panels host subsystem-wide editors
The Canvas Webview SHALL host cross-node subsystem editors as floating panels rather than as a permanent right-side property panel. Floating panels MUST interact with Canvas state through store actions or subsystem controllers and MUST NOT own authoritative node data.

#### Scenario: Narrative variables open in floating panel
- **WHEN** the narrative subsystem is active and the user opens the variables panel
- **THEN** Canvas displays a draggable floating panel that edits narrative metadata through Canvas state contracts

#### Scenario: Panel visibility does not affect persisted node data
- **WHEN** the user hides a subsystem floating panel
- **THEN** Canvas does not remove or alter the subsystem metadata or node data controlled by that panel

### Requirement: Connections can be edited inline
The Canvas Webview SHALL provide inline editing for connection labels and registered connection attributes such as type, choice text, condition, priority, or weight. Connection editing MUST update `CanvasData.connections` and MUST preserve graph edges as top-level Canvas relationship data.

#### Scenario: User edits connection label inline
- **WHEN** the user double-clicks a connection label
- **THEN** Canvas enters label editing for that connection and persists the new label on the top-level connection object

#### Scenario: User edits narrative condition
- **WHEN** the user edits a narrative choice condition from the connection inline editor
- **THEN** Canvas persists the condition on the connection extension data without embedding the edge inside either endpoint node

### Requirement: Node library groups are descriptor driven
The Canvas Webview SHALL populate node library groups from core descriptors and active or available subsystem manifests. Templates and creation commands MAY choose initial expanded groups and metadata defaults, but MUST NOT restrict future node creation by kind.

#### Scenario: Narrative template does not lock node library
- **WHEN** the user creates a new Narrative Flow Canvas
- **THEN** Canvas may pre-expand Basic and Narrative groups and prefill narrative metadata, but the user can still add Storyboard, Behavior, Entity, Memory, or Basic nodes later

#### Scenario: Subsystem group is available on demand
- **WHEN** the user expands the Behavior node library group in a Canvas without behavior nodes
- **THEN** Canvas makes behavior node creation actions available without changing the file kind

### Requirement: Property panel removal preserves existing edit coverage
The system SHALL not remove a permanent property panel path until equivalent inline node editing, floating panel editing, or inline connection editing exists for the fields and actions previously exposed by that panel.

#### Scenario: Connection fields remain editable after panel removal
- **WHEN** the permanent property panel is removed
- **THEN** connection label, type, and registered subsystem attributes remain editable through inline connection UI or context menu actions

#### Scenario: Existing storyboard fields remain editable
- **WHEN** storyboard nodes are migrated to inline expanded editing
- **THEN** existing storyboard generation, prompt, metadata, and candidate review fields remain reachable without requiring the old property panel
