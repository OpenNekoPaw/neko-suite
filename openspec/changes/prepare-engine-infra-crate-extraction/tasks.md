## 1. Audio Encoder Contract Extraction

- [x] 1.1 Add or move a pure `AudioEncoderConfig` DTO into `neko-engine-types`, reusing existing pure `AudioCodec` and sample-format contracts where possible.
- [x] 1.2 Re-export `AudioEncoderConfig` from `engine-types/src/lib.rs` and add contract unit tests for defaults, bitrate override, and sample-format override.
- [x] 1.3 Refactor `engine-kernel/src/audio` to import the moved `AudioEncoderConfig` without changing encoder behavior.
- [x] 1.4 Refactor `engine-kernel/src/encoder` and export pipeline code to import the moved `AudioEncoderConfig` without depending on `crate::audio`.
- [x] 1.5 Keep FFmpeg codec mapping, audio DSP, encoder pools, and implementation helpers out of `engine-types`.

## 2. Blend Mode Contract Unification

- [x] 2.1 Make `neko_engine_types::BlendMode` the canonical semantic blend-mode type for compositor-facing layer contracts.
- [x] 2.2 Replace the public duplicate `gpu::compositor::BlendMode` enum with the canonical type or a private GPU adapter representation.
- [x] 2.3 Add exhaustive tests that map all canonical blend-mode variants to the existing shader numeric codes.
- [x] 2.4 Refactor export, timeline, compositor, and renderer call sites to remove manual duplicate-enum conversion helpers.
- [x] 2.5 Preserve existing blend-mode parsing behavior, including `"add"` mapping to linear dodge.

## 3. Export Sink Boundary

- [x] 3.1 Introduce an export sink construction boundary such as `ExportSinkFactory` or a focused constructor abstraction.
- [x] 3.2 Add the default factory implementation that creates the current muxer-backed sink from `PipelineConfig`.
- [x] 3.3 Refactor `ExportService` so it depends on the factory/boundary instead of importing `crate::services::impls::muxer_sink::MuxerSink`.
- [x] 3.4 Add tests showing export orchestration can inject a fake sink factory without constructing an FFmpeg muxer.
- [x] 3.5 Preserve existing `PipelineSink` submit, flush, close, and zero-copy unsupported-capability behavior.

## 4. Architecture Guardrails

- [x] 4.1 Extend architecture tests so `engine-kernel/src/export` cannot import `crate::services::impls`.
- [x] 4.2 Extend architecture tests so `engine-kernel/src/encoder` cannot import `crate::audio::AudioEncoderConfig`.
- [x] 4.3 Extend architecture tests so GPU compositor code cannot expose a duplicate public `BlendMode` enum.
- [x] 4.4 Keep the existing `engine-types` forbidden-dependency check passing after the new DTO move.
- [x] 4.5 Record follow-up extraction order for `engine-codec`, `engine-audio`, `engine-gpu`, renderer companion crates, and host facade narrowing.

## 5. Validation

- [x] 5.1 Run `cargo fmt -p neko-engine-types -p neko-engine-kernel`.
- [x] 5.2 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 5.3 Run targeted tests for `engine-types` audio config and blend-mode contracts.
- [x] 5.4 Run targeted kernel tests for export sink factory, compositor blend mapping, encoder muxer audio config, and architecture checks.
- [x] 5.5 Run `cargo test -p neko-engine-types`.
- [x] 5.6 Run `cargo test -p neko-engine-kernel` before merge, or document any platform/tooling blocker.
- [x] 5.7 Confirm no new `engine-codec`, `engine-audio`, `engine-gpu`, or renderer companion crates are created by this prep change.
