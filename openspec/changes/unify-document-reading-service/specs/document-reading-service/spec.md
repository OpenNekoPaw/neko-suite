## ADDED Requirements

### Requirement: Shared Document Source Contract
The system SHALL represent documents passed between Preview, Extension, Platform, and Agent with a shared `DocumentSourceRef` contract that includes file identity, detected format, and host-owned source metadata.

#### Scenario: Extension enriches preview selection
- **WHEN** a document Webview sends a selection or page context to the Extension
- **THEN** the Extension adds a `DocumentSourceRef` containing the local file path, detected format, and file identity metadata before forwarding the context to Agent

#### Scenario: Webview omits host-only path authority
- **WHEN** a document Webview reports current document context
- **THEN** it reports render state and locators without reading local files or resolving host-only path authority

### Requirement: Stable Document Locators
The system SHALL use stable document locators to describe semantic positions in documents instead of relying only on viewer-specific UI state.

#### Scenario: PDF page locator
- **WHEN** a user sends selected PDF content or the current PDF page to Agent
- **THEN** the context includes a page locator with page number and zero-based page index

#### Scenario: EPUB chapter locator
- **WHEN** a user sends selected EPUB content or the current EPUB chapter to Agent
- **THEN** the context includes a chapter locator with chapter href and spine index when available

#### Scenario: CBZ entry locator
- **WHEN** a user sends a CBZ page or region to Agent
- **THEN** the context includes a page locator with page number and entry name when available

#### Scenario: DOCX avoids unstable page authority
- **WHEN** a DOCX preview reports selected content without a stable document page mapper
- **THEN** the context uses text, paragraph, heading, or generic text-range locator metadata instead of treating rendered preview pages as authoritative document pages

### Requirement: Document Manifest
The system SHALL provide a `DocumentManifest` for supported documents that describes structure, capabilities, metadata, and valid traversal units without requiring full content extraction.

#### Scenario: Manifest exposes PDF page count
- **WHEN** a manifest is requested for a PDF
- **THEN** the result includes the document format, page count or page units, metadata when available, and capability flags for page range reading

#### Scenario: Manifest exposes EPUB spine
- **WHEN** a manifest is requested for an EPUB
- **THEN** the result includes spine or chapter units with hrefs, order, and titles when available

#### Scenario: Manifest exposes CBZ entries
- **WHEN** a manifest is requested for a CBZ archive
- **THEN** the result includes ordered page entries and capability flags for image page or region reads

#### Scenario: Manifest rejects stale identity
- **WHEN** a manifest cache entry is associated with a file identity that no longer matches the current source
- **THEN** the system refreshes or rejects the stale manifest rather than using mismatched structure data

### Requirement: Semantic Range Reads
The system SHALL support reading explicit semantic document ranges using shared `DocumentRange` locators and bounded result limits.

#### Scenario: Read PDF page range
- **WHEN** Agent requests a range for a PDF page locator
- **THEN** the document access service returns content for that page within the requested character or media limits

#### Scenario: Read EPUB chapter range
- **WHEN** Agent requests a range for an EPUB chapter href or spine index
- **THEN** the document access service returns content from that chapter rather than extracting and truncating the entire book

#### Scenario: Read CBZ page range
- **WHEN** Agent requests a range for a CBZ page or entry
- **THEN** the document access service returns the matching page reference or image excerpt without reading unrelated archive entries

#### Scenario: Invalid range is rejected
- **WHEN** Agent requests a range outside the manifest structure for the document
- **THEN** the document access service returns a structured error without silently falling back to unrelated content

### Requirement: Cursor-Based Batch Reading
The system SHALL support cursor-based continuation for processing whole documents in bounded batches.

#### Scenario: Start whole EPUB traversal
- **WHEN** Agent requests batched processing for an EPUB document
- **THEN** the service uses the manifest spine order to return the first batch and a cursor for the next unread unit

#### Scenario: Continue PDF traversal
- **WHEN** Agent sends a previously returned cursor for a PDF batch traversal
- **THEN** the service returns the next page batch and an updated cursor

#### Scenario: Cursor completes traversal
- **WHEN** the final batch in a document traversal has been returned
- **THEN** the result marks the cursor as done and does not point to another unread range

#### Scenario: Stale cursor is rejected
- **WHEN** a cursor references a file identity that no longer matches the document source
- **THEN** the service rejects the cursor or requires traversal restart

### Requirement: ReadDocument Supports Manifest Range And Cursor Modes
The `ReadDocument` tool SHALL support manifest, explicit range, and cursor continuation modes while preserving the existing full-content compatibility mode.

#### Scenario: Existing full read still works
- **WHEN** Agent calls `ReadDocument` with only `file_path` and optional `max_chars`
- **THEN** the tool returns the same compatibility content shape as before, including truncation metadata when needed

#### Scenario: Manifest mode
- **WHEN** Agent calls `ReadDocument` in manifest mode
- **THEN** the tool returns a document manifest without requiring the caller to receive full document text

#### Scenario: Range mode
- **WHEN** Agent calls `ReadDocument` in range mode with a valid locator
- **THEN** the tool returns only the requested semantic range and includes source, locator, truncation, and continuation metadata when applicable

#### Scenario: Cursor mode
- **WHEN** Agent calls `ReadDocument` in cursor mode with a valid cursor
- **THEN** the tool returns the next batch and an updated cursor

### Requirement: Preview Agent Context Alignment
Preview-to-Agent document context SHALL include structured source, locator, and excerpt fields while preserving legacy inline fields for compatibility.

#### Scenario: Text selection carries locator
- **WHEN** a user sends selected document text from Preview to Agent
- **THEN** the Agent context payload includes the inline text excerpt and the structured document source and locator

#### Scenario: Image region carries locator
- **WHEN** a user sends an image region from a page-based document to Agent
- **THEN** the Agent context payload includes image data or image reference metadata plus a region locator tied to the document page

#### Scenario: Agent prompt sees enough metadata to continue reading
- **WHEN** Agent runtime formats a document-selection payload for model context
- **THEN** the formatted context includes file identity, document format, locator summary, and excerpt metadata sufficient for the model to request follow-up `ReadDocument` range reads

### Requirement: Document Access Boundaries
The document access implementation SHALL preserve the repository boundary rules for Webview, Extension, Platform, and Engine responsibilities.

#### Scenario: Webview does not parse local files directly
- **WHEN** a Webview needs to send document context to Agent
- **THEN** it sends selected content and locator state through `postMessage` without importing Node, VSCode, or document reader services

#### Scenario: Platform owns parsing
- **WHEN** `ReadDocument` needs structured document text or manifest data
- **THEN** it uses an injected Platform document access service rather than preview Webview code

#### Scenario: Engine owns byte serving
- **WHEN** a document reader needs bounded bytes or container entries from a registered large file
- **THEN** it uses the engine file access contract where that path is available rather than adding package-local binary read helpers

#### Scenario: Agent reads without open preview
- **WHEN** Agent calls `ReadDocument` for a supported local document while no document preview Webview is open
- **THEN** the Platform document access service reads through host and engine-backed dependencies without relying on frontend viewer state

#### Scenario: Native-heavy operation delegates to engine
- **WHEN** a document operation requires byte-range access, container entry access, or a native-heavy conversion path already owned by engine
- **THEN** the Platform document access service delegates that low-level operation through the engine/client contract while preserving the shared semantic document result shape
