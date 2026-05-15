## Why

`PreviewPipeline` currently owns both GPU composition and H.264 encoding, so callers cannot reuse a composited GPU frame for snapshot, alternate encoding, export routing, or analysis without encoding first. The engine also still has CPU fallback paths in GPU hot paths, which conflicts with the zero-copy GPU-only direction in the engine ADRs.

## What Changes

- Introduce a `PipelineSink` output adapter contract for stream and snapshot consumers.
- Add `PipelineOutput`, `VideoOutput`, `AudioOutput`, `VideoGpuFrame`, `GpuOutputHandle`, and `GpuFrameLease` contracts.
- Move timeline preview encoding from `PreviewPipeline` into `StreamSink`.
- Add `SnapshotSink` for explicit terminal GPU readback.
- Remove default CPU fallback behavior from GPU hot paths and return `UnsupportedCapability` when zero-copy output is unavailable.
- Keep a short-lived deprecated `use_pipeline_sink` rollback flag for P0 validation, with removal planned by the effect/plugin discovery change.

## Capabilities

### New Capabilities

- `engine-pipeline-sink-foundation`: Defines GPU-resident pipeline output contracts, stream and snapshot sinks, GPU lease ownership, and fail-fast behavior for unsupported zero-copy paths.

### Modified Capabilities

- None.

## Impact

- Affects `packages/neko-engine/packages/engine-kernel/src/preview/pipeline.rs`, `services/impls/timeline.rs`, `export/service.rs`, and new sink modules under `engine-kernel/src/services/`.
- Adds shared engine output contract types used by later SceneRenderer, PuppetRenderer, PanoramicRenderer, MuxerSink, and GPU budget work.
- Establishes the zero-copy/fail-fast rule for realtime video, scene, and puppet GPU paths.
