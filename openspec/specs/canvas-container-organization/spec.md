# canvas-container-organization Specification

## Purpose
Defines Canvas container membership, policy-driven layout, validation
invariants, and typed container actions for organizing nested and heterogeneous
Canvas nodes without duplicating child business data.
## Requirements
### Requirement: Canvas containers use generic container capability
The system SHALL represent Canvas organization through a generic container capability with child IDs, policy name, layout state, and accepted child constraints. Scene, Group, and Artboard MUST be built-in policies over this capability rather than separate containment models. Migrated Webview UI paths for Scene and Group MUST treat the generic container capability as canonical.

#### Scenario: Scene uses container capability
- **WHEN** a Scene node is created through the new container path
- **THEN** it stores child membership through the generic container capability and policy `scene`

#### Scenario: Group uses same membership contract
- **WHEN** nodes are grouped
- **THEN** the resulting Group node uses the same container capability shape with policy `group`

#### Scenario: Migrated Scene UI reads canonical child order
- **WHEN** a migrated Scene renders its child summaries, auto-layouts children, or reorders children
- **THEN** it uses the generic container child order and helper APIs rather than direct `data.shotIds` access

#### Scenario: Scene membership has no legacy mirrors
- **WHEN** a container action changes Scene membership
- **THEN** the implementation updates canonical container child IDs and child parent IDs without writing `data.shotIds` or `data.sceneGroupId`

### Requirement: Container membership is explicit and bidirectional
The system SHALL maintain container membership through explicit child IDs on the container and a parent ID on each direct child. A node MUST have at most one parent ID, and parent/child references MUST remain bidirectionally consistent.

#### Scenario: Add child to container
- **WHEN** a node is added to a container
- **THEN** the container child list includes the node ID and the child node `parentId` references the container

#### Scenario: Remove child from container
- **WHEN** a node is removed from a container
- **THEN** the container child list no longer includes the node ID and the child node no longer references that parent

### Requirement: Container policies define behavior but not child data ownership
The system SHALL allow container policies to define accepted child presets or types, default layout, derive targets, delete semantics, and batch actions. Policies MUST NOT own or duplicate child node business data.

#### Scenario: Scene accepts heterogeneous references
- **WHEN** the Scene policy accepts shots, media, annotations, and galleries
- **THEN** those children remain normal CanvasNodes with their own data while Scene controls membership and order

#### Scenario: Group releases children by default
- **WHEN** a Group container is deleted with release semantics
- **THEN** its children remain on the canvas with parent references cleared

### Requirement: Containers support nested and heterogeneous organization
The system SHALL support containers that contain other containers and heterogeneous child node types, subject to policy constraints and cycle validation.

#### Scenario: Scene contains reference group
- **WHEN** a Scene contains a Group of media references alongside Shot children
- **THEN** the membership remains valid if it satisfies policy constraints and does not introduce a cycle

#### Scenario: Cycle is prevented
- **WHEN** a user attempts to add an ancestor container as a descendant of its child
- **THEN** validation prevents the operation

### Requirement: Container layout is policy-driven and preserves absolute positions
The system SHALL store layout intent separately from authoritative node positions. Auto-layout actions MAY update child node absolute positions but MUST NOT introduce parent-local coordinates for ordinary Canvas nodes.

#### Scenario: Auto-arrange Scene children
- **WHEN** Scene auto-arrange runs
- **THEN** child Shot nodes receive updated absolute canvas positions based on Scene layout policy

#### Scenario: Manual child position is preserved
- **WHEN** a child node has manual layout lock metadata
- **THEN** automatic layout respects the lock and avoids unexpectedly moving the child

### Requirement: Container actions replace ad hoc Scene and Group operations
The system SHALL provide generic add, remove, move, reorder, and composite creation actions for containers. Existing Scene and Group actions MUST delegate to these generic actions during migration. Migrated Webview rendering, minimap visibility, viewport filtering, clipboard behavior, and property-panel summaries MUST use these organization contracts instead of duplicating Scene-specific containment rules.

#### Scenario: Assign shots delegates to container action
- **WHEN** existing UI calls assign selected shots to Scene
- **THEN** the implementation delegates to the generic add-child container action and writes canonical membership

#### Scenario: Composite creation is atomic
- **WHEN** a container and child node set are created as one composite operation
- **THEN** all nodes, membership references, layout positions, and operation audit records are committed as one logical mutation or not committed

