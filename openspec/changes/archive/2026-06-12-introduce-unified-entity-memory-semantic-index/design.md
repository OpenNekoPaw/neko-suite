## Context

Neko Suite already has the pieces needed for long-form semantic continuity:

- `CreativeEntityRef`, `CreativeEntityCandidate`, `EntityAssetBinding`, and `RepresentationResolver` provide stable creative identity and representation binding.
- `CharacterObservation`, `CharacterEvidenceLedger`, `CharacterStateSnapshot`, and `CharacterChangeEvent` provide progressive character memory.
- `PerceptionCard` provides provider-agnostic media perception evidence.
- `ContentStableSourceRef` and `CharacterMemorySourceRef` provide stable source and evidence references.
- `CompositeArtifact` and `GenericTable` provide reviewable Agent artifacts.
- Capability Protocol already separates registration, injection, artifact facets, risk, trust, and provider availability.
- Project search/cache already separates authoritative facts from rebuildable local cache projections.

The missing piece is a cross-package evidence envelope and media semantic index. Today, a comic OCR result, a Cut subtitle cue, a PerceptionCard transcript, a Story role mention, and an Agent-inferred character observation can all exist, but there is no shared protocol that lets subpackages contribute them to a common review/search/memory pipeline without each package inventing its own table or payload.

This change is contract-first. It adds shared types and validator behavior, then adds provider facets and review/index projections. It does not move ownership of confirmed facts away from Story, Entity, Assets, or delegated write services.

## Goals / Non-Goals

**Goals:**

- Define host-agnostic shared contracts for `MediaSemanticIndex`, `MediaTextSegment`, `MediaBoundingBox`, `SemanticTag`, `PerceptionCardRef`, `EntityMemoryContribution`, and `ContributionDiagnostic`.
- Reuse `ContentStableSourceRef` for content identity and `CharacterMemorySourceRef` for evidence identity instead of adding another stable-ref union.
- Let Story, Canvas, Cut, Assets, Agent, Dashboard, and runtime-media contribute entity candidates, observations, text segments, semantic tags, and diagnostics through one contribution envelope.
- Keep contributions reviewable and non-authoritative until accepted through user review or delegated lifecycle commands.
- Register support through typed capability facets under the existing Capability Protocol registry.
- Project semantic-index data into project search and optional SQLite/FTS/vector caches while keeping JSON/sidecar facts as source of truth.
- Clarify that `PerceptionCard` remains upstream perception evidence; semantic indexes store lightweight refs and searchable projections.

**Non-Goals:**

- No automatic OCR/ASR/embedding processing for every project on open.
- No direct mutation of `CharacterRecord`, asset metadata, media files, or confirmed entity facts from an `EntityMemoryContribution`.
- No new parallel capability registry or Agent-only provider registry.
- No new database dependency for the base feature; SQLite/vector stores remain optional cache projections governed by structured-data persistence.
- No attempt to solve full entity matching, character merge policy, or visual recognition in this change.
- No Webview access to local cache files, Node APIs, VSCode APIs, or runtime handles.

## Decisions

### Decision 1: Use a contribution envelope instead of package-specific tables

`EntityMemoryContribution` groups entity candidates, character observations, media text segments, asset requirements, and diagnostics with one source package, source ref, and review policy.

Alternative considered: let each package emit its own custom review table. That would repeat the `StoryboardTable` overuse problem and make Dashboard/Agent review depend on package-specific JSON shapes.

### Decision 2: Reuse existing source reference contracts

`MediaSemanticIndex.sourceRef` uses a `ContentStableSourceRef`-aligned alias for stable content identity. `MediaTextSegment.sourceRef` and contribution source refs use `CharacterMemorySourceRef` because text segments can become `CharacterObservation` evidence.

Alternative considered: define `StableResourceRef` or `StableSourceRef`. That would create a third source-ref family and make validators, content access, and character memory drift apart.

### Decision 3: Keep PerceptionCard upstream and index only projections

The semantic index stores `PerceptionCardRef` plus projected text segments, entity mentions, and tags. It does not embed full cards, inline base64, provider payloads, or Webview URIs.

Alternative considered: store full `PerceptionCard` records in `MediaSemanticIndex`. That would duplicate perception persistence, increase cache invalidation complexity, and blur the difference between perception evidence and searchable project index.

### Decision 4: Review policy controls default workflow, not authority

`reviewPolicy` values such as `draft-only`, `requires-user-review`, and `source-approved` guide initial review status, queue priority, and fast-review behavior. They do not grant accepted status or permission to mutate confirmed facts.

Alternative considered: allow trusted packages to submit `accepted` observations directly through the envelope. That makes package trust too implicit and bypasses delegated write auditing.

### Decision 5: Typed facets live under Capability Protocol

