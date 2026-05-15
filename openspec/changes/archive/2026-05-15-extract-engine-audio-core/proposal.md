## Why

`engine-kernel` still owns audio decoding, encoding, DSP effects, microphone capture, and mixdown helpers even after codec core extraction. Moving audio infrastructure into a focused crate is the next low-risk kernel shrink step because audio is smaller than GPU, has clear dependencies, and already shares pure contracts through `neko-engine-types`.

## What Changes

- Add a new Rust crate `packages/neko-engine/packages/engine-audio`.
- Move audio infrastructure out of `engine-kernel`:
  - audio traits, FFmpeg audio decoder/encoder, soft limiter
  - DSP effect traits, chain, factory, and built-in DSP implementations
  - microphone capture types and runtime implementation where platform dependencies permit
- Keep service orchestration in `engine-kernel`:
  - `AudioService`, stream/mixdown orchestration, task integration, and engine facade remain kernel-owned for this change.
  - Kernel `audio` module becomes a temporary compatibility re-export surface.
- Preserve `AudioEncoderConfig`, `AudioCodec`, `SampleFormat`, stream IDs, and effect capability DTOs as canonical shared contracts from `neko-engine-types`.
- Keep FFmpeg codec mapping and runtime DSP factory helpers in `engine-audio`, not `engine-types`.
- Add architecture checks preventing `engine-audio` from depending on `engine-kernel`, host crates, services, export, preview, GPU renderer modules, or future `engine-gpu`.
- No TypeScript, HTTP, WebSocket, N-API protocol, persisted format, or user-facing behavior changes are intended.

## Capabilities

### New Capabilities

- `engine-audio-core-extraction`: Defines the audio crate boundary, compatibility contracts, dependency guardrails, and behavioral invariants for extracting audio infrastructure from `engine-kernel`.

### Modified Capabilities

- None.

## Impact

- Affected crates:
  - `packages/neko-engine/packages/engine-audio` (new)
  - `packages/neko-engine/packages/engine-kernel`
  - `packages/neko-engine/packages/engine-types`
  - host crates only if compatibility imports require cleanup
- Affected modules:
  - `engine-kernel/src/audio/*`
  - `engine-kernel/src/services/impls/audio.rs`
  - `engine-kernel/src/services/audio_mixdown.rs`
  - `engine-kernel/src/services/impls/audio_mix_stream.rs`
  - `engine-kernel/src/export/audio_mixer.rs`
  - `engine-kernel/src/architecture_tests.rs`
  - workspace `Cargo.toml` files
- Follow-up changes unblocked:
  - export/preview orchestration decoupling
  - `engine-gpu` core extraction
  - host facade narrowing
