## Why

Confirmed entity identity and asset availability are currently too easy to conflate. When a bound portrait, model, voice, or reference asset disappears, the system must preserve the entity and the review status of the binding while clearly showing that the representation resource is broken.

## What Changes

- Add `EntityAssetBinding.availability` as an orthogonal lifecycle field with `active`, `orphaned`, and `archived` values.
- Add optional `EntityAssetBinding.orphanedAt` so project-local file deletion can be diagnosed and restored without losing the binding `status`.
- Add project-local orphan detection and automatic restore through VSCode `FileSystemWatcher`.
- Add Dashboard/Canvas/Inspector UI degradation rules for orphaned bindings, including placeholder thumbnails, broken-reference markers, and rebinding or cleanup actions.
- Add `CreativeEntityCandidate.identityBasis` so anonymous, visual-only, and asset-derived candidates can exist without unsafe name-based matching.
- Require all name-based candidate resolution paths to exclude candidates whose `identityBasis !== 'user-named'`.
- Declare non-project-local orphan detection for `market://`, `shared://`, and `external://` refs as an Asset Federation dependency; before that contract lands, consumers only perform on-demand probe and UI degradation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `creative-entity-asset-composition`: Adds binding availability lifecycle, project-local orphan/restore behavior, anonymous candidate identity basis, and non-local asset availability dependency boundaries.

## Impact

- `packages/neko-types`: extends shared binding and candidate contracts with backward-compatible fields and validators.
- `packages/neko-entity`: updates binding persistence defaults, orphan marking/restoration, name-based matching filters, change events, and facade command results.
- `packages/neko-dashboard`: adds orphaned binding display, filters, rebinding, and cleanup workflows.
- `packages/neko-canvas`: degrades shot character thumbnails and Hover Card/Quick Panel binding summaries when availability is orphaned.
- `packages/neko-assets`: provides project-local asset file events and later federation availability events where applicable.
- Tests cover schema migration defaults, availability/status orthogonality, FileWatcher orphan/restore, UI projection states, anonymous candidate matching exclusion, and non-local dependency fallback.
