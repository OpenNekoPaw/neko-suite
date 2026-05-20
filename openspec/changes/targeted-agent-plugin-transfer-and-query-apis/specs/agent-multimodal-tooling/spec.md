## ADDED Requirements

### Requirement: Structured editor queries are primary state sources
The system SHALL use structured editor query APIs as the primary source of editable project state. OCR, screenshots, thumbnails, and rendered snapshots MUST be treated as visual evidence or verification layers and MUST NOT replace structured queries when stable editor IDs or mutation targets are required.

#### Scenario: Agent needs Canvas node target
- **WHEN** Agent must update a Canvas node field
- **THEN** runtime obtains the target from Canvas query APIs, user selection, or explicit user input rather than inferring the node ID from a screenshot

#### Scenario: Agent visually verifies layout
- **WHEN** Agent has already applied a structured Canvas mutation and needs to verify visual placement
- **THEN** runtime may request a screenshot or render snapshot as evidence without treating it as the authoritative canvas state

### Requirement: Visual evidence references remain bounded
The system SHALL project OCR, screenshot, thumbnail, and render-snapshot outputs as bounded evidence references with metadata. Tool results MUST avoid returning unbounded image data or repeated large metadata unless explicitly requested.

#### Scenario: Thumbnail evidence accompanies document page
- **WHEN** a document-read result includes a page image reference
- **THEN** the result contains compact image metadata and a reusable reference rather than repeating full manifest or binary payload data on every page read

#### Scenario: Screenshot is requested explicitly
- **WHEN** Agent asks to inspect visual layout after a UI operation
- **THEN** the screenshot tool returns a bounded image reference and viewport metadata scoped to that inspection

### Requirement: Multimodal packets preserve structured and visual provenance separately
The system SHALL preserve separate provenance for structured state queries and visual evidence. Agent traces MUST be able to identify whether a decision was based on structured editor data, OCR text, screenshot evidence, or user-provided content.

#### Scenario: Decision uses structured state and visual evidence
- **WHEN** Agent updates a Canvas node after querying node data and then verifies it with a screenshot
- **THEN** the trace records the mutation target from structured data and the screenshot as post-mutation evidence
