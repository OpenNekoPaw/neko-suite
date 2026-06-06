## ADDED Requirements

### Requirement: Agent target insertion uses generic container actions
The system SHALL apply Agent-targeted child insertion, append, move, and reorder requests through generic Canvas container actions. Scene, Group, Artboard, Gallery, and future containers MUST NOT receive separate Agent-only membership mutation paths.

#### Scenario: Insert Agent text into Scene container
- **WHEN** Agent sends text content to a Scene container with `create-child` mode
- **THEN** Canvas creates a valid child node and adds it through the generic container add-child action

#### Scenario: Append storyboard shots to existing Scene
- **WHEN** Agent sends structured shot content to an existing Scene container
- **THEN** Canvas validates the Scene policy, creates Shot children, and appends them through canonical container child order

### Requirement: Container target validation prevents invalid membership
The system SHALL validate Agent-provided container targets against container policy, child type constraints, cycle rules, and existing parent membership before mutating state. Invalid requests MUST fail atomically.

#### Scenario: Rejected child type leaves state unchanged
- **WHEN** Agent attempts to insert a child node type rejected by the target container policy
- **THEN** Canvas returns a typed validation error and no node or membership mutation is committed

#### Scenario: Moving child between containers clears old parent
- **WHEN** Agent moves an existing node from one container to another through a valid target request
- **THEN** Canvas removes the child from the old container, adds it to the new container, updates the child's parent ID, and emits one logical change event

### Requirement: Container queries expose targetable summaries
The system SHALL expose read-only queries that return container child IDs, accepted child constraints, layout policy, and targetable slots in a compact form suitable for Agent planning.

#### Scenario: Agent queries focused container
- **WHEN** Agent asks for the active Canvas context while focus is inside a container
- **THEN** Canvas returns the focused container ID, child order summary, and accepted child constraints

#### Scenario: Agent chooses target slot
- **WHEN** a container exposes named slots or ordered insertion positions
- **THEN** the query result includes stable slot or position references that Agent may use in a follow-up transfer target
