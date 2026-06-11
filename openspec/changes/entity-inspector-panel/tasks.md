## 1. Contracts And Commands

- [x] 1.1 Define or reuse serializable Inspector detail, TreeView item, and reverse lookup DTOs with validation guards.
- [x] 1.2 Register `neko.entity.inspectEntity` and ensure it accepts entity refs, candidate refs, and optional context.
- [x] 1.3 Expose `neko.entity.listEntities`, `neko.entity.getEntity`, and asset reverse lookup commands required by TreeView and AssetManager.
- [x] 1.4 Add command availability and invalid-payload error handling for callers.

## 2. Dashboard Inspector

- [x] 2.1 Register `neko.entityInspector` WebviewViewProvider in `neko-dashboard` with a safe empty state.
- [x] 2.2 Reuse Dashboard entity detail projections/components for read-only Inspector rendering.
- [x] 2.3 Add Inspector action buttons that call Entity Facade or Dashboard host commands.
- [x] 2.4 Subscribe to entity change events and refresh affected inspected refs only.
- [x] 2.5 Add i18n strings and safe Webview message validation for Inspector actions.

## 3. Creative Tool Integration

- [x] 3.1 Wire Canvas Hover Card detail action to `neko.entity.inspectEntity`.
- [x] 3.2 Wire Entity Quick Panel entity selection to `neko.entity.inspectEntity`.
- [x] 3.3 Add graceful fallback when Inspector command is unavailable.
- [x] 3.4 Add optional `entityInspector.autoFollow` setting and debounced focus signal handling.

## 4. Assets TreeView Integration

- [x] 4.1 Register `neko.entityBrowser` TreeView inside `neko-asset-manager`.
- [x] 4.2 Load and group TreeView items through entity facade commands only.
- [x] 4.3 Add TreeView item click and context menu actions for inspect, rename, edit appearance, open Dashboard, and create entity where supported.
- [x] 4.4 Add AssetManager reverse lookup action for bound creative entities.
- [x] 4.5 Ensure `neko-assets` does not import entity, Dashboard, Story, Canvas, or Agent implementation modules.

## 5. Tests And Validation

- [x] 5.1 Add unit tests for inspect command validation and focus behavior.
- [x] 5.2 Add Webview host tests for Inspector action routing and invalid action rejection.
- [x] 5.3 Add event refresh tests for candidate confirmation and binding updates.
- [x] 5.4 Add TreeView provider tests for grouping, unavailable source state, and inspect invocation.
- [x] 5.5 Run focused package tests plus `pnpm check` for affected TypeScript packages.
