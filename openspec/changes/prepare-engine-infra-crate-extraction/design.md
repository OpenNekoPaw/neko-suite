## Context

`decouple-engine-kernel-boundaries` completed the P0 boundary fix: shared pipeline output DTOs now live in `neko-engine-types`, GPU code no longer imports `crate::services`, and architecture tests guard that dependency direction. The remaining kernel coupling is less about one direct cycle and more about extraction blockers:

- `export/service.rs` directly constructs `services::impls::MuxerSink`, so export orchestration depends on a concrete service implementation instead of a sink boundary.
- `engine-types::BlendMode` and `gpu::compositor::BlendMode` duplicate the same 27-mode contract, forcing manual conversion and making future `engine-gpu` extraction harder.
- `AudioEncoderConfig` lives in `engine-kernel::audio` while `engine-kernel::encoder` consumes it, which ties codec and audio infrastructure together before `engine-codec` / `engine-audio` can be split.
- `engine-kernel` still publicly exposes broad implementation modules, and host-api directly imports many concrete services. That public-surface cleanup is important, but it depends on a service factory/facade and is intentionally deferred.

This change is the P0b/P1-prep step: clean misplaced contracts and concrete implementation dependencies without creating new infrastructure crates yet.

## Goals / Non-Goals

**Goals:**

- Make export orchestration consume sink construction through a small abstraction rather than directly importing `services::impls::MuxerSink`.
- Use `neko_engine_types::BlendMode` as the canonical blend-mode contract shared by domain, export, and GPU-facing code.
- Move `AudioEncoderConfig` into `neko-engine-types` as a pure DTO while keeping FFmpeg/audio implementation behavior in kernel.
- Add regression tests and architecture checks for the cleaned boundaries.
- Preserve zero-copy export behavior and existing export sink lifecycle semantics.
- Leave the codebase ready for follow-up `engine-codec`, `engine-audio`, and `engine-gpu` crate extraction proposals.

**Non-Goals:**

- Do not create `engine-codec`, `engine-audio`, or `engine-gpu` in this change.
- Do not move renderers out of `gpu/` in this change.
- Do not narrow all `engine-kernel` public modules or rewrite host-api service construction in this change.
- Do not change HTTP, WebSocket, N-API, TypeScript, or persisted project formats.
- Do not introduce CPU fallback paths for realtime or export GPU hot paths.

## Decisions

### Decision 1: Introduce an export sink construction boundary

Export needs a sink that can accept `PipelineOutput` and finalize encoded output. Today it imports `MuxerSink` directly from `services::impls`, which couples export orchestration to a service implementation module.

Introduce a small kernel-local factory boundary, for example:

```rust
pub trait ExportSinkFactory: Send + Sync {
    fn create(&self, config: PipelineConfig) -> Result<Box<dyn PipelineSink>>;
}
```

The default implementation can construct `MuxerSink`, but `ExportService` should depend on the factory or a constructor function injected at creation time. If export later needs finalize/status behavior that is not part of `PipelineSink`, introduce a narrow `ExportSink` sub-trait instead of reintroducing a dependency on `services::impls`.

**Rationale:** This removes `export -> services::impls::*` without changing the runtime pipeline. It also makes export tests able to inject fake sinks without constructing FFmpeg muxers.

**Alternative considered:** Move `MuxerSink` into `export`. Rejected for this step because `MuxerSink` is also a generic pipeline sink implementation and still belongs near sink infrastructure until `engine-codec` extraction clarifies ownership.

### Decision 2: Canonicalize `BlendMode` in `engine-types`

Use `neko_engine_types::BlendMode` as the semantic contract. GPU code may still need numeric shader values, but that mapping should be implemented as an adapter:

- `BlendMode::shader_code() -> u32`, or
- `impl From<neko_engine_types::BlendMode> for GpuBlendModeCode`, or
- a local helper that maps the contract enum to `u32`.

The duplicate `gpu::compositor::BlendMode` should be removed or reduced to a private representation that is not a separate public contract.

**Rationale:** Blend mode is a cross-layer media contract, not a GPU-only implementation detail. A single source of truth reduces conversion code before extracting `engine-gpu`.

**Alternative considered:** Keep both enums and add exhaustive conversion tests. Rejected because it preserves the duplication that blocks clean extraction.

### Decision 3: Move `AudioEncoderConfig` into `engine-types`

Move the pure config DTO to a contract module in `engine-types`, reusing existing `AudioCodec` and `SampleFormat` if they are already pure types. Kernel audio and encoder modules should import the same DTO from `neko_engine_types`.

Implementation-specific helpers stay out of `engine-types`:

