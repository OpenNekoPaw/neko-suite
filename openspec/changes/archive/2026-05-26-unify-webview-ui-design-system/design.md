## Context

`docs/architecture/adr-webview-layout-unification.md` has already moved Neko Suite through a first layout migration pass. Model, Canvas, Puppet, and Cut now have clearer layout/status/resize direction, and the attempted Agent Header/Input native layering has been rolled back. The remaining cross-Webview fragmentation is at the UI component layer: 13 Webview packages still maintain local primitives, inspector rows, property inputs, tree/list behavior, icons, and package-specific token namespaces.

`docs/architecture/adr-webview-ui-design-system.md` is the architectural source for this change. It defines `@neko/ui` as the canonical React UI entry, returns `@neko/shared` to L0 responsibilities, and uses owning-package adapters to keep feature stores out of shared UI. The repo already has a partial `@neko/ui/viewport` surface, while `@neko/shared/components` still owns `MacButton`, `MacSlider`, `MacTabs`, `ContextMenu`, `CollapsibleSection`, `ResizeHandle`, timeline/keyframe primitives, and Webview hooks.

Five-layer analysis:

| Layer | Responsibility | Dependency Boundary | Interface | Extension Point | Test Focus |
|-------|----------------|--------------------|-----------|-----------------|------------|
| L0 Contracts | React-free DTOs, protocol shapes, theme/i18n utilities | No React/DOM, no Webview/VSCode runtime | property/tree DTOs, viewport/menu DTOs | new DTO fields and schema fixtures | type tests, serialization, exhaustive mapping |
| L1 Host integration | VSCode StatusBar, commands, Webview lifecycle | Extension Host only, no React | existing status/command managers | owning package managers | no Webview direct VSCode access |
| L2 Primitives | Button, Select, Slider, Tooltip, Popover, Dialog, Tabs, Menu | React/DOM only, no `vscode` import | `@neko/ui/primitives` | variant, size, density, a11y behavior | keyboard, focus, theme variables, CSP |
| L2 Creative UI | PropertyPanel, NumberInput, ColorPicker, TreeView, Keyframe controls | primitives + L0 DTOs only | `@neko/ui/creative` | adapter-provided render overrides | preview/commit, edge values, virtualization |
| Package adapters | Project domain state into shared UI props | owning package only | Cut/Model/Puppet/Sketch/Canvas adapters | package-specific mapping and overrides | behavior parity, rollback, bundle deltas |

This change is UI-system work, not engine work. It must not move scene-control, viewport transport, media calculation, or engine authority into React components.

## Goals / Non-Goals

**Goals:**

- Make `@neko/ui` the canonical React UI entry for Webview primitives, creative components, viewport UI, icons, hooks, and UI test utilities.
- Keep `@neko/shared` host-neutral at the main entry and keep React UI out of the L0 surface.
- Introduce Radix-backed shadcn-source-style primitives only where they provide meaningful a11y/focus/menu behavior.
- Define creative component contracts for inspector/form/tree workflows, including discriminated property definitions and preview/commit semantics.
- Migrate packages through adapters owned by each package, starting with Cut as the proof point and then Puppet/Model/Sketch/Canvas.
- Enforce dependency boundaries, token/icon convergence, bundle budgets, TreeView virtualization, and hard cutoff rules as tests or review gates.
- Preserve existing package workflows unless the migration explicitly replaces a local primitive with an equivalent shared component.

**Non-Goals:**

- Do not redesign Agent Header/Input, session/model selectors, account chrome, media model selection, slash commands, or conversation information architecture.
- Do not force all Webviews into one layout shell or remove domain-specific layouts.
- Do not move engine calculations, media transforms, scene graph authority, or viewport semantic control flow into `@neko/ui`.
- Do not replace React/Tailwind/Vite or introduce a runtime UI framework with an independent theme system.
- Do not migrate every dashboard/market/story surface before the Cut/Puppet/Model/Sketch/Canvas adapter proof points are validated.
- Do not remove `@neko/shared/components` compatibility exports until the migration cutoff and exemption list are in place.

## Decisions

### Decision 1: `@neko/ui` is the canonical React UI entry

`@neko/ui` owns Webview React components and exports them through stable subpaths:

| Export | Responsibility |
|--------|----------------|
| `@neko/ui` | curated stable entry for common Webview UI |
| `@neko/ui/viewport` | existing viewport shell, overlay, toolbar, diagnostics helpers |
| `@neko/ui/primitives` | base controls such as Button, Select, Slider, Tooltip, Dialog, Tabs |
| `@neko/ui/creative` | PropertyPanel, NumberInput, ColorPicker, TreeView, Keyframe, media controls |
| `@neko/ui/icons` | shared icon components and codicon mapping helpers |
| `@neko/ui/hooks` | React/Webview hooks such as resize, drag, file drop |
| `@neko/ui/test-utils` | boundary, a11y, interaction, and adapter test helpers |

