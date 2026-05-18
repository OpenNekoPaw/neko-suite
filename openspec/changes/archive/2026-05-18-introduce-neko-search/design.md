## Context

`project-cache-search-service` already exists as a shared OpenSpec capability and `@neko/shared` already defines `ProjectSearchItem`, `ProjectSearchQuery`, partition status, freshness, cache manifest, and adapter contracts. The implementation, however, is currently centered in `packages/neko-agent/packages/extension/src/services/projectSearch`, where the coordinator, command registration, watcher wiring, path resolution, normalization, and compatibility adapters live.

That placement solved Agent mention search quickly, but it gives the wrong architectural signal: Agent becomes the accidental owner of project search. Search is cross-cutting infrastructure used by Agent, Dashboard, Assets, Story, Preview, document readers, and future semantic/RAG workflows. Its runtime owner should be neutral.

Five-layer analysis:

- Responsibilities: `neko-search` owns search lifecycle, query fan-out, freshness, ranking, cache orchestration, and provider registration; domain packages own extraction and authoritative facts.
- Dependencies: consumers depend on `@neko/shared` contracts and `neko-search` runtime APIs; `neko-search` must not import Agent, Story, Assets, Dashboard, React, or Webview code.
- Interfaces: provider registration, query, refresh, status, change events, projection helpers, and host command registration remain separate contracts.
- Extension: new search surfaces and future semantic/vector providers register adapters without changing Agent mention search.
- Tests: core query/ranking/cache behavior is testable without VSCode; host command/watchers are tested with mocked VSCode boundaries.

Existing constraints remain:

- Webviews cannot access Node.js, VSCode APIs, or local cache files.
- Project facts remain Git-trackable; `.neko/.cache` stores derived rebuildable indexes.
- Rust engine owns expensive media/file evidence when needed; TypeScript search owns orchestration and projections.
- `@neko/shared` remains the low-dependency contract source, not `neko-search`.
- Path facts should remain project-relative or variable-based; host APIs may temporarily handle absolute paths but must not persist them as authoritative data.

## Goals / Non-Goals

**Goals:**

- Create `packages/neko-search` as the neutral runtime owner for project search orchestration.
- Move reusable coordinator, service facade, normalization/ranking, cache manifest helpers, provider registry, and host integration helpers out of Agent extension code.
- Keep compatibility for `neko.projectSearch.query` and `neko.projectSearch.refresh`.
- Support query filters for mode, item kind, partition, file type/media type, scope, freshness, and limit.
- Allow Story, Assets, document services, and future entity services to register search providers without coupling through Agent.
- Keep search as a derived projection plane; entity, asset, story, document, and media facts remain owned by their domain packages.
- Reserve explicit extension points for semantic/vector/RAG providers without forcing embeddings into the first implementation batch.

**Non-Goals:**

- Creating `neko-entity` or moving creative entity facts out of Story in this change.
- Replacing all Story, Assets, media, or document indexes in one migration.
- Making `neko-search` a VSCode Webview or UI package.
- Moving search contracts out of `@neko/shared`.
- Making vector search, embeddings, OCR, full document chunking, or RAG mandatory for all queries.
- Changing the user-facing Agent mention DTO beyond compatible additive fields.

## Decisions

### Decision 1: `neko-search` is a runtime library package, not a new entity owner

Add `packages/neko-search` as a private workspace package. It owns project search runtime code and exports a small API surface:

```text
@neko/search
  core/
    ProjectCacheSearchService
    ProjectIndexCoordinator
    SearchProviderRegistry
    normalization / ranking
    cache manifests / atomic cache helpers
    test fakes
  host/
    VSCode command registration
    watcher wiring
    context/path resolution adapter hooks
    Agent/Dashboard projection helpers
```

`@neko/shared` continues to own DTOs and type guards. Domain packages continue to own facts:

```text
Story      -> story symbols, script roles, candidates, occurrences
Assets     -> asset metadata, media library metadata, thumbnails
Documents  -> document manifest/range/chunk refs
Entity     -> future confirmed entity lifecycle, when introduced
Search     -> derived searchable projections and freshness
```

Alternative considered: leave runtime in `neko-agent`.

Rejected because Dashboard and Assets would either depend on Agent internals or rebuild a parallel search coordinator.

Alternative considered: put entity and search together.

Rejected because entity facts are authoritative project semantics, while search indexes are derived, lossy, and rebuildable.

### Decision 2: Split core runtime from VSCode host adapters

The core package should avoid direct VSCode dependency where practical. It uses small injected interfaces for event emitters, disposables, logger, clock, file IO, path resolution, and cache storage. A VSCode host adapter wires these to `vscode.workspace`, `vscode.commands`, and existing PathResolver behavior.

```text
neko-search/core
  depends on @neko/shared + injected ports

neko-search/host-vscode
  depends on vscode APIs + core

feature extensions
  register providers through host-vscode or direct core APIs
```

Alternative considered: move the current Agent implementation as-is.

Rejected because it would keep core tests tied to VSCode and make non-Agent consumers inherit Agent-specific logging/path assumptions.

### Decision 3: Provider adapters are owned by domain packages

`neko-search` defines provider contracts and helper base classes, but Story/Assets/Documents provide the actual adapters. Compatibility adapters may temporarily live in `neko-search` only when they read existing public fact/cache files and do not import owner package internals.

Provider boundaries:

