# canvas-agent-composite-operations Specification

## Purpose
Defines Agent-facing Canvas operations for deriving nodes, creating composites, extracting structured content, preserving legacy tool compatibility, and reasoning about mixed-purpose Canvas subsystem context.
## Requirements
### Requirement: Agent can derive successor nodes through Canvas contracts
The system SHALL expose an Agent-accessible derive operation that creates a successor node from a source node using registered presets, placement utilities, and connection contracts. The operation MUST use the same derivation rules available to the Webview UI. Agent derive MUST use migrated presets for Shot, Scene, Gallery, and Media core nodes.

#### Scenario: Derive same-type successor
- **WHEN** Agent requests a successor for a Shot node without specifying a target preset
- **THEN** the Canvas API creates a new Shot successor using the Shot preset, a non-overlapping placement, and a source-to-target connection when valid

#### Scenario: Derive target preset
- **WHEN** Agent requests a Gallery successor from a Shot node
- **THEN** the Canvas API creates a Gallery node using the registered preset if the source preset allows that derive target

#### Scenario: Migrated default derive returns composable node
- **WHEN** Agent derives a same-type successor from a migrated Shot, Scene, Gallery, or Media node without specifying a target preset
- **THEN** the returned node includes the migrated preset name, `content` tree, binding metadata, and canonical organization fields when applicable

#### Scenario: Removed core legacy derive is rejected
- **WHEN** Agent derives a node with an explicit removed core `*.legacy` target preset
- **THEN** the Canvas API rejects the request without creating a node

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

#### Scenario: Removed core legacy composite presets are rejected
- **WHEN** Agent creates a composite with explicit removed core legacy container or child presets
- **THEN** Canvas rejects the request without creating partial nodes

### Requirement: Agent operations use shared placement and layout utilities
The system SHALL use shared `findFreePosition` and `autoArrangeContainer` behavior for Agent-created nodes and composites. Agent operations MUST NOT use fixed-gap placement that can cover existing work.

#### Scenario: Derived node avoids overlap
- **WHEN** the preferred position to the right of a source node is occupied
- **THEN** derive placement chooses the nearest free slot according to the shared placement policy

#### Scenario: Composite children arrange inside container
- **WHEN** Agent creates a Scene composite with auto-layout enabled
- **THEN** child Shot nodes are arranged according to Scene container layout policy and container bounds expansion rules

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

#### Scenario: Extract mixed composable and non-composable nodes
- **WHEN** Agent extracts a selection containing migrated core nodes and non-core nodes that have not been migrated
- **THEN** the response preserves common node summaries and only includes binding metadata for nodes that declare composable content

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

### Requirement: Agent prompt fragments describe Canvas subsystem conventions
Canvas SHALL contribute Agent prompt fragments through its `AgentCapabilityProvider` so mixed-purpose Canvas conventions are available before the Agent explicitly calls Canvas context tools. Prompt fragments MUST remain advisory context and MUST NOT replace tool parameter validation.

#### Scenario: Agent receives subsystem guidance
- **WHEN** the Canvas capability provider is registered with Agent runtime
- **THEN** it may contribute prompt guidance that tells the Agent to inspect active subsystems, request subsystem metadata when needed, and respect projection adapter write-back boundaries

#### Scenario: Prompt fragments remain additive
- **WHEN** an older Agent runtime ignores provider prompt fragments
- **THEN** Canvas tools continue to validate node types, connection types, and projection boundaries at execution time

### Requirement: Agent operations preserve projected source boundaries
Agent-facing operations over projected Canvas graphs SHALL route source-owned mutations through projection adapters. Agent tools MUST NOT treat projected `.nkc` cache data as the authoritative source for entity or memory facts.

#### Scenario: Agent binds entity slot through projected Canvas
- **WHEN** Agent requests an entity slot binding while operating on a projected entity graph
- **THEN** Canvas routes the mutation through the entity projection adapter and reports the adapter result

#### Scenario: Agent reads projected layout separately from source data
- **WHEN** Agent lists nodes in a projected Canvas
- **THEN** the response can include Canvas layout and source-derived node summaries while preserving the distinction between cache-owned layout and source-owned facts

### Requirement: Canvas storyboard imports resolve media through content access
Canvas SHALL resolve Agent-imported storyboard reference images through stable resource references and the intent-aware content access service before using legacy path projection.

