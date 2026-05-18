## ADDED Requirements

### Requirement: Kernel Excludes Domain Helper Implementations
`engine-kernel` SHALL remain an orchestration and service implementation crate and MUST NOT own CPU media toolbox implementations, JVI/NKV project parsing implementations, scene text mesh generation implementations, or empty top-level compatibility shells.

#### Scenario: CPU media toolbox is below kernel
- **WHEN** kernel services need media probe, diff, subtitle, JPEG, timeline diff, or JVI parsing helpers
- **THEN** they import those helpers from `runtime-media` or through an explicit kernel contract re-export
- **THEN** implementation modules do not live under `engine-kernel/src/media_service` or `engine-kernel/src/jvi`

#### Scenario: Scene text mesh is below kernel
- **WHEN** kernel scene services need to generate text mesh content
- **THEN** they call `runtime-scene` text mesh APIs
- **THEN** implementation modules do not live under `engine-kernel/src/generators`

#### Scenario: Empty shells are removed
- **WHEN** top-level kernel modules contain only compatibility re-exports or empty wrappers
- **THEN** those modules are removed or replaced by explicit contract re-exports with documented compatibility purpose

### Requirement: Kernel Compatibility Contracts Stay Explicit
The kernel MAY preserve host-facing compatibility imports through `contracts.rs`, but those compatibility exports SHALL be explicit re-exports from owning lower-layer crates rather than hidden implementation modules.

#### Scenario: Media compatibility import remains stable
- **WHEN** host-api imports media helpers from `neko_engine_kernel::contracts::media`
- **THEN** the import continues to compile
- **THEN** the exported item is sourced from `runtime-media`

#### Scenario: Compatibility surface does not hide implementation growth
- **WHEN** a new helper is exposed through kernel contracts
- **THEN** architecture tests verify that the helper implementation lives in the owning runtime or infrastructure crate, not in a new kernel helper module

### Requirement: Kernel Shrinkage Regression Protection
The project SHALL include architecture checks for the removed helper modules so future changes cannot reintroduce them without an explicit architecture decision.

#### Scenario: Removed helper directory reappears
- **WHEN** architecture tests inspect `engine-kernel/src`
- **THEN** they fail if `media_service`, `jvi`, `generators`, top-level `animation`, top-level `gpu`, top-level `decoder`, or top-level `audio` implementation directories reappear without an allowlisted compatibility rationale

#### Scenario: Kernel line count trend is visible
- **WHEN** the change is validated
- **THEN** tasks record the before/after kernel helper directory removal and the resulting ownership destinations
