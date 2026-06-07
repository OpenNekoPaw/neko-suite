## 1. Shared Contracts

- [x] 1.1 Add host-agnostic media semantic index and contribution contracts in `packages/neko-types`, including `MediaSemanticIndex`, `MediaTextSegment`, `MediaBoundingBox`, `SemanticTag`, `PerceptionCardRef`, `EntityMemoryContribution`, and `ContributionDiagnostic`.
- [x] 1.2 Reuse or alias existing `ContentStableSourceRef` and `CharacterMemorySourceRef` for semantic source and evidence source fields without introducing a third durable source-ref family.
- [x] 1.3 Add media text source-kind constants and mapping helpers that align OCR, subtitle, ASR, script, canvas, cut, document, generated-asset, manual, and Agent evidence with `CharacterObservation.provenance.source`.
- [x] 1.4 Export the new contracts from shared type entrypoints while preserving existing character-memory, content-access, PerceptionCard, and composite-artifact public names.

## 2. Validation

- [x] 2.1 Add validators for semantic indexes, media text segments, semantic tags, perception refs, contributions, diagnostics, confidence values, review policies, and source-kind mappings.
- [x] 2.2 Reject unsafe durable values such as Webview URIs, file URIs, blob/object URLs, absolute host paths, runtime handles, inline base64 media, non-serializable values, and oversized payloads.
- [x] 2.3 Validate `MediaBoundingBox` with finite numeric coordinates, non-negative dimensions, and supported units.
- [x] 2.4 Validate `MediaTextRange` field combinations against `sourceRef.kind` and report diagnostics for contradictory or irrelevant range fields.

## 3. Capability Facets

- [x] 3.1 Extend existing capability/artifact facet metadata with entity provider, entity memory contributor, media text extractor, perception provider, semantic index provider, review surface, and representation resolver facets.
- [x] 3.2 Ensure facet registration is discoverable through capability introspection without injecting provider implementations into LLM context.
- [x] 3.3 Add availability, trust, risk, approval, and host requirement metadata for semantic index and entity memory contribution/write operations.
- [x] 3.4 Add skip diagnostics for missing or unavailable semantic/evidence providers referenced by Skills, profiles, or contributions.

## 4. Agent And Review Flow

- [x] 4.1 Add Agent helpers that project existing comic/storyboard/character-memory extraction outputs into `EntityMemoryContribution` records.
- [x] 4.2 Add review artifact projection for contributions using `CompositeArtifact` and `GenericTable` without confirming facts automatically.
- [x] 4.3 Route accept, reject, conflict, and supersede actions through existing delegated lifecycle or review operations rather than mutating entity facts from the contribution envelope.
- [x] 4.4 Preserve `source-approved` as fast-review metadata only, with tests proving it does not directly create accepted observations.

## 5. Semantic Index And Search Projection

- [x] 5.1 Add project semantic-index sidecar or JSON read/write adapters that store stable refs and searchable projections without original media payloads.
- [x] 5.2 Add projection from `PerceptionCard` to `PerceptionCardRef`, `MediaTextSegment`, entity mentions, and semantic tags without embedding full cards.
- [x] 5.3 Add project search provider support for semantic text, entity mention, semantic tag, and character memory evidence partitions.
- [x] 5.4 Keep semantic search cache data under `.neko/.cache/` as rebuildable projection and preserve JSON/sidecar records as source of truth.
- [x] 5.5 Ensure OCR, ASR, embedding, and heavy perception work is idle/on-demand/import-driven and does not block project open.

## 6. Tests And Quality Gates

- [x] 6.1 Add unit tests for new shared contracts and validators, including invalid refs, invalid bounding boxes, invalid source kinds, invalid review policies, unsafe runtime handles, and oversized payloads.
- [x] 6.2 Add capability registry tests proving semantic facets are discoverable, unavailable providers degrade safely, and Skill/profile references do not register executable providers.
- [x] 6.3 Add Agent artifact tests for contribution projection, review-policy behavior, and non-mutating accept/reject/conflict routing.
- [x] 6.4 Add search projection tests for semantic evidence indexing, freshness status, cache rebuild behavior, and Webview-safe projected results.
- [x] 6.5 Run targeted package tests for affected shared, Agent, search, and projection modules.
- [x] 6.6 Run `openspec validate introduce-unified-entity-memory-semantic-index --type change`, `git diff --check`, and the repository quality review checklist for the touched modules.
