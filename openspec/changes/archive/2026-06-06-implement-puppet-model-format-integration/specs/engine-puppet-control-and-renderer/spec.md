## ADDED Requirements

### Requirement: MOC3 Keyform Source Parsing
The puppet runtime SHALL resolve MOC3 keyform indirection tables used by warp deformers, rotation deformers, and art meshes before evaluating Live2D deformation.

#### Scenario: Art mesh keyform positions use source table
- **WHEN** an art mesh references keyform position sources
- **THEN** the parser reads XY values through the keyform position source table rather than assuming flat contiguous vertex positions

#### Scenario: Warp and rotation keyforms use their specific sources
- **WHEN** warp or rotation deformers reference keyform sources
- **THEN** warp deformers resolve control-point positions through warp position sources and rotation deformers resolve angles through rotation angle sources

### Requirement: MOC3 External Texture Data Path
The engine and puppet editor SHALL provide a runtime data path for texture PNG bytes referenced by Live2D `model3.json`.

#### Scenario: Texture bytes are available for render
- **WHEN** a MOC3 mesh references a texture index from a Live2D bundle
- **THEN** the corresponding texture PNG bytes are decoded or uploaded through a supported renderer data path before the mesh is rendered

#### Scenario: Texture index command is not upload
- **WHEN** a client needs to upload or decode Live2D PNG image bytes
- **THEN** it does not treat the existing `puppets:set_texture` texture-index command as an image upload API

### Requirement: Bundle Auxiliary Data Loading
The puppet runtime SHALL load Live2D bundle auxiliary JSON for expressions, motions, and physics through a supported puppet auxiliary path.

#### Scenario: Load auxiliary JSON from bundle
- **WHEN** a Live2D bundle contains expression, motion, or physics entries
- **THEN** the puppet runtime receives those entries as validated JSON content rather than as unresolved bundle locator strings
