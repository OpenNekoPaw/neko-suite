## ADDED Requirements

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
