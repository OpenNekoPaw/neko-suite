## Context

Neko Suite already has a useful creative entity model, but runtime ownership is transitional:

- `@neko/shared` defines `CreativeEntity`, `CreativeEntityRegistry`, entity-asset bindings, requirements, visual drafts, representation resolution contracts, and VSCode helper services.
- `characters.json` is the current Git-trackable character identity source.
- `neko-story` owns the practical runtime today: `CharacterWorkspaceIndexService`, `CreativeEntityWorkspaceIndexService`, `CreativeEntityManagementService`, Story creative entity commands, and the Dashboard entity source.
- `neko-dashboard` displays projected entity rows/details and delegates actions to owning sources.
- `neko-assets` owns asset files and asset metadata, not entity identity.
- `neko-search` is being proposed as a derived search/index plane, not an entity fact owner.

This is workable while entities are mostly Story characters. It becomes fragile once entities become project-wide facts used by Dashboard, Canvas, Assets, Agent, Search, documents, and future generated media workflows. Story should contribute script-derived candidates and occurrences, but it should not remain the only runtime owner of project semantic identity.

Five-layer analysis:

- Responsibilities: `neko-entity` owns project entity facts and lifecycle; Story owns script extraction; Assets owns resources; Search owns projections; Dashboard owns UI aggregation.
- Dependencies: domain consumers depend on `@neko/shared` contracts and `neko-entity` runtime APIs; `neko-entity` must not import Story, Assets, Agent, Dashboard, Search, React, or Webview implementation modules.
- Interfaces: registry, candidate lifecycle, bindings, requirements, drafts, source/provider registration, search projection, Dashboard source, and change events are separate interfaces.
- Extension: new entity kinds and source providers can be added without changing Story internals or Dashboard Webview schemas.
- Tests: entity lifecycle and persistence can be tested with fixture stores; host commands/watchers can be tested at VSCode boundary; consumers can be tested through contracts.

Existing constraints remain:

- `@neko/shared` remains the DTO/type guard source.
- Git-trackable project facts remain outside `.neko/.cache`.
- Webviews do not read/write entity files directly.
- Entity changes do not automatically rewrite asset metadata.
- Search indexes and graphs are derived and rebuildable.

## Goals / Non-Goals

**Goals:**

- Create `packages/neko-entity` as the neutral runtime owner for creative entity facts and lifecycle operations.
- Preserve `characters.json` compatibility and avoid a forced immediate migration.
- Add a forward-compatible store for non-character first-class entities such as scenes, locations, objects, and styles.
- Move reusable shared/Story entity runtime services into `neko-entity` or wrap them behind `neko-entity` facades.
- Provide candidate confirmation, rename, deprecate, merge/split, alias management, binding, requirement, and visual draft workflows through source-owned host actions.
- Provide Dashboard source and search provider adapters from `neko-entity` so UI/search consumers stop depending on Story ownership.
- Keep Story as the owner of script-derived candidates, occurrences, and source navigation.
- Keep Assets as the owner of representation resources and metadata.

**Non-Goals:**

- Removing `characters.json` in the first implementation batch.
- Moving Story parsing, scene indexing, Fountain LSP behavior, or occurrence extraction into `neko-entity`.
- Moving asset files, thumbnails, variants, media probing, or representation package operations into `neko-entity`.
- Making `neko-entity` a Webview package.
- Implementing full collaborative editing or CRDTs for entity files.
- Making search or RAG part of entity storage.
- Automatically applying entity rename changes to asset metadata or script text.

## Decisions

### Decision 1: `neko-entity` owns runtime lifecycle, `@neko/shared` owns contracts

Add `packages/neko-entity` as a private workspace package. It provides runtime services and host adapters:

```text
@neko/entity
  core/
    CreativeEntityService
    EntityStore
    EntityCandidateService
    EntityLifecycleService
    EntityAssetBindingService
    EntityAssetRequirementService
    VisualIdentityDraftService
    RepresentationResolver wiring
    change events / test fakes
  host-vscode/
    file stores and watchers
    command registration
    DashboardCreativeEntitySource adapter
    ProjectSearch provider adapter
```

