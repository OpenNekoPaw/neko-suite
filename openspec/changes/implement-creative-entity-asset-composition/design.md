## Context

Neko Suite already has several partial systems for creative identity and assets:

- `characters.json` and `CharacterRecord` provide a project-level character identity source.
- `AssetEntity -> AssetVariant -> AssetFile` provides a project asset inventory.
- `GeneratedAsset.characterIds` and `sourceNodeId` preserve generation lineage.
- `CreativeEntityGraphService` can build cross-modal graph edges from Canvas, assets, and generated assets.
- `.nkp` and `.nkm` project files wrap 2D puppet and 3D model sources.
- `neko-live` consumes VRM/Puppet assets for realtime driving.

The missing layer is a stable, cross-package composition contract. Today consumers can reference names, paths, generated assets, canvas nodes, or direct avatar files, but there is no single service contract for "this creative entity should use this representation in this target workflow."

The design follows `docs/architecture/creative-entity-asset-composition.md` and keeps the existing boundaries:

- Entity identity remains separate from asset files.
- Confirmed entity-asset bindings are project facts, not cache.
- Asset Federation handles asset routing/capabilities, not entity binding ownership.
- `@` mentions are UI input affordances, not persisted identity.

## Goals / Non-Goals

**Goals:**

- Define shared contracts for creative entities, entity-asset bindings, asset refs, representation resolution, visual drafts, and missing representation requirements.
- Provide a `CreativeEntityRegistry` facade whose first adapter wraps `CharacterRecord` as `kind: 'character'`.
- Store confirmed bindings as Git-trackable current-state project data outside `.neko/.cache/`.
- Resolve `project://`, `market://`, `shared://`, and `external://` asset refs through a single `AssetRefResolver`.
- Resolve target-aware representations with deterministic fallback chains and explicit missing-representation responses.
- Let Story, Canvas, Agent, Assets, Live, Puppet, and Model consume the same contracts without owning each other's data.
- Extend graph/index integration so usage can be queried across script, canvas, assets, generated media, and Live representations.

**Non-Goals:**

- Replacing `characters.json` with a universal entity store in the first implementation.
- Implementing a full general-purpose graph database.
- Making `neko-market` manage all external assets.
- Adding an internal version/event log for `EntityAssetBinding`; Git remains the versioning mechanism.
- Making `neko-live`, Canvas, Story, or Agent own entity facts.
- Automatically accepting AI-inferred visual facts without user confirmation.

## Decisions

### CreativeEntity Is Contract-First

Phase 1 will define `CreativeEntity` and `CreativeEntityKind` in the shared contract layer. Existing character data will be exposed through `CharacterRecordAdapter`, which maps `CharacterRecord` to `CreativeEntity(kind='character')`.

Alternatives considered:

- Keep `CharacterRecord` as the only public interface until scene/object entities exist. Rejected because binding, requirement, and resolver contracts already need an entity-kind axis.
- Build a new entity registry immediately. Rejected because it creates migration risk before the facade and consumers are proven.

### Bindings Are Git-Tracked Current State

Confirmed bindings will be stored in `.neko/entity-bindings.json` or `.neko/entity-bindings/*.json` as current state. The application will not implement append-only binding history, revisions, or tombstones.

Alternatives considered:

- Store bindings in `.neko/.cache/bindings.json`. Rejected because confirmed user choices are project facts, while cache files are expected to be rebuildable.
- Store binding events append-only. Rejected because Git already provides audit, rollback, and diff behavior for project facts.

### assetRef Separates Asset Identity From File Paths

Bindings will point to `assetRef` strings, not raw filesystem paths. `AssetRefResolver` will parse, validate, and resolve `project://`, `market://`, `shared://`, and `external://` refs.

`AssetRefResolver` answers "which backend and asset does this reference mean?" `PathResolver` remains responsible for resolving concrete file paths once an asset entity or install record has been resolved.

Alternatives considered:

- Store `assetEntityId` only. Rejected because market, shared, and external references need source information.
- Store concrete paths in bindings. Rejected because paths do not preserve ownership, installation, or update semantics.

### Asset Federation Does Not Own Bindings

