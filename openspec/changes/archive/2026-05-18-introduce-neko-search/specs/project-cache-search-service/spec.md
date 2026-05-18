## ADDED Requirements

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
