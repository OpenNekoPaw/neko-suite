## Why

The previous kernel boundary change removed the immediate `gpu -> services` cycle, but `engine-kernel` still exposes and hosts GPU, codec, audio, export, preview, and service implementations in one broad crate. Before extracting `engine-codec`, `engine-audio`, and `engine-gpu`, the remaining misplaced contracts and concrete implementation dependencies need to be cleaned up so crate extraction is mechanical rather than risky.

## What Changes

- Remove direct `export -> services::impls::*` coupling by introducing an export sink construction boundary instead of instantiating `MuxerSink` inside export orchestration.
- Unify duplicated `BlendMode` definitions around `neko-engine-types`, keeping GPU-specific numeric/shader mapping as an adapter rather than a second contract enum.
- Move `AudioEncoderConfig` into `neko-engine-types` so audio and codec infrastructure can share the same pure configuration DTO without depending on each other.
- Add architecture checks that prevent the cleaned boundaries from regressing.
- Record extraction-ready boundaries for follow-up changes: `engine-codec`, `engine-audio`, `engine-gpu`, renderer companion crates, and host facade narrowing.
- No user-facing protocol or TypeScript API changes are intended.

## Capabilities

### New Capabilities

- `engine-infra-extraction-prep`: Defines the contract cleanup and guardrails required before extracting engine infrastructure crates from `engine-kernel`.

### Modified Capabilities

None.

## Impact

- Affected crates:
  - `packages/neko-engine/packages/engine-types`
  - `packages/neko-engine/packages/engine-kernel`
  - potentially `packages/neko-engine/packages/host-api` only for compatibility import cleanup if needed
- Affected modules:
  - `engine-types/src/effects.rs`
  - `engine-types/src/codec.rs` or a new pure audio/codec contract module
  - `engine-kernel/src/gpu/compositor.rs`
  - `engine-kernel/src/audio/traits.rs`
  - `engine-kernel/src/encoder/*`
  - `engine-kernel/src/export/service.rs`
  - `engine-kernel/src/services/impls/muxer_sink.rs`
  - `engine-kernel/src/architecture_tests.rs`
- This change is structural. It should preserve runtime behavior, zero-copy output paths, and existing export semantics while reducing coupling.
