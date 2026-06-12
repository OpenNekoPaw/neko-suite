# project-cache-search-service Specification

## Purpose
Define the shared project cache and search contract used by host-side services,
Agent mention completion, and Webview rendering so project facts, local derived
caches, and searchable resources stay aligned without leaking cache schemas
across package boundaries.
## Requirements
### Requirement: Project Search Uses A Shared Contract
The system SHALL expose project search results through a shared contract containing item identity, kind, label, source reference, project root, optional file path, aliases, normalized search text, navigation data, and freshness metadata.

#### Scenario: Agent receives typed mention candidates
- **WHEN** Agent requests project mention candidates for a query
- **THEN** the returned candidates are derived from shared project search items rather than package-specific cache JSON shapes

#### Scenario: Webview renders by item kind
- **WHEN** the Agent Webview renders project mention results
- **THEN** it can choose labels, icons, thumbnails, and navigation actions from the shared item kind and metadata without reading cache files

### Requirement: Search Covers Project Resource Partitions
The system SHALL support project search partitions for story scenes, story sections, script roles, creative entities, entity candidates, asset library records, media files, documents, and generated assets.

#### Scenario: Script roles and scenes are searchable
- **WHEN** a Fountain file defines role names and scene headings
- **THEN** project search returns matching script-role and story-scene items for those names

#### Scenario: Asset library entries are searchable
- **WHEN** `neko/assets/library.json` contains an asset entity with names, tags, aliases, variants, or file records
- **THEN** project search can return that asset entry using those fields as searchable text

#### Scenario: Media files are searchable
- **WHEN** configured media libraries contain media or document files
- **THEN** project search can return matching media or document items without requiring heavy metadata extraction first

### Requirement: Facts And Caches Remain Separate
The system SHALL keep authoritative project facts in Git-trackable project data and keep derived search indexes under local rebuildable cache storage.

#### Scenario: Cache rebuild preserves facts
- **WHEN** `.neko/.cache/` is deleted and rebuilt
- **THEN** confirmed entities, asset library records, entity bindings, visual identity drafts, and entity asset requirements remain available from Git-trackable facts

#### Scenario: Derived index is local
- **WHEN** the service persists a project search index
- **THEN** it writes derived index data under `.neko/.cache/` rather than making it the authoritative project fact

### Requirement: Lightweight Indexing Starts On Project Open
The system SHALL start lightweight project indexing after a project opens, including story files, project facts, asset library metadata, generated index metadata, and existing lightweight media search indexes.

#### Scenario: Newly opened project warms search
- **WHEN** a workspace project opens
- **THEN** the coordinator starts lightweight indexing without waiting for the first Agent mention query

#### Scenario: Heavy media work is deferred
- **WHEN** a project contains a large media library
- **THEN** project open indexing does not block on thumbnails, embeddings, OCR, waveform extraction, or full media probing

### Requirement: Search Reports Freshness And Partition Status
The system SHALL track freshness and status for each search partition and SHALL include freshness metadata in query responses.

#### Scenario: Stale cache can be returned with status
- **WHEN** a query can be answered from stale cache while a rebuild is running
- **THEN** the service may return stale results marked with stale freshness and continue rebuilding in the background

#### Scenario: Fresh-only query avoids stale results
- **WHEN** a caller requests fresh-only search
- **THEN** the service returns only fresh partition results or reports that a partition is still building or unavailable

#### Scenario: Partition failure is isolated
- **WHEN** one partition fails to index
- **THEN** project search can still return results from healthy partitions and reports the failed partition status

### Requirement: Incremental Updates Refresh Search
The system SHALL update project search indexes incrementally in response to relevant document, file, settings, asset, generated index, and entity fact changes.

#### Scenario: Unsaved story edit updates memory index
- **WHEN** a relevant open text document changes and contains a new role or scene name
- **THEN** in-memory project search results are updated after a debounce without waiting for the file to be saved

#### Scenario: Saved asset fact updates search
- **WHEN** an asset library or entity fact file changes on disk
- **THEN** the affected search partition is invalidated, refreshed, and emits a project index change event

