## Context

`engine-kernel` currently holds service contracts, service implementations, GPU infrastructure, renderer implementations, codec/audio/export logic, and preview routing in one crate. The previous engine pipeline changes introduced useful contracts such as `PipelineOutput`, `VideoOutput`, `GpuFrameLease`, `PipelineSink`, `StreamSink`, and `MuxerSink`, but their current placement still creates architecture-level cycles.

The immediate cycle is:

```text
services ──uses──▶ gpu
   ▲               │
   │               │
   └── pipeline_sink ◀── gpu renderer output
```

GPU renderers need output DTOs, but those DTOs are defined inside `services::pipeline_sink` together with kernel-specific readback code and kernel `Error` usage. Moving that file wholesale into `engine-types` would pollute the shared type crate with `wgpu`, `GpuContext`, readback behavior, and kernel error semantics. The correct first step is to split pure contracts from implementation.

This proposal implements the P0 slice from `docs/architecture/adr-engine-kernel-decoupling.md`: move pure output contracts to `engine-types`, keep readback and sink behavior in `engine-kernel`, and add architecture checks to keep the boundary intact.

## Goals / Non-Goals

**Goals:**

- Cut the `gpu -> services` dependency caused by `services::pipeline_sink` output DTOs.
- Move pure pipeline output DTOs into `neko-engine-types` without adding implementation dependencies.
- Preserve zero-copy GPU hot path behavior and sink lifecycle behavior.
- Keep host-facing imports compatible through temporary kernel re-exports where needed.
- Add tests and architecture checks that prevent this coupling from returning.
- Record follow-up boundaries for P1/P2 without attempting a large crate split in this change.

**Non-Goals:**

- Do not extract `engine-gpu`, `engine-codec`, `engine-audio`, or renderer companion crates in this change.
- Do not move `PipelineSink` trait into `engine-types` unless a pure error contract is introduced first.
- Do not move `GpuReadbackTarget`, `wgpu::Texture`, `GpuContext`, or readback conversion logic into `engine-types`.
- Do not change user-facing HTTP, WebSocket, N-API, or TypeScript client protocols.
- Do not add CPU readback fallbacks to realtime GPU paths.

## Decisions

### Decision 1: Split output contracts from readback implementation

Move only pure output contracts into `engine-types`:

- `PipelineOutput`
- `VideoOutput`
- `AudioOutput`
- `GpuOutputHandle`
- `VideoGpuFrame`
- `VideoPreviewFrame`
- `VideoEncodedPacket`
- `VideoRawFrame`
- `AudioBuffer`
- `AudioEncodedPacket`
- `PreviewUnavailable`
- `PreviewUnavailableReason`

`FrameFormat` is already in `engine-types` and will be reused by `VideoRawFrame` and `VideoPreviewFrame`.

Keep these in `engine-kernel`:

- `GpuReadbackTarget`
- `wgpu::Texture` ownership
- `GpuContext` readback calls
- `rgba16float_to_rgba8` and related conversion helpers
- kernel `Error` and `Result`

**Rationale:** `engine-types` is the lowest shared contract crate. It must remain free of GPU, codec, runtime, and kernel implementation dependencies.

**Alternative considered:** Move all of `services/pipeline_sink.rs` to `engine-types`. Rejected because that file currently mixes pure DTOs with `wgpu`, `GpuContext`, readback behavior, and kernel errors.

### Decision 2: Keep `PipelineSink` trait in kernel for P0

For P0, keep `PipelineSink` in `engine-kernel` and update it to use DTOs from `engine-types`.

**Rationale:** The current trait returns kernel `Result<()>`. Moving it into `engine-types` would either pull kernel `Error` downward or force a broader error redesign. Keeping the trait in kernel still allows GPU renderers to stop importing `services::pipeline_sink`, which is the P0 dependency break.

**Alternative considered:** Move `PipelineSink` into `engine-types` immediately with a new `PipelineSinkError`. This remains valid for a follow-up P0b/P1 step, but is more invasive than needed to cut `gpu -> services`.

