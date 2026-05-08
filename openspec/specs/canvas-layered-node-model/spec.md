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
The system SHALL make layer interactions use IDs, field bindings, endpoint references, policy names, preview descriptors, and store actions. Layers MUST NOT import or mutate each other's renderer/runtime implementation details.

#### Scenario: Content references a relationship endpoint
- **WHEN** a connection endpoint targets a block or field
- **THEN** the endpoint references `blockId` or `fieldPath` while the content block does not own the connection object

#### Scenario: Content displays organization children through summaries
- **WHEN** a container node displays its children inside node content
- **THEN** it uses child IDs, a child-node slot, and node preview descriptors rather than embedding child node components as owned content

### Requirement: Canvas data validation covers cross-layer invariants
The system SHALL provide validation for layer invariants, including absolute coordinates, single parent membership, bidirectional parent/child consistency, container cycles, dangling child IDs, dangling endpoint references, and invalid block/field bindings.

#### Scenario: Invalid container cycle is rejected
- **WHEN** a store action or migration would create a cycle in container membership
- **THEN** validation rejects the change or reports a typed warning without persisting the cyclic state

#### Scenario: Dangling endpoint is reported
- **WHEN** a connection endpoint references a missing node, port, block, or field
- **THEN** validation reports the dangling reference so the UI can repair, hide, or remove the invalid edge

### Requirement: Canvas schema preserves backward compatibility
The system SHALL introduce new layer fields as optional during migration. Existing Canvas files without `content`, `container`, preview capabilities, or endpoint objects MUST continue to load and render through legacy paths.

#### Scenario: Legacy node renders without content
- **WHEN** a v1 Canvas file contains a Shot node without `content`
- **THEN** the Webview renders it through the legacy Shot renderer and preserves its existing `data` bag

#### Scenario: Unknown future fields are preserved
- **WHEN** a Canvas file contains optional layer fields not used by the current renderer
- **THEN** load/save behavior preserves those fields unless an explicit migrator removes them