#### Scenario: Media file event updates search
- **WHEN** a file is created or deleted inside an enabled media library
- **THEN** the media search partition updates without requiring a full project restart

### Requirement: Project Resolution Uses Context
The system SHALL resolve the search project from explicit project root, context URI, context file path, or existing project path resolver behavior before falling back to the first workspace folder.

#### Scenario: Context file selects owning project
- **WHEN** Agent requests mention candidates with a context file path inside a workspace folder
- **THEN** project search uses that owning workspace as the project root

#### Scenario: Variable path is resolved before search
- **WHEN** a search context path uses a supported variable or project-relative path form
- **THEN** the service resolves it through the existing path resolution layer before choosing the project root

#### Scenario: Multi-root fallback is explicit
- **WHEN** no context path or explicit project root is available
- **THEN** the service may fall back to the first workspace folder and marks the query context as fallback-derived

### Requirement: Query Matching Uses Normalized Names And Aliases
The system SHALL centralize query normalization and match against canonical names, display labels, aliases, tags, filenames, source names, and adapter-provided search text.

#### Scenario: Chinese role name matches substring
- **WHEN** a script contains a role named `小橘`
- **THEN** searching for `小` or `小橘` can return the matching script-role or entity-candidate item

#### Scenario: Alias matches asset
- **WHEN** an asset or entity has an alias that differs from its display label
- **THEN** searching by the alias can return that item

#### Scenario: Filename matches media
- **WHEN** a media file has no custom title
- **THEN** searching by its basename can return the media item

### Requirement: Consumers Do Not Read Cache Files Directly
Agent mention completion and Webview project search consumers SHALL use the project cache/search service or its host command/adapter instead of reading `.neko/.cache` files directly.

#### Scenario: Agent mention uses service adapter
- **WHEN** Agent needs project mention candidates
- **THEN** it calls the project search adapter with query text and context information rather than opening cache JSON files itself

#### Scenario: Webview receives projected results
- **WHEN** the Webview requests or displays project mention results
- **THEN** it receives projected result data through Extension messaging and does not receive local cache file paths as its data source

### Requirement: Search Cache Writes Are Safe And Rebuildable
The system SHALL persist derived search caches with versioning, source identity or generation metadata, and atomic write behavior.

#### Scenario: Stale persisted cache is rejected
- **WHEN** a persisted cache version or source identity no longer matches the current project state
- **THEN** the service rejects or marks that partition stale and schedules a rebuild

#### Scenario: Partial write does not corrupt previous cache
- **WHEN** a process is interrupted while persisting a derived search cache
- **THEN** the previous valid cache remains usable or the cache is treated as missing rather than partially valid

### Requirement: Search Runtime Is Owned By neko-search
The system SHALL provide `packages/neko-search` as the neutral runtime owner for project search orchestration. The package MUST consume shared search contracts from `@neko/shared` and MUST NOT become the source of truth for search DTOs, creative entity facts, asset metadata, story facts, document content, or media metadata.

#### Scenario: Agent no longer owns the coordinator
- **WHEN** Agent mention completion queries project search
- **THEN** the coordinator, service facade, ranking, cache manifest helpers, and refresh orchestration are provided by `neko-search` rather than Agent-local implementation modules

#### Scenario: Shared contracts remain in shared
- **WHEN** a consumer validates a `ProjectSearchQuery`, `ProjectSearchItem`, cache manifest, freshness value, or partition status
- **THEN** it uses `@neko/shared` contract types and guards rather than importing DTO definitions from `neko-search`

#### Scenario: Search does not own facts
- **WHEN** search indexes creative entities, assets, documents, media files, generated assets, or story symbols
- **THEN** it stores only derived searchable projections and does not become the authority that mutates the source facts

### Requirement: Search Package Separates Core Runtime From VSCode Host Integration
The system SHALL split reusable search runtime logic from VSCode-specific host integration. Core search logic MUST be testable without VSCode APIs, while host integration MAY wire VSCode commands, workspace watchers, disposables, logging, and path resolution into the core service.

