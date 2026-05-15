## Why

Once GPU output is sink-based, the engine needs a resource governance layer to protect interactive previews from export, transcode, and preview-provider GPU contention. Export also needs a sink-backed `MuxerSink` so encoding/muxing follows the same output adapter architecture as stream and snapshot.

## What Changes

- Add `GpuBudgetController`, `PipelinePriority`, and per-pipeline frame-time EMA tracking.
- Add permit lifecycle semantics for `Proceed`, `Queued`, and `Paused`.
- Add export fairness and transcode pause/resume behavior with hysteresis.
- Implement `MuxerSink` as the export sink over an internal async worker.
- Route `ExportService` through `MuxerSink`.
- Add preview GPU busy handling for later preview providers.

## Capabilities

### New Capabilities

- `engine-gpu-budget-and-muxer`: Defines GPU budget permit behavior, export/transcode prioritization, preview busy responses, and sink-based export muxing.

### Modified Capabilities

- None.

## Impact

- Affects `engine-kernel/src/gpu/`, `services/impls/timeline.rs`, `services/impls/video.rs`, and `export/service.rs`.
- Adds `engine-kernel/src/services/impls/muxer_sink.rs`.
- Provides a prerequisite for PuppetRenderer, PanoramicRenderer GPU preview work, and P3 export integrations.
