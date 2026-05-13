## 1. Shared Primitive Contract

- [x] 1.1 Define `useResizable` option and return types in `packages/neko-types/src/components/useResizable.ts`.
- [x] 1.2 Implement edge-relative pixel and ratio size calculation with min/max clamping.
- [x] 1.3 Implement controlled and uncontrolled size ownership without leaking React APIs through the `@neko/shared` main entrypoint.
- [x] 1.4 Implement Pointer Events lifecycle with `setPointerCapture`, safe release, active pointer ID filtering, and idempotent end handling.
- [x] 1.5 Handle `pointercancel`, `lostpointercapture`, stale pointer events, duplicate end events, and unmount cleanup.
- [x] 1.6 Expose static separator ARIA props with correct orientation and no keyboard-adjustable value semantics.
- [x] 1.7 Implement `ResizeHandle` as a thin presentational component that spreads hook-provided handle props and preserves caller styling.
- [x] 1.8 Export `useResizable`, `ResizeHandle`, and their public types from `packages/neko-types/src/components/index.ts` only.

## 2. Shared Primitive Tests

- [x] 2.1 Add hook tests for pixel clamping and edge calculations, including `edge: right`.
- [x] 2.2 Add hook tests for ratio clamping and edge calculations, including `edge: top`.
- [x] 2.3 Add hook tests for controlled mode callback behavior and uncontrolled internal state behavior.
- [x] 2.4 Add hook tests for custom `calculateSize` overriding built-in edge/mode calculation.
- [x] 2.5 Add hook tests for `pointercancel`, `lostpointercapture`, stale pointer IDs, duplicate end events, and unmount cleanup.
- [x] 2.6 Add component tests or render assertions for `ResizeHandle` class preservation and static separator ARIA attributes.

## 3. neko-cut Migration

- [x] 3.1 Replace `neko-cut` preview/timeline vertical split inline pointer handlers with `useResizable` ratio mode.
- [x] 3.2 Preserve `neko-cut` preview ratio bounds, fullscreen behavior, and existing handle visual classes.
- [x] 3.3 Replace `neko-cut` right property panel inline pointer handlers with `useResizable` pixel controlled mode.
- [x] 3.4 Preserve `neko-cut` property panel store ownership through the existing `setPropertyPanelWidth` action.

## 4. neko-sketch Migration

- [x] 4.1 Replace `neko-sketch` right sidebar inline pointer handlers with `useResizable` pixel controlled mode.
- [x] 4.2 Preserve `neko-sketch` sidebar store ownership through the existing `setSidebarWidth` action.
- [x] 4.3 Preserve the existing sidebar handle layout, border, hover, active color, and visibility behavior.

## 5. Validation

- [x] 5.1 Run targeted tests for `packages/neko-types`.
- [x] 5.2 Run targeted checks or builds for `packages/neko-cut/packages/webview`.
- [x] 5.3 Run targeted checks or builds for `packages/neko-sketch/packages/webview`.
- [x] 5.4 Run broader workspace checks if targeted validation reveals integration risk.
