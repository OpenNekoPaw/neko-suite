## Context

`@neko/shared/components` already provides Layer 2 React UI primitives such as toolbar buttons, collapsible sections, panels, context menus, timeline rulers, and generic `useDrag`. The missing piece is a focused resize primitive for Webview layouts that use Pointer Events with pointer capture.

Current resize duplication is intentionally small but subtle:

- `neko-cut` uses a ratio-based vertical split between preview and timeline.
- `neko-cut` uses a pixel-based right property panel width.
- `neko-sketch` uses the same pixel-based right sidebar width pattern.

The shared primitive must live behind the existing `@neko/shared/components` subpath so React dependencies remain isolated to the L2 component surface and do not leak into the `@neko/shared` main entrypoint or L0/L1 consumers.

## Goals / Non-Goals

**Goals:**

- Provide `useResizable` as a pointer-capture resize behavior hook for layout handles.
- Provide `ResizeHandle` as a thin presentational component over hook-provided handle props.
- Support `edge: left | right | top | bottom` so calculation direction is explicit.
- Support `mode: pixel | ratio` for sidebars and top/bottom split ratios.
- Support controlled and uncontrolled state ownership.
- Handle `pointercancel`, `lostpointercapture`, active pointer filtering, duplicate end events, and unmount cleanup.
- Preserve existing layout appearance and store ownership in `neko-cut` and `neko-sketch` migrations.

**Non-Goals:**

- Do not create a generic `EditorShell`, `LayoutContainer`, or slot-based layout framework.
- Do not create `CollapsiblePanel`; existing fixed-height toggle cases remain local or use `CollapsibleSection`.
- Do not modify or replace `useDrag`.
- Do not abstract toolbars, timelines, property panel contents, or editor-specific layout structure.
- Do not export these React primitives from the `@neko/shared` main entrypoint.

## Decisions

### Decision 1: Add primitives to `@neko/shared/components`

`useResizable` and `ResizeHandle` will be implemented in `packages/neko-types/src/components/` and exported from `packages/neko-types/src/components/index.ts`.

Rationale:

- The existing shared React component surface is already located there.
- Existing webview packages already import from `@neko/shared/components`.
- A new package would add dependency overhead for two small primitives.
- Keeping exports on the components subpath preserves the Layer 2 boundary.

Alternative rejected: create `@neko/layout`. This is too much structure for three current duplicate instances.

### Decision 2: Use Pointer Events independently from `useDrag`

`useResizable` will use `React.PointerEvent`, `setPointerCapture`, and `releasePointerCapture`. It will not reuse or extend `useDrag`, which is mouse/document-listener based.

Rationale:

- Pointer capture is the existing behavior in `neko-cut` and `neko-sketch`.
- Pointer Events cover mouse, touch, and pen input.
- Extending `useDrag` would complicate an existing generic drag hook and risk regressions in canvas node dragging/rotation/resize consumers.

Alternative rejected: make `useDrag` pointer-aware. This mixes two event models and broadens the API for unrelated consumers.

### Decision 3: Model calculation with `edge` and `mode`

The hook will expose edge-based sizing rather than a generic horizontal/vertical direction.

- `edge: right`, `mode: pixel`: `containerRect.right - clientX`
- `edge: left`, `mode: pixel`: `clientX - containerRect.left`
- `edge: top`, `mode: ratio`: `(clientY - containerRect.top) / containerRect.height`
- `edge: bottom`, `mode: ratio`: `(containerRect.bottom - clientY) / containerRect.height`

Values are clamped to optional min/max bounds in the same unit as `mode`.

Rationale:

- Existing behavior is edge-relative, not just axis-relative.
- Ratio and pixel units both exist today in `neko-cut`.
- The model stays small while covering the observed patterns.

### Decision 4: Provide `calculateSize` as an escape hatch

Callers can provide a custom `calculateSize(event, containerRect)` function for non-standard calculations such as snapping, inverted measurement, or future editor-specific rules.

Rationale:

- Keeps the hook focused on lifecycle and state while avoiding one-off forks.
- Prevents the shared API from growing a feature flag for every editor-specific calculation.

### Decision 5: Keep ARIA minimal in P0

P0 handles will expose `role="separator"` and `aria-orientation`. They will not expose `tabIndex` or `aria-valuenow/min/max` until keyboard resize behavior is implemented.

Rationale:

- A focusable adjustable separator without keyboard support creates a misleading accessibility contract.
- Static separator semantics still expose the boundary without overpromising interaction.

### Decision 6: End handling is idempotent and pointer-scoped

The hook will track the active pointer ID after pointer down. Move and end events from stale pointer IDs will be ignored. `pointerup`, `pointercancel`, and `lostpointercapture` end paths will be idempotent.

Rationale:

- Pointer events can be interrupted or duplicated across browser/host edge cases.
- Shared behavior should make this robust once rather than rely on every consumer.
- Captured resize updates are applied on pointer move; cancellation stops future updates but does not roll back changes already emitted.

## Risks / Trade-offs

- Shared behavior regression affects multiple editors -> mitigate with focused unit tests and migrate `neko-cut` first because it exercises ratio and pixel paths.
- `lostpointercapture` and pointer capture behavior can vary by browser host -> keep end logic idempotent, filter by active pointer ID, and avoid document-level listener assumptions.
- Static ARIA is less powerful than keyboard-resizable separators -> treat keyboard support as a future explicit enhancement instead of shipping incomplete focus behavior.
- Existing visual affordances may drift during migration -> keep `ResizeHandle` thin and let consumers keep existing class names, widths, colors, and hover styles.
- Controlled mode can re-render on every pointer move -> preserve current store-owned behavior and keep calculations simple; defer throttling unless profiling shows a real issue.

## Migration Plan

1. Implement `useResizable` and `ResizeHandle` under `packages/neko-types/src/components/`.
2. Add targeted Vitest coverage for calculation, clamping, controlled/uncontrolled behavior, pointer cancellation, lost capture, stale pointer IDs, duplicate end events, ARIA basics, and unmount cleanup.
3. Migrate `neko-cut` preview/timeline split and right property panel while preserving existing min/max constants, store ownership, and visual classes.
4. Run targeted checks for `neko-types` and `neko-cut`.
5. Migrate `neko-sketch` right sidebar while preserving store ownership and visual classes.
6. Run targeted checks for `neko-sketch` and broader workspace checks as needed.

Rollback is straightforward: revert individual consumer migrations to their inline handlers while keeping the shared primitive available, or revert the shared primitive if no consumers remain.

## Open Questions

- Should keyboard-resizable separators be added in a follow-up after P0, including `tabIndex`, arrow key behavior, and `aria-valuenow/min/max`?
- Should future model/puppet bottom panels become resizable, or remain fixed-height collapsible panels?
