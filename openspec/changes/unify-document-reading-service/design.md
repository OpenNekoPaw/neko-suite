## Context

Neko Suite already has three separate pieces of document infrastructure:

- `neko-preview` opens local documents through Extension-host providers, registers large files with engine-backed preview file URLs, and renders PDF/EPUB/CBZ/DOCX in sandboxed Webviews.
- `neko-agent` exposes `ReadDocument`, but the tool currently reads a whole document through `IDocumentReaderService.read(filePath)` and then truncates text with `max_chars`.
- Preview selections are sent to Agent as `document-selection` context with inline `text`, `imageData`, `contentKind`, and a small `context` object, but that context is not a stable cross-format locator and cannot drive follow-up range reads.

The result is a split-brain document model: preview knows the user's current page, EPUB chapter, rendered CBZ entry, or selected region, while Agent can only see a path plus a lossy excerpt unless the user manually asks for a broad `ReadDocument` call. EPUB is the clearest mismatch: the viewer's waterfall/paginated state is organized around spine entries and CFI-like positions, but the tool currently extracts and truncates the entire book.

Existing architectural constraints still apply:

- Webviews cannot access Node.js, VSCode APIs, or local files directly.
- Extension/Platform code owns host integration, the semantic document access interface, current TypeScript reader orchestration, and tool registration.
- Engine owns binary file authority, byte ranges, container entry serving, and native-heavy conversion or parsing paths as they become available.
- Shared contracts must live in a low-dependency layer and remain provider-neutral.

## Goals / Non-Goals

**Goals:**

- Define one shared semantic document contract for preview and Agent:
  - `DocumentSourceRef`
  - `DocumentLocator`
  - `DocumentRange`
  - `DocumentManifest`
  - `DocumentExcerpt`
  - `DocumentBatchCursor`
- Add a `DocumentAccessService` abstraction for manifest, explicit range read, and cursor continuation.
- Extend `ReadDocument` with manifest/range/cursor modes while preserving `file_path + max_chars` compatibility.
- Make preview-to-Agent context carry stable source and locator metadata so Agent can continue reading from the same semantic location.
- Support format-appropriate locators:
  - PDF: page and region.
  - EPUB: chapter href, spine index, optional CFI/text-range.
  - CBZ: page, entry name, optional image region.
  - DOCX: text/paragraph/heading range where stable; rendered page is preview-only unless a stable mapper exists.
  - PPTX: slide.
  - TXT/MD/Fountain: line or character range.
- Enable whole-file processing through manifest-derived batches and cursor-based continuation.
- Keep document byte access aligned with the engine file access boundary.
- Keep Webview responsibilities limited to rendering, selection capture, and stable locator emission.

**Non-Goals:**

- Replacing PDF.js, epub.js, zip.js, or docx-preview rendering behavior.
- Creating a universal visual page model for every format.
- Making DOCX rendered page numbers authoritative in the first implementation.
- Building OCR or image understanding for CBZ/PDF scans beyond carrying image references/regions.
- Rewriting all document readers in Rust.
- Removing existing `document-selection` fields or `ReadDocument(file_path, max_chars)` in the first migration batch.
- Solving file prompt completion icons, asset/media/unified entity completion, or Agent Webview width issues in this change.

## Decisions

### Decision 1: Separate semantic document range from byte transport range

The shared contract will distinguish:

```text
Transport range = byte range / HTTP Range / ZIP entry path
Document range  = page / chapter / slide / text range / region
```

`DocumentAccessService` accepts document ranges and delegates byte access to the existing file access or parser-specific path. Preview viewers can still use HTTP Range and container entry URLs for rendering, but Agent-visible context uses document semantics.

Alternative considered: expose byte offsets directly to Agent and preview.

Rejected because byte offsets are not meaningful for EPUB spine entries, PDF extracted text, DOCX paragraphs, or rendered selections. They would leak transport implementation details and fail the preview/Agent alignment goal.

### Decision 2: Use `DocumentManifest` as a lightweight structure index

`DocumentManifest` is required, but it should be a structure and capability map rather than a full-text index:

```text
DocumentManifest
  source
  fileId/revision
  format
  capabilities
  units: pages | chapters | entries | slides | sections | lines
  metadata
```

The manifest can be generated lazily and cached by `fileId` composed from canonical path, size, mtime, and optional hash when available. It should not force full text extraction for large documents.

Alternative considered: skip manifest and let callers guess ranges.

Rejected because whole-file batching, valid range validation, preview status, and Agent planning all need a shared view of document structure.

### Decision 3: Keep `range` and `cursor` as separate concepts

Explicit range reads and cursor continuation serve different workflows:

