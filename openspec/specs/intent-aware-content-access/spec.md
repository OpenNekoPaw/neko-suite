# intent-aware-content-access Specification

## Purpose
Define explicit intent-aware content access semantics for preview, offline/export, source reads, cache outputs, and status reporting.
## Requirements
### Requirement: Content access requires explicit operation intent
The system SHALL resolve content through a host-owned content access service that requires callers to provide an explicit operation intent before selecting original source bytes, derived cache artifacts, preview variants, proxies, engine tokens, or Webview URIs.

#### Scenario: Preview request uses preview intent
- **WHEN** Canvas, Agent, Preview, or Dashboard requests a visual surface for realtime display
- **THEN** the request includes an `interactive-preview` or `agent-context` intent
- **THEN** the service may resolve a thumbnail, document-entry image, preview variant, proxy, or projected Webview URI according to the requested target

#### Scenario: Export request uses export intent
- **WHEN** an export, package, verify, hash, or dependency validation operation resolves content
- **THEN** the request includes `final-export`, `package`, or `verify`
- **THEN** the service resolves original source content rather than implicitly selecting an available cache artifact

### Requirement: Preview-like intents are cache-first
The system SHALL allow preview-like intents to materialize and read cache variants when a supported resource reference and variant role are available.

#### Scenario: Missing preview cache is materialized
- **WHEN** an `interactive-preview` request references a document image resource whose cache file is missing but whose source and locator are available
- **THEN** the service calls the resource cache provider to materialize the requested variant
- **THEN** the result contains a runtime-safe path or URI for display

#### Scenario: Agent context uses bounded derived media
- **WHEN** Agent requests image or document media for model context
- **THEN** the service may return a preprocessed or bounded cache variant
- **THEN** the result retains source identity and locator metadata for later offline operations

### Requirement: Offline intents are source-first
The system SHALL resolve offline operations from original source references, original document/container entries, or engine file tokens derived from the original source.

#### Scenario: Package reads original archive entry
- **WHEN** a `package` request targets an EPUB, CBZ, or CBR image entry
- **THEN** the service reads the entry from the original container source
- **THEN** it does not use an extracted cache image as the package input

#### Scenario: Final export reads original video source
- **WHEN** a `final-export` request targets a video asset that has a ready proxy
- **THEN** the service returns the original source media or an engine source token for that media
- **THEN** it does not return the proxy path unless the request explicitly selects a draft/proxy quality mode

#### Scenario: Verify hashes source bytes
- **WHEN** a `verify` request computes a hash for an asset or document entry
- **THEN** the service reads source bytes or original container entry bytes
- **THEN** it ignores thumbnails, preview files, proxy files, and Webview projection outputs

### Requirement: Path variables are resolved before source reads
The system SHALL resolve variable paths, workspace-relative paths, and media-library paths through the shared path resolution boundary before any source read, engine registration, export, package, or verification operation.

#### Scenario: Variable source path resolves for export
- **WHEN** a `final-export` request references `${MEDIA}/clip.mp4`
- **THEN** the host resolves the variable path to a local source path before passing it to the engine or filesystem reader

#### Scenario: Persistent output contracts path back
- **WHEN** a source path is written to durable project data after content access
- **THEN** the path is stored as a workspace-relative path or `${VAR}/path` form when possible
- **THEN** the absolute local path is not treated as durable identity

### Requirement: Runtime outputs are non-durable
The system SHALL keep cache paths, Webview URIs, blob URLs, object URLs, preview tokens, stream identifiers, engine runtime tokens, and legacy `cachePath` values out of durable project facts, package manifests, and offline source inputs.

#### Scenario: Offline request rejects Webview URI
- **WHEN** a `final-export`, `package`, or `verify` request receives a Webview URI, blob URL, or object URL as the only source
- **THEN** the service rejects the request with an explicit unresolved or unsupported status

#### Scenario: Legacy cache path is migration-only
- **WHEN** a legacy payload contains only a `cachePath` and no source or locator metadata
- **THEN** the service does not treat the cache path as a durable source
- **THEN** it returns an unrecoverable or missing-source status for offline intents

### Requirement: Content access statuses are explicit
The system SHALL return structured statuses for content access results so callers can distinguish ready, missing-cache, missing-source, stale-source, unsupported-intent, unauthorized, non-portable, and failed outcomes.

#### Scenario: Non-portable Agent scratch is rejected for Canvas package
- **WHEN** a `package` request references an Agent no-workspace scratch image with extension-private scope
- **THEN** the service returns a non-portable or missing-source status
- **THEN** it does not package the extension-private cache file as if it were a project resource

#### Scenario: Unsupported source reader is visible
- **WHEN** no provider can resolve a requested source kind for the requested intent and target
- **THEN** the service returns unsupported-intent or unsupported-source
- **THEN** the caller can show remediation instead of silently using a different file
