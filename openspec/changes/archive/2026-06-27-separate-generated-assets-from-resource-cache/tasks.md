## 1. Disconnect Old Generated Cache Success Paths

- [x] 1.1 Remove the generated-cache exception from `validateContentIngestResult()` so `.neko/.cache/generated` is rejected for durable `generated-output` results.
- [x] 1.2 Update content-access contract tests that currently allow promoted generated outputs in `.neko/.cache/generated` to expect fail-closed diagnostics.
- [x] 1.3 Update `GeneratedOutputContentIngestProvider` tests that expect `.neko/.cache/generated` output to reject cache destinations or use a durable generated asset root.
- [x] 1.4 Add boundary checks that fail production and test code when durable generated payloads use `.neko/.cache/generated`, `.neko/.cache/resources`, `cachePath`, or raw local cache paths as generated source identity.

## 2. Define Durable Generated Asset Roots

- [x] 2.1 Add shared path helpers for generated asset durable roots, including workspace `neko/generated/<media-kind>/` and media-library/asset-store destinations.
- [x] 2.2 Update content ingest destination validation so `generated-assets` requires a durable root or an explicit migration/promote action.
- [x] 2.3 Ensure generated output paths are contracted to workspace-relative or `${VAR}/path` before returning `ContentGeneratedAssetSourceRef`.
- [x] 2.4 Add tests for image, audio, video, and storyboard generated outputs written to durable generated asset roots.

## 3. Separate Drafts From Promoted Assets

- [x] 3.1 Introduce or normalize generated draft refs/projections for current-session generated results that are visible but not saved.
- [x] 3.2 Update Agent media task backfill so unsaved drafts do not persist cache paths in `resultUrls`, attachments, perception cards, or durable task results.
- [x] 3.3 Require Promote/Create Asset before send-to-Canvas, entity binding, asset-library add, final export, package, or durable storyboard generated refs.
- [x] 3.4 Add UI/projection diagnostics for unsaved drafts when users attempt durable cross-domain use.

## 4. Narrow ResourceCache Generated Support

- [x] 4.1 Rename or replace `GeneratedAssetResourceCacheProvider` so it only handles generated derivatives, not generated source assets.
- [x] 4.2 Reject `variant.role === "source"` for generated assets in ResourceCache.
- [x] 4.3 Keep thumbnail, preview, proxy, waveform, and metadata variants keyed by promoted generated source refs.
- [x] 4.4 Add ResourceCache tests showing cache deletion does not delete or invalidate promoted generated sources and derivatives rebuild on demand.

## 5. Legacy Diagnostics And Migration

- [x] 5.1 Detect legacy generated records that are marked promoted but point under `.neko/.cache`.
- [x] 5.2 Return `generated-cache-source-not-durable` diagnostics for Agent history, Search projection, Canvas nodes, Storyboard media refs, and generated indexes.
- [x] 5.3 Provide Host-side Promote/Create Asset migration hooks for existing cache files that still exist.
- [x] 5.4 Add tests proving legacy cache-backed generated records do not return durable success without explicit migration.

## 6. Documentation And Quality Gates

- [x] 6.1 Update `docs/architecture/cache-file-access-and-paths.md`, `docs/architecture/adr-local-metadata-store-sqlite.md`, and `openspec/project.md` if implementation choices change.
- [x] 6.2 Update code review/boundary docs to include generated asset vs ResourceCache classification checks.
- [x] 6.3 Run focused TypeScript and Vitest suites for `@neko/shared`, `@neko-agent/extension`, `@neko-agent/webview`, and affected generated asset consumers.
- [x] 6.4 Run `node scripts/check-content-access-boundaries.mjs` and `node scripts/check-neko-agent-boundaries.mjs`.
