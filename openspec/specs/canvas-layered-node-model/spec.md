# canvas-layered-node-model Specification

## Purpose
TBD - created by archiving change canvas-block-container-architecture. Update Purpose after archive.
## Requirements
### Requirement: Canvas nodes expose decoupled layer authorities
The system SHALL model Canvas nodes as decoupled spatial, content, organization, and relationship layers. Each layer MUST have an explicit authority boundary and MUST NOT persist implementation-owned state from another layer.

#### Scenario: Spatial fields remain independent of content and organization
- **WHEN** a node has `content`, `parentId`, or `container`
- **THEN** its spatial fields remain stored as `position`, `size`, `zIndex`, and optional `rotation` without embedding content layout or container membership state

#### Scenario: Relationship data remains top-level
- **WHEN** a node contains blocks, ports, or container children
- **THEN** graph edges remain persisted in top-level `CanvasData.connections` rather than inside node content or container data

### Requirement: Canvas node positions are absolute canvas coordinates
The system SHALL treat `node.position` as canvas-world absolute coordinates for ordinary Canvas nodes. Parent membership MUST NOT change the coordinate system used by drag, selection, minimap, viewport culling, clipboard, or connection rendering.

#### Scenario: Child node retains absolute position
- **WHEN** a Shot node becomes a child of a Scene container
- **THEN** the Shot node position remains a canvas-world absolute coordinate rather than becoming Scene-local

#### Scenario: Container movement translates child subtree
- **WHEN** a container node is moved by a delta
- **THEN** the store action translates each direct and nested child node by the same delta while preserving their absolute coordinate model

### Requirement: Canvas layer boundaries communicate through contracts
The system SHALL make layer interactions use IDs, field bindings, endpoint references, policy names, preview descriptors, and store actions. Layers MUST NOT import or mutate each other's renderer/runtime implementation details. Migrated Webview production paths MUST use shared layer helpers or registries at layer boundaries and MUST NOT read removed Scene/Shot containment mirrors.

#### Scenario: Content references a relationship endpoint
- **WHEN** a connection endpoint targets a block or field
- **THEN** the endpoint references `blockId` or `fieldPath` while the content block does not own the connection object

#### Scenario: Content displays organization children through summaries
- **WHEN** a container node displays its children inside node content
- **THEN** it uses child IDs, a child-node slot, and node preview descriptors rather than embedding child node components as owned content

#### Scenario: Migrated render path uses layer helpers
- **WHEN** a migrated Scene, Group, Shot, Gallery, or Media Webview feature needs parent or child membership
- **THEN** it reads membership through layer helpers such as `getContainerChildIds` and `getNodeParentId` rather than directly branching on `data.shotIds` or `data.sceneGroupId`

#### Scenario: Removed core mirrors are not used
- **WHEN** Scene or Shot membership changes
- **THEN** the implementation updates canonical `container.childIds` and child `parentId` without writing `data.shotIds` or `data.sceneGroupId`

### Requirement: Canvas data validation covers cross-layer invariants
The system SHALL provide validation for layer invariants, including absolute coordinates, single parent membership, bidirectional parent/child consistency, container cycles, dangling child IDs, dangling endpoint references, and invalid block/field bindings.

#### Scenario: Invalid container cycle is rejected
- **WHEN** a store action or migration would create a cycle in container membership
- **THEN** validation rejects the change or reports a typed warning without persisting the cyclic state

#### Scenario: Dangling endpoint is reported
- **WHEN** a connection endpoint references a missing node, port, block, or field
- **THEN** validation reports the dangling reference so the UI can repair, hide, or remove the invalid edge

### Requirement: Canvas schema uses composable core nodes
The system SHALL create Shot, Scene, Gallery, and Media nodes with composable `content`, canonical `container`/`parentId` organization fields, preview capabilities, and endpoint metadata where applicable. The pre-launch schema MAY break old core-node files that depended on removed legacy React renderers or Scene/Shot membership mirrors.

