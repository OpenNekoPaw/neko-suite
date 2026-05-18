## Why

Unified creative entities are now searchable, but users still lack a stable
project-level place to inspect, confirm, bind, and repair those entities. This
causes a product gap where script-derived characters, confirmed entities,
missing representation requirements, visual drafts, and asset bindings exist in
different commands or caches but cannot be managed as one project ledger.

## What Changes

- Add a Dashboard-managed Creative Entities surface for browsing project
  entities, candidates, missing materials, visual drafts, bindings, and sync
  suggestions.
- Add shared Dashboard creative-entity contracts in `@neko/shared` so Dashboard
  consumes typed source snapshots and actions without importing Story or Assets.
- Expose a Story-owned Dashboard creative-entity source that reuses the existing
  creative entity management services and entity registry/binding/requirement
  facts.
- Keep `neko-assets` as the owner of asset files, metadata, thumbnails,
  representation packages, and asset mutation commands; Dashboard delegates
  asset selection and asset metadata updates through commands/source actions.
- Add an explicit asset-sync suggestion flow: entity changes refresh indexes and
  produce suggestions, but do not automatically rewrite asset names, tags,
  descriptions, files, or bindings without a user action.
- Add Dashboard Webview table/detail UI, filtering, action routing, and tests
  for entity state, missing materials, bindings, and stale source handling.

## Capabilities

### New Capabilities

- `dashboard-creative-entity-management`: Dashboard-managed project entity
  ledger, source discovery contract, Webview behavior, entity actions, and
  explicit asset sync suggestion rules.

### Modified Capabilities

- `creative-entity-asset-composition`: Clarify that unified entity facts remain
  separate from asset metadata and that entity-to-asset metadata synchronization
  is suggested and explicitly applied, not automatic.
- `dashboard-runtime-context`: Extend Dashboard Work Mode with a project semantic
  management section while preserving delegation boundaries to owning
  extensions.

## Impact

- `packages/neko-types`: New shared DTOs, type guards, and command/source
  contracts for Dashboard creative-entity management.
- `packages/neko-dashboard/packages/extension`: Source discovery, snapshot
  aggregation, action dispatch, safe reference validation, and refresh/event
  handling.
- `packages/neko-dashboard/packages/webview`: Creative Entities table, detail
  panel, filters, badges, actions, and presenter/state tests.
- `packages/neko-story/packages/extension`: Dashboard creative-entity source
  adapter backed by existing entity management services and project facts.
- `packages/neko-assets`: Programmatic asset selection/sync hooks may be used or
  added, but Assets remains a provider rather than the owner of creative entity
  identity.
- OpenSpec/docs: New Dashboard creative-entity spec plus delta requirements for
  entity/asset sync boundaries and Dashboard Work Mode responsibilities.
