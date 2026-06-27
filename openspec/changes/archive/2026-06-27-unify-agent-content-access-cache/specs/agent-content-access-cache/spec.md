## ADDED Requirements

### Requirement: Agent content access is the only Agent tool content gateway

Agent tools, Agent attachment processing, and provider perception asset loading SHALL access local content through an Agent content-access runtime that is backed by Host-side content access services. Agent-facing code MUST NOT directly choose cache directories, directly read binary/media files with package-local filesystem calls, or branch on `.neko/.cache` path layout.

#### Scenario: ReadImage uses the Agent content access runtime

- **WHEN** `ReadImage` receives a workspace image path, `${VAR}` image path, `ResourceRef`, or document image ref
- **THEN** the tool SHALL request image metadata or provider-ready image data through the Agent content-access runtime
- **AND** the tool SHALL NOT read the image bytes with direct tool-local filesystem access

#### Scenario: Perception asset loading uses the same runtime

- **WHEN** a native multimodal provider needs bytes or a data URL for a perception asset
- **THEN** the asset loader SHALL resolve the asset through the Agent content-access runtime
- **AND** it SHALL preserve source/ref metadata for diagnostics without exposing cache paths as durable identity

### Requirement: Binary and media source reads use Engine-backed access

Agent binary/media source reads SHALL be routed through `neko-engine` file access or Engine-backed content providers. This includes image, video, audio, model, puppet, PDF, EPUB, CBZ/CBR, Office container, document entry, sibling resource, probe, decode, preview, proxy, and thumbnail source operations. Pure text/configuration/project-fact reads MUST remain outside Engine and use Host text/project-file services.

#### Scenario: Image metadata requires binary media access

- **WHEN** Agent needs metadata for a local PNG, JPEG, WebP, GIF, BMP, or generated image file
- **THEN** the source authorization and binary byte access SHALL be performed through Engine-backed or content-access provider infrastructure
- **AND** a missing Engine-backed binary path SHALL produce a visible diagnostic instead of falling back to direct binary file reads

#### Scenario: Text document reads do not require Engine

- **WHEN** `ReadDocument` reads a supported pure text, Markdown, Fountain, JSON, YAML, or TOML-like source
- **THEN** the read SHALL use Host text/project-file access rather than Engine file access
- **AND** the returned tool data SHALL follow the same stable source/ref and cache-hidden output rules

### Requirement: Document container access is source-first and cache-hidden

Agent document tools SHALL treat binary/container documents as source-first document sources and SHALL expose only text, structure, semantic locators, stable document source refs, document image metadata, and document resource refs. Any document image materialized for reading, preview, or provider input MUST be materialized through the unified resource cache behind content access and MUST NOT be exposed as a public cache path.

#### Scenario: ReadDocument returns document image refs without cache paths

- **WHEN** `ReadDocument` reads a PDF, EPUB, CBZ/CBR, DOCX, PPTX, XLSX, or other document source with images
- **THEN** the tool result SHALL return `imageInfo` entries with stable metadata and document resource refs
- **AND** it SHALL NOT return `imagePaths`, `path`, `runtimePath`, `runtimeKind`, `cachePath`, or `cacheResourceRef` as public successful output

#### Scenario: ReadDocumentImage materializes internally

- **WHEN** `ReadDocumentImage` resolves document locators or page indexes to images
- **THEN** document image materialization SHALL occur behind the Agent content-access runtime and resource cache provider
- **AND** the tool SHALL return stable refs and provider-ready attachments without exposing the materialized cache path as durable identity

### Requirement: Resource cache owns cache path and lifecycle

`ResourceCacheService` SHALL be the sole owner of resource cache path layout, variant keys, fingerprints, MD5/content de-duplication, materialization, rebuild, invalidation, projection, and GC. Agent tools and Webview presenters MUST treat cache artifacts as transparent implementation details.

#### Scenario: Cache miss is rebuilt through cache service

- **WHEN** an Agent tool requests a document image or other cacheable resource whose cache file is missing but whose source/ref can be rebuilt
- **THEN** the content-access runtime SHALL request materialization through `ResourceCacheService`
- **AND** the Agent-facing result SHALL remain expressed as stable source/ref metadata

#### Scenario: Cache path input is rejected for new requests

- **WHEN** an Agent tool or transfer payload provides a `.neko/.cache/resources` path, document-reader scratch path, legacy `cachePath`, `runtimePath`, `cacheResourceRef`, Webview URI, blob URL, or Engine token as durable resource identity
- **THEN** the request SHALL fail closed or return a diagnostic
- **AND** it SHALL NOT recover success by reverse-looking-up the cache path in the cache manifest

### Requirement: Permissions are enforced by the unified content access boundary

Agent content access SHALL enforce workspace, media library, extension-private, Engine file access, resource cache, and Webview projection permissions at the Host boundary. Agent tools MUST receive typed diagnostics for unauthorized, unresolved, unsupported, stale, missing, non-portable, and service-unavailable states.

#### Scenario: Unauthorized media library source

