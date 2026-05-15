## 1. Crate Scaffolding

- [x] 1.1 Add `packages/neko-engine/packages/engine-audio` to the Rust workspace without creating `engine-gpu` or renderer companion crates.
- [x] 1.2 Create `engine-audio/Cargo.toml` with only audio-required dependencies: `neko-engine-types`, `neko-engine-codec` if needed for codec extension helpers, FFmpeg bindings, tracing, thiserror/anyhow as needed, `cpal`, and `hound`.
- [x] 1.3 Add `engine-audio/src/lib.rs`, `error.rs`, `dsp/mod.rs`, and module skeletons matching the current kernel audio surface.
- [x] 1.4 Define `AudioError` / `AudioResult<T>` in `engine-audio` and add kernel-side conversion into `engine-kernel::error::Error`.

## 2. Contract Placement

- [x] 2.1 Audit `AudioInfo`, `AudioFrame`, `AudioDecoderConfig`, `AudioEncoderConfig`, DSP parameter structs, and capture config types for pure DTO versus implementation ownership.
- [x] 2.2 Keep existing `AudioEncoderConfig`, `AudioCodec`, and `SampleFormat` canonical in `engine-types`.
- [x] 2.3 Move any additional selected pure DTOs into `engine-types` only if they are shared outside audio implementation and do not add implementation dependencies.
- [x] 2.4 Keep FFmpeg names, DSP runtime state, capture runtime state, and effect factory implementation in `engine-audio`, not `engine-types`.

## 3. Audio Implementation Migration

- [x] 3.1 Move audio traits from `engine-kernel/src/audio/traits.rs` into `engine-audio`.
- [x] 3.2 Move FFmpeg audio decoder implementation into `engine-audio` and preserve decode behavior and tests.
- [x] 3.3 Move FFmpeg audio encoder implementation into `engine-audio` and preserve encode behavior and tests.
- [x] 3.4 Move `SoftLimiter` into `engine-audio`.
- [x] 3.5 Move DSP traits, effect chain, effect factory, and all built-in DSP implementations into `engine-audio`.
- [x] 3.6 Move microphone capture implementation into `engine-audio` if it can avoid kernel dependencies; otherwise leave a documented kernel-owned adapter and move pure capture DTOs only.

## 4. Kernel Compatibility And Integration

- [x] 4.1 Refactor `engine-kernel/src/audio/mod.rs` into a compatibility module that re-exports moved audio items from `engine-audio`.
- [x] 4.2 Update `AudioService`, audio mixdown, audio mix stream, export audio mixer, and related services to consume audio APIs through `engine-audio` or kernel compatibility re-exports.
- [x] 4.3 Preserve host-facing imports through `neko_engine_kernel::audio::*`.
- [x] 4.4 Keep service orchestration, task lifecycle, stream lifecycle, and export orchestration kernel-owned.
- [x] 4.5 Ensure TypeScript, HTTP, WebSocket, N-API, and persisted project formats remain unchanged.

## 5. Architecture Guardrails

- [x] 5.1 Add architecture tests verifying `engine-audio/Cargo.toml` does not depend on `neko-engine-kernel`, host crates, `engine-gpu`, services, export, or preview crates.
- [x] 5.2 Add source checks verifying `engine-audio/src` does not import kernel services, export, preview, domain orchestration, GPU renderer modules, or host crates.
- [x] 5.3 Extend existing `engine-types` forbidden dependency checks after any DTO movement.
- [x] 5.4 Document kernel audio re-exports as temporary migration surface for later host facade narrowing.

## 6. Validation

- [x] 6.1 Run `cargo fmt -p neko-engine-types -p neko-engine-audio -p neko-engine-kernel`.
- [x] 6.2 Run `cargo check -p neko-engine-audio`.
- [x] 6.3 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 6.4 Run moved audio decoder, encoder, DSP, limiter, and capture-safe tests in `neko-engine-audio`.
- [x] 6.5 Run targeted kernel tests for audio service, audio mixdown, audio mix stream, export audio mixer, and architecture checks.
- [x] 6.6 Run `cargo test -p neko-engine-audio`.
- [x] 6.7 Run `cargo test -p neko-engine-kernel` before merge, or document any platform/tooling blocker with targeted passing evidence.
- [x] 6.8 Run `openspec validate extract-engine-audio-core --strict`.
