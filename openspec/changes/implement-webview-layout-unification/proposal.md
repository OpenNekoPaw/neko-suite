## Why

Neko Suite 的 Webview 布局已经在十多个子包中形成重复 Shell、状态信息散落、Header 重建 VSCode 原生层、Agent 输入区挤压消息区等问题。`docs/architecture/adr-webview-layout-unification.md` 已将布局原型、原生 VSCode UI 边界和分阶段迁移策略确定下来，现在需要把 ADR 转成可实施的开发变更。

## What Changes

- Add a layout unification contract for the four Webview layout prototypes: Workbench, Studio, Conversation, and Dashboard.
- Add `StatusBarItemSpec` and status bar projection behavior so pure informational state moves from Webview chrome into VSCode native StatusBar where appropriate.
- Keep the current `neko-agent` Webview Header/InputArea design in this change. The attempted native Header/Input layering was rolled back because the Webview design needs a separate redesign proposal.
- Migrate `neko-model` status information into native StatusBar before removing `WorkbenchTopBar`; then add resizable Right Dock, Outliner/Properties split, and Timeline height.
- Migrate `neko-canvas` subsystem/projection status from the Webview lower-left badge into the existing CanvasStatusBar.
- Add persisted resize state for layout panels using Webview `vscode.getState()` / `vscode.setState()` rather than disk or workspace settings.
- Add `neko-puppet` right-panel resize and `neko-cut` preview-control overflow/min-width refinements.
- Keep CSS token and icon migration scoped to layout edits only; full token/icon convergence remains owned by `adr-webview-ui-design-system.md`.
- Exclude viewport semantic control flow from this change; that remains owned by `adr-viewport-stream-control-boundary.md` and unified viewport protocol work.

## Capabilities

### New Capabilities

- `webview-layout-unification`: Defines cross-Webview layout prototype contracts, native VSCode UI integration, StatusBar projection, Agent conversation layout behavior, and package-level layout migration requirements.

### Modified Capabilities

- `webview-layout-resize-primitives`: Add persisted resize-state behavior for Webview layout panels and apply it to model/puppet resizable panel migrations.

## Impact

- Shared contracts and utilities:
  - `packages/neko-types/src/vscode/extension/StatusBarGroup.ts`
  - `packages/neko-types/src/components/useResizable.ts`
  - `packages/neko-types/src/components/ResizeHandle.tsx`
  - Webview-side state bridge helpers in `@neko/shared/vscode` or an equivalent existing Webview API wrapper.
- Agent:
  - No code changes in the current implementation. Header actions, account chrome, session/model selectors, and generation controls remain in the Webview pending a dedicated Agent redesign.
- Model:
  - `packages/neko-model/packages/extension/src`
  - `packages/neko-model/packages/webview/src/App.tsx`
- Canvas:
  - `packages/neko-canvas/packages/extension/src/views/canvasStatusBar.ts`
  - `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
  - `packages/neko-canvas/packages/webview/src/CanvasApp.tsx`
- Puppet and Cut:
  - `packages/neko-puppet/packages/webview/src/PuppetApp.tsx`
  - `packages/neko-cut/packages/webview/src/App.tsx`
  - `packages/neko-cut/packages/webview/src/components`
- Tests:
  - StatusBar visibility/show-hide manager tests.
  - Agent regression check that no native Header/Input selector migration remains in this change.
  - Model/canvas status bar migration tests.
  - Model/puppet/cut resize behavior and persistence tests.
  - Targeted screenshots or DOM layout assertions where visual regressions are likely.
