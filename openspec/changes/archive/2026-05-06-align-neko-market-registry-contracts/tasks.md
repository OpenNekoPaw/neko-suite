## 1. Shared Manifest Contract

- [x] 1.1 Replace legacy `AssetType` union in `packages/neko-types/src/types/asset/manifest.ts` with the 11 v4 types and `AssetCategory` mapping
- [x] 1.2 Add v4 `AssetTypeMetadata` definitions for media, starter, identity, model, endpoint, provider, skill, plugin, shader, preset, and bundle
- [x] 1.3 Add `DistributionKind`, `EffectsManifest`, `AssetDependency`, `BundleContent`, `LargeAssetStrategy`, `AssetSemantics`, `AssetIntent`, `PackageEmbeddings`, and `AssetDeprecation` shared types
- [x] 1.4 Update `AssetDistribution`, `AssetCompatibility`, pricing, trust, signature, and embedding reference fields to match the schema spec
- [x] 1.5 Update `packages/neko-types/src/types/asset/market.ts` interfaces for v4 search, install, entitlement, lifecycle, status, and large asset state
- [x] 1.6 Add type guards and parse helpers for required v4 manifest fields, type/typeMetadata matching, supported distribution kinds, and legacy type migration diagnostics
- [x] 1.7 Add manifest fixture tests covering valid v4 manifests, invalid metadata mismatch, legacy type migration, unknown optional fields, and unsupported distribution kind
- [x] 1.8 Update asset type exports and downstream compile errors in packages that import legacy asset type names

## 2. Registry API Client Contract

- [x] 2.1 Update `MarketClient` config to use registry URL from extension settings with official default and no VSCode dependency in market-core
- [x] 2.2 Implement structured request helpers for JSON headers, Bearer token injection/removal, timeout, ETag headers, and RFC 7807 Problem Details errors
- [x] 2.3 Implement `GET /api/v1/version` capability probe with graceful fallback for registries that lack the endpoint
- [x] 2.4 Update package search query encoding for q, types, category, tags, visibility, pricing, publisher, sort/order, semantic facets, intent facets, vector query, limit, offset, and cursor
- [x] 2.5 Update search, detail, versions, and featured response parsing to use server envelopes instead of bare arrays
- [x] 2.6 Replace `getDownloadUrl()` string-only behavior with download descriptor handling for URL, expiresAt, size, integrity, and resumable
- [x] 2.7 Implement sparse manifest, sparse selection reporting, variant download, proxy variant download, and delta descriptor methods behind capability checks
- [x] 2.8 Implement entitlement list, entitlement changes with ETag, refresh, entitlement check, checkout URL, and optional entitlement stream fallback hooks
- [x] 2.9 Implement ontology semantic/intent fetch and package deprecation fetch with documented cache TTL behavior
- [x] 2.10 Add market-client contract tests for P0 search/detail/download/entitlement, Problem Details, 304, 429 retry, capability fallback, and envelope parsing

## 3. Install Runtime Lifecycle

- [x] 3.1 Refactor `InstallManager` progress phases to discover, resolve, preflight, fetch, verify, stage, activate, record, rollback, done, and error
- [x] 3.2 Add install state object that records completed phases, staged paths, downloaded descriptors, selected large asset state, and rollback context
- [x] 3.3 Implement discover validation using v4 manifest parse helpers and server-final package detail
- [x] 3.4 Implement dependency and bundle content resolver with semver ranges, optional entries, installed reuse, and cycle diagnostics
- [x] 3.5 Implement preflight middleware for compatibility, entitlement, trust level, conflicts, quota/resource estimates, installed status, and unsupported server capability
- [x] 3.6 Split distribution dispatch into archive, orchestration, and registration branches
- [x] 3.7 Update archive branch to verify descriptor integrity against manifest integrity before staging
- [x] 3.8 Implement P0 signature metadata presence check through a verifier interface that can later support hash and crypto verification
- [x] 3.9 Implement EffectsManifest activation and uninstall inversion for known file/resource/registration/conflict/network effects
- [x] 3.10 Extend `IInstallTarget` and registry implementation with `onPreInstall`, `onRollback`, and complete hook ordering tests
- [x] 3.11 Implement bundle reference count persistence and uninstall semantics in InstalledRegistry
- [x] 3.12 Add InstalledPackage status fields for active, expiring-soon, expired, incompatible, deprecated, large asset state, refs, and selected item/variant metadata
- [x] 3.13 Implement large asset mini lifecycle for variant P0 and define sparse/proxy/delta record-update hooks for later enablement
- [x] 3.14 Add install runtime tests for successful archive install, entitlement block, integrity mismatch, signature missing, rollback, registration package, bundle ref counts, expired block, and deprecated allowed

## 4. InstallTarget Contributions

- [x] 4.1 Replace legacy target routing with v4 routes for media, starter, identity, model, endpoint, provider, skill, plugin, shader, preset, and bundle
- [x] 4.2 Implement X class builtin targets in market extension for media, starter, preset, and bundle without importing domain package APIs
- [x] 4.3 Add `NekoMarketAPI.registerInstallTarget` export that validates targets, stores live registrations, returns Disposable, and emits registration diagnostics
- [x] 4.4 Implement static discovery for `contributes.neko.installTargets` and lazy activation by `onInstallType:{type}` and optional `onInstallKind:{type}.{kind}`
- [x] 4.5 Reject duplicate type/kind routes, X/Y overlap, invalid target shape, activation failure, and promised-but-not-registered contributors
- [x] 4.6 Add missing-contributor UI/service state for Y class packages when required extension contribution is absent
- [x] 4.7 Move or adapt current Skill, Model, Shader, ProviderCard, and PuppetMotion target behavior into contributed target compatibility shims or owning packages
- [x] 4.8 Add typed market events for install, uninstall, update, enable, disable, status change, and large asset state change
- [x] 4.9 Add architecture guard tests proving market extension does not import `neko-agent`, `neko-cut`, `neko-assets`, `neko-model`, `neko-tools`, React in extension, or `vscode` in webview
- [x] 4.10 Add contribution registry tests for lazy activation, duplicate contributor, dispose unregister, kind-level override, activation throw, and no-register failure

