# UI Composition Primitive Audit

Date: 2026-06-20

This audit supports task 1.1 for `introduce-ui-composition-primitives`.

## Existing shared primitive coverage

Already present in `@neko/ui`:

- `@neko/ui/creative`: `NumberInput`, `NumberSlider`, `ColorPicker`, `KeyframeButton`, `KeyframeDiamond`, `KeyframeTimeline`, `TimelineRuler`, `TreeView`, `SeekBar`.
- `@neko/ui/primitives`: `Badge`, `Button`, `Collapsible`, `ContextMenu`, `Dialog`, `EmptyState`, `IconButton`, `Popover`, `PositionedContextMenu`, `Progress`, `ResizeHandle`, `ScrollArea`, `Select`, `SegmentedControl`, `Slider`, `Tabs`, `ToggleGroup`, `Toolbar`, `Tooltip`.

Missing or schema-bound before this change:

- `Checkbox`, `Switch`, `Stepper`.
- Layout-only `PropertyRow`.
- `PanelSection`.
- `AxisGroup`.
- `NumberPropertyRow`, `SliderPropertyRow`, `ColorPropertyRow`, `SelectPropertyRow`.

## Fixed-panel adapter findings

- `neko-cut` has `packages/neko-cut/packages/webview/src/components/PropertyPanel/adapters/sharedPropertyAdapter.ts`, approximately 497 lines. It maps fixed `TimelineElement` fields to `PropertyDefinition[]` and maps commits back through property-path strings and runtime value checks.
- `neko-cut` also has local HTML controls under `PropertyPanel/inputs`: `NumberInput.tsx`, `ColorInput.tsx`, `CheckboxInput.tsx`, and `SelectInput.tsx`. `NumberInput` and `ColorInput` overlap with existing `@neko/ui/creative`; `CheckboxInput` exposes the missing shared checkbox primitive.
- `neko-sketch` has `packages/neko-sketch/packages/webview/src/components/adapters/sharedSketchUiAdapter.ts`, approximately 338 lines. Brush fields are fixed, but commit mapping still dispatches through generic `PropertyValue`, `typeof value`, and `{}` fallback. Layer tree projection through `TreeViewItem` is a separate visual DTO boundary and can remain.
- `neko-puppet` uses `sharedPuppetUiAdapter.ts` for runtime parameter schemas; this remains a valid dynamic `PropertyPanel` use.
- `neko-model` uses `sharedModelUiAdapter.ts` for model parameters and wraps `KeyframeTimeline` in `ModelKeyframeTimeline`. The wrapper structure is a good projection pattern even though the shared keyframe DTO should move out of `@neko/shared`.
- `neko-audio` properties/effects/mixer/loudness panels are typed and adapter-free, but local range/row JSX can later adopt composition primitives.

## Dynamic surfaces intentionally retained

- `neko-puppet` `ParameterPanel.tsx` continues to render runtime puppet parameters and discovered face parameters through `@neko/ui/creative` `PropertyPanel`. The field list comes from loaded puppet/runtime metadata, so the schema is the owning contract rather than a temporary fixed-panel adapter.
- `neko-puppet` `sharedPuppetUiAdapter.ts` remains for two visual DTO boundaries: runtime parameter schema projection into `PropertyDefinition[]`, and puppet node hierarchy projection into `TreeViewItem[]`.
- `neko-model` face parameters remain schema/registry-driven through `mapModelFaceParametersToProperties`; fixed node transform fields are migrated separately to `AxisGroup` composition rows.

## Validation notes

- `pnpm check:legacy-debt` passed after the fixed-panel adapter cleanup.
- `pnpm check:unused` was run. The Cut unused `hasKeyframes` export exposed by deleting `sharedPropertyAdapter` was removed. Remaining failures are repository-level findings outside this change: unused `@fission-ai/openspec`, unlisted `tsc` binary, duplicate Agent runtime exports, and knip configuration hints.
- `pnpm smoke:webview:runtime` passed with the VS Code debugger skill smoke, observing VS Code page and Webview targets. This validates representative Webview runtime availability; it is not a manual visual acceptance pass for every migrated panel.

## Current `@neko/ui` domain leaks

- `@neko/ui/primitives/context-menu-ai.ts` exports `AICapability`, `AIMenuConfig`, `buildAIMenuSection`, and Agent-specific defaults (`发送到 Agent`, robot icon). Only `neko-cut` currently consumes this helper.
- `@neko/ui/viewport/prediction-layer.ts` includes domain-specific `ViewportPredictionKind` values such as `morph`, `ik`, `bone`, `blendshape`, `brush`, and `topology`.
- `@neko/ui/creative/keyframe-timeline.tsx` imports `EditorKeyframeTrack` and `EasingType` from `@neko/shared`, which makes the visual component consume a shared editing DTO rather than a UI-local visual DTO.

## Migration classification

- Fixed and known fields: use typed composition primitives.
- Runtime/provider/registry schemas: keep `PropertyPanel`.
- Tree/list visual shells: may use visual DTOs such as `TreeViewItem` when the DTO is the actual UI boundary.
- Keyframe visual shell: keep in `@neko/ui`, but move to UI-local DTOs projected by Model/Puppet/Cut wrappers.
