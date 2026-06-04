## ADDED Requirements

### Requirement: Stable Resource Cache References
The system SHALL represent cache-backed resources with stable resource references that include scope, provider, source identity, optional locator, variant role, and source fingerprint metadata instead of using absolute cache paths as the durable identity.

#### Scenario: Document image reference carries source locator
- **WHEN** Agent extracts or references an image from a document entry
- **THEN** the resulting resource reference includes the document source, entry or page locator, variant role, provider id, and source fingerprint metadata

#### Scenario: Stored storyboard reference avoids private cache identity
- **WHEN** Agent sends a storyboard shot with a reference image to Canvas
- **THEN** the transfer payload includes a stable resource reference and does not require Canvas to trust an Agent-private absolute `cachePath` as the primary identity

#### Scenario: Legacy cache path remains migration metadata
- **WHEN** an existing payload contains only a legacy absolute `cachePath`
- **THEN** the system MAY use that path for compatibility projection but SHALL NOT treat it as a complete durable resource identity when source and locator metadata are missing

### Requirement: Project-Bound Resources Use Workspace Cache
The system SHALL store project-bound derived cache artifacts under the workspace `.neko/.cache/resources/` hierarchy by default.

#### Scenario: Document extracted image is project cache artifact
- **WHEN** a document image is extracted for a project workflow such as storyboard generation or Canvas display
- **THEN** the materialized image is stored under the current project `.neko/.cache/resources/` hierarchy rather than another extension's private `globalStorageUri`

#### Scenario: Thumbnail is project cache artifact
- **WHEN** a thumbnail is generated for a project media asset, document page, generated asset, or Canvas-visible resource
- **THEN** the thumbnail is stored or indexed as a project cache artifact under workspace cache

#### Scenario: User-level cache is reserved for cross-project data
- **WHEN** a cache artifact belongs to marketplace downloads, model downloads, stock assets, or another cross-project user resource
- **THEN** the artifact uses user-level cache scope rather than project cache scope

#### Scenario: Extension-private cache is not portable
- **WHEN** a resource exists only under an extension-private cache or no-workspace fallback
- **THEN** cross-package consumers receive an explicit non-portable or unresolved status unless the resource is copied or regenerated into an approved shared cache scope

### Requirement: Resource Cache Service Materializes Missing Variants
The system SHALL provide a host-side resource cache service that can ensure, resolve, project, invalidate, and garbage-collect resource variants.

#### Scenario: Missing document image is regenerated
- **WHEN** Canvas requests a document image variant whose cached file is missing but whose resource reference includes a supported document source and locator
- **THEN** the cache service calls a registered provider to materialize the image before returning a ready result

#### Scenario: Unsupported materialization is explicit
- **WHEN** a caller requests a variant for a resource that no registered provider can materialize
- **THEN** the cache service returns an unsupported status instead of guessing a path or silently using an unrelated image

#### Scenario: Resolve returns authorized path
- **WHEN** a caller resolves a ready resource variant
- **THEN** the cache service returns a local path only if the artifact is inside an approved cache, workspace, or media-library root for that resource scope

#### Scenario: Invalidate marks stale entries
- **WHEN** the source fingerprint for a resource no longer matches the current source state
- **THEN** the cache service marks dependent variants stale or invalidates them before future reads

### Requirement: Webview Projection Uses Local Resource Access
The resource cache service SHALL project local cache artifacts to Webview-safe URIs by delegating authorization and URI conversion to the unified local resource access service.

#### Scenario: Ready variant projects to Webview URI
- **WHEN** a Webview requests a ready resource variant
- **THEN** the resource cache service resolves the variant and returns a URI produced through the local resource access service

#### Scenario: Unauthorized private path is rejected
- **WHEN** a resolved artifact path is outside approved local resource roots for the target Webview
- **THEN** the projection returns an unauthorized status and does not add filesystem root, user home, system temp, or arbitrary extension-private roots

#### Scenario: Project cache root is authorized
- **WHEN** a project-bound resource variant is materialized under `.neko/.cache/resources/`
- **THEN** the target Webview can receive a projected URI after the workspace cache root is included in authorized local resource roots

### Requirement: Providers Materialize Resource Kinds
The system SHALL support provider registration for materializing and probing resource variants without coupling consumers to concrete package implementations.