- FFmpeg codec ID mapping
- `AudioCodecExt`
- encoder factory/pool behavior
- audio DSP and decoder implementations

**Rationale:** `AudioEncoderConfig` is configuration data shared by muxing, export, audio encoding, and future codec crate boundaries. Keeping it in `audio` forces codec code to depend on audio implementation.

**Alternative considered:** Move `AudioEncoderConfig` directly into a new `engine-codec` crate. Rejected because this change intentionally avoids new crate extraction and because audio callers would then depend on codec before the boundary is ready.

### Decision 4: Add source-level architecture checks for extraction blockers

Extend existing architecture tests with checks such as:

- `engine-kernel/src/export` must not import `crate::services::impls`.
- `engine-kernel/src/gpu` must not define a public duplicate `BlendMode` enum.
- `engine-kernel/src/encoder` must not import `crate::audio::AudioEncoderConfig`.

These checks should be narrow and understandable. They are not a replacement for crate-level dependency analysis after extraction begins.

**Rationale:** The previous boundary checks caught clear textual dependencies cheaply. The same style is appropriate for this prep change.

### Decision 5: Defer host facade narrowing until after service factory design

Host-api currently constructs concrete services and imports kernel internals. Narrowing `engine-kernel` public modules before adding a service factory would cause broad churn without reducing the core infrastructure coupling.

This change should document host facade narrowing as a follow-up and avoid expanding the current public surface further.

**Rationale:** The public API cleanup is real, but it is P3 work. P0b/P1-prep should remove blockers that make P1 extraction hard.

## Risks / Trade-offs

- **Risk: Factory abstraction becomes too broad** → Keep it focused on creating export sinks from `PipelineConfig`; introduce additional methods only when tests show a real export requirement.
- **Risk: BlendMode numeric mapping changes shader behavior** → Add exhaustive tests that every contract variant maps to the same numeric code used by the current shader contract.
- **Risk: Moving `AudioEncoderConfig` drags implementation types into `engine-types`** → Move only pure DTO fields and pure enums; keep FFmpeg and DSP helpers in kernel.
- **Risk: Re-exports hide incomplete migration** → Compatibility re-exports are acceptable temporarily, but architecture tests must check source dependencies rather than public API shape.
- **Risk: This prep change does not reduce kernel size immediately** → Acceptable. The value is making the next crate extraction changes small and verifiable.

## Migration Plan

1. Add or update pure contract definitions in `engine-types` for audio encoder configuration and canonical blend-mode mapping helpers.
2. Refactor GPU compositor/export/timeline conversion code to use `neko_engine_types::BlendMode` as the contract enum.
3. Refactor encoder and audio modules to import `AudioEncoderConfig` from `engine-types`.
4. Introduce the export sink factory boundary and update `ExportService` construction to use it.
5. Keep compatibility re-exports where needed for host-api and existing service imports.
6. Add architecture tests and targeted unit tests.
7. Run `cargo check -p neko-engine-kernel --lib --no-default-features`, targeted tests, `cargo test -p neko-engine-types`, and `cargo test -p neko-engine-kernel`.

Rollback is straightforward: restore direct `MuxerSink` construction and local DTO definitions. Runtime protocols and persisted formats are not intended to change.

## Follow-up Extraction Order

This prep change intentionally stops before creating new crates. The next changes should land in this order:

1. `engine-codec`: move encoder, decoder, muxer, codec extension helpers, and encoder pool behind the pure codec DTOs already in `engine-types`.
2. `engine-audio`: move audio DSP, mixdown, capture, and audio codec implementations while continuing to consume `AudioEncoderConfig` from `engine-types`.
3. `engine-gpu`: move `GpuContext`, texture/HAL/platform interop, compositor/effect dispatcher, and GPU budget after codec/audio contracts no longer depend on kernel modules.
4. Renderer companion crates: move scene, puppet, and panoramic renderers into renderer-specific crates that depend on runtime state crates plus `engine-gpu`, rather than polluting pure runtime crates with `wgpu`.
5. Host facade narrowing: add a service factory or DI facade, then stop `host-api`, `host-http`, and `host-napi` from constructing concrete kernel internals directly.

## Open Questions

- Should the export sink abstraction be named `ExportSinkFactory`, `PipelineSinkFactory`, or a smaller constructor type alias?
- Should shader numeric mapping live as a method on `engine-types::BlendMode` or as a GPU-local adapter function?
- Should `SampleFormat` move with `AudioEncoderConfig` if it is not already in `engine-types`, or should this change introduce a pure `AudioSampleFormat` contract and map it at the audio implementation boundary?