- `DocumentRange` means "read this semantic portion now."
- `DocumentBatchCursor` means "continue a planned multi-batch traversal."

`ReadDocument` should support both. Cursor reads can internally expand to the next manifest-derived range, but cursors should remain opaque to the caller except for resumable metadata.

Alternative considered: make every batch request pass explicit ranges.

Rejected because long documents need resumable continuation and predictable progress without requiring the model to repeatedly reconstruct the traversal plan.

### Decision 4: Put shared contracts in `neko-types`, service implementation in Agent Platform first

Contracts should be placed in `packages/neko-types` so `neko-preview`, `neko-agent`, and future engine/client integrations can share the same shapes without cross-package feature dependencies.

The initial `DocumentAccessService` implementation should live under `packages/neko-agent/packages/platform/src/document` because `ReadDocument` already depends on this platform reader layer and because the existing reader stack is TypeScript/JavaScript-based. Preview integration should emit structured locators and rely on Agent/tool paths for follow-up reads rather than importing Agent implementation code.

Alternative considered: implement the service inside `neko-preview`.

Rejected because document reading is needed by Agent tools and batch workflows, and preview should stay focused on rendering and selection capture.

### Decision 4a: Split responsibilities between Webview, Platform, and Engine

The unified reading service is not a frontend service and should not be implemented inside document Webviews. It is also not initially a full Rust rewrite. The service boundary should be layered:

```text
Webview
  render document, capture selection, emit DocumentLocator
        |
        v
Extension / Agent Platform
  DocumentAccessService semantic API
  manifest, document range, cursor, current JS/TS reader orchestration
        |
        v
Engine / Client
  file authority, token registration, byte range, container entry,
  native-heavy conversion or parser backends where available
```

This gives Agent a stable service that can be used even when no preview Webview is open, while still letting the implementation delegate low-level file access to engine. Format readers can move behind engine-native operations over time without changing the shared `DocumentSourceRef`/`DocumentLocator`/`DocumentRange` contract.

Alternative considered: make the engine own all document manifest/range/cursor semantics immediately.

Rejected for the first implementation because current PDF/EPUB/DOCX/office readers and `ReadDocument` wiring already exist in TypeScript, and forcing a full Rust/native rewrite would slow delivery. Engine should still own the byte and heavy native boundary.

Alternative considered: make preview Webviews own reads because they already render the document.

Rejected because Webviews cannot access local files, Agent reads must work without an open preview, and viewer pagination state is not a reliable cross-format document range.

### Decision 5: Webview reports locators; Extension enriches source refs

Document Webviews should report the best stable locator they know:

```text
PDF viewer  -> page/region/text excerpt
EPUB viewer -> chapterHref/spineIndex/cfi/text excerpt
CBZ viewer  -> page/entryName/region/image excerpt
DOCX viewer -> text-range/paragraph where available
```

The Extension provider bridge should enrich the payload with `DocumentSourceRef`, file path, format, and file identity metadata before sending Agent context. Webviews must not compute local absolute path authority or read files.

Alternative considered: send all source data from the Webview.

Rejected because Webviews only receive render-safe URLs and document state; host path, file identity, and permission policy belong to Extension/Engine boundaries.

### Decision 6: Preserve compatibility while adding structured payloads

The preview message and Agent context payload should support both old and new fields:

```text
legacy: { filePath, text, imageData, contentKind, context }
new:    { source, locator, excerpt, range?, manifestRef? }
```

`formatAgentContextPayload()` should surface locator metadata when present and fall back to legacy formatting otherwise. This keeps current context chips and tests working while enabling richer model instructions.

Alternative considered: introduce a new Agent context type.

Rejected because the existing `document-selection` type already expresses the user intent; the problem is missing structured data, not a distinct context category.

### Decision 7: Batch processing uses manifest-derived map/reduce

Whole-file workflows should follow this sequence:

```text
getManifest(source)
  -> create batch plan by format
  -> read first range
  -> return cursor
  -> read next cursor until done
  -> summarize/reduce partial outputs
```

Batch units should be format-aware:

- PDF: pages, grouped by page count or char budget.
- EPUB: spine chapters, split large chapters by paragraph/text windows.
- CBZ: page/entry ranges with optional region/image extraction.
- PPTX: slides.
- DOCX: paragraphs/headings/sections until stable page mapping exists.
- TXT/MD/Fountain: line or char windows with overlap.

Alternative considered: call `ReadDocument` once with a very large `max_chars`.

Rejected because it is slow, lossy, non-resumable, and likely to exceed model/tool result limits for long documents.

## Contract Sketch