Entity provider, memory contributor, media text extractor, perception provider, semantic-index provider, review surface, and representation resolver support are typed facets of existing capability/artifact contribution metadata. Heavy implementations still execute through tools, commands, providers, or delegated operations.

Alternative considered: create a new semantic protocol registry. That would duplicate lifecycle, trust, host availability, and introspection logic already solved by Capability Protocol.

### Decision 6: Semantic index facts and cache projections stay separate

Semantic evidence can be stored in project sidecars or JSON facts, then projected into `.neko/.cache/` for FTS/vector/RAG acceleration. Cache DBs remain rebuildable and are never the source of truth.

Alternative considered: store semantic evidence primarily in SQLite. That would conflict with the structured-data persistence ADR, reduce Git friendliness, and make cache deletion destructive.

### Five-Layer Analysis

**Responsibilities:**

- `neko-types` owns shared contracts, closed vocabularies, validators, and safe-ref checks.
- Agent owns extraction orchestration, contribution creation, review artifact projection, and generation context assembly.
- Story, Canvas, Cut, Assets, and runtime-media own domain extraction and provider facets for their local evidence.
- Dashboard and Agent review surfaces own accept/reject/conflict/supersede interactions.
- Project search owns queryable projections, freshness, indexing, and optional semantic/vector provider integration.

**Dependencies:**

- Shared contracts remain L0 and host-agnostic.
- Webview consumers receive projected DTOs and display URIs only.
- Extension/host adapters own file access, source resolution, provider execution, and delegated writes.
- Cross-package integration flows through shared contracts, capability facets, and project search providers rather than direct package imports.

**Interfaces:**

- `MediaSemanticIndex` indexes stable asset/source evidence.
- `MediaTextSegment` represents OCR, subtitle, ASR, caption, script, manual, and Agent text evidence.
- `EntityMemoryContribution` is the cross-package envelope.
- `ContributionDiagnostic` reports validation, extraction, source, review, and provider issues.
- Capability facets describe who can provide, extract, review, index, or resolve.
- Project search exposes semantic evidence as searchable items or optional semantic hits.

**Extension:**

- New source kinds must map to `CharacterObservation.provenance.source` or declare validator mappings.
- New semantic tags can use stable labels and confidence without expanding the base schema.
- New packages can contribute facets without changing Agent core.
- Future discriminated ranges can replace flat `MediaTextRange` if field ambiguity becomes a real problem.

**Testing:**

- Type guard and validator tests cover missing refs, unsafe runtime handles, invalid bounding boxes, invalid confidence, oversized payloads, unknown source kinds, and review policy behavior.
- Capability tests verify registered facets are discoverable without injection and unavailable providers degrade safely.
- Projection tests verify PerceptionCard-to-index projection stores refs and selected evidence only.
- Search tests verify semantic evidence is searchable through service APIs and not read directly from cache files by Webview or Agent consumers.

## Risks / Trade-offs

- **Risk: Protocol bloat.** → Keep the base protocol small, use existing source refs, and avoid custom package-specific table contracts.
- **Risk: Contributions become accidental truth.** → Enforce review status, delegated lifecycle commands, and non-mutating contribution validation.
- **Risk: Range fields are too broad.** → Start with `CharacterMemorySourceRange` plus bounding box and validate field combinations by `sourceRef.kind`; consider discriminated union only after usage data.
- **Risk: Search/indexing becomes expensive.** → Keep OCR/ASR/embedding on idle/on-demand/import tasks and make semantic/vector providers optional.
- **Risk: Capability facets duplicate provider APIs.** → Store facets as lightweight metadata only; execution remains through existing provider/tool/command paths.
- **Risk: Perception and semantic index lifecycles diverge.** → Store card refs and projection metadata so indexes can be rebuilt when perception cards change.

## Migration Plan

1. Add shared contracts and validators without requiring existing projects to create semantic index files.
2. Add Agent helpers to create reviewable contributions from existing comic/storyboard/character-memory outputs.
3. Add capability facet metadata and discovery tests, keeping provider execution unchanged.
4. Add optional project semantic-index sidecar readers/writers and search projection adapters.
5. Add Dashboard or Agent review integration for accepting/rejecting contributions through existing lifecycle operations.
6. Add optional runtime-media/Cut/Story/Canvas/Assets contributors incrementally.

Rollback is straightforward for early phases: ignore the optional contribution and semantic-index files, keep existing character-memory, storyboard, content access, and project search flows active, and rebuild cache projections from existing JSON facts.

## Open Questions

- Should the first review UI be Agent artifact rendering, Dashboard entity detail, or a shared review panel?
- Should generated asset packages standardize `semantic.json` immediately or wait until semantic-index sidecar usage stabilizes?
- Which service should coordinate PerceptionCard-to-semantic-index rebuilds: perception pipeline, asset indexer, or project cache coordinator?
- Should accepted semantic text evidence be stored as one project-wide file, per-asset sidecars, or both with a manifest?
