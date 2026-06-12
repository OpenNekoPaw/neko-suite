## ADDED Requirements

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
