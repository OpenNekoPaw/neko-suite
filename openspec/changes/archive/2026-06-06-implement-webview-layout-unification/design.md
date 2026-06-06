## Context

`docs/architecture/adr-webview-layout-unification.md` is Proposed and establishes a layout-level boundary for Neko Suite Webviews. It separates editor-space UI from VSCode-native UI, groups the current editors into four layout prototypes, and defines a staged migration plan for Agent, Model, Canvas, Puppet, and Cut.

The current repo already has useful foundations:

- `@neko/shared/components` exposes `useResizable` and `ResizeHandle`.
- `@neko/shared/vscode/extension` exposes `StatusBarGroup`.
- `neko-sketch`, `neko-canvas`, `neko-audio`, `neko-agent`, and `neko-engine` already use native StatusBar items in different forms.
- `@neko/ui` owns viewport UI primitives, but layout-shell abstractions are still mostly per-editor.
- `neko-agent` owns tab, input, model, mode, account, and conversation state in a single Webview flow.
- `neko-model`, `neko-puppet`, and `neko-cut` already have workbench-like panel structures but differ in resize and status placement.

This change is about layout and host-UI integration only. It does not change viewport semantic control flow, H.264 transport, scene-control commands, or engine authority. Those remain owned by viewport protocol and stream/control boundary changes.

Five-layer analysis:

| Layer | Responsibility | Dependency Boundary | Interface | Extension Point | Test Focus |
|-------|----------------|--------------------|-----------|-----------------|------------|
| Native VSCode UI | StatusBar, view/title, editor/title, QuickPick commands | Extension Host only | `StatusBarItemSpec`, commands, active-editor visibility | per-package status projection managers | show/hide, command dispatch, QuickPick sync |
| Shared Webview layout primitives | Resize behavior, resize persistence, future slot contracts | React/Webview only | `ResizeState`, `usePersistedResize`, slot DTO docs | panel id + min/max/default size | pointer lifecycle, persistence, bounds |
| Agent conversation layout | Existing side-panel conversation shell | Webview only in this change | current Header/InputArea props and conversation tabs | deferred redesign proposal | regression check that native selector migration is absent |
| Editor workbench migrations | Model/canvas/puppet/cut layout adjustments | owning package only | status projection, panel resize state | package-specific status items and panels | visual layout, no stale status, resize restore |
| Design system boundary | Token/icon usage for touched layout code | existing UI design ADR | `--neko-*`, shared icons | opportunistic layout edits only | no new custom token prefixes |

## Goals / Non-Goals

**Goals:**

- Move pure informational state out of Webview chrome and into native StatusBar where it does not require interactive editor-space UI.
- Keep interactive editor controls, previews, progress UI, and spatial editor widgets inside Webviews.
- Preserve `neko-agent` as a side panel/WebviewViewProvider without changing its Webview Header/InputArea design in this change.
- Add reusable persisted resize behavior for Webview layout panels.
- Apply staged, low-risk migrations: status first, then chrome removal, then resize and Agent input refactors.
- Keep CSS token/icon cleanup scoped to touched layout code.

**Non-Goals:**

- Do not implement a full `@neko/ui` LayoutShell for every editor in this change.
- Do not migrate Agent into a CustomEditor or file-backed chat document.
- Do not move editor-bound property panels into VSCode sidebars.
- Do not change viewport command semantics, metadata transport, scene-control, or engine rendering.
- Do not perform full CSS token or icon convergence across all packages.
- Do not remove domain-specific layout differences that are justified by editor workflows, such as Canvas NodeLibrary on the left or Sketch tools on the left.

## Decisions

### Decision 1: StatusBar projection is imperative, not a VSCode `when` clause

Programmatically created `StatusBarItem`s do not support declarative `when` clauses. `visibilityCondition` is a readable business description and the implementation uses a StatusBar manager to call `show()` / `hide()` after active editor or active tab changes.

Alternative considered: register all new status items in `package.json` contribution points. Rejected because these status items are dynamic and package-specific managers already own their lifecycle.

### Decision 2: Use "pure information vs interactive UI" as the migration rule

Pure text/icon/count status, such as model selected node, object count, engine status, canvas subsystem summary, and projection state, moves to native StatusBar. Interactive UI, such as Sketch AIRunMonitor, Agent input controls, media generation parameters in Media mode, and editor-space toolbars, remains in Webview.

Alternative considered: move all status-like UI into StatusBar. Rejected because previews, progress cards, apply/discard controls, and editor-space overlays need Webview state, layout, and interaction.

### Decision 3: Agent keeps the current Webview design for this change

