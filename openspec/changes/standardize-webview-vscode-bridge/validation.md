## Validation Log

Date: 2026-06-18

### Passed

- Post-completion fallback hardening:
  - `pnpm exec vitest run packages/webview/src/shared/vscodeApi.test.ts packages/webview/src/shared/usePersistedState.test.tsx --reporter=dot` from `packages/neko-preview`
  - `pnpm exec tsc --noEmit` from `packages/neko-preview/packages/webview`
  - `pnpm exec tsc --noEmit` from `packages/neko-audio/packages/webview`
  - `pnpm exec vitest run src/vscode-api.test.ts --passWithNoTests --reporter=dot` from `packages/neko-live/packages/webview`
  - `pnpm exec tsc --noEmit` from `packages/neko-canvas/packages/webview`
  - `pnpm exec tsc --noEmit` from `packages/neko-cut/packages/webview`
  - `pnpm --dir packages/neko-types test -- --run src/vscode/__tests__/api.test.ts --reporter=dot` (package script ran the full `packages/neko-types` Vitest suite: 123 files / 1145 tests)
  - `pnpm check:webview-boundaries`
  - `rg -n "acquireVsCodeApi|__vscode_api__|__vscodeApi|window\\.vscode|window\\.vscodeApi|globalThis\\.__vscode|mock postMessage|VSCode Webview API not available, using mock|acquireVsCodeApi not available, using mock" packages/*/packages/webview/src --glob '!**/dist/**' --glob '!**/*.test.*' --glob '!**/__tests__/**' --glob '!**/*.d.ts'` returned no production matches.

- `pnpm --dir packages/neko-types test -- --run src/vscode/__tests__/api.test.ts --reporter=dot`
- `pnpm exec vitest run src/services/messenger.test.ts --reporter=dot` from `packages/neko-dashboard/packages/webview`
- `pnpm exec vitest run src/messages/index.test.ts --reporter=dot` from `packages/neko-market/packages/webview`
- `pnpm exec vitest run src/vscode-api.test.ts --passWithNoTests --reporter=dot` from `packages/neko-live/packages/webview`
- `pnpm exec vitest run packages/webview/src/shared/vscodeApi.test.ts packages/webview/src/shared/usePersistedState.test.tsx --reporter=dot` from `packages/neko-preview`
- `pnpm exec vitest run src/preview/previewResolver.test.ts src/preview/previewDelegates.test.ts src/components/content/canvasEntityRouteClient.test.ts --reporter=dot` from `packages/neko-canvas/packages/webview`
- `pnpm exec vitest run src/stores/slices/layerSlice.test.ts src/components/BrushPanel.shared-ui.test.tsx --reporter=dot` from `packages/neko-sketch/packages/webview`
- `pnpm exec vitest run src/__tests__/components.test.tsx --reporter=dot` from `packages/neko-story/packages/webview`
- `pnpm exec vitest run src/components/PuppetToolbar.test.tsx --passWithNoTests --reporter=dot` from `packages/neko-puppet/packages/webview`
- `pnpm exec tsc --noEmit` from `packages/neko-audio/packages/webview`
- `pnpm exec tsc --noEmit` from `packages/neko-canvas/packages/webview`
- `pnpm exec tsc --noEmit` from `packages/neko-sketch/packages/webview`
- `pnpm exec tsc --noEmit` from `packages/neko-story/packages/webview`
- `pnpm exec tsc --noEmit` from `packages/neko-puppet/packages/webview`
- `pnpm check:webview-boundaries`
- `pnpm check:deps`
- `pnpm smoke:webview:runtime`
- `openspec validate standardize-webview-vscode-bridge`

### Residual Gaps

- `pnpm check` fails in `pnpm check:unused` on pre-existing repository-wide Knip findings, including `AgentStateIndicator.tsx`, `@fission-ai/openspec`, unlisted `jsdom` test environment markers, `tsc` binary reporting, and unrelated unused exports. After removing bridge-local unused exports, no remaining Knip finding is from this bridge migration.
- `pnpm check:quality` executes and passes the new `pnpm check:webview-boundaries` guardrail, then fails later in `pnpm check:strict-extensions` on existing `packages/neko-agent/packages/extension/src/services/workspaceProjectSearch.ts` type errors where `source: string` is not assignable to `ProjectMentionSource`.
- Post-completion fallback hardening reran `pnpm check:quality`; release-channel, legacy-debt ledger, agent-boundaries, 3d-route-a, webview-boundaries, and strict-tsconfig all passed before the same existing `workspaceProjectSearch.ts` strict-extension type errors stopped the command.
- Preview persisted-state tests pass but emit React `act(...)` environment warnings from existing Vitest/React test setup.
