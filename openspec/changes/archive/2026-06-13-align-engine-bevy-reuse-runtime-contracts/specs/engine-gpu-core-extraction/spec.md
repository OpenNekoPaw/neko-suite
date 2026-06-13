## ADDED Requirements

### Requirement: GPU core owns shared morph and BlendShape compute primitive
The GPU core SHALL provide a shared Morph/BlendShape compute primitive for weighted vertex delta accumulation used by both 3D morph targets and 2D BlendShapes. The primitive MUST be owned by `engine-gpu` and MUST NOT depend on scene renderer, puppet renderer, runtime-scene, or runtime-puppet internals.

#### Scenario: Scene renderer uses shared primitive
- **WHEN** scene rendering evaluates 3D morph targets on the GPU
- **THEN** the renderer adapts scene morph buffers, weights, and vertex layout into the shared `engine-gpu` morph compute primitive
- **THEN** the renderer does not maintain an independent weighted-delta shader for the same operation

#### Scenario: Puppet renderer uses shared primitive
- **WHEN** puppet rendering evaluates 2D BlendShape deltas on the GPU
- **THEN** the renderer adapts puppet mesh buffers, weights, and vertex layout into the shared `engine-gpu` morph compute primitive
- **THEN** runtime-puppet remains free of `wgpu` and renderer crate dependencies

#### Scenario: GPU core remains domain agnostic
- **WHEN** architecture checks inspect `engine-gpu`
- **THEN** the shared primitive exposes domain-neutral inputs such as base vertex data, delta ranges, weights, and output buffers
- **THEN** it does not import scene nodes, puppet bones, Live2D/MOC3 data, ECS components, renderer companion internals, or host services

### Requirement: Morph compute parity is validated across 2D and 3D fixtures
The engine SHALL validate the shared Morph/BlendShape compute primitive against CPU reference fixtures for both 2D BlendShapes and 3D morph targets. Validation MUST include ordinary cases and extreme many-shapes with large-delta cases.

#### Scenario: 2D BlendShape GPU output matches CPU reference
- **WHEN** a 2D mesh fixture is evaluated through the shared GPU primitive and the CPU reference path
- **THEN** final vertex positions match within the configured tolerance
- **THEN** the test records the fixture shape count, vertex count, weight distribution, and tolerance used

#### Scenario: 3D morph GPU output matches CPU reference
- **WHEN** a 3D mesh fixture is evaluated through the shared GPU primitive and the CPU reference path
- **THEN** final vertex attributes required by the renderer match within the configured tolerance
- **THEN** scene renderer layout adaptation is tested separately from the shared primitive behavior

#### Scenario: Extreme accumulation remains bounded
- **WHEN** a fixture contains more than twenty active shapes or morph targets with large deltas and extreme weight distribution
- **THEN** the shared primitive result stays within the configured tolerance or reports a required numeric-stability mitigation such as compensated accumulation or wider accumulator strategy

### Requirement: Renderer layout adaptation remains renderer-owned
The engine SHALL keep scene-specific and puppet-specific buffer layout adaptation in the owning renderer companion crates or current renderer modules. `engine-gpu` MUST own only the reusable compute primitive and GPU infrastructure required to execute it.

#### Scenario: Renderer adapts layout at extract boundary
- **WHEN** runtime-scene or runtime-puppet produces render-extract data for deformation
- **THEN** the owning renderer maps that data into the shared morph primitive input layout
- **THEN** `engine-gpu` does not need to know scene skeleton, puppet skeleton, draw order, clipping, expression presets, or authoring command state

#### Scenario: Unsupported layout is explicit
- **WHEN** a renderer cannot represent its current vertex or delta layout through the shared primitive
- **THEN** it reports an explicit unsupported-capability or fallback diagnostic
- **THEN** it does not silently fork a duplicate shader without a new proposal or documented exception
