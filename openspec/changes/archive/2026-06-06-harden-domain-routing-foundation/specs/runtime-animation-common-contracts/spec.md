## MODIFIED Requirements

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
