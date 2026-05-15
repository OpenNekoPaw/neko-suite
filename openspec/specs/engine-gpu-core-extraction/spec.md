# engine-gpu-core-extraction Specification

## Purpose
TBD - created by archiving change extract-engine-gpu-core. Update Purpose after archive.
## Requirements
### Requirement: GPU Core Crate Boundary
The engine SHALL provide a dedicated `neko-engine-gpu` crate for extraction-ready GPU infrastructure implementation while keeping domain-specific renderers in companion crates.

#### Scenario: GPU crate owns approved GPU core implementation
- **WHEN** GPU core extraction is complete
- **THEN** preparation-approved GPU context, resource, HAL, platform interop, readback, compositor, effect, and budget modules live under `packages/neko-engine/packages/engine-gpu`
- **THEN** `engine-kernel` consumes those capabilities instead of owning their implementation files

#### Scenario: Renderer companions remain outside GPU core
- **WHEN** extraction classifies scene, puppet, or panoramic renderer modules
- **THEN** they live outside `engine-gpu` in renderer companion crates once P2 extraction is complete
- **THEN** `engine-gpu` does not import scene renderer, puppet renderer, panoramic renderer, preview renderer companion, or export renderer companion internals

#### Scenario: Kernel no longer owns extracted renderer implementation
- **WHEN** a renderer module has moved to a companion crate
- **THEN** `engine-kernel` may keep an explicit compatibility shim for existing imports
- **THEN** `engine-kernel` does not keep a second copy of the moved renderer implementation

### Requirement: GPU Dependency Direction
The GPU crate SHALL depend only on shared contracts and implementation dependencies required for GPU work.

#### Scenario: GPU crate avoids kernel and host dependencies
- **WHEN** architecture checks inspect `engine-gpu/Cargo.toml`
- **THEN** it does not depend on `neko-engine-kernel`
- **THEN** it does not depend on host crates such as `host-api`, `host-http`, `host-napi`, or `host-cli`

#### Scenario: GPU crate avoids orchestration modules
- **WHEN** architecture checks inspect `engine-gpu/src`
- **THEN** source files do not import kernel services, export orchestration, preview orchestration, domain service modules, or renderer companion modules
- **THEN** GPU APIs remain usable by kernel, export, preview, and future renderer companion crates without circular dependencies

### Requirement: GPU Compatibility Imports Remain Stable
The extraction SHALL preserve existing GPU-facing API behavior while allowing callers to transition through compatibility re-exports.

#### Scenario: Kernel GPU compatibility imports still compile
- **WHEN** existing callers import GPU items from `neko_engine_kernel::gpu`
- **THEN** those imports continue to compile through compatibility modules or re-exports
- **THEN** no TypeScript, HTTP, WebSocket, N-API, or persisted project format change is required

#### Scenario: Kernel-owned renderer modules can consume engine-gpu
- **WHEN** retained renderer modules need GPU core types
- **THEN** they import them through `engine-gpu` or the kernel compatibility path
- **THEN** GPU core does not import those renderer modules back

### Requirement: GPU Error Boundary
The GPU crate SHALL expose a GPU-local error contract that maps into kernel errors at the kernel boundary.

#### Scenario: GPU errors do not import kernel errors
- **WHEN** `engine-gpu` returns failures from initialization, shader compilation, buffer operations, platform interop, readback, or unsupported capability paths
- **THEN** it returns a GPU-local error type
- **THEN** `engine-gpu` does not import `engine-kernel::Error`

#### Scenario: Kernel preserves GPU error behavior
- **WHEN** kernel services receive GPU errors
- **THEN** they map those errors into existing kernel error categories
- **THEN** unsupported native interop continues to surface as explicit unsupported capability behavior

### Requirement: Zero-Copy GPU Behavior Is Preserved
GPU extraction SHALL preserve existing GPU-handle resource behavior and unsupported-capability semantics.

#### Scenario: Supported native GPU paths remain zero-copy
- **WHEN** supported platforms decode, composite, render, or encode through native GPU handles
- **THEN** the path remains GPU-resident without introducing CPU readback

#### Scenario: Unsupported native GPU paths remain explicit
- **WHEN** a platform or backend cannot consume the submitted native GPU handle
- **THEN** it returns an explicit unsupported error
- **THEN** it does not silently copy through CPU memory as a fallback

### Requirement: GPU Validation Coverage
The extraction SHALL include tests and architecture guardrails proving that behavior and boundaries are preserved.

#### Scenario: GPU crate tests run independently
- **WHEN** validation runs for this change
- **THEN** `cargo test -p neko-engine-gpu` passes with moved GPU core, compositor, effect, budget, and platform-safe tests

#### Scenario: Kernel GPU workflows continue to pass
- **WHEN** validation runs for this change
- **THEN** targeted kernel tests for retained renderers, export, preview, stream sink, muxer sink, snapshot sink, and architecture checks pass

#### Scenario: Full kernel compatibility is preserved
- **WHEN** validation runs before merge
- **THEN** `cargo test -p neko-engine-kernel` passes or any platform/tooling blocker is documented with targeted passing evidence

### Requirement: GPU Core Owns Platform Media Bridge Implementations
The GPU core crate SHALL own platform GPU media bridge implementations and expose them to kernel orchestration through narrow contracts.

#### Scenario: Kernel does not own platform interop
- **WHEN** preview or export orchestration needs IOSurface, DMA-BUF, VA-API, DXGI, D3D, Metal, Vulkan, or platform synchronization interop
- **THEN** it calls engine-gpu bridge APIs
- **THEN** platform interop implementation files do not move back into engine-kernel

#### Scenario: Renderer companions use bridge contracts
- **WHEN** renderer or export companion crates need platform GPU media import/export
- **THEN** they use engine-gpu bridge contracts or DTOs
- **THEN** they do not duplicate platform-specific import/export orchestration

