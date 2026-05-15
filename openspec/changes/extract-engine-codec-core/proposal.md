## Why

`engine-kernel` still owns nearly all codec infrastructure: FFmpeg decoder, hardware encoder, muxer, codec extension helpers, encoder/decoder pools, and packet/config contracts. This keeps codec implementation changes coupled to kernel, blocks the next `engine-audio` / `engine-gpu` extractions, and leaves host-api tempted to import kernel internals directly.

This change extracts codec core into a focused `engine-codec` crate while preserving current kernel APIs through compatibility re-exports and adapters.

## What Changes

- Add a new Rust crate `packages/neko-engine/packages/engine-codec`.
- Move codec-core implementation out of `engine-kernel`:
  - encoder traits/configs, hardware encoder, I-frame encoder, muxer, codec extension helpers, encoder pool
  - decoder traits/common code, hardware decoder, IDR scanner, decoder pool
- Keep GPU-compositing export pipeline orchestration in `engine-kernel` for this change:
  - `engine-kernel/src/encoder/pipeline.rs` remains kernel-owned until `engine-gpu` / export orchestration boundaries are ready.
- Add kernel compatibility re-exports so existing host-api and service code can continue importing `neko_engine_kernel::encoder::*` / `decoder::*` during migration.
- Update kernel export, stream, video, image, node, and preview code to consume codec APIs through the new crate or kernel re-export without changing runtime behavior.
- Add architecture checks preventing `engine-codec` from depending on `engine-kernel`, `engine-gpu`, `services`, `export`, `preview`, `domain`, or host crates.
- Preserve zero-copy behavior: GPU handles are accepted by codec APIs where already supported, and unsupported native interop continues to return explicit unsupported capability errors rather than adding CPU fallback.
- No TypeScript, HTTP, WebSocket, N-API protocol, persisted format, or user-facing behavior changes are intended.

## Capabilities

### New Capabilities

- `engine-codec-core-extraction`: Defines the codec crate boundary, compatibility contracts, dependency guardrails, and behavioral invariants for extracting codec core from `engine-kernel`.

### Modified Capabilities

- None.

## Impact

- Affected crates:
  - `packages/neko-engine/packages/engine-codec` (new)
  - `packages/neko-engine/packages/engine-kernel`
  - `packages/neko-engine/packages/engine-types`
  - `packages/neko-engine/packages/host-api` / `host-napi` only if compatibility imports require cleanup
- Affected modules:
  - `engine-kernel/src/encoder/*`
  - `engine-kernel/src/decoder/*`
  - `engine-kernel/src/export/*`
  - `engine-kernel/src/services/impls/{stream_sink,video,image,node,puppet,timeline}.rs`
  - `engine-kernel/src/architecture_tests.rs`
  - workspace `Cargo.toml` files
- Follow-up changes unblocked:
  - `extract-engine-audio-core`
  - `prepare-engine-gpu-core-extraction`
  - export/preview orchestration decoupling
  - host facade narrowing
