## Context

The previous boundary work moved shared pipeline DTOs and pure codec-related contracts into `neko-engine-types`, then removed the worst `gpu -> services` and `export -> services::impls` couplings. The next extraction blocker is codec infrastructure: `engine-kernel` still contains roughly 5,900 lines of encoder/decoder code plus FFmpeg and hardware codec integration.

Current codec code is not uniformly separable:

- `encoder/{traits,codec_ext,hwaccel,iframe,muxer,pool}.rs` and `decoder/{traits,common,hwaccel,idr_scanner,pool}.rs` are codec infrastructure and can move together.
- `encoder/pipeline.rs` is a mixed GPU/export pipeline. It depends on `GpuContext`, `GpuCompositor`, and GPU layer types, so it must stay in `engine-kernel` for this change.
- `export/service.rs`, `stream_sink.rs`, and several service implementations consume codec types but should not own codec implementation.
- `host-api` and `host-napi` still import some codec internals through `neko_engine_kernel`; compatibility re-exports are needed until host facade narrowing lands.

This is a P1 extraction step from `docs/architecture/adr-engine-kernel-decoupling.md`: create a real infrastructure crate for codec implementation while avoiding a broad export/GPU rewrite.

## Goals / Non-Goals

**Goals:**

- Create `neko-engine-codec` as the owner of FFmpeg-backed encoder, decoder, muxer, packet/config traits, codec extension helpers, and codec pools.
- Keep codec contracts shared by audio/export/preview/kernel in `neko-engine-types` where they are pure DTOs.
- Preserve the existing `neko_engine_kernel::encoder::*` and `neko_engine_kernel::decoder::*` import surface through compatibility modules/re-exports.
- Keep GPU compositing and export orchestration in `engine-kernel`.
- Prevent `engine-codec` from depending on `engine-kernel`, kernel services, export, preview, domain, GPU renderers, or host crates.
- Preserve zero-copy GPU encoder behavior for existing macOS VideoToolbox paths and explicit unsupported-capability errors elsewhere.

**Non-Goals:**

- Do not extract `engine-audio` or `engine-gpu` in this change.
- Do not move `encoder/pipeline.rs` or `GpuExportPipeline` out of kernel.
- Do not redesign HTTP, WebSocket, N-API, TypeScript client contracts, or persisted project formats.
- Do not remove all host-api imports of kernel internals; only avoid new ones and keep compatibility.
- Do not introduce CPU readback fallback for realtime/export GPU paths.

## Decisions

### Decision 1: Extract codec implementation into `engine-codec`

Create `packages/neko-engine/packages/engine-codec` with modules mirroring the current codec boundary:

```text
engine-codec/src/
  error.rs
  encoder/
    traits.rs
    codec_ext.rs
    hwaccel.rs
    iframe.rs
    muxer.rs
    pool.rs
  decoder/
    traits.rs
    common.rs
    hwaccel.rs
    idr_scanner.rs
    pool.rs
```

`engine-codec` depends on `engine-types`, FFmpeg, crossbeam, bytemuck, tracing, tokio-util if still needed by moved code, and platform codec dependencies. It does not depend on `engine-kernel`.

**Rationale:** This turns codec into a reusable infrastructure crate and lets kernel become a consumer/orchestrator.

**Alternative considered:** Leave implementation in kernel and only add more facade types. Rejected because compile and dependency boundaries remain unenforced.

### Decision 2: Keep GPU export pipeline in kernel

`encoder/pipeline.rs` currently combines encode/mux workers with GPU compositing types. Moving it directly into `engine-codec` would force `engine-codec` to depend on GPU/context/compositor types and recreate the broad coupling this extraction is trying to remove.

For this change:

- move the pure encode/mux pieces to `engine-codec`;
- keep `AsyncExportPipeline`, `PipelineConfig`, `PipelineFrame`, `CompositedFrame`, and `PipelineProgress` in kernel if they still depend on GPU/export orchestration;
- or split only the encode-only backend if it can be done without GPU dependencies.

**Rationale:** A smaller clean extraction is better than an `engine-codec` crate that secretly becomes `engine-kernel-lite`.

**Alternative considered:** Move `encoder/pipeline.rs` wholesale and let `engine-codec` depend on `engine-gpu` later. Rejected because `engine-gpu` does not exist yet and this would front-load GPU coupling.

### Decision 3: Use compatibility re-exports in kernel

Keep `engine-kernel/src/encoder/mod.rs` and `engine-kernel/src/decoder/mod.rs` as compatibility modules that re-export codec crate types and retain kernel-owned pipeline adapters. Existing imports such as:

```rust
use neko_engine_kernel::encoder::{EncoderConfig, HwAccelEncoder};
use neko_engine_kernel::decoder::{HwAccelDecoder, PixelFormat};
```

