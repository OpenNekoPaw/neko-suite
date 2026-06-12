## Why

Canvas pan, zoom, drag, and resize currently flow through the persisted `canvasData` hot path. This makes every pointer frame look like a document edit, causing unnecessary React rerenders, projection recomputation, full-data serialization, status sync, and visible stutter on larger canvases.

The new Canvas render refresh tiering ADR defines the target boundary. This change turns that ADR into an implementation plan so high-frequency interactions stay responsive while committed document semantics remain stable.

## What Changes

- Separate runtime viewport state from the persisted Canvas document hot path.
- Prevent pure pan/zoom changes from triggering document save, history, operation audit, or full status synchronization per frame.
- Add a viewport snapshot policy that writes final view preferences through a single deduplicated idle/flush path instead of saving every viewport frame.
- Narrow Canvas root store subscriptions so unrelated state changes do not rerender the full workbench.
- Add transient interaction rendering support for drag, resize, and rotation, committing document edits only on gesture end.
- Add interaction degradation policy hooks for large canvases: throttled culling/minimap, affected-edge or frozen connection rendering, and optional heavy-content shell mode.
- Replace or prepare replacement of SVG-dot grid rendering with a lower-cost grid renderer.
- Add tests proving viewport changes are runtime-only, gesture commits remain history-aware, and projection/render helpers obey dependency boundaries.

No breaking file-format change is intended. Existing `.nkc` documents may still contain an initial `viewport` field for compatibility, but runtime viewport updates must not be treated as semantic document edits.

## Capabilities

### New Capabilities

- `canvas-render-refresh-tiering`: Canvas shall distinguish persisted document data, runtime viewport state, transient interaction previews, derived render projections, and heavy content rendering modes so high-frequency interactions do not refresh or persist the full document per frame.

### Modified Capabilities

- None.

## Impact

- `packages/neko-canvas/packages/webview/src/CanvasApp.tsx`
- `packages/neko-canvas/packages/webview/src/stores/canvasStore.ts`
- New or updated Webview runtime viewport/interaction state helpers.
- `packages/neko-canvas/packages/webview/src/hooks/useViewportTransform.ts`
- `packages/neko-canvas/packages/webview/src/hooks/useNodeDrag.ts`
- `packages/neko-canvas/packages/webview/src/hooks/useNodeResize.ts`
- `packages/neko-canvas/packages/webview/src/components/InfiniteCanvas.tsx`
- `packages/neko-canvas/packages/webview/src/components/CanvasGrid.tsx`
- `packages/neko-canvas/packages/webview/src/components/connections/ConnectionLayer.tsx`
- Canvas Webview tests for store behavior, viewport runtime behavior, grid/render helpers, and interaction commit semantics.
- Extension-host viewport snapshot storage may be added later through existing Webview `postMessage` boundaries.
