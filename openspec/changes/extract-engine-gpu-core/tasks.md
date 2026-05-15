## 1. Crate Scaffolding

- [x] 1.1 Confirm `prepare-engine-gpu-core-extraction` is complete and use its approved move list.
- [x] 1.2 Add `packages/neko-engine/packages/engine-gpu` to the Rust workspace without creating renderer companion crates.
- [x] 1.3 Create `engine-gpu/Cargo.toml` with only GPU-required dependencies: `neko-engine-types`, `wgpu`, `wgpu-hal`, `wgpu-core`, `pollster`, `bytemuck`, tracing, thiserror/anyhow as needed, and platform interop dependencies.
- [x] 1.4 Add `engine-gpu/src/lib.rs`, `error.rs`, and module skeletons matching the preparation-approved GPU core surface.
- [x] 1.5 Define `GpuError` / `GpuResult<T>` in `engine-gpu` and add kernel-side conversion into `engine-kernel::error::Error`.

## 2. GPU Core Migration

- [x] 2.1 Move preparation-approved GPU context and device initialization code into `engine-gpu`.
- [x] 2.2 Move preparation-approved texture, buffer pool, readback, and resource helpers into `engine-gpu`.
- [x] 2.3 Move preparation-approved platform import/export and HAL interop modules into `engine-gpu`.
- [x] 2.4 Move preparation-approved encoder bridge and native handle helpers into `engine-gpu`.
- [x] 2.5 Preserve platform-specific target dependencies and feature flags.

## 3. GPU Pipeline And Budget Migration

- [x] 3.1 Move preparation-approved compositor and texture compositor modules into `engine-gpu`.
- [x] 3.2 Move preparation-approved effect/style/transition/blur/mask/LUT/shader modules into `engine-gpu`.
- [x] 3.3 Move `budget.rs` into `engine-gpu` only if the preparation change marked it extraction-ready; otherwise keep kernel-owned and document the reason.
- [x] 3.4 Preserve shader source loading and WGSL assembly behavior.
- [x] 3.5 Preserve zero-copy GPU output and unsupported-capability semantics.

## 4. Kernel Compatibility And Retained Renderers

- [x] 4.1 Convert `engine-kernel/src/gpu/mod.rs` into compatibility re-exports for moved GPU core items plus kernel-owned renderer companion modules.
- [x] 4.2 Keep `scene_renderer`, `puppet_renderer`, and `panoramic_renderer` kernel-owned unless explicitly approved by preparation.
- [x] 4.3 Update retained renderers, export, preview, services, and host-facing code to import moved GPU APIs through `engine-gpu` or kernel compatibility re-exports.
- [x] 4.4 Ensure existing `neko_engine_kernel::gpu::*` imports continue to compile.
- [x] 4.5 Keep TypeScript, HTTP, WebSocket, N-API, and persisted project formats unchanged.

## 5. Architecture Guardrails

- [x] 5.1 Add architecture tests verifying `engine-gpu/Cargo.toml` does not depend on `neko-engine-kernel`, host crates, services, export, preview, domain, `engine-audio`, or `engine-codec` unless explicitly allowed.
- [x] 5.2 Add source checks verifying `engine-gpu/src` does not import kernel services, export, preview, domain service modules, host crates, or renderer companion modules.
- [x] 5.3 Add kernel checks documenting retained renderer companion modules and compatibility re-exports.
- [x] 5.4 Keep existing `engine-types`, `engine-codec`, and `engine-audio` forbidden dependency checks passing.
- [x] 5.5 Document kernel GPU re-exports as temporary migration surface for later host facade narrowing.

## 6. Validation

- [x] 6.1 Run `cargo fmt -p neko-engine-types -p neko-engine-gpu -p neko-engine-kernel`.
- [x] 6.2 Run `cargo check -p neko-engine-gpu`.
- [x] 6.3 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 6.4 Run moved GPU core/resource/HAL tests in `neko-engine-gpu`.
- [x] 6.5 Run moved compositor/effect/budget tests in `neko-engine-gpu`.
- [x] 6.6 Run targeted kernel tests for retained renderers, export, preview, stream sink, muxer sink, snapshot sink, and architecture checks.
- [x] 6.7 Run `cargo test -p neko-engine-gpu`.
- [x] 6.8 Run `cargo test -p neko-engine-kernel` before merge, or document any platform/tooling blocker with targeted passing evidence.
- [x] 6.9 Run `openspec validate extract-engine-gpu-core --strict`.
