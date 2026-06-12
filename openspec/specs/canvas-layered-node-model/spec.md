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

### Requirement: Relationship rendering consumes projected relationship views
The system SHALL keep relationship data in top-level Canvas connections while renderers consume a projected relationship view whenever organization membership hides, summarizes, or locally expands contained nodes.

#### Scenario: Hidden organization child does not leak raw edge
- **WHEN** a node is hidden from the top-level node layer because it is drawn inside a container
- **THEN** the top-level connection renderer does not draw a raw line to that hidden node and instead uses the projected direct, aggregate, internal, or hidden state

#### Scenario: Relationship source of truth remains top-level
- **WHEN** a connection is aggregated or hidden in the rendered view
- **THEN** the underlying real connection remains stored in top-level `CanvasData.connections` with its original endpoint IDs unless a typed relationship mutation changes it

#### Scenario: Local container view can expose internal relationships
- **WHEN** a container renderer exposes a focused local editing surface for its children
- **THEN** it may render projected internal relationships for those children without moving connection ownership into the container node content

### Requirement: Layer validation distinguishes organization and relationship failures
The system SHALL report organization membership failures separately from relationship endpoint, projection, and connection-order failures.

#### Scenario: Parent child mismatch reports organization diagnostic
- **WHEN** a child parent ID and container child list disagree
- **THEN** validation reports an organization consistency diagnostic

#### Scenario: Dangling connection reports relationship diagnostic
- **WHEN** a connection endpoint references a missing node
- **THEN** validation reports a relationship endpoint diagnostic

#### Scenario: Unsupported connection-order sync reports policy diagnostic
- **WHEN** a container policy requests a connection-order synchronization mode that is unsupported for the involved connection semantic kind
- **THEN** validation reports a policy diagnostic and leaves real connections unchanged

### Requirement: Playback metadata is an extension layer over the layered node model
The system SHALL treat playback metadata as an optional extension layer that references spatial, content, organization, and relationship data through IDs and endpoint contracts. Playback metadata MUST NOT redefine the authority of node position, content ownership, container membership, or top-level connections.

#### Scenario: Playback order does not change canvas coordinates
- **WHEN** a node has playback order metadata
- **THEN** its `position`, `size`, `zIndex`, and parent membership remain unchanged

#### Scenario: Playback role does not replace node type
- **WHEN** a node has playback role `start` or `end`
- **THEN** the node's Canvas node type remains unchanged and adapter-specific node types such as `narrative-start` retain their existing semantics

#### Scenario: Playback references relationship data by ID
- **WHEN** a playback plan includes a transition derived from a Canvas connection
- **THEN** the plan references the source connection ID and does not embed a duplicate authoritative connection object inside the node

### Requirement: Playback projection preserves layered validation invariants
The system SHALL validate playback projections against existing layered node invariants. Projection MUST report diagnostics for dangling source nodes, invalid container references, or dangling connection endpoints instead of repairing the base graph implicitly.

#### Scenario: Missing playback source node is diagnosed
- **WHEN** playback metadata references an entry node ID that is absent from the Canvas node list
- **THEN** projection reports a typed diagnostic and does not create a synthetic base node

#### Scenario: Dangling connection endpoint is not followed
- **WHEN** a playable connection references a missing source or target node
- **THEN** playback projection excludes that transition and reports a diagnostic

