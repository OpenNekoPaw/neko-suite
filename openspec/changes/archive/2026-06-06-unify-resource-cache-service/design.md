## Context

Neko Suite already has the right storage shape:

- `~/.neko/` is user-level global storage.
- `<project>/neko/` stores Git-tracked project facts.
- `<project>/.neko/` stores project-local personal state.
- `<project>/.neko/.cache/` stores rebuildable project cache.

Neko Suite also has a unified Webview local-resource access service. That service answers a different question: "May this Webview load this local file, and what URI should it use?" It does not answer "Who owns this cache artifact?", "Can it be regenerated?", "Which source/locator produced it?", "Which variant is missing?", or "How much disk can this cache use?"

The gap shows up most clearly in Agent document image and storyboard transfer flows. Agent can extract EPUB/CBZ/DOCX images into its `globalStorageUri/document-image-cache` and display them in its own Webview, but Canvas and Preview then receive an absolute `cachePath` that belongs to another extension's private storage. Canvas can sometimes authorize the path as a feature root, but it cannot reliably know whether the cache is stale, missing, reused for multiple shots, or should be regenerated from the original document entry.

Related active changes:

- `unify-local-resource-access` owns Webview root aggregation and `asWebviewUri` projection.
- `unify-document-reading-service` owns document source, manifest, range, cursor, and locator semantics.
- `project-cache-search-service` owns search projections and must not expose cache file schemas to Webviews.
- `adr-structured-data-persistence.md` plans SQLite as a cache index layer, not project fact SSOT.

This design adds a resource cache layer between semantic source refs and display projection.

## Goals / Non-Goals

**Goals:**

- Make project-bound derived resources default to workspace `.neko/.cache/resources/`.
- Represent cache artifacts with stable refs and variants rather than durable absolute paths.
- Provide `ensure`, `resolve`, `project`, `invalidate`, `stats`, and `gc` through one host-owned service.
- Let providers materialize different resource types without coupling Agent, Canvas, Assets, Preview, and Engine directly.
- Detect missing cache artifacts and regenerate them from source refs when a provider can do so.
- Keep Webview resource projection delegated to `LocalResourceAccessService`.
- Support cache quota, LRU-style eviction, and user-configurable cache limits.
- Preserve legacy `cachePath` compatibility during migration.

**Non-Goals:**

- Replacing the existing storage layout or moving project facts into cache.
- Making cache manifests the source of truth for assets, documents, search, entity identity, or generated asset facts.
- Replacing `LocalResourceAccessService`; resource cache uses it for Webview projection.
- Rewriting all cache implementations in SQLite in the first delivery.
- Granting Webviews access to user home, filesystem root, system temp, or another extension's private cache by default.
- Forcing every no-workspace or extension-private scratch workflow into workspace cache.

## Decisions

### Decision 1: Use workspace cache for project-bound derived resources

Project-bound cache artifacts SHALL be stored under:

```text
<project>/.neko/.cache/resources/
  documents/
  thumbnails/
  previews/
  generated/
  media/
  manifest.json
```

This includes document extracted images used by storyboard tables, Canvas shot references, media thumbnails, preview variants, and other derived artifacts that belong to the current project workflow.

User-level cache remains for cross-project data such as marketplace downloads, model downloads, stock cache, and global conversation indexes. `context.globalStorageUri` remains valid for extension-private scratch and no-workspace fallback, but artifacts placed there are not considered portable project resource refs unless explicitly copied or materialized into the project cache.

Alternatives considered:

- Store all caches in user-level global storage. Rejected because project-bound artifacts lose project identity and cross-extension Webview/engine roots become fragile.
- Keep package-owned cache roots. Rejected because Agent-to-Canvas and search/preview flows keep passing private paths instead of stable resource identity.
- Store all transient data in workspace cache. Rejected because global market/model caches and extension-private scratch are not project facts and should not be duplicated per project.

### Decision 2: Resource refs are identity, paths are runtime resolution

The durable contract is a stable resource ref:

