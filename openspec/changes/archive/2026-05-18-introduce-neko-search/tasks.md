## 1. Package Setup

- [x] 1.1 Create `packages/neko-search` with package metadata, exports, tsconfig, Vitest config, and workspace-compatible build/test scripts.
- [x] 1.2 Define public entrypoints for core runtime, VSCode host integration, provider contracts, projection helpers, and test fakes.
- [x] 1.3 Add dependency boundary tests that prevent `neko-search/core` from importing Agent, Story, Assets, Dashboard, React, Webview modules, or VSCode APIs.
- [x] 1.4 Update workspace/package references so consumers can import `@neko/search` without circular dependencies.

## 2. Shared Contract Additions

- [x] 2.1 Review `@neko/shared` project search contracts and add missing additive fields for query mode, partitions, file/media type filters, scopes, provider capabilities, and semantic provider metadata.
- [x] 2.2 Add or update type guards and contract tests for the new query filters and provider metadata.
- [x] 2.3 Ensure shared contracts remain free of Agent, Story, Assets, Dashboard, React, Webview, and concrete VSCode implementation dependencies.

## 3. Core Search Runtime

- [x] 3.1 Move `ProjectCacheSearchService` and `ProjectIndexCoordinator` behavior from Agent-local code into `neko-search/core`.
- [x] 3.2 Replace direct VSCode dependencies in core runtime with injected logger, clock, disposable/event, cache store, and path resolver ports.
- [x] 3.3 Move normalization, searchable text construction, deterministic ranking, and final query filtering into `neko-search/core`.
- [x] 3.4 Move cache manifest read/write and atomic derived-cache helpers into `neko-search/core` or a host-safe cache module.
- [x] 3.5 Add core tests for provider registration, query fan-out, explicit filters, ranking, stale/fresh aggregation, partition failure isolation, disposal, and cache manifest validation.

## 4. VSCode Host Integration

- [x] 4.1 Add a VSCode host adapter that wires workspace roots, commands, file watchers, document change events, logging, disposables, and existing path resolution behavior into the core service.
- [x] 4.2 Preserve `neko.projectSearch.query` and `neko.projectSearch.refresh` command names while routing implementation through `neko-search`.
- [x] 4.3 Keep lightweight project-open indexing and partition-scoped debounce refresh behavior for story files, asset facts, entity facts, generated indexes, media settings, and document changes.
- [x] 4.4 Add host tests or mocked integration tests for command registration, watcher refresh routing, multi-root/context path resolution, and Webview-safe projections.

## 5. Provider Registration And Migration

- [x] 5.1 Provide provider registration helpers so Story can register story-symbol and creative-entity/candidate providers without Agent importing Story internals.
- [x] 5.2 Provide provider registration helpers so Assets can register asset-library and media-library providers without search owning asset metadata.
- [x] 5.3 Provide document provider hooks for lightweight document items, manifests, source refs, and future range/chunk projections.
- [x] 5.4 Move or wrap existing compatibility adapters so they are disabled or deprioritized when first-class domain providers are available.
- [x] 5.5 Add tests for duplicate avoidance between compatibility and first-class providers.

## 6. Consumer Integration

- [x] 6.1 Refactor Agent extension project search registration to import `neko-search` host integration instead of Agent-local coordinator modules.
- [x] 6.2 Keep `projectMentionSearch.ts` as an Agent projection layer that maps `ProjectSearchItem` results into existing mention candidate DTOs.
- [x] 6.3 Add a Dashboard/global-search host projection path that can consume `neko-search` without reading Dashboard creative-entity source internals or cache files.
- [x] 6.4 Ensure Webview packages receive projected search/mention DTOs only and continue to avoid Node, VSCode, cache file, and host-internal imports.

## 7. Semantic And RAG Extension Points

- [x] 7.1 Add optional provider capability metadata for semantic/vector/RAG providers without requiring any semantic provider by default.
- [x] 7.2 Define how semantic provider freshness reports model version, chunking version, source identity, and index version.
- [x] 7.3 Add placeholder tests proving text search works when no semantic provider is registered and semantic results preserve source refs when one is registered.

## 8. Documentation And Verification

- [x] 8.1 Update Chinese architecture documentation to show `neko-search` package ownership, provider boundaries, fact/cache separation, and Agent/Dashboard/Webview integration flow.
- [x] 8.2 Update migration notes for moving Agent-local project search code into `neko-search`.
- [x] 8.3 Add or update architecture tests that forbid Agent mention search from parsing project search cache files directly.
- [x] 8.4 Run targeted tests for `@neko/shared`, `neko-search`, Agent mention projection, and affected host integration code.
- [x] 8.5 Run the narrowest practical package checks, then escalate to `pnpm check` if package graph changes require it.
