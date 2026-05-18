## Why

Creative entity facts are currently exposed through shared contracts, but the runtime ownership is split between `@neko/shared/vscode/extension` helper services and `neko-story` services. As entities grow beyond character-first Story workflows into project-wide characters, scenes, locations, objects, styles, Dashboard management, search, Canvas, Assets, and Agent context, the system needs a neutral entity runtime owner that is not Story, Assets, Agent, Dashboard, or Search.

This change introduces `packages/neko-entity` as the project semantic entity service while preserving existing `characters.json` compatibility and keeping assets, search, and Dashboard as consumers or projections rather than entity authorities.

## What Changes

- Add a new `packages/neko-entity` workspace package for creative entity runtime services and host integration.
- Move reusable entity runtime ownership out of `@neko/shared/vscode/extension` and Story-specific management code over time:
  - creative entity registry facade,
  - candidate confirmation lifecycle,
  - entity merge/split/deprecate/rename operations,
  - entity-asset binding services,
  - missing representation requirement services,
  - visual identity draft services,
  - entity change events and Dashboard/search provider adapters.
- Keep `@neko/shared` as the DTO and contract source for `CreativeEntity`, entity refs, bindings, requirements, visual drafts, Dashboard DTOs, and type guards.
- Keep `characters.json` as the initial character compatibility source; do not force an immediate migration away from the existing file.
- Introduce a forward-compatible project entity store for non-character first-class entities such as scenes, locations, objects, and styles.
- Make Story an entity source/provider that contributes script-derived candidates and occurrences instead of remaining the only practical runtime owner.
- Keep `neko-assets` responsible for assets and representation resources only; entity changes may produce sync suggestions but must not rewrite asset metadata automatically.
- Keep `neko-search` responsible for derived searchable projections only; it must consume entity providers and never mutate entity facts.
- Add Dashboard-facing entity source integration through `neko-entity` so Dashboard can manage confirmed entities and delegated actions without importing Story internals.

No breaking changes are intended. Existing Story commands and Dashboard source behavior should continue through compatibility adapters while the neutral entity service becomes available.

## Capabilities

### New Capabilities

- None. The system already has creative entity capabilities; this change extracts and strengthens their runtime ownership.

### Modified Capabilities

- `creative-entity-asset-composition`: define `neko-entity` as the neutral runtime owner for creative entity facts, lifecycle operations, bindings, requirements, visual drafts, and provider integration while preserving existing contracts and `characters.json` compatibility.
- `dashboard-creative-entity-management`: allow Dashboard creative-entity management to consume a neutral entity source from `neko-entity` and treat Story as a contributing source/provider rather than the only practical owner.

## Impact

- `packages/neko-entity`: new package for entity runtime services, project stores, candidate lifecycle, host integration, provider adapters, and tests.
- `packages/neko-types`: may receive additive contract fields for entity refs, lifecycle actions, source metadata, candidate provenance, conflict/merge results, and change events; existing shared DTOs stay here.
- `packages/neko-story/packages/extension`: migrates Story-owned entity management pieces into providers/adapters; continues to own script parsing, occurrences, candidates, and Story navigation.
- `packages/neko-dashboard`: discovers entity management through neutral source contracts and keeps Webview state path-safe.
- `packages/neko-assets`: integrates via binding and sync suggestion commands; does not own entity identity.
- `packages/neko-search`: indexes entity projections through provider APIs; does not own entity storage.
- Documentation/tests: update architecture docs, migration notes, boundary tests, entity lifecycle tests, compatibility tests for `characters.json`, and Dashboard/search integration tests.
