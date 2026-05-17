## Why

Document preview and Agent document reading currently use different abstractions: preview renders PDF/EPUB/CBZ through engine-backed URLs and viewer-specific locators, while `ReadDocument` reads whole files and truncates text after extraction. This causes EPUB/PDF/CBZ selections, current page/chapter context, and Agent follow-up reads to drift out of alignment, and it prevents reliable on-demand or batched processing of large documents.

This change introduces a shared document reading service contract so preview, Agent context, and `ReadDocument` use the same source, locator, manifest, range, and cursor semantics.

## What Changes

- Add a shared document reading contract for document source references, stable locators, semantic ranges, manifests, excerpts, and batch cursors.
- Introduce a unified document access service whose semantic interface lives in Platform/Extension code and delegates byte access or heavy native work to engine:
  - document manifest/probe reads,
  - explicit semantic range reads,
  - cursor-based continuation for whole-file batch processing.
- Extend `ReadDocument` so Agent can request manifest, range, and next-batch reads instead of only full-file extraction with `max_chars` truncation.
- Update document preview → Agent context payloads so selections carry stable source and locator data in addition to inline text or image excerpts.
- Align Preview and Agent behavior across PDF, EPUB, CBZ, DOCX, PPTX, and text-like formats without making Webviews responsible for file access or parsing.
- Keep Webviews responsible only for rendering, selection capture, and stable locator emission; keep engine responsible for local file authority, byte ranges, container entries, and native-heavy conversion/reading paths.
- Preserve existing `document-selection` payload fields and `ReadDocument(file_path, max_chars)` behavior during migration.

No breaking changes are intended. Existing preview rendering and current Agent context chips remain compatible while new structured fields are added.

## Capabilities

### New Capabilities

- `document-reading-service`: Shared document source, locator, manifest, range, cursor, preview-context, and Agent `ReadDocument` behavior.

### Modified Capabilities

- `agent-multimodal-tooling`: Agent multimodal context shall preserve document source and locator metadata so provider/runtime assembly can request additional document evidence through the shared service.

## Impact

- `packages/neko-types`: shared TypeScript contracts for document source refs, locators, ranges, manifests, excerpts, read results, and cursors.
- `packages/neko-agent/packages/platform/src/document`: new document access service abstraction and reader implementations for manifest/range/batch operations.
- `packages/neko-engine` and `packages/neko-client`: engine-backed file access, byte range/container entry, and future native-heavy document operations used by the document access service where available.
- `packages/neko-agent/packages/extension/src/tools/readDocumentTool.ts`: schema and execution support for manifest/range/cursor modes while preserving current full-read compatibility.
- `packages/neko-agent/packages/agent/src/runtime/message-runtime.ts`: context formatting that exposes document source/locator/excerpt metadata to the model without losing legacy text/image payloads.
- `packages/neko-preview/packages/extension/src/types/document-messages.ts` and `packages/neko-preview/packages/webview/src/shared/document-types.ts`: structured preview-to-extension document context payloads.
- `packages/neko-preview/packages/extension/src/providers/document/documentProviderHelper.ts`: bridge structured preview payloads into Agent context.
- `packages/neko-preview/packages/webview/src/pdf`, `src/epub`, `src/cbz`, `src/docx`: emit stable locators for current page/chapter/entry/selection where each format supports them.
- Tests: shared contract guards, document reader service tests, `ReadDocument` tool tests, Agent context formatting tests, and preview message bridge tests.