#### Scenario: Core service runs with injected ports
- **WHEN** tests instantiate the search coordinator with fake providers, clocks, loggers, cache stores, and path resolvers
- **THEN** query fan-out, filtering, ranking, freshness aggregation, and cache handling can be verified without loading VSCode

#### Scenario: VSCode host registers compatibility commands
- **WHEN** the Neko extension host activates project search
- **THEN** it registers `neko.projectSearch.query` and `neko.projectSearch.refresh` through `neko-search` host integration while preserving the existing command names

#### Scenario: Webview stays sandboxed
- **WHEN** a Webview displays search or mention results
- **THEN** it receives projected DTOs from its owning Extension Host and does not import `neko-search`, VSCode APIs, Node APIs, or local cache files

### Requirement: Domain Packages Register Search Providers
The system SHALL let domain packages register search providers for their owned partitions. Providers MUST expose searchable projections through shared contracts and MUST keep extraction, source interpretation, and source mutations inside the owning domain package.

#### Scenario: Story registers story and entity candidate providers
- **WHEN** Story has workspace indexes, script roles, scenes, sections, or script-derived entity candidates
- **THEN** Story registers providers that project those resources into `ProjectSearchItem` records without Dashboard or Agent importing Story internals

#### Scenario: Assets registers asset and media providers
- **WHEN** Assets has asset library records, variants, files, thumbnails, known media metadata, or media library roots
- **THEN** Assets registers providers that project those resources into search items without search taking ownership of asset metadata

#### Scenario: Document provider projects document refs
- **WHEN** document access services can provide manifests, entries, ranges, chunks, or lightweight document references
- **THEN** a document provider can expose searchable document items while preserving source refs needed for later range reads

#### Scenario: Compatibility provider does not replace owner provider
- **WHEN** a first-class domain provider exists for a partition
- **THEN** compatibility JSON/cache readers are disabled or deprioritized for that partition to avoid duplicate or stale results

### Requirement: Search Queries Support Modes, Types, And Scopes
The system SHALL support additive query filters for search mode, item kinds, partitions, file types, media types, scopes, freshness, and limit. The coordinator MUST apply final filtering centrally so providers cannot return items that violate explicit query filters.

#### Scenario: Mention mode searches mentionable resources
- **WHEN** Agent sends a query with `mode='mention'`
- **THEN** search ranking favors mentionable files, entities, assets, media, documents, scenes, and script roles without changing the shared result shape

#### Scenario: Asset picker narrows result kinds
- **WHEN** a caller requests asset-picker search with asset/media file type filters
- **THEN** results are limited to matching asset, media, generated asset, or document resources according to the explicit filters

#### Scenario: Entity picker narrows entity results
- **WHEN** a caller requests entity-picker search with entity kinds or entity-related item kinds
- **THEN** search returns confirmed creative entities and relevant entity candidates without requiring visual identity or bound assets

#### Scenario: Scope restricts search boundary
- **WHEN** a query specifies a project, workspace, media-library, document, or current-file scope
- **THEN** the service limits provider fan-out and final results to that scope or reports the unavailable scope status

### Requirement: Search Consumers Share One Host-Mediated Entry Point
Agent, Dashboard, Assets UI, Story UI, Preview, and future frontends SHALL consume project search through `neko-search` service APIs or host-mediated commands/projections rather than reading `.neko/.cache` files, domain package internals, or provider-specific JSON schemas directly.

#### Scenario: Agent mention search uses shared service
- **WHEN** Agent builds `@` mention candidates
- **THEN** it calls the shared project search service or `neko.projectSearch.query` and maps returned `ProjectSearchItem` records into Agent mention DTOs

#### Scenario: Dashboard global search uses same results
- **WHEN** Dashboard adds a project/global search surface
- **THEN** it requests host-projected search results from the same search service instead of implementing a Dashboard-only aggregator

