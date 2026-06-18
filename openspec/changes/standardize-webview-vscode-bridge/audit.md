## Current Webview VS Code Bridge Audit

Date: 2026-06-18

### Canonical Shared Surface

| Area | Current shared entry | Notes |
| --- | --- | --- |
| API acquisition | `packages/neko-types/src/vscode/api.ts#getVSCodeAPI` | Owns `acquireVsCodeApi()` fallback and `window.vscodeApi` pre-acquired instance support. |
| Transport | `postMessage`, `sendRequest`, `cancelRequest`, `getPendingRequestCount` | Request-response is already centralized but needs focused tests and reset cleanup. |
| Session state | `getState`, `setState` | Suitable for Webview UI/session state only, not durable project facts. |
| Types | `packages/neko-types/src/vscode/types.ts` | Provides `VSCodeAPI`, request/response, pending request, and wrapper contracts. |

### Production Webview Findings

| Package | Current pattern | Migration target |
| --- | --- | --- |
| `neko-agent` | Uses `@neko/shared/vscode` in `messages/index.ts`; tests also mock direct acquisition in one hook test. | Keep typed facade; update tests to shared bridge test utilities where practical. |
| `neko-audio` | `shared/useVscodeMessage.ts` owns a local singleton and calls `window.acquireVsCodeApi?.()`. | Convert `useVscodeMessage` to delegate to `@neko/shared/vscode`; keep audio message types local. |
| `neko-canvas` | `CanvasApp.tsx` directly declares/calls `acquireVsCodeApi()` and stores `__vscode_api__`; `utils/vscode.ts` reads globals. | Introduce/adjust canvas bridge facade over `@neko/shared/vscode`; migrate globals to facade or injection. |
| `neko-cut` | `utils/vscodeApi.ts` re-exports `@neko/shared/vscode`; package code imports this facade. | Keep facade and remove remaining misleading duplicate comments/types if needed. |
| `neko-dashboard` | `services/messenger.ts` calls `window.acquireVsCodeApi?.()` directly. | Delegate to `@neko/shared/vscode` while preserving `postMessage(WebviewToExtensionMessage)`. |
| `neko-live` | `vscode-api.ts` directly calls `acquireVsCodeApi()` and caches on `globalThis.__vscodeApi`. | Delegate to `@neko/shared/vscode`; keep exported `vscode`-like facade for existing callers. |
| `neko-market` | `messages/index.ts` directly calls `acquireVsCodeApi()`. | Keep `MarketMessages` builders but route transport through `@neko/shared/vscode`. |
| `neko-model` | Mostly imports `postMessage` from `@neko/shared/vscode`; app code still has direct post usage through shared helper. | Preserve shared imports; verify no local singleton remains. |
| `neko-preview` | `shared/vscodeApi.ts` owns local singleton/mock; `usePersistedState` and `useVscodeMessage` depend on it. | Convert `getVscodeApi` to a thin adapter over shared bridge; preserve document restore/save message contract. |
| `neko-puppet` | `PuppetApp.tsx` directly calls `window.acquireVsCodeApi()`. | Add/route through package facade over `@neko/shared/vscode`. |
| `neko-sketch` | `App.tsx` directly calls `acquireVsCodeApi()` and exposes `__vscode_api__`; components/stores read the global. | Introduce sketch bridge facade; migrate component-level global access. |
| `neko-story` | `hooks/useVSCodeMessaging.ts` directly calls `acquireVsCodeApi()`. | Convert hook to use shared bridge while preserving ready/navigate helpers. |
| `neko-tools` | `runtime/bridge.ts` already delegates to `@neko/shared/vscode`. | Keep as typed runtime bridge; use as a reference pattern. |

### Guardrail Candidates

- Production source scan should include `packages/*/packages/webview/src/**/*.{ts,tsx}`.
- Allow direct acquisition only in `packages/neko-types/src/vscode/api.ts`, test setup files, and explicitly documented temporary migration shims.
- Existing tests that mock `acquireVsCodeApi()` should be allowed under `*.test.*`, `__tests__/setup.ts`, and shared test utilities.

### First Implementation Notes

- The shared bridge already exports most required primitives.
- `resetVSCodeApi()` should remove any installed request-response message listener so tests and HMR-style reinitialization do not accumulate stale listeners.
- A shared test utility can create a minimal Webview-like `window` object in Vitest node environment without requiring jsdom.
