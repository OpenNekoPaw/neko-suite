## Why

Neko Suite has a mature storage layout and a unified Webview local-resource projection boundary, but cache ownership is still fragmented across Agent, Assets, Canvas, Preview, and engine surfaces. Document images, thumbnails, preview variants, media metadata, and generated references can be cached in different package-owned locations and passed around as absolute `cachePath` values, which makes Agent-to-Canvas image binding brittle and causes allowed-root failures when one extension tries to display another extension's private cache.

This change introduces a project-first unified resource cache service so package workflows exchange stable resource references, not private absolute cache paths, while missing derived artifacts can be materialized, projected, invalidated, and garbage-collected through one host-owned contract.

## What Changes

- Add a shared `ResourceRef` / `ResourceVariantRef` contract for derived resource identity, source fingerprints, locators, variants, scope, and cache status.
- Add a host-side resource cache service for:
  - `ensure(ref, variant)` to materialize missing cache artifacts,
  - `resolve(ref, variant)` to return an authorized local file path,
  - `project(ref, variant, webview)` to return a Webview-safe URI through the existing local-resource access service,
  - `invalidate(ref)` and `gc(policy)` for cache lifecycle management.
- Make workspace `.neko/.cache/resources/` the default location for project-bound derived artifacts such as document extracted images, storyboard reference images, thumbnails, preview variants, and media-derived helper files.
- Keep `~/.neko/` for cross-project/user-level caches and keep `context.globalStorageUri` for extension-private scratch or no-workspace fallback only.
- Introduce provider registration so document/archive, media thumbnail, preview variant, generated asset, and future multimodal cache producers can materialize artifacts without tight package coupling.
- Replace cross-package reliance on Agent document-image `cachePath` with stable refs plus service materialization/projection, preserving legacy `cachePath` only as migration metadata.
- Add cache manifests and stats sufficient for source freshness, missing-artifact detection, quota policy, and LRU-style garbage collection.
- Align `storage-strategy.md` with the structured-data persistence ADR by marking AssetGraph/VectorStore implementation details as superseded by SQLite cache planning where relevant.
- No intentional breaking change to existing project files; stored absolute cache paths remain readable during migration but should not be written as the primary durable identity.

## Capabilities

### New Capabilities

- `resource-cache-service`: Defines stable resource cache identity, workspace/user cache placement, materialization, projection, missing-artifact recovery, manifest/status tracking, and cache quota governance.

### Modified Capabilities

- `project-cache-search-service`: Search and UI consumers should consume resource refs or host-projected thumbnails for cache-backed visuals rather than reading package-local cache paths or cache schemas.

## Impact

- `packages/neko-types`: shared resource cache contracts, branded path/ref types, guards, and test fixtures.
- `packages/neko-types/src/types/storage.ts`: cache layout additions for resource cache roots, manifest/database path, and quota stats.
- `packages/neko-types/src/vscode/extension`: VSCode host implementation that composes the new resource cache service with `LocalResourceAccessService`.
- `packages/neko-agent`: document image extraction and storyboard transfer should emit resource refs and use `ensure/project` for thumbnails and Canvas transfer.
- `packages/neko-canvas`: imported storyboard/document reference images should resolve through resource refs and request materialization instead of trusting Agent private cache paths.
- `packages/neko-assets`: thumbnail and media metadata cache integration can register providers and publish cache stats without losing existing cache behavior.
- `packages/neko-preview`: preview variant registration should integrate as a provider or consumer without turning preview engine allowed roots into the cache authority.
- `packages/neko-engine`: may later own SQLite-backed cache index/stat operations, but first implementation can use JSON manifests with the same interface.
- Documentation: update storage/local-resource/document/agent media architecture docs to clarify workspace-first project caches, user-level cross-project caches, and `globalStorageUri` limits.
- Tests: shared contract tests, fake provider materialization tests, missing-cache recovery tests, Agent-to-Canvas document image transfer tests, quota/gc policy tests, and boundary tests proving Webviews do not read cache files directly.
