## MODIFIED Requirements

### Requirement: Canvas containers use generic container capability
The system SHALL represent Canvas organization through a generic container capability with child IDs, policy name, layout state, and accepted child constraints. Scene, Group, and Artboard MUST be built-in policies over this capability rather than separate containment models. Migrated Webview UI paths for Scene and Group MUST treat the generic container capability as canonical.

#### Scenario: Scene uses container capability
- **WHEN** a Scene node is created through the new container path
- **THEN** it stores child membership through the generic container capability and policy `scene`

#### Scenario: Group uses same membership contract
- **WHEN** nodes are grouped
- **THEN** the resulting Group node uses the same container capability shape with policy `group`

#### Scenario: Migrated Scene UI reads canonical child order
- **WHEN** a migrated Scene renders its child summaries, auto-layouts children, or reorders children
- **THEN** it uses the generic container child order and helper APIs rather than direct `data.shotIds` access

#### Scenario: Scene membership has no legacy mirrors
- **WHEN** a container action changes Scene membership
- **THEN** the implementation updates canonical container child IDs and child parent IDs without writing `data.shotIds` or `data.sceneGroupId`

### Requirement: Container actions replace ad hoc Scene and Group operations
The system SHALL provide generic add, remove, move, reorder, and composite creation actions for containers. Existing Scene and Group actions MUST delegate to these generic actions during migration. Migrated Webview rendering, minimap visibility, viewport filtering, clipboard behavior, and property-panel summaries MUST use these organization contracts instead of duplicating Scene-specific containment rules.

#### Scenario: Assign shots delegates to container action
- **WHEN** existing UI calls assign selected shots to Scene
- **THEN** the implementation delegates to the generic add-child container action and writes canonical membership

#### Scenario: Composite creation is atomic
- **WHEN** a container and child node set are created as one composite operation
- **THEN** all nodes, membership references, layout positions, and operation audit records are committed as one logical mutation or not committed

#### Scenario: Canvas node layer hides contained children through membership helpers
- **WHEN** the top-level canvas decides whether a child node should be drawn independently or summarized inside a migrated container
- **THEN** it determines that behavior from organization membership helpers and policy metadata rather than checking Shot-specific legacy fields

#### Scenario: Clipboard remaps migrated containers
- **WHEN** a migrated container subtree is copied and pasted
- **THEN** the pasted nodes receive remapped canonical child IDs and parent IDs consistently
