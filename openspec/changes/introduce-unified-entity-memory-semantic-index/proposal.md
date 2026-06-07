## Why

Long-form comic-to-animation and cross-media authoring workflows need a durable way to reuse character, dialogue, OCR, subtitle, ASR, media perception, and user-reviewed evidence across many Agent turns and subpackages. Current contracts already provide unified creative entity identity, progressive character memory, PerceptionCard, content access, and project search foundations, but there is no single contribution and semantic-index protocol that lets Story, Canvas, Cut, Assets, Agent, Dashboard, and runtime-media exchange this evidence without hard-coded package coupling.

This change introduces a shared runtime protocol for entity/memory contributions and media semantic indexing so subpackages can dynamically contribute reviewable evidence while confirmed facts remain controlled by existing entity, asset, story, and delegated write services.

## What Changes

- Add a unified entity/memory/semantic-index protocol that defines `MediaSemanticIndex`, `MediaTextSegment`, `MediaBoundingBox`, `SemanticTag`, `PerceptionCardRef`, `EntityMemoryContribution`, and `ContributionDiagnostic` as shared host-agnostic contracts.
- Align media source references with existing `ContentStableSourceRef` and evidence references with existing `CharacterMemorySourceRef` instead of introducing parallel stable-ref systems.
- Define the mapping between media text provenance source kinds and `CharacterObservation.provenance.source` so OCR, subtitle, ASR, script, canvas, cut, document, generated-asset, manual, and Agent-derived evidence can project into progressive character memory.
- Add typed capability facets for entity providers, entity-memory contributors, media text extractors, perception providers, semantic-index providers, review surfaces, and representation resolvers as fields/views of the existing Capability Protocol registry.
- Define review-policy semantics for contributions so source packages can mark evidence as draft, needs-review, or source-approved for fast review without auto-confirming accepted facts.
- Define how PerceptionCard remains upstream perception evidence while semantic indexes store only lightweight refs and searchable projections.
- Extend project search/cache requirements so semantic indexes remain Git-trackable SSOT sidecars or JSON files, while SQLite/FTS/vector stores remain rebuildable cache projections.
- Preserve existing Storyboard, CharacterMemory, PerceptionCard, ContentAccess, and ProjectSearch contracts; this change adds the cross-package evidence envelope and index layer above them.

## Capabilities

### New Capabilities

- `unified-entity-memory-semantic-index`: Shared contracts, validation, contribution flow, review semantics, and data flow for cross-package entity candidates, character observations, media text segments, semantic tags, and PerceptionCard projections.

### Modified Capabilities

- `agent-capability-injection`: Add requirements that entity/memory/semantic-index support is declared as typed facets of the existing capability registry, not a parallel registry or Skill-granted executable power.
- `project-cache-search-service`: Add requirements that media semantic indexes and text/evidence segments can be projected into project search and optional semantic/vector cache while preserving JSON/sidecar as the source of truth.

## Impact

- Shared type contracts and validators in `packages/neko-types/src/types/`.
- Agent artifact and review flows that currently emit character observations or composite artifacts without a generalized contribution envelope.
- Capability registration metadata in Agent/platform packages and future Story, Canvas, Cut, Assets, Dashboard, and runtime-media providers.
- Project search/indexing services that will need a semantic-index partition and safe projection from sidecar facts to cache-backed search.
- Agent Skill prompts and profile descriptors that should output only evidence-backed observations and source refs, not direct confirmed facts.
- Dashboard or Agent review surfaces that can accept, reject, conflict, supersede, or delegate confirmation operations.
- No new external runtime dependency is required; SQLite/vector integration remains optional cache projection under the existing structured-data persistence strategy.
