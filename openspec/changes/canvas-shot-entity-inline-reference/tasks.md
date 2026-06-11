## 1. Shared Contracts And Projection

- [x] 1.1 Add optional `candidateId` to `ShotCharacter` and related validators/serializers.
- [x] 1.2 Update storyboard-to-canvas projection to preserve `entityRef` and injected `candidateId`.
- [x] 1.3 Add tests for backward compatibility and candidateId projection.

## 2. StoryboardDeliveryService

- [x] 2.1 Add delivery orchestration that processes entity contribution before payload assembly or records timeout.
- [x] 2.2 Add decision-to-shot-character mapping helpers with stable key priority and name fallback diagnostics.
- [x] 2.3 Inject `entityRef` / `candidateId` into payload characters when mapping is stable.
- [x] 2.4 Add tests for matched existing, matched candidate, created candidate, timeout, and same-name ambiguity.

## 3. Canvas Host Entity Routes

- [x] 3.1 Add Canvas Webview message DTOs for entity summary, candidate confirm, inspect, and result diagnostics.
- [x] 3.2 Implement Extension Host route handlers that validate messages and call Entity Facade/Dashboard commands.
- [x] 3.3 Add route tests for invalid messages, command failure, and successful summary/confirm paths.

## 4. Canvas UI

- [x] 4.1 Enhance shot character row rendering for confirmed/candidate/unlinked/ambiguous states.
- [x] 4.2 Add Hover Entity Card summary display and actions backed by host routes.
- [x] 4.3 Ensure Canvas import still creates only scene/shot nodes and no entity subgraph projections.
- [x] 4.4 Add rendering tests for each state and import tests for no entity node creation.

## 5. Confirm Backfill

- [x] 5.1 Subscribe Canvas host/editor state to project-scoped entity change events.
- [x] 5.2 Implement `candidateId` match backfill to set `entityRef` and clear `candidateId`.
- [x] 5.3 Add retry or manual recovery behavior for unavailable Canvas documents.
- [x] 5.4 Add tests for event backfill, no-op mismatches, duplicate candidate refs, and recoverable failures.

## 6. Validation

- [x] 6.1 Run focused `neko-types` storyboard/canvas type tests.
- [x] 6.2 Run focused `neko-agent` delivery orchestration tests.
- [x] 6.3 Run focused `neko-canvas` route/render/import tests.
- [x] 6.4 Run `openspec validate --all`.
- [x] 6.5 Run `git diff --check`.
