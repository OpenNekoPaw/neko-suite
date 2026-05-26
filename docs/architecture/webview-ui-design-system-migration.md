# Webview UI Design System Migration Notes

Updated: 2026-05-26

This file tracks the migration from `@neko/shared/components` React UI exports to the canonical `@neko/ui` Webview UI surface.

## Canonical Entrypoints

| Need | Import from |
|------|-------------|
| Viewport shell, overlays, toolbar | `@neko/ui/viewport` |
| Primitive UI controls | `@neko/ui/primitives` |
| Creative editor controls and DTOs | `@neko/ui/creative` |
| Icons and codicon mappings | `@neko/ui/icons` |
| React/Webview hooks | `@neko/ui/hooks` |
| UI tests and assertions | `@neko/ui/test-utils` |

## Legacy Import Exemptions

Phase 3.3 introduces the hard cutoff for new or modified React UI imports from `@neko/shared/components`.
Phase 3.4+ Webview UI changes must import shared React UI from `@neko/ui`, `@neko/ui/primitives`, `@neko/ui/creative`, `@neko/ui/viewport`, `@neko/ui/icons`, or `@neko/ui/hooks`.
Any remaining `@neko/shared/components` reference must stay in this exemption table and in the automated allowlist test at `packages/neko-ui/src/__tests__/legacy-shared-components-imports.test.ts`.

| Package | Owner | Legacy import | Reason | Target removal |
|---------|-------|---------------|--------|----------------|
| `@neko/ui` | UI platform | `hooks/index.ts`, `primitives/resize-handle.ts`, `hooks/hooks-compat.test.ts` re-export or verify resize/drag/file-drop compatibility | Compatibility bridge required while `@neko/shared/components` remains valid for untouched packages | Keep until Phase 4 removes or redirects every legacy consumer |
| Agent Webview | Agent package | `components/ChatView/DropZone.tsx` | File-drop hook compatibility only; Agent Header/Input and information architecture remain explicitly out of scope | Separate Agent-safe primitive pass or dedicated Agent redesign proposal |

Compatibility re-exports are allowed only in the `@neko/ui` bridge files listed above, in `@neko/shared/components` itself, or in explicitly exempted legacy package files. New adapters and any modified Webview UI must depend on `@neko/ui` instead.

## Temporary Token Alias Format

When an adapter still needs a package-local token during migration, record the alias here or in the package migration PR.

| Package | Local token | Target token | Scope | Removal target |
|---------|-------------|--------------|-------|----------------|
| Cut | `--nk-input-bg`, `--nk-input-fg`, `--nk-input-border` | VSCode input variables + `--neko-border` used by shared `PropertyPanel`, `NumberInput`, `ColorPicker`, and `Select` | Core PropertyPanel rows migrated in 7.3 | Phase 4 audit |
| Cut | `--nk-accent` | `--neko-accent` | Shared sliders, checkbox accents, keyframe button state | Phase 4 audit |
| Cut | `--nk-fg-secondary`, `--nk-border`, `--nk-bg-hover` | VSCode description/list variables + `--neko-border` / `--neko-hover` | Shared row labels and hover states | Phase 4 audit |
| Puppet | `--sketch-*` panel shell tokens | Shared `PropertyPanel`, `NumberSlider`, and `TreeView` use VSCode variables + `--neko-*`; outer `sketch-panel` shell remains package-owned | Parameter sliders, face parameters, reset controls, and node tree migrated in 8.3/8.4 | Phase 4 audit |
| Model | `--model-fg`, `--model-fg-secondary`, `--model-divider` shell tokens | Shared `PropertyPanel`, `NumberSlider`, and `TreeView` use VSCode variables + `--neko-*`; panel headers/footers remain package-owned | Transform fields, face sliders, category chevron, and SceneTree rows migrated in 8.7/8.8 | Phase 4 audit |
| Sketch | `--sketch-*` panel shell tokens | Shared `PropertyPanel`, `NumberSlider`, `ColorPicker`, `TreeView`, `Popover`, `ContextMenu`, `Button`, and `IconButton` use VSCode variables + `--neko-*`; outer `sketch-panel` shell remains package-owned | Brush tool parameters, stamp asset actions, layer tree, layer row actions, and adjustment popover migrated in 9.2/9.3 | Phase 4 audit |
| Canvas | `--toolbar-*`, `--control-*`, `--panel-*` adapter aliases | Shared `PropertyPanel`, `NumberInput`, `TreeView`, `Collapsible`, and `Button` use VSCode variables + `--neko-*`; Canvas local aliases remain package-owned around viewport/node chrome | PropertyPanel transform/layer/actions and NodeLibrary rows migrated in 9.6/9.7 | Phase 4 audit |
| Audio | DAW panel/timeline aliases | Transport/effects/export/recording controls, toolbar primitives, and timeline ruler now consume `@neko/ui`; timeline/menu aliases remain package-owned | 11.1 later wave controls plus timeline cleanup | Phase 4 timeline/menu audit |
| Live | VSCode dropdown/button inline tokens | TrackingPanel mode select, tracking/avatar/recording buttons, and recording badges now use shared `Select`, `Button`, and `Badge`; compositor viewport styling remains package-owned | 11.2 bottom controls and tracking panel | Phase 4 visual audit |
| Preview | Preview wrapper aliases | `shared/Mac*` wrappers now adapt to `@neko/ui/primitives`; video/audio controls and document context menu consume shared primitives/icons | 11.3 viewer controls and document context menu | Phase 4 wrapper naming cleanup |
| Tools | `--tools-*` aliases | Diff controls, audio/video seek controls, mode buttons, badges, and playback icons now consume shared primitives/icons while Tools shell aliases map to `--neko-*` | 11.4 MediaDiff controls | Phase 4 audit |
| Dashboard | Dashboard shell styles | Quick actions, workflow cards, task progress, project filters/actions, creative entity filters/actions, badges, skills, and recent activity consume shared primitives | 11.5 dashboard controls | Phase 4 audit |
| Market | Marketplace aliases | Search clear, tabs/update badge, filter dropdown, asset card actions/progress/tags, detail actions, and large asset picker controls consume shared primitives | 11.6 marketplace controls | Phase 4 audit |
| Story | Story table inline styles | Tab bar, creator status badges, primary/secondary actions, character send action, and row menu trigger/menu items consume shared primitives/icons | 11.7 story tabs/actions/menu | Phase 4 table style audit |

