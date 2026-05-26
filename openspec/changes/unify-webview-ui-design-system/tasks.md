## 1. Baseline And Boundaries

- [x] 1.1 Inspect the current `packages/neko-ui` exports and document which viewport exports must remain behavior-compatible.
- [x] 1.2 Add or update `@neko/ui` public subpaths for `viewport`, `primitives`, `creative`, `icons`, `hooks`, and `test-utils`.
- [x] 1.3 Add dependency-boundary tests proving `@neko/ui` does not import `vscode`, call `acquireVsCodeApi()`, import Node-only modules, or import feature packages.
- [x] 1.4 Confirm `@neko/shared` main entry remains React-free and add a regression test if no equivalent check exists.
- [x] 1.5 Add a migration note or exemption-list scaffold for legacy `@neko/shared/components` React UI imports.
- [x] 1.6 Add theme/a11y test helpers under `@neko/ui/test-utils` for focus, keyboard, aria, and token assertions.
- [x] 1.7 Add a bundle delta measurement command or script note that can be reused by each Webview package migration.

## 2. Existing UI Compatibility Exports

- [x] 2.1 Re-export existing `@neko/ui/viewport` components through the new public entry without changing viewport behavior.
- [x] 2.2 Move or re-export `useResizable`, `usePersistedResize`, `useDrag`, and `useFileDrop` from `@neko/ui/hooks` while preserving compatibility from `@neko/shared/components`.
- [x] 2.3 Move or re-export `ResizeHandle` from the canonical `@neko/ui` surface while preserving untouched legacy imports.
- [x] 2.4 Add deprecation markers or migration comments to `@neko/shared/components` React UI exports without breaking existing consumers.
- [x] 2.5 Add tests proving legacy `@neko/shared/components` resize imports still work during migration and new imports resolve from `@neko/ui`.

## 3. Primitive Components

- [x] 3.1 Add shared `cn`/variant utilities for `@neko/ui` primitives using existing repo conventions.
- [x] 3.2 Implement `Button` and `IconButton` with variants, sizes, density, disabled state, focus-visible styling, and aria-label support.
- [x] 3.3 Implement `Tooltip` with keyboard/focus behavior and replace HTML `title` usage only in touched migrated controls.
- [x] 3.4 Implement `Select` with controlled value, disabled options, keyboard navigation, and VSCode/Neko token styling.
- [x] 3.5 Implement `Slider` with controlled value, min/max/step, keyboard support, disabled state, and aria value metadata.
- [x] 3.6 Implement `Popover` with focus management, escape handling, controlled/open callbacks, and token styling.
- [x] 3.7 Implement `Dialog`, `Tabs`, and `ContextMenu` primitives with a11y behavior and no runtime UI-kit dependency.
- [x] 3.8 Implement `Collapsible`, `ScrollArea`, and `ToggleGroup` primitives with compact Webview styling.
- [x] 3.9 Implement `Progress`, `Badge`, and `EmptyState` primitives for later Dashboard/Market/Tools migration.
- [x] 3.10 Add primitive tests for keyboard paths, disabled state, focus-visible, aria roles/labels, controlled props, and theme tokens.
- [x] 3.11 Record gzip bundle delta for each Radix-backed primitive batch and document any primitive above 20KB gzipped.

## 4. Icons And Token Guardrails

- [x] 4.1 Create `@neko/ui/icons` categories for media, navigation, actions, status, and editor controls from existing shared icons.
- [x] 4.2 Add codicon mapping helpers or documentation for controls that should use VSCode codicons instead of SVG components.
- [x] 4.3 Add a check that touched migrated control components do not introduce new business-package inline SVG or Unicode glyph icons.
- [x] 4.4 Add a check or source assertion that new `@neko/ui` CSS/Tailwind styles use `--neko-*` or VSCode variables instead of new package-specific token prefixes.
- [x] 4.5 Add a migration note format for adapter-local temporary token aliases and their target `--neko-*` mapping.

## 5. Creative Contracts

