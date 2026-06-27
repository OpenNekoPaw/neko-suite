## Context

Generated media currently crosses several user-facing surfaces: Agent task backfill, message attachments, perception cards, Canvas generated image import, storyboard generated media refs, search projections, and entity/asset binding flows. Some contracts already strip host paths and use `generated-assets/...` refs, but other content-access tests and validators still allow a promoted generated asset to live under `.neko/.cache/generated`.

That mixes three different lifecycles:

- cache artifacts that are safe to delete and rebuild;
- generated drafts that are user-visible but not yet saved;
- generated assets that the user has retained and expects to survive cache cleanup.

The change is prelaunch-breaking: old generated cache success paths should be disconnected before wiring replacement flows, so tests prove the canonical path is used.

## Goals / Non-Goals

**Goals:**

- Make generated source assets durable only after Promote/Create Asset.
- Remove `.neko/.cache/generated` as a promoted generated asset success path.
- Keep ResourceCache focused on rebuildable variants and metadata.
- Preserve current-session display of unsaved generated drafts without pretending they are saved project facts.
- Add diagnostics and migration hooks for existing cache-backed generated records.
- Keep Agent, Webview, Canvas, Storyboard, Search, and package/export payloads cache-path transparent.

**Non-Goals:**

- Build a full asset-library UI.
- Migrate all historical user data silently.
- Replace ResourceCache JSON manifest with SQLite in this change.
- Change provider generation APIs beyond storage/promotion boundaries.
- Store large binary blobs in SQLite.

## Decisions

### Decision 1: Generated source assets are not ResourceCache variants

Promoted generated images, videos, audio, and storyboards are source artifacts. They belong to AssetStore, a generated asset store, workspace files, or media-library files. ResourceCache may store only their derived variants such as thumbnail, preview, proxy, waveform, or metadata.

Alternative considered: keep generated source files in `.neko/.cache/generated` and mark them `promoted`. This keeps implementation smaller but violates the cache deletion contract and makes cache paths durable identity.

### Decision 2: Use explicit generated lifecycle states

Generated output must be classified as:

| State | Owner | Path class | Durable |
| --- | --- | --- | --- |
| `scratch` | provider/session | system temp or provider-private | no |
| `draft` | Host generated draft store | `.neko/.cache/resources/generated-drafts/` or `globalStorageUri/resources/generated-drafts/` | no |
| `promoted` | AssetStore / GeneratedAssetStore | `neko/generated/<kind>/`, media-library, or asset-managed root | yes |
| `derivative` | ResourceCache | `.neko/.cache/resources/...` | no |

Drafts can be displayed, pinned for the session, and promoted. They cannot be sent across durable boundaries without promotion.

### Decision 3: Generated output ingest writes to durable roots

`GeneratedOutputContentIngestProvider` should resolve `destination.kind === "generated-assets"` to a durable generated asset root, not `.neko/.cache/generated`. Recommended default:

- workspace project generated root: `<workspace>/neko/generated/<media-kind>/`;
- asset-library root when an asset library destination is selected;
- media-library root when user explicitly chooses a media library variable;
- no-workspace retained output requires user-selected save path or extension-private draft only.

The provider should return a `ContentGeneratedAssetSourceRef` with `promoted: true` only after writing/copying into a durable root and contracting the path to workspace-relative or `${VAR}/path`.

### Decision 4: Unsaved generated drafts use runtime projections

Agent task completion and provider progress may show generated drafts before promotion. Backfill can include a draft ref and render projection, but durable fields such as `resultUrls`, `attachments.path`, Canvas nodes, storyboard `generatedMediaRefs`, package manifests, and search facts must not contain cache paths.

If a draft needs cross-domain use, the Host must run Promote/Create Asset first, then emit the promoted ref.

### Decision 5: Legacy generated cache records fail closed

Existing records that claim `promoted: true` while pointing under `.neko/.cache` are invalid durable sources. Loading code should:

- produce a diagnostic such as `generated-cache-source-not-durable`;
- keep current-session preview only if the file still exists and Host projection permits it;
- offer explicit Promote/Create Asset migration;
- avoid silent use in export/package/entity binding/Canvas durable save.

### Decision 6: Cache manifests remain weak indexes

This change does not delete ResourceCache manifests. It narrows their scope. A manifest/SQLite row can describe generated derivatives and unsaved drafts for GC and diagnostics, but not promoted generated source identity. Missing cache files must become cache misses or rebuilds, never Agent-visible path failures.

## Risks / Trade-offs

- [Risk] Existing tests and fixtures assume `.neko/.cache/generated` is promoted.
  → Mitigation: update tests to expect diagnostics first, then add canonical durable-root tests.

- [Risk] Unsaved generated results may disappear after cache cleanup.
  → Mitigation: UI/backfill must label them as drafts and provide Save/Promote actions before durable use.

- [Risk] Workspace `neko/generated` can grow quickly.
  → Mitigation: only promoted/user-retained outputs land there; drafts remain cache-managed and GC-able.

- [Risk] No-workspace generated results have no durable project root.
  → Mitigation: keep them extension-private drafts until the user selects Save/Promote destination.

- [Risk] Feature packages may still consume `generatedAsset.path`.
  → Mitigation: boundary checks and tests must reject cache paths in durable generated refs; render surfaces use projection DTOs.

## Migration Plan

1. Disconnect old success path:
   - Remove the generated-cache exception from `validateContentIngestResult`.
   - Change tests that currently allow `.neko/.cache/generated` as promoted output to expect diagnostics.
   - Add guard checks for durable generated refs containing `.neko/.cache`.

2. Introduce durable generated output policy:
   - Add helpers to resolve generated asset durable roots.
   - Update `GeneratedOutputContentIngestProvider` to write promoted outputs outside cache.
   - Contract paths to workspace-relative or `${VAR}/path`.

3. Separate drafts from promoted assets:
   - Define generated draft refs/projections for current-session display.
   - Ensure Agent backfill and Webview attachments do not persist cache paths for drafts.
   - Require Promote/Create Asset before send-to-Canvas, entity binding, export, package, or asset-library add.

4. Narrow ResourceCache generated support:
   - Rename or replace `GeneratedAssetResourceCacheProvider` as a generated derivative provider.
   - Reject `variant.role === "source"` for generated assets in ResourceCache.
   - Keep thumbnail/preview/proxy/metadata variants keyed by promoted generated source refs.

5. Add legacy diagnostics and migration hooks:
   - Detect `.neko/.cache/generated` in generated records, search projection, Canvas/storyboard refs, and Agent histories.
   - Return fail-visible diagnostics and optional Promote/Create Asset actions.

6. Validate:
   - Run content-access contract tests.
   - Run Agent/Webview generated backfill tests.
   - Run ResourceCache provider tests.
   - Run boundary scripts for cache path leakage.

Rollback strategy: because this is prelaunch, rollback is code-level only. If needed, keep a migration-only reader that reports diagnostics for old records, but do not re-enable cache-backed promoted success.

## Open Questions

- Should the default durable workspace path be `neko/generated/<kind>/` or AssetStore-owned `neko/assets/generated/<kind>/`?
- Should generated drafts have an explicit TTL setting in this change or defer to ResourceCache GC policy?
- Which UI surfaces should expose the first Save/Promote affordance: Agent result card, Canvas import menu, Assets panel, or all of them?
