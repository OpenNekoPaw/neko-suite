## Why

Neko Suite 的 Webview 布局已经完成一轮统一，但 13 个 Webview 子包仍在基础控件、属性面板、树视图、图标和 token 上各自实现，导致交互语义、可访问性、bundle 预算和主题维护成本持续分散。`docs/architecture/adr-webview-ui-design-system.md` 已确定组件层收敛方向，现在需要把 ADR 转成可实施、可验收的 OpenSpec 变更。

## What Changes

- Establish `@neko/ui` as the canonical React UI entry for Webview primitives, creative components, viewport UI, icons, hooks, and UI test utilities.
- Keep `@neko/shared` as the L0 home for DTOs, protocols, i18n, theme tokens, and non-React utilities; React components in `@neko/shared/components` become compatibility or legacy exports during migration.
- Add shadcn-source-style primitives backed by Radix where needed: Button, IconButton, Tooltip, Popover, Select, Slider, Dialog, Tabs, ContextMenu, Collapsible, ScrollArea, ToggleGroup, Progress, Badge, and EmptyState.
- Add creative UI contracts and components for PropertyPanel, PropertyGroup, PropertyRow, NumberInput, NumberSlider, ColorPicker, ColorSwatch, Keyframe controls, TreeView, AssetBrowser, and MediaTransportControls.
- Introduce discriminated-union property definitions with exhaustive adapter mapping, preview-vs-commit event semantics, and TreeView virtualization requirements for large editor data sets.
- Migrate packages through owning-package adapters so domain stores/controllers project into shared UI props without `@neko/ui` depending on feature packages.
- Apply the first adapter wave to Cut, Puppet, Model, Sketch, and Canvas, then migrate Audio, Preview, Tools, Dashboard, Market, and Story in later waves.
- Keep Agent Header/Input redesign out of this change; Agent may only consume low-risk primitives without changing conversation information architecture.
- Move token convergence forward into primitive/creative component migration, add icon convergence rules from Phase 1, and enforce a hard cutoff for new `@neko/shared/components` React UI imports after Phase 3.3.
- Add dependency-boundary, a11y, theme, adapter, bundle-delta, large TreeView, and legacy-import checks.

## Capabilities

### New Capabilities

- `webview-ui-design-system`: Defines the canonical Webview React UI package, primitive and creative component contracts, adapter migration behavior, dependency boundaries, token/icon convergence, bundle budget, and phased package migration requirements.

### Modified Capabilities

- `webview-layout-resize-primitives`: Clarify that React resize hooks and handles used by Webview UI migrate to `@neko/ui/hooks`, while `@neko/shared` may retain compatibility re-exports during the migration.

## Impact

- Shared UI packages:
  - `packages/neko-ui/src`
  - `packages/neko-types/src` or `packages/neko-shared/src` for L0 DTOs/protocols that must remain React-free
  - `packages/neko-shared/src/components` compatibility exports and deprecation markers
- First adapter wave:
  - `packages/neko-cut/packages/webview/src`
  - `packages/neko-puppet/packages/webview/src`
  - `packages/neko-model/packages/webview/src`
  - `packages/neko-sketch/packages/webview/src`
  - `packages/neko-canvas/packages/webview/src`
- Later adapter waves:
  - `packages/neko-audio/packages/webview/src`
  - `packages/neko-live/packages/webview/src`
  - `packages/neko-preview/packages/webview/src`
  - `packages/neko-tools/packages/webview/src`
  - `packages/neko-dashboard/packages/webview/src`
  - `packages/neko-market/packages/webview/src`
  - `packages/neko-story/packages/webview/src`
- Dependencies:
  - Add only the Radix primitive packages required by implemented components, measured per migration batch.
  - Avoid runtime UI libraries with independent style systems such as Ant Design, Material UI, or Mantine.
- Tests and quality gates:
  - `@neko/ui` boundary tests: no `vscode`, no `acquireVsCodeApi()`, no feature package imports.
  - Primitive tests for keyboard/a11y, focus behavior, controlled state, theme variables, and CSP-safe rendering.
  - Creative component tests for preview/commit semantics, exhaustive property mapping, edge values, keyframe states, virtualization, and adapter behavior.
  - Bundle delta reporting for each Radix/shadcn primitive migration, with 20KB gzipped per primitive as the default review threshold.
  - Legacy import and icon/token checks after Phase 3.3.
