## Context

Neko Suite already has several project indexes, but they are not governed by one contract:

- `neko-story` warms `WorkspaceIndexService` and `CharacterIndexService` on activation, but creative entity graph and creative entity search may remain uninitialized until another consumer touches them.
- `neko-assets` `MediaLibrarySearchService` lazily loads or builds `.neko/.cache/search-index.json` on first search, and only then installs media-library watchers.
- `neko-agent` mention search reads `neko/assets/library.json`, `.neko/.cache/search-index.json`, `.neko/.cache/media-metadata.json`, and `.neko/.cache/asset-graph.json` directly from the first workspace folder.
- `MentionMenu` filters a small candidate projection and does not receive a normalized search text, aliases, cache freshness, or the project root that produced the result.

This creates a split search model: opening a project does not guarantee that unified entities, media library entries, or derived asset graphs are available to Agent; direct cache reads can return stale or empty data; and path resolution can choose the wrong workspace in multi-root or external-file contexts.

Existing constraints still apply:

- Webviews cannot use Node.js, VSCode APIs, or direct filesystem access.
- Extension Host / Platform code owns workspace watchers, path resolution, cache persistence, and command APIs.
- Engine owns heavy media inspection, decoding, thumbnails, embeddings, and binary/file authority when those operations are required.
- Git-trackable facts must stay outside `.neko/.cache`; local caches must be rebuildable.
- Cross-package contracts should live in `neko-types` or another low-dependency shared layer, not inside feature packages.

Five-layer analysis:

- Responsibilities: one coordinator owns project indexing lifecycle and search facade; feature adapters own domain-specific extraction; webviews render results; agent runtime consumes typed candidates.
- Dependencies: high-level consumers depend on small contracts and service commands, not concrete Story/Assets implementations or cache file paths.
- Interfaces: query, refresh, status, partition adapter, and change-event APIs are separated to keep each contract focused.
- Extension: new resource kinds can register a partition adapter without changing Agent mention search or Webview rendering logic.
- Tests: each adapter is testable with fixture inputs; coordinator behavior is testable with fake adapters, fake clocks, and fake path resolver.

## Goals / Non-Goals

**Goals:**

- Define one project-level search item and query contract for Agent mention completion, command palette search, library search, and future project-aware UI.
- Keep confirmed project facts Git-trackable under `neko/` or existing source files, while derived indexes live under `.neko/.cache/`.
- Automatically start lightweight indexing when a project opens.
- Keep heavy media operations deferred, cancellable, bounded, and delegated to existing engine/client paths when needed.
- Update in-memory indexes quickly after text document changes, then persist derived caches with debounce and atomic writes.
- Resolve the search project from `contextFilePath`, URI, or explicit `projectRoot` before falling back to `workspaceFolders[0]`.
- Include confirmed entities and script-derived entity candidates in search without requiring a visual identity or bound asset.
- Provide freshness/status events so Agent and Webview can distinguish fresh, stale, building, partial, and failed partitions.

**Non-Goals:**

- Replacing domain-specific indexes such as `WorkspaceIndexService`, `MediaLibrarySearchService`, or creative entity graph internals in one step.
- Performing full media metadata extraction, thumbnail generation, OCR, embedding creation, or deep semantic analysis during workspace activation.
- Making Webviews responsible for filesystem crawling, cache reads, or path resolution.
- Moving all cache/search code into Rust engine.
- Creating a cloud or remote search backend.
- Making fuzzy matching, vector search, or multilingual tokenization mandatory for the first implementation batch.
- Changing the authority of existing creative entity bindings, asset library records, or story source files.

## Decisions

### Decision 1: Add a project-level coordinator in Extension Host / Platform

Introduce a `ProjectCacheSearchService` facade backed by a `ProjectIndexCoordinator`. It owns:

- project root resolution,
- adapter registration,
- background indexing lifecycle,
- query fan-out and ranking,
- freshness and status projection,
- cache partition read/write orchestration,
- `onDidChangeProjectIndex` events.

Feature packages provide adapters for specific partitions:

```text
story-symbols       -> scenes, sections, script roles, story files
creative-entities   -> confirmed entities, aliases, entity candidates, requirements
asset-library       -> asset entities and variants from Git-trackable facts
media-library       -> file names and known metadata from configured media roots
documents           -> indexed document assets and lightweight document refs
generated-assets    -> generated index entries and lineage metadata
```

Alternative considered: keep Agent mention search as an aggregator over cache files.

Rejected because the aggregator would continue to encode storage paths, freshness rules, and workspace resolution in Agent-specific code. It also cannot warm lazy indexes or receive update events.

