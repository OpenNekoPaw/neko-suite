## Why

Project search already has a shared contract in `@neko/shared`, but the runtime coordinator, command registration, path resolution, cache helpers, and compatibility adapters currently live under `neko-agent` extension code. This makes Agent the accidental owner of project search and blocks Dashboard, Assets, Story, Preview, and future RAG/indexing surfaces from using the same search behavior without depending on Agent internals.

This change introduces `packages/neko-search` as the neutral project search runtime package so search remains a derived query plane, while Story, Assets, documents, and future entity services continue to own their authoritative facts.

## What Changes

- Add a new `packages/neko-search` workspace package for host-side project search runtime code.
- Move reusable project search orchestration out of `packages/neko-agent/packages/extension/src/services/projectSearch` into `neko-search`, including coordinator, service facade, normalization/ranking, cache manifest helpers, path/context resolution contracts, watcher helpers, and test fakes where appropriate.
- Keep shared DTOs, enums, and type guards in `@neko/shared`; `neko-search` consumes those contracts and does not become the contract source of truth.
- Keep domain extraction in owner packages through adapters:
  - Story owns story symbols, script roles, scene projections, and script-derived entity candidates.
  - Assets owns asset and media library projections.
  - Document reading/indexing owners provide document references and chunk projections.
  - Future entity services provide confirmed entity projections without making search the entity authority.
- Provide package-level APIs for registering search providers, querying by mode/kind/file type/scope, refreshing partitions, observing freshness, and projecting results to Agent/Webview/Dashboard consumers.
- Keep existing `neko.projectSearch.query` and `neko.projectSearch.refresh` commands as compatibility host entrypoints, but implement them through `neko-search`.
- Add explicit extension points for future semantic/vector/RAG providers without putting embedding stores or retrieval policy into Agent-specific code.

No breaking changes are intended. Existing Agent mention behavior should keep working through the same command names while the implementation owner moves to `neko-search`.

## Capabilities

### New Capabilities

- None. This change packages and strengthens the existing project search capability rather than introducing a separate search contract.

### Modified Capabilities

- `project-cache-search-service`: define `neko-search` as the neutral runtime owner for project search orchestration, provider registration, shared query APIs, consumer integration, and future semantic/RAG provider slots while preserving fact/cache separation and domain owner boundaries.

## Impact

- `packages/neko-search`: new workspace package containing runtime search service, coordinator, provider registry, normalization/ranking, cache helpers, host integration helpers, and tests.
- `packages/neko-types`: may receive small additive contract fields for query mode, file type filters, scopes, provider capabilities, and semantic/RAG provider metadata if missing from the existing `project-cache-search-service` contract.
- `packages/neko-agent/packages/extension`: replaces local project search runtime implementation with imports from `neko-search`; keeps Agent mention projection and command wiring as consumer/integration code.
- `packages/neko-story/packages/extension`: registers or adapts Story/entity search providers without Dashboard or Agent importing Story internals.
- `packages/neko-assets`: registers asset/media search providers without transferring asset metadata ownership to search.
- `packages/neko-dashboard` and future frontends: can consume the same search command/service projection for global search surfaces instead of building UI-local aggregators.
- Documentation/tests: update architecture documentation for package ownership, dependency direction, provider boundaries, cache location, query filters, and future RAG extension points.
