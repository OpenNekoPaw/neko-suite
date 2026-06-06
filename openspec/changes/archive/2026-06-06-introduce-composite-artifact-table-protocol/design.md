## Context

Neko Suite already has several related but separate contracts:

- `StoryboardTable` expresses semantic storyboard rows and remains the correct domain protocol for scene/shot planning.
- Canvas and Cut have domain import payloads and mutation paths that should remain package-owned.
- `EditOperation` represents deterministic confirmed edits with apply/invert/undo semantics.
- `PerceptionCard` represents media observation data produced from assets and tool results.
- Capability Protocol already separates registration from injection and exposes trust, host, and approval metadata.

The missing layer is a stable artifact envelope for structured, multimodal, reviewable Agent output that is not always a storyboard. Comic-to-animation workflows need shot plans, asset prep tables, source-panel galleries, dialogue maps, clean-plate/mask/depth requirements, and eventual storyboard/Cut projections. Dashboard and future packages need similar generic table surfaces without adopting storyboard semantics.

Five-layer analysis:

| Layer | Design stance |
| ----- | ------------- |
| Responsibilities | Shared contracts define artifact/profile data and validators; Agent generates, validates, transfers, and orchestrates; packages render generic artifacts and register directed projectors/providers; providers perform real side effects. |
| Dependencies | `@neko/shared` / `packages/neko-types` own host-agnostic types; `@neko/agent-types` owns transfer DTOs; Webviews never import VSCode or resolve host paths; Extension Host resolves stable refs to runtime preview URIs. |
| Interfaces | Protocol/profile/renderer/projector/capability registrations are typed facets of the existing Capability Protocol registry. |
| Extension | Skills can add profile descriptors and generation guidance; new execution capability still requires package/provider registration. |
| Testing | Pure validators cover schema/profile/resource safety; Agent transfer tests cover paging/backfill/recovery; package tests cover projector gating and missing-provider degradation. |

## Goals / Non-Goals

**Goals:**

- Introduce `CompositeArtifact` and `GenericTable` as shared, host-agnostic contracts for structured artifacts and dynamic tables.
- Keep `StoryboardTable`, Canvas payloads, Cut payloads, and `EditOperation` as domain/execution protocols rather than replacing them.
- Support Skill-local and shared Profile Descriptors that constrain table/profile output while staying separate from runtime Skill execution.
- Keep Agent core small: it validates, dispatches through registries, renders generic fallbacks, requests approval, and reports execution summaries.
- Use the existing Capability Protocol registry as the artifact registration ground truth.
- Support safe multimodal references, unknown-profile degradation, Webview recovery, and background task backfill.

**Non-Goals:**

- Do not implement a full artifact editor or spreadsheet engine.
- Do not convert all package-specific protocols into `GenericTable`.
- Do not allow Skill Markdown or Profile Descriptors to grant execution capability.
- Do not persist Webview URI, blob URL, base64, absolute local path, localhost URL, or private cache path values in artifacts.
- Do not maintain a multi-version compatibility matrix before 1.0; use lightweight version diagnostics and explicit rebuild/migration.
- Do not merge `PerceptionCard` into artifact schema.

## Decisions

### Decision 1: Use a composite artifact envelope with closed current block and cell vocabularies

`CompositeArtifact` carries metadata, provenance, blocks, diagnostics, suggested actions, and extension fields. `GenericTable` carries columns, rows, diagnostics, and actions. current block/cell kinds are closed base vocabularies so validators and renderers can reason about unknown values safely.

Open-ended domain data goes through:

- `domain` blocks for strong semantic payloads such as `StoryboardTable`.
- `json` cells with bounded validation and optional `schemaRef`.
- namespaced `extensions` metadata that cannot carry executable commands.

Alternative considered: make block/cell kinds an open union. Rejected because every package would need defensive render/execute code for unbounded shapes.

### Decision 2: Profile is a validator contract first and a renderer hint second

Profile Descriptors define expected columns, required fields, cell types, resource modalities, display hints, suggested actions, and optional mappings. The base validator checks generic table shape and unsafe values; the profile validator checks conformance to the declared profile. Renderers may use profile hints, but cannot relax validation or grant actions.

Profile defaults to Skill-local management:

```text
<skill>/
  SKILL.md
  skill.json
  profiles/*.profile.json
```

Shared profiles are registered only when they are reused across Skills or packages.