should continue to compile during this migration.

**Rationale:** Host facade narrowing is P3 work. This P1 change should not force a broad host-api rewrite.

**Alternative considered:** Update all host crates to depend on `engine-codec` immediately. Rejected for this step because it expands blast radius and creates public API churn before facade design.

### Decision 4: Introduce codec-local error and map at kernel boundary

`engine-codec` should define `CodecError` / `CodecResult<T>` rather than importing `engine-kernel::Error`. Kernel modules map codec errors into kernel `Error` via `From<neko_engine_codec::CodecError> for crate::error::Error`.

The codec error type must preserve existing categories enough for callers to keep behavior:

- FFmpeg failures
- unsupported codec/container
- hardware encoder/decoder unavailable
- encode/decode/mux failures
- unsupported native GPU handle/input
- cancellation/already-completed where codec workers currently expose it

**Rationale:** Downward dependency on kernel error would invert the crate boundary.

**Alternative considered:** Use `anyhow::Error` across the crate boundary. Rejected because it weakens typed error behavior and makes architecture tests less meaningful.

### Decision 5: Move pure codec DTOs only when needed

`VideoCodec`, `AudioCodec`, `ContainerFormat`, `EncoderPreset`, `HwEncoderType`, `HwAccelType`, `PixelFormat`, and `AudioEncoderConfig` already live in `engine-types`. This change should move additional pure DTOs only if required to break dependencies, likely:

- `EncoderConfig`
- `EncodedPacket`
- possibly decoder stream metadata structs if they are pure and shared

Implementation helpers such as FFmpeg names, codec IDs, hardware device mapping, and pool signatures stay in `engine-codec`.

**Rationale:** `engine-types` remains a contract crate, not an implementation helper crate.

**Alternative considered:** Put all moved types into `engine-codec`. Rejected for pure DTOs consumed by export, preview, host, or audio because it would force non-codec callers to depend on implementation.

### Decision 6: Add crate-level architecture checks

Add lightweight tests or scripts that verify:

- `engine-codec/Cargo.toml` does not depend on `neko-engine-kernel`, host crates, or future `engine-gpu` / `engine-audio`.
- source under `engine-codec/src` does not import `neko_engine_kernel`, `crate::services`, `crate::export`, `crate::preview`, or `crate::domain`.
- `engine-kernel/src/encoder/pipeline.rs` is the only remaining kernel-owned mixed GPU/codec pipeline module after extraction.

**Rationale:** The previous source-level architecture tests have been effective and are appropriate for incremental extraction.

## Risks / Trade-offs

- **FFmpeg/platform feature mismatch** → Mirror existing kernel codec dependencies and features first; only simplify features after tests pass.
- **Large move creates noisy diffs** → Prefer file moves preserving module names and public item names; avoid opportunistic refactors.
- **Compatibility re-exports hide remaining coupling** → Pair re-exports with source-level guardrails and document them as temporary migration surface.
- **`engine-codec` accidentally gains GPU dependencies** → Keep `encoder/pipeline.rs` in kernel and reject GPU/context imports in architecture tests.
- **Error mapping loses behavior** → Add unit tests for representative unsupported codec/container/hardware and unsupported GPU input errors.
- **Zero-copy lifetime assumptions remain subtle** → Do not alter `GpuOutputHandle` semantics in this change; preserve existing synchronous encode paths and tests.

## Migration Plan

1. Create `engine-codec` crate and add it to the workspace.
2. Add `CodecError` and dependency scaffolding.
3. Move decoder core modules and tests into `engine-codec`.
4. Move encoder core modules and tests into `engine-codec`, excluding `encoder/pipeline.rs` unless a GPU-free encode-only split is straightforward.
5. Add kernel compatibility modules/re-exports and `From<CodecError>` mapping.
6. Update kernel consumers to compile against codec crate types through either direct imports or compatibility re-exports.
7. Add architecture tests for the new crate boundary.
8. Run targeted codec tests, then `cargo test -p neko-engine-codec`, `cargo test -p neko-engine-kernel`, and relevant host checks.

Rollback is straightforward: remove the workspace member and restore the moved files to `engine-kernel`. Runtime protocols and persisted formats are not intended to change.

## Open Questions

- Should `EncoderConfig` and `EncodedPacket` move to `engine-types` in this change, or remain exported from `engine-codec` with kernel compatibility re-exports?
- Should `AsyncExportPipeline` be split into a GPU-free encode/mux worker in `engine-codec` plus kernel GPU orchestration, or should that be deferred to export/preview orchestration cleanup?
- Should host-api begin depending on `engine-codec` for node hardware detection now, or continue through kernel re-exports until the facade narrowing proposal?