- [x] 5.1 Define React-free L0 property DTOs or colocated UI-safe types for `PropertyOption` and per-kind `PropertyDefinition`.
- [x] 5.2 Define `NumberPropertyDefinition`, `SliderPropertyDefinition`, `TextPropertyDefinition`, `ColorPropertyDefinition`, `BooleanPropertyDefinition`, and `SelectPropertyDefinition`.
- [x] 5.3 Add `assertNever` or equivalent exhaustive mapping test utilities for package adapters.
- [x] 5.4 Define `PropertyPanel`, `PropertyGroup`, and `PropertyRow` props with controlled values and render override extension points.
- [x] 5.5 Define preview/commit/reset/keyframe callback semantics for creative property controls.
- [x] 5.6 Define `TreeViewItem` and TreeView state props for selection, expansion, visibility, lock state, rename affordance, and drag UI.
- [x] 5.7 Define TreeView virtualization or replaceable renderer contract for 200+ visible items.
- [x] 5.8 Define shared keyframe control props without importing Cut, Model, Puppet, Sketch, or Canvas stores.

## 6. Creative Components

- [x] 6.1 Implement `NumberInput` with typed numeric parsing, min/max/step/unit behavior, disabled state, and preview/commit events.
- [x] 6.2 Implement `NumberSlider` by composing `Slider` and numeric value display without owning domain state.
- [x] 6.3 Implement `ColorSwatch` and `ColorPicker` with string color value, optional alpha, disabled state, and preview/commit events.
- [x] 6.4 Implement `PropertyPanel`, `PropertyGroup`, and `PropertyRow` with compact editor styling and keyframe affordance slots.
- [x] 6.5 Implement `KeyframeToggle` or `KeyframeButton` using shared icon and tooltip primitives.
- [x] 6.6 Implement `TreeView` small-list DOM rendering with keyboard navigation, selected/expanded/visible/locked states, and stable item ids.
- [x] 6.7 Implement TreeView virtualization path for 200+ visible items.
- [x] 6.8 Implement initial `AssetBrowser` contract and shell only if needed by migrated packages; otherwise keep it as a documented P2 placeholder.
- [x] 6.9 Implement initial `MediaTransportControls` contract and shell only if needed by migrated packages; otherwise keep it as a documented P2 placeholder.
- [x] 6.10 Add creative component tests for edge values, preview/commit separation, keyframe toggles, exhaustive mapping, theme tokens, and 500 visible TreeView items.

## 7. Cut Proof Point

- [x] 7.1 Inventory Cut Inspector/Form components, existing property-like definitions, undo behavior, keyframe metadata, and token usage.
- [x] 7.2 Add Cut adapter mapping domain state into `PropertyDefinition` values with exhaustive `switch` coverage.
- [x] 7.3 Migrate Cut `PropertyPanel`, `PropertyRow`, number inputs, color inputs, and select inputs to shared creative components.
- [x] 7.4 Preserve Cut preview/commit behavior so live scrubbing does not write undo history and committed changes do.
- [x] 7.5 Map touched Cut `--nk-*` tokens to `--neko-*` or adapter-local aliases with documentation.
- [x] 7.6 Replace touched Cut inline control icons with `@neko/ui/icons` or codicon mapping.
- [x] 7.7 Add Cut adapter tests for property mapping, preview/commit, undo boundary, keyframe state, disabled state, and rollback-safe behavior.
- [x] 7.8 Record Cut Webview bundle delta after the first primitive/creative migration.
- [x] 7.9 Run and document the Phase 3.1 PropertyPanel contract review gate before starting Model/Puppet migration.

## 8. Puppet And Model Migration

- [x] 8.1 Inventory Puppet `ParameterPanel`, `FaceParameterSection`, node tree, animation controls, token usage, and local glyph/icon usage.
- [x] 8.2 Add Puppet adapters for parameter sliders, reset controls, keyframe controls, and node tree values.
- [x] 8.3 Migrate Puppet parameter/face sliders and reset buttons to shared creative/primitives after Cut contract review.
- [x] 8.4 Migrate Puppet node tree to shared TreeView with virtualization tests when visible item count reaches the large-list path.
- [x] 8.5 Inventory Model `TransformPanel`, `FaceParameterSlider`, `SceneTree`, token usage, and local icons.
- [x] 8.6 Add Model adapters for transform properties, face sliders, and scene tree items.
- [x] 8.7 Migrate Model transform and face controls to shared NumberInput, NumberSlider, PropertyPanel, and keyframe controls.
- [x] 8.8 Migrate Model SceneTree to shared TreeView and add 500 visible item rendering, keyboard, and selection tests.
- [x] 8.9 Record Puppet and Model bundle deltas and token/icon mappings.

