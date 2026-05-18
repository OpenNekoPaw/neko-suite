## 1. Package Setup

- [x] 1.1 Create `packages/neko-entity` with package metadata, exports, tsconfig, Vitest config, and workspace-compatible build/test scripts.
- [x] 1.2 Define public entrypoints for core runtime, VSCode host integration, provider contracts, Dashboard source integration, search provider integration, and test fakes.
- [x] 1.3 Add dependency boundary tests that prevent `neko-entity/core` from importing Story, Assets, Agent, Dashboard, Search, React, Webview modules, or VSCode APIs.
- [x] 1.4 Update workspace/package references so consumers can import `@neko/entity` without circular dependencies.

## 2. Shared Contract Additions

- [x] 2.1 Review `@neko/shared` creative entity contracts and add missing additive fields for entity refs, source metadata, candidate provenance, lifecycle actions, merge results, and entity change events.
- [x] 2.2 Add or update type guards and contract tests for new entity lifecycle/candidate/source DTOs.
- [x] 2.3 Keep shared contracts implementation-free and independent from `neko-entity`, Story, Assets, Dashboard, Search, Agent, React, and Webview code.

## 3. Core Entity Runtime

- [x] 3.1 Move or wrap `CreativeEntityRegistryService` and `CharacterRecordAdapter` behind `neko-entity/core` registry APIs while preserving `characters.json` compatibility.
- [x] 3.2 Move or wrap `EntityAssetBindingService`, `EntityAssetRequirementService`, `VisualIdentityDraftService`, and representation resolver wiring behind `neko-entity/core`.
- [x] 3.3 Add injected file-store, logger, clock, lock, path resolution, and event ports so core runtime can be tested without VSCode APIs.
- [x] 3.4 Add entity change events that include project root, changed entity refs, changed fact refs, reason, generation, and freshness/status metadata.
- [x] 3.5 Add core tests for registry list/get/resolve, compatibility character reads/writes, binding defaults, requirement updates, draft updates, and event emission.

## 4. Project Entity Store

- [x] 4.1 Design and implement Git-trackable non-character entity store files under `neko/entities/` or the selected project entity path.
- [x] 4.2 Route character entities to `characters.json` and non-character entities to the project entity store through explicit store routing.
- [x] 4.3 Add atomic read/write, version validation, file lock, malformed-file fallback/reporting, and multi-root project resolution behavior.
- [x] 4.4 Add tests proving `.neko/.cache` deletion does not remove confirmed entities and multi-root operations write to the owning project.

## 5. Candidate Lifecycle

- [x] 5.1 Implement `EntityCandidateService` for source-derived candidates with kind, name, provenance, source refs, confidence, and suggested requirements.
- [x] 5.2 Implement explicit candidate confirm, reject, dismiss, and merge-into-existing operations.
- [x] 5.3 Ensure confirming character candidates writes `characters.json` compatibility records and confirming non-character candidates writes project entity store records.
- [x] 5.4 Add tests for script role candidates, Chinese names such as `小橘`, candidate merge as alias, rejection without source mutation, and duplicate prevention.

## 6. Lifecycle Operations

- [x] 6.1 Implement create, rename, display name update, alias add/remove, metadata update, deprecate, and reactivate operations.
- [x] 6.2 Implement conservative merge operation that preserves surviving entity id, aliases/provenance, entity-owned bindings, requirements, and drafts.
- [x] 6.3 Add service result types carrying affected refs and refresh metadata for Dashboard and Search.
- [x] 6.4 Add tests for rename without script/asset rewrite, deprecated entity resolution, merge changed refs, and invalid lifecycle request validation.

## 7. Provider Integration

- [x] 7.1 Add provider interfaces for candidates, occurrences, relationships, representation hints, and sync suggestions.
- [x] 7.2 Add a Story provider adapter that contributes script-derived candidates and occurrences while keeping Story parsing/navigation in `neko-story`.
- [x] 7.3 Add an Assets provider adapter or integration hook for binding candidates and asset metadata sync suggestions without making Assets own entity identity.
- [x] 7.4 Ensure provider unavailability is non-fatal and reflected in status/freshness metadata.
- [x] 7.5 Add provider tests for Story unavailable, Assets unavailable, duplicate provider data, and stale provider status.

## 8. Dashboard And Search Integration

- [x] 8.1 Implement a neutral Dashboard creative entity source backed by `neko-entity`.
- [x] 8.2 Keep Story Dashboard source compatibility during migration and add duplicate avoidance or source priority rules for confirmed entities.
- [x] 8.3 Implement Dashboard action routing for confirm candidate, rename, alias update, deprecate, merge, bind, requirement, draft, and sync suggestion actions.
- [x] 8.4 Add `neko-search` provider integration or optional adapter that projects confirmed entities, candidates, requirements, and safe navigation refs from `neko-entity`.
- [x] 8.5 Add tests for Dashboard source discovery, Story unavailable confirmed entity display, duplicate row avoidance, and search projection read-only behavior.

## 9. Story Migration

- [x] 9.1 Refactor Story creative entity commands to call `neko-entity` services while preserving existing command ids and user workflows.
- [x] 9.2 Refactor Story `CreativeEntityManagementService` responsibilities into provider/projection logic or `neko-entity` service calls.
- [x] 9.3 Keep Story-owned occurrence/source navigation logic in Story and expose it through provider contracts.
- [x] 9.4 Add compatibility tests proving existing Story character detail, binding, visual draft, requirement, and open-source actions still work.

## 10. Documentation And Verification

- [x] 10.1 Update Chinese architecture documentation for `neko-entity` ownership, `characters.json` compatibility, non-character entity store, provider boundaries, and Search/Assets/Dashboard integration.
- [x] 10.2 Add migration notes for moving runtime helper services out of `@neko/shared/vscode/extension` and Story management code.
- [x] 10.3 Add architecture tests that forbid Webview direct entity file mutation and prevent Search/Assets/Agent from becoming entity fact owners.
- [x] 10.4 Run targeted tests for `@neko/shared`, `neko-entity`, Story integration, Dashboard entity source, and search provider projection.
- [x] 10.5 Run the narrowest practical package checks, then escalate to `pnpm check` if package graph changes require it.