## P2 Creative Placeholders

| Component | Status | Reason | Activation gate |
|-----------|--------|--------|-----------------|
| `AssetBrowser` | P2 placeholder | Needs asset federation registry DTO alignment before a reusable shell is safe | First Market/Preview/Canvas package adapter requiring shared asset browsing |
| `MediaTransportControls` | P2 placeholder | Transport authority differs across Cut/Audio/Preview/Live and must stay package-owned | First package adapter with behavior-parity tests for preview/commit/playback callbacks |

## Cut PropertyPanel Inventory

| Area | Current implementation | Migration note |
|------|------------------------|----------------|
| Core property definitions | `components/PropertyPanel/PropertyPanel.tsx` defines local `{ key, labelKey, type, animatable, min, max, step, unit, options }` entries for basic, transform, text, subtitle, and audio groups | `components/PropertyPanel/adapters/sharedPropertyAdapter.ts` maps these definitions into `@neko/ui/creative` discriminated `PropertyDefinition` values |
| Input controls | `PropertyRow.tsx` and `PropertyPanel/inputs/*` render local number, range, text, checkbox, color, and select controls | 7.3 should migrate the core row path first; specialized Shape/Mask/ColorCorrection panels need separate adapters or render overrides |
| Preview behavior | `PropertyPanelInline.handleElementChange()` calls `updateElement()` as raw state update with a before snapshot | Shared adapter must keep preview as patch construction only; it must not push undo history |
| Commit / undo behavior | `PropertyPanelInline.handleElementCommit()` creates `element.update` and calls `pushOperation()` | Shared adapter tests cover patch construction; owning bridge remains responsible for history |
| Keyframes | `keyframeSlice` owns add/remove/update operations; current property row uses `KeyframeDot` and `KeyframeIndicator` | Adapter maps `hasKeyframes` / `isAtKeyframe`; `KeyframeButton` can replace row affordance during 7.3 |
| Token usage | Property panel and inputs use `--nk-*` classes/tokens from `index.css` | 7.5 should map touched row/input tokens to `--neko-*` or adapter-local aliases |
| Icon debt | `PropertyRow.tsx` has inline SVG for remove-keyframe and `KeyframeDot` uses a Unicode diamond/title | 7.6 should replace touched controls with `@neko/ui/icons`, codicons, and Tooltip |
| Rollback boundary | Existing `PropertyPanel.tsx` render path remains untouched after adapter introduction | If migration fails, revert only 7.3 UI usage while retaining tested pure adapter |