- **WHEN** an Agent tool requests a file outside workspace and outside configured authorized media library roots
- **THEN** the unified content access boundary SHALL return an unauthorized diagnostic
- **AND** the tool SHALL NOT retry through direct file reads or cache-path fallback

#### Scenario: Extension-private resource is not portable

- **WHEN** an Agent result references an extension-private cache resource without a project workspace scope
- **THEN** the result SHALL mark it as non-portable or fail for cross-package transfer
- **AND** Canvas, Storyboard, and composite handoff SHALL receive stable diagnostics rather than a private cache path

### Requirement: Legacy cache and runtime fields are migration-only

Legacy Agent fields that expose cache or runtime implementation details SHALL be accepted only in explicitly scoped migration, rejection, or diagnostic tests. New successful tool, Webview, Canvas, Storyboard, and composite paths MUST use stable refs, source refs, workspace-relative paths, `${VAR}/path`, or asset/entity IDs.

#### Scenario: Legacy field appears in a new tool input

- **WHEN** a new `ReadImage`, `ReadDocument`, `ReadDocumentImage`, Canvas transfer, Storyboard transfer, or composite artifact request includes `cachePath`, `runtimePath`, `runtimeKind`, `cacheResourceRef`, `imagePaths`, or `imageInfo.path` as a durable source
- **THEN** the request SHALL be rejected or sanitized with a diagnostic before downstream handoff
- **AND** tests SHALL prove the legacy field cannot produce a successful new-path result

#### Scenario: Existing memory is sanitized before reuse

- **WHEN** working memory or message projection encounters historic tool results containing cache or runtime paths
- **THEN** it SHALL strip those fields before exposing reusable Agent context
- **AND** it SHALL preserve stable refs, source refs, locators, labels, dimensions, and diagnostics when available

### Requirement: Host-specific projection stays at host adapter boundaries

Agent, Agent types, Platform, and shared content-access contracts SHALL remain host-neutral. They MUST NOT expose Webview-only runtime handles or TUI-only presentation details as durable or cross-layer DTO fields. `webviewUri`, `WebviewGeneratedAsset`, Webview message schemas, and terminal display strings SHALL be created only by the owning Extension/Webview/TUI adapter after stable source refs or `ResourceRef`s have been resolved.

#### Scenario: Generated asset result crosses Agent and Platform layers

- **WHEN** a media task, generated asset, or tool result crosses through `agent-types`, `agent`, or `platform`
- **THEN** the payload SHALL use stable generated asset metadata, source refs, `ResourceRef`s, asset/entity IDs, or host-neutral renderable resource descriptors
- **AND** it SHALL NOT require `WebviewGeneratedAsset` or `webviewUri` to represent asset identity

#### Scenario: Webview projection is requested for display

- **WHEN** Extension needs to display a generated asset, document image, media task result, or tool attachment in a Webview
- **THEN** Extension SHALL request projection through `LocalResourceAccessService` or `ResourceCacheService.project()`
- **AND** `webviewUri` SHALL be treated as a short-lived display field owned by that Webview projection

### Requirement: Extension projection failures are fail-visible

Extension Host bridge code SHALL NOT return raw local paths, cache paths, or unverified source paths as Webview-safe URIs when projection fails. Projection failures MUST return typed diagnostics, omit the renderable projection, or fail closed according to caller intent.

#### Scenario: Local resource access cannot project a cache artifact

- **WHEN** `LocalResourceAccessService` or `ResourceCacheService.project()` cannot produce a Webview-safe URI for a cache artifact or generated asset
- **THEN** the Extension bridge SHALL surface a projection diagnostic or omit the renderable URI
- **AND** it SHALL NOT set `webviewUri`, `url`, `thumbnailUrl`, or equivalent renderable fields to the raw filesystem path

### Requirement: Agent runtime APIs are host-neutral

Agent runtime APIs SHALL model turns, streams, media tasks, context updates, skills, and conversations as host-neutral events or projections. Webview and TUI message schemas SHALL be built by their owning adapters. Compatibility Webview-named runtime exports MAY exist only as tracked migration shims with owner, replacement, expiry, and tests that prevent new callers from depending on them.

#### Scenario: Runtime emits stream progress

- **WHEN** Agent runtime processes streaming text, thinking, tool calls, tool results, or media progress
- **THEN** it SHALL emit host-neutral runtime events/projections
- **AND** Webview-specific `postMessage` payloads SHALL be assembled by the Extension/Webview bridge rather than being the canonical runtime API

### Requirement: TUI does not expose cache paths as stable success output

TUI and CLI flows SHALL treat managed cache directories as internal implementation details. Terminal output MAY show user-selected save locations, stable asset IDs, source refs, or explicit debug diagnostics, but it MUST NOT present `.neko/.cache/...` as the durable success contract for generated or cached resources.

#### Scenario: Media task completes in TUI

- **WHEN** a media generation task completes in TUI or CLI mode
- **THEN** the success output SHALL identify a stable saved output, asset/resource identity, or configured user-facing output location
- **AND** it SHALL NOT instruct the user to consume `.neko/.cache/generated` or another managed cache directory as the stable result
