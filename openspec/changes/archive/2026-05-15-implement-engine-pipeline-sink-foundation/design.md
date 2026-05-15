## Context

The engine has three GPU hot paths: timeline preview stream, single video stream, and export. Timeline preview currently calls `GpuExportPipeline.process_frame_to_iosurface_timed()` and immediately encodes through `HwAccelEncoder` inside `PreviewPipeline`. This couples composition to H.264 and prevents direct reuse of the GPU frame.

The foundation follows `docs/architecture/adr-engine-pipeline-sink.md` and the P0a section of `docs/architecture/adr-engine-interface-pipeline-decoupling.md`.

## Goals / Non-Goals

**Goals:**

- Define a reusable output model for GPU frames, preview frames, encoded packets, and audio buffers.
- Preserve zero-copy GPU residency through `VideoOutput::GpuFrame`.
- Move stream encoding into `StreamSink` without changing visible stream behavior.
- Add `SnapshotSink` as an explicit terminal readback path.
- Replace implicit CPU fallback in hot paths with `UnsupportedCapability`.

**Non-Goals:**

- Implement `MuxerSink`; that is deferred to `implement-engine-gpu-budget-and-muxer`.
- Implement Linux/Windows zero-copy interop; unsupported paths fail fast until platform work lands.
- Build SceneRenderer, PuppetRenderer, or PanoramicRenderer.
- Change audio mixdown semantics.

## Decisions

### Encoding Lives In Sinks

`PreviewPipeline` will return a `VideoGpuFrame`; `StreamSink` will own encoder state and convert GPU frames to stream packets.

Alternatives considered:

- Keep encoding in `PreviewPipeline`. Rejected because it preserves the existing coupling.
- CPU readback before encoding. Rejected because it violates GPU residency and adds stalls.

### PipelineSink Uses A Synchronous Trait

`PipelineSink::submit(&self, PipelineOutput)` stays synchronous. Sinks that need asynchronous work use internal bounded channels or worker tasks.

Alternatives considered:

- Async trait methods. Rejected for the 60fps path because it adds per-frame future allocation and waker overhead.

### GpuFrameLease Owns GPU Lifetime

`VideoGpuFrame` carries a cloneable `GpuFrameLease` rather than a raw `usize`. The lease must be `Send + Sync`, and in-flight sinks must keep backing resources alive until encoding or readback finishes.

Alternatives considered:

- Raw handles. Rejected because they cannot express encoder queue ownership or prevent reuse while a sink is still reading.

### Unsupported Platforms Fail Fast

macOS keeps IOSurface as the primary P0 path. Non-macOS GPU output variants may exist behind feature gates, but unresolved paths must return `UnsupportedCapability`.

Alternatives considered:

- Preserve CPU fallback on non-macOS. Rejected because it hides performance and correctness gaps.

## Risks / Trade-offs

- [Risk] Moving encoder ownership may introduce state tearing during reconfigure -> Mitigation: `StreamSink` stores encoder, config, and dimensions in one mutex and flushes before replacement.
- [Risk] A sink may keep leases after close -> Mitigation: `flush()` waits for in-flight work and `close()` releases pool resources with explicit state.
- [Risk] Removing fallback may reduce platform coverage temporarily -> Mitigation: expose explicit `UnsupportedCapability` and feature-gate future platform interop.
- [Risk] Rollback flag remains too long -> Mitigation: mark it deprecated and remove it in the P1 effect/plugin discovery change.

## Migration Plan

1. Add output contracts and `PipelineSink` trait.
2. Introduce `StreamSink` and route timeline preview through it.
3. Add `SnapshotSink` for single-frame readback.
4. Replace GPU hot path CPU fallback with `UnsupportedCapability`.
5. Keep old inline encoding behind a deprecated rollback flag only through P0 validation.
6. Roll back by flipping the temporary flag while preserving the new contracts for follow-up fixes.
