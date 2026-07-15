## ADDED Requirements

### Requirement: Manual Group renders actual children spatially

Canvas SHALL render a `group` container with manual layout as a semi-transparent spatial region behind its actual child nodes. It MUST NOT replace those children with a summary list on the normal expanded path.

#### Scenario: Creator opens an expanded Group

- **WHEN** a manual Group contains image, audio, video, document, or Markdown nodes
- **THEN** Canvas MUST render the real nodes at their Canvas positions inside a named semi-transparent Group region

#### Scenario: Managed professional container is rendered

- **WHEN** a child belongs to a Scene, Gallery, Table, or another managed non-spatial policy
- **THEN** Canvas MUST continue to use the owning managed-container presentation rather than treating every `parentId` as a spatial Group

### Requirement: Spatial Group uses one absolute coordinate model

Canvas SHALL keep every persisted child `position` as an absolute Canvas coordinate and derive relative Group placement from the child and parent positions. Moving a Group MUST translate its descendant subtree by the same delta, while moving one child MUST leave its siblings unchanged.

#### Scenario: Creator moves a Group

- **WHEN** the creator drags the Group label, boundary, or eligible empty background
- **THEN** the Group and every descendant MUST move by the same Canvas delta and preserve their relative arrangement

#### Scenario: Creator moves one child

- **WHEN** the creator drags a child within its Group
- **THEN** only that child's absolute position MUST change and the Group MUST preserve the creator's new placement

### Requirement: Spatial membership changes deterministically on drop

Canvas SHALL add or remove manual Group membership only when a child drag completes. Eligible overlapping Groups MUST resolve to the deepest accepted spatial container with deterministic stacking and stable-identity tie breaking, and self-parenting or cycles MUST fail visibly.

#### Scenario: Creator drops a node into a Group

- **WHEN** an accepted node is dropped in a Group content region
- **THEN** Canvas MUST set canonical parent/child membership without changing the node to a Group-local coordinate

#### Scenario: Creator drops a child outside its Group

- **WHEN** a grouped child is released outside every accepted Group content region
- **THEN** Canvas MUST release that child while preserving its current absolute position

#### Scenario: Nested membership would create a cycle

- **WHEN** a Group is dropped into one of its descendants
- **THEN** Canvas MUST reject the mutation with a visible diagnostic and MUST NOT modify the graph

### Requirement: Sorting is explicit and manual placement remains authoritative

Spatial Group SHALL support explicit Sort/Auto-arrange operations by supported stable criteria and SHALL record the resulting child order and unlocked child positions through one undoable Canvas mutation. Normal child movement MUST NOT trigger automatic reflow or overwrite creator placement.

#### Scenario: Creator sorts a generated Group

- **WHEN** the creator explicitly sorts Group children by name, type, creation time, or stable child order
- **THEN** Canvas MUST arrange the eligible unlocked children and record one undoable layout change

#### Scenario: Creator manually adjusts an arranged child

- **WHEN** the creator moves a child after automatic arrangement
- **THEN** Canvas MUST retain that manual position until another explicit layout action

### Requirement: Group bounds protect visible children

Manual Group SHALL expand outward when a dropped child exceeds its content bounds, SHALL NOT automatically shrink after inward movement, and SHALL provide an explicit Fit to content action. Manual resizing MUST be clamped so descendant content is not accidentally clipped.

#### Scenario: Child is placed beyond the current boundary

- **WHEN** a creator drops a child partly outside an expanded manual Group
- **THEN** the Group MUST expand to contain the child plus required padding without moving unrelated children

#### Scenario: Creator fits the Group to content

- **WHEN** the creator invokes Fit to content
- **THEN** Canvas MUST resize the Group to the descendant bounds plus title and padding in one undoable mutation

### Requirement: Collapse preserves spatial layout and connection meaning

Collapsing a spatial Group SHALL hide descendant presentation without changing descendant coordinates or membership. Expanding it MUST restore the exact layout, and connections involving hidden descendants MUST project through the Group boundary rather than becoming dangling or silently disappearing.

#### Scenario: Creator collapses and expands a Group

- **WHEN** the creator collapses and later expands a spatial Group
- **THEN** every child MUST return to its previous position and selection-independent ordering