#### Scenario: Imported shot has referenceResourceRef
- **WHEN** Canvas imports a storyboard shot containing `referenceResourceRef`
- **THEN** Canvas requests `interactive-preview` content for the appropriate image role
- **THEN** Canvas stores the stable reference and uses only the resolved runtime URI for display

#### Scenario: Imported shot has both ref and path
- **WHEN** Canvas imports a storyboard shot containing both a stable reference and `referenceImagePath`
- **THEN** Canvas prefers the stable reference for preview and persistence
- **THEN** the saved node omits the runtime or cache path when the stable reference is valid

### Requirement: Canvas legacy path fallback is explicit
Canvas SHALL treat legacy document cache paths as migration fallback and SHALL surface unresolved or migration status when those paths cannot be projected.

#### Scenario: Legacy path fallback succeeds
- **WHEN** an existing Canvas node has only a legacy cache path and the file still exists under an authorized legacy root
- **THEN** Canvas MAY project the path for display
- **THEN** Canvas keeps the path marked as legacy fallback rather than stable identity

#### Scenario: Legacy path fallback fails
- **WHEN** an existing Canvas node has only a legacy cache path and the file is missing or unauthorized
- **THEN** Canvas displays an unavailable document resource state
- **THEN** it does not reuse a previous thumbnail or sequential image

### Requirement: Canvas save strips runtime storyboard image handles
Canvas SHALL strip runtime storyboard image handles from persisted node data when stable references are present.

#### Scenario: Save after preview materialization
- **WHEN** a storyboard shot preview has materialized through resource cache
- **THEN** Canvas saves the stable reference fields
- **THEN** Canvas does not save `runtimeReferenceImagePath`, projected Webview URI, object URL, blob URL, or materialized cache path as durable data

### Requirement: Agent can query active Canvas context
The system SHALL expose Agent-accessible Canvas context queries for active document identity, selected nodes, viewport insertion point, focused container, and compact node summaries. These queries MUST be read-only and MUST return stable IDs suitable for follow-up mutations.

#### Scenario: Query selected Canvas node
- **WHEN** Agent requests active Canvas context while exactly one node is selected
- **THEN** Canvas returns the selected node ID, node type, preset or policy metadata when available, and a compact generation-relevant summary

#### Scenario: Query insertion fallback
- **WHEN** Agent requests active Canvas context while no node is selected
- **THEN** Canvas returns a viewport insertion point or reports that no deterministic insertion target is available

### Requirement: Agent can apply text and prompt content to Canvas targets
The system SHALL expose a target-aware Canvas operation for importing or applying Agent-generated text, optimized prompts, and structured content. The operation MUST validate the target node, container, slot, field path, and mutation mode before committing changes.

#### Scenario: Apply prompt to Shot node
- **WHEN** Agent sends an optimized prompt to a Shot node's generation prompt field
- **THEN** Canvas updates only the validated prompt field and preserves unrelated Shot data

#### Scenario: Insert text as new Canvas node
- **WHEN** Agent sends text content with insert mode and a viewport insertion point
- **THEN** Canvas creates an appropriate text, annotation, document, or script node at that insertion point

#### Scenario: Invalid target is rejected
- **WHEN** Agent sends structured content to a node that does not accept the requested slot or field path
- **THEN** Canvas rejects the operation with a typed error and does not partially mutate the canvas

### Requirement: Agent content imports use shared Canvas mutation services
The system SHALL route target-aware Agent content imports through the same Canvas domain services used by Webview buttons, command handlers, and Agent tools. Implementations MUST NOT maintain separate patching logic for Agent-only content application.

#### Scenario: Webview and Agent produce same mutation
- **WHEN** a user sends a prompt to the selected Canvas node from the Agent Webview and Agent later calls the equivalent tool directly
- **THEN** both paths validate the same target constraints and produce the same Canvas change event shape

### Requirement: Canvas query results are compact by default
The system SHALL keep Agent-facing Canvas query results compact by default. Detailed node data, child expansion, visual thumbnails, and generated asset metadata MUST require explicit request options.

#### Scenario: List nodes returns summaries
- **WHEN** Agent lists active Canvas nodes without detail options
- **THEN** Canvas returns stable IDs, types, labels, parent/container references, and brief summaries without serializing large preview data

#### Scenario: Detail request expands target node
- **WHEN** Agent requests a specific node with detail options
- **THEN** Canvas returns the requested editable fields and binding metadata needed for a follow-up mutation
