# runtime-animation-common-contracts Specification

## Purpose
TBD - created by archiving change extract-runtime-animation-common. Update Purpose after archive.
## Requirements
### Requirement: Shared Animation Blend Contracts
The engine SHALL define shared animation blend DTOs and compatibility helpers for concepts that are common across scene and puppet runtimes.

#### Scenario: Shared blend layer is reused
- **WHEN** runtime-scene or runtime-puppet represents a weighted animation blend layer
- **THEN** it uses the shared animation blend contract directly or through a thin compatibility alias/wrapper
- **THEN** duplicate local DTO fields do not drift between runtimes

#### Scenario: Shared crossfade request is reused
- **WHEN** runtime-scene or runtime-puppet schedules a crossfade between clips or layers
- **THEN** it uses the shared crossfade contract directly or through a thin compatibility alias/wrapper
- **THEN** activation time, duration, source, target, and weighting semantics remain compatible with existing behavior

#### Scenario: Compatibility helpers are shared
- **WHEN** scene code needs seconds-oriented accessors and puppet code needs milliseconds-oriented accessors
- **THEN** those helpers are implemented in the shared animation contract layer or through shared helper traits
- **THEN** runtime wrappers do not duplicate equivalent conversion logic

#### Scenario: Wrapper adapters are shared
- **WHEN** scene and puppet runtime modules expose domain-named wrappers around the shared animation DTOs
- **THEN** the repeated unit conversion and serde adapter behavior comes from `engine-types`
- **THEN** runtime modules do not maintain independent copies of the same wrapper boilerplate

#### Scenario: Future wrapper shapes are explicit
- **WHEN** future animation features need wrapper shapes beyond the current layer/info/state/crossfade pattern
- **THEN** the shared adapter or macro is extended deliberately with tests
- **THEN** runtime modules do not silently fork a second copy of equivalent wrapper boilerplate

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

#### Scenario: Info serialization remains domain compatible
- **WHEN** scene blend info serializes elapsed time as seconds and puppet blend info serializes elapsed time as milliseconds
- **THEN** the shared compatibility layer preserves the public serialized shape for each runtime
- **THEN** tests cover both runtime-specific serialized forms

#### Scenario: Scene playback state remains scene-specific
- **WHEN** animation wrapper deduplication is applied
- **THEN** `SceneAnimationPlaybackState` remains owned by runtime-scene
- **THEN** it is not merged into puppet or the shared DTO layer solely because wrapper code is being deduplicated

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

#### Scenario: Shared DTOs remain in engine-types
- **WHEN** common blend-layer, blend-state, duration, or crossfade DTOs are introduced or modified
- **THEN** pure DTO definitions remain in `engine-types` or an equivalent zero-Bevy shared contract crate
- **THEN** they are not moved into an ECS-specific crate solely for reuse

### Requirement: Duplicate DTO Regression Is Guarded
The engine SHALL include tests or architecture checks that prevent scene and puppet blend DTOs from drifting apart again.

#### Scenario: Local duplicate struct reappears
- **WHEN** source checks inspect runtime-scene and runtime-puppet animation blend modules
- **THEN** they fail if common blend-layer or crossfade DTO fields are redefined locally instead of using the shared contract or shared wrapper adapter

#### Scenario: Conversion tests cover both runtimes
- **WHEN** validation runs
- **THEN** scene and puppet blend-state tests verify shared DTO construction, duration conversion, and serde compatibility

#### Scenario: ECS crate boundary is guarded
- **WHEN** architecture checks inspect shared animation DTO definitions
- **THEN** they fail if pure animation DTOs require Bevy or runtime-scene/runtime-puppet dependencies

