## Why

`export` and `preview` are still orchestration hotspots: they directly know about GPU context, codec pipeline, audio helpers, scene services, and preview providers. Before extracting GPU core, these modules need narrower backend interfaces so the later crate move is mechanical instead of a broad export/preview rewrite.

## What Changes

- Introduce focused orchestration contracts inside `engine-kernel` for export and preview backends:
  - export render/encode sink boundary for GPU-frame production and mux/encode submission
  - preview render backend boundary for routed preview frame/stream generation
  - optional scene/puppet adapter traits where direct service references remain
- Refactor `export` and `preview` code to depend on those contracts instead of directly binding every concrete GPU/codec/service implementation.
- Keep runtime behavior and wire protocols unchanged:
  - existing `GpuExportPipeline`, `PreviewPipeline`, `PreviewProviderRegistry`, and sink implementations remain kernel-owned in this change.
  - no new `engine-gpu` or renderer companion crate is created here.
- Add tests proving export/preview orchestration can inject fake backends without constructing GPU contexts or FFmpeg encoders.
- Add architecture checks that keep `export` and `preview` from regressing into direct service implementation or renderer internals where a backend boundary exists.

## Capabilities

### New Capabilities

- `engine-export-preview-orchestration-boundaries`: Defines backend contracts and guardrails that decouple export/preview orchestration from concrete GPU, codec, and service implementations.

### Modified Capabilities

- None.

## Impact

- Affected crates:
  - `packages/neko-engine/packages/engine-kernel`
  - possibly `packages/neko-engine/packages/engine-types` for pure backend request/response DTOs only
- Affected modules:
  - `engine-kernel/src/export/*`
  - `engine-kernel/src/preview/*`
  - `engine-kernel/src/services/impls/{video,timeline,scene,puppet}.rs`
  - `engine-kernel/src/services/impls/{stream_sink,muxer_sink,snapshot_sink}.rs`
  - `engine-kernel/src/architecture_tests.rs`
- Follow-up changes unblocked:
  - `prepare-engine-gpu-core-extraction`
  - `extract-engine-gpu-core`
  - renderer companion crate extraction