```typescript
type ResourceScope = 'project' | 'global' | 'extension-private';

type ResourceVariantRole =
  | 'source'
  | 'thumbnail'
  | 'page-image'
  | 'document-entry'
  | 'preview'
  | 'proxy'
  | 'fov-crop';

interface ResourceRef {
  id: string;
  scope: ResourceScope;
  provider: string;
  kind: 'document' | 'media' | 'generated' | 'preview' | 'storyboard-reference';
  source: ResourceSourceRef;
  locator?: ResourceLocator;
  fingerprint: ResourceFingerprint;
}

interface ResourceVariantRef {
  resource: ResourceRef;
  role: ResourceVariantRole;
  format?: string;
  width?: number;
  height?: number;
}
```

Absolute paths are runtime results from `resolve` or migration metadata from legacy records. Stored project data should prefer `ResourceRef` and path-variable/source refs over `cachePath`.

Alternatives considered:

- Continue passing `cachePath`. Rejected because it cannot tell Canvas how to regenerate a missing image or distinguish two document entries that currently point to the same extracted file path.
- Store only project-relative paths. Rejected because external media libraries, document entry locators, and generated/preview variants need source identity and freshness metadata in addition to a file location.

### Decision 3: Providers materialize variants

The cache service owns orchestration, manifests, locking, and lifecycle. It does not parse every document or generate every thumbnail itself. Providers register materializers:

```typescript
interface ResourceCacheProvider {
  id: string;
  supports(ref: ResourceRef, variant: ResourceVariantRequest): boolean;
  ensure(input: ResourceEnsureInput): Promise<ResourceEnsureResult>;
  probe?(ref: ResourceRef): Promise<ResourceProbeResult>;
  invalidate?(ref: ResourceRef): Promise<void>;
}
```

Initial providers:

- Document/archive provider: materializes EPUB/CBZ/CBR/DOCX/PPTX/XLSX extracted images and page/entry images using document source and locator refs.
- Thumbnail provider: wraps existing `ThumbnailService` behavior and caches under the unified resource root or records legacy entries in the unified manifest.
- Preview provider: coordinates preview variants without making the preview engine's allowed roots the cache identity authority.
- Generated asset provider: maps generated media records to cache refs and thumbnails.

Alternatives considered:

- One large cache service that knows all formats. Rejected because it would pull document, asset, preview, and engine details into one module.
- Let each package implement its own `ensure`. Rejected because callers still need a shared manifest, missing-cache policy, and projection path.

### Decision 4: Compose with LocalResourceAccessService for Webview projection

`ResourceCacheService.project(ref, variant, webview)` SHALL:

1. Call `ensure` or `resolve` according to caller policy.
2. Confirm the local path is under an approved cache root or media-library/workspace root.
3. Delegate URI projection to `LocalResourceAccessService`.

The resource cache service is not allowed to broaden Webview roots to filesystem root, user home, system temp, or arbitrary package-private directories. If a resource is extension-private and the target surface needs durable cross-package display, the service should copy/regenerate it into project cache or return an explicit unresolved status.

Alternatives considered:

- Return raw `file://` or absolute paths to Webviews. Rejected by VSCode Webview constraints.
- Teach Canvas/Preview to manually authorize Agent cache roots. Rejected because it repeats the current stopgap and avoids the real identity problem.

### Decision 5: Manifest first, SQLite later without interface change

The first implementation can use a JSON manifest under `.neko/.cache/resources/manifest.json`:

```typescript
interface ResourceCacheManifest {
  version: 1;
  entries: Record<string, ResourceCacheEntry>;
  stats?: ResourceCacheStats;
}
```

The interface should be compatible with a future SQLite-backed index under `.neko/.cache/neko-cache.db`, as described by `adr-structured-data-persistence.md`. SQLite can later index entries, variants, access times, sizes, and source freshness without changing caller contracts.

Alternatives considered:

- Start with SQLite only. Rejected because it would make the first migration depend on engine DB plumbing before fixing the Agent/Canvas resource identity bug.
- Keep each package's JSON cache. Rejected because stats, quota, and missing recovery stay fragmented.

### Decision 6: Cache status is explicit

`ensure` and `resolve` return structured statuses:

```text
ready
missing
stale
materializing
unsupported
unauthorized
failed
```