`@neko/shared` continues to define DTOs, enums, type guards, and source contracts. Runtime helper classes that currently live in `@neko/shared/vscode/extension` should be moved or re-exported through compatibility shims over time.

Alternative considered: keep runtime in `@neko/shared`.

Rejected because shared should stay a low-dependency contract/util layer. Runtime services with file IO, locks, watchers, and lifecycle policy belong in a runtime package.

Alternative considered: keep Story as owner.

Rejected because non-Story consumers would keep importing or commanding through Story even when managing project-wide entity facts.

### Decision 2: Preserve `characters.json` as the character compatibility store

The first implementation must treat existing `characters.json` as a first-class compatibility source. Character records continue to adapt to `CreativeEntity(kind='character')`, and writes to confirmed character identity can continue to update `characters.json`.

Introduce a separate project entity store only for new non-character first-class entities and optional future migrations:

```text
Current compatibility source
  <project>/characters.json

New project facts
  <project>/neko/entities/index.json
  <project>/neko/entities/scenes.json
  <project>/neko/entities/locations.json
  <project>/neko/entities/objects.json
  <project>/neko/entities/styles.json

Existing related facts
  <project>/neko/entity-bindings.json
  <project>/neko/entity-asset-requirements.json
  <project>/neko/visual-identity-drafts.json
```

The exact file split can be adjusted during implementation, but it must remain Git-trackable and reviewable.

Alternative considered: immediately migrate characters to `neko/entities/characters.json`.

Rejected because it increases migration risk and breaks the current Story/character tooling unnecessarily.

### Decision 3: Entity candidates are separate from confirmed facts

Story, Canvas, Assets, Agent, and importers can contribute candidates with provenance, confidence, source refs, and suggested requirements. `neko-entity` owns candidate normalization, deduplication, confirmation, rejection, and merge into confirmed facts.

```text
Candidate
  name + kind + sourceRef + provenance + confidence
       |
       v
Confirm / Merge / Reject
       |
       v
Confirmed CreativeEntity fact
```

Confirming a Story script role as a character writes to the character compatibility source unless the user explicitly chooses a different target kind/store. Confirming a location/object/style writes to the project entity store.

Alternative considered: let each source silently create confirmed entities.

Rejected because AI/import/source-derived suggestions must not become user-confirmed facts without an explicit lifecycle transition.

### Decision 4: Entity lifecycle operations are explicit and auditable through Git facts

`neko-entity` should provide operations for:

- create/confirm candidate,
- rename canonical/display names,
- add/remove aliases,
- deprecate/reactivate,
- merge duplicate entities,
- split mistaken entities where possible,
- update metadata,
- bind/unbind/default representation assets,
- update requirements and visual drafts.

The authoritative state is the current Git-trackable JSON facts. Git provides historical review; the app does not need an append-only event log as the authority for phase one. Operation results should include changed refs and source metadata so Dashboard/Search can refresh.

Alternative considered: introduce an internal event-sourced entity log.

Rejected for phase one because it complicates migration and duplicates Git review for current-state project facts.

### Decision 5: Story becomes a provider, not the semantic owner

Story continues to own:

- script parsing and LSP,
- workspace story indexes,
- character name occurrences,
- scene/location/object extraction from scripts,
- source navigation into Fountain/story files,
- candidate provenance from scripts.

`neko-entity` consumes Story providers or commands to obtain candidates and occurrences. Dashboard entity management should be able to get confirmed entity state from `neko-entity` even if Story is absent; Story-specific candidates/occurrences simply become unavailable or stale.

Alternative considered: move Story entity index logic into `neko-entity`.

Rejected because script parsing and editor navigation are Story domain logic.

### Decision 6: Dashboard source moves toward `neko-entity`

