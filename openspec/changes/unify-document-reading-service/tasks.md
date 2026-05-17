## 1. Shared Contracts

- [x] 1.1 Add shared document reading types in `packages/neko-types` for `DocumentSourceRef`, `DocumentFormat`, `DocumentLocator`, `DocumentRange`, `DocumentExcerpt`, `DocumentManifest`, `DocumentReadResult`, and `DocumentBatchCursor`.
- [x] 1.2 Export the new contracts from the appropriate `neko-types` entrypoints without adding React, VSCode, or Agent implementation dependencies.
- [x] 1.3 Add unit/type tests or compile guards for locator variants, range result shapes, manifest capabilities, and cursor identity fields.

## 2. Document Access Service

- [x] 2.1 Introduce `IDocumentAccessService` in `packages/neko-agent/packages/platform/src/document` with `getManifest`, `readRange`, `readNext`, and compatibility `readContent` behavior.
- [x] 2.2 Adapt the existing `IDocumentReaderService.read(filePath)` path to the new service without changing current full-document behavior.
- [x] 2.3 Add an injected engine/client-backed low-level access adapter for file identity, byte ranges, and container entries where the engine file access contract is available.
- [x] 2.4 Implement lightweight manifest generation for PDF, EPUB, CBZ, text/markdown/fountain, and best-effort DOCX/PPTX metadata.
- [x] 2.5 Implement semantic range reads for PDF pages, EPUB chapter/spine hrefs, CBZ page/entry names, and text line/char ranges.
- [x] 2.6 Add structured errors for unsupported format, unsupported locator kind, invalid range, stale file identity, and unavailable engine-backed low-level access.
- [x] 2.7 Add service tests for manifest, valid range reads, invalid range rejection, compatibility full reads, stale identity handling, and no-preview Agent reads.

## 3. ReadDocument Tool

- [x] 3.1 Extend `ReadDocument` parameters with `mode`, `source`, `range`, `cursor`, and bounded result options while keeping `file_path` as the compatibility entrypoint.
- [x] 3.2 Implement `manifest` mode returning `DocumentManifest` without full text extraction.
- [x] 3.3 Implement `range` mode returning a bounded `DocumentReadResult` with source, locator, text/image references, truncation, and cursor metadata where applicable.
- [x] 3.4 Implement `next` mode returning the next cursor batch.
- [x] 3.5 Preserve existing `ReadDocument(file_path, max_chars)` result shape and tests.
- [x] 3.6 Update tool description examples so Agent can choose manifest/range/cursor reads for EPUB/PDF/DOCX/CBZ instead of broad file reads.

## 4. Preview To Agent Context Contract

- [x] 4.1 Update extension-side document message types to allow structured `source`, `locator`, `range`, and `excerpt` fields alongside legacy `text`, `imageData`, `contentKind`, and `context`.
- [x] 4.2 Update webview-side shared document message types to emit structured locators without importing host-only APIs.
- [x] 4.3 Update `documentProviderHelper.ts` to enrich preview messages with `DocumentSourceRef`, detected format, file identity, and backward-compatible legacy fields.
- [x] 4.4 Update Agent context formatting to display document format, source, locator, excerpt status, and follow-up `ReadDocument` hints while preserving legacy payload formatting.
- [x] 4.5 Add tests for preview message bridging and Agent context formatting for structured and legacy document selections.

## 5. Viewer Locator Emission

- [x] 5.1 Update PDF viewer selection/send-to-AI paths to include page locator and optional region locator.
- [x] 5.2 Update EPUB viewer selection/send-to-AI paths to include chapter href, spine index, title, and optional CFI when available.
- [x] 5.3 Update CBZ viewer selection/send-to-AI paths to include page number, page index, entry name, and region for image selections.
- [x] 5.4 Update DOCX viewer selection/send-to-AI paths to include text-range or paragraph-style locator metadata where available and avoid authoritative rendered page locators.
- [x] 5.5 Add focused webview tests or protocol tests for each viewer's outgoing locator payload.

## 6. Batch Processing

- [x] 6.1 Implement manifest-derived batch planning for PDF pages, EPUB spine chapters, CBZ entries, PPTX slides, DOCX sections/paragraphs, and text line/char windows.
- [x] 6.2 Implement cursor creation and continuation with file identity validation and done-state handling.
- [x] 6.3 Add tests for multi-batch traversal, cursor completion, stale cursor rejection, and large-chapter splitting.

## 7. Documentation And Verification

- [x] 7.1 Update `docs/architecture/document-preview.md` with the unified source/locator/manifest/range/cursor flow.
- [x] 7.2 Add or update Agent architecture documentation for `ReadDocument` manifest/range/cursor usage and preview context alignment.
- [x] 7.3 Run targeted tests for document reader/platform, `ReadDocument`, Agent runtime context formatting, and preview document message bridge.
- [ ] 7.4 Run package-level type checks or the narrowest available `pnpm check/test` commands covering `neko-types`, `neko-agent`, and `neko-preview`.
