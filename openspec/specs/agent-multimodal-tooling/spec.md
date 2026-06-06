# agent-multimodal-tooling Specification

## Purpose
TBD - created by archiving change unify-neko-agent-runtime-workflow-boundaries. Update Purpose after archive.
## Requirements
### Requirement: Multimodal context uses one typed packet
The system SHALL represent text, image, audio, video, canvas, timeline, editor selection, files, URLs, generated artifacts, and engine perception evidence in a single `MultimodalContextPacket` or equivalent typed contract. The packet MUST preserve provenance, media type, URI/path policy, size/duration metadata, and conversation/workflow linkage.

#### Scenario: Image and timeline context share one packet
- **WHEN** a user sends an image attachment while a timeline selection is active
- **THEN** runtime receives one multimodal context packet containing both evidence sources with provenance

#### Scenario: Audio and video are not reduced to plain text only
- **WHEN** a user attaches audio or video
- **THEN** runtime records media metadata and optional perception evidence in the packet instead of only appending a textual filename

### Requirement: Tools declare accepted and produced modalities
The system SHALL let tools and operations declare accepted modalities, produced modalities, required evidence, output artifact types, and provider/model constraints. Runtime MUST use these declarations during tool injection, workflow planning, prompt/schema generation, and validation.

#### Scenario: Video quality tool requires video evidence
- **WHEN** a workflow node wants to invoke a video quality tool
- **THEN** runtime verifies that the multimodal packet contains video evidence or an available extractor before injecting or calling the tool

#### Scenario: Image generator produces artifact projection
- **WHEN** an image generation tool completes
- **THEN** runtime projects an image artifact with media type, path/URI, metadata, and workflow/task linkage to Webview

### Requirement: AI SDK adapters project multimodal packets to provider messages
The system SHALL keep provider-specific multimodal message conversion inside AI SDK/platform adapters. Runtime MUST remain provider-neutral and MUST NOT encode provider-specific media payload rules directly in Extension or Webview.

#### Scenario: Provider-specific image message is adapter-owned
- **WHEN** a selected provider expects image input in a provider-specific shape
- **THEN** the AI SDK adapter converts the typed packet into that shape

### Requirement: Host adapters own file and URI access
The system SHALL keep local file reading, VSCode URI conversion, Extension API calls, and workspace path resolution in host adapters. Runtime MAY request media payloads or evidence through typed adapter functions but MUST NOT import VSCode or directly assume absolute paths.

#### Scenario: Runtime requests base64 image through adapter
- **WHEN** a tool needs image bytes from a workspace file
- **THEN** runtime calls an injected adapter and receives typed media payload without importing VSCode

### Requirement: Multimodal tool calls are observable
The system SHALL project multimodal tool calls, progress, results, generated artifacts, and validation evidence to conversation-scoped Webview state. Projection MUST avoid leaking raw large payloads unless explicitly requested by UI.

#### Scenario: Tool result contains media artifact reference
- **WHEN** a multimodal tool returns a generated video
- **THEN** Webview receives a compact artifact reference and metadata rather than an unbounded binary payload

### Requirement: Multimodal context supports evaluation
The system SHALL expose evidence references from multimodal packets to evaluator and ablation runs so output quality can be compared with and without specific evidence sources.

#### Scenario: Ablation disables video evidence
- **WHEN** an experiment disables video evidence injection
- **THEN** the run still records that video evidence existed but was withheld from the model/context

### Requirement: Multimodal image tool results separate stable refs and runtime handles
Agent multimodal image and document tools SHALL distinguish stable media references from runtime preview or read handles in their result payloads.

#### Scenario: ReadDocument returns document image metadata
- **WHEN** `ReadDocument` returns image metadata for a document page or archive entry
- **THEN** the result includes source, locator, and stable resource reference metadata when available
- **THEN** any local path is marked or treated as a runtime handle for preview or model input, not as durable Canvas identity

#### Scenario: ReadImage receives managed cache path
- **WHEN** `ReadImage` receives a local path that belongs to the managed resource cache
- **THEN** it restores the associated stable resource reference from the cache index when possible
- **THEN** subsequent storyboard transfer can use that reference instead of the path

### Requirement: Document image scratch cache is not cross-package identity
Agent SHALL NOT expose `document-image-cache` paths as the identity channel for project-bound document images sent to Canvas, Preview, package, or export flows.

#### Scenario: Project-bound document image is sent to Canvas
- **WHEN** a document image is used in a project-bound storyboard transfer
- **THEN** Agent ensures or records a project resource cache reference for the image
- **THEN** the transfer does not require another package to authorize Agent's scratch cache root

#### Scenario: No-workspace scratch image remains non-portable
- **WHEN** Agent reads a document image without a workspace and the image exists only in extension-private scratch
- **THEN** cross-package transfer reports non-portable or requires promotion/materialization into an approved scope
- **THEN** the scratch path is not treated as a durable source reference

### Requirement: Built-in storyboard skills require real media refs
Built-in storyboard and manga conversion skills SHALL instruct models to reference only real tool results or stable resource refs for source images and SHALL NOT instruct models to copy cache paths into Canvas-facing fields.

#### Scenario: Manga skill prepares StoryboardTableV1
- **WHEN** the manga storyboard skill produces a structured payload from tool-read pages
- **THEN** each image-backed shot uses `sourceMediaRefs` with a real tool-result locator
- **THEN** readable fields such as `sourcePage` remain aliases rather than identity

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
