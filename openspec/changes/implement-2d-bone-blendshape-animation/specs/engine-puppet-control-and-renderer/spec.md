## ADDED Requirements

### Requirement: Native Puppet Runtime Components
The puppet runtime SHALL provide ECS components and systems for native `Bone2D`, `Skeleton2D`, `SkinWeights2D`, `BlendShapeSet`, `BlendShapeWeights`, `ExpressionPresets`, `ControlDriverSet`, IK constraints, and spring bones.

#### Scenario: Native components instantiate from project data
- **WHEN** a `.nkp` v2 native puppet is loaded
- **THEN** runtime-puppet instantiates the corresponding ECS components without requiring MOC3 parameter bindings

#### Scenario: Runtime components do not depend on GPU
- **WHEN** runtime-puppet evaluates native puppet systems in unit tests
- **THEN** the systems run without importing wgpu or renderer crates

### Requirement: CPU Native Deformation Path
The puppet runtime SHALL compute native puppet deformed vertices on CPU as `ControlDriver -> BlendShape -> Skinning` and expose them through the existing deformed-vertices renderer input path.

#### Scenario: CPU path renders native puppet
- **WHEN** a native puppet has mesh vertices, BlendShape weights, and bone transforms
- **THEN** runtime-puppet computes `DeformedVertices` that the existing SpriteBatch renderer can consume

#### Scenario: CPU math is unit tested
- **WHEN** a synthetic mesh fixture is evaluated by the CPU native path
- **THEN** computed vertices match expected BlendShape and skinning results within configured tolerance

### Requirement: GPU Native Deformation Path
The puppet renderer SHALL support an optional GPU BlendShape+Skinning path fed by render-extract data while preserving CPU fallback.

#### Scenario: GPU path matches CPU fixture
- **WHEN** a synthetic native puppet mesh is rendered through the GPU path
- **THEN** its transformed vertices match the CPU reference within configured tolerance

#### Scenario: CPU fallback remains available
- **WHEN** GPU native deformation is unavailable or disabled
- **THEN** puppet rendering continues through CPU-computed deformed vertices

### Requirement: Native Puppet Commands
The puppet control service SHALL accept native puppet commands for bones, BlendShapes, expressions, ControlDrivers, and animations through sequence- and revision-aware envelopes.

#### Scenario: Set BlendShape command applies
- **WHEN** a command sets a valid native BlendShape weight with current base revision
- **THEN** the puppet service applies the weight and returns an acknowledgement with the new revision

#### Scenario: Stale native command is rejected
- **WHEN** a native puppet command references a stale base revision that conflicts with newer edits
- **THEN** the service rejects the command and leaves authoritative runtime state unchanged

### Requirement: MOC3 Conversion Runtime Support
The puppet runtime SHALL expose conversion APIs that reuse MOC3 parsed data to produce native puppet project data.

#### Scenario: Conversion output is loadable
- **WHEN** a MOC3 bundle is converted to native puppet data
- **THEN** the resulting `.nkp` v2 data can be loaded by native runtime components without using MOC3 parameter evaluation as the primary runtime path

#### Scenario: Legacy fallback remains available
- **WHEN** conversion diagnostics indicate unsupported MOC3 behavior
- **THEN** the native project can retain source metadata or fallback references that allow legacy read-only playback during migration
