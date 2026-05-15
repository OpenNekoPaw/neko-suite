## ADDED Requirements

### Requirement: Shared Animation Blend Contracts
The engine SHALL define shared animation blend DTOs for concepts that are common across scene and puppet runtimes.

#### Scenario: Shared blend layer is reused
- **WHEN** runtime-scene or runtime-puppet represents a weighted animation blend layer
- **THEN** it uses the shared animation blend contract directly or through a thin compatibility alias/wrapper
- **THEN** duplicate local DTO fields do not drift between runtimes

#### Scenario: Shared crossfade request is reused
- **WHEN** runtime-scene or runtime-puppet schedules a crossfade between clips or layers
- **THEN** it uses the shared crossfade contract directly or through a thin compatibility alias/wrapper
- **THEN** activation time, duration, source, target, and weighting semantics remain compatible with existing behavior

### Requirement: Animation Durations Are Explicit
Animation blend contracts SHALL represent duration units explicitly and MUST NOT rely on ambiguous raw numeric fields across runtime boundaries.

#### Scenario: Seconds and milliseconds are converted explicitly
- **WHEN** scene code accepts seconds-oriented crossfade input and puppet code accepts milliseconds-oriented input
- **THEN** each path converts through explicit constructors, newtypes, or helper methods
- **THEN** tests verify that equivalent durations produce equivalent shared contract values

#### Scenario: Serialization stays compatible
- **WHEN** existing serialized scene or puppet blend state is round-tripped
- **THEN** field names and duration values remain compatible or an explicit migration is provided
- **THEN** internal shared DTO extraction does not silently change persisted project format

### Requirement: Runtime Animation Systems Remain Independent
Shared animation DTO extraction SHALL NOT merge scene and puppet ECS systems or domain-specific animation math.

#### Scenario: Scene system remains scene-owned
- **WHEN** scene animation systems evaluate 3D transforms, blend trees, playback state, or scene deltas
- **THEN** that implementation remains in runtime-scene
- **THEN** shared contracts do not depend on scene ECS internals

#### Scenario: Puppet system remains puppet-owned
- **WHEN** puppet animation systems evaluate bones, slots, meshes, draw order, or puppet-specific playback
- **THEN** that implementation remains in runtime-puppet
- **THEN** shared contracts do not depend on puppet ECS internals

### Requirement: Compatibility Names Are Preserved During Migration
The extraction SHALL preserve existing public scene and puppet animation type names until callers migrate deliberately.

#### Scenario: Existing scene imports keep compiling
- **WHEN** kernel or host-facing code imports scene blend DTO names
- **THEN** those names continue to compile through aliases, wrappers, or documented compatibility exports
- **THEN** behavior and serialized shape remain compatible

#### Scenario: Existing puppet imports keep compiling
- **WHEN** runtime-puppet systems or callers import puppet blend DTO names
- **THEN** those names continue to compile through aliases, wrappers, or documented compatibility exports
- **THEN** behavior and serialized shape remain compatible

### Requirement: Duplicate DTO Regression Is Guarded
The engine SHALL include tests or architecture checks that prevent scene and puppet blend DTOs from drifting apart again.

#### Scenario: Local duplicate struct reappears
- **WHEN** source checks inspect runtime-scene and runtime-puppet animation blend modules
- **THEN** they fail if common blend-layer or crossfade DTO structs are redefined locally instead of using the shared contract

#### Scenario: Conversion tests cover both runtimes
- **WHEN** validation runs
- **THEN** scene and puppet blend-state tests verify shared DTO construction, duration conversion, and serde compatibility