Cut 7.3 migration note: core Basic, Transform, Text, Subtitle, and Audio property rows now render through `@neko/ui/creative` `PropertyPanel` using the Cut-owned adapter. Speed, Transition, ColorCorrection, Effects, Mask, AI, and loudness controls remain package-owned until their behavior-specific adapters are designed.

Cut touched icon note: the migrated core property rows use shared `KeyframeButton` with codicon mapping and Tooltip; legacy `KeyframeDot` / remove-keyframe inline SVG remains only in untouched legacy code paths and must be removed or exempted when those paths are migrated.

## Phase 3.1 Cut Contract Review Gate

Status: Pass with follow-up constraints.

| Review item | Result |
|-------------|--------|
| Grouping | Core Basic, Transform, Text, Subtitle, and Audio groups can be represented by shared `PropertyDefinition` values while keeping Cut-owned group containers during rollout |
| Preview / commit | Component test proves range preview calls `onElementChange` only; pointer commit calls `onElementCommit` only |
| Undo boundary | Shared adapter only constructs patches; `PropertyPanelInline` remains the owner of `pushOperation(element.update)` |
| Keyframe state | Adapter maps `hasKeyframes` and `isAtKeyframe`; shared `KeyframeButton` routes add/remove through Cut callbacks |
| Token mapping | Touched core rows moved to shared VSCode / `--neko-*` token usage; legacy `--nk-*` remains for untouched panels |
| Rollback | Existing complex package-owned panels remain in place; core row migration can be reverted independently from shared `@neko/ui` additions |

Follow-up constraints before Model/Puppet migration:

- Do not expand `PropertyDefinition` for Cut-only complex panels until a second package validates the same field. Use `renderRow` or package-local panels for effects, masks, transitions, and transport-like controls.
- Re-run bundle baseline in CI or a clean dependency-installed worktree so the Cut before/after gzip delta is comparable.

## Puppet Inventory

| Area | Current implementation | Migration note |
|------|------------------------|----------------|
| Parameter sliders | `ParameterPanel.tsx` renders local `ParameterSlider` with native range input, reset button, HTML `title`, and Unicode reset glyph | Map puppet parameters to shared `slider` definitions or `NumberSlider` props; keep engine `controller.setParameter()` as package-owned commit/preview callback |
| Face parameters | `FaceParameterSection.tsx` groups `PUPPET_FACE_PARAMETERS` with local `FaceSlider` and `@neko/shared/components` `CollapsibleSection` | Adapter should preserve category grouping while replacing local slider/reset controls with shared creative primitives |
| Node tree | `PuppetNodeTree.tsx` builds parent/child hierarchy locally and renders Unicode node icons/expanders | Map `PuppetNodeSnapshot` to shared `TreeViewItem`; use codicon/icon mapping for node type hints or keep metadata package-local |
| Animation controls | `AnimationPanel.tsx` and `PuppetKeyframeTimeline.tsx`; keyframe timeline imports `KeyframeTimeline` from `@neko/ui/creative` | Treat playback controls separately from parameter migration; business controller/store adapter remains package-owned |
| Tokens/icons | `index.css` uses `--sketch-*`; components use title attributes, emoji/category icons, and Unicode glyphs | Touched controls should map to VSCode / `--neko-*` tokens and `@neko/ui/icons` or codicons |

Puppet adapter status: `components/adapters/sharedPuppetUiAdapter.ts` maps puppet parameters, native blend shapes, and puppet nodes into `@neko/ui/creative` property/tree DTOs. Adapter tests pass with `pnpm exec vitest run src/components/adapters/sharedPuppetUiAdapter.test.ts`. Full package test currently also runs the pre-existing `puppetResizeLayout.test.ts`, which fails in Vitest with `import.meta.url` not using a file URL; this is test configuration debt unrelated to the adapter.

Puppet 8.3/8.4 migration status: `ParameterPanel.tsx` now renders puppet parameters, standard face-parameter groups, native blend shape sliders, and reset buttons through shared `PropertyPanel` / `NumberSlider`. `PuppetNodeTree.tsx` now renders `mapPuppetNodesToTreeViewItems()` output with shared `TreeView`, including the 200+ item virtualization path. The old `FaceParameterSection.tsx` local `CollapsibleSection`, range inputs, emoji titles, and Unicode reset glyph were removed because no consumer remains.

