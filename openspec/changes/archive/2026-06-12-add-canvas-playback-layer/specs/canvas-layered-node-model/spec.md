## ADDED Requirements

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
