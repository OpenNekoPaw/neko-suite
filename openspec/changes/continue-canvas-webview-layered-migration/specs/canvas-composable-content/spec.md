## MODIFIED Requirements

### Requirement: Presets assemble node capabilities
The system SHALL define presets that assemble content, data defaults, ports, preview capabilities, container capability, and behavior metadata for new nodes. Presets MUST be registered by name and MUST NOT require adding a monolithic React node component for every new asset format. Migrated core presets MUST provide production-ready content trees for new Shot, Scene, Gallery, and Media nodes, and removed core legacy presets MUST NOT remain registered.

#### Scenario: Shot preset creates content and data defaults
- **WHEN** the Shot preset is used to create a node
- **THEN** the created node has Shot data defaults and composable content for status, controls, preview, metadata, and selected-only details

#### Scenario: New asset preset reuses existing renderers
- **WHEN** a panoramic image preset is registered
- **THEN** it composes asset preview and delegate capabilities without adding a new top-level node renderer component

#### Scenario: Scene preset creates container content
- **WHEN** the migrated Scene preset is used to create a node
- **THEN** the created node has scene metadata controls, a child-node slot for ordered children, Scene container capability, and layout metadata

#### Scenario: Gallery preset creates collection content
- **WHEN** the migrated Gallery preset is used to create a node
- **THEN** the created node renders Gallery cells as a collection bound to `/cells` and keeps generation candidate state in `node.data`

#### Scenario: Media preset creates asset preview content
- **WHEN** the migrated Media preset is used to create a node
- **THEN** the created node renders asset information and lightweight preview through composable blocks bound to existing media data fields

### Requirement: Property panels can derive editors from composable content
The system SHALL allow property panels to enumerate content blocks, bindings, collections, and preview capabilities to generate appropriate editors for composable nodes. Non-core nodes without content MAY continue using existing per-type property panel branches. Migrated core presets MUST expose enough binding metadata for property panels to edit their visible fields without duplicating type-specific branches.

#### Scenario: Bound input appears in property panel
- **WHEN** a composable node has an InputBlock bound to `/duration`
- **THEN** the property panel can render a duration editor using the block binding metadata

#### Scenario: Non-core branch remains available
- **WHEN** a non-core node lacks composable content
- **THEN** the property panel uses the existing type-specific editing branch

#### Scenario: Migrated Shot panel is generated from bindings
- **WHEN** a migrated Shot node is selected
- **THEN** the property panel renders editors for visual description, duration, camera metadata, characters, dialogue, voice-over, and sound cue from content binding metadata

#### Scenario: Migrated Gallery panel edits collection data
- **WHEN** a migrated Gallery node is selected
- **THEN** the property panel can edit Gallery-level fields and selected cell fields through bindings into `/cells` without replacing unrelated cell data

#### Scenario: Specialized actions remain explicit
- **WHEN** a composable node needs a non-field action such as batch generation or opening a delegated preview
- **THEN** the property panel invokes registered action metadata rather than embedding new node-type-specific data ownership
