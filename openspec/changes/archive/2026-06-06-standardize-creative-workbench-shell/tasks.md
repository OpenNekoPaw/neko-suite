## 1. Shared Shell Contract

- [x] 1.1 Add `CreativeWorkbenchShell` slot types and minimal shell primitives in `@neko/ui` without importing feature packages or VSCode APIs.
- [x] 1.2 Add left rail action types that distinguish `common-action` from `visibility-toggle` and forward accessible control state.
- [x] 1.3 Add main-panel control layer helpers for overlay, transport, timeline-header, and contextual placements.
- [x] 1.4 Add shared boundary tests proving the shell primitives are host-neutral and feature-package-free.

## 2. Model / Puppet / Audio Migration

- [x] 2.1 Migrate `neko-model` to the shared shell contract while moving viewport command buttons into the left toolbar and keeping timeline surfaces in the main panel.
- [x] 2.2 Adjust `neko-model` left toolbar toggles so they show/hide main-panel controls instead of hiding domain surfaces incorrectly.
- [x] 2.3 Migrate `neko-puppet` to the shared shell contract and move puppet viewport command buttons into the left toolbar.
- [x] 2.4 Migrate `neko-audio` to the shared shell contract and move analysis/spectrum command buttons into the left toolbar while keeping transport/waveform/display surfaces in the main panel.
- [x] 2.5 Add focused tests for Model, Puppet, and Audio left toolbar responsibility, main-panel surface placement, and right-panel ownership.

## 3. Cut / Canvas / Sketch Migration

- [x] 3.1 Align `neko-cut` with the shared shell contract while preserving preview/timeline surfaces and keeping timeline controls in the main panel.
- [x] 3.2 Add or update Cut tests proving timeline controls remain in the timeline main panel and property controls remain in the right panel.
- [x] 3.3 Migrate `neko-canvas` to the shared shell contract without changing its canvas-first interaction model, right NodeLibrary, or right-anchored floating panels.
- [x] 3.4 Migrate `neko-sketch` to the shared shell contract while preserving the drawing primary tool rail and right layer/brush/property panels.
- [x] 3.5 Add focused tests for Canvas and Sketch proving allowed left-rail primary tools, main-panel canvas controls, and right-inspector placement.

## 4. StatusBar Boundary

- [x] 4.1 Audit passive status in the six covered packages and record which values are already projected to VSCode StatusBar.
- [x] 4.2 Remove or prevent duplicate Webview chrome for passive status values when native StatusBar projection exists.
- [x] 4.3 Add source or unit assertions for package StatusBar boundaries, including active-editor visibility where applicable.

## 5. Documentation And Guardrails

- [x] 5.1 Update `docs/architecture/adr-webview-layout-unification.md` with the creative Workbench shell contract and the six-package scope.
- [x] 5.2 Update package README or architecture notes for user-visible shell changes.
- [x] 5.3 Add guardrail documentation for future button placement decisions: left toolbar, Cut/main panel controls, right panel, or StatusBar.

## 6. Verification

- [x] 6.1 Run `pnpm --dir packages/neko-ui exec tsc --noEmit` and relevant `@neko/ui` tests.
- [x] 6.2 Run targeted Webview type checks for `neko-cut`, `neko-canvas`, `neko-audio`, `neko-puppet`, `neko-model`, and `neko-sketch`.
- [x] 6.3 Run focused package component/source tests added or updated by this migration.
- [x] 6.4 Run `git diff --check`.
- [x] 6.5 Capture DOM/source or screenshot evidence for the six package shell responsibilities before marking the change complete.
