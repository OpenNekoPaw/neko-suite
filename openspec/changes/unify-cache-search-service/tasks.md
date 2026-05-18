## 1. Shared Contracts

- [x] 1.1 Add project search/cache contracts in `packages/neko-types` for search item kinds, source refs, query options, freshness, partition status, update events, cache manifest, and normalized match fields.
- [x] 1.2 Export the new contracts from low-dependency `neko-types` entrypoints without adding VSCode, React, Agent, Story, or Assets implementation dependencies.
- [x] 1.3 Add type guards or contract tests for query parsing, item kind validation, freshness values, and cache manifest version/source identity fields.

## 2. Coordinator And Cache Core

- [x] 2.1 Implement a host-side `ProjectIndexCoordinator` skeleton with adapter registration, project root resolution, lifecycle disposal, and partition status tracking.
- [x] 2.2 Implement `ProjectCacheSearchService` with `ensureInitialized`, `query`, `refresh`, `getStatus`, and `onDidChangeProjectIndex` APIs.
- [x] 2.3 Add centralized query normalization and deterministic ranking over label, canonical name, aliases, tags, filenames, source names, and adapter-provided `searchText`.
- [x] 2.4 Add cache manifest read/write helpers with version checks, source identity/generation metadata, debounce support, and atomic writes under `.neko/.cache/`.
- [x] 2.5 Add fake-adapter unit tests for query fan-out, partition failure isolation, stale-while-revalidate behavior, and disposal.

## 3. Project Resolution And Background Indexing

- [x] 3.1 Add a project resolution helper that prefers explicit project root, then context URI/file path ownership, then existing path resolver/settings behavior, then first-workspace fallback.
- [x] 3.2 Ensure `${VAR}/path`, project-relative, and user-facing shorthand paths are resolved through the existing path resolution layer before selecting a project root.
- [x] 3.3 Start low-cost indexing automatically on project open for story files, project facts, asset library metadata, generated index metadata, and existing media search indexes.
- [x] 3.4 Add staged background indexing controls with cancellation tokens, bounded concurrency, and deferred heavy media work.
- [x] 3.5 Add tests for multi-root resolution, context-file resolution, variable path resolution, and fallback-derived query context.

## 4. Story And Entity Adapters

- [x] 4.1 Add a story-symbol adapter that projects existing `WorkspaceIndexService` scenes, sections, script roles, and story files into `ProjectSearchItem` records.
- [x] 4.2 Ensure Story activation initializes the services needed for project search, including creative entity graph/index services where present, without blocking extension activation on heavy work.
- [ ] 4.3 Add a creative-entity adapter for confirmed entities, aliases, entity candidates, occurrence refs, and missing representation requirements.
- [x] 4.4 Ensure script-derived entity candidates remain searchable even when no visual identity, generated asset, confirmed binding, or representation exists.
- [x] 4.5 Add tests using Fountain fixtures for Chinese role names such as `小橘`, scene names, aliases, confirmed entities without assets, and requirement-backed results.

## 5. Asset, Media, Document, And Generated Adapters

- [x] 5.1 Add an asset-library adapter that indexes `neko/assets/library.json` names, categories, descriptions, tags, aliases, variants, files, thumbnails, and navigation data.
- [x] 5.2 Adapt `MediaLibrarySearchService` so the coordinator can load existing media indexes and install watchers during lightweight warmup without forcing metadata probe/thumb/embedding work.
- [x] 5.3 Add a media adapter that returns media/document file items from configured libraries using filename and known metadata matching.
- [x] 5.4 Add generated-asset and document-reference adapters where existing generated index or asset-library document records are available.
- [x] 5.5 Add tests for missing cache rebuild, asset alias matching, media basename matching, document item projection, and media-library settings invalidation.

## 6. Incremental Updates

- [x] 6.1 Wire text document changes and story file watcher events to update in-memory story/entity search partitions with debounce.
- [x] 6.2 Wire asset library, entity fact, requirement, visual identity draft, generated index, and settings file watcher events to invalidate and refresh affected partitions.
- [x] 6.3 Wire media library create/delete/settings events to update media search partitions without requiring a project restart.
- [x] 6.4 Emit partition-scoped project index change events containing project root, reason, changed refs, generation, and freshness.
- [x] 6.5 Add tests for unsaved edit search refresh, saved fact refresh, media file event refresh, stale cache rejection, and partial partition failure.

## 7. Agent And Webview Integration

- [x] 7.1 Register a host command or injected adapter such as `neko.projectSearch.query` that exposes project search to Agent without leaking cache file paths.
- [x] 7.2 Refactor `projectMentionSearch.ts` to call the project search service with query text, context file path/URI, project root, result kinds, and limit instead of reading `.neko/.cache/*.json` directly.
- [x] 7.3 Preserve compatibility by mapping `ProjectSearchItem` records into existing `AgentProjectMentionCandidate` shapes during migration.
- [x] 7.4 Update Agent Webview mention rendering to use item kind/icon/thumbnail/navigation metadata and to avoid duplicating cache/search filtering logic.
- [ ] 7.5 Add integration tests for Agent mention search across script roles, scenes, asset library entries, media files, documents, confirmed entities, and entity candidates.

## 8. Documentation And Verification

- [x] 8.1 Update Chinese architecture documentation for project facts vs local derived caches, background indexing stages, project search query flow, and Agent/Webview boundaries.
- [x] 8.2 Add migration notes for removing direct Agent cache reads and keeping existing cache files as adapter-owned compatibility persistence.
- [x] 8.3 Add architecture tests or dependency checks that prevent Webview direct cache/filesystem reads and prevent Agent mention search from owning cache JSON schemas.
- [x] 8.4 Run targeted tests for `neko-types`, Story/entity adapters, Assets/media adapters, Agent mention search, and Webview mention rendering.
- [ ] 8.5 Run the narrowest practical package checks, then escalate to `pnpm check` or `pnpm test` if the touched packages require it.
