## ADDED Requirements

### Requirement: Agent can derive successor nodes through Canvas contracts
The system SHALL expose an Agent-accessible derive operation that creates a successor node from a source node using registered presets, placement utilities, and connection contracts. The operation MUST use the same derivation rules available to the Webview UI.

#### Scenario: Derive same-type successor
- **WHEN** Agent requests a successor for a Shot node without specifying a target preset
- **THEN** the Canvas API creates a new Shot successor using the Shot preset, a non-overlapping placement, and a source-to-target connection when valid

#### Scenario: Derive target preset
- **WHEN** Agent requests a Gallery successor from a Shot node
- **THEN** the Canvas API creates a Gallery node using the registered preset if the source preset allows that derive target

### Requirement: Agent composite creation is atomic
The system SHALL expose an Agent-accessible composite creation operation that creates a container node and child nodes in one logical mutation. The operation MUST validate container policy, child presets, layout, and membership consistency before committing the mutation.

#### Scenario: Create Scene with Shots
- **WHEN** Agent requests creation of one Scene container with three Shot children
- **THEN** Canvas creates the Scene and Shots, assigns membership, arranges children, and returns the container ID and child IDs from one operation

#### Scenario: Invalid child preset fails atomically
- **WHEN** Agent requests a composite with a child preset rejected by the container policy
- **THEN** Canvas rejects the operation without creating partial nodes

### Requirement: Agent operations use shared placement and layout utilities
The system SHALL use shared `findFreePosition` and `autoArrangeContainer` behavior for Agent-created nodes and composites. Agent operations MUST NOT use fixed-gap placement that can cover existing work.

#### Scenario: Derived node avoids overlap
- **WHEN** the preferred position to the right of a source node is occupied
- **THEN** derive placement chooses the nearest free slot according to the shared placement policy

#### Scenario: Composite children arrange inside container
- **WHEN** Agent creates a Scene composite with auto-layout enabled
- **THEN** child Shot nodes are arranged according to Scene container layout policy and container bounds expansion rules

### Requirement: Agent structured content extraction follows layer boundaries
The system SHALL expose structured Canvas content extraction that can return JSON, markdown, or prompt-oriented content for selected nodes or explicit node IDs. Extraction MUST preserve layer boundaries and MUST NOT serialize runtime-only preview state.

#### Scenario: Extract Scene with children
- **WHEN** Agent requests structured content for a Scene with `includeChildren` enabled
- **THEN** the response includes Scene data, child node summaries, ordered child IDs, and relevant content bindings without duplicating runtime preview tokens

#### Scenario: Extract prompt format
- **WHEN** Agent requests prompt-oriented content for selected Shot nodes
- **THEN** the response includes generation-relevant fields such as visual description, characters, camera metadata, dialogue, and selected preview references in a stable text format

### Requirement: Existing Canvas Agent tools remain compatible
The system SHALL keep existing `canvas_list_nodes`, `canvas_get_node`, `canvas_create_node`, `canvas_update_node`, and generation tools compatible with legacy node data. New tools MUST be additive unless a future migration explicitly deprecates legacy behavior.

#### Scenario: Existing update reflects in composable node
- **WHEN** Agent calls `canvas_update_node` to change a field bound by a composable block
- **THEN** the composable block re-renders from updated `node.data`

#### Scenario: Legacy create still works
- **WHEN** Agent calls the existing create-node operation with a built-in legacy type
- **THEN** Canvas creates a valid node through compatibility behavior even if the type has not yet migrated to a composable preset

### Requirement: Agent tool schemas accept registered presets safely
The system SHALL allow Agent-facing creation and derive operations to use registered preset names while validating them against Canvas preset and container policy registries. Unknown or unsupported preset names MUST return typed errors.

#### Scenario: Unknown preset is rejected
- **WHEN** Agent requests creation with an unregistered preset name
- **THEN** the Canvas API returns a failure response naming the unsupported preset and creates no node

#### Scenario: Preset list drives tool metadata
- **WHEN** Canvas exposes derive or create capabilities to Agent
- **THEN** available built-in presets and derive targets are produced from the registry rather than a manually duplicated enum