`EntityAssetBindingService` owns binding file read/write. `AssetFederationRegistry` provides handler routing, capabilities, semantics, and send-to after an asset ref is resolved. `RepresentationResolver` is the composition point that uses both.

Alternatives considered:

- Implement bindings as an Asset Federation handler. Rejected because entity-asset bindings are semantic project facts, not an asset type owned by a producer package.
- Let `neko-assets` own all binding logic. Rejected because bindings span Story, Canvas, Agent, Live, market refs, and shared refs.

### RepresentationResolver Owns Fallback Semantics

Consumers will call `RepresentationResolver` with `target`, optional `preferredKind`, optional `fallbackOrder`, and optional `allowFallback`. The result must include `resolvedKind` and `fallback` when resolved.

Default fallback chains:

- `story`: `reference -> portrait`
- `canvas`: `portrait -> reference -> live2d -> live3d`
- `agent`: `reference -> portrait -> live2d -> live3d`
- `live`: `live3d -> live2d`
- `cut`: `video -> live2d -> live3d -> portrait`

Alternatives considered:

- Let every consumer implement fallback locally. Rejected because Canvas, Agent, and Live have different safe fallback rules and would drift.
- Always return missing when the preferred kind is absent. Rejected because Story/Canvas can often use a less capable representation productively.

### AI Outputs Remain Drafts Until Confirmed

AI-generated visual candidates and extracted visual facts will be stored as `VisualIdentityDraft` data until the user selects and confirms them. Confirmed generated media can then become an asset binding or asset library entry.

Alternatives considered:

- Directly update entity metadata from AI image analysis. Rejected because it can silently corrupt user-confirmed creative facts.
- Treat generated images only as assets with no draft state. Rejected because the selection and confirmation flow needs a place to hold candidate facts.

## Risks / Trade-offs

- [Risk] More contracts before UI is complete → Mitigation: keep Phase 1 contract-first and implement adapters/resolvers with focused tests before broad UI.
- [Risk] `assetRef` schemes drift from existing path conventions → Mitigation: explicitly route concrete file paths through `PathResolver` only after `AssetRefResolver` resolves the backend asset.
- [Risk] Binding files conflict during collaboration → Mitigation: keep files small, structured, and Git-friendly; consider per-kind or per-entity binding files when conflict frequency appears.
- [Risk] Resolver fallback hides missing high-capability assets → Mitigation: return `fallback: true` and `resolvedKind` so UI and Agent can surface "Live2D missing, using portrait" messages.
- [Risk] Market updates change character semantics → Mitigation: never upgrade `market://` refs silently; require user choice to keep, upgrade, install side-by-side, or fork into project assets.
- [Risk] Federation and binding responsibilities blur → Mitigation: enforce that Federation never writes `.neko/entity-bindings*` and binding services never parse package internals.

## Migration Plan

1. Add shared contracts and pure helpers without changing existing consumers.
2. Add `CreativeEntityRegistry` with `CharacterRecordAdapter` and tests against existing `characters.json` fixtures.
3. Add binding file storage and `EntityAssetBindingService`; keep existing `CharacterRecord.defaults/bindings` readable during transition.
4. Add `AssetRefResolver` with project-source support first, then market/shared/external stubs or integrations.
5. Add `RepresentationResolver` using bindings and resolver fallback chains.
6. Integrate Story/Canvas/Agent/Live consumers incrementally behind existing APIs.
7. Extend graph/index services to include binding and resolved representation edges.

Rollback strategy: contracts are additive. If a consumer integration fails, keep existing direct character and asset paths while disabling that consumer's resolver bridge. Binding files are project data and can be reverted through Git.

## Open Questions

- Should binding files be one `.neko/entity-bindings.json` file initially, or split by entity kind from the start?
- Should `CreativeEntityRegistry` live in `neko-story`, `neko-assets`, or a shared platform package exposed through extension APIs?
- What is the first UI surface for `VisualIdentityDraft`: Story character sidebar, Canvas gallery, Agent generation result view, or Assets panel?
- How much market update metadata should `AssetRefResolver` return versus leaving it to `neko-market` UI?