Alternative considered: put the service inside a Webview package.

Rejected because Webviews cannot watch workspace files, read caches, or resolve host paths.

### Decision 2: Use facts/cache partitioning as the persistence contract

The service distinguishes source facts from derived caches:

```text
Facts
  Source files: *.fountain, *.nks, *.story, documents
  Project facts: neko/assets/library.json, entity-bindings.json,
                 entity-asset-requirements.json, visual-identity-drafts.json

Derived caches
  .neko/.cache/project-search-index.json
  .neko/.cache/search-index.json             (compat/media during migration)
  .neko/.cache/asset-graph.json              (compat/graph during migration)
  .neko/.cache/media-metadata.json
```

Adapters may keep existing cache files during migration, but the coordinator should expose one logical cache status and one query result stream. Deleting `.neko/.cache` must never delete confirmed entities, bindings, or asset library facts.

Alternative considered: store the unified search index under `neko/` to make it Git-synced.

Rejected because search indexes are derived, machine-dependent, and can contain absolute or environment-specific paths. Git should track facts, not local projections.

### Decision 3: Search results use a normalized shared item contract

Add shared contracts similar to:

```typescript
type ProjectSearchItemKind =
  | 'story-scene'
  | 'story-section'
  | 'script-role'
  | 'creative-entity'
  | 'entity-candidate'
  | 'asset'
  | 'media'
  | 'document'
  | 'generated-asset';

interface ProjectSearchItem {
  id: string;
  kind: ProjectSearchItemKind;
  label: string;
  description?: string;
  icon?: string;
  source: ProjectSearchSourceRef;
  projectRoot: string;
  filePath?: string;
  canonicalName?: string;
  aliases?: readonly string[];
  searchText: string;
  scoreHints?: ProjectSearchScoreHints;
  navigationData?: Record<string, unknown>;
  freshness: ProjectIndexFreshness;
}
```

`searchText` is built by adapters from canonical name, aliases, display names, tags, filenames, entity kind, scene names, and resolved source names. Query normalization is centralized so Chinese substring matching, case folding, punctuation trimming, path basename matching, and future tokenization behave consistently.

Alternative considered: let Webview filter the raw candidate fields it already receives.

Rejected because the Webview cannot know aliases, cache provenance, or domain-specific names, and it would duplicate matching logic across UI surfaces.

### Decision 4: Background indexing is staged by cost

On project open, the coordinator starts a low-cost warmup:

```text
Stage 0: load recent persisted cache manifests and status
Stage 1: scan story files, project facts, asset library JSON, generated index
Stage 2: load existing media file index and install watchers
Stage 3: rebuild missing/stale media filename index with bounded concurrency
Stage 4: run heavy metadata/probe/thumb/embedding only on idle or explicit demand
```

Queries use stale-while-revalidate semantics. If a partition has stale cache data, the service may return it with `freshness='stale'` and schedule a refresh; callers can request `freshness: 'fresh-only'` when stale results would be misleading.

Alternative considered: rebuild every index fully on workspace activation.

Rejected because large media libraries can make activation expensive and violate the expectation that project open remains responsive.

### Decision 5: Incremental updates are event-driven and partition-scoped

The coordinator subscribes to:

- `workspace.onDidChangeTextDocument` and relevant file watchers for story-like files,
- asset library and project fact file watchers,
- media library settings changes and media root watchers,
- generated index changes,
- path/storage setting changes,
- domain service events such as entity binding or requirement updates.

Text document changes update in-memory partitions quickly with a short debounce. Disk persistence uses a longer debounce and atomic write. Each update emits a partition-scoped change event containing project root, changed refs, reason, generation, and freshness.

Alternative considered: periodic full polling.

Rejected because polling wastes work, is slower to reflect edits, and makes tests nondeterministic.

### Decision 6: Context path resolution goes through existing path resolver layers

Search queries accept:

```typescript
interface ProjectSearchQuery {
  text: string;
  contextFilePath?: string;
  contextUri?: string;
  projectRoot?: string;
  kinds?: readonly ProjectSearchItemKind[];
  limit?: number;
  freshness?: 'allow-stale' | 'fresh-only';
}
```

The service resolves the project in this order:

1. explicit `projectRoot`,
2. owning workspace folder for `contextUri` or resolved `contextFilePath`,
3. project root from existing path resolver/settings,
4. first workspace folder as compatibility fallback.

The query API should accept project-relative paths, `${VAR}/path` values, and user-facing shorthand only after passing through existing PathResolver/neko-client-compatible resolution utilities. Absolute paths can be accepted at API boundaries for host operations but should not be persisted as authoritative facts.

