## ADDED Requirements

### Requirement: Character Region Descriptors Support Semantic Picking
Editable `.nkc` characters SHALL be able to declare character region descriptors for semantic picking. Region descriptors MUST map stable region ids to the relevant morph controls, material slots, bones, mesh primitives, or masks needed for Engine picking and Webview inspector routing.

#### Scenario: Character region descriptor loads
- **WHEN** Engine loads a `.nkc` character asset with region descriptors
- **THEN** the character authoring truth includes stable region ids and their bindings to morph controls, materials, bones, or mesh data

#### Scenario: Face region opens region controls
- **WHEN** the user clicks a face region whose descriptor maps to morph controls
- **THEN** Engine returns a `characterRegion` or `morphControl` selection candidate
- **THEN** Webview opens region-aware face controls for the selected character

### Requirement: Semantic Regions Do Not Apply To Ordinary Meshes By Default
The system SHALL NOT require or fabricate `.nkc` semantic character regions for ordinary GLB, GLTF, or VRM mesh assets. When semantic region descriptors are missing, selection MUST degrade to node, materialSlot, submesh, primitive, or bone targets that the asset can actually provide.

#### Scenario: Ordinary GLB lacks regions
- **WHEN** the user picks an ordinary GLB mesh without `.nkc` region descriptors
- **THEN** Engine does not return fabricated `characterRegion` candidates
- **THEN** Webview uses available node, materialSlot, submesh, primitive, or bone targets instead

#### Scenario: VRM degrades to available targets
- **WHEN** a VRM asset has humanoid bones and material slots but no Neko character region descriptor
- **THEN** Engine may return bone or materialSlot candidates
- **THEN** Webview does not claim MetaHuman-style face region editing is available

### Requirement: Region Descriptor Schema Is Versioned And Migratable
Character region descriptors SHALL be versioned as part of `.nkc` character authoring metadata. Loader and saver code MUST reject or migrate incompatible region schemas explicitly rather than silently applying unknown region mappings.

#### Scenario: Older region schema migrates
- **WHEN** Engine opens a `.nkc` file with an older supported region descriptor schema
- **THEN** Engine applies the registered migration before enabling semantic region editing

#### Scenario: Future region schema is blocked
- **WHEN** Engine opens a `.nkc` file with a newer unsupported region descriptor schema
- **THEN** Engine disables semantic region editing for that character and reports a diagnostic instead of applying unknown mappings

### Requirement: Character Region Selection Remains Non-destructive
Selecting a character region SHALL change editor selection state only. It MUST NOT modify morph weights, material parameters, bones, topology, or exported character data until the user performs an explicit acknowledged authoring command.

#### Scenario: Region selection does not edit morph
- **WHEN** the user selects a nose, cheek, eye, or mouth region
- **THEN** Engine and Webview update selection/inspector state only
- **THEN** no morph weight changes until a morph, sculpt, expression, or region edit command is sent and acknowledged