Agent remains a `WebviewViewProvider` surface. Tabs, New Chat, History, account chrome, session/model selectors, and generation controls stay in the Webview for this change. The attempted native Header/Input layering was rolled back because it needs a dedicated Agent redesign proposal.

Alternative considered: convert Agent to editor tabs or replace tabs with a dropdown. Rejected because Agent must remain visible beside editors and the tab row communicates parallel conversation state more efficiently than a dropdown.

### Decision 4: Agent Header/Input redesign is deferred

Agent Header slimming and Agent InputArea mode layering are removed from this change. Input layering crosses Webview state, Extension commands, QuickPick, status bar state, and failure rollback; the current Webview design remains the code authority until a separate proposal resolves the UX.

Alternative considered: refactor all Agent chrome in one PR. Rejected because the blast radius would span tab state, settings, media generation controls, SSO/account UI, and command routing.

### Decision 5: Model topbar removal is "status first, chrome second"

Model StatusBar items are created and validated before `WorkbenchTopBar` is removed. This prevents selected node/object count/engine state from disappearing during migration.

Alternative considered: remove the topbar and add status items in the same change. Rejected because rollback and visual regression analysis are easier when status projection can be tested independently.

### Decision 6: Resize persistence uses Webview state

Panel sizes use Webview `vscode.getState()` / `vscode.setState()` through an existing or thin Webview API wrapper. The state is not written to documents, workspace settings, or absolute paths.

Alternative considered: persist panel sizes to workspace settings. Rejected because panel layout is per-Webview-instance UI state and should not modify project files or global settings.

### Decision 7: Layout slot contracts are semantic first

Workbench/Studio/Conversation/Dashboard slots document semantics for future convergence but do not force an immediate shared LayoutShell component. The change aligns behavior and interfaces first, then migrates package layouts where the ADR identifies concrete wins.

Alternative considered: introduce one shared shell and migrate every editor immediately. Rejected because editor layouts have valid workflow-specific differences and full migration would couple too many packages.

## Risks / Trade-offs

- [Risk] StatusBar becomes crowded. -> Mitigation: cap each package to at most three items, hide inactive editor items, and merge related information such as selected node and object count.
- [Risk] Active editor detection for custom editors is fragile. -> Mitigation: centralize active tab/editor visibility handling and test against `TabInputCustom` paths, not only text editors.
- [Risk] Agent Webview remains space-constrained. -> Mitigation: defer Agent Header/Input redesign to a dedicated change rather than shipping the rejected native-selector design here.
- [Risk] Model status is lost during topbar removal. -> Mitigation: implement status projection before removing the topbar and do not merge those PRs.
- [Risk] Resize persistence conflicts with controlled panel state. -> Mitigation: keep `usePersistedResize` as a wrapper around existing controlled/uncontrolled resize behavior rather than replacing domain stores.
- [Risk] Layout changes introduce visual regressions. -> Mitigation: require targeted before/after screenshots or DOM size assertions for Agent, Model, Canvas, Puppet, and Cut.

## Migration Plan

1. Add shared contracts: `StatusBarItemSpec` and persisted resize state.
2. Add status projection manager behavior and tests for active editor/tab visibility.
3. Add model StatusBar items while keeping `WorkbenchTopBar`.
4. Remove `WorkbenchTopBar` after status projection is proven.
5. Move Canvas subsystem/projection status into the existing CanvasStatusBar and remove the Webview badge.
6. Keep Agent Header/InputArea unchanged and record the deferred redesign.
7. Add persisted resize to model Right Dock, Outliner/Properties split, and Timeline height.
8. Add persisted resize to puppet right panels.
9. Add Cut preview-control overflow and property-panel min/max refinements.
10. Update layout ADR/checklist notes and run targeted checks.

Rollback strategy: each package migration is independent. If a status projection or resize migration fails, restore the package-local Webview UI while retaining shared additive types. Do not revert unrelated package migrations.

## Resolved Questions

- `StatusBarItemSpec` lives beside `StatusBarGroup` in `@neko/shared/vscode/extension`, because projection is Extension-host specific and the implementation already depends on native StatusBar lifecycle.
- Agent mode/model QuickPick flows are not part of this change after rollback; the current Webview selectors remain in place until a dedicated Agent redesign is proposed.
- Model selected node, object count, and engine status remain separate StatusBar items in this change. The package stays within the three-item cap and keeps each item independently testable.
- `usePersistedResize` stores multiple keyed panel records under one Webview state namespace, `neko.resizeState`, so model and puppet panels can coexist without overwriting each other.
- Model, puppet, Canvas, and Cut verification uses targeted DOM/source assertions and resize persistence tests for this pass. Agent verification is limited to confirming the rejected Header/Input native-selector migration is absent.