Puppet token/icon note: touched parameter and tree controls now inherit shared VSCode / `--neko-*` styling from `@neko/ui`. The remaining `sketch-panel` shell tokens are panel-frame ownership and stay adapter-local until the Phase 4 token audit. Source assertion on the touched files finds no new inline SVG, reset glyph, expand glyph, or emoji control icon.

Puppet verification:

- `cd packages/neko-puppet/packages/webview && pnpm exec vitest run src/components/adapters/sharedPuppetUiAdapter.test.ts src/components/ParameterPanel.shared-ui.test.tsx src/components/PuppetNodeTree.shared-ui.test.tsx`
- `pnpm --filter @neko-puppet/webview exec tsc --noEmit`

## Model Inventory

| Area | Current implementation | Migration note |
|------|------------------------|----------------|
| Transform panel | `TransformPanel.tsx` renders local numeric fields for position, rotation, scale and uses `model-*` tokens | Adapter should map transform fields to shared `number` definitions; commit remains `onTransformCommit(nodeId, transform)` |
| Face sliders | `components/face/FaceParameterSlider.tsx` uses native range input and `model-range` token | Map `FaceParameter` to shared `NumberSlider` or `slider` property definitions |
| Scene tree | `SceneTree.tsx` recursively renders all nodes, visibility button, Unicode/emoji icons, no virtualization | Map `SceneNodeSnapshot` to shared `TreeViewItem`; add 500 visible item test before migration is marked complete |
| Token/icon debt | `--model-*` tokens across panels; visibility and node icons are Unicode glyphs | Touched controls should consume shared tokens and codicon/icon mappings |
| Engine boundary | Transform commits and scene visibility route through App/controller callbacks | Shared UI must not call model controller or own scene authority |

Model adapter status: `components/adapters/sharedModelUiAdapter.ts` maps transform fields, face parameters, and scene nodes into `@neko/ui/creative` property/tree DTOs. Adapter coverage is included in the package Vitest run and type checks with `pnpm --filter @neko-model/webview exec tsc --noEmit`.

Model 8.7/8.8 migration status: `TransformPanel.tsx` now renders transform number fields through shared `PropertyPanel` and commits back to the owning `onTransformCommit(nodeId, transform)` callback. `FaceParameterSlider.tsx` now uses shared `NumberSlider`, and `FaceParameterCategory.tsx` replaced the local inline SVG chevron with the `@neko/ui/icons` codicon helper. `SceneTree.tsx` now renders `mapModelSceneNodesToTreeViewItems()` output through shared `TreeView`, including visibility toggles and 500 visible item virtualization coverage.

Model token/icon note: touched transform, face slider, and tree row controls now use shared VSCode / `--neko-*` styling for inputs, sliders, rows, visibility dots, and focus states. Existing `--model-*` tokens remain only on package-owned panel shells, headers, and category containers until Phase 4 audit. Source assertion on touched files finds no new inline SVG or Unicode node/visibility glyphs.

Model verification:

- `cd packages/neko-model/packages/webview && pnpm exec vitest run src/components/adapters/sharedModelUiAdapter.test.ts src/components/panels/TransformPanel.shared-ui.test.tsx src/components/face/FaceParameterSlider.shared-ui.test.tsx src/components/SceneTree.shared-ui.test.tsx`
- `pnpm --filter @neko-model/webview exec tsc --noEmit`

## Sketch Inventory

| Area | Current implementation before 9.x | Migration note |
|------|-----------------------------------|----------------|
| Brush parameters | `BrushPanel.tsx` rendered local native `select`, `range`, and `color` inputs with `sketch-select` / `sketch-slider` classes | `components/adapters/sharedSketchUiAdapter.ts` maps active brush/eraser/stamp state into shared `PropertyDefinition` values; `BrushPanel.tsx` now renders shared `PropertyPanel` and package-owned stamp import/remove actions use shared `Button` |
| Layer list | `LayerPanel.tsx` rendered bespoke rows, local visibility/lock buttons, inline SVG icons, Unicode clipping/alpha badges, and `@neko/shared/components` `ContextMenu` | Layers now map to shared `TreeViewItem` values with visibility, lock, badges, and row actions; `LayerPanel.tsx` uses shared `TreeView`, `ContextMenu`, `Popover`, `Button`, `IconButton`, and codicon mapping |
| Toolbar controls | `Toolbar.tsx` now uses `@neko/ui/primitives` toolbar shell; `VectorToolbar.tsx` and tool-specific local icon/tool behavior remain package-owned | Import surface migrated after 9.x; full icon/tool behavior convergence remains a later package wave or Phase 4 audit item |
| Token usage | `index.css` defines `--sketch-*` shell and local control tokens | Touched controls moved to shared VSCode / `--neko-*` styling; `--sketch-*` remains for Sketch panel chrome and untouched controls |

