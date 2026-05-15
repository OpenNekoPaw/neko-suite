## ADDED Requirements

### Requirement: Export Sink Construction Boundary
Export orchestration SHALL depend on a sink construction boundary instead of directly importing service implementation modules.

#### Scenario: Export service does not import service implementations
- **WHEN** source dependency checks inspect files under `engine-kernel/src/export`
- **THEN** those files do not import `crate::services::impls::*`

#### Scenario: Default export sink remains muxer backed
- **WHEN** the default export path creates a sink for an H.264 container export
- **THEN** it still creates a muxer-backed sink through the construction boundary and preserves existing `PipelineSink` submit/flush/close behavior

#### Scenario: Export tests can inject sink construction
- **WHEN** export orchestration is tested without FFmpeg muxer side effects
- **THEN** the test can provide a fake sink factory or constructor that returns a `PipelineSink` implementation

### Requirement: Canonical Blend Mode Contract
The engine SHALL use `neko-engine-types` as the canonical source for blend-mode semantics shared by domain, export, and GPU-facing code.

#### Scenario: GPU compositor uses canonical blend mode
- **WHEN** GPU compositing receives layer blend metadata
- **THEN** the semantic blend mode type comes from `neko_engine_types::BlendMode` or a direct compatibility re-export of that type

#### Scenario: Shader numeric mapping is exhaustive
- **WHEN** each canonical blend mode is converted for shader uniforms
- **THEN** every variant maps to the same stable numeric code used by the existing shader contract

#### Scenario: Duplicate public blend mode is rejected
- **WHEN** architecture checks inspect GPU compositor source
- **THEN** GPU code does not expose a separate public `BlendMode` enum duplicating the engine-types contract

### Requirement: Audio Encoder Configuration Contract
The engine SHALL define audio encoder configuration as a pure contract DTO outside audio and codec implementation modules.

#### Scenario: Encoder consumes pure audio config
- **WHEN** muxer or encoder code adds an audio stream
- **THEN** it imports `AudioEncoderConfig` from `neko_engine_types` or a direct compatibility re-export rather than from `crate::audio`

#### Scenario: Audio implementation consumes same config
- **WHEN** audio encoder implementation opens an encoder
- **THEN** it consumes the same `AudioEncoderConfig` contract DTO without requiring codec implementation modules to depend on audio implementation modules

#### Scenario: Implementation helpers stay out of engine-types
- **WHEN** engine-types dependency checks run
- **THEN** `AudioEncoderConfig` does not introduce FFmpeg, DSP, encoder pool, `wgpu`, tokio runtime, host, or kernel dependencies into `neko-engine-types`

### Requirement: Infrastructure Extraction Guardrails
The engine SHALL add lightweight architecture checks that protect extraction-prep boundaries from regression.

#### Scenario: Export implementation dependency regression is detected
- **WHEN** a source file under `engine-kernel/src/export` imports `crate::services::impls`
- **THEN** the architecture check fails

#### Scenario: Audio and codec coupling regression is detected
- **WHEN** a source file under `engine-kernel/src/encoder` imports `crate::audio::AudioEncoderConfig`
- **THEN** the architecture check fails

#### Scenario: Engine types purity remains checked
- **WHEN** the architecture checks run
- **THEN** `neko-engine-types` remains free of GPU, FFmpeg, tokio runtime, kernel, host, and runtime side-effect implementation dependencies

### Requirement: Infrastructure Crate Extraction Readiness
The engine SHALL preserve behavior while preparing the boundaries needed for later crate extraction.

#### Scenario: No new infrastructure crate in prep change
- **WHEN** this change is implemented
- **THEN** it does not create `engine-codec`, `engine-audio`, `engine-gpu`, or renderer companion crates

#### Scenario: Follow-up extraction order is recorded
- **WHEN** the prep change is complete
- **THEN** follow-up tasks identify `engine-codec`, `engine-audio`, `engine-gpu`, renderer companion crates, and host facade narrowing as separate changes

#### Scenario: Zero-copy path remains explicit
- **WHEN** export or realtime paths cannot provide required native GPU handle interop
- **THEN** the engine continues to return an explicit unsupported capability error instead of adding CPU readback fallback behavior