#### Scenario: Canvas node layer hides contained children through membership helpers
- **WHEN** the top-level canvas decides whether a child node should be drawn independently or summarized inside a migrated container
- **THEN** it determines that behavior from organization membership helpers and policy metadata rather than checking Shot-specific legacy fields

#### Scenario: Clipboard remaps migrated containers
- **WHEN** a migrated container subtree is copied and pasted
- **THEN** the pasted nodes receive remapped canonical child IDs and parent IDs consistently

### Requirement: Container validation covers persistence operations
The system SHALL validate container invariants on migration, save, import, clipboard paste, composite creation, and container store mutations.

#### Scenario: Paste remaps subtree
- **WHEN** a copied container subtree is pasted
- **THEN** child IDs and parent IDs are remapped consistently and internal connections are remapped or omitted according to connection-scope rules

#### Scenario: Dangling child ID is repaired or reported
- **WHEN** a file loads with a container child ID that has no matching node
- **THEN** migration or validation reports the dangling ID and prevents it from silently corrupting container behavior

### Requirement: Container actions are declared and dispatched through typed descriptors
The system SHALL declare container-specific UI actions through typed `ContainerActionDescriptor` metadata and dispatch them through a typed `ContainerActionContext`. Container rendering MUST NOT hardcode Scene, Gallery, or Table action button branches in the generic content dispatcher.

#### Scenario: Scene action bar uses descriptors
- **WHEN** a Scene container renders assign-selected, auto-layout, or batch-generate controls
- **THEN** those controls are derived from `ContainerActionDescriptor` metadata and invoke the matching typed dispatcher action

#### Scenario: Gallery batch generate reuses dispatcher
- **WHEN** a Gallery container renders a generate-all control
- **THEN** it uses the same `batch-generate` descriptor and dispatcher path as other compatible containers

#### Scenario: Table actions update table data through declared IDs
- **WHEN** a Table container renders add-row, add-column, remove-row, or remove-column controls
- **THEN** each control maps to a typed `ContainerActionId` and updates table data through the container action dispatcher

#### Scenario: Batch generate sends existing agent payload
- **WHEN** a container `batch-generate` action is invoked
- **THEN** the dispatcher sends `{ type: 'sendToAgent', nodeIds: child node ids, action: 'batch' }` through the existing Webview postMessage path

### Requirement: Card and container actions share enum condition evaluation
The system SHALL evaluate card and container action availability with the enum `ActionCondition` values `always`, `has-selection`, `has-preview`, `not-generating`, and `has-asset`. Action descriptors MUST NOT embed function predicates or untyped callbacks.

#### Scenario: Container not-generating checks child nodes
- **WHEN** a container action has `enabledWhen: 'not-generating'`
- **THEN** the evaluator checks the container child nodes and disables the action while any child is generating

#### Scenario: Card has-preview checks resolved preview source
- **WHEN** a card action has `enabledWhen: 'has-preview'`
- **THEN** the evaluator uses the card policy's resolved `CardPreviewSource` before falling back to legacy node preview metadata

#### Scenario: Descriptor remains serializable
- **WHEN** container or card action metadata is created by a preset or policy
- **THEN** the descriptor contains only typed IDs, labels, visibility fields, enum conditions, and serializable metadata

### Requirement: Agent target insertion uses generic container actions
The system SHALL apply Agent-targeted child insertion, append, move, and reorder requests through generic Canvas container actions. Scene, Group, Artboard, Gallery, and future containers MUST NOT receive separate Agent-only membership mutation paths.

#### Scenario: Insert Agent text into Scene container
- **WHEN** Agent sends text content to a Scene container with `create-child` mode
- **THEN** Canvas creates a valid child node and adds it through the generic container add-child action

#### Scenario: Append storyboard shots to existing Scene
- **WHEN** Agent sends structured shot content to an existing Scene container
- **THEN** Canvas validates the Scene policy, creates Shot children, and appends them through canonical container child order

### Requirement: Container target validation prevents invalid membership
The system SHALL validate Agent-provided container targets against container policy, child type constraints, cycle rules, and existing parent membership before mutating state. Invalid requests MUST fail atomically.

#### Scenario: Rejected child type leaves state unchanged
- **WHEN** Agent attempts to insert a child node type rejected by the target container policy
- **THEN** Canvas returns a typed validation error and no node or membership mutation is committed

#### Scenario: Moving child between containers clears old parent
- **WHEN** Agent moves an existing node from one container to another through a valid target request
- **THEN** Canvas removes the child from the old container, adds it to the new container, updates the child's parent ID, and emits one logical change event

