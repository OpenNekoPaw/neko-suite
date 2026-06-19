## 1. Audit and Public Contracts

- [x] 1.1 Re-run a focused audit for fixed-panel schema adapters, package-local input controls, `@neko/ui` domain leaks, keyframe visual consumers, and existing `@neko/ui` primitive coverage; record the result in the implementation summary or an audit artifact.
- [x] 1.2 Define `@neko/ui` layout-only composition primitive public APIs for `PanelSection`, `PropertyRow`, `AxisGroup`, `NumberPropertyRow`, `SliderPropertyRow`, `ColorPropertyRow`, and `SelectPropertyRow`.
- [x] 1.3 Define missing low-level input primitive APIs for `Checkbox`, `Switch`, and `Stepper` only where migration needs them.
- [x] 1.4 Define the two-phase edit callback contract for composition primitives, including `onPreviewChange`, `onCommit`, disabled behavior, reset slots, keyframe slots, and domain action slots.
- [x] 1.5 Define UI-local keyframe visual DTOs for `KeyframeTimeline` without importing field-editing DTOs from `@neko/shared`.

## 2. Shared UI Primitive Implementation

- [x] 2.1 Implement `PanelSection` and layout-only `PropertyRow` in `@neko/ui`, with theme-aware density, label, description, disabled, actions, reset, and keyframe/action slot behavior.
- [x] 2.2 Implement `AxisGroup` with per-axis numeric controls, stable layout, keyframe/reset affordances, and two-phase preview/commit callbacks.
- [x] 2.3 Implement `NumberPropertyRow`, `SliderPropertyRow`, `ColorPropertyRow`, and `SelectPropertyRow` as thin compositions over existing controls.
- [x] 2.4 Implement `Checkbox`, `Switch`, and `Stepper` primitives as needed, with keyboard/focus, disabled, labels/aria, and theme behavior aligned with existing primitives.
- [x] 2.5 Add or update `@neko/ui` exports and public-entrypoint tests for the new primitives.
- [x] 2.6 Add unit tests for primitive layout, callback ordering, preview/commit separation, reset/action slots, keyframe slot rendering, disabled behavior, and keyboard/focus metadata.

## 3. Dynamic PropertyPanel and Shared UI Boundary Cleanup

- [x] 3.1 Refactor schema-bound `PropertyPanel` internals to render through the new composition primitives while preserving existing `PropertyDefinition` behavior.
- [x] 3.2 Add tests proving `PropertyPanel` preserves number, slider, text, color, boolean, select, grouping, reset, and keyframe behavior after the internal refactor.
- [x] 3.3 Remove Agent-specific defaults from `@neko/ui/primitives/context-menu-ai.ts` or replace the helper with a neutral menu-section builder requiring caller-provided labels/icons/actions.
- [x] 3.4 Refactor `ViewportPredictionKind` to remove hard-coded domain prediction literals from `@neko/ui`, and update Puppet/Sketch/Model callers to define domain-specific constants or metadata locally.
- [x] 3.5 Refactor `KeyframeTimeline` to consume UI-local keyframe visual DTOs and update Model/Puppet/Cut wrappers to project their domain keyframes into those DTOs.
- [x] 3.6 Add or update boundary tests proving `@neko/ui` does not import feature packages or embed Agent/Cut/Model/Puppet/Sketch business semantics.

## 4. Cut Fixed Panel Migration

- [x] 4.1 Replace `neko-cut` local `PropertyPanel/inputs/NumberInput.tsx` and `ColorInput.tsx` usage with `@neko/ui` primitives or composition rows.
- [x] 4.2 Replace `CheckboxInput.tsx` usage with the new shared `Checkbox` primitive or a thin domain wrapper over it.
- [x] 4.3 Migrate a first `neko-cut` fixed section, preferably transform basics, from `sharedPropertyAdapter` to typed composition primitives and typed domain callbacks.
- [x] 4.4 Migrate remaining stable fixed `neko-cut` property sections that use temporary `PropertyDefinition[]` schemas for timeline/audio/text/style/defaults behavior.
- [x] 4.5 Delete migrated adapter branches and tests, or isolate any retained adapter path as dynamic/migration-only with owner, reason, validation command, and removal condition.
- [x] 4.6 Add focused tests proving migrated Cut fixed edits bypass the legacy adapter and fail visibly for invalid fixed field wiring instead of returning `{}`.

## 5. Sketch, Audio, Model, Canvas, and Dynamic Surface Adoption

- [x] 5.1 Migrate `neko-sketch` Brush fixed controls away from `sharedSketchUiAdapter` for normal brush edits, preserving typed brush callbacks and package i18n labels.
- [x] 5.2 Keep `neko-sketch` layer tree projection on the shared TreeView visual shell where it is a real visual DTO boundary, and document why it remains distinct from fixed brush controls.
- [x] 5.3 Adopt composition primitives in `neko-audio` properties/effects/mixer/loudness panels where it removes local range/row duplication without changing typed panel ownership.
- [x] 5.4 Adopt composition primitives for representative fixed transform fields in `neko-model` or `neko-canvas` where current code duplicates row/axis layout.
- [x] 5.5 Verify Puppet runtime parameters and registry/provider-driven parameter panels remain schema-driven through `PropertyPanel` or equivalent dynamic schema rendering.
- [x] 5.6 Add package tests for migrated Sketch/Audio/Model/Canvas paths, including preview/commit behavior where sliders or axis controls are involved.

## 6. Guardrails, Documentation, and Validation

- [x] 6.1 Add static guardrails or focused tests for new `@neko/ui` Agent defaults, feature-package imports, hard-coded domain prediction kinds, and shared UI domain semantics.
- [x] 6.2 Update `docs/architecture/adr-ui-domain-panels-and-shared-primitives.md` only if implementation decisions materially change the ADR.
- [x] 6.3 Update affected package docs or README files only where public imports or recommended component usage changes.
- [x] 6.4 Run focused `@neko/ui` tests covering primitives, `PropertyPanel`, keyframe visual DTOs, menu helper, prediction layer, and boundary tests.
- [x] 6.5 Run focused package tests for migrated `neko-cut`, `neko-sketch`, and representative `neko-audio` / `neko-model` / `neko-canvas` paths.
- [x] 6.6 Run TypeScript checks for affected packages and shared UI exports.
- [x] 6.7 Run `pnpm check:unused` and `pnpm check:legacy-debt` or record why broader `pnpm check:quality` covers them.
- [x] 6.8 Run `pnpm smoke:webview:runtime` or focused `vscode-extension-debugger` validation for representative migrated panel interactions if layout, focus, keyboard, or runtime Webview behavior changes.
- [x] 6.9 Run `openspec validate introduce-ui-composition-primitives` and record any residual validation gaps before implementation is considered complete.
