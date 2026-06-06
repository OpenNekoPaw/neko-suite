## 1. Contracts And Diagnostics

- [x] 1.1 Add shared helpers or guards that classify storyboard image refs as stable, runtime-only, unsafe cache path, or ambiguous alias.
- [x] 1.2 Add storyboard/profile diagnostics for manga/image-sequence shots that use source-backed image strategies without resolvable `sourceMediaRefs`.
- [x] 1.3 Add tests proving cache paths, Webview URIs, blob URLs, object URLs, and fabricated tool-call ids are rejected as new storyboard media identity.
- [x] 1.4 Add tests proving stable `ResourceRef` and `DocumentArchiveResourceRef` payloads remain accepted and projectable.

## 2. Agent Tool Result Identity

- [x] 2.1 Update `ReadDocument` result shaping to expose stable image refs and explicit runtime handles while keeping legacy `imagePaths/path` compatibility fields.
- [x] 2.2 Update `ReadDocumentImage` result shaping with the same stable-ref/runtime-handle split.
- [x] 2.3 Update `ReadImage` managed-cache-path restoration tests so paths from `.neko/.cache/resources` regain stable refs before storyboard transfer.
- [x] 2.4 Ensure tool result DTOs retain source document, locator, entry path, alias, alias scope, dimensions, MIME type, and byte size for each image.
- [x] 2.5 Add regression tests for no-workspace or extension-private scratch results reporting non-portable behavior for cross-package transfer.

## 3. Scoped Alias Resolution

- [x] 3.1 Introduce an Agent Webview alias index that records aliases by tool call id, asset index, source document identity, page/entry locator, and batch scope.
- [x] 3.2 Update composite/storyboard presenters to resolve `sourcePage`, `sourceImage`, `page_1`, `P1`, and related aliases through the scoped alias index.
- [x] 3.3 Restrict row-order fallback to single eligible image batches and emit diagnostics for ambiguous multi-batch cases.
- [x] 3.4 Preserve explicit `sourceMediaRefs[].locator.type = "tool-result"` over inferred aliases.
- [x] 3.5 Add tests for two tool calls that both expose `page_1`, repeated use of the same page across multiple shots, and missing tool results.

## 4. Agent To Canvas Transfer

- [x] 4.1 Update structured StoryboardTableV1 transfer to prefer `referenceResourceRef` and `referenceImageResourceRef` over `referenceImagePath`.
- [x] 4.2 Update Markdown storyboard transfer fallback to attach stable refs when image refs are unambiguous and to block ambiguous aliases.
- [x] 4.3 Prevent new Agent-to-Canvas payloads from sending `document-image-cache` paths as primary image identity.
- [x] 4.4 Add tests proving Send to Canvas for document-backed shots sends refs and no longer depends on cache path projection.
- [x] 4.5 Add user-facing diagnostics in Agent Webview for unresolved or ambiguous storyboard image references.

## 5. Canvas Import And Preview

- [x] 5.1 Harden Canvas storyboard import so `referenceResourceRef` is resolved through `ContentAccessService` before any path fallback.
- [x] 5.2 Mark legacy `cachePath` / `referenceImagePath` fallback as migration-only with explicit unavailable or migration status.
- [x] 5.3 Ensure Canvas save strips `runtimeReferenceImagePath`, projected Webview URIs, and cache paths when stable refs are present.
- [x] 5.4 Add tests for missing cache rematerialization, legacy fallback success, legacy fallback failure, and save/load without runtime paths.
- [x] 5.5 Verify Canvas does not reuse previous thumbnails or sequential images when resource resolution fails.

## 6. Legacy Cache Cleanup

- [x] 6.1 Audit production references to `document-image-cache`, `legacyCachePath`, `cachePath`, `imagePaths`, and `referenceImagePath` and classify them as runtime, migration, or removable.
- [x] 6.2 Remove `document-image-cache` from new cross-package transfer paths and keep it only as Agent internal scratch or legacy compatibility.
- [x] 6.3 Remove or quarantine Agent Webview authorization for legacy global `document-image-cache` once new tool results display through projected resource/runtime handles.
- [x] 6.4 Update project package/runtime-only path guards if needed so legacy cache fields cannot become package/export sources.
- [x] 6.5 Add cleanup tests or assertions that new project-bound document images materialize under `.neko/.cache/resources`.

## 7. Documentation And Skills

- [x] 7.1 Update `packages/neko-agent/DOCUMENT_FORMATS.md` to describe `imageInfo.path`/`imagePaths` as runtime handles and stable refs as transfer identity.
- [x] 7.2 Update built-in manga/storyboard skills to require real `sourceMediaRefs` and scoped aliases, and to forbid cache paths in Canvas-facing fields.
- [x] 7.3 Update any Agent/Canvas docs or test fixtures that still teach `cachePath` as durable identity.

## 8. Validation

- [x] 8.1 Run targeted shared type/resource tests for storyboard validation, content access, and resource cache behavior.
- [x] 8.2 Run targeted Agent extension and Webview tests for `ReadDocument`, `ReadDocumentImage`, `ReadImage`, composite presenter, tool-call presenter, and storyboard transfer presenter.
- [x] 8.3 Run targeted Canvas extension and Webview tests for protocol, document entry reader, node factory/import, and preview materialization.
- [x] 8.4 Run compile/build commands for affected Agent, Canvas, and shared packages.
- [x] 8.5 Run `git diff --check` and perform Neko quality review against `docs/architecture/adr-code-review-quality-gates.md`.