Alternative considered: continue expanding `@neko/shared/components`. Rejected because `@neko/shared` is also the L0 home for DTOs/protocols and should not become the canonical React/DOM layer.

### Decision 2: `@neko/shared` remains L0 at its main entry

`@neko/shared` keeps DTOs, i18n, theme utilities, errors, and non-React helpers. React-dependent code remains behind compatibility subpaths during migration and is gradually re-exported or deprecated in favor of `@neko/ui`.

Alternative considered: split all shared UI into a new package immediately and remove compatibility exports. Rejected because 13 packages need a staged migration with rollback room.

### Decision 3: Primitives use shadcn source style and Radix selectively

The first primitive wave uses local source files styled with Neko tokens. Radix primitives are introduced only for behavior-heavy controls such as Tooltip, Popover, Select, Slider, Dialog, ContextMenu, Tabs, Collapsible, ScrollArea, and ToggleGroup. The implementation must not import a prebuilt runtime UI kit.

Alternative considered: adopt Ant Design, Material UI, Mantine, or another full component library. Rejected because of bundle size, independent theme systems, CSP risk, and mismatch with VSCode/Tailwind token integration.

### Decision 4: New components consume `--neko-*` and VSCode theme variables

Every new primitive and creative component consumes `--neko-*` or VSCode theme variables. Package-specific token prefixes such as `--nk-*`, `--sketch-*`, `--model-*`, or `--tools-*` can exist only as adapter-local compatibility aliases during migration.

Alternative considered: complete all token cleanup in a final phase. Rejected because delayed token cleanup causes broad rewrite churn after components are already migrated.

### Decision 5: Icons converge from Phase 1

New or migrated control icons must come from `@neko/ui/icons` or a documented codicon mapping. Business packages must not add new inline SVG or Unicode glyph icons for controls.

Alternative considered: run icon convergence only in cleanup. Rejected because each migrated component would otherwise create fresh local icon debt.

### Decision 6: Property definitions are discriminated unions

`PropertyDefinition` is a union of per-kind types such as number, slider, text, color, boolean, and select. Adapters map with exhaustive `switch` handling and an `assertNever` path so that adding a new kind fails compilation or tests until all adapters cover it.

Alternative considered: a single interface with `kind` and many optional fields. Rejected because it cannot guarantee that select options, numeric bounds, color alpha, or boolean values are present for the correct control type.

### Decision 7: Inspector events separate preview from commit

Creative inputs emit `onPreviewChange` for drag/typing previews that must not write undo history, and `onCommit` for blur, pointerup, Enter, or confirmed selection that should enter package-owned undo history. `onReset` and `onToggleKeyframe` remain callbacks into package stores.

Alternative considered: one `onChange` event. Rejected because Cut/Model/Puppet/Sketch workflows need different behavior for live preview, undo, and keyframe state.

### Decision 8: TreeView supports large visible item sets by design

TreeView renders direct DOM for small lists and exposes a virtualization/windowing strategy for `>= 200` visible items. Model, Sketch, and Puppet migrations require 500-visible-item tests for rendering, keyboard navigation, and selection state.

Alternative considered: implement TreeView as a simple recursive DOM tree first. Rejected because SceneTree and LayerPanel can grow large enough that retrofitting virtualization would destabilize keyboard/focus behavior.

### Decision 9: Package adapters own domain mapping

`@neko/ui` accepts DTOs, values, callbacks, and render override hooks. It never imports feature packages. Cut, Model, Puppet, Sketch, Canvas, and later packages own adapters that map domain stores/controllers to UI props.

Alternative considered: add domain-specific helpers into `@neko/ui`. Rejected because it would create reverse dependencies and turn shared UI into a business aggregation layer.

### Decision 10: Cut is the first creative adapter proof point

Cut migrates Inspector/Form first because it already has property-like declarations and exposes the full preview/commit/undo/keyframe pressure on the contract. Phase 3.1 must end with a contract review gate before Model/Puppet migration starts.

Alternative considered: start with Model/Puppet tree or dashboard controls. Rejected because those paths would not validate the highest-risk PropertyPanel contract early enough.

### Decision 11: Agent remains explicitly isolated

Agent may consume low-risk primitives for appearance or a11y only. Header/Input redesign, conversation tabs, selectors, account flows, slash commands, mentions, and media model controls require a separate proposal.

