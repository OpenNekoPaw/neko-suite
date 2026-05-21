## ADDED Requirements

### Requirement: Agent active context includes subsystem summaries
The Canvas Agent active context SHALL include optional subsystem summary fields that allow Agent tools to reason about mixed Canvas content without requiring a file-level kind. New fields MUST be additive and MUST NOT break existing callers that only read selected nodes, focused container, insertion point, or viewport.

#### Scenario: Active context reports node type summary
- **WHEN** Agent requests active Canvas context for a mixed Canvas
- **THEN** the result may include `nodeTypeSummary` counts keyed by node type

#### Scenario: Active context reports active subsystems
- **WHEN** a Canvas contains storyboard, narrative, and behavior trigger nodes
- **THEN** the active context may include `activeSubsystems` containing `storyboard`, `narrative`, and `behavior`

#### Scenario: Old caller ignores new fields
- **WHEN** an existing Agent caller requests active context and ignores unknown fields
- **THEN** the call remains compatible and existing fields retain their previous meanings

### Requirement: Agent tools accept registered Canvas node and connection types
Agent-facing Canvas creation, listing, derive, traversal, and update operations SHALL validate requested node and connection types against core Canvas types plus registered subsystem types. Unknown unregistered types MUST return typed errors unless the operation is explicitly read-only over existing fallback nodes.

#### Scenario: Agent creates registered Choice node
- **WHEN** Agent calls a Canvas creation tool with type `choice`
- **THEN** Canvas validates the type through the registered narrative subsystem and creates a valid node with narrative defaults

#### Scenario: Agent create rejects unregistered type
- **WHEN** Agent requests creation of an unregistered node type
- **THEN** Canvas returns a typed failure and creates no node

### Requirement: Agent can focus operations by subsystem
Agent-facing Canvas tools SHALL allow operations to filter or focus by node types, selected node types, active subsystem identifiers, or subsystem-specific traversal mode. Tools MUST dispatch by node/connection type rather than by Canvas file kind.

#### Scenario: Agent checks narrative dead ends in mixed Canvas
- **WHEN** Agent invokes narrative traversal on a Canvas that also contains Shot and State nodes
- **THEN** traversal uses narrative node and connection types and ignores unrelated storyboard or behavior nodes

#### Scenario: Agent generates storyboard shots in mixed Canvas
- **WHEN** Agent invokes storyboard generation for Shot nodes in a Canvas that also contains Choice nodes
- **THEN** generation targets the selected or filtered Shot nodes and does not require the Canvas to be storyboard-only

### Requirement: Agent context may include subsystem metadata summaries
The Canvas Agent active context SHALL provide compact optional summaries of subsystem metadata when requested or when relevant to the current selection. Metadata summaries MUST be bounded and MUST NOT include runtime-only Webview state.

#### Scenario: Narrative metadata summary is returned
- **WHEN** the active Canvas contains narrative metadata and Agent requests detailed active context
- **THEN** the result may include narrative variables and entry node reference without including Webview panel state

#### Scenario: Behavior metadata summary is returned
- **WHEN** the active Canvas contains behavior metadata and selected behavior nodes
- **THEN** the result may include blackboard summary data needed for behavior debugging

### Requirement: Agent operations preserve projected source boundaries
Agent-facing operations over projected Canvas graphs SHALL route source-owned mutations through projection adapters. Agent tools MUST NOT treat projected `.nkc` cache data as the authoritative source for entity or memory facts.

#### Scenario: Agent binds entity slot through projected Canvas
- **WHEN** Agent requests an entity slot binding while operating on a projected entity graph
- **THEN** Canvas routes the mutation through the entity projection adapter and reports the adapter result

#### Scenario: Agent reads projected layout separately from source data
- **WHEN** Agent lists nodes in a projected Canvas
- **THEN** the response can include Canvas layout and source-derived node summaries while preserving the distinction between cache-owned layout and source-owned facts
