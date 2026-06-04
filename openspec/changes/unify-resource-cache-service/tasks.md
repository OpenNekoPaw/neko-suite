## 1. Shared Contracts And Storage Layout

- [x] 1.1 Add shared `ResourceRef`, `ResourceVariantRef`, `ResourceSourceRef`, `ResourceLocator`, `ResourceFingerprint`, `ResourceCacheStatus`, `ResourceCacheManifest`, `ResourceCacheEntry`, `ResourceCacheStats`, and quota policy types in `packages/neko-types`.
- [x] 1.2 Add runtime guards and deterministic id/fingerprint helpers for resource refs and variants.
- [x] 1.3 Add branded path helpers or category guards for project fact paths, project cache paths, global cache paths, extension-private cache paths, and source asset paths.
- [x] 1.4 Extend `IStorageLayout` with resource cache root, manifest path, and future database/index path under `.neko/.cache/`.
- [x] 1.5 Add shared contract tests for valid refs, invalid refs, path category rejection, deterministic ids, and variant key generation.

## 2. Resource Cache Service Core

- [x] 2.1 Define `ResourceCacheService`, `ResourceCacheProvider`, and provider registry interfaces in a host-compatible shared extension layer.
- [x] 2.2 Implement a JSON-manifest-backed cache store with atomic writes, invalid manifest recovery, and fake-fs tests.
- [x] 2.3 Implement `ensure`, `resolve`, `project`, `invalidate`, `stats`, and `gc` service methods with structured statuses.
- [x] 2.4 Compose `project` with `LocalResourceAccessService` so Webview projection uses existing root authorization and `asWebviewUri` behavior.
- [x] 2.5 Add provider concurrency, duplicate ensure coalescing, cancellation-friendly operation state, and materializing status reporting.
- [x] 2.6 Add tests for ready, missing, stale, unsupported, unauthorized, materializing, and failed states.

## 3. Document And Archive Resource Provider

- [x] 3.1 Implement a document/archive resource provider using the unified document source, manifest, range, and locator contracts.
- [x] 3.2 Materialize EPUB/CBZ/CBR document entry images into `.neko/.cache/resources/documents/`.
- [x] 3.3 Materialize DOCX/PPTX/XLSX embedded images where the current document reader can expose stable entries.
- [x] 3.4 Preserve legacy `DocumentArchiveResourceRef.cachePath` compatibility while writing new resource refs as the primary identity.
- [x] 3.5 Add tests for missing document image regeneration, stale source fingerprint rejection, unsupported locator reporting, and no-preview Agent reads.

## 4. Agent Storyboard And Document Image Migration

- [x] 4.1 Update Agent document image extraction to use project resource cache when a workspace/project context is available.
- [x] 4.2 Update Agent tool-result thumbnail projection to prefer resource refs and service projection over direct `cachePath` projection.
- [x] 4.3 Update storyboard transfer presenter/protocol to include resource refs for shot reference images and table thumbnails.
- [x] 4.4 Ensure Agent can still display no-workspace or extension-private scratch images with explicit non-portable scope.
- [x] 4.5 Add Agent tests for ReadDocument image thumbnails, storyboard table image refs, multi-shot repeated image refs, missing cache statuses, and legacy compatibility payloads.

## 5. Canvas Resource Resolution Migration

- [x] 5.1 Update Canvas import/storyboard node creation to store resource refs for document and shot reference images.
- [x] 5.2 Update Canvas preview/materialization flow to call `ResourceCacheService.ensure/project` before displaying document or storyboard reference images.
- [x] 5.3 Replace private Agent cache-root guessing in Canvas with resource-cache statuses and controlled legacy fallback.
- [x] 5.4 Prevent sequential thumbnail reuse when a shot has no matching resource ref or materialization fails.
- [x] 5.5 Add Canvas tests for resource-ref projection, missing-cache recovery, unsupported legacy-only paths, repeated-image refs, and Webview URI generation.

## 6. Assets, Preview, And Search Integration

