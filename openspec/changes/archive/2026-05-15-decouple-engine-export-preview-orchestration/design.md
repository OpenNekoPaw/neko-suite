## Context

`engine-codec` has been extracted and audio extraction is planned, but export and preview still aggregate many concrete implementations. `export/service.rs`, `export/gpu_export_pipeline.rs`, and `preview/pipeline.rs` import GPU context, codec pipeline types, audio helpers, scene service types, and sink implementations through kernel compatibility surfaces. That is acceptable for current behavior, but it makes `engine-gpu` extraction risky because export/preview would need a large simultaneous rewrite.

This change introduces smaller backend contracts inside kernel before moving GPU code. It keeps runtime behavior unchanged while making export and preview depend on stable orchestration boundaries instead of concrete infrastructure classes everywhere.

## Goals / Non-Goals

**Goals:**

- Define focused export and preview backend traits for render, encode, sink, and provider orchestration seams.
- Refactor export/preview call sites to accept injectable backends where direct concrete construction currently blocks testing or crate extraction.
- Preserve current `GpuExportPipeline`, `PreviewPipeline`, provider registry, and sink behavior.
- Add tests that use fake backends without GPU/FFmpeg construction.
- Add architecture checks preventing direct imports of service implementations or renderer internals when a backend boundary exists.

**Non-Goals:**

- Do not create `engine-gpu`.
- Do not move scene, puppet, panoramic, or preview renderers.
- Do not change HTTP, WebSocket, N-API, TypeScript, or persisted formats.
- Do not alter zero-copy semantics or add CPU fallback.
- Do not fully narrow host-api facade in this change.

## Decisions

### Decision 1: Add orchestration traits inside kernel first

Create small traits under export/preview modules rather than a new crate. Candidate boundaries include `ExportRenderBackend`, `ExportEncodeBackend`, `ExportSinkFactory`, `PreviewRenderBackend`, and `PreviewProviderBackend`.

**Rationale:** These boundaries are still kernel orchestration contracts. Moving them into a new crate before their shape stabilizes would create extra API churn.

**Alternative considered:** Move export/preview into separate crates immediately. Rejected because they still depend on kernel domain/service state.

### Decision 2: Keep concrete implementations as adapters

Wrap existing `GpuExportPipeline`, `AsyncExportPipeline`, `PreviewPipeline`, and provider registry behavior behind adapters. The adapters should preserve current constructors and behavior.

**Rationale:** Adapter-first refactoring reduces behavioral risk and makes fake testing possible.

**Alternative considered:** Rewrite export/preview pipelines around the new traits. Rejected because this proposal is about boundary preparation, not pipeline redesign.

### Decision 3: Separate request/response DTOs from runtime handles

Pure request/response DTOs can live in `engine-types` if they are shared. Runtime handles such as GPU contexts, encoder instances, pipeline workers, and readback targets stay in kernel or infrastructure crates.

**Rationale:** This keeps `engine-types` pure while giving later crate extraction stable contracts.

### Decision 4: Preserve sink behavior

Existing sink lifecycle semantics, including MuxerSink flush behavior and StreamSink close flush behavior, must remain covered by tests. This change may rearrange construction paths but must not alter submit/flush/close/cancel behavior.

**Rationale:** Export/preview decoupling touches the same paths that preserve zero-copy output and encoded packet ordering.

## Risks / Trade-offs

- **Too many traits create ceremony** -> Keep traits focused on construction seams that tests or future extraction need.
- **Backend boundaries leak concrete GPU types** -> Use DTOs and trait methods that isolate concrete handles behind adapters where practical.
- **Accidental behavior drift** -> Add fake-backend tests plus existing full pipeline tests.
- **Architecture tests overfit file names** -> Check forbidden dependency patterns and document allowed exceptions.

## Migration Plan

1. Inventory direct concrete construction in export/preview.
2. Define minimal backend traits and default adapters.
3. Refactor export service, preview pipeline, and relevant services to accept adapters.
4. Add fake backend tests for export and preview orchestration.
5. Add architecture guardrails for direct implementation imports.
6. Run targeted export/preview/sink tests, full kernel tests, and OpenSpec validation.

Rollback: remove the adapter layer and restore direct construction. No protocol or persisted format changes are intended.

## Open Questions

- Should export and preview share one render backend trait, or keep separate traits for different lifecycle needs?
- Should `GpuExportPipeline` be split into render-only and encode-only pieces in this change, or left for GPU extraction?
- Which preview provider DTOs are pure enough to move to `engine-types`?