Alternative considered: make Profile a second kind of runtime Skill. Rejected because Profile describes output structure, not workflow behavior, and would confuse Agent selection.

### Decision 3: Use lightweight pre-1.0 versioning

Persisted artifacts keep `schemaVersion`; shared Profile Descriptors keep `version`; persisted artifacts that reference shared profiles keep `profileVersion`. Temporary chat artifacts may omit `profileVersion`.

Before 1.0, the implementation does not need multi-version validators or a compatibility matrix. Unsupported versions produce diagnostics and read-only degradation; explicit migrators or re-generation can create new artifacts when needed.

Alternative considered: introduce `minReadableVersion` / `maxReadableVersion` compatibility metadata now. Rejected as too heavy before the product is public.

### Decision 4: Add artifact facets to Capability Protocol, not a parallel registry

Artifact protocol, profile, renderer, projector, and artifact capability registrations are typed facets over the existing Capability Protocol registry. Registration remains lightweight and inspectable; injection or provider loading remains lazy and policy-controlled.

This keeps Agent from hardcoding all protocols and keeps packages from publishing private registries that Agent must separately query.

### Decision 5: Separate review/transform/execute actions

Artifact actions fall into view, review, transform, and execute layers. Only execute has side effects and must pass:

```text
validate artifact
  -> resolve projector/adapter
  -> resolve capability provider
  -> approval gate
  -> provider execute
  -> execution summary
```

`EditOperation` remains the deterministic mutation representation after approval, not a planning table or artifact substitute.

### Decision 6: Transfer artifacts through existing Agent message/backfill paths

Small artifacts can travel as snapshots on tool result/backfill payloads. Large artifacts use an artifact manifest and block pages. Background completion uses backfill merge. Webview rebuild uses the same projection/recovery model as task lifecycle.

P1 should first integrate artifact transfer as sub-payloads of existing `toolResult` / `toolResultBackfill` messages. Independent top-level postMessage types are reserved for cross-conversation or non-tool-lifecycle artifacts.

### Decision 7: Keep `PerceptionCard` as upstream observation

`PerceptionCard` describes an asset's structural/perceptual/semantic observation. `CompositeArtifact` describes a task-facing plan, table, comparison, diagnostic, or suggested action. Artifact blocks can reference PerceptionCard asset refs or summaries, but must not embed the full perception pipeline state.

## Risks / Trade-offs

- [Risk] Artifact protocol becomes another universal JSON. -> Mitigation: closed V1 vocabularies, profile validators, `domain` payloads for strong semantics, and no direct execution from generic tables.
- [Risk] Registry mechanisms sprawl. -> Mitigation: artifact support is a Capability Protocol facet, not a new global registry.
- [Risk] Skills appear to add execution power. -> Mitigation: Skills and profiles can reference capabilities only; providers and approval gates control side effects.
- [Risk] Webview transfer grows expensive. -> Mitigation: snapshot for small artifacts, block paging for large artifacts, and backfill/recovery tests.
- [Risk] `json` cells become hidden nested protocols. -> Mitigation: bounded validation, shallow shape checks, optional `schemaRef`, and no execute action when schema cannot be resolved.
- [Risk] Pre-1.0 schema churn breaks stored artifacts. -> Mitigation: version diagnostics, read-only degradation, and explicit migrator/regeneration paths.

## Migration Plan

1. Define shared contracts and validators without changing existing storyboard imports.
2. Add Agent presentation/transfer support with generic rendering and unknown-profile diagnostics.
3. Add artifact facets to Capability Protocol and register existing storyboard-to-Canvas/Cut projectors.
4. Update Canvas/Cut/Story/Dashboard incrementally to render generic tables and expose directed actions only when providers are registered.
5. Add a focused comic-to-animation or comic-shot-asset-prep Skill scenario to validate Skill-local profiles, galleries, and storyboard projection.
6. Keep a rollback path where Agent can continue emitting existing `StoryboardTable` and Canvas/Cut continue importing it directly.

## Open Questions

- Which package path should host the first implementation: `packages/neko-types/src/types/artifact-*` or a more domain-specific shared folder?
- Should shared Profile Descriptors be loaded through Skill manifests first, CapabilityContribution artifact facets first, or both in P0?
- What artifact size threshold triggers block paging instead of snapshot delivery?
- Should the first Dashboard integration render only tables, or also gallery/comparison blocks?
