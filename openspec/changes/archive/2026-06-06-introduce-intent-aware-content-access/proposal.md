## Why

Neko Suite now has stable resource refs and a unified resource cache, but callers still decide ad hoc whether to read cache artifacts, preview variants, proxies, or original files. This creates a correctness risk: realtime previews should use cached/derived variants for speed, while offline operations such as export, packaging, validation, and hashing must use original sources or original container entries.

This change introduces intent-aware content boundaries so every consumer states what it is doing before the host resolves paths, cache variants, engine tokens, bytes, Webview URIs, imports, or generated outputs. It keeps path conversion, cache lifecycle, content reads, and content writes unified by contract while preserving separate responsibilities.

## What Changes

- Add a host-side `ContentAccessService` contract that accepts a stable ref plus an explicit operation intent.
- Add a host-side `ContentIngestService`/write boundary that imports external files, saves generated media, records stable refs, and optionally prewarms cache variants.
- Define operation intents such as `interactive-preview`, `agent-context`, `edit-playback`, `cache-materialize`, `final-export`, `package`, and `verify`.
- Keep `PathResolver` as the required path conversion boundary for source reads and durable source writes.
- Keep `ResourceCacheService` as the required derived-artifact boundary for thumbnails, document/page images, preview variants, proxy artifacts, manifest state, cache repair, and GC.
- Route preview-like intents through `ResourceCacheService`, preview variant APIs, video proxy providers, or Webview projection.
- Route offline intents through original `source` refs, `PathResolver`, engine file tokens, or original document/container entry readers.
- Route imports and generated outputs through the write boundary so durable data receives source refs instead of private cache paths.
- Add guardrails so thumbnails, preview variants, proxy video files, Webview URIs, blob URLs, engine runtime tokens, and legacy `cachePath` values cannot become offline export/package inputs.
- **BREAKING**: new durable Agent/Canvas/content-access payloads must not persist `cachePath`; legacy records may be read only as migration input and must be converted to stable refs or marked unrecoverable.
- Add tests for preview cache reads, final export source reads, package source reads, document entry source extraction, video proxy exclusion from final export, missing-cache recovery behavior, and write/import results that contain stable refs instead of cache paths.

## Capabilities

### New Capabilities

- `intent-aware-content-access`: Defines operation-intent-based content resolution across ResourceRef, DocumentSourceRef, AssetRef, path variables, resource cache, engine file access, and Webview projection.
- `content-ingest-consistency`: Defines the write/import/generated-output boundary that creates durable source refs, contracts paths, and optionally schedules cache materialization without making cache output durable.

### Modified Capabilities

- `canvas-preview-capabilities`: Canvas preview and card rendering must request preview-intent content and must not persist runtime/cache output paths as durable data.
- `asset-export-consistency`: Export and packaging workflows must resolve original sources or original container entries and must not use preview caches, thumbnails, or proxy files unless an explicit draft/proxy export mode is selected.
- `engine-file-access`: Engine-backed source reads for export, packaging, verify, and container entry access must be selected through intent-aware source resolution rather than cache projection.
- `engine-export-preview-orchestration-boundaries`: Export and preview orchestration must remain separated by intent so preview backends may use derived variants while export backends use source-backed inputs.

## Impact

- Affected shared contracts: `packages/neko-types/src/types`, `packages/neko-types/src/vscode/extension`.
- Affected host services: Resource cache adapters, local resource access composition, document access adapters, preview variant adapters, video proxy adapters, source path resolution helpers, and import/generated-output writers.
- Affected consumers: `neko-agent` document/image/storyboard transfer and generated media, `neko-canvas` preview/materialization/import, `neko-cut` proxy/final export paths, `neko-assets` export/package/import flows, and `neko-preview` variant registration.
- Dependencies: reuses `PathResolver`, `ResourceCacheService`, `LocalResourceAccessService`, `DocumentAccessService`, `IStorageLayout`, and engine file access; no new cross-extension direct dependency should be introduced.