The exact TypeScript names may be adjusted during implementation, but the core shapes should remain stable:

```typescript
type DocumentSourceRef = {
  filePath: string;
  format: 'pdf' | 'epub' | 'cbz' | 'docx' | 'pptx' | 'text' | 'html' | 'xlsx' | 'fdx';
  fileId?: string;
  uri?: string;
};

type DocumentLocator =
  | { kind: 'page'; pageNumber: number; pageIndex: number; entryName?: string }
  | { kind: 'chapter'; chapterHref: string; spineIndex?: number; title?: string; cfi?: string }
  | { kind: 'slide'; slideNumber: number; slideIndex: number }
  | { kind: 'text-range'; startChar?: number; endChar?: number; startLine?: number; endLine?: number }
  | { kind: 'region'; pageNumber: number; region: { x: number; y: number; width: number; height: number } };

type DocumentRange = {
  locator: DocumentLocator;
  limit?: { maxChars?: number; maxImages?: number };
};

type DocumentExcerpt = {
  text?: string;
  imageData?: string;
  contentKind: 'text' | 'image' | 'mixed';
  truncated?: boolean;
};

type DocumentBatchCursor = {
  source: DocumentSourceRef;
  strategy: 'manifest-order';
  next?: DocumentLocator;
  batchIndex: number;
  done: boolean;
};
```

Service surface:

```typescript
interface DocumentAccessService {
  getManifest(source: DocumentSourceRef): Promise<DocumentManifest>;
  readRange(source: DocumentSourceRef, range: DocumentRange): Promise<DocumentReadResult>;
  readNext(cursor: DocumentBatchCursor): Promise<DocumentReadResult>;
}
```

Tool modes:

```text
ReadDocument({ file_path, mode: "content", max_chars })      // compatibility/default
ReadDocument({ file_path, mode: "manifest" })
ReadDocument({ file_path, mode: "range", range })
ReadDocument({ file_path, mode: "next", cursor })
```

## Risks / Trade-offs

- [Risk] Different viewers emit locators at different precision levels. -> Mitigation: define per-format capability flags in `DocumentManifest` and make locator precision explicit instead of pretending all formats support pages.
- [Risk] DOCX page alignment is unstable. -> Mitigation: treat DOCX rendered page as preview state only in the first batch; use paragraph/heading/text ranges for Agent reads.
- [Risk] EPUB CFI support differs between waterfall and paginated modes. -> Mitigation: require `chapterHref` and `spineIndex` as the stable baseline; treat CFI as optional precision.
- [Risk] Cursor payloads become stale after file edits. -> Mitigation: include `fileId`/revision in source refs and reject or restart cursors when identity changes.
- [Risk] Tool schema becomes too complex for the model to use. -> Mitigation: keep compatibility default simple, provide examples in tool description/tests, and prefer manifest + cursor workflows for whole-file tasks.
- [Risk] Manifest generation accidentally performs full extraction. -> Mitigation: add tests for lazy manifest behavior and separate manifest readers from content extraction where libraries allow it.
- [Risk] Preview and Agent contracts diverge again. -> Mitigation: define shared types in `neko-types` and update both extension-side and webview-side message protocol tests.

## Migration Plan

1. Add shared document contract types in `neko-types` without changing runtime behavior.
2. Add `DocumentAccessService` interfaces and adapters around the existing reader service.
3. Implement manifest support for PDF, EPUB, CBZ, text-like formats, and simple DOCX/PPTX metadata where available.
4. Implement range reads for PDF page ranges, EPUB chapter/spine ranges, CBZ page/entry ranges, and text line/char ranges.
5. Extend `ReadDocument` schema and tests for `manifest`, `range`, and `next` modes while preserving current `content` mode.
6. Update preview message contracts and provider bridge to include `source`, `locator`, and `excerpt` alongside legacy fields.
7. Update PDF/EPUB/CBZ/DOCX Webviews to emit stable locators.
8. Update Agent context formatting so model-visible context includes source and locator hints and can call `ReadDocument` for continuation.
9. Add cursor-based batch traversal and tests for resumable whole-file processing.
10. Document the unified flow in document preview/Agent architecture docs.

Rollback is low risk because the change is additive. Existing full-read and inline-selection paths remain available until structured consumers are proven stable.

## Open Questions

- Should `fileId` use size/mtime by default or require a content hash for long-running batch jobs?
- Should `DocumentManifest` be exposed as a standalone Agent tool result only, or also cached in Extension state for preview status?
- Should image-heavy PDF pages return extracted text, rendered image references, or both when no text layer exists?
- Should XLSX be included in the first range implementation, or stay manifest-only until sheet-range semantics are designed?
