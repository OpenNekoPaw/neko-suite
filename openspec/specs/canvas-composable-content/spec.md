# canvas-composable-content Specification

## Purpose
Defines how Canvas nodes use composable content trees, field-bound blocks,
collections, projections, and generic node cards so node UIs can be assembled
from reusable descriptors while `node.data` remains authoritative.
## Requirements
### Requirement: Canvas nodes support optional composable content trees
The system SHALL allow Canvas nodes to define optional composable `content` trees made of sections, blocks, collections, projections, and child-node slots. Nodes without `content` MUST continue using legacy renderers.

#### Scenario: Content node uses composable renderer
- **WHEN** a Canvas node has a valid `content` tree
- **THEN** the Webview renders the node content through the composable content renderer

#### Scenario: Legacy node falls back
- **WHEN** a Canvas node has no `content` tree
- **THEN** the Webview renders the node through the existing node renderer registry

### Requirement: Blocks bind to node data through field bindings
The system SHALL support field bindings that read and write values in `node.data` through JSON Pointer-style paths. Blocks MUST treat `node.data` as the authoritative state and MUST NOT duplicate editable data as separate block state.

#### Scenario: Scalar field updates through block
- **WHEN** a SelectBlock bound to `/shotScale` changes value
- **THEN** the store updates `node.data.shotScale` through the same update path used by existing node data edits

#### Scenario: Nested collection field updates through block
- **WHEN** a Gallery cell prompt editor is bound to `/cells/0/prompt`
- **THEN** the update changes that nested data path without replacing unrelated Gallery cell data

### Requirement: Presets assemble node capabilities
The system SHALL define presets that assemble content, data defaults, ports, preview capabilities, container capability, and behavior metadata for new nodes. Presets MUST be registered by name and MUST NOT require adding a monolithic React node component for every new asset format. Migrated core presets MUST provide production-ready content trees for new Shot, Scene, Gallery, and Media nodes, and removed core legacy presets MUST NOT remain registered.

#### Scenario: Shot preset creates content and data defaults
- **WHEN** the Shot preset is used to create a node
- **THEN** the created node has Shot data defaults and composable content for status, controls, preview, metadata, and selected-only details

#### Scenario: New asset preset reuses existing renderers
- **WHEN** a panoramic image preset is registered
- **THEN** it composes asset preview and delegate capabilities without adding a new top-level node renderer component

#### Scenario: Scene preset creates container content
- **WHEN** the migrated Scene preset is used to create a node
- **THEN** the created node has scene metadata controls, a child-node slot for ordered children, Scene container capability, and layout metadata

#### Scenario: Gallery preset creates collection content
- **WHEN** the migrated Gallery preset is used to create a node
- **THEN** the created node renders Gallery cells as a collection bound to `/cells` and keeps generation candidate state in `node.data`

#### Scenario: Media preset creates asset preview content
- **WHEN** the migrated Media preset is used to create a node
- **THEN** the created node renders asset information and lightweight preview through composable blocks bound to existing media data fields

### Requirement: Collections remain node-internal by default
The system SHALL represent table rows, Gallery cells, tag sets, key-value entries, and similar internal structures as content collections bound to `node.data` by default. Collection items MUST NOT become CanvasNodes unless explicitly promoted.

#### Scenario: Gallery cells stay internal
- **WHEN** a Gallery node displays multiple generated cell candidates
- **THEN** the cells render as a collection inside the Gallery node and do not appear in `CanvasData.nodes`

#### Scenario: Collection item is promoted
- **WHEN** a user or Agent promotes a Gallery cell to an independent asset node
- **THEN** the system creates a CanvasNode for the promoted item and may add organization or relationship links through normal Canvas contracts

### Requirement: Projections do not own authoritative data
The system SHALL represent views such as storyboard tables as projections over existing nodes or data. Projection edits MUST write through to the referenced authoritative data and MUST NOT create a second source of truth.

#### Scenario: Storyboard row edits Shot data
- **WHEN** a storyboard table row edits visual description for `shot-1`
- **THEN** the edit writes to the referenced Shot node data rather than a separate table-owned copy

#### Scenario: Storyboard row reorder updates Scene order
- **WHEN** a storyboard table row is reordered within a Scene projection
- **THEN** the owning Scene container child order is updated through organization-layer actions

### Requirement: Property panels can derive editors from composable content
The system SHALL allow property panels to enumerate content blocks, bindings, collections, and preview capabilities to generate appropriate editors for composable nodes. Non-core nodes without content MAY continue using existing per-type property panel branches. Migrated core presets MUST expose enough binding metadata for property panels to edit their visible fields without duplicating type-specific branches.

#### Scenario: Bound input appears in property panel
- **WHEN** a composable node has an InputBlock bound to `/duration`
- **THEN** the property panel can render a duration editor using the block binding metadata

#### Scenario: Non-core branch remains available
- **WHEN** a non-core node lacks composable content
- **THEN** the property panel uses the existing type-specific editing branch

#### Scenario: Migrated Shot panel is generated from bindings
- **WHEN** a migrated Shot node is selected
- **THEN** the property panel renders editors for visual description, duration, camera metadata, characters, dialogue, voice-over, and sound cue from content binding metadata

#### Scenario: Migrated Gallery panel edits collection data
- **WHEN** a migrated Gallery node is selected
- **THEN** the property panel can edit Gallery-level fields and selected cell fields through bindings into `/cells` without replacing unrelated cell data

#### Scenario: Specialized actions remain explicit
- **WHEN** a composable node needs a non-field action such as batch generation or opening a delegated preview
- **THEN** the property panel invokes registered action metadata rather than embedding new node-type-specific data ownership

### Requirement: Child-node slots render through generic node cards
The system SHALL render Canvas child-node slots through a generic `NodeCard` component backed by a `NodeCardPolicy` registry. Child-node slot rendering MUST NOT require adding node-type branches to a monolithic child card component for each supported node type.

#### Scenario: Scene child slot renders heterogeneous summaries
- **WHEN** a Scene content tree includes Shot, Media, Text, Annotation, Gallery, or Group child nodes
- **THEN** the child-node slot renders each child through `NodeCard` using the matching `NodeCardPolicy` or fallback policy

#### Scenario: New node type reuses card slots
- **WHEN** a new Canvas node type registers a `NodeCardPolicy`
- **THEN** the child-node slot renders its preview, metadata, badges, and actions without modifying the generic `NodeCard` component

#### Scenario: Unknown node type falls back
- **WHEN** a child node has no registered `NodeCardPolicy`
- **THEN** the child-node slot renders a bounded fallback card with a title, icon preview, and safe remove action

### Requirement: Node card policies produce pure view models
The system SHALL keep `NodeCardPolicy` implementations pure and synchronous. Policies MUST produce preview source descriptors, metadata, badges, and action descriptors without creating React elements, resolving runtime URLs, mutating stores, or sending extension messages.

#### Scenario: Policy resolves card metadata during render
- **WHEN** `NodeCard` resolves title, subtitle, badges, preview source, and action descriptors for a child node
- **THEN** the policy returns plain data that can be tested without mounting React or initializing a Webview runtime

#### Scenario: Runtime work stays in slots and dispatchers
- **WHEN** a card needs a preview URL or action side effect
- **THEN** `CardPreviewSlot` or a typed action dispatcher performs that runtime work outside the policy

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
