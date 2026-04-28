## ADDED Requirements

### Requirement: CharacterBakingSystem is the export authority for characters
The system SHALL use `CharacterBakingSystem` to produce exportable character geometry and metadata. The baking system MUST read `.nkc`, `.nkcdata`, AssetDatabase descriptors, and Engine pose state, and MUST NOT read Webview prediction state, R3F scene objects, Render World, or GPU cache.

#### Scenario: Export reads authoring data
- **WHEN** a user exports a customized character
- **THEN** the exporter reads the character description, override data, morph weights, skin weights, and material descriptors through the baking system

#### Scenario: Prediction is excluded from export
- **WHEN** a brush or morph prediction is visible but not acknowledged by Engine
- **THEN** export excludes that prediction and uses only committed authoring state

### Requirement: Morph and skin data are baked deterministically
The system SHALL bake morph weights, sparse deltas, blend shapes, skin weights, and current skeleton pose deterministically for GLB and VRM export. Bake output MUST be reproducible for the same character revision, topology version, and export options.

#### Scenario: Morph customization exports
- **WHEN** a character has acknowledged morph edits
- **THEN** exported GLB or VRM reflects the same shape visible in the Engine video frame for the matching revision

#### Scenario: Current pose exports
- **WHEN** export options request current pose
- **THEN** the baking system applies the Engine-authored skeleton pose instead of Webview R3F animation state

### Requirement: Material layer and override edits export consistently
The system SHALL bake character material layer and override edits from `.nkc` and AssetDatabase material descriptors. Exported materials MUST preserve base color, metallic, roughness, normal, AO, emissive, texture references, and supported extension metadata where available.

#### Scenario: Material override exports
- **WHEN** a user changes a character clothing material through an acknowledged command
- **THEN** exported GLB or VRM contains the updated material values and texture references

### Requirement: Topology migration state controls export eligibility
The system SHALL check topology migration and invalidation state before character export. Export MUST either use migrated data or fail with explicit diagnostics when required morph, skin, or UV data is invalid.

#### Scenario: Invalid skin weights block export
- **WHEN** a topology change invalidates skin weights and no migration has repaired them
- **THEN** character export fails with a diagnostic that identifies the invalid data and required repair action

#### Scenario: Migrated topology exports
- **WHEN** a topology change has completed migration for morph, skin, and UV data
- **THEN** export uses the new topology version and records it in export metadata where supported

### Requirement: FBX export follows the same baked character path
The system SHALL route FBX character export through the same baked character representation used by GLB and VRM. FBX export MUST NOT introduce a separate Webview or GPU-cache-derived authoring path.

#### Scenario: FBX export uses baked representation
- **WHEN** the user exports a character as FBX
- **THEN** the exporter consumes the baked character mesh, skeleton, animation, and materials produced by `CharacterBakingSystem`

### Requirement: Export consistency is validated against Engine viewport state
The system SHALL provide tests or validation fixtures that compare exported character data against the Engine-rendered authoring state for the same scene revision and topology version.

#### Scenario: Export matches acknowledged viewport state
- **WHEN** a character morph, material, and pose edit have been acknowledged and rendered by Engine
- **THEN** export validation confirms the exported asset corresponds to that acknowledged state rather than stale Webview state
