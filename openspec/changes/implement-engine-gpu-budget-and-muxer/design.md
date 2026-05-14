## Context

All GPU paths share one `Arc<GpuContext>`, and wgpu queues work internally without application-level priority. Encoder/decoder pools provide coarse limits, but GPU composition, rendering, and preview work can still compete with interactive editing. Export currently also has direct async pipeline calls instead of a `PipelineSink` adapter.

## Goals / Non-Goals

**Goals:**

- Add a soft GPU budget controller based on frame-time feedback.
- Protect `Interactive` pipelines from `Export` and `Transcode` pressure.
- Pause transcode/preview-provider GPU work instead of using CPU fallback.
- Add fair export queuing under pressure.
- Move export submission through `MuxerSink`.

**Non-Goals:**

- Query actual GPU utilization; wgpu does not expose it.
- Implement resolution or frame-rate degradation in P2.
- Serialize all GPU work behind a hard mutex.
- Implement PuppetRenderer or PanoramicRenderer.

## Decisions

### Frame-Time Feedback

The controller uses interactive frame-time EMA, weighted global EMA, and queue completion delay as pressure signals.

Alternatives considered:

- GPU utilization metrics. Rejected because wgpu does not provide them portably.

### Soft Permit Controller

Pipelines call `acquire_permit(pipeline_id, priority)` before render loop work. `Interactive` always proceeds; `Export` may queue fairly; `Transcode` may pause until notified.

Alternatives considered:

- Hard-lock `GpuContext`. Rejected because it would destroy useful GPU/CPU concurrency.

### Pause Rather Than CPU Fallback

Under pressure, transcode and GPU preview providers pause or return busy. They do not switch to CPU encode/render.

Alternatives considered:

- CPU fallback. Rejected because it often retains GPU work and adds readback stalls.

### MuxerSink Owns Export Worker Boundary

`MuxerSink` implements the synchronous sink front end and uses a bounded channel to an async encoding/muxing worker. `flush()` and `close()` wait for acknowledgements.

Alternatives considered:

- Keep `ExportService` calling async pipeline internals. Rejected because it keeps export outside the sink contract.

## Risks / Trade-offs

- [Risk] Budget misclassification pauses work unnecessarily -> Mitigation: require sustained threshold crossings and use hysteresis.
- [Risk] Export queue fairness reduces export throughput -> Mitigation: only queue under pressure and preserve FIFO fairness.
- [Risk] `MuxerSink::flush()` deadlocks if worker ack is missed -> Mitigation: model flush/close as explicit oneshot ack commands with tests.

## Migration Plan

1. Add budget controller and priority types.
2. Integrate permit acquisition in timeline, video, and export loops.
3. Add pause/resume and export queue tests.
4. Add `MuxerSink` and route export through it.
5. Add preview busy response contracts for GPU providers.
6. Roll back by disabling budget enforcement while keeping instrumentation and sink wiring.