#### Scenario: Source navigation remains host-owned
- **WHEN** a UI action opens a search result
- **THEN** the owning Extension Host resolves the result source ref and opens the destination without exposing unsafe local paths as Webview authority

### Requirement: Semantic And RAG Search Are Optional Providers
The system SHALL model semantic, vector, and RAG search as optional provider capabilities registered with `neko-search`. The base search service MUST continue to work without embeddings, OCR, full document parsing, vector stores, or LLM retrieval enabled.

#### Scenario: Text search works without semantic provider
- **WHEN** no semantic provider is registered
- **THEN** project search still returns deterministic text, entity, asset, media, document, and generated-asset results from available non-semantic providers

#### Scenario: Semantic provider reports model freshness
- **WHEN** a semantic provider contributes results
- **THEN** partition status includes enough provider metadata to detect stale embeddings caused by model, chunking, source, or index version changes

#### Scenario: RAG result preserves source refs
- **WHEN** a RAG provider returns a document, entity, asset, or media evidence hit
- **THEN** the result preserves source refs, document/range locators where available, freshness, and navigation data so Agent context and Preview reads stay aligned

### Requirement: Package Boundaries Are Enforced By Tests
The system SHALL include boundary tests or dependency checks that keep `neko-search` independent from Agent, Story, Assets, Dashboard, React Webview code, and concrete VSCode-only implementation modules outside its host integration layer.

#### Scenario: Core package has no feature package imports
- **WHEN** dependency boundary tests scan `packages/neko-search`
- **THEN** core modules do not import `neko-agent`, `neko-story`, `neko-assets`, `neko-dashboard`, React, Webview modules, or source-owned implementation services

#### Scenario: Webview has no search cache access
- **WHEN** dependency boundary tests scan Webview packages
- **THEN** Webview code does not import Node filesystem APIs, VSCode APIs, `.neko/.cache` readers, or `neko-search` host internals

#### Scenario: Agent no longer owns cache schemas
- **WHEN** dependency boundary tests scan Agent mention search code
- **THEN** Agent mention projection does not parse project search cache manifests or read project search cache files directly

### Requirement: Search Results Reference Cache-Backed Visuals Through Resource Refs
The system SHALL expose cache-backed thumbnails, document previews, generated asset previews, and media preview visuals in search results through stable resource references or host-projected display URIs rather than package-local cache file paths.

#### Scenario: Search result includes resource ref for thumbnail
- **WHEN** a project search provider returns a media, document, generated asset, or asset-library item with a cache-backed thumbnail
- **THEN** the returned search item includes a stable resource reference or host-projected thumbnail field without exposing package-local cache schema details

#### Scenario: Webview receives projected visual
- **WHEN** a Webview renders a project search result that has a cache-backed visual
- **THEN** the owning Extension Host resolves or projects the visual through the resource cache service before sending display data to the Webview

#### Scenario: Missing thumbnail reports status
- **WHEN** a search result visual resource is missing from cache
- **THEN** the search or host projection layer reports missing, stale, or materializing status instead of returning an unrelated local path

### Requirement: Search Consumers Do Not Read Resource Cache Files Directly
Search consumers SHALL use the project search service, resource cache service, or host-mediated projections to access cache-backed visuals and SHALL NOT read `.neko/.cache/resources/` manifests or package-local cache files directly.

#### Scenario: Agent mention result uses host adapter
- **WHEN** Agent mention completion displays a thumbnail or document preview for a search result
- **THEN** Agent uses a host adapter to obtain a projected resource visual rather than reading resource cache manifest files or thumbnail directories itself

#### Scenario: Dashboard search result avoids cache schema dependency
- **WHEN** Dashboard or another Webview displays global project search results
- **THEN** it receives search DTOs and host-projected visuals without importing resource cache manifest schemas or local filesystem paths as its data source

#### Scenario: Cache implementation can change
- **WHEN** the resource cache implementation moves from JSON manifest to SQLite cache index
- **THEN** project search consumers continue to work because they depend on shared resource refs and host APIs rather than cache file schemas

