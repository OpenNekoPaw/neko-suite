## 1. Shared Contract Extraction

- [x] 1.1 Add an `engine-types` pipeline module for pure output DTOs and re-export it from `engine-types/src/lib.rs`.
- [x] 1.2 Move `PipelineOutput`, `VideoOutput`, `AudioOutput`, `GpuOutputHandle`, `VideoGpuFrame`, `VideoPreviewFrame`, `VideoEncodedPacket`, `VideoRawFrame`, `AudioBuffer`, `AudioEncodedPacket`, `PreviewUnavailable`, and `PreviewUnavailableReason` into the new module.
- [x] 1.3 Reuse the existing `FrameFormat` from `engine-types` for raw and preview frame DTOs without creating a duplicate enum.
- [x] 1.4 Document `GpuOutputHandle` lifetime semantics as a platform resource identifier that requires an external RAII holder for safe use.
- [x] 1.5 Add unit coverage for contract-only behavior such as unsupported handle diagnostics and preview unavailability metadata.

## 2. Kernel Compatibility Layer

- [x] 2.1 Refactor `engine-kernel/src/services/pipeline_sink.rs` to import and re-export moved DTOs from `neko_engine_types`.
- [x] 2.2 Keep `PipelineSink` trait in kernel for P0 and update its signatures to use the moved DTOs without changing sink behavior.
- [x] 2.3 Keep `GpuReadbackTarget`, `GpuContext` readback, `wgpu::Texture`, and RGBA conversion helpers in kernel-owned code.
- [x] 2.4 Adapt `GpuFrameLease` so readback support remains kernel-owned while shared output frame construction stays compatible.

## 3. Dependency Direction Cleanup

- [x] 3.1 Update `gpu/panoramic_renderer.rs` to construct `VideoOutput::GpuFrame` without importing `crate::services::pipeline_sink`.
- [x] 3.2 Update `gpu/puppet_renderer/mod.rs` and related GPU tests to avoid service-layer imports for output DTOs.
- [x] 3.3 Update `preview/pipeline.rs`, `export/service.rs`, and sink implementations to use the new contract location or kernel compatibility re-export consistently.
- [x] 3.4 Confirm `engine-kernel/src/gpu` contains no imports of `crate::services` after the migration.

## 4. Sink Lifecycle Regression Coverage

- [x] 4.1 Add or update `MuxerSink` tests covering `flush()` and `close()` semantics, documenting terminal flush behavior or fixing flush to drain and continue.
- [x] 4.2 Add or update `StreamSink` tests covering `close()` with submitted frames so encoder buffered frames are flushed or behavior is explicitly protected.
- [x] 4.3 Preserve `SnapshotSink` terminal readback behavior and unsupported output rejection tests after DTO relocation.
- [x] 4.4 Verify unsupported output errors remain explicit for every sink touched by the migration.

## 5. Architecture Guardrails

- [x] 5.1 Add a lightweight architecture check that fails when files under `engine-kernel/src/gpu` import `crate::services`.
- [x] 5.2 Add a lightweight architecture check that fails when files under `engine-kernel/src/domain` import `crate::gpu`.
- [x] 5.3 Add a check or documented review gate ensuring `engine-types` does not gain `wgpu`, FFmpeg, tokio runtime, kernel, host, or runtime side-effect dependencies.
- [x] 5.4 Record P1 follow-up tasks for removing `export -> services::impls::*`, unifying `BlendMode`, moving `AudioEncoderConfig`, and introducing service factory/DI for host-api.

## 6. Validation

- [x] 6.1 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 6.2 Run targeted kernel tests for pipeline sink, muxer sink, stream sink, snapshot sink, panoramic renderer, and puppet renderer.
- [x] 6.3 Run `cargo test -p neko-engine-types` or the workspace-equivalent command covering the new contract module.
- [x] 6.4 Run `cargo test -p neko-engine-kernel` before merge, or document any platform/tooling blocker.
- [x] 6.5 Run zero-copy hot path smoke/perf validation or document why it cannot run locally.

## Validation Notes

- `cargo check -p neko-engine-kernel --lib --no-default-features` passed.
- `cargo test -p neko-engine-kernel --lib --no-default-features pipeline_sink` passed.
- `cargo test -p neko-engine-kernel --lib --no-default-features muxer_sink` passed.
- `cargo test -p neko-engine-kernel --lib --no-default-features stream_sink` passed.
- `cargo test -p neko-engine-kernel --lib --no-default-features snapshot_sink` passed.
- `cargo test -p neko-engine-kernel --lib --no-default-features panoramic_renderer` passed.
- `cargo test -p neko-engine-kernel --lib --no-default-features puppet_renderer` passed.
- `cargo test -p neko-engine-kernel --lib --no-default-features architecture_tests` passed.
- `cargo test -p neko-engine-types pipeline --no-default-features` passed.
- `cargo test -p neko-engine-kernel --lib --no-default-features` passed: 493 tests.
- `cargo test -p neko-engine-kernel` passed: 493 lib tests plus doc-tests.
- No standalone end-to-end zero-copy hot path smoke/perf harness is defined in this repo for local execution. The migration preserves the zero-copy contract through GPU-handle DTO tests, sink unsupported-output tests, renderer output-shape tests, and full kernel test coverage; a real perf smoke still requires the macOS VideoToolbox/IOSurface media path and representative media fixture.
