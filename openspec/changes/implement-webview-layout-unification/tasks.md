## 1. Contracts And Shared Utilities

- [x] 1.1 Add `StatusBarItemSpec` and an Extension-side status projection helper near `StatusBarGroup`, with imperative active-editor visibility management.
- [x] 1.2 Add tests for StatusBar visibility matching, active editor/tab switching, item priority ordering, and no reliance on programmatic `when` clauses.
- [x] 1.3 Defer AgentPhase/OpenTab phase extension after Agent Webview Header/Input rollback.
- [x] 1.4 Confirm old Agent tab parsing remains unchanged and no phase projection is introduced in this change.
- [x] 1.5 Add `ResizeState` and `usePersistedResize(panelId, defaultSize, bounds)` using Webview `getState` / `setState`.
- [x] 1.6 Add persisted resize tests for restore, clamping, collapsed state, and multiple independent panel ids.

## 2. Model Status And Topbar Migration

- [x] 2.1 Add model StatusBar manager/items for selected node, object count, and engine status using `activeCustomEditorId == neko.modelEditor` as the visibility condition metadata.
- [x] 2.2 Wire model Webview or extension state updates into the model StatusBar manager without duplicating engine authority or Webview-only computation.
- [x] 2.3 Add tests or extension-level fixtures for model StatusBar show/hide and status text updates.
- [x] 2.4 Remove `WorkbenchTopBar` only after model StatusBar items are verified.
- [x] 2.5 Add before/after screenshot or DOM layout assertion proving the model viewport gains the reclaimed topbar height and status remains visible.

## 3. Canvas Status Migration

- [x] 3.1 Extend existing `CanvasStatusBar` to include projection status alongside subsystem summary without exceeding the per-package status item cap.
- [x] 3.2 Update `CanvasEditorProvider` status updates to include subsystem and projection state.
- [x] 3.3 Remove the Webview lower-left subsystem/projection badge from `CanvasApp`.
- [x] 3.4 Add tests or DOM assertions proving the canvas lower-left surface is no longer obstructed and status remains available natively.

## 4. Agent Webview Rollback

- [x] 4.1 Keep Agent New Chat, History, AccountBar, conversation tabs, session/model selectors, and generation controls in the existing Webview design.
- [x] 4.2 Remove the attempted native StatusBar/QuickPick selector bridge and compact InputArea/Header implementation from this change.
- [x] 4.3 Update specs and design notes to mark Agent Header/Input redesign as deferred to a dedicated proposal.
- [x] 4.4 Add a regression check that no Agent native selector migration files or command registrations remain in this change.

## 5. Model Resize Migration

- [x] 5.1 Add persisted resize to model Right Dock width with min/max constraints.
- [x] 5.2 Add persisted resize to model Outliner/Properties vertical split with min/max constraints.
- [x] 5.3 Add persisted resize to model Timeline Dock height with min/max constraints.
- [x] 5.4 Add tests for resize pointer behavior, persistence after tab switch, and bounds clamping.
- [x] 5.5 Verify model resize changes do not alter viewport semantic control behavior or frame/scene-control ownership.

## 6. Puppet Resize Migration

- [x] 6.1 Replace puppet fixed `w-60` right panel width with persisted resize using default 280px and 200px-400px bounds.
- [x] 6.2 Ensure NodeTree, Parameters, ControlDrivers, Animation, and Keyframe Timeline remain usable after resize.
- [x] 6.3 Add tests for puppet right-panel resize persistence, min/max bounds, and no regression in toolbar/context-menu routing.

## 7. Cut Preview Control Refinement

- [x] 7.1 Add preview-control overflow behavior for low-frequency Cut actions such as PiP, Screenshot, and FPS.
- [x] 7.2 Consolidate Quality/Speed settings into a settings menu or property panel placement without hiding primary playback controls.
- [x] 7.3 Enforce Cut PropertyPanel min/max width bounds.
- [x] 7.4 Add narrow-layout tests or screenshots proving primary playback controls remain visible and low-frequency actions are accessible through overflow.

## 8. Design Token And Icon Guardrails

- [x] 8.1 Ensure touched layout code uses `--neko-*` or VSCode theme variables and does not introduce new package-specific token prefixes.
- [x] 8.2 Replace newly touched inline layout icons with shared icons where a shared icon exists.
- [x] 8.3 Leave broad CSS token/icon migration to the UI design system change and avoid unrelated style churn.

## 9. Documentation And Verification

- [x] 9.1 Update `docs/architecture/adr-webview-layout-unification.md` with implementation status notes for completed phases.
- [x] 9.2 Update affected package README/architecture notes when user-visible layout or native command entry points change.
- [x] 9.3 Run targeted TypeScript tests for `@neko/shared`, Agent Webview/extension, Canvas extension/Webview, Model Webview/extension, Puppet Webview, and Cut Webview.
- [x] 9.4 Run `pnpm check` or narrower package `check` commands for touched TypeScript packages.
- [x] 9.5 Capture or assert layout before/after evidence for Model, Canvas, Puppet, and Cut where visual behavior changes; Agent Header/Input is rollback-only in this change.
- [x] 9.6 Confirm no Webview imports `vscode` or Node APIs and no Extension-side code imports React as part of the migration.
