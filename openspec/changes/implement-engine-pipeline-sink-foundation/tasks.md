## 1. Output Contracts

- [x] 1.1 Add `PipelineOutput`, `VideoOutput`, `AudioOutput`, `VideoGpuFrame`, preview/raw/encoded packet DTOs, and output error variants.
- [x] 1.2 Add platform-aware `GpuOutputHandle` variants and feature-gated unsupported variants.
- [x] 1.3 Implement `GpuFrameLease` ownership semantics with clone, `Send + Sync`, drop release, and in-flight lifetime tests.
- [x] 1.4 Add the synchronous `PipelineSink` trait with `accepts`, `submit`, `flush`, and `close`.

## 2. StreamSink

- [x] 2.1 Add `StreamSink` with a single mutex containing encoder, config, dimensions, and closed state.
- [x] 2.2 Move timeline preview H.264 encoding from `PreviewPipeline` into `StreamSink`.
- [x] 2.3 Add `StreamSink::reconfigure()` with flush-before-replace and acquire-before-swap behavior.
- [x] 2.4 Route timeline preview stream output through `VideoOutput::GpuFrame` and `StreamSink`.
- [x] 2.5 Keep the temporary deprecated `use_pipeline_sink` rollback flag for P0 validation.

## 3. SnapshotSink

- [x] 3.1 Add `SnapshotSink` with oneshot result return and `Mutex<Option<Sender>>` ownership.
- [x] 3.2 Route snapshot capture through `SnapshotSink`.
- [x] 3.3 Add second-submit `AlreadyCompleted` behavior.

## 4. CPU Fallback Removal

- [x] 4.1 Change macOS export IOSurface failure to return `UnsupportedCapability` instead of falling back to NV12 CPU readback.
- [x] 4.2 Change non-macOS realtime GPU output paths to fail fast until native zero-copy interop is implemented.
- [x] 4.3 Update error mapping so callers receive actionable unsupported capability errors.

## 5. Verification

- [x] 5.1 Add unit tests for sink accept/reject behavior, lease release, snapshot completion, and stream close/flush behavior.
- [x] 5.2 Add integration coverage that timeline preview stream remains visually equivalent and timing-compatible.
- [x] 5.3 Verify SnapshotSink RGBA output against the existing CPU frame path where available.
- [x] 5.4 Run `cd packages/neko-engine && cargo test` for affected crates.