## 9. Sketch And Canvas Migration

- [x] 9.1 Inventory Sketch tool parameter panels, LayerPanel, toolbar controls, inline SVG, and `--sketch-*` tokens.
- [x] 9.2 Add Sketch adapters for tool parameters, layer tree items, color/size controls, and keyframe-compatible metadata where applicable.
- [x] 9.3 Migrate Sketch tool parameter controls and LayerPanel to shared creative components and TreeView.
- [x] 9.4 Add Sketch 500 visible item TreeView tests for rendering, keyboard navigation, and selection state.
- [x] 9.5 Inventory Canvas property panel, node/library lists, toolbar controls, local tokens, and context menu usage.
- [x] 9.6 Add Canvas adapters for property panel values, node/library list items, and toolbar controls.
- [x] 9.7 Migrate Canvas property panel, node/library list, and touched toolbar controls to shared primitives/creative components.
- [x] 9.8 Record Sketch and Canvas bundle deltas and token/icon mappings.
- [x] 9.9 Mark Phase 3.3 complete only after Sketch and Canvas migrated controls pass adapter and visual/source assertions.

## 10. Shared Import Cutoff

- [x] 10.1 Add an automated check that prevents new or modified Webview UI from adding React UI imports from `@neko/shared/components` after Phase 3.3.
- [x] 10.2 Populate the legacy import exemption list with owner, package, reason, and target removal phase for any remaining references.
- [x] 10.3 Update package documentation or migration notes to state that new Webview UI must import from `@neko/ui`.
- [x] 10.4 Confirm compatibility re-exports remain only for untouched legacy packages or explicitly exempted adapters.

## 11. Later Package Waves

- [x] 11.1 Migrate Audio transport, range/select controls, mixer/effects controls, and touched icons to shared primitives where behavior remains equivalent.
- [x] 11.2 Migrate Live bottom controls, tracking panel form controls, and recording badge to shared primitives without changing compositor/viewport authority.
- [x] 11.3 Migrate Preview viewer tabs, sliders, video/audio controls, document context menu, and preview tokens to shared UI entries.
- [x] 11.4 Migrate Tools diff controls, range/select/button controls, progress overlays, and token mappings to shared primitives.
- [x] 11.5 Migrate Dashboard cards, task table controls, filters, and buttons to shared primitives and dashboard-safe components.
- [x] 11.6 Migrate Market search, tabs, filter dropdown, asset card controls, detail dialog, and large asset picker to shared primitives/creative shells.
- [x] 11.7 Migrate Story tabs, table actions, context menu, and touched inline styles to shared primitives.
- [x] 11.8 Record bundle deltas and token/icon mappings for each later package wave.

## 12. Agent Guardrail

- [x] 12.1 Add a regression check that this change does not alter Agent Header/Input layout, conversation tabs, selectors, account flows, slash commands, mentions, or media model controls.
- [x] 12.2 If Agent consumes any shared primitive, verify the change is limited to appearance/a11y and does not change information architecture.
- [x] 12.3 Document any future Agent Header/Input redesign need as a separate proposal rather than extending this change.

## 13. Cleanup And Verification

- [x] 13.1 Remove non-exempt legacy `@neko/shared/components` React UI imports after the cutoff.
- [x] 13.2 Audit token mappings completed during Phase 1/2/3 and patch any touched component still introducing package-specific token prefixes.
- [x] 13.3 Audit icon convergence and remove newly touched inline SVG or Unicode glyph control icons from business packages.
- [x] 13.4 Run `@neko/ui` tests for boundaries, primitives, creative components, TreeView virtualization, and test utilities.
- [x] 13.5 Run targeted Webview package tests for Cut, Puppet, Model, Sketch, Canvas, and later migrated packages.
- [x] 13.6 Run `pnpm check` or narrower package checks covering `@neko/ui`, shared compatibility exports, and touched Webview packages.
- [x] 13.7 Verify no Webview imports `vscode` or Node-only APIs and no Extension-side code imports React as part of the migration.
- [x] 13.8 Update `docs/architecture/adr-webview-ui-design-system.md` with implementation status, cutoff outcome, and any resolved TreeView/bundle measurement choices.
- [x] 13.9 Summarize bundle delta results, legacy exemptions, remaining P2 components, and rollback notes before marking the change complete.