## 5. Extension Host Integration

- [x] 5.1 Wire market extension activation to create market-core services from settings, storage paths, logger, and auth adapters
- [x] 5.2 Integrate `neko-auth` session lookup and session-change token refresh without leaking VSCode or auth APIs into market-core
- [x] 5.3 Implement external checkout, renewal, invoice, and support deep-link commands with `vscode.env.openExternal`
- [x] 5.4 Add deep-link handler for `vscode://neko.market/refresh` to refresh entitlements and package detail
- [x] 5.5 Update MarketplaceHandler postMessage routes to validate typed requests and return typed projections/errors
- [x] 5.6 Ensure all VSCode Disposable resources from providers, auth subscriptions, contribution registrations, timers, and webview listeners are explicitly disposed
- [x] 5.7 Add extension adapter tests for auth token refresh, registry URL changes, checkout openExternal routing, deep-link refresh, invalid webview message, and Disposable cleanup

## 6. Marketplace Webview Surfaces

- [x] 6.1 Update webview message contracts and Zustand store for Browse, Installed, Owned, Updates, entitlement cache, install progress, status badges, and large asset picker state
- [x] 6.2 Implement Browse hierarchy for AssetCategory chips, AssetType filters, metadata kind filters, ontology-driven facets, search, and P0 segmented sorts
- [x] 6.3 Implement Installed grouped rows with enable, disable, detail, uninstall, dependency view, status badges, and large asset state badges
- [x] 6.4 Implement Owned surface from entitlements with owned-installed, owned-not-installed, expiring, expired, install, renew, refresh, and pending purchase states
- [x] 6.5 Implement Updates surface from installed-vs-registry version comparison with changelog, compatibility block, and update action
- [x] 6.6 Implement detail primary action state machine for free install, paid checkout, owned install, installed, expired renew, and purchase pending
- [x] 6.7 Implement variant picker P0 UI and placeholder capability-gated sparse/proxy/delta controls that do not call unsupported endpoints
- [x] 6.8 Update i18n files for new tabs, filters, statuses, errors, entitlement actions, large asset UI, and contribution missing states
- [x] 6.9 Add webview tests for filter-to-query state, four-tab routing, owned-not-installed visibility, checkout action, installed status badges, variant picker, and message validation

## 7. Consumer Surface Integration

- [x] 7.1 Update AssetLibrary integration so only usable `media` and `identity` installs appear, with market source badges and market detail deep-links
- [x] 7.2 Ensure Owned-not-installed packages do not appear in AssetLibrary or domain consume surfaces as ghost entries
- [x] 7.3 Update agent skill/provider/endpoint projections to consume market events or contributed targets rather than market private state
- [x] 7.4 Update LUT/shader/preset consumer projections to subscribe to market events and hide/disable expired or incompatible packages
- [x] 7.5 Add `ensureFull(packageId, itemId?)` API shape for consumers that require full-quality assets before export or final render
- [x] 7.6 Add consumer integration tests for market media install to AssetLibrary, expired removal, deprecated warning, skill install projection, and preset uninstall removal

## 8. Documentation and Migration

- [x] 8.1 Update `docs/architecture/marketplace.md` implementation status for v4 manifest, Registry API client, install runtime, target contribution, and UI surfaces
- [x] 8.2 Update or append migration notes in `docs/architecture/manifest-schema-spec.md` for legacy type mapping and v4-only install routing
- [x] 8.3 Update `docs/architecture/registry-server-contract.md` client implementation notes for capability probe, P0/P1/P2 endpoint support, and client fallback behavior
- [x] 8.4 Add developer docs for adding a contributed InstallTarget, including `package.json` contribution, activation event, registration, lifecycle hooks, and tests
- [x] 8.5 Update README or package docs for market settings, private registry URL, auth dependency, and checkout deep-link behavior
- [x] 8.6 Document known P0 deferrals for sparse/proxy/delta execution and signature P1/P2 verification if not fully implemented

## 9. Validation and Quality Gates

- [x] 9.1 Run `pnpm --filter @neko/shared test` or the nearest neko-types/shared test target covering manifest contract changes
- [x] 9.2 Run `pnpm --filter @neko/market-core test` for client, install runtime, cache, license, version, target registry, and installed registry suites
- [x] 9.3 Run market extension targeted tests for MarketplaceService, MarketplaceHandler, market API, contribution discovery, and target adapters
- [x] 9.4 Run market webview targeted tests and build for message/store/UI changes
- [x] 9.5 Run affected consumer package targeted tests for agent market integration, assets library projection, cut preset/shader projection, and model target contribution where implemented
- [x] 9.6 Run architecture guard checks for Layer 0/1/2 dependency direction, webview no `vscode`, extension no React, and market no domain imports
- [x] 9.7 Run `pnpm check` or document any repository-wide check blockers unrelated to this change
- [x] 9.8 Run `openspec validate align-neko-market-registry-contracts --strict`
