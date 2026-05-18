## Why

Project search and Agent mention completion currently read from several independent indexes and cache files. Story indexes are warmed on activation, media search is lazy, creative entity graphs may stay stale, and Agent mention search reads `.neko/.cache/*` directly; as a result, newly opened projects, updated Fountain files, asset library changes, and unified entity candidates can appear differently in Preview, Agent, and library UI.

This change introduces one project-level cache and search service contract so facts, derived indexes, freshness, incremental updates, and query behavior are shared across Story, Assets, Agent, and future project-aware tools.

## What Changes

- Add a unified project cache/search service that runs in Extension/Platform code and exposes query, refresh, status, and change-event APIs.
- Define a shared search item contract for scenes, script roles, confirmed creative entities, entity candidates, asset-library entries, media files, documents, and future project resources.
- Separate authoritative Git-trackable project facts from derived local caches:
  - facts remain under `neko/` or existing project metadata files,
  - derived indexes remain under `.neko/.cache/` and are rebuildable.
- Start lightweight indexing automatically when a project opens; keep expensive media probing, thumbnailing, embedding, and deep analysis deferred, idle, or on demand.
- Route Agent mention completion and project search through the service instead of reading cache JSON directly.
- Update cache freshness on document changes, file watcher events, asset library changes, settings/path changes, and entity fact updates.
- Support multi-root/project-context aware search so a query for `@~/git/neko-test/cases/test.fountain` resolves against the owning project rather than always using the first workspace folder.
- Support name normalization and aliases for Chinese/English names, filenames, display names, canonical entity names, and extracted script role names.

No breaking changes are intended. Existing cache files and service implementations can be adapted behind the new facade during migration.

## Capabilities

### New Capabilities

- `project-cache-search-service`: Project-level cache partitioning, background indexing, incremental invalidation, unified query contract, freshness reporting, and Agent/Webview search integration.

### Modified Capabilities

- `creative-entity-asset-composition`: Creative entity search shall include confirmed entities and script-derived entity candidates without requiring a visual identity or bound asset.

## Impact

- `packages/neko-types`: shared contracts for project search queries, items, refs, cache partitions, freshness, update reasons, and index status.
- `packages/neko-story/packages/extension`: index coordinator integration for Fountain/story files, script roles, scenes, sections, and creative entity candidates.
- `packages/neko-assets`: media/asset library index adapter, freshness tracking, and search service integration without forcing heavy media analysis at project open.
- `packages/neko-agent/packages/extension`: Agent mention search uses the project cache/search service with context file path/project root resolution instead of direct cache-file reads.
- `packages/neko-agent/packages/webview`: mention result rendering can consume richer item kinds, icons, aliases, and freshness metadata without knowing cache-file paths.
- `packages/neko-types/src/types/storage.ts` and related path settings: cache paths remain local and derived; Git-trackable facts remain outside `.neko/.cache/`.
- Tests: query normalization, cache invalidation, background indexing, stale-while-revalidate behavior, multi-root path resolution, and Agent mention search across script entities, assets, media, documents, and unified entities.