#### Scenario: Core node without content has no legacy renderer
- **WHEN** a Shot, Scene, Gallery, or Media node lacks composable `content`
- **THEN** the Webview does not route it through removed legacy core renderers

#### Scenario: Unknown future fields are preserved
- **WHEN** a Canvas file contains optional layer fields not used by the current renderer
- **THEN** load/save behavior preserves those fields unless an explicit migrator removes them

#### Scenario: New migrated node preserves authoritative data
- **WHEN** the Webview creates a Shot, Scene, Gallery, or Media node through a migrated preset
- **THEN** the node contains authoritative `node.data` fields for editable state plus the optional layer fields needed by the four-layer renderer

#### Scenario: Removed core legacy presets are rejected
- **WHEN** code requests `shot.legacy`, `scene.legacy`, `gallery.legacy`, or `media.legacy`
- **THEN** creation rejects the preset instead of creating a legacy core node

### Requirement: Canvas data supports subsystem metadata without kind locking
The system SHALL allow `.nkc` Canvas data to store optional subsystem metadata sections without introducing a file-level Canvas kind discriminator. Subsystem metadata MUST be additive and MUST NOT prevent different subsystem node types from coexisting in the same Canvas.

#### Scenario: Mixed Canvas stores multiple metadata sections
- **WHEN** a Canvas contains narrative and behavior nodes
- **THEN** the persisted Canvas may contain both `narrative` and `behavior` metadata sections without a `kind` field

#### Scenario: Basic Canvas omits subsystem metadata
- **WHEN** a Canvas contains only basic nodes and no active subsystem state
- **THEN** the persisted Canvas may omit subsystem metadata sections

### Requirement: Canvas schema supports projected graph marker
The system SHALL allow Canvas data to mark a file as projected with `projected: true`. The marker MUST identify projection/cache behavior and MUST NOT act as a node-type or capability lock.

#### Scenario: Projected marker does not restrict node types
- **WHEN** a projected Canvas contains entity or memory nodes plus basic annotation nodes
- **THEN** validation accepts the mix when the nodes are structurally valid

### Requirement: NKC v2.1 extends v2.0 without destructive migration
The system SHALL introduce NKC v2.1 as an optional extension over v2.0. Migration from v1.0 or v2.0 to v2.1 MUST preserve unknown fields, existing node data, absolute positions, top-level connections, content trees, and container relationships.

#### Scenario: v2.0 Canvas migrates without structural changes
- **WHEN** a v2.0 Canvas is opened by the v2.1 loader
- **THEN** the loader preserves nodes, connections, viewport, content, organization, and relationship fields while normalizing the version through the NKC migrator

#### Scenario: Unknown optional fields are preserved
- **WHEN** a Canvas file contains optional fields not used by the current renderer
- **THEN** load/save behavior preserves those fields unless an explicit migrator removes them

### Requirement: Registered node and connection types extend Canvas validation
The system SHALL validate Canvas node and connection types against core built-in types plus registered subsystem types. Built-in subsystem types MUST be declared through shared contracts before their Webview renderers are used.

#### Scenario: Registered narrative node validates
- **WHEN** a Canvas contains a structurally valid `choice` node and the narrative subsystem type is registered
- **THEN** validation accepts the node type

#### Scenario: Registered memory connection validates
- **WHEN** a Canvas contains an `association` connection and the memory subsystem connection type is registered
- **THEN** validation accepts the connection type and applies registered rule descriptors

### Requirement: Unknown complete nodes produce warnings in normal load mode
The system SHALL report complete unknown node types as warnings in normal load mode and as errors in strict validation mode. Structurally incomplete nodes MUST remain errors in all modes.

#### Scenario: Normal load reports unknown node warning
- **WHEN** a Canvas file contains a structurally complete unknown node type
- **THEN** the validator reports a warning and allows the Webview fallback renderer to preserve the node

#### Scenario: Strict validation rejects unknown node
- **WHEN** strict validation is requested for a Canvas with an unknown node type
- **THEN** validation reports the unknown node as an error