Sketch 9.2/9.3 migration status: `BrushPanel.tsx` now uses the Sketch-owned adapter to project brush type, size, opacity, hardness, stamp texture, spacing, symmetry mode, and color into shared creative properties. `LayerPanel.tsx` now renders `mapSketchLayersToTreeViewItems()` output through shared `TreeView`, including visibility and lock toggles, row remove action, shared `ContextMenu`, and shared `Popover` for adjustment layers.

Sketch 9.4 TreeView coverage: `LayerPanel.shared-ui.test.tsx` renders 500 visible layers, verifies the shared virtualization path, and covers selection, keyboard navigation, visibility, and lock callbacks.

Sketch token/icon note: touched BrushPanel/LayerPanel files no longer import `@neko/shared/components`, no longer render local inline SVG controls, and no longer use Unicode glyphs for migrated control icons. `Toolbar.tsx` now uses `@neko/ui/primitives` for the toolbar shell; remaining inline SVG and Unicode tool icons in `Toolbar.tsx`, `VectorToolbar.tsx`, overlays, and timeline controls are package-owned visual cleanup.

Sketch verification:

- `cd packages/neko-sketch/packages/webview && pnpm exec vitest run src/components/adapters/sharedSketchUiAdapter.test.ts src/components/BrushPanel.shared-ui.test.tsx src/components/LayerPanel.shared-ui.test.tsx`
- `pnpm --filter @neko-sketch/webview exec tsc --noEmit`

## Canvas Inventory

| Area | Current implementation before 9.x | Migration note |
|------|-----------------------------------|----------------|
| Property panel technical fields | `PropertyPanel.tsx` rendered local number fields, local inline styles, `@neko/shared/components` `CollapsibleSection`, and emoji lock/delete labels | `components/adapters/sharedCanvasUiAdapter.ts` maps transform fields into shared `PropertyDefinition` values; `PropertyPanel.tsx` now uses shared `PropertyPanel`, `Collapsible`, `Button`, and codicon mapping for the touched technical transform/layer/action sections |
| Node library | `NodeLibraryPanel.tsx` rendered group buttons and row buttons manually, with chevrons from `@neko/shared/icons` and local row styling | Node library groups/types now map to shared `TreeViewItem` values; rows render through shared `TreeView` while Canvas keeps package-owned create, file picker, drag payload, and subsystem lazy-load logic |
| Toolbar controls | `CanvasToolbar.tsx` now uses `@neko/ui/primitives` toolbar buttons/separators; `CanvasTopToolbar.tsx` keeps package-owned interaction mode, auto-arrange, playback, and settings control flow | Import surface migrated after 9.x; full toolbar behavior convergence remains a later wave |
| Context menus | `components/common/ContextMenu.tsx` wraps `@neko/ui/primitives` `PositionedContextMenu` and `buildAIMenuSection` while keeping package-specific Canvas node/edge menu builders | Import surface migrated after 9.x; node/edge action semantics remain Canvas-owned |
| Token usage | `index.css` defines Canvas-local aliases such as `--toolbar-*`, `--control-*`, and `--panel-*` over `--neko-*` | Touched shared controls consume VSCode / `--neko-*`; local aliases remain package-owned for viewport/node chrome and untouched panels |

Canvas 9.6/9.7 migration status: `PropertyPanel.tsx` now renders selected-node transform fields through shared `PropertyPanel` and keeps node-specific business editors package-owned. `NodeLibraryPanel.tsx` now renders node type rows through shared `TreeView` while retaining create/file-pick/drag/subsystem callbacks in Canvas.

Canvas token/icon note: touched PropertyPanel/NodeLibraryPanel files no longer import `@neko/shared/components` or `@neko/shared/icons`, and migrated lock/delete controls no longer use emoji labels. Canvas toolbar primitives, common context menu shell, media progress, and non-Agent icons now import from `@neko/ui`; remaining inline SVG and emoji controls in Canvas node renderers, media viewers, and top toolbar are package-owned cleanup candidates.

Canvas verification:

