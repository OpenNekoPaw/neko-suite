# Quality Review

Date: 2026-07-15

Risk: L4. The change spans the core creative workflow, shared contracts, Asset ownership, Canvas project persistence, Extension/Webview messaging, Agent delivery, TUI evaluation projection, and VS Code Webview interaction.

## Findings

No unresolved P0 or P1 findings remain.

Resolved P1 findings:

1. The Canvas promotion handler returned an orchestration wrapper while the Webview validated a single promotion result. The Extension message boundary now returns the validated `CanvasGeneratedDraftPromotionResult` contract.
2. Asset API failures could leave candidates permanently in `promoting`, and promotion-time discard could race with completion. Failures now restore retryable `failed` state, discard is rejected/disabled while promoting, and every state other than `saved-to-assets` or `added-to-board` remains unsaved.
3. `NekoAssetsAPI.importFile` documented fail-visible behavior while its type still permitted `undefined`. The public contract now returns `Promise<AssetEntity>` and impossible consumer fallback branches were removed.

## Architecture review

- Responsibility: generated-output owns runtime bytes and revision/digest identity; Canvas Extension owns runtime review projection and frozen Board application; AssetLibrary/AssetStore alone owns durable promotion and file/entity identity; Webview owns presentation and interaction only.
- Dependency: shared contracts live in `@neko/shared`; Webview does not read files or import VS Code; Canvas and Agent use public Extension APIs rather than another feature package's internals.
- Interface: the versioned promotion request/result and projection validators are minimal, itemized, fail visible, and carry explicit target/revision identity. Runtime IDs, render URIs, cache paths, and unpromoted refs are rejected by durable `.nkc` validation.
- Extension: one promotion facade supports single and batch selection, idempotent replay, partial failure, and future media kinds without a second generated directory or alternate Canvas format.
- Testing: focused unit/integration tests assert canonical services and forbidden fallbacks; the isolated Extension Development Host scenario exercises the real Canvas Webview interaction path. Provider-backed Agent-to-VS Code promotion remains an explicit residual risk.

The design reuses existing Canvas descriptors, action dispatchers, project authoring, ResourceRef validation, AssetLibrary import, shared theme/i18n/Codicons, and Webview functional infrastructure. New components are limited to runtime generated-review and screen-space selection responsibilities that cannot be represented by the existing persisted node renderer or context menu without coupling runtime state to `.nkc`.

## Verification

See `verification-evidence.md` and `evaluation-evidence.md` for exact results, known unrelated repository-gate failures, and raw evidence locations.

## Residual risk

- No real external provider run has yet exercised Agent completion through VS Code runtime Group promotion and frozen Board apply end-to-end.
- Repository-wide `pnpm test`, `pnpm check`, dependency-cycle, and legacy-debt gates remain blocked by unrelated parallel/baseline changes recorded in `verification-evidence.md`.
