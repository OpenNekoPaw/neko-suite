# canvas-connection-projection Specification

## Purpose
TBD - created by archiving change add-canvas-connection-projection. Update Purpose after archive.
## Requirements
### Requirement: Canvas renders connections through a projected view
The system SHALL derive a renderable connection view from canonical Canvas nodes, container membership, expanded container state, and top-level `CanvasData.connections` before drawing connection lines.

#### Scenario: Top-level endpoints render directly
- **WHEN** a connection source and target are both visible top-level nodes
- **THEN** the projected view includes a direct connection that preserves the real connection ID and endpoint node IDs

#### Scenario: Hidden child endpoint renders as aggregate
- **WHEN** a connection endpoint belongs to a container-managed child that is not drawn as an independent top-level node
- **THEN** the projected view represents that endpoint through the visible containing container and preserves provenance to the underlying real connection ID

#### Scenario: Missing endpoint is diagnostic
- **WHEN** a connection references a source or target node that does not exist
- **THEN** the projected view excludes the connection from renderable lines and emits a diagnostic for the dangling endpoint

### Requirement: Projection distinguishes direct, aggregate, internal, and hidden states
The system SHALL classify every valid connection into direct, aggregate, internal, or hidden projection state for the active Canvas surface.

#### Scenario: Child to external aggregates through container
- **WHEN** a hidden child node connects to a visible node outside its container
- **THEN** the projected view includes an aggregate line between the child container and the external node

#### Scenario: Child to child in different containers aggregates container to container
- **WHEN** hidden child nodes in different visible containers are connected
- **THEN** the projected view includes an aggregate line between the two containers

#### Scenario: Same container child edge becomes internal summary
- **WHEN** both endpoints are hidden children of the same container in top-level mode
- **THEN** the projected view omits the top-level line and records the connection in that container's internal summary

#### Scenario: Expanded container can expose internal edges
- **WHEN** a container is opened in a local edit or expanded connection mode
- **THEN** the projected view MAY expose the container's internal child-child connections as direct local edges while keeping the persisted real connection IDs unchanged

### Requirement: Aggregate connection views preserve provenance and counts
The system SHALL expose aggregate connection records with stable display IDs, endpoint container or node IDs, underlying real connection IDs, count, semantic summary, and diagnostics.

#### Scenario: Multiple child edges collapse into one aggregate
- **WHEN** several hidden child connections project to the same visible aggregate endpoints
- **THEN** the projected view groups them into one aggregate connection with a count and all underlying connection IDs

#### Scenario: Selecting aggregate can target underlying edges
- **WHEN** a user selects an aggregate connection
- **THEN** the UI has enough provenance to inspect, select, or drill into the underlying real connections without guessing from geometry

### Requirement: Projection uses visible render bounds for summarized containers
The system SHALL attach aggregate connection geometry to the container surface that is actually rendered in the current view, falling back to stored node bounds only when render bounds are unavailable.

#### Scenario: Collapsed container uses collapsed bounds
- **WHEN** a container is collapsed and its rendered card height differs from stored node size
- **THEN** aggregate connection endpoints attach to the collapsed rendered bounds rather than to invisible full-size content

#### Scenario: Missing render bounds fall back safely
- **WHEN** no renderer-provided bounds are available for a visible node
- **THEN** connection geometry uses the node's stored position and size

### Requirement: Connection order synchronization is explicit
The system SHALL separate organization order from relationship order and SHALL only mutate real connection order or topology when an explicit connection order synchronization policy requires it.

#### Scenario: Reorder without sync preserves real connections
- **WHEN** a container with `none` connection order sync mode reorders its children
- **THEN** the container child order changes and real connection endpoints, connection IDs, and connection priority metadata remain unchanged

#### Scenario: Derived sequence renders from child order
- **WHEN** a container with `derive-from-container` sync mode reorders its children
- **THEN** the projected view MAY render derived sequence hints from container child order without writing new real sequence edges

#### Scenario: Sequence sync updates sequence edges
- **WHEN** an explicit sequence editor uses `sync-sequence-edges` mode and commits a reorder
- **THEN** the system reconciles the concrete sequence or transition edges according to the new order through a typed store action

#### Scenario: Branch priority sync updates priority only
- **WHEN** a narrative or flow container uses `sync-branch-priority` mode and reorders branches
- **THEN** the system updates connection priority/order metadata without changing source or target node IDs

### Requirement: Projection reports policy-aware cycle diagnostics
The system SHALL validate container organization cycles separately from connection cycles and SHALL apply connection cycle diagnostics according to connection semantic kind.

#### Scenario: Organization cycle is rejected
- **WHEN** a user or Agent operation would make a container its own descendant
- **THEN** the operation is rejected before persistence

#### Scenario: Derived or strict sequence cycle is invalid
- **WHEN** a derived-from, strict sequence, or strict transition relationship would create an unsupported cycle
- **THEN** validation emits an error diagnostic and does not auto-create the cyclic relationship

#### Scenario: Explicit loop connection is allowed
- **WHEN** a narrative choice, repeat, loop, reference, or association connection intentionally forms a cycle allowed by its semantic kind
- **THEN** validation preserves the relationship and MAY emit an informational complexity diagnostic

### Requirement: Projection is deterministic and testable
The system SHALL implement projection as a pure deterministic function over serializable Canvas inputs without reading DOM state, Webview APIs, or extension-host services directly.

#### Scenario: Same input returns same projection
- **WHEN** projection is called repeatedly with the same nodes, connections, visibility, expansion, and render-bound inputs
- **THEN** it returns equivalent direct, aggregate, internal, hidden, and diagnostic outputs

#### Scenario: Renderer consumes projection output
- **WHEN** the Canvas connection renderer draws lines
- **THEN** it consumes projected connection records rather than independently reimplementing container membership rules