### Requirement: Container queries expose targetable summaries
The system SHALL expose read-only queries that return container child IDs, accepted child constraints, layout policy, and targetable slots in a compact form suitable for Agent planning.

#### Scenario: Agent queries focused container
- **WHEN** Agent asks for the active Canvas context while focus is inside a container
- **THEN** Canvas returns the focused container ID, child order summary, and accepted child constraints

#### Scenario: Agent chooses target slot
- **WHEN** a container exposes named slots or ordered insertion positions
- **THEN** the query result includes stable slot or position references that Agent may use in a follow-up transfer target

### Requirement: Container membership actions preserve relationship connections
The system SHALL treat container add, remove, move, and reorder actions as organization mutations that do not create, delete, or retarget real relationship connections unless an explicit delete-subtree or connection-order synchronization policy requires it.

#### Scenario: Move child into container preserves connections
- **WHEN** a node with existing real connections is moved into a container
- **THEN** the node receives the container parent ID, the container child list includes the node, and the node's existing real connections remain persisted unchanged

#### Scenario: Move child out of container preserves connections
- **WHEN** a node is released from a container without deleting the node
- **THEN** the child parent ID is cleared, the container child list removes the node, and the node's real connections remain persisted unchanged

#### Scenario: Reorder child does not rewrite unrelated edges
- **WHEN** a container child is reordered under a policy that does not explicitly synchronize connection order
- **THEN** only the container child order changes and unrelated relationship edges remain unchanged

### Requirement: Container deletion applies explicit connection cleanup semantics
The system SHALL clean up real connections according to the deletion policy applied to the container operation.

#### Scenario: Delete node removes node edges
- **WHEN** a node is deleted
- **THEN** all real connections where the node is source or target are removed

#### Scenario: Release children preserves child edges
- **WHEN** a container is deleted with release-children semantics
- **THEN** children are released, real connections to or from the deleted container are removed, and real connections between released children or from released children to external nodes are preserved

#### Scenario: Delete subtree removes descendant edges
- **WHEN** a container is deleted with delete-subtree semantics
- **THEN** the container, descendants, and all real connections touching any removed node are removed

### Requirement: Container insertion order is explicit and stable
The system SHALL insert moved or newly created children at a deterministic container order position based on an explicit insertion index, target slot, or drop-position derivation, falling back to append when no position is available.

#### Scenario: Drop position derives insertion order
- **WHEN** a node is moved into a container and the UI can derive an insertion index from the drop position
- **THEN** the node is inserted at that index in the container child order

#### Scenario: No insertion hint appends
- **WHEN** a node is moved into a container without a valid insertion index or target slot
- **THEN** the node is appended to the end of the container child order

#### Scenario: Moving between containers clears old parent
- **WHEN** a node moves from one container to another
- **THEN** the old container removes the child ID, the new container inserts the child ID once, and the child parent ID points only to the new container

### Requirement: Playback consumes container order without changing containment
The system SHALL allow playback projection to consume container child order, child placement order, and layout intent as route hints. Playback MUST NOT infer containment from visual position or connections, and MUST NOT mutate `parentId` or `container.childIds` while constructing a playback plan.

#### Scenario: Playback reads child order
- **WHEN** playback starts from a Scene or Group container
- **THEN** it reads direct children from canonical container membership and orders them through playback ordering rules

#### Scenario: Playback does not adopt nearby nodes
- **WHEN** an unparented node visually overlaps a container during playback projection
- **THEN** the node is not treated as a child unless container membership explicitly references it

#### Scenario: Playback plan construction is side-effect free
- **WHEN** a playback adapter projects a container subtree
- **THEN** the Canvas node list, container child IDs, parent IDs, and connections remain unchanged

### Requirement: Container expansion strategy is playback metadata
The system SHALL represent container playback expansion as playback metadata or adapter default behavior, not as a container policy mutation. Supported expansion strategies MUST include `self`, `children`, and `recursive`.

#### Scenario: Scene defaults to children expansion
- **WHEN** storyboard playback starts from a Scene without an explicit expansion override
- **THEN** the adapter expands the Scene to its ordered child Shot units

#### Scenario: Group can play as self
- **WHEN** generic playback starts from a Group with expansion `self`
- **THEN** playback creates a unit for the Group itself instead of expanding direct children

#### Scenario: Recursive expansion respects cycle validation
- **WHEN** playback recursively expands nested containers
- **THEN** projection relies on valid container organization and reports diagnostics rather than traversing an invalid cycle

