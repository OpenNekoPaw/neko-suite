# engine-renderer-companion-extraction Specification

## Purpose
TBD - created by archiving change extract-engine-renderer-companions. Update Purpose after archive.
## Requirements
### Requirement: Renderer Companion Crate Boundaries
The engine SHALL locate domain-specific GPU renderer implementation in focused companion crates instead of `engine-kernel`.

#### Scenario: Scene renderer has a companion crate
- **WHEN** scene renderer extraction is complete
- **THEN** scene renderer implementation lives under a dedicated renderer companion crate such as `neko-engine-scene-renderer`
- **THEN** `engine-kernel` consumes scene rendering through that crate or an explicit compatibility shim

#### Scenario: Puppet renderer has a companion crate
- **WHEN** puppet renderer extraction is complete
- **THEN** puppet renderer implementation lives under a dedicated renderer companion crate such as `neko-engine-puppet-renderer`
- **THEN** `engine-kernel` consumes puppet rendering through that crate or an explicit compatibility shim

#### Scenario: Panoramic renderer has a companion crate
- **WHEN** panoramic renderer extraction is complete
- **THEN** panoramic renderer implementation lives under a dedicated renderer companion crate or an approved preview-renderer companion crate
- **THEN** `engine-kernel` consumes panoramic rendering through that crate or an explicit compatibility shim

### Requirement: Pure Runtime Crates Remain GPU-Free
Renderer extraction SHALL preserve runtime crates as pure state and computation crates without GPU implementation dependencies.

#### Scenario: Runtime scene remains pure
- **WHEN** architecture checks inspect `runtime-scene`
- **THEN** it does not depend on `wgpu`, `neko-engine-gpu`, renderer companion crates, `neko-engine-kernel`, or host crates

#### Scenario: Runtime puppet remains pure
- **WHEN** architecture checks inspect `runtime-puppet`
- **THEN** it does not depend on `wgpu`, `neko-engine-gpu`, renderer companion crates, `neko-engine-kernel`, or host crates

### Requirement: Renderer Companion Dependency Direction
Renderer companion crates SHALL depend on lower-level contracts and GPU infrastructure without depending on kernel orchestration or host layers.

#### Scenario: Renderer companions avoid kernel and host crates
- **WHEN** architecture checks inspect renderer companion Cargo manifests
- **THEN** they do not depend on `neko-engine-kernel`
- **THEN** they do not depend on host crates such as `host-api`, `host-http`, `host-napi`, or `host-cli`

#### Scenario: Renderer companions avoid orchestration modules
- **WHEN** architecture checks inspect renderer companion source files
- **THEN** they do not import kernel services, export orchestration, preview orchestration, media service orchestration, or service implementation modules

#### Scenario: GPU core avoids renderer companions
- **WHEN** architecture checks inspect `engine-gpu`
- **THEN** `engine-gpu` does not depend on scene, puppet, panoramic, or export renderer companion crates

### Requirement: Export Render Pipeline Ownership
Export-facing GPU render pipeline code SHALL be separated from export job orchestration when it owns rendering implementation details.

#### Scenario: Export orchestration consumes render backend
- **WHEN** export jobs need GPU render output
- **THEN** `engine-kernel::export` consumes a render backend or companion crate contract
- **THEN** job setup, progress, cancellation, and sink factory wiring remain in export orchestration

#### Scenario: Rendering implementation leaves export orchestration
- **WHEN** `GpuExportPipeline` code owns shader, GPU texture, renderer, or render pass implementation details
- **THEN** those implementation details live in a renderer/export companion boundary rather than directly inside export orchestration

### Requirement: Renderer Compatibility Re-exports
Renderer extraction SHALL preserve short-term compatibility for existing imports while avoiding broad implementation exposure.

#### Scenario: Existing kernel GPU renderer imports compile
- **WHEN** existing callers import renderer types through `neko_engine_kernel::gpu`
- **THEN** those imports continue to compile through explicit compatibility re-exports during P2
- **THEN** no TypeScript, HTTP, WebSocket, N-API, or persisted project format change is required

#### Scenario: Compatibility surface is explicit
- **WHEN** `engine-kernel::gpu` re-exports moved renderer types
- **THEN** the re-export list is explicit for renderer compatibility
- **THEN** it does not introduce new glob re-exports for renderer companions

### Requirement: Renderer Zero-Copy Behavior Is Preserved
Renderer extraction SHALL preserve GPU-resident output behavior and unsupported-capability semantics.

#### Scenario: Renderer output remains GPU-resident
- **WHEN** scene, puppet, panoramic, preview, or export rendering produces realtime output
- **THEN** output uses GPU-resident handles or textures through existing pipeline contracts
- **THEN** extraction does not introduce CPU readback as a realtime fallback

#### Scenario: Unsupported GPU interop remains explicit
- **WHEN** a platform cannot provide required native GPU handle interop after renderer extraction
- **THEN** the renderer or adapter returns an explicit unsupported-capability error
- **THEN** it does not silently copy through CPU memory as a fallback

### Requirement: Renderer Extraction Validation
Renderer extraction SHALL include independent crate tests and architecture guardrails.

#### Scenario: Renderer crate tests run independently
- **WHEN** validation runs for this change
- **THEN** scene, puppet, and panoramic renderer companion crate tests pass independently where platform requirements allow

#### Scenario: Kernel integration remains compatible
- **WHEN** validation runs for this change
- **THEN** targeted kernel tests for preview routing, export routing, scene rendering, puppet rendering, panoramic rendering, stream sink, muxer sink, and architecture checks pass

#### Scenario: Architecture guardrails prevent regression
- **WHEN** architecture checks run after extraction
- **THEN** they fail on renderer companion dependencies on kernel or host crates
- **THEN** they fail on runtime crates gaining `wgpu`
- **THEN** they fail on `engine-gpu` importing renderer companion internals

