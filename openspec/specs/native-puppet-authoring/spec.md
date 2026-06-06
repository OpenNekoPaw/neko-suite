# native-puppet-authoring Specification

## Purpose
Define native `.nkp` puppet authoring contracts for bones, BlendShapes, drivers, deformation, conversion, editor commands, and animation.
## Requirements
### Requirement: Native Puppet Project Contract
The system SHALL define `.nkp` v2 as the native 2D puppet project contract with explicit layers, skeleton, skin weights, BlendShapes, expressions, ControlDrivers, animations, auto-rig metadata, and original import source metadata.

#### Scenario: Native puppet loads as authoring truth
- **WHEN** a `.nkp` file declares `puppet.format` as `native` and `puppet.animationModel` as `bone-blendshape`
- **THEN** loaders treat the native skeleton, BlendShape, driver, animation, and layer fields as the authoring truth rather than a referenced MOC3 runtime model

#### Scenario: Import source remains metadata
- **WHEN** a native puppet was generated from PSD, PNG, or Live2D input
- **THEN** the `.nkp` stores original source kind, relative path or approved variable path, and content hash as metadata without treating the source as the internal source of truth

#### Scenario: Older puppet project migrates
- **WHEN** a loader opens a supported legacy `.nkp` project without native fields
- **THEN** it routes the project through the compatibility loader or migration function and does not silently reinterpret MOC3 parameters as native skeleton data

### Requirement: Bone2D Skeleton Contract
The system SHALL represent native 2D structure through stable `Bone2D`, `Skeleton2D`, skin weight, IK, path constraint, and spring bone data.

#### Scenario: Bone references are stable
- **WHEN** a native puppet stores skin weights, constraints, animation tracks, or ControlDriver targets
- **THEN** those references use stable bone identifiers or names validated against the skeleton rather than transient ECS entity indexes

#### Scenario: Skin weights are validated
- **WHEN** a native puppet is loaded
- **THEN** each mesh vertex has no more than four joint bindings, normalized weights within tolerance, and joint indices that resolve to the skeleton

#### Scenario: IK and spring constraints instantiate
- **WHEN** a native puppet declares IK or spring bone constraints
- **THEN** runtime-puppet instantiates deterministic constraint components that can be evaluated without renderer dependencies

### Requirement: BlendShape And Expression Contract
The system SHALL represent facial and organic deformation as named BlendShape deltas and expression presets.

#### Scenario: BlendShape delta count matches mesh
- **WHEN** a mesh declares a BlendShape definition
- **THEN** the BlendShape delta vector count matches the mesh vertex count or loading fails with a validation diagnostic

#### Scenario: Missing standard BlendShape is ignored
- **WHEN** tracking or Agent input sets a standard ARKit/VRM BlendShape that the puppet does not implement
- **THEN** runtime evaluation treats the missing shape as zero weight and does not panic

#### Scenario: Expression preset resolves to weights
- **WHEN** a user or Agent applies an expression preset
- **THEN** the system resolves the preset into one or more BlendShape weights and optional driver inputs using the native project data

### Requirement: ControlDriver Evaluation
The system SHALL evaluate ControlDrivers as explicit mappings from named sources to bone transforms or BlendShape weights.

#### Scenario: Driver updates bone and BlendShape
- **WHEN** source `jawOpen` is evaluated with a non-zero value
- **THEN** configured drivers can update both a jaw bone transform and one or more mouth BlendShape weights in the same deterministic evaluation pass

#### Scenario: Target conflicts are deterministic
- **WHEN** multiple drivers write to the same target
- **THEN** the system applies declared blend mode and priority ordering and produces the same result for the same input values

#### Scenario: Driver cycle is rejected
- **WHEN** drivers form a dependency cycle such as a BlendShape weight driving itself through another driver
- **THEN** loading or validation rejects the graph with a diagnostic before runtime evaluation

### Requirement: Native Puppet Vertex Pipeline
The system SHALL evaluate native puppet vertices in the order `ControlDriver -> pre-skin BlendShape -> Skinning`, with optional post-skin corrective BlendShapes.

#### Scenario: Expression follows head bone
- **WHEN** a smile BlendShape is active and the head bone rotates
- **THEN** the final rendered smile follows the head transform because the BlendShape was applied in bind pose before skinning