Canvas and Agent can render these states without guessing. A missing document image with a valid document source and entry locator should trigger provider materialization. A missing legacy `cachePath` without source/locator should be shown as unrecoverable until the user reopens/reimports the source.

Alternatives considered:

- Throw errors for all misses. Rejected because UI surfaces need graceful fallback and actionable status.
- Silently skip missing variants. Rejected because it hides broken storyboard/image binding.

### Decision 7: Cache quota is scoped and adjustable

The service should expose stats and GC policy:

```typescript
interface ResourceCacheQuotaPolicy {
  projectMaxBytes?: number;
  globalMaxBytes?: number;
  minFreeDiskBytes?: number;
  preservePinned?: boolean;
}
```

Eviction should use safe metadata: scope, lastAccessed, sizeBytes, pinned, materializer availability, and source freshness. Project cache limits can live in project-local/user settings; global cache limits can live in user settings. GC must not delete project facts or user-selected source assets.

Alternatives considered:

- No quota until later. Rejected because document extraction and thumbnails can grow quickly, and the service would lack a lifecycle story.
- One global quota for all cache roots. Rejected because project caches and cross-project caches have different ownership and cleanup expectations.

## Risks / Trade-offs

- [Risk] Providers may disagree about resource ids. -> Mitigation: define deterministic id helpers and shared fingerprint contracts in `neko-types`.
- [Risk] Manifest corruption could hide cache entries. -> Mitigation: use atomic writes and treat invalid manifests as rebuildable cache misses.
- [Risk] Migration from legacy `cachePath` is incomplete. -> Mitigation: keep compatibility reads and write both legacy metadata and new refs during a transition window.
- [Risk] `ensure` can trigger expensive extraction/generation unexpectedly. -> Mitigation: require bounded variants, provider concurrency limits, cancellation support, and caller policy for `materializeIfMissing`.
- [Risk] GC deletes a resource still referenced by an open Webview. -> Mitigation: support pinned/session-active marks and tolerate re-materialization when source refs are available.
- [Risk] No-workspace sessions lack project cache. -> Mitigation: use explicit `extension-private` or `global` fallback scope and do not promise cross-package portability for those refs.
- [Risk] SQLite migration later changes behavior. -> Mitigation: keep JSON manifest and SQLite index behind the same service interface and treat both as rebuildable cache, not SSOT.

## Migration Plan

1. Add shared resource ref, variant, manifest, status, quota, and branded cache path contracts in `neko-types`.
2. Extend `IStorageLayout` with resource cache roots and manifest/database paths.
3. Implement JSON-manifest-backed `ResourceCacheService` with fake-fs tests.
4. Compose `ResourceCacheService.project` with `LocalResourceAccessService`.
5. Add document/archive provider using the unified document reading/source/locator contract.
6. Migrate Agent document image extraction and storyboard transfer to emit `ResourceRef` plus legacy `cachePath`.
7. Migrate Canvas storyboard/document image resolution to call `ensure/project` before display and to stop trusting cross-package private `cachePath`.
8. Register thumbnail and preview providers and progressively map existing caches into the unified manifest.
9. Add stats, quota settings, and GC behavior.
10. Update architecture docs and OpenSpec specs, marking superseded storage strategy sections where SQLite ADR owns future structured cache details.

Rollback strategy:

- Keep existing cache directories and `cachePath` compatibility during the first migration.
- Let packages fall back to legacy path projection when no `ResourceRef` exists.
- Disable individual providers without removing the shared contracts or cache manifest.
- Treat the unified manifest as rebuildable; deleting it should not delete source files or project facts.

## Open Questions

- Should the initial resource cache service live in `@neko/shared/vscode/extension` or a new `neko-resource` package to avoid growing the local-resource-access module?
- Which settings surface should expose project and global cache size limits first: Dashboard, Settings JSON, or command palette?
- Should document extracted images be copied into `.neko/.cache/resources/documents/` immediately, or should existing Agent private cache entries be lazily re-materialized on first Canvas/Preview access?
- Should resource cache entries support user pinning in the first implementation, or only session-active protection plus LRU?
