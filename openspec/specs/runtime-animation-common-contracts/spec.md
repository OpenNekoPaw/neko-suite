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

### Requirement: Animation clips expose graph leaf sampler contracts
The engine SHALL define shared AnimationGraph leaf sampler DTOs in `engine-types` or an equivalent zero-Bevy contract crate so 2D and 3D animation clips can be sampled by future graph/state-machine layers without merging runtime-scene and runtime-puppet animation systems.

#### Scenario: AnimationClip2D becomes a leaf sample source
- **WHEN** runtime-puppet samples an `AnimationClip2D` for use by a future AnimationGraph
- **THEN** the sample output is represented through the shared leaf sampler contract
- **THEN** the clip remains a deterministic source of bone transform tracks and BlendShape weight tracks rather than storing graph state, transitions, or blend tree nodes

#### Scenario: 3D clips use the same leaf boundary
- **WHEN** runtime-scene samples a 3D animation clip for use by a future AnimationGraph
- **THEN** the sample output uses the same shared leaf sampler contract shape or a compatibility wrapper over it
- **THEN** scene-specific transform, skeleton, morph, or material behavior remains owned by runtime-scene

#### Scenario: Leaf contract is host and renderer independent
- **WHEN** architecture checks inspect the shared animation leaf DTOs
- **THEN** the DTOs do not depend on Bevy App, Bevy Renderer, runtime-scene, runtime-puppet, renderer companion crates, VSCode, Webview, or host crates
- **THEN** runtime-specific adapters perform the conversion between domain clip data and the shared leaf sample

### Requirement: Animation graph layers own state while clips remain stateless
The engine SHALL keep state machine, transition, blend tree, additive blend, event routing, and graph-layer state outside individual 2D and 3D clip documents. Clip leaf samplers MUST expose sampled values and metadata only; graph state MUST be owned by the future animation graph runtime.

#### Scenario: Clip does not persist transition state
- **WHEN** a 2D or 3D animation clip is serialized, deserialized, or used as a graph leaf
- **THEN** it does not store active state, transition progress, blend tree topology, or graph-local event cursor state
- **THEN** graph runtime state can be reset or rebuilt without mutating the clip asset

#### Scenario: Graph can blend leaf samples
- **WHEN** a future AnimationGraph blends two leaf samples from 2D or 3D clips
- **THEN** it reads normalized sample metadata, track identities, duration, and sampled values from the shared contract
- **THEN** it applies graph-level blend policy without rewriting the underlying clip storage format

### Requirement: Leaf sampler compatibility is tested across scene and puppet
The engine SHALL include contract tests proving that scene and puppet clip samplers can produce leaf samples that round-trip through the shared DTOs and preserve runtime-specific compatibility wrappers.

#### Scenario: Puppet leaf round-trip preserves tracks
- **WHEN** a puppet fixture samples an `AnimationClip2D` containing bone and BlendShape tracks
- **THEN** serializing and deserializing the shared leaf sample preserves track identity, time, values, and interpolation-relevant metadata within the configured tolerance

#### Scenario: Scene leaf round-trip preserves transform data
- **WHEN** a scene fixture samples a 3D animation clip containing transform or morph-related tracks
- **THEN** serializing and deserializing the shared leaf sample preserves track identity, time, values, and scene compatibility wrapper behavior within the configured tolerance

#### Scenario: Shared DTOs stay dependency-light
- **WHEN** validation runs for shared animation contracts
- **THEN** architecture checks fail if the leaf sampler DTOs import Bevy runtime crates, renderer companion crates, runtime-scene internals, or runtime-puppet internals