`neko-entity` should provide a Dashboard creative entity source that projects confirmed entities, candidates, bindings, requirements, visual drafts, sync suggestions, and actions. Story may continue to provide a compatibility source during migration or contribute candidate/occurrence data into the neutral source.

Dashboard remains a UI and aggregator. It never writes entity files directly.

Alternative considered: keep Dashboard source only in Story.

Rejected because Dashboard project entity management should not require Story to be the management owner.

### Decision 7: Search consumes entity projections only

`neko-entity` may register a provider for `neko-search` that returns confirmed entities, candidates, requirements, and safe navigation refs. `neko-search` must not call entity mutation APIs during search and must not persist entity facts in search caches.

Alternative considered: use search cache as the entity lookup store.

Rejected because search indexes are derived and can be stale, partial, or deleted.

### Decision 8: Assets remain representation resources

Bindings connect entity facts to assets through `assetRef`. Entity rename or alias changes may create sync suggestions for asset metadata, but applying those suggestions must route through source-approved commands and respect read-only `market://`, `shared://`, or external assets.

Alternative considered: make `neko-assets` own entity identity because entities appear as asset cards.

Rejected because asset metadata answers "what resource is this", while entity facts answer "who/what is this in the creative project".

## Risks / Trade-offs

- [Risk] Introducing `neko-entity` duplicates existing shared/Story services. -> Mitigation: migrate by wrapping/re-exporting first, then move implementation in small slices.
- [Risk] `characters.json` plus new entity files creates two stores. -> Mitigation: make store routing explicit by entity kind and keep character compatibility as a documented adapter.
- [Risk] Dashboard may see duplicate Story and Entity rows during migration. -> Mitigation: use stable refs/source priorities and disable Story compatibility source when neutral source covers the same confirmed entity.
- [Risk] Candidate confirmation can create wrong entities. -> Mitigation: require explicit user action and preserve source provenance before confirmation.
- [Risk] Merge/split workflows can be complex. -> Mitigation: implement conservative merge first; defer destructive split automation unless source refs are unambiguous.
- [Risk] Package boundaries become blurry with Search and Assets. -> Mitigation: add dependency/boundary tests and define one-way integration through provider/source contracts.
- [Risk] Multi-root entity stores can be selected incorrectly. -> Mitigation: use explicit project root/context URI resolution and include project root in entity service operations.

## Migration Plan

1. Add `packages/neko-entity` package skeleton, exports, tests, and boundary checks.
2. Move or wrap existing `CreativeEntityRegistryService`, `CharacterRecordAdapter`, `EntityAssetBindingService`, `EntityAssetRequirementService`, `VisualIdentityDraftService`, and `RepresentationResolver` runtime helpers behind `neko-entity` APIs.
3. Keep compatibility exports in `@neko/shared/vscode/extension` during migration to avoid breaking Story immediately.
4. Add project entity store support for non-character kinds while routing characters through `characters.json`.
5. Add candidate lifecycle service and Story provider adapter for script-derived candidates/occurrences.
6. Add neutral Dashboard creative entity source from `neko-entity`; keep Story source as compatibility or provider contribution during migration.
7. Add `neko-search` provider adapter for entity projections once search package exists, or define the adapter behind an optional integration boundary until then.
8. Migrate Story creative entity commands to call `neko-entity` services while preserving command names.
9. Update docs and tests, then remove duplicate Story/shared runtime code once compatibility windows close.

Rollback is compatible: keep existing `characters.json` and Story source paths intact, and keep shared compatibility re-exports until `neko-entity` parity tests pass.

## Open Questions

- Should non-character entities use one `neko/entities/index.json` file or per-kind files from the first implementation?
- Should character migration to `neko/entities/characters.json` be offered later as an explicit command?
- Which package should own advanced relationship graph persistence if it becomes a confirmed fact rather than a derived cache?
- Should merge/split be implemented as phase-one commands or only as service contracts with TODO(P1) implementation?