- `cd packages/neko-canvas/packages/webview && pnpm exec vitest run --environment jsdom src/components/panels/PropertyPanel.shared-ui.test.tsx && pnpm exec vitest run src/components/adapters/sharedCanvasUiAdapter.test.ts src/components/panels/PropertyPanel.test.ts src/components/panels/NodeLibraryPanel.test.ts`
- `pnpm --filter @neko-canvas/webview exec tsc --noEmit`

## Later Package Wave Status

| Package | Migrated surface | Remaining package-owned surface | Verification |
|---------|------------------|---------------------------------|--------------|
| Audio | `components/shared/AudioUiPrimitives.tsx` adapts `Button`, `IconButton`, `Select`, and `Slider`; transport, effects, export, recording, preset browser, side panel, empty project, toolbar, timeline ruler, context menus, editable waveform menu, and drag/drop now consume `@neko/ui` or `@neko/ui/icons` | Timeline and waveform drawing semantics remain package-owned; no current shared-components residue | `pnpm --filter @neko-audio/webview exec tsc --noEmit` |
| Live | Tracking mode select, tracking/avatar/recording buttons, and recording badges use shared `Select`, `Button`, and `Badge`; Tailwind config now scans `@neko/ui` | Compositor viewport, visual fallback canvas, and engine stream authority remain package-owned | `pnpm --filter @neko-live/webview exec tsc --noEmit` |
| Preview | `shared/MacButton`, `MacIconButton`, `MacSlider`, `MacTabs`, and `ProgressBar` are package adapters over `@neko/ui`; audio/video controls, tabs, document context menu, and panorama-video cleanup are migrated | Preview keeps wrapper names for compatibility; lower-level viewer playback/stream authority remains package-owned | `pnpm --filter @neko/preview-webview exec tsc --noEmit` |
| Tools | MediaDiff view mode buttons, similarity badge, zoom/opacity sliders, range buttons, audio/video seek controls, and playback icons use shared primitives/icons | TimelineDiff expand glyphs and custom waveform SVG remain untouched visualization UI outside the diff-control slice | `pnpm --filter @neko-tools/webview exec tsc --noEmit` |
| Dashboard | Quick actions, workflow card tags/actions, task progress/actions, project filter/actions, creative entity filters/actions, skills, and recent activity use shared primitives | Layout shell and table structure remain dashboard-owned | `pnpm --filter @neko-dashboard/webview exec tsc --noEmit` |
| Market | Search clear, tab bar/update badge, filter dropdown, asset cards, install progress, detail actions, and large asset picker controls use shared primitives | Installed/Owned/Updates management lists remain package-owned until a focused management-controls pass | `pnpm --filter @neko/market-webview exec tsc --noEmit` |
| Story | Main tab bar, creator status badges, scene action buttons, character send action, and row menu trigger/items use shared primitives/icons | Script table layout and hover-preview positioning remain document/table-specific | `pnpm --filter @neko-story/webview exec tsc --noEmit` |

Agent guardrail status: Agent Header/Input, conversation tabs, selectors, account flows, slash commands, mentions, and media model controls were not migrated in this change. `packages/neko-ui/src/__tests__/agent-ui-isolation.test.ts` asserts that the critical Agent Header/Input and selector files do not import `@neko/ui`.

## Bundle Delta Record Format

Each primitive or creative component migration records gzip bundle delta for affected Webviews.