### Requirement: Asset Dimension Search Projection
The project search service SHALL project puppet/model asset dimensions from AssetLibrary records through the `asset-library` partition.

#### Scenario: Project search returns puppet model asset
- **WHEN** AssetLibrary contains a puppet model dimension record
- **THEN** ProjectSearch can return an `asset` item with media kind `puppet-model` and asset dimension `model`

#### Scenario: Project search returns model motion asset
- **WHEN** AssetLibrary contains a model motion dimension record
- **THEN** ProjectSearch can return an `asset` item with media kind `model-motion` and asset dimension `motion`

### Requirement: Bundle-Memory Metadata Projection
The project search service SHALL preserve bundle-memory metadata in projected search items without treating bundle locators as local file paths.

#### Scenario: Search item contains bundle metadata
- **WHEN** AssetLibrary contains a bundle-memory file record with `bundlePath#entryPath`
- **THEN** ProjectSearch includes the relevant storage mode and locator metadata in item metadata or navigation data

#### Scenario: Search does not read ZIP bytes
- **WHEN** ProjectSearch projects a bundle-memory asset
- **THEN** it does not open ZIP files or parse domain bundle contents during normal query projection

### Requirement: Same Partition Adapter Collision Avoidance
The system SHALL avoid registering multiple independent `ProjectSearchAdapter` instances for the same `asset-library` partition unless the coordinator supports composite same-partition providers.

#### Scenario: AssetLibrary adapter remains owner
- **WHEN** puppet and model dimensions are made searchable
- **THEN** they are projected through the AssetLibrary search adapter or a composite provider rather than replacing each other through duplicate partition registration

### Requirement: Project Search Exposes Semantic Coverage Through Host Facade
The project search service SHALL expose semantic coverage queries through a neutral host-mediated facade. The facade MUST accept shared semantic coverage query DTOs and return shared semantic coverage result DTOs without making Agent, Dashboard, Webviews, or domain packages read cache files or semantic sidecar schemas directly.

#### Scenario: Host command returns semantic coverage
- **WHEN** a consumer requests semantic coverage for a source reference, range, and analysis kind
- **THEN** the project search host facade routes the request through registered providers or indexed semantic facts
- **THEN** the consumer receives a shared semantic coverage result DTO

#### Scenario: Agent is not the cache coordinator
- **WHEN** Agent calls the semantic coverage facade
- **THEN** Agent does not parse `.neko/.cache`, `.neko/semantic-index`, search manifests, SQLite, FTS, or vector cache files
- **THEN** project search or an equivalent neutral host service owns provider fan-out, freshness aggregation, and diagnostics

### Requirement: Semantic Coverage Aggregates Facts Before Cache Projections
The project search service SHALL compute semantic coverage from semantic sidecars, character memory evidence, entity bindings, project facts, and provider status before using rebuildable cache projections as acceleration. Cache projections MUST NOT become the source of truth for semantic evidence.

#### Scenario: Cache deletion preserves coverage facts
- **WHEN** `.neko/.cache/` is deleted while `.neko/semantic-index` sidecars and character memory facts remain
- **THEN** semantic coverage can be rebuilt or reported from the remaining source facts without losing evidence identity

#### Scenario: Vector cache hit preserves source identity
- **WHEN** a vector or FTS cache row contributes to a coverage result
- **THEN** the result preserves the source semantic sidecar or evidence identity, source reference, freshness, and range metadata

### Requirement: Semantic Projections Use One Index Coordination Boundary
The project search service SHALL provide or delegate to a single neutral project index coordination boundary for semantic sidecar, character memory, entity binding, generated asset, and project fact projections into search, FTS, vector, or RAG caches.

#### Scenario: Sidecar change triggers one projection path
- **WHEN** a semantic sidecar changes
- **THEN** one project index coordination boundary invalidates or refreshes affected search/semantic cache partitions
- **THEN** domain packages do not each write independent, conflicting SQLite, FTS, or vector projections for the same evidence

