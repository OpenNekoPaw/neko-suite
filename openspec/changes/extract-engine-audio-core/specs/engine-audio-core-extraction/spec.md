## ADDED Requirements

### Requirement: Audio Core Crate Boundary
The engine SHALL provide a dedicated `neko-engine-audio` crate for audio infrastructure implementation.

#### Scenario: Audio crate owns audio primitives
- **WHEN** audio core extraction is complete
- **THEN** audio decoder, audio encoder, DSP effects, DSP factory, soft limiter, and moved capture primitives live under `packages/neko-engine/packages/engine-audio`
- **THEN** `engine-kernel` consumes those capabilities instead of owning their implementation files

#### Scenario: Kernel keeps audio orchestration
- **WHEN** extraction classifies service-level audio workflows
- **THEN** task integration, service state, stream lifecycle, and export orchestration remain kernel-owned unless a pure engine primitive is split out
- **THEN** `engine-audio` does not import kernel services, export orchestration, preview routing, or host crates

### Requirement: Audio Dependency Direction
The audio crate SHALL depend only on shared contracts and audio implementation dependencies required for audio work.

#### Scenario: Audio crate avoids kernel and host dependencies
- **WHEN** architecture checks inspect `engine-audio/Cargo.toml`
- **THEN** it does not depend on `neko-engine-kernel`
- **THEN** it does not depend on host crates such as `host-api`, `host-http`, `host-napi`, or `host-cli`

#### Scenario: Audio crate avoids orchestration modules
- **WHEN** architecture checks inspect `engine-audio/src`
- **THEN** source files do not import kernel services, export, preview, domain orchestration, GPU renderer modules, or host crates
- **THEN** audio APIs remain usable by kernel and future export/streaming crates without circular dependencies

### Requirement: Audio Contracts Remain Stable
The extraction SHALL preserve existing audio-facing API behavior while allowing callers to transition through compatibility re-exports.

#### Scenario: Kernel compatibility imports still compile
- **WHEN** existing callers import audio items from `neko_engine_kernel::audio`
- **THEN** those imports continue to compile through compatibility modules or re-exports
- **THEN** no TypeScript, HTTP, WebSocket, N-API, or persisted project format change is required

#### Scenario: Pure audio DTOs stay in engine-types
- **WHEN** a type is pure audio configuration or shared codec metadata
- **THEN** it lives in `neko-engine-types` or is re-exported from a stable compatibility path
- **THEN** FFmpeg names, DSP state, capture runtime state, and implementation helpers remain outside `neko-engine-types`

### Requirement: Audio Error Boundary
The audio crate SHALL expose an audio-local error contract that maps into kernel errors at the kernel boundary.

#### Scenario: Audio errors do not import kernel errors
- **WHEN** `engine-audio` returns failures from decode, encode, DSP construction, capture, unsupported codec, invalid sample format, or IO-adjacent paths
- **THEN** it returns an audio-local error type
- **THEN** `engine-audio` does not import `engine-kernel::Error`

#### Scenario: Kernel preserves audio error behavior
- **WHEN** kernel services receive audio errors
- **THEN** they map those errors into existing kernel error categories
- **THEN** current user-facing error behavior remains compatible

### Requirement: Audio Validation Coverage
The extraction SHALL include tests and architecture guardrails proving behavior and boundaries are preserved.

#### Scenario: Audio crate tests run independently
- **WHEN** validation runs for this change
- **THEN** `cargo test -p neko-engine-audio` passes with moved decoder, encoder, DSP, limiter, and capture-safe tests

#### Scenario: Kernel audio workflows continue to pass
- **WHEN** validation runs for this change
- **THEN** targeted kernel tests for audio service, audio mixdown, audio stream, export audio mixer, and architecture checks pass

#### Scenario: Full kernel compatibility is preserved
- **WHEN** validation runs before merge
- **THEN** `cargo test -p neko-engine-kernel` passes or any platform/tooling blocker is documented with targeted passing evidence