| Package | Batch | Before gzip | After gzip | Delta | Notes |
|---------|-------|-------------|------------|-------|-------|
| `@neko/ui` primitive baseline | Radix-backed Tooltip/Popover/Select/Slider/Dialog/Tabs/ContextMenu/Collapsible/ScrollArea/ToggleGroup | N/A | 46,724 bytes gzip | N/A | Component-entry baseline measured with `pnpm exec esbuild` and `react`/`react-dom` externalized; actual Webview before/after deltas are still required in package migration tasks. |
| Cut Webview | Core PropertyPanel rows migrated to `@neko/ui/creative` | Not available in this workspace without installing a clean HEAD worktree | 228,325 bytes gzip (`index.js` + `style.css`) | Pending CI/baseline rerun | Measured with `cd packages/neko-cut/packages/webview && pnpm exec vite build --outDir /tmp/neko-cut-after-dist --emptyOutDir`; clean HEAD worktree failed because package-local `vite` was not installed there. |
| Puppet Webview | ParameterPanel and PuppetNodeTree migrated to shared creative controls | Not available in this workspace without installing a clean HEAD worktree | 137,287 bytes gzip (`index.js` + `index.css`) | Pending CI/baseline rerun | Measured with `cd packages/neko-puppet/packages/webview && pnpm exec vite build --outDir /tmp/neko-puppet-ui-after-dist --emptyOutDir`; Vite reported `index.js` 132.93KB gzip and `index.css` 4.35KB gzip. |
| Model Webview | TransformPanel, FaceParameterSlider, FaceParameterCategory, and SceneTree migrated to shared creative controls | Not available in this workspace without installing a clean HEAD worktree | 166,977 bytes gzip (`index.js` + `index.css`) | Pending CI/baseline rerun | Measured with `cd packages/neko-model/packages/webview && pnpm exec vite build --outDir /tmp/neko-model-ui-after-dist --emptyOutDir`; Vite reported `index.js` 157.71KB gzip and `index.css` 9.27KB gzip, plus the pre-existing >500KB minified chunk warning. |
| Sketch Webview | BrushPanel and LayerPanel migrated to shared creative/primitives | Not available in this workspace without installing a clean HEAD worktree | 189,940 bytes gzip (`index.js` + `index.css`; small dynamic export chunks excluded from UI shell total) | Pending CI/baseline rerun | Measured with `cd packages/neko-sketch/packages/webview && pnpm exec vite build --outDir /tmp/neko-sketch-ui-after-dist --emptyOutDir`; Vite reported `index.js` 180.43KB gzip and `index.css` 9.51KB gzip, plus the pre-existing >500KB minified chunk warning. |
| Canvas Webview | PropertyPanel technical fields and NodeLibrary rows migrated to shared creative/primitives | Not available in this workspace without installing a clean HEAD worktree | 167,630 bytes gzip (`index.js` + `index.css` + Canvas dynamic chunks) | Pending CI/baseline rerun | Measured with `cd packages/neko-canvas/packages/webview && pnpm exec vite build --outDir /tmp/neko-canvas-ui-after-dist --emptyOutDir`; Vite reported main `index.js` 141.46KB gzip, `index.css` 11.13KB gzip, and dynamic chunks totaling 15.04KB gzip. |
| Audio Webview | Transport, effects, export, recording, preset browser, side panel, empty project, and drag/drop migrated to shared primitives/hooks/icons | Not available in this workspace without installing a clean HEAD worktree | 137,100 bytes gzip (`editor.js` + `style.css`) | Pending CI/baseline rerun | Measured with `cd packages/neko-audio/packages/webview && pnpm exec vite build --outDir /tmp/neko-audio-ui-after-dist --emptyOutDir`; Vite reported `editor.js` 127.38KB gzip and `style.css` 9.72KB gzip. |
| Live Webview | TrackingPanel controls and recording badges migrated to shared primitives | Not available in this workspace without installing a clean HEAD worktree | 392,270 bytes gzip (`index.js` + `index.css` + VRM/GLTF chunks) | Pending CI/baseline rerun | Measured with `cd packages/neko-live/packages/webview && pnpm exec vite build --outDir /tmp/neko-live-ui-after-dist --emptyOutDir`; Vite reported `index.js` 336.63KB gzip, `index.css` 5.64KB gzip, GLTFLoader 13.63KB gzip, and three-vrm 36.65KB gzip. The >500KB warning is from pre-existing 3D/runtime dependencies, not primitive-only UI. |
| Preview Webview | Viewer wrappers, audio/video controls, document context menu, tabs, sliders, progress, and touched icons migrated to shared UI | Not available in this workspace without installing a clean HEAD worktree | 518,250 bytes gzip (CSS + JS chunks, excluding `pdf.worker.min.mjs`) | Pending CI/baseline rerun | Measured with `cd packages/neko-preview/packages/webview && pnpm exec vite build --outDir /tmp/neko-preview-ui-after-dist --emptyOutDir`; PDF worker is a copied asset and excluded from UI shell total. Largest UI chunk is `DocumentContextMenu` at 23.75KB gzip due to ContextMenu shared chunk reuse. |
| Tools Webview | Diff controls, media seek controls, progress overlays, buttons, sliders, badges, and icons migrated to shared primitives | Not available in this workspace without installing a clean HEAD worktree | 94,860 bytes gzip (`mediaDiff.js` + `assetDiff.js` + shared `index` + `style.css`) | Pending CI/baseline rerun | Measured with `cd packages/neko-tools/packages/webview && pnpm exec vite build --outDir /tmp/neko-tools-ui-after-dist --emptyOutDir`; Vite reported `mediaDiff.js` 32.00KB gzip, shared `index` 52.34KB gzip, `assetDiff.js` 3.21KB gzip, and CSS 7.31KB gzip. |
| Dashboard Webview | Cards, task table progress/actions, project/creative filters, buttons, and badges migrated to shared primitives | Not available in this workspace without installing a clean HEAD worktree | 92,270 bytes gzip (`index.js` + `index.css`) | Pending CI/baseline rerun | Measured with `cd packages/neko-dashboard/packages/webview && pnpm exec vite build --outDir /tmp/neko-dashboard-ui-after-dist --emptyOutDir`; Vite reported `index.js` 86.15KB gzip and `index.css` 6.12KB gzip. |
| Market Webview | Search, tabs, filter dropdown, asset card controls, detail actions, and large asset picker controls migrated to shared primitives | Not available in this workspace without installing a clean HEAD worktree | 71,640 bytes gzip (`marketplace.js` + `marketplace-style.css`) | Pending CI/baseline rerun | Measured with `cd packages/neko-market/packages/webview && pnpm exec vite build --outDir /tmp/neko-market-ui-after-dist --emptyOutDir`; Vite reported `marketplace.js` 69.13KB gzip and CSS 2.51KB gzip. |
| Story Webview | Tabs, table action buttons, status badges, row menu trigger/items, and touched icons migrated to shared primitives | Not available in this workspace without installing a clean HEAD worktree | 66,610 bytes gzip (`main.js` + `main.css`) | Pending CI/baseline rerun | Measured with `cd packages/neko-story/packages/webview && pnpm exec vite build --outDir /tmp/neko-story-ui-after-dist --emptyOutDir`; Vite reported `main.js` 64.76KB gzip and CSS 1.85KB gzip. |

