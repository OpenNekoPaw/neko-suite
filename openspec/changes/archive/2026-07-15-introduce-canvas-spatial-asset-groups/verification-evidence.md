# Verification Evidence

Date: 2026-07-15

## Focused tests

- Canvas Webview: 69 files, 505 tests passed.
- `@neko/shared`: 182 files, 1582 tests passed.
- `neko-assets`: 18 files, 92 tests passed.
- `neko-canvas`: 23 files, 293 tests passed.
- Agent Extension: 78 files, 736 tests passed.
- TUI artifact projector and App-port: 2 files, 24 tests passed.
- Focused promotion recovery tests passed for promotion-time discard rejection, Asset API failure returning candidates to retryable `failed`, and disabled discard UI while promotion is in progress.

These tests cover the shared contracts and validators, `.nkc` durable-resource rejection, Asset-owned import/promotion, Canvas Extension projection and promotion orchestration, spatial Group store/layout/interaction behavior, Webview message handling, generated-output delivery, and the TUI generated-output artifact projection. Path-level assertions verify that new generated retention does not write `neko/generated/<kind>/` and does not fall back to the active Canvas.

## Build and runtime verification

- `pnpm build`: passed, 33/33 tasks.
- `pnpm test:webview:functional --owner neko-canvas --tier p0`: passed all four selected scenarios on VS Code 1.128.0.
  - `canvas.board-basic-professional.p0`: passed.
  - `canvas.edit-save-reopen.p0`: passed.
  - `canvas.invalid-project.p0`: passed.
  - `canvas.spatial-groups.p0`: passed; latest raw result at `reports/webview-functional/canvas.spatial-groups.p0/2026-07-15T04-26-35-350Z/result.json` (gitignored).
- Focused Agent Evaluation dry-run passed:
  `node scripts/agent-eval/protocol-smoke.mjs --suite agent-runtime.creative-media-workflow --case image-quality-feedback-iteration --dry-run`.
- Direct all-suite Agent Evaluation discovery passed:
  `node scripts/agent-eval/all-suite-dry-run.mjs` (23 suites, 42 cases).

The Extension Development Host scenario verifies low-chrome/structured presentation, the contextual toolbar, child and Group subtree movement, arrange/Fit/collapse, nested geometry, keyboard rename, light/dark themes, CSP, and runtime error gates. Single/batch promotion, partial failure, stale target, replay/idempotency, and forbidden active-Canvas fallback are covered by Extension/Asset/Canvas integration tests because a committed fixture cannot create a real provider-owned runtime generated candidate without adding a test-only Host path.

## Repository gates with external failures

- `pnpm test`: the proposal-owned tests passed; the root run has one unrelated failure in `packages/neko-agent/packages/agent/src/skill/__tests__/skill-meta-provider.test.ts` because a parallel capability change's mock lacks `categoryRegistry.listCategories()`.
- `pnpm check`: blocked by unrelated Home unused files/dependencies and existing baseline unused exports; no proposal-owned service was reported unused.
- `pnpm check:deps`: blocked by two unrelated cycles under `packages/neko-content/src/document/`.
- `pnpm check:legacy-debt`: blocked by the existing 141 blocking debt surfaces; this proposal introduces no `delete-now` item.
- Standalone Canvas/Agent/TUI typechecks encounter parallel worktree errors or existing package `moduleResolution` issues. Asset compile, Canvas compile, and the root build passed.

## Residual risk

The real Agent-to-VS Code path with an external media provider, runtime generated review Group, creator promotion, and frozen Board apply has not been exercised end-to-end. The real Agent Evaluation run intentionally remains failed for two observed behavior gaps rather than being rerun to manufacture a green report; deterministic owner-level tests and the Extension Development Host scenario provide supporting path evidence but do not replace that provider runtime acceptance.
