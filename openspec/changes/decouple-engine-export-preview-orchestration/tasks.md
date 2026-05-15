## 1. Boundary Inventory

- [x] 1.1 Inventory direct concrete construction and imports in `engine-kernel/src/export`.
- [x] 1.2 Inventory direct concrete construction and imports in `engine-kernel/src/preview`.
- [x] 1.3 Identify which request/response DTOs are pure enough for `engine-types` and which runtime handles must stay kernel-owned.
- [x] 1.4 Document allowed temporary exceptions where export/preview still need concrete adapters.

## 2. Export Backend Contracts

- [x] 2.1 Introduce focused export backend traits for render, encode, and sink construction seams.
- [x] 2.2 Add default export backend adapters that delegate to existing `GpuExportPipeline`, `AsyncExportPipeline`, and sink implementations.
- [x] 2.3 Refactor `ExportService` and export orchestration to accept backend adapters without changing public constructors or production behavior.
- [x] 2.4 Preserve `ExportSinkFactory` behavior and existing fake sink injection tests.
- [x] 2.5 Add tests proving export orchestration can use fake render/encode/sink backends without constructing GPU context or FFmpeg muxer.

## 3. Preview Backend Contracts

- [x] 3.1 Introduce focused preview backend traits for render/provider routing seams.
- [x] 3.2 Add default preview backend adapters that delegate to existing `PreviewPipeline`, provider registry, and renderer-backed paths.
- [x] 3.3 Refactor preview pipeline and relevant services to accept backend adapters without changing production behavior.
- [x] 3.4 Add tests proving preview routing can use fake render/provider backends without constructing renderer internals.
- [x] 3.5 Preserve unavailable-preview behavior and provider selection semantics.

## 4. Sink And Zero-Copy Semantics

- [x] 4.1 Preserve MuxerSink submit, flush, close, cancel, and unsupported-output behavior after backend injection refactors.
- [x] 4.2 Preserve StreamSink close flush behavior and unsupported-output behavior after backend injection refactors.
- [x] 4.3 Preserve SnapshotSink terminal readback behavior after backend injection refactors.
- [x] 4.4 Ensure no export or preview path adds CPU readback fallback for GPU-resident hot paths.

## 5. Architecture Guardrails

- [x] 5.1 Add architecture checks so `engine-kernel/src/export` cannot import `crate::services::impls`.
- [x] 5.2 Add architecture checks so export orchestration uses backend adapters for concrete GPU/codec/sink construction seams.
- [x] 5.3 Add architecture checks so `engine-kernel/src/preview` does not import renderer internals where a backend adapter exists.
- [x] 5.4 Document any allowed temporary exceptions for later GPU or renderer extraction.

## 6. Validation

- [x] 6.1 Run `cargo fmt -p neko-engine-kernel`.
- [x] 6.2 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 6.3 Run targeted export backend, preview backend, provider routing, sink lifecycle, and architecture tests.
- [x] 6.4 Run targeted scene, puppet, video, and timeline service tests touched by export/preview orchestration.
- [x] 6.5 Run `cargo test -p neko-engine-kernel` before merge, or document any platform/tooling blocker with targeted passing evidence.
- [x] 6.6 Run `openspec validate decouple-engine-export-preview-orchestration --strict`.
