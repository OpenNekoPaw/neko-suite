## MODIFIED Requirements

### Requirement: Agent can derive successor nodes through Canvas contracts
The system SHALL expose an Agent-accessible derive operation that creates a successor node from a source node using registered presets, placement utilities, and connection contracts. The operation MUST use the same derivation rules available to the Webview UI. After a core preset is migrated and marked as the default, Agent derive MUST prefer the migrated preset while still accepting explicit legacy target presets.

#### Scenario: Derive same-type successor
- **WHEN** Agent requests a successor for a Shot node without specifying a target preset
- **THEN** the Canvas API creates a new Shot successor using the Shot preset, a non-overlapping placement, and a source-to-target connection when valid

#### Scenario: Derive target preset
- **WHEN** Agent requests a Gallery successor from a Shot node
- **THEN** the Canvas API creates a Gallery node using the registered preset if the source preset allows that derive target

#### Scenario: Migrated default derive returns composable node
- **WHEN** Agent derives a same-type successor from a migrated Shot, Scene, Gallery, or Media node without specifying a legacy target
- **THEN** the returned node includes the migrated preset name, `content` tree, binding metadata, and legacy-compatible data shape

#### Scenario: Explicit legacy derive remains available
- **WHEN** Agent derives a node with an explicit `*.legacy` target preset
- **THEN** the Canvas API creates the legacy-compatible node if the preset is registered and allowed by derive rules

### Requirement: Agent composite creation is atomic
The system SHALL expose an Agent-accessible composite creation operation that creates a container node and child nodes in one logical mutation. The operation MUST validate container policy, child presets, layout, and membership consistency before committing the mutation. Migrated container presets MUST create composable containers and composable children by default when those presets are the registered defaults.

#### Scenario: Create Scene with Shots
- **WHEN** Agent requests creation of one Scene container with three Shot children
- **THEN** Canvas creates the Scene and Shots, assigns membership, arranges children, and returns the container ID and child IDs from one operation

#### Scenario: Invalid child preset fails atomically
- **WHEN** Agent requests a composite with a child preset rejected by the container policy
- **THEN** Canvas rejects the operation without creating partial nodes

#### Scenario: Migrated Scene composite returns layer metadata
- **WHEN** Agent creates a Scene composite using migrated presets
- **THEN** the returned Scene includes container capability and child-node slot content, and each returned child includes `parentId`, composable content, and node summary metadata

#### Scenario: Legacy composite remains explicit
- **WHEN** Agent creates a composite with explicit legacy container or child presets
- **THEN** Canvas preserves legacy node data compatibility while still validating membership through container policy

### Requirement: Agent structured content extraction follows layer boundaries
The system SHALL expose structured Canvas content extraction that can return JSON, markdown, or prompt-oriented content for selected nodes or explicit node IDs. Extraction MUST preserve layer boundaries and MUST NOT serialize runtime-only preview state. For migrated nodes, extraction MUST include binding summaries, container order, preview summaries, and collection/projection summaries without embedding Webview runtime resources.

#### Scenario: Extract Scene with children
- **WHEN** Agent requests structured content for a Scene with `includeChildren` enabled
- **THEN** the response includes Scene data, child node summaries, ordered child IDs, and relevant content bindings without duplicating runtime preview tokens

#### Scenario: Extract prompt format
- **WHEN** Agent requests prompt-oriented content for selected Shot nodes
- **THEN** the response includes generation-relevant fields such as visual description, characters, camera metadata, dialogue, and selected preview references in a stable text format

#### Scenario: Extract migrated Gallery collection
- **WHEN** Agent extracts a migrated Gallery node
- **THEN** the response includes Gallery-level data, collection summaries for cells, selected candidate references, and binding paths needed for follow-up updates

#### Scenario: Extract mixed legacy and composable nodes
- **WHEN** Agent extracts a selection containing both legacy nodes and migrated composable nodes
- **THEN** the response preserves common node summaries and only includes binding metadata for nodes that declare composable content
