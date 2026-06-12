## ADDED Requirements

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
