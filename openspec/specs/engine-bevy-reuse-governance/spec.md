# engine-bevy-reuse-governance Specification

## Purpose
TBD - created by archiving change align-engine-bevy-reuse-runtime-contracts. Update Purpose after archive.
## Requirements
### Requirement: Bevy reuse is governed by an engine allowlist
The engine SHALL govern direct Bevy crate usage through an explicit allowlist for runtime and renderer crates. Direct reuse MUST be limited to narrowly scoped infrastructure crates whose APIs do not bring in Bevy App, plugin, window, asset, renderer, or schedule ownership.

#### Scenario: Approved Bevy infrastructure is used
- **WHEN** runtime-scene, runtime-puppet, engine-gpu, or renderer companion crates use Bevy directly
- **THEN** the dependency is present in the approved allowlist with the intended engine-owned use case
- **THEN** architecture checks or review gates can distinguish approved infrastructure reuse from accidental full-engine adoption

#### Scenario: Full Bevy runtime is rejected
- **WHEN** a change attempts to introduce Bevy App, Bevy Schedule ownership, Bevy Renderer, Bevy Window, Bevy asset pipeline, or Bevy plugin runtime into Neko Engine runtime crates
- **THEN** the change is rejected or gated behind a new proposal that explains the architecture impact
- **THEN** the existing engine runtime, renderer, viewport, export, and host boundaries remain authoritative

### Requirement: bevy_ecs remains the ECS foundation without Bevy app ownership
The engine SHALL continue to use `bevy_ecs` as the ECS foundation for World, Entity, Component, Resource, Query, change detection, events, and related data access patterns. Engine-owned services MUST retain lifecycle, scheduling, command acknowledgement, viewport, and export orchestration authority.

#### Scenario: ECS component model is reused
- **WHEN** runtime-scene or runtime-puppet defines runtime components or queries
- **THEN** it may use `bevy_ecs` World, Component, Resource, Entity, Query, and change detection APIs
- **THEN** it does not require Bevy App or Bevy plugin lifecycle to evaluate runtime state

#### Scenario: Engine scheduling remains authoritative
- **WHEN** scene or puppet services tick runtime systems, apply commands, or produce render-extract data
- **THEN** those operations are orchestrated by Neko Engine service boundaries
- **THEN** Bevy scheduling constructs do not replace command sequencing, revision checks, frame scheduling, or export orchestration

### Requirement: bevy_tasks may provide CPU parallel execution
The engine SHALL allow `bevy_tasks` for CPU-bound runtime and render-extract work where deterministic serial fallback and parity tests are provided. Task usage MUST NOT require Bevy App, Bevy plugins, or renderer ownership.

#### Scenario: CPU deformation uses task parallelism
- **WHEN** runtime-puppet parallelizes BlendShape or skinning mesh batches
- **THEN** it may use `bevy_tasks` task pools or parallel iteration helpers
- **THEN** the serial fallback remains available for tests, unsupported targets, and deterministic diagnostics

#### Scenario: Parallel task errors are bounded
- **WHEN** a parallel runtime task fails, panics, or cannot be scheduled
- **THEN** the owning engine service maps the failure into an explicit runtime diagnostic or fallback path
- **THEN** task failure does not silently corrupt authoritative runtime state

### Requirement: bevy_math adoption is gated by glam alignment
The engine SHALL NOT expose `bevy_math` types across runtime, renderer, or contract boundaries until Neko Engine aligns the `glam` version used by runtime-scene, runtime-puppet, engine-types, and renderer crates. Any future `bevy_math` adoption MUST preserve a single public math type boundary.

#### Scenario: glam versions are still unaligned
- **WHEN** runtime-scene or runtime-puppet still depends on a different `glam` version than the target `bevy_math` version expects
- **THEN** `bevy_math` is not introduced into shared DTOs, ECS components, renderer extract data, or public engine contracts
- **THEN** existing `glam` types remain the engine math boundary

#### Scenario: bevy_math is evaluated after alignment
- **WHEN** all affected runtime and renderer crates are aligned on a compatible `glam` version
- **THEN** `bevy_math` may be evaluated through a separate change
- **THEN** tests verify that serialized data, public DTOs, and cross-crate math conversions do not create duplicate math type boundaries

### Requirement: Bevy shader and algorithm reuse becomes Neko-owned implementation
The engine SHALL treat Bevy renderer, animation, picking, gizmo, shadow, post-process, and morph code as design references unless a separate proposal explicitly approves direct crate reuse. Ported shader or algorithm work MUST land in Neko-owned engine crates and respect Neko renderer, GPU, asset, viewport, and export boundaries.

#### Scenario: Morph shader ideas are reused
- **WHEN** Neko ports the common morph target or BlendShape weighted-delta operation from Bevy shader concepts
- **THEN** the resulting primitive is owned by `engine-gpu`
- **THEN** scene and puppet renderers adapt their layouts to that primitive instead of depending on Bevy renderer crates

#### Scenario: Renderer pipeline code is not imported wholesale
- **WHEN** an implementation needs shadows, picking, gizmos, post-processing, or animation graph behavior inspired by Bevy
- **THEN** it may copy or reimplement the relevant algorithm under Neko ownership with attribution and tests where required
- **THEN** it does not introduce Bevy renderer, asset server, plugin, or window lifecycle dependencies into Neko runtime or renderer crates