### Decision 3: Treat `GpuOutputHandle` as an identifier, not ownership

`GpuOutputHandle` in `engine-types` will document that it identifies a platform resource such as IOSurface, VA surface, or D3D texture. It does not by itself guarantee the underlying resource lifetime.

Kernel code remains responsible for providing safe ownership wrappers such as `GpuFrameLease`. Cross-thread bare handle passing is a temporary compatibility boundary and must either keep the lease alive or be replaced by passing a lease/token.

**Rationale:** Public shared DTOs must not hide unsafe lifetime assumptions. A platform handle is not a safe resource owner.

### Decision 4: Use compatibility re-exports during migration

`engine-kernel::services` may continue to re-export the moved DTOs for host and service compatibility while internal GPU code imports the DTOs directly from `neko_engine_types`.

**Rationale:** This keeps the P0 change small and avoids a broad host-api churn while still enforcing the important direction: GPU code no longer depends on services.

### Decision 5: Add lightweight architecture checks first

Add simple checks that fail if:

- `engine-kernel/src/gpu` imports `crate::services`
- `engine-kernel/src/domain` imports `crate::gpu`
- `engine-types` gains forbidden dependencies such as `wgpu`, FFmpeg, tokio runtime, or kernel crates

**Rationale:** The current violations are straightforward textual dependencies. Grep-style checks are cheap, fast, and easy to understand. A richer cargo metadata or depgraph check can follow once crate extraction starts.

## Risks / Trade-offs

- **Risk: `engine-types` becomes an implementation dumping ground** → Keep a strict forbidden dependency check and review moved APIs for side effects.
- **Risk: DTO migration accidentally changes sink behavior** → Add targeted tests for `MuxerSink`, `StreamSink`, `SnapshotSink`, and PipelineSink acceptance behavior.
- **Risk: `GpuOutputHandle` users assume ownership from a bare handle** → Document handle semantics and keep safe usage centered on `GpuFrameLease`.
- **Risk: re-exports hide incomplete migration** → Add architecture checks that target source dependencies, not just public API shape.
- **Risk: P0 does not reduce compile time much** → Accept this for P0; the value is dependency direction. Compile-time benefits come later when GPU/codec/audio implementation crates are extracted.

## Migration Plan

1. Add a new `pipeline` module to `engine-types` for pure output contracts.
2. Refactor `engine-kernel::services::pipeline_sink` to import/re-export DTOs and retain kernel-only sink/readback behavior.
3. Move or adapt `GpuFrameLease` so the shared contract portion remains pure and kernel readback remains implementation-owned.
4. Update GPU renderers, preview pipeline, export service, and sink implementations to import DTOs from the new contract location or compatibility re-export as appropriate.
5. Add tests for output DTO behavior, sink lifecycle behavior, and architecture boundaries.
6. Run targeted checks first, then full kernel tests where practical.

Rollback is straightforward: revert the DTO move and imports. Runtime protocol and persisted formats are not intended to change.

## Open Questions

- Should P0 introduce a separate `GpuFrameHandle` DTO and keep `GpuFrameLease` only in kernel, or preserve the existing `GpuFrameLease` name with a pure inner handle contract?
- Should `PipelineSinkError` be introduced in this change as groundwork for moving the trait, or deferred until P0b?
- Should `MuxerSink::flush()` be fixed to drain-and-continue in the same PR, or documented/tested as terminal behavior before a dedicated fix?
- Should `StreamSink::close()` encoder flush be fixed in the same PR if tests expose buffered frame loss?

## Follow-Up Boundaries

- P1 SHALL remove `export -> services::impls::*` by consuming sink implementations through `PipelineSink` or a smaller `ExportSink` trait.
- P1 SHALL unify the duplicated `BlendMode` definitions around `neko-engine-types` before extracting `engine-gpu`.
- P1 SHALL move `AudioEncoderConfig` into `engine-types` and keep FFmpeg/encoder helper traits with `engine-codec`.
- P3 SHALL introduce a service factory or DI container before narrowing `engine-kernel` top-level public modules used by host-api.
