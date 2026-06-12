## ADDED Requirements

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