#### Scenario: Post-skin corrective is explicit
- **WHEN** a BlendShape is marked as post-skin corrective
- **THEN** the system applies it after skinning and does not treat unmarked BlendShapes as post-skin corrections

### Requirement: Live2D To Native Conversion
The system SHALL convert Live2D/MOC3 bundles one-way into native puppet data while preserving source metadata and legacy fallback references.

#### Scenario: Rotation deformer becomes bone
- **WHEN** a MOC3 RotationDeformer is converted
- **THEN** the converter creates a Bone2D transform range and hierarchy relationship derived from the deformer pivot, parent, and angle semantics

#### Scenario: Warp and keyforms become BlendShapes
- **WHEN** a MOC3 WarpDeformer or KeyForm parameter is converted
- **THEN** the converter samples the deformed mesh into one or more BlendShape delta sets tied to stable mesh identifiers

#### Scenario: Motion and expression become native tracks
- **WHEN** MOC3 motion or expression JSON is converted
- **THEN** the converter emits native bone tracks, BlendShape tracks, expression presets, or diagnostics for unsupported mappings

#### Scenario: Clipping fallback is explicit
- **WHEN** dynamic draw order, mask, or clipping behavior cannot be represented faithfully in native data
- **THEN** the converter records a partial-conversion diagnostic and retains a legacy fallback reference rather than silently dropping the behavior

### Requirement: Conversion Golden Render Gate
The system SHALL gate MOC3 conversion acceptance on golden render comparisons between original MOC3 playback and converted native playback.

#### Scenario: Golden render passes
- **WHEN** a converted public fixture is rendered frame-by-frame against its original MOC3 playback
- **THEN** the comparison meets the configured SSIM threshold and records the fixture result as passing

#### Scenario: Golden render fails
- **WHEN** a converted fixture falls below the configured visual threshold
- **THEN** the test output includes failing frame identifiers and diff artifacts sufficient for manual diagnosis

### Requirement: Automatic Puppet Creation
The system SHALL provide an automatic creation flow that accepts PSD, PNG, and Live2D sources and produces a previewable native puppet draft.

#### Scenario: PSD creates draft puppet
- **WHEN** a user imports a PSD with character layers
- **THEN** the system creates a draft native puppet with layer meshes, semantic tags, skeleton, skin weights, initial BlendShapes or templates, ControlDrivers, and auto-rig metadata

#### Scenario: PNG creates segmented draft
- **WHEN** a user imports a single PNG character image
- **THEN** the system creates a draft native puppet using segmentation, landmark, or template fallback data and marks confidence in auto-rig metadata

#### Scenario: Live2D creates native draft
- **WHEN** a user imports a Live2D ZIP into the native creation flow
- **THEN** the system converts MOC3 structures into native skeleton, BlendShape, driver, animation, and source metadata fields

#### Scenario: User adjustments are recorded
- **WHEN** a user manually adjusts generated bones, weights, BlendShapes, or driver curves
- **THEN** the system records the adjusted element identifiers in auto-rig metadata for future regeneration and review

### Requirement: Native Puppet Editor Commands
The system SHALL expose native puppet editing as commandized operations over bones, weights, BlendShapes, drivers, expressions, and animations.

#### Scenario: Bone drag is commandized
- **WHEN** a user drags a native puppet bone in the editor
- **THEN** the editor emits a command with target bone identity, base revision, correlation id, and delta rather than mutating only local Webview state

#### Scenario: BlendShape edit is commandized
- **WHEN** a user edits a BlendShape weight or vertex delta
- **THEN** the editor sends a native puppet command and updates prediction only until authoritative state or ack arrives

### Requirement: Native Puppet Animation Contract
The system SHALL represent native puppet animation clips as bone transform tracks and BlendShape weight tracks with deterministic keyframe interpolation.

#### Scenario: Clip drives bone and BlendShape
- **WHEN** a native animation clip plays
- **THEN** it can update bone tracks and BlendShape tracks in the same timeline and produce deterministic runtime state for a given time

#### Scenario: Animation round-trip preserves keys
- **WHEN** a native animation clip is serialized and deserialized
- **THEN** keyframe times, values, easing, track identities, and duration remain equivalent
