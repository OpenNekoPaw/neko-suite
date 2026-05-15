## Why

`engine-kernel` now contains GPU infrastructure, codec, audio, preview, export, renderer, domain, and service orchestration in one crate. The recent engine decoupling work established better interfaces, but several of those contracts still live in high-level modules, leaving architecture-level cycles such as `gpu -> services` and making later crate extraction risky.

This change turns the kernel decoupling ADR into an implementation plan. The first deliverable is a low-risk P0 boundary fix: move pure pipeline output contracts into `engine-types`, keep GPU/readback implementation in kernel, and add regression checks so future work cannot reintroduce the same coupling.

## What Changes

- Move pure PipelineSink output DTOs from `engine-kernel::services::pipeline_sink` into `neko-engine-types`.
- Preserve `engine-types` as a pure contract crate with no `wgpu`, FFmpeg, tokio runtime, `GpuContext`, or kernel `Error` dependencies.
- Keep GPU readback implementation, `GpuReadbackTarget`, and `wgpu::Texture` ownership in `engine-kernel`.
- Refactor GPU renderers and preview code to import output contracts from `neko-engine-types` instead of `crate::services::pipeline_sink`, cutting the `gpu -> services` dependency.
- Keep `PipelineSink` trait in kernel for P0 compatibility unless/until a pure `PipelineSinkError` or associated error contract is introduced.
- Document `GpuOutputHandle` as a platform resource identifier, not a safe ownership wrapper; require kernel RAII wrappers such as `GpuFrameLease` for safe use.
- Add regression coverage for sink lifecycle behavior touched by the migration, including MuxerSink flush/close semantics and StreamSink close/flush behavior.
- Add lightweight architecture checks that prevent `gpu/` from importing `crate::services` and prevent `domain/` from importing `crate::gpu`.
- Prepare follow-up boundaries for P1/P2: `engine-gpu`, `engine-codec`, `engine-audio`, renderer companion crates, and host facade/DI cleanup.

## Capabilities

### New Capabilities

- `engine-kernel-boundary-contracts`: Defines the required boundaries between `engine-types`, `engine-kernel`, GPU renderers, services, and sink contracts during kernel decoupling.

### Modified Capabilities

None.

## Impact

- Affected crates:
  - `packages/neko-engine/packages/engine-types`
  - `packages/neko-engine/packages/engine-kernel`
  - potentially `packages/neko-engine/packages/host-api` for compatibility re-exports
- Affected modules:
  - `engine-kernel/src/services/pipeline_sink.rs`
  - `engine-kernel/src/gpu/panoramic_renderer.rs`
  - `engine-kernel/src/gpu/puppet_renderer/mod.rs`
  - `engine-kernel/src/preview/pipeline.rs`
  - sink implementations under `engine-kernel/src/services/impls`
- No intended user-facing API or protocol changes.
- No intended zero-copy hot path regression.
- This is a structural change with compile-time and test coverage impact rather than a new runtime feature.