Radix primitive entry baselines measured on 2026-05-25 with minified ESM browser bundles and `react`/`react-dom` externalized:

| Primitive | Minified bytes | Gzip bytes | Review note |
|-----------|----------------|------------|-------------|
| Tooltip | 46,373 | 16,923 | Under 20KB threshold |
| Popover | 59,972 | 21,644 | Above 20KB threshold as isolated entry; evaluate shared chunk reuse in Webview package deltas |
| Select | 73,692 | 26,179 | Above 20KB threshold as isolated entry; evaluate lazy import or local retention if a package delta remains high |
| Slider | 14,862 | 5,886 | Under 20KB threshold |
| Dialog | 34,562 | 12,140 | Under 20KB threshold |
| Tabs | 14,876 | 5,631 | Under 20KB threshold |
| ContextMenu | 78,253 | 26,968 | Above 20KB threshold as isolated entry; evaluate shared chunk reuse in Webview package deltas |
| Collapsible | 9,165 | 3,549 | Under 20KB threshold |
| ScrollArea | 18,174 | 5,969 | Under 20KB threshold |
| ToggleGroup | 13,063 | 5,045 | Under 20KB threshold |

Reusable measurement command shape:

```bash
node - <<'EOF'
const { gzipSync } = require('node:zlib');
const esbuild = require('esbuild');
const entries = [
  ['Tooltip', './packages/neko-ui/src/primitives/tooltip.tsx'],
  ['Popover', './packages/neko-ui/src/primitives/popover.tsx'],
  ['Select', './packages/neko-ui/src/primitives/select.tsx'],
  ['Slider', './packages/neko-ui/src/primitives/slider.tsx'],
  ['Dialog', './packages/neko-ui/src/primitives/dialog.tsx'],
  ['Tabs', './packages/neko-ui/src/primitives/tabs.tsx'],
  ['ContextMenu', './packages/neko-ui/src/primitives/context-menu.tsx'],
  ['Collapsible', './packages/neko-ui/src/primitives/collapsible.tsx'],
  ['ScrollArea', './packages/neko-ui/src/primitives/scroll-area.tsx'],
  ['ToggleGroup', './packages/neko-ui/src/primitives/toggle-group.tsx'],
];
for (const [name, entryPoint] of entries) {
  const result = esbuild.buildSync({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    external: ['react', 'react-dom'],
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
  });
  const code = result.outputFiles[0].contents;
  console.log(`${name}\t${code.length}\t${gzipSync(code).length}`);
}
EOF
```