Alternative considered: keep `workspaceFolders[0]`.

Rejected because Agent context often comes from a file path, and multi-root workspaces or external project files make the first folder wrong.

### Decision 7: Entity search does not require visual identity

The search service treats entities as semantic project facts first:

```text
confirmed creative entity
  id, kind, canonicalName, aliases, status, source

entity candidate
  candidateId, kind, extractedName, sourceRef, confidence, occurrenceRefs

visual identity / representation
  optional layer attached later
```

Script roles extracted from Fountain files, scene participants, and unresolved entity requirements are searchable as `entity-candidate` or `script-role` items even when there is no portrait, Live2D model, visual identity draft, or asset binding.

Alternative considered: only search entities that already have visual identity or asset bindings.

Rejected because writing and early planning happen before visual development, and the user must be able to mention or bind `小橘` before a portrait exists.

### Decision 8: The engine provides heavy evidence, not the coordinator contract

The initial coordinator is a TypeScript Extension/Platform service. Engine/client paths are used by adapters when they need file identity, media probe, thumbnail, waveform, OCR, or embeddings. The coordinator stores references and known metadata; it does not decode or parse heavy binary media itself.

Alternative considered: move all indexing to `neko-engine`.

Rejected for the first iteration because Story parsing, VSCode document buffers, asset library facts, and Agent command integration are Extension-side concerns. Engine can later provide adapter backends without changing the query contract.

### Decision 9: Agent and Webview integrate through service commands, not cache paths

Agent mention completion should call an injected host adapter or VSCode command such as `neko.projectSearch.query`, receiving `ProjectSearchItem` projections converted to `AgentProjectMentionCandidate`. The Webview renders item icons/kinds/thumbnails from the candidate contract and does not read or infer `.neko/.cache` paths.

Alternative considered: expose cache file paths to Webview and let it fetch them.

Rejected because it violates Webview sandbox boundaries and reintroduces cache schema coupling into UI code.

## Risks / Trade-offs

- [Risk] A central coordinator becomes a large god service. → Mitigation: keep it as lifecycle/query orchestration only; extraction remains in partition adapters with narrow interfaces.
- [Risk] Background indexing competes with editing or media preview. → Mitigation: use staged indexing, cancellation tokens, bounded concurrency, and defer heavy work to idle or explicit requests.
- [Risk] Stale-while-revalidate can show outdated results briefly. → Mitigation: include freshness metadata in results and emit update events so Agent/Webview can refresh menus when fresh data arrives.
- [Risk] Existing direct cache readers diverge during migration. → Mitigation: route new consumers through the facade first, keep compatibility cache files as adapter-owned persistence, and add tests that forbid Agent mention search direct cache reads after migration.
- [Risk] Name normalization is insufficient for complex multilingual search. → Mitigation: start with deterministic normalized substring matching and aliases; keep tokenizer/ranker injectable.
- [Risk] Multi-root project detection can be ambiguous for external library paths. → Mitigation: prefer explicit project root/context file path, then owning workspace folder, and include project root in every result.
- [Risk] Media library scanning can still be expensive for huge folders. → Mitigation: cap initial scan work, persist partial status, and expose partition status instead of blocking the entire search API.

## Migration Plan

1. Add shared project search/cache contracts in `neko-types`.
2. Implement `ProjectIndexCoordinator` and `ProjectCacheSearchService` with fake adapter tests.
3. Add Story and creative entity adapters using existing workspace/entity services and ensure they initialize on project open.
4. Add asset library and media library adapters, preserving current cache files while adding unified status/freshness projection.
5. Register a host command/adapter for project search and route Agent mention completion through it.
6. Update Webview mention rendering to use item kind/icon/thumbnail metadata from the new projection.
7. Add incremental invalidation and cache persistence for story edits, asset changes, settings changes, generated index changes, and media file events.
8. Remove or quarantine direct cache-file reads from Agent mention search after parity tests pass.

Rollback is package-local: Agent mention search can fall back to the old cache aggregator while the coordinator remains available for diagnostics, because the proposal does not change authoritative fact formats.

## Open Questions

- Should the unified persisted search index be a single `.neko/.cache/project-search-index.json` file or one file per partition plus a manifest?
- Should the first implementation expose a public command only, or also export a TypeScript service from a shared package?
- Which tokenizer/ranker should be used for pinyin or more advanced Chinese search after deterministic substring matching?
- Should media library search include files outside the project root in project search results by default, or only when the project settings explicitly declare those libraries?
