## 1. Scaffold Renderer Companion Crates

- [x] 1.1 Add `neko-engine-scene-renderer`, `neko-engine-puppet-renderer`, and `neko-engine-panoramic-renderer` crates to the workspace.
- [x] 1.2 Configure each renderer crate to depend on `neko-engine-gpu`, `neko-engine-types`, and only the relevant pure runtime crate.
- [x] 1.3 Add minimal crate-level architecture tests proving renderer crates do not depend on `neko-engine-kernel` or host crates.
- [x] 1.4 Add runtime crate guardrails proving `runtime-scene` and `runtime-puppet` do not depend on `wgpu` or renderer companion crates.

## 2. Extract Scene Renderer

- [x] 2.1 Move `engine-kernel/src/gpu/scene_renderer` implementation into `neko-engine-scene-renderer`.
- [x] 2.2 Update imports so scene renderer consumes GPU core types from `neko-engine-gpu` and shared DTOs from `neko-engine-types`.
- [x] 2.3 Replace `engine-kernel::gpu::scene_renderer` with an explicit compatibility shim and explicit type re-exports.
- [x] 2.4 Run and fix scene renderer unit tests or add focused smoke tests for render graph, asset cache, frame scheduler, and viewport output.

## 3. Extract Puppet Renderer

- [x] 3.1 Move `engine-kernel/src/gpu/puppet_renderer` implementation into `neko-engine-puppet-renderer`.
- [x] 3.2 Update imports so puppet renderer consumes GPU core types from `neko-engine-gpu` and puppet world/contracts from `runtime-puppet` or `neko-engine-types`.
- [x] 3.3 Replace `engine-kernel::gpu::puppet_renderer` with an explicit compatibility shim and explicit type re-exports.
- [x] 3.4 Run and fix puppet renderer unit/performance tests for atlas cache, sprite batch, blend behavior, and GPU frame output.

## 4. Extract Panoramic Renderer

- [x] 4.1 Move `engine-kernel/src/gpu/panoramic_renderer.rs` implementation into `neko-engine-panoramic-renderer`.
- [x] 4.2 Update panoramic preview/export call sites to consume the panoramic companion crate or a narrow kernel adapter.
- [x] 4.3 Preserve explicit `engine-kernel::gpu` compatibility re-exports for panoramic renderer types.
- [x] 4.4 Add or move tests covering view-state validation, projection mode behavior, unsupported capability paths, and GPU output contracts.

## 5. Split Export Render Pipeline Ownership

- [x] 5.1 Audit `engine-kernel/src/export/gpu_export_pipeline.rs` and classify orchestration code versus rendering implementation code.
- [x] 5.2 Introduce an export render backend trait if needed so export orchestration depends on a contract rather than renderer implementation details.
- [x] 5.3 Move shader, texture, render pass, or renderer-specific implementation details to the approved renderer/export companion boundary.
- [x] 5.4 Keep export job setup, cancellation, progress, sink factory wiring, and error mapping in `engine-kernel::export`.
- [x] 5.5 Add fake-backend tests proving export orchestration can run without constructing GPU renderer implementation.

## 6. Compatibility And Public Imports

- [x] 6.1 Remove broad renderer implementation ownership from `engine-kernel/src/gpu` while keeping explicit compatibility re-exports.
- [x] 6.2 Ensure `engine-gpu` does not import scene, puppet, panoramic, preview, export, or renderer companion internals.
- [x] 6.3 Update kernel, preview, export, and host call sites that can safely import companion crates directly or through explicit kernel compatibility paths.
- [x] 6.4 Document remaining compatibility paths as temporary P3 migration surfaces.

## 7. Validation

- [x] 7.1 Run `cargo check -p neko-engine-scene-renderer --lib --no-default-features`.
- [x] 7.2 Run `cargo check -p neko-engine-puppet-renderer --lib --no-default-features`.
- [x] 7.3 Run `cargo check -p neko-engine-panoramic-renderer --lib --no-default-features`.
- [x] 7.4 Run `cargo test -p neko-engine-kernel architecture_tests --lib --no-default-features`.
- [x] 7.5 Run targeted kernel tests for scene, puppet, panoramic, preview routing, export routing, stream sink, and muxer sink behavior.
- [x] 7.6 Run `openspec validate extract-engine-renderer-companions --strict`.
