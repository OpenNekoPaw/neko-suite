## Why

P0/P1 have already moved GPU core, codec, audio, and pipeline contracts out of `engine-kernel`, but `engine-kernel` still owns scene, puppet, panoramic, and export-facing renderer implementation. This keeps `wgpu` renderer churn inside the orchestration crate and prevents renderer behavior from being compiled, tested, and evolved as focused companion crates.

## What Changes

- Introduce renderer companion crate boundaries for scene, puppet, and panoramic rendering.
- Move renderer implementation ownership out of `engine-kernel/src/gpu` while keeping pure runtime crates free of `wgpu`.
- Evaluate and extract the export-facing GPU render pipeline into a rendering/export companion boundary when it depends on renderer internals rather than orchestration logic.
- Keep kernel compatibility re-exports during migration so existing host and kernel call sites can move incrementally.
- Add architecture guardrails proving renderer crates do not depend on `engine-kernel`, host crates, service implementations, export orchestration, or preview orchestration.
- Preserve zero-copy GPU handle semantics and unsupported-capability behavior; renderer extraction must not introduce CPU readback fallback.

## Capabilities

### New Capabilities
- `engine-renderer-companion-extraction`: Defines renderer companion crate boundaries, dependency direction, compatibility re-exports, export render pipeline ownership, and validation requirements for P2 kernel decoupling.

### Modified Capabilities
- `engine-gpu-core-extraction`: Marks scene, puppet, and panoramic renderer modules as extraction-ready companion crates while preserving the existing rule that renderer internals do not move into GPU core.

## Impact

- Affected Rust crates and modules:
  - `packages/neko-engine/packages/engine-kernel/src/gpu/scene_renderer`
  - `packages/neko-engine/packages/engine-kernel/src/gpu/puppet_renderer`
  - `packages/neko-engine/packages/engine-kernel/src/gpu/panoramic_renderer.rs`
  - `packages/neko-engine/packages/engine-kernel/src/export/gpu_export_pipeline.rs`
  - `packages/neko-engine/packages/engine-kernel/src/gpu/mod.rs`
  - new renderer companion crates under `packages/neko-engine/packages/`
- Affected dependencies:
  - renderer companions depend on `neko-engine-gpu`, `neko-engine-types`, and the relevant pure runtime crate.
  - pure `runtime-scene` and `runtime-puppet` must not gain `wgpu`.
  - `engine-kernel` should consume renderer companions through explicit adapters or compatibility re-exports.
- No TypeScript, HTTP, WebSocket, N-API, or persisted project format change is intended.