#### Scenario: Provider refresh reports partition freshness
- **WHEN** a semantic provider refreshes OCR, ASR, subtitle, entity mention, or character observation evidence
- **THEN** project search reports affected coverage freshness and partition diagnostics through shared status metadata

### Requirement: Search indexes semantic evidence projections
The project search service SHALL support searchable projections from media semantic indexes, media text segments, entity mentions, semantic tags, and accepted or reviewable character memory evidence. These projections MUST preserve source references, confidence, provenance, freshness, and navigation metadata where available.

#### Scenario: OCR text is searchable through project search
- **WHEN** a media semantic index contains OCR text for a comic page or panel
- **THEN** project search can return a result for that text with the asset id, source ref, range, confidence, and navigation metadata

#### Scenario: Character memory evidence appears as search evidence
- **WHEN** an accepted or reviewable character observation is indexed
- **THEN** project search can return the observation as evidence linked to the creative entity or candidate without exposing the raw ledger file path as the Webview authority

### Requirement: Semantic index facts remain separate from cache projections
The project search service SHALL treat media semantic indexes and character memory evidence as project facts or sidecar records and SHALL project them into `.neko/.cache/` only as rebuildable search, FTS, semantic, vector, or RAG cache data. Cache databases MUST NOT become the source of truth for semantic evidence.

#### Scenario: Cache rebuild restores semantic search
- **WHEN** `.neko/.cache/` is deleted
- **THEN** semantic search projections can be rebuilt from semantic sidecars, character memory files, entity bindings, project facts, and available provider outputs

#### Scenario: Cache write does not mutate facts
- **WHEN** project search writes FTS or vector cache rows for semantic text segments
- **THEN** it does not alter the source semantic index, character memory ledger, entity records, or asset metadata

### Requirement: Semantic indexing is incremental and defers heavy work
The project search service SHALL index existing semantic sidecar and ledger records incrementally, and SHALL NOT block project open on OCR, ASR, embedding, full media probing, or PerceptionCard regeneration. Heavy extraction and embedding work MUST run only through explicit, idle, import, or on-demand provider workflows.

#### Scenario: Project open indexes existing semantic sidecars
- **WHEN** a project opens with existing semantic index files
- **THEN** search can index their text and entity evidence without running new OCR, ASR, or embedding jobs during the blocking open path

#### Scenario: Missing embeddings do not block text search
- **WHEN** no semantic/vector provider is registered or embeddings are stale
- **THEN** deterministic text search still works from available semantic text segments and project facts

### Requirement: Semantic search consumers use service APIs
Agent, Dashboard, Webview, Assets UI, Story UI, Preview, and future consumers SHALL query semantic evidence through the project search service or host-mediated projections rather than reading semantic-index sidecars, cache files, or provider-specific JSON schemas directly.

#### Scenario: Agent retrieves semantic evidence through search adapter
- **WHEN** Agent needs relevant OCR, subtitle, ASR, or character memory evidence for context assembly
- **THEN** it calls the project search service or host adapter with explicit query scope and mode
- **THEN** it does not parse `.neko/semantic-index` or `.neko/.cache` files directly

#### Scenario: Webview renders projected semantic hit
- **WHEN** a Webview displays a semantic search result
- **THEN** it receives projected labels, snippets, confidence, navigation data, and host-projected display URIs
- **THEN** it does not receive local cache file paths as its data source

### Requirement: Semantic projection reports freshness and provider status
The project search service SHALL report freshness and provider status for semantic evidence partitions, including missing sidecars, stale projections, unavailable extractors, failed extraction tasks, stale embeddings, and rebuild-in-progress states.

#### Scenario: Stale semantic partition is visible
- **WHEN** a semantic index sidecar changes while search cache still contains older projected rows
- **THEN** project search marks the semantic partition stale or rebuilding until the projection catches up

#### Scenario: Extractor failure is isolated
- **WHEN** an OCR or ASR provider fails while updating semantic evidence for one asset
- **THEN** project search reports the failed semantic partition or asset status
- **THEN** other healthy search partitions remain queryable