- [x] 6.1 Register a thumbnail provider that maps existing `ThumbnailService` output into resource cache entries and stats.
- [x] 6.2 Register preview variant integration without making preview engine allowed roots the resource identity authority.
- [x] 6.3 Map generated asset thumbnails and previews to resource refs where generated asset metadata already exists.
- [x] 6.4 Update project search result DTO/projection paths to expose resource refs or host-projected visuals for cache-backed thumbnails.
- [x] 6.5 Add tests proving Agent/Dashboard/Webview search consumers do not read `.neko/.cache/resources/` manifests or package-local thumbnail directories directly.

## 7. Quota, GC, And Settings

- [x] 7.1 Implement cache stats aggregation by scope, provider, status, size, and last access time.
- [x] 7.2 Implement project cache quota policy and LRU-style garbage collection for rebuildable unpinned entries.
- [x] 7.3 Add settings plumbing for project cache limit, global cache limit, and minimum free disk behavior.
- [x] 7.4 Add safe deletion guards so GC cannot delete project facts, media-library source files, original assets, or user-selected files.
- [x] 7.5 Add tests for quota enforcement, pinned/session-active preservation, stale cleanup, and missing manifest recovery.

## 8. Documentation And ADR Alignment

- [x] 8.1 Update `docs/architecture/storage-strategy.md` with resource cache layout and workspace-first/project-bound cache rules.
- [x] 8.2 Mark storage strategy AssetGraph/VectorStore implementation sections that are superseded by `adr-structured-data-persistence.md`.
- [x] 8.3 Update `docs/architecture/local-resource-access.md` to clarify that local resource access projects files but does not own cache identity or materialization.
- [x] 8.4 Update document preview and Agent media architecture docs to describe resource refs, document image materialization, and Agent-to-Canvas transfer.
- [x] 8.5 Add user-facing remediation guidance for missing, stale, unsupported, unauthorized, and non-portable cache statuses.

## 9. Verification And Quality Gates

- [x] 9.1 Run targeted `neko-types` contract tests for resource cache and storage layout changes.
- [x] 9.2 Run targeted Agent document/storyboard transfer tests.
- [x] 9.3 Run targeted Canvas preview/materialization tests.
- [x] 9.4 Run targeted Assets/Preview/Search integration tests.
- [x] 9.5 Run `pnpm check` or the narrowest available package-level type checks covering modified packages.
  - Ran `pnpm check`; it failed in existing repository-wide Knip/dependency-cruiser findings unrelated to the new resource cache contract, including unused files/dependencies and pre-existing circular dependencies.
  - Ran focused package build/type coverage instead: `pnpm --filter neko-agent compile:extension`, `pnpm --filter neko-canvas compile:extension`, `pnpm --filter neko-assets compile`, `pnpm --filter @neko-canvas/webview build`, and `pnpm --filter @neko-agent/webview build`.
  - Attempted `pnpm --filter neko-canvas typecheck`; it failed because the package `tsconfig` cannot resolve workspace package exports under its current module resolution and also reports existing strictness issues. The resource-cache-specific Canvas build and protocol tests passed after local type narrowing.
- [x] 9.6 Run `pnpm test` or focused Vitest commands for affected packages.
  - Ran focused Vitest coverage for `@neko/shared` resource cache/search contracts, `@neko-agent/extension` document/image/provider flows, `@neko-agent/webview` tool/storyboard transfer presenters, `@neko-canvas/extension` protocol coverage, `@neko-canvas/webview` import/node/preview flows, and agent-types webview protocol.
- [x] 9.7 Perform Neko quality self-review against `docs/architecture/adr-code-review-quality-gates.md` and record residual risks.
  - Risk level: L3, because this touches shared public contracts, Agent document AI workflow, Canvas import/preview projection, Assets thumbnail API, and cross-extension resource boundaries.
  - Architecture review: resource identity is owned by `ResourceRef`/`ResourceVariantRef`, materialization is delegated to providers, Webview projection remains delegated to `LocalResourceAccessService`, and GC is constrained to managed cache roots rather than project facts or source assets.
  - Residual risks: no full VSCode runtime smoke was run for Agent-to-Canvas thumbnail display; root-level `pnpm check` remains blocked by existing Knip/dependency-cycle findings; future SQLite cache-index migration still needs to preserve the manifest-backed interface.
