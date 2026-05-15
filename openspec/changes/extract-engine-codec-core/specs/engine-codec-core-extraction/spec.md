## ADDED Requirements

### Requirement: Codec Core Crate Boundary
The engine SHALL provide a dedicated `neko-engine-codec` crate for codec infrastructure implementation.

#### Scenario: Codec crate owns codec implementation
- **WHEN** codec core extraction is complete
- **THEN** FFmpeg-backed encoder, decoder, muxer, codec extension helpers, and encoder/decoder pools live under `packages/neko-engine/packages/engine-codec`
- **THEN** `engine-kernel` consumes those capabilities instead of owning their implementation files

#### Scenario: Mixed GPU export pipeline stays in kernel
- **WHEN** extraction classifies `engine-kernel/src/encoder/pipeline.rs`
- **THEN** GPU-compositing export orchestration remains kernel-owned unless a GPU-free encode/mux worker is split out
- **THEN** `engine-codec` does not import `GpuContext`, `GpuCompositor`, GPU renderer modules, export services, or preview pipeline modules

### Requirement: Codec Dependency Direction
The codec crate SHALL depend only on shared contracts and implementation dependencies required for codec work, never on kernel orchestration or host crates.

#### Scenario: Codec crate does not depend on kernel
- **WHEN** architecture checks inspect `engine-codec/Cargo.toml`
- **THEN** it does not depend on `neko-engine-kernel`
- **THEN** it does not depend on host crates such as `host-api`, `host-http`, `host-napi`, or `host-cli`

#### Scenario: Codec crate does not depend on orchestration modules
- **WHEN** architecture checks inspect `engine-codec/src`
- **THEN** source files do not import kernel service, export, preview, domain, or GPU renderer modules
- **THEN** codec APIs remain usable by kernel, audio, export, and future GPU crates without circular dependencies

### Requirement: Codec Contracts Remain Stable
The extraction SHALL preserve existing codec-facing API behavior while allowing callers to transition through compatibility re-exports.

#### Scenario: Kernel compatibility imports still compile
- **WHEN** existing callers import codec items from `neko_engine_kernel::encoder` or `neko_engine_kernel::decoder`
- **THEN** those imports continue to compile through compatibility modules or re-exports
- **THEN** no TypeScript, HTTP, WebSocket, N-API, or persisted project format change is required

#### Scenario: Pure DTOs stay outside implementation helpers
- **WHEN** a codec type is pure configuration or packet data shared outside codec implementation
- **THEN** it lives in `neko-engine-types` or is re-exported from a stable compatibility path
- **THEN** FFmpeg names, codec ID mappings, hardware device mappings, and pool internals remain outside `neko-engine-types`

### Requirement: Codec Error Boundary
The codec crate SHALL expose a codec-local error contract that maps into kernel errors at the kernel boundary.

#### Scenario: Codec errors do not import kernel errors
- **WHEN** `engine-codec` returns failures from encode, decode, mux, hardware detection, unsupported codec/container, unsupported GPU input, or cancellation paths
- **THEN** it returns a codec-local error type
- **THEN** `engine-codec` does not import `engine-kernel::Error`

#### Scenario: Kernel preserves error behavior
- **WHEN** kernel services receive codec errors
- **THEN** they map those errors into existing kernel error categories
- **THEN** unsupported GPU/native interop continues to surface as explicit unsupported capability behavior rather than CPU fallback

### Requirement: Zero-Copy Codec Behavior Is Preserved
Codec extraction SHALL preserve existing GPU-handle encoding behavior and unsupported-capability semantics.

#### Scenario: Supported native GPU input remains zero-copy
- **WHEN** a supported platform submits a native GPU handle to the hardware encoder path
- **THEN** the codec path continues to consume the native handle without introducing CPU readback

#### Scenario: Unsupported native GPU input remains explicit
- **WHEN** a platform or encoder cannot consume the submitted native GPU handle
- **THEN** the codec path returns an explicit unsupported error
- **THEN** it does not silently copy through CPU memory as a fallback

### Requirement: Codec Validation Coverage
The extraction SHALL include tests and architecture guardrails proving that behavior and boundaries are preserved.

#### Scenario: Codec crate tests run independently
- **WHEN** validation runs for this change
- **THEN** `cargo test -p neko-engine-codec` passes with moved encoder, decoder, muxer, IDR scanner, and pool tests

#### Scenario: Kernel tests continue to pass
- **WHEN** validation runs for this change
- **THEN** `cargo test -p neko-engine-kernel` passes or any platform/tooling blocker is documented with targeted passing evidence

#### Scenario: Architecture checks protect the extraction
- **WHEN** architecture checks run
- **THEN** they fail if `engine-codec` gains dependencies on kernel, host crates, services, export, preview, domain, or GPU renderer modules
