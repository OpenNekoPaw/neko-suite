## 1. Crate Scaffolding

- [x] 1.1 Add `packages/neko-engine/packages/engine-codec` to the Rust workspace without creating `engine-audio`, `engine-gpu`, or renderer companion crates.
- [x] 1.2 Create `engine-codec/Cargo.toml` with only codec-required dependencies: `neko-engine-types`, FFmpeg bindings, tracing, thiserror/anyhow as needed, crossbeam/bytemuck, and platform codec dependencies.
- [x] 1.3 Add `engine-codec/src/lib.rs`, `error.rs`, `encoder/mod.rs`, and `decoder/mod.rs` with public module shape matching the current kernel codec surface.
- [x] 1.4 Define `CodecError` / `CodecResult<T>` in `engine-codec` and add kernel-side conversion into `engine-kernel::error::Error`.

## 2. Contract Placement

- [x] 2.1 Audit `EncoderConfig`, `EncodedPacket`, decoder stream metadata, and pixel-format contracts to decide which pure DTOs move to `engine-types` versus `engine-codec`.
- [x] 2.2 Move any selected pure DTOs into `engine-types` with serialization/contract tests and without adding implementation dependencies.
- [x] 2.3 Keep FFmpeg names, codec ID mappings, hardware device mappings, and pool signatures in `engine-codec`, not `engine-types`.
- [x] 2.4 Preserve `AudioEncoderConfig`, `VideoCodec`, `AudioCodec`, `ContainerFormat`, `EncoderPreset`, `HwEncoderType`, `HwAccelType`, and `PixelFormat` as canonical shared contracts from `engine-types`.

## 3. Decoder Core Migration

- [x] 3.1 Move decoder traits/common helpers from `engine-kernel/src/decoder` into `engine-codec/src/decoder`.
- [x] 3.2 Move hardware decoder implementation and platform-specific decode helpers into `engine-codec`.
- [x] 3.3 Move IDR scanner into `engine-codec` and keep codec type detection behavior unchanged.
- [x] 3.4 Move decoder pool into `engine-codec` and preserve pool config/stat behavior.
- [x] 3.5 Add kernel decoder compatibility re-exports so existing `neko_engine_kernel::decoder::*` imports continue to compile.

## 4. Encoder Core Migration

- [x] 4.1 Move encoder traits/config helpers from `engine-kernel/src/encoder` into `engine-codec/src/encoder`.
- [x] 4.2 Move hardware encoder implementation into `engine-codec` and preserve zero-copy GPU input behavior.
- [x] 4.3 Move I-frame encoder into `engine-codec`.
- [x] 4.4 Move FFmpeg muxer and muxer tests into `engine-codec`.
- [x] 4.5 Move codec extension helpers into `engine-codec`, keeping pure codec defaults in `engine-types` where already migrated.
- [x] 4.6 Move encoder pool into `engine-codec` and preserve pool signature, reuse, close, and idle cleanup behavior.
- [x] 4.7 Keep or split `engine-kernel/src/encoder/pipeline.rs` so mixed GPU-compositing orchestration remains kernel-owned while codec-only encode/mux pieces can use `engine-codec`.
- [x] 4.8 Add kernel encoder compatibility re-exports so existing `neko_engine_kernel::encoder::*` imports continue to compile.

## 5. Kernel Integration

- [x] 5.1 Update export, preview, stream sink, video, image, node, puppet, and timeline service code to consume codec APIs through `engine-codec` or kernel compatibility re-exports.
- [x] 5.2 Update `ExportSinkFactory`, `MuxerSink`, and export pipeline code to use the relocated muxer/encoder packet/config types without changing submit/flush/close/cancel behavior.
- [x] 5.3 Preserve existing unsupported-capability behavior for native GPU handle encode paths on unsupported platforms.
- [x] 5.4 Keep TypeScript, HTTP, WebSocket, N-API, and persisted project formats unchanged.

## 6. Architecture Guardrails

- [x] 6.1 Add architecture tests verifying `engine-codec/Cargo.toml` does not depend on `neko-engine-kernel`, host crates, `engine-gpu`, or `engine-audio`.
- [x] 6.2 Add source checks verifying `engine-codec/src` does not import kernel services, export, preview, domain, GPU renderer modules, or host crates.
- [x] 6.3 Add kernel source checks documenting that `encoder/pipeline.rs` is the only remaining kernel-owned mixed GPU/codec pipeline boundary after extraction.
- [x] 6.4 Keep existing `engine-types` forbidden dependency checks passing after any DTO movement.
- [x] 6.5 Document compatibility re-exports as temporary migration surface for later host facade narrowing.

## 7. Validation

- [x] 7.1 Run `cargo fmt -p neko-engine-types -p neko-engine-codec -p neko-engine-kernel`.
- [x] 7.2 Run `cargo check -p neko-engine-codec`.
- [x] 7.3 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 7.4 Run moved decoder tests in `neko-engine-codec`.
- [x] 7.5 Run moved encoder, muxer, codec extension, and pool tests in `neko-engine-codec`.
- [x] 7.6 Run targeted kernel tests for export sink factory, muxer sink lifecycle, stream sink close/flush, preview/export compile paths, and architecture checks.
- [x] 7.7 Run `cargo test -p neko-engine-codec`.
- [x] 7.8 Run `cargo test -p neko-engine-kernel` before merge, or document any platform/tooling blocker with targeted passing evidence.
- [x] 7.9 Run `openspec validate extract-engine-codec-core --strict`.
