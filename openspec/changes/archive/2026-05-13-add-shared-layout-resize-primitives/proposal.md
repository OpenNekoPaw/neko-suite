## Why

`neko-cut` and `neko-sketch` currently duplicate pointer-capture resize logic for editor splits and side panels. A small shared resize primitive gives Webview editors one tested implementation for edge-based sizing, clamp behavior, capture loss, touch/pen input, and ARIA basics without introducing a generic layout framework.

## What Changes

- Add shared Layer 2 React resize primitives under `@neko/shared/components`:
  - `useResizable` for pointer-capture resize behavior.
  - `ResizeHandle` as a thin presentational wrapper over hook-provided handle props.
- Support both pixel and ratio sizing so the primitive covers right sidebars and top/bottom editor splits.
- Support controlled and uncontrolled sizing so stores can remain the source of truth where they already own panel dimensions.
- Require robust pointer handling: active pointer ID filtering, idempotent end handling, `pointercancel`, `lostpointercapture`, and unmount cleanup.
- Keep existing `useDrag`, `CollapsibleSection`, toolbar, timeline, and domain panel components unchanged.
- Migrate `neko-cut` first, then `neko-sketch`, preserving existing visual layout and store ownership.

## Capabilities

### New Capabilities

- `webview-layout-resize-primitives`: Shared Webview resize behavior for draggable layout splits and panel edges.

### Modified Capabilities

None.

## Impact

- Affected packages:
  - `packages/neko-types`: add shared React hook/component exports under `@neko/shared/components` only.
  - `packages/neko-cut/packages/webview`: replace inline preview/timeline split and property panel resize handlers.
  - `packages/neko-sketch/packages/webview`: replace inline right sidebar resize handlers.
- Affected architecture document:
  - `docs/architecture/adr-shared-layout-components.md`
- Dependency impact:
  - No new package.
  - No change to `@neko/shared` main entrypoint.
  - No change to `useDrag`.
- Validation scope:
  - Targeted Vitest coverage for `useResizable`.
  - Webview package checks/builds for `neko-types`, `neko-cut`, and `neko-sketch`.
