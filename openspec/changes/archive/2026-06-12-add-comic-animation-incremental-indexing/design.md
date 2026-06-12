## Context

Comic-to-animation currently has storyboard planning, shot image prep plans, CompositeArtifact review, TransformImage/GenerateImage routing, Canvas shot display, and Cut prepared keyframe handoff. The remaining gap is the long-form evidence pipeline: newly added comic/media assets must be immediately referenceable, then incrementally indexed into stable OCR/ASR/panel/visual/plot evidence that Agent, Canvas, and later provider execution can reuse.

The design follows `adr-comic-to-animation-capability-gap.md` and stays aligned with existing ADRs:

- `adr-structured-data-persistence.md`: sidecar/JSON remains the auditable source of truth; SQLite/FTS/vector is a rebuildable query projection.
- `adr-unified-entity-memory-semantic-index.md`: entity, character memory, and semantic-index contributions remain the global identity/memory protocol.
- `adr-comic-to-animation-image-prep.md`: ShotImagePrepPlan remains the image-prep domain plan; this change adds upstream evidence and generic batch approval support.

## Goals / Non-Goals

**Goals:**

- Define shared P1 contracts for incremental asset range indexing, visual occurrence evidence, local perception capability facets, story continuity queries, and generic batch execution plans.
- Keep new contracts host-agnostic and stable-reference-only.
- Let local OCR/panel/mask providers be discoverable through capability facets without treating them as cloud services.
- Support sidecar/JSON facts with rebuildable SQLite/FTS/vector projection.
- Allow Agent and Canvas to review candidate evidence, unresolved identity matches, continuity diagnostics, and batch execution plans.

**Non-Goals:**

- Do not implement full RAG, local VLM, video person tracking, or automatic long-form story reasoning in P1.
- Do not make SQLite the source of truth.
- Do not let Skill markdown register providers, bypass approval gates, or write confirmed entities directly.
- Do not replace StoryboardTable, ShotImagePrepPlan, CompositeArtifact, or PerceptionCard.

## Decisions

### D1: Shared contracts live in `@neko/shared`

`IndexedRangeState`, `VisualOccurrence`, `PerceptionCapabilityFacet`, continuity contracts, and `BatchExecutionPlan` belong in shared types (`packages/neko-types/src/types`) with validators and guards. Agent, Canvas, Cut, and platform/provider adapters consume them.

Alternative considered: define these only in `neko-agent`. That would make Canvas/Cut and provider adapters depend on Agent internals or duplicate DTOs.

### D2: Local perception still uses capability provider facets

Local OCR, panel detection, speech balloon mask, and visual occurrence extraction do not need cloud providers, but they still need capability discovery. They should register as `builtin`, `local`, or `engine` providers through typed capability facets.

This allows the runtime to answer:

- Is this task supported?
- Is it sync-light or async?
- What device tier and concurrency are safe?
- Is confidence provided?
- Can it be retried, cancelled, cached, or replaced by a fallback?

Pure validators/projectors and deterministic queries do not need provider registration.

### D3: Sidecar/JSON is SSOT, SQLite is projection

Authoritative data is stored in source assets, `.neko/semantic-index`, `.neko/memory`, and `.neko/runs`. SQLite/FTS/vector indexes are cache projections for performance and can be rebuilt.

This avoids migration fragility and aligns with the structured-data persistence ADR.

### D4: Story continuity uses explicit query snapshots

`PlotEvent`, `CharacterStateChange`, and `ContinuityConstraint` are write-side records. Agent reads them through `StoryContinuityQuery` and `StoryContinuitySnapshot`. Omitted `lookbackLimit` does not mean full project scan; runtime defaults to scene/chapter boundary and enforces a system cap.

### D5: BatchExecutionPlan is a generic approval envelope

`BatchExecutionPlan` is not a provider request. It is a reviewable, recoverable plan that runtime adapters project into concrete perception or media requests. It starts with `asset-indexing` and `shot-image-prep`, with extensible `targetDomain` values aligned to capability namespaces.

### D6: P1 chooses small closed workflow slices

P1 implements:

- asset range indexing states,
- visual occurrence evidence,
- local/engine provider facets for OCR/panel/mask,
- story continuity query snapshots,
- BatchExecutionPlan projection and diagnostics,
- CompositeArtifact/GenericTable review surfaces.

P1 does not require full persistence engines or all providers to be available. Unavailable providers and unknown costs must produce diagnostics, not fabricated outputs.

## Risks / Trade-offs

- Contract surface grows quickly -> P1 limits implementation to the minimum contract subset and validators.
- Provider terminology may confuse local capabilities with cloud services -> docs and types distinguish provider `source` values such as `builtin`, `local`, and `engine`.
- SQLite projection can become mistaken for source of truth -> runtime writes sidecar/JSON first and marks SQLite rebuildable.
- Continuity snapshots can grow too large -> default lookback is bounded by scene/chapter and runtime limits.
- Low-confidence evidence may pollute character memory -> confidence-less and low-confidence outputs are `needs-review` and cannot auto-confirm identity or memory facts.
- Batch plans may overlap with domain requests -> domain requests remain provider-specific; BatchExecutionPlan is the approval/recovery envelope.

## Implementation Notes

- Shared contracts landed in `packages/neko-types/src/types/comic-animation-indexing.ts`, with Canvas shot review fields added to `packages/neko-types/src/types/canvas.ts` so Canvas can display host-projected visual occurrences, character candidates, continuity diagnostics, and batch execution plans without depending on Agent internals.
- Agent runtime integration landed in `packages/neko-agent/packages/agent/src/runtime/comic-animation-indexing-runtime.ts`; it provides sidecar-first/cache-projection ports and pure planning/query helpers, but does not implement provider IO or SQLite as source of truth.
- Agent Webview renders `CompositeArtifact` and paged artifact blocks through a read-only RichContent renderer. It consumes only transfer payloads delivered by the host and never reads `.neko/semantic-index`, `.neko/memory`, `.neko/runs`, SQLite, or vector cache files directly.
- Canvas uses the existing composable preset system to add read-only shot review sections. Batch/action gate metadata is preserved through property item enumeration so unavailable providers, missing capabilities, diagnostics, unknown costs, low confidence, and conflicts can be surfaced without embedding execution policy in the UI.
