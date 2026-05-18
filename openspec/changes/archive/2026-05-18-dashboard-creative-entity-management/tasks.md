## 1. Shared Contracts

- [x] 1.1 Add Dashboard creative-entity DTOs in `packages/neko-types` for entity refs, row snapshots, details, occurrence refs, binding summaries, requirement summaries, visual draft summaries, sync suggestions, source status, events, action requests, and action results.
- [x] 1.2 Add `DashboardCreativeEntitySource` and command constants such as `neko.story.getDashboardCreativeEntitySource` without importing VSCode, React, Story, Assets, Agent, or Dashboard implementations.
- [x] 1.3 Add type guards and contract tests for entity refs, freshness/status values, safe local refs, action ids, sync suggestion payloads, and source validation.
- [x] 1.4 Export the new contracts from shared entrypoints used by Dashboard extension and Webview packages.

## 2. Story Source Adapter

- [x] 2.1 Implement a Story-owned `DashboardCreativeEntitySource` adapter that reuses `CreativeEntityManagementService`, the registry, bindings, requirements, visual drafts, occurrence index, and graph services.
- [x] 2.2 Register `neko.story.getDashboardCreativeEntitySource` during Story activation and dispose event subscriptions with the extension lifecycle.
- [x] 2.3 Project confirmed entities, script candidates, missing requirements, default bindings, visual drafts, and relationship/occurrence summaries into Dashboard DTOs with stable source refs.
- [x] 2.4 Add source actions for showing detail, binding existing assets, reviewing visual drafts, opening missing material queue, confirming candidates where supported, applying sync suggestions, and ignoring sync suggestions.
- [x] 2.5 Ensure the adapter never exposes absolute paths, `file://` URIs, or `.neko/.cache` schema paths to Dashboard Webview DTOs.
- [x] 2.6 Add Story adapter tests for Chinese role names such as `小橘`, entities without assets, confirmed entities with bindings, open requirements, visual drafts, candidate rows, and invalid-path sanitization.

## 3. Dashboard Extension Host

- [x] 3.1 Add a `CreativeEntitySourceAggregator` or equivalent host service in `neko-dashboard` with source discovery, validation, subscription replacement, snapshot loading, detail loading, action dispatch, and graceful missing-source handling.
- [x] 3.2 Extend Dashboard protocol and `DashboardData` to include creative entity source status, rows, selected/detail state where appropriate, and freshness information.
- [x] 3.3 Wire Dashboard refresh to load creative entity snapshots alongside projects, runtime, workflows, skills, and tasks without continuous polling.
- [x] 3.4 Wire source events so entity changes refresh affected rows/details while preserving task/runtime state and disposing subscriptions when the panel closes.
- [x] 3.5 Add host message handling for entity detail requests and entity action requests; validate source refs, action ids, and safe refs before delegating.
- [x] 3.6 Add extension tests for missing Story source, invalid source rejection, duplicate source replacement, action delegation, event refresh, stale status projection, and unsafe ref rejection.

## 4. Dashboard Webview

- [x] 4.1 Add Creative Entities navigation/section in Dashboard Work Mode without changing Welcome Mode requirements.
- [x] 4.2 Implement table state utilities for text search, kind filtering, status filtering, missing-material filtering, binding-state filtering, and deterministic sorting.
- [x] 4.3 Implement the Creative Entities table using Dashboard design conventions for dense project management UI rather than asset-card browsing.
- [x] 4.4 Implement an entity detail panel showing identity, aliases, source, occurrences, default bindings, all bindings, missing requirements, visual drafts, sync suggestions, and freshness.
- [x] 4.5 Add Webview action messages for opening source, binding existing asset, reviewing drafts, handling requirements, confirming candidates, applying sync suggestions, ignoring suggestions, and refreshing.
- [x] 4.6 Add Webview tests for Chinese-name filtering, missing-material filters, stable sorting, detail rendering, disabled unavailable actions, sync suggestion actions, and no absolute path rendering.

## 5. Asset Sync Suggestion Flow

- [x] 5.1 Define source-side sync suggestion projection for stale asset label/tag/description metadata, generated asset registration candidates, and binding mismatch states without mutating assets.
- [x] 5.2 Implement explicit apply/ignore suggestion actions in the Story source adapter, delegating asset mutations to existing Assets commands or safe no-op results when a typed Assets command is unavailable.
- [x] 5.3 Ensure entity edits and binding changes refresh search indexes, Dashboard rows, and suggestions but do not automatically rewrite asset metadata.
- [x] 5.4 Add tests proving entity rename or alias changes do not mutate asset library data until an explicit apply action is invoked.

## 6. Architecture And Documentation

- [x] 6.1 Update Dashboard architecture documentation to describe Creative Entities as a project semantic management section and explain source discovery/action delegation boundaries.
- [x] 6.2 Update creative entity / asset composition documentation to clarify that entity facts do not automatically write back into asset metadata and that sync suggestions require explicit user action.
- [x] 6.3 Add migration notes for keeping existing Story QuickPick commands as fallback actions while Dashboard gains richer inline interactions.
- [x] 6.4 Add architecture/dependency tests preventing `neko-dashboard` from importing Story/Assets implementations and preventing Dashboard Webview from reading filesystem/cache schemas.

## 7. Verification

- [x] 7.1 Run targeted `neko-types` tests for Dashboard creative-entity contracts.
- [x] 7.2 Run targeted `neko-story` extension tests for the Dashboard creative-entity source adapter.
- [x] 7.3 Run targeted `neko-dashboard` extension tests for source aggregation, protocol validation, and action dispatch.
- [x] 7.4 Run targeted `neko-dashboard` Webview tests for table/detail UI state.
- [x] 7.5 Run the narrowest practical package checks for touched packages, then escalate to broader checks only if targeted validation indicates shared regressions.