#### Scenario: Document provider materializes archive entry
- **WHEN** a resource reference describes a document archive entry, page, or locator supported by the document provider
- **THEN** the document provider can materialize the requested image or entry variant through the shared document source and locator contract

#### Scenario: Thumbnail provider wraps existing thumbnail generation
- **WHEN** a resource reference describes a media or generated asset thumbnail
- **THEN** the thumbnail provider can reuse existing thumbnail generation behavior while recording the result in the unified cache manifest

#### Scenario: Preview provider does not own cache identity
- **WHEN** a preview variant is requested for display
- **THEN** the preview provider can generate or locate the display variant while the resource cache service remains the authority for cache identity, status, and lifecycle metadata

#### Scenario: Provider failure is isolated
- **WHEN** one provider fails to materialize a variant
- **THEN** the cache service reports the failure for that variant without corrupting unrelated manifest entries or blocking other providers

### Requirement: Cache Manifest Tracks Mapping And Freshness
The system SHALL persist a rebuildable cache manifest or equivalent cache index that maps resource refs and variants to artifacts, source fingerprints, size, mime type, dimensions, last access, status, and provider metadata.

#### Scenario: Manifest maps resource to artifact
- **WHEN** a provider materializes a resource variant
- **THEN** the cache manifest records the resource id, variant role, local artifact path or relative cache path, source fingerprint, and freshness metadata

#### Scenario: Missing file is detected
- **WHEN** a manifest entry points to an artifact that no longer exists on disk
- **THEN** the cache service reports the variant as missing and attempts materialization only if the resource reference and provider support it

#### Scenario: Stale source is detected
- **WHEN** a source file's size, mtime, hash, or provider fingerprint differs from the manifest entry
- **THEN** the cache service marks affected variants stale before returning them as ready

#### Scenario: Manifest is rebuildable
- **WHEN** the cache manifest is missing or invalid
- **THEN** the system treats it as a cache miss and rebuilds entries from source refs or provider probes without deleting project facts

### Requirement: Cache Quota And Garbage Collection
The system SHALL expose cache stats and configurable garbage collection policies for project and user cache scopes.

#### Scenario: Project cache stats are reported
- **WHEN** a caller requests cache stats for a project
- **THEN** the service reports total size, entry count, scope distribution, provider distribution, stale count, missing count, and last access metadata when available

#### Scenario: GC evicts rebuildable least-recent variants
- **WHEN** project cache usage exceeds the configured quota
- **THEN** garbage collection evicts rebuildable unpinned variants using last-access and provider availability metadata before deleting any pinned or non-rebuildable artifacts

#### Scenario: User can configure project cache limit
- **WHEN** the user or project-local settings define a project cache size limit
- **THEN** the resource cache service applies that limit to workspace project cache without changing global user cache limits

#### Scenario: GC never deletes project facts
- **WHEN** garbage collection runs
- **THEN** it deletes only managed cache artifacts and manifest entries, never files under Git-tracked project facts, media-library source files, or user-selected original assets

### Requirement: Brand Cache Path Categories
The system SHALL distinguish project cache paths, global cache paths, extension-private cache paths, project fact paths, and source asset paths at the shared contract level to reduce accidental cross-category usage.

#### Scenario: Project cache API rejects project fact path
- **WHEN** code attempts to register a Git-tracked project fact path as a managed cache artifact
- **THEN** shared guards or typed helpers reject the path category or require an explicit source asset registration path

#### Scenario: Global cache is not used for project variant by default
- **WHEN** a provider materializes a project-scoped resource variant
- **THEN** path helpers resolve the artifact under project cache scope unless the caller explicitly requested a supported global resource scope

### Requirement: Legacy Cache Paths Migrate Incrementally
The system SHALL support incremental migration from legacy package-local cache paths to stable resource refs without breaking existing sessions.

#### Scenario: Agent emits both during transition
- **WHEN** Agent produces a document image or storyboard transfer during the migration window
- **THEN** it includes the stable resource reference and MAY include legacy `cachePath` compatibility metadata

#### Scenario: Canvas prefers resource ref
- **WHEN** Canvas receives both a resource reference and a legacy cache path
- **THEN** Canvas uses the resource cache service for materialization and projection before falling back to legacy path projection

#### Scenario: Unrecoverable legacy path is visible
- **WHEN** only a legacy cache path is present and the file is missing
- **THEN** the UI receives a cache-missing or unrecoverable status rather than displaying the wrong image or reusing the previous sequential thumbnail
