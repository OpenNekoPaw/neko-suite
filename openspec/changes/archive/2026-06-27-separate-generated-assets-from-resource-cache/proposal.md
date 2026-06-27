## Why

Generated media is already user-visible in Agent task results, Canvas imports, entity bindings, and storyboard outputs, but parts of the current content-access contract still allow promoted generated assets to be represented by `.neko/.cache/generated` paths. That makes cache cleanup capable of breaking user-visible work and keeps Agent/Webview/Canvas flows coupled to cache layout.

This change separates generated source assets from rebuildable ResourceCache variants so deleting cache never deletes retained generated work, and stale cache metadata can no longer block Agent or cross-domain content access.

## What Changes

- **BREAKING**: Disallow `.neko/.cache/generated` and `.neko/.cache/resources` paths as promoted generated asset success outputs.
- **BREAKING**: Remove the generated-cache exception in content ingest validation; generated outputs retained by the user must be promoted to AssetStore, workspace/media-library files, or a generated asset store.
- Introduce a generated asset lifecycle split:
  - provider scratch: private, not user-visible, disposable;
  - unsaved generated draft: session/cache-backed projection only, user-visible but not durable;
  - promoted generated asset: durable source identity outside cache;
  - generated derivative: rebuildable thumbnail/preview/proxy/metadata in ResourceCache.
- Update content ingest/provider behavior so `generated-output` writes retained outputs to durable generated asset roots, not cache roots.
- Update Agent/Webview/Canvas transfer contracts to consume `generated-assets/...`, `AssetRef`, `GeneratedAssetRef`, or `ResourceRef` projections, never cache paths.
- Add migration/diagnostic behavior for existing `.neko/.cache/generated` promoted records: fail closed for durable use, offer Promote/Create Asset, and avoid pretending cache paths are saved assets.
- Update boundary and quality checks to reject generated cache paths in durable payloads and tests.

## Capabilities

### New Capabilities

- `generated-asset-lifecycle`: Defines generated media storage states, promotion rules, durable references, and cross-domain handoff requirements.
- `resource-cache-derived-variants`: Defines ResourceCache as an owner of rebuildable variants only, including generated derivatives but excluding generated source assets.

### Modified Capabilities

- None.

## Impact

- Affected contracts:
  - `packages/neko-types/src/types/content-access.ts`
  - `packages/neko-types/src/types/generated-asset.ts`
  - generated asset and storyboard media ref contracts in `@neko/shared`
- Affected Host services:
  - `GeneratedOutputContentIngestProvider`
  - ResourceCache providers and validation
  - Agent media delivery/backfill projection
  - Search generated asset projection
- Affected feature packages:
  - `neko-agent` generated media task results and perception cards
  - `neko-canvas` generated asset import/send flows
  - `neko-assets` asset registration/promote flows
  - `neko-cut`, `neko-sketch`, and storyboard import paths that consume generated media refs
- Storage impact:
  - New durable generated asset root policy, for example `neko/generated/<media-kind>/` or AssetStore-managed file roots.
  - `.neko/.cache/resources/generated-drafts/` remains only for unsaved drafts and rebuildable projections.
  - `.neko/.cache/generated/index.json` becomes a migration source for generated draft/projection metadata, not a durable asset fact source.