Alternative considered: include Agent in the first migration to maximize UI consistency. Rejected because the layout unification work already proved that Agent’s information architecture needs a dedicated design pass.

### Decision 12: Bundle budget is a migration gate

Every Radix/shadcn primitive migration records affected Webview gzip bundle deltas. The default review threshold is 20KB gzipped per primitive. Exceeding the threshold requires rationale and evaluation of lazy import, adapter split, or retaining a local implementation.

Alternative considered: measure only final bundle size. Rejected because cumulative per-primitive cost is harder to attribute after multiple packages migrate.

### Decision 13: `@neko/shared/components` receives a hard cutoff

After Phase 3.3, new or modified Webview UI must import React components from `@neko/ui`, except for documented legacy exemptions and compatibility re-exports. Phase 4 removes non-exempt legacy imports.

Alternative considered: leave the old entry available indefinitely. Rejected because two canonical React UI surfaces would keep the maintenance burden alive.

## Risks / Trade-offs

- [Risk] `@neko/ui` becomes a business aggregation layer. -> Mitigation: boundary tests reject feature-package imports and all domain mapping stays in owning-package adapters.
- [Risk] Radix packages increase Webview bundle size. -> Mitigation: import by primitive, record gzip bundle deltas per batch, and gate any primitive above 20KB gzipped.
- [Risk] PropertyPanel contract overfits Cut. -> Mitigation: use Cut as the first proof point, then run a contract review gate before Model/Puppet migration.
- [Risk] TreeView virtualization complicates keyboard/focus behavior. -> Mitigation: design virtualization from the first TreeView contract and require 500 visible item tests before Model/Sketch/Puppet migration.
- [Risk] Token/icon cleanup expands the change scope. -> Mitigation: only require mapping for touched components/adapters and reserve untouched package cleanup for later batches.
- [Risk] Two UI entries coexist for too long. -> Mitigation: set Phase 3.3 cutoff, add legacy import checks, and require exemption records.
- [Risk] Agent consistency lags other packages. -> Mitigation: allow low-risk primitive consumption only and keep Agent redesign in a dedicated future change.
- [Risk] A11y regressions are introduced by wrapper components. -> Mitigation: primitive tests cover roles, labels, keyboard paths, focus-visible, disabled states, and focus traps where relevant.

## Migration Plan

1. Establish `@neko/ui` package boundaries, public exports, dependency-boundary tests, and theme/a11y test utilities.
2. Move or re-export existing viewport UI without behavioral changes.
3. Add primitives in batches: Button/IconButton/Tooltip, Select/Slider/Popover, Dialog/Tabs/ContextMenu, Collapsible/ScrollArea/ToggleGroup, then Progress/Badge/EmptyState.
4. During every primitive batch, map touched styles to `--neko-*` or VSCode variables, report bundle delta, and route new icons through `@neko/ui/icons`.
5. Add creative contracts and components: NumberInput, NumberSlider, ColorPicker, ColorSwatch, PropertyPanel, PropertyGroup, PropertyRow, Keyframe controls, and TreeView.
6. Validate Cut Inspector/Form adapter and run the Phase 3.1 contract review gate.
7. Migrate Puppet and Model Parameter/Transform/Tree adapters after contract review.
8. Migrate Sketch and Canvas panel/list/toolbar controls, then freeze new `@neko/shared/components` React UI imports.
9. Migrate Audio, Preview, Tools, Dashboard, Market, and Story primitives in later waves.
10. Run cleanup: remove non-exempt legacy imports, audit token mappings, finish icon convergence, and run a11y/bundle/boundary checks.

Rollback strategy: keep old package-local components and `@neko/shared/components` compatibility exports until each owning package adapter is verified. If a package adapter fails, revert that package’s adapter usage while retaining additive `@neko/ui` primitives and contracts. Do not roll back unrelated package migrations.

## Open Questions

Resolved before implementation:

- `PropertyDefinition` uses per-kind discriminated union types rather than a single optional-field interface.
- Token convergence starts in Phase 1/2 and Phase 4 is only an audit.
- `@neko/shared/components` receives a hard cutoff after Phase 3.3.
- TreeView must support virtualization before large Model/Sketch/Puppet migrations.
- Agent Header/Input redesign is out of scope.

To confirm during implementation:

- Whether TreeView virtualization uses `react-window`, an internal windowing helper, or an equivalent package already present in the repo.
- The exact bundle measurement command used per Webview package, so bundle delta reports are comparable across batches.
- The exemption-list file or section that records any remaining legacy `@neko/shared/components` React UI imports after Phase 3.3.
