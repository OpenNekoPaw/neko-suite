## ADDED Requirements

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
