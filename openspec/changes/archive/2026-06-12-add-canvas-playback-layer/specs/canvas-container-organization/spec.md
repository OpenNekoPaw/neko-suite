## ADDED Requirements

### Requirement: Playback consumes container order without changing containment
The system SHALL allow playback projection to consume container child order, child placement order, and layout intent as route hints. Playback MUST NOT infer containment from visual position or connections, and MUST NOT mutate `parentId` or `container.childIds` while constructing a playback plan.

#### Scenario: Playback reads child order
- **WHEN** playback starts from a Scene or Group container
- **THEN** it reads direct children from canonical container membership and orders them through playback ordering rules

#### Scenario: Playback does not adopt nearby nodes
- **WHEN** an unparented node visually overlaps a container during playback projection
- **THEN** the node is not treated as a child unless container membership explicitly references it

#### Scenario: Playback plan construction is side-effect free
- **WHEN** a playback adapter projects a container subtree
- **THEN** the Canvas node list, container child IDs, parent IDs, and connections remain unchanged

### Requirement: Container expansion strategy is playback metadata
The system SHALL represent container playback expansion as playback metadata or adapter default behavior, not as a container policy mutation. Supported expansion strategies MUST include `self`, `children`, and `recursive`.

#### Scenario: Scene defaults to children expansion
- **WHEN** storyboard playback starts from a Scene without an explicit expansion override
- **THEN** the adapter expands the Scene to its ordered child Shot units

#### Scenario: Group can play as self
- **WHEN** generic playback starts from a Group with expansion `self`
- **THEN** playback creates a unit for the Group itself instead of expanding direct children

#### Scenario: Recursive expansion respects cycle validation
- **WHEN** playback recursively expands nested containers
- **THEN** projection relies on valid container organization and reports diagnostics rather than traversing an invalid cycle
