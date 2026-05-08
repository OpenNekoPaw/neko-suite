# canvas-composable-content Specification

## Purpose
TBD - created by archiving change canvas-block-container-architecture. Update Purpose after archive.
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
The system SHALL define presets that assemble content, data defaults, ports, preview capabilities, container capability, and behavior metadata for new nodes. Presets MUST be registered by name and MUST NOT require adding a monolithic React node component for every new asset format.

#### Scenario: Shot preset creates content and data defaults
- **WHEN** the Shot preset is used to create a node
- **THEN** the created node has Shot data defaults and composable content for status, controls, preview, metadata, and selected-only details

#### Scenario: New asset preset reuses existing renderers
- **WHEN** a panoramic image preset is registered
- **THEN** it composes asset preview and delegate capabilities without adding a new top-level node renderer component

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
The system SHALL allow property panels to enumerate content blocks, bindings, collections, and preview capabilities to generate appropriate editors for composable nodes. Legacy nodes without content MUST continue using existing per-type property panel branches.

#### Scenario: Bound input appears in property panel
- **WHEN** a composable node has an InputBlock bound to `/duration`
- **THEN** the property panel can render a duration editor using the block binding metadata

#### Scenario: Legacy branch remains available
- **WHEN** an existing node lacks composable content
- **THEN** the property panel uses the existing type-specific editing branch

