## Host Adapter Audit

Change: `normalize-cross-host-adapter-composition`

This audit records the first implementation boundary for VSCode, Node/TUI, and
Electron/Desktop host adapters. It is intentionally scoped to composition roots
and known Webview transport facades; it is not a request for every package to
implement three host variants.

## 1. Direct Host API Usage

### VSCode Extension Adapter Usage

Classification: `vscode transport adapter`

The following packages use `vscode` and `@neko/shared/vscode/extension` inside
Extension-side composition roots:

- `packages/neko-agent/packages/extension/src/**`
- `packages/neko-cut/packages/extension/src/**`
- `packages/neko-canvas/packages/extension/src/**`
- `packages/neko-audio/packages/extension/src/**`
- `packages/neko-sketch/packages/extension/src/**`
- `packages/neko-model/packages/extension/src/**`
- `packages/neko-preview/packages/extension/src/**`

These are expected host adapter locations. They own VSCode commands, custom
editors, Webview providers, local resource projection, status/tree views, config
file opening, project file adapters, and Extension Host routing.

### Webview VSCode Transport Facades

Classification: `package facade` or `legacy host coupling`

Known production Webview transport facades:

- Agent: `packages/neko-agent/packages/webview/src/messages/index.ts`
- Cut: `packages/neko-cut/packages/webview/src/utils/vscodeApi.ts`
- Canvas: `packages/neko-canvas/packages/webview/src/utils/vscode.ts`
- Audio: `packages/neko-audio/packages/webview/src/shared/useVscodeMessage.ts`
- Sketch: `packages/neko-sketch/packages/webview/src/utils/vscode.ts`
- Preview: `packages/neko-preview/packages/webview/src/shared/vscodeApi.ts`
- Model: direct `@neko/shared/vscode` use in `App`, `Toolbar`,
  `VideoViewport`, and `LatencyTester`

Current classification:

- Package-local facades that delegate to `@neko/shared/vscode` are allowed as
  migration facades while they are scoped to VSCode transport.
- Direct Webview component imports of `@neko/shared/vscode` are legacy host
  coupling for host-neutral surfaces.
- Agent Webview is the first migration scope because Desktop already hosts that
  package root and needs route parity.

### Electron/Desktop Adapter Usage

Classification: `electron adapter`

Expected Electron API usage is currently concentrated in:

- `packages/neko-desktop/src/main/index.ts`
- `packages/neko-desktop/src/preload/index.ts`

These files own Electron `BrowserWindow`, `ipcMain`, `contextBridge`,
`ipcRenderer`, custom protocol/resource handling, Desktop bridge exposure, and
the temporary VSCode-compatible shim.

Current migration note:

- `contextBridge.exposeInMainWorld('vscodeApi', ...)` is an approved temporary
  shim only for unmigrated Webview code.
- New Agent host runtime work must use scoped runtime channels instead of this
  global shim as the canonical path.

### Node/TUI Adapter Usage

Classification: `node adapter`

Expected Node host usage is concentrated in TUI/headless composition roots:

- `packages/neko-agent/packages/cli-tui/src/host/node-host-adapter.ts`
- `packages/neko-agent/packages/cli-tui/src/host/node-workspace-content-host.ts`
- `packages/neko-agent/packages/cli-tui/src/host/node-content-access-runtime.ts`
- `packages/neko-agent/packages/cli-tui/src/core/platform-bootstrap.ts`
- `packages/neko-agent/packages/cli-tui/src/core/config.ts`
- `packages/neko-agent/packages/cli-tui/src/hooks/useAgentSession.ts`

The TUI uses Node filesystem/path/process APIs as its concrete headless adapter.
It must continue to call Platform, Agent runtime, task storage, content access,
skills, and commands directly rather than emulating Webview transport.

## 2. Classification Summary

| Location | Classification | Action |
| --- | --- | --- |
| Extension `src/**` importing `vscode` | VSCode adapter | Keep at composition root; wrap Agent Webview transport behind host runtime adapter |
| `@neko/shared/vscode` package-local Webview facades | Package facade | Allowed temporarily; migrate Agent first |
| Webview components directly importing `@neko/shared/vscode` | Legacy host coupling | Do not add new usage; migrate when surface becomes host-neutral |
| Desktop `main` / `preload` Electron imports | Electron adapter | Keep in Desktop composition root |
| Desktop global `vscodeApi` shim | Temporary shim | Quarantine behind migration record; replace Agent with scoped channel |
| TUI `cli-tui/src/host` Node imports | Node adapter | Keep as canonical headless adapter |
| TUI direct runtime/platform bootstrap | Node adapter | Keep; add tests proving no Webview transport dependency |

## 3. First Migration Scope

The first implementation slice is Agent host runtime composition:

1. Add a host-neutral Agent host runtime adapter contract.
2. Add a compatibility message-builder facade that initially preserves the
   existing `VSCodeMessages` call shape.
3. Implement VSCode adapter by delegating to the current shared VSCode bridge.
4. Implement Electron adapter through scoped Desktop runtime channels.
5. Migrate Agent Webview root and high-traffic components to the injected
   facade.

## 4. Approved Temporary Shims

| Shim | Owner | Replacement | Validation | Removal condition |
| --- | --- | --- | --- | --- |
| Desktop global `window.vscodeApi` shim in `packages/neko-desktop/src/preload/index.ts` | Desktop host adapter | Scoped Electron Agent host runtime channel and package-specific facades | Desktop Agent route tests and no cross-runtime message leakage tests | Agent and migrated package roots no longer rely on the global shim |
| Agent `VSCodeMessages` export in `packages/neko-agent/packages/webview/src/messages/index.ts` | Agent Webview | Injected Agent host runtime facade with VSCode/Electron adapters | Agent Webview tests mock injected adapter; legacy direct path poisoned for migrated tests | All Agent Webview production call sites use injected facade |
| Package-local Webview `vscodeApi` helpers outside Agent | Owning feature package | Package-owned host-neutral facade when the surface is migrated to Desktop/Electron | Future guardrails allow only documented facade files | Surface is declared host-neutral and registered for non-VSCode hosts |
