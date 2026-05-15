## Context

`engine-codec` now owns codec implementation, while `engine-kernel` still owns roughly 3.5K lines of audio infrastructure. The audio code includes FFmpeg audio decoder/encoder, DSP effect primitives, effect factory, microphone capture, and soft limiter. Kernel services use those pieces for audio analysis, transcoding, stream mixdown, and export audio rendering.

The audio boundary is a good next extraction because the pure DTOs already live in `neko-engine-types` (`AudioCodec`, `SampleFormat`, `AudioEncoderConfig`) and the implementation surface is smaller than GPU. The extraction must preserve current host imports through kernel compatibility re-exports until facade narrowing lands.

## Goals / Non-Goals

**Goals:**

- Create `neko-engine-audio` as the owner of audio codec, DSP, capture, and limiter infrastructure.
- Keep kernel-owned service orchestration, task integration, export orchestration, and streaming lifecycle in `engine-kernel`.
- Preserve existing `neko_engine_kernel::audio::*` imports through compatibility re-exports.
- Keep pure audio contracts in `neko-engine-types`.
- Prevent `engine-audio` from depending on kernel, host, services, export, preview, GPU, or renderer modules.
- Preserve current audio analysis, transcode, mixdown, stream, and export behavior.

**Non-Goals:**

- Do not extract `services/audio_mixdown.rs` wholesale if it still depends on kernel domain timeline or service state.
- Do not redesign audio project formats, HTTP routes, WebSocket behavior, N-API types, or TypeScript APIs.
- Do not introduce new audio DSP algorithms beyond moving existing implementations.
- Do not remove kernel compatibility re-exports in this change.

## Decisions

### Decision 1: Extract implementation, keep orchestration in kernel

Move codec/DSP/capture primitives to `engine-audio`, but keep `AudioService`, `AudioMixdown` orchestration, stream-loop integration, export job wiring, and task service integration in kernel unless a file proves to be infrastructure-only.

**Rationale:** Service orchestration still depends on domain timeline, task lifecycle, stream state, and kernel errors. Moving it too early would make `engine-audio` depend back on kernel concepts.

**Alternative considered:** Move all `audio/` and `services/audio_mixdown.rs` together. Rejected because it risks pulling domain/service dependencies into the new crate.

### Decision 2: Define `AudioError` and map at kernel boundary

`engine-audio` defines `AudioError` / `AudioResult<T>`. Kernel maps audio errors into `engine-kernel::Error` using `From<neko_engine_audio::AudioError>`.

**Rationale:** Importing kernel errors into `engine-audio` would invert the dependency direction.

**Alternative considered:** Use `anyhow::Error` across the boundary. Rejected because it weakens typed error categories and makes guardrails less meaningful.

### Decision 3: Use kernel compatibility re-exports

`engine-kernel/src/audio/mod.rs` re-exports `engine-audio` modules and types for the migration period. Host-api can keep importing `neko_engine_kernel::audio::*`.

**Rationale:** Host facade narrowing is a later change. This extraction should not force a broad host rewrite.

**Alternative considered:** Update host-api to depend on `engine-audio` immediately. Rejected because it expands the blast radius and makes the public API shape less controlled.

### Decision 4: Keep FFmpeg and DSP helpers out of `engine-types`

`engine-types` remains the pure DTO crate. Audio sample format, codec enum, and encoder config stay there; FFmpeg names, decoder/encoder implementations, effect factories, and runtime DSP state live in `engine-audio`.

**Rationale:** Contract crates must not inherit implementation dependencies.

### Decision 5: Platform capture dependencies belong to `engine-audio`

`cpal`, `hound`, and capture-specific runtime state move with microphone capture if the file moves. Kernel services call capture through re-exported types or focused adapter APIs.

**Rationale:** Capture is audio infrastructure, not orchestration.

## Risks / Trade-offs

- **Audio mixdown has mixed responsibilities** -> Start by moving primitives; only move mixdown code if dependencies are pure or can be inverted through small traits.
- **Error category drift** -> Add tests for representative decode, encode, DSP factory, capture, and invalid input errors.
- **Host imports hide remaining coupling** -> Keep compatibility re-exports temporary and add architecture tests documenting that host facade narrowing is still pending.
- **FFmpeg/cpal feature mismatch** -> Mirror existing dependencies first; simplify only after tests pass.
- **Behavior changes in DSP stateful effects** -> Move tests with the code and run stateful effect processing tests after migration.

## Migration Plan

1. Add `engine-audio` crate and workspace dependency.
2. Add `AudioError` and module skeleton.
3. Move audio traits, decoder, encoder, soft limiter, DSP modules, and microphone capture into `engine-audio`.
4. Refactor moved code to use `engine-types` and `engine-codec` directly where needed.
5. Add kernel re-exports and `From<AudioError>` mapping.
6. Update kernel services/export/audio mixdown imports through compatibility paths.
7. Add architecture guardrails for `engine-audio`.
8. Run audio crate tests, targeted kernel audio/export tests, full kernel tests, and OpenSpec validation.

Rollback is straightforward: remove the workspace member and restore the moved files under `engine-kernel/src/audio`. Runtime protocols and persisted formats are unchanged.

## Open Questions

- Should `services/audio_mixdown.rs` remain fully kernel-owned in this change, or can a pure `AudioMixdownEngine` be split into `engine-audio` behind a kernel adapter?
- Should microphone capture move now, or stay kernel-owned until device/runtime extraction boundaries are revisited?
- Should host-api eventually depend on `engine-audio` for pure audio info types, or only through a kernel facade?
