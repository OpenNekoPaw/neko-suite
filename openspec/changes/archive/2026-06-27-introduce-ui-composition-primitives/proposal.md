## Why

Fixed creative panels in Neko Webviews are drifting into two bad reuse paths: large schema adapters that erase domain types and hand-written JSX that duplicates layout controls. This change introduces typed composition primitives so fixed panels can keep compile-time domain callbacks while sharing visual structure, and it cleans existing `@neko/ui` domain leaks before more editors build on them.

The need is visible now in `neko-cut` and `neko-sketch`: fixed property sets are mapped into generic `PropertyDefinition[]`, then converted back through string ids, `typeof` checks, and empty-patch fallbacks. The ADR [`docs/architecture/adr-ui-domain-panels-and-shared-primitives.md`](../../../docs/architecture/adr-ui-domain-panels-and-shared-primitives.md) records the target boundary.

## What Changes

- Add layout-only and typed composition primitives to `@neko/ui`, including `PropertyRow`, `PanelSection`, `AxisGroup`, `NumberPropertyRow`, `SliderPropertyRow`, `ColorPropertyRow`, `SelectPropertyRow`, and missing low-level inputs such as `Checkbox`, `Switch`, and `Stepper` where needed.
- Preserve the `onPreviewChange` / `onCommit` two-phase editing contract through composition primitives for sliders, number inputs, color controls, axis groups, and fixed property rows.
- Reposition generic `PropertyPanel` as a dynamic schema container and refactor it internally to use the same composition primitives as fixed panels.
- Migrate fixed-domain adapters in `neko-cut` and `neko-sketch` to typed domain panel composition where properties are stable and known at compile time.
- Clean current `@neko/ui` domain leaks:
  - remove Agent-specific defaults from `context-menu-ai.ts`,
  - remove domain-specific prediction kind unions from `prediction-layer.ts`,
  - split keyframe visual timeline DTOs from shared/field-specific editing semantics.
- Keep truly dynamic parameter surfaces, such as Puppet runtime parameters and schema/registry-driven face parameters, on generic `PropertyPanel`.
- Add guardrails and tests that prove fixed panels no longer pass through adapter fallback paths and that `@neko/ui` remains free of feature-package business semantics.

### Non-Goals

- Do not redesign Agent Header/Input, chat controls, provider selectors, or Agent-first media bars.
- Do not replace Puppet runtime parameter schemas or other genuinely dynamic provider/engine manifests with fixed JSX.
- Do not change durable `nk*` project formats, Engine Proto contracts, media stream protocols, or Extension/Webview message transport semantics.
- Do not force all Webviews into identical panel layouts; the goal is shared primitives and constraints, not shared domain function models.
- Do not migrate every audio, model, sketch, cut, or puppet panel in one pass when it is unrelated to the adapter and primitive boundary.

### Compatibility

This is a prelaunch cleanup of internal Webview UI APIs. Public user workflows should remain visually and behaviorally stable, but package-local adapter exports and shared UI DTOs may be deliberately broken when migrated production callers move in the same change. Any retained compatibility wrapper must be thin, documented, tested, and have a removal condition.

## Capabilities

### New Capabilities

- `ui-composition-primitives`: Defines the typed composition primitive contract, fixed-panel migration boundary, dynamic `PropertyPanel` role, `@neko/ui` domain isolation rules, and validation requirements for shared creative UI primitives.

### Modified Capabilities

- None. There are no accepted OpenSpec capabilities for this UI composition boundary yet; related Webview foundation work remains a separate active change.

## Impact

- Shared UI:
  - `packages/neko-ui/src/primitives/*`
  - `packages/neko-ui/src/creative/*`
  - `packages/neko-ui/src/viewport/prediction-layer.ts`
  - `packages/neko-ui/src/__tests__/*`
- Fixed creative panels:
  - `packages/neko-cut/packages/webview/src/components/PropertyPanel/*`
  - `packages/neko-sketch/packages/webview/src/components/BrushPanel.tsx`
  - `packages/neko-sketch/packages/webview/src/components/adapters/sharedSketchUiAdapter.ts`
  - representative `neko-model`, `neko-canvas`, and `neko-audio` consumers for adoption examples or tests
- Dynamic panels and wrappers:
  - `neko-puppet` runtime parameter panels remain on schema-driven `PropertyPanel`
  - `neko-model` keyframe timeline wrapper remains the migration anchor for UI DTO projection
- Tests and quality gates:
  - `@neko/ui` primitive and creative component tests
  - focused `neko-cut` and `neko-sketch` Webview tests
  - boundary tests proving `@neko/ui` does not import feature packages or embed Agent/Cut/Model/Puppet/Sketch business semantics
  - `pnpm check:unused`, `pnpm check:legacy-debt`, and focused Webview/runtime validation where migrated UI behavior is observable
