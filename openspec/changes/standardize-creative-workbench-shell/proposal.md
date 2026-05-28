## Why

Creative editor Webviews currently repeat layout chrome and disagree on where tool buttons live. This causes horizontal toolbar drift, duplicated panel visibility logic, and status information split between Webview chrome and VSCode-native UI.

This change standardizes the creative Workbench layout contract so each editor can keep domain-specific controls while sharing the same structural responsibilities: left rail, main panel, right inspector, and VSCode StatusBar.

## What Changes

- Add a `creative-workbench-shell` capability for creative editor Webviews.
- Define the canonical creative Workbench structure:
  - left toolbar for common/global actions and visibility toggles;
  - main panel for the primary creative surface and its domain controls;
  - right panel for properties, inspectors, tree/section tabs, and local panel state;
  - VSCode native StatusBar for passive status and editor-wide state.
- Cover the first migration scope explicitly: `neko-cut`, `neko-canvas`, `neko-audio`, `neko-puppet`, `neko-model`, and `neko-sketch`.
- Remove package-specific horizontal toolbar rows by classifying each button by responsibility. `neko-cut` timeline controls are the explicit exception because they are part of the timeline control component; non-Cut command rows move their common commands to the left toolbar or local controls to the right panel.
- Allow different main-panel archetypes while keeping the same shell contract:
  - preview + timeline, such as `neko-cut`, with timeline controls in the main panel and left toolbar visibility toggles;
  - viewport + timeline surfaces, such as `neko-model` and `neko-puppet`, with common viewport commands in the left toolbar and properties in the right panel;
  - waveform/timeline + transport surfaces, such as `neko-audio`, with analysis/spectrum commands in the left toolbar and effect/export/recording controls in the right panel;
  - canvas/painting surface + tool overlays or fixed tool rails, such as `neko-canvas` and `neko-sketch`.
- Add shared `@neko/ui` shell primitives or contracts only where they reduce duplication without importing package domain logic.
- Update layout documentation and tests so future buttons are reviewed by responsibility instead of visual convenience.

## Capabilities

### New Capabilities

- `creative-workbench-shell`: Defines the creative editor Webview shell, slot ownership, button placement rules, package coverage, and StatusBar boundary for Cut, Canvas, Audio, Puppet, Model, and Sketch.

### Modified Capabilities

- `webview-ui-design-system`: Add shared shell primitives/contracts as part of the canonical `@neko/ui` Webview UI surface without weakening existing package boundary rules.

## Impact

- Shared UI:
  - `packages/neko-ui/src`
  - `packages/neko-ui/src/primitives`
  - `packages/neko-ui/src/hooks`
- Creative editor Webviews:
  - `packages/neko-cut/packages/webview/src`
  - `packages/neko-canvas/packages/webview/src`
  - `packages/neko-audio/packages/webview/src`
  - `packages/neko-puppet/packages/webview/src`
  - `packages/neko-model/packages/webview/src`
  - `packages/neko-sketch/packages/webview/src`
- Extension status projection where editor status belongs in VSCode native UI:
  - existing package extension status bar managers/providers as applicable.
- Documentation:
  - `docs/architecture/adr-webview-layout-unification.md`
  - package README or architecture notes when user-visible layout behavior changes.
- Tests:
  - shared shell contract tests;
  - per-package source/DOM assertions for slot placement;
  - status bar boundary checks;
  - package-level Webview type checks and focused component tests.