- Story provider projects `WorkspaceIndexService`, creative entity index, and script-derived candidates.
- Assets provider projects asset library records and known media metadata.
- Document provider projects manifests, document refs, and chunk/range records when available.
- Future entity provider projects confirmed entities from `neko-entity` or current shared registry services.
- Semantic provider projects vector/RAG results as search items with explicit capability metadata.

Alternative considered: centralize all extraction in `neko-search`.

Rejected because search would duplicate domain parsing and become a hidden owner of Story/Assets/Document semantics.

### Decision 4: Query shape grows through additive filters

Extend the existing `ProjectSearchQuery` contract additively where needed:

```typescript
interface ProjectSearchQuery {
  text: string;
  mode?: 'mention' | 'global' | 'asset-picker' | 'entity-picker' | 'document' | 'agent-tool';
  kinds?: readonly ProjectSearchItemKind[];
  partitions?: readonly ProjectSearchPartitionKind[];
  fileTypes?: readonly string[];
  mediaTypes?: readonly string[];
  scopes?: readonly ProjectSearchScope[];
  freshness?: 'allow-stale' | 'fresh-only';
  limit?: number;
}
```

Mode informs ranking and projection defaults; it must not hide data unless combined with explicit filters. File/media type filtering is applied after provider query and before final ranking unless a provider can apply it more efficiently.

Alternative considered: add one command per search mode.

Rejected because it fragments result shape, ranking, cache status, and frontend integration.

### Decision 5: Host commands remain compatibility entrypoints

Keep the command names:

```text
neko.projectSearch.query
neko.projectSearch.refresh
```

Agent continues to call the query command during migration. Dashboard/global search can call the same command or an injected service reference. Webviews still receive projected DTOs through their owning extension hosts and never read `.neko/.cache` directly.

Alternative considered: replace commands with direct package imports everywhere.

Rejected because commands provide cross-extension discovery and keep Webview/Extension boundaries explicit.

### Decision 6: Cache ownership is logical, not fact ownership

`neko-search` may own derived search cache manifests and unified search index files under `.neko/.cache/`, but it must not write authoritative project facts such as `characters.json`, `neko/assets/library.json`, `neko/entity-bindings.json`, or document source files.

Adapters may keep existing cache files during migration:

```text
.neko/.cache/search-index.json          media compatibility cache
.neko/.cache/asset-graph.json           creative entity graph compatibility cache
.neko/.cache/project-search-index.json  unified search projection cache
```

Alternative considered: Git-sync project search index files.

Rejected because search caches are local, derived, and may include machine-specific paths or freshness metadata.

### Decision 7: RAG is an optional provider family, not the core service

Future RAG support should live behind provider contracts:

```text
SemanticSearchProvider
  index(document/entity/asset projections)
  querySemantic(query, scope, topK)
  report freshness/model/version

RagContextProvider
  turn search hits into evidence/context chunks
  preserve source refs and ranges
```

`neko-search` can own routing, freshness, and result normalization. Embedding model selection, vector storage backend, chunking policy, and retrieval prompt assembly should remain pluggable and may live in separate provider packages later.

Alternative considered: put RAG directly in Agent.

Rejected because Dashboard, document readers, and non-chat tools also need semantic search and source-aligned retrieval.

## Risks / Trade-offs

- [Risk] `neko-search` becomes a god package. -> Mitigation: it owns orchestration only; domain extraction remains provider-owned and tested at package boundaries.
- [Risk] Moving code from Agent breaks mention completion. -> Mitigation: keep command names and Agent projection tests while migrating implementation behind the command.
- [Risk] Core/host split adds indirection. -> Mitigation: ports stay small and match existing needs: logger, disposable, clock, file IO, path resolution, event emitter.
- [Risk] Provider registration order changes ranking. -> Mitigation: ranking uses explicit source order and score hints with deterministic tie-breakers.
- [Risk] Query filters become inconsistent across providers. -> Mitigation: coordinator applies final filtering centrally and providers may only pre-filter for performance.
- [Risk] RAG placeholders over-design the first batch. -> Mitigation: define provider slots and metadata only; defer embeddings/vector stores to later changes.
- [Risk] Multi-root path resolution remains ambiguous. -> Mitigation: query context records whether fallback was used and every result carries project root/source refs.

## Migration Plan

1. Add `packages/neko-search` package metadata, exports, tsconfig/test config consistent with existing workspace packages.
2. Move reusable Agent-local project search code into `neko-search/core` and `neko-search/host-vscode` with minimal behavior changes.
3. Update Agent extension to import/register through `neko-search` while preserving `projectMentionSearch.ts` projection and command names.
4. Add provider registration helpers so Story/Assets can register first-class providers rather than relying on compatibility JSON readers.
5. Add additive `@neko/shared` query/filter/capability fields only where implementation needs them.
6. Update architecture docs to show package ownership and provider boundaries.
7. Remove or shrink Agent-local compatibility code after tests prove parity.

Rollback is straightforward: keep command names stable and leave the current Agent implementation available until `neko-search` parity tests pass. If migration fails, Agent can temporarily re-export or call the old service while the new package is fixed.

## Open Questions

- Should `neko-search` expose one `./vscode` subpath or separate `./host/vscode` and `./testing` exports?
- Should semantic/vector providers be part of this package in a later phase, or should they become `neko-rag` / `neko-semantic-search` providers that plug into `neko-search`?
- How much of the existing compatibility adapter logic should move immediately versus staying in Agent until Story/Assets first-class providers land?
