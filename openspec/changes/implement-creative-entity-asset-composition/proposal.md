## Why

Neko Suite can already track characters, assets, generated media, canvas nodes, and Live avatars, but these systems do not yet share a single contract for composing a creative entity with its usable representations. This change turns the architecture in `docs/architecture/creative-entity-asset-composition.md` into an implementable capability so Story, Canvas, Agent, Assets, Live, Puppet, and Model can reference the same entity identity while resolving the right portrait, Live2D, Live3D, voice, or motion asset for each workflow.

## What Changes

- Introduce a contract-first `CreativeEntity` facade where Phase 1 adapts existing `CharacterRecord` data as `kind: 'character'`.
- Add Git-tracked entity-to-asset binding contracts stored outside `.neko/.cache/`, using `assetRef` values instead of direct file paths.
- Add `AssetRefResolver` contracts for `project://`, `market://`, `shared://`, and `external://` references, with clear boundaries from `PathResolver` and Asset Federation.
- Add `RepresentationResolver` contracts for target-aware representation lookup, default fallback chains, explicit fallback control, and missing-representation responses.
- Add `VisualIdentityDraft` and `EntityAssetRequirement` contracts so AI-generated character imagery and missing素材需求 can be tracked without silently overwriting confirmed entity facts.
- Extend asset representation metadata to cover Live2D, Live3D, voice, motion, calibration, tracking profile, expression, physics, and related component roles.
- Update cross-modal graph/index integration so confirmed bindings, generated assets, canvas occurrences, and representation packages can be queried without making Story, Canvas, Agent, or Live own entity facts.

## Capabilities

### New Capabilities

- `creative-entity-asset-composition`: Defines creative entity facade contracts, entity-asset bindings, assetRef resolution, target-aware representation resolution, visual identity drafts, missing representation requirements, and graph integration for multi-representation creative entities.

### Modified Capabilities

- None.

## Impact

- Shared contracts in `packages/neko-types` for `CreativeEntity`, bindings, asset refs, representation resolution, visual drafts, requirements, and representation file roles.
- Story extension integration with `CharacterRecordAdapter`, candidate entities, AI image draft entry points, and entity occurrence indexing.
- Asset library integration for binding persistence, representation package metadata, binding candidates, and `project://` assetRef resolution.
- Agent media generation integration with `characterIds`, `sourceNodeId`, visual draft proposals, and confirmed binding workflows.
- Canvas integration for entity cards, missing-representation placeholders, text/comment/container occurrence indexing, and resolved representation references.
- Live/Puppet/Model integration through `RepresentationResolver` instead of direct ad hoc avatar path selection.
- Asset Federation and market integration through `AssetRefResolver` while keeping binding storage outside Federation handlers and outside market install records.
