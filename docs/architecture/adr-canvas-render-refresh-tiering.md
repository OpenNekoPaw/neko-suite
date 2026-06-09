# ADR: Canvas Render Refresh Tiering

- **Status**: Proposed
- **Date**: 2026-06-09
- **Scope**: `neko-canvas` Webview rendering, Canvas store, viewport interactions
- **Related**: `adr-canvas-connection-projection.md`, `adr-canvas-preview-boundary.md`, `adr-canvas-generic-container-card.md`, `adr-unified-viewport-protocol.md`, `adr-webview-layout-unification.md`

---

## Context

Canvas currently treats several high-frequency interactions as ordinary `canvasData` updates. `CanvasData.viewport` is updated by pan and zoom. Node drag, resize, and rotation update node records during pointer movement. These updates are correct functionally, but they make every pointer frame look like a document-state change.

The observed effect is UI stutter when panning, zooming, or resizing nodes. The likely cost is not repeated document reads from the Extension Host. Instead, every interaction frame can trigger:

- React rerender from store changes.
- viewport culling recomputation.
- grid recomputation.
- connection projection and line rerender.
- visible node content rerender.
- debounced save scheduling and full `JSON.stringify(canvasData)`.
- status synchronization to the Extension Host.

Canvas should distinguish runtime view state, transient interaction previews, derived render projections, and persisted document state.

## Decision

Adopt a tiered Canvas refresh model. High-frequency interaction state MUST stay out of the persisted document hot path until it becomes a committed edit.

### Render Tiers

| Tier | Name                      | Owns                                                            | Update frequency            | Persistence                                   |
| ---- | ------------------------- | --------------------------------------------------------------- | --------------------------- | --------------------------------------------- |
| L0   | Document data             | nodes, connections, content, stable metadata                    | committed edits             | saved, history-aware                          |
| L1   | Runtime viewport          | pan, zoom, viewport size, active tool gesture state             | every pointer/wheel frame   | not saved per frame; optional final snapshot  |
| L2   | Transient interaction     | drag preview, resize preview, rotate preview, pending line      | every pointer frame         | commit on end only                            |
| L3   | Derived render projection | visible node IDs, connection projection, minimap, status inputs | derived, throttled/memoized | never saved directly                          |
| L4   | Heavy content surface     | image/video/document previews, rich cards, container internals  | content/data dependent      | resource refs only; runtime handles not saved |

### Viewport Policy

Pan and zoom are runtime viewport state. They SHOULD drive only the viewport transform layer during the gesture. They MUST NOT trigger document saves, history entries, or full status synchronization on every frame.

If Canvas wants to restore the last viewport after reopen, it MAY persist a final viewport snapshot after idle, blur, save, or explicit close. That snapshot is a convenience view preference, not a semantic document edit.

### Viewport Snapshot Policy

Runtime viewport state is authoritative while the editor is open. Restored viewport snapshots are convenience UI state.

V1 should use one debounced viewport snapshot writer:

- idle debounce is the normal write path.
- blur, save, and close only flush a pending idle write when one exists.
- repeated flush sources must be deduplicated by comparing the last written snapshot.
- snapshot writes must not create history entries, operation audit entries, or semantic document changes.

The preferred storage target is VS Code workspace/editor UI state, such as `workspaceState` or an equivalent per-document editor cache. Canvas files should not be used as the default viewport snapshot store because viewport position is not semantic Canvas content.

### Drag, Resize, And Rotation Policy

Drag, resize, and rotation SHOULD use local or interaction-store preview state during the gesture. The document store is updated on gesture end. During the gesture:

- Node visuals may use local style updates or a lightweight overlay.
- Related connection lines may update only for affected endpoints.
- Heavy node content may be frozen, hidden, or replaced by a shell preview when needed.
- History and operation audit entries are recorded only for the final commit.

If a domain requires live data during interaction, it should opt in with a throttled channel and a clear reason.

### Interaction Degradation Policy

Live interaction quality should degrade predictably as document size grows. Default thresholds are implementation hints and should be configurable through an ablation flag or performance setting:

- `<= 100` nodes: update culling, affected connections, and lightweight previews normally.
- `> 100` nodes: throttle viewport culling and minimap updates during pan/zoom.
- `> 500` nodes or dense connection graphs: freeze non-essential heavy content during gestures and prefer affected-edge updates only.
- very dense connection graphs: freeze connection lines during drag/resize and reconcile them on commit unless the active tool explicitly requires live edge following.

Connection-following during drag/resize belongs to L3 derived projection. It should be throttled and restricted to affected endpoints. Full connection projection should not run on every pointer frame in large documents.

### Derived Projection Policy

Derived render data MUST be recomputed from the narrowest dependency set:

- connection projection depends on nodes, connections, visible node IDs, expanded container IDs, and optional render bounds.
- viewport culling depends on viewport, container size, and node bounds.
- minimap and outline depend on committed document data, not pointer-frame viewport movement unless explicitly visible and throttled.
- status sync depends on semantic document summaries and selection, not pan position.

Projection utilities remain pure and serializable. They must not read DOM state, perform IO, or emit localized UI strings.

### Heavy Content Policy

Heavy content should not be remounted or re-resolved because the viewport changed. Image/video/document previews should receive stable resource URLs and memoized descriptors. During resize or fast pan/zoom, renderers MAY enter a low-cost interaction mode:

- preserve the card shell and title.
- keep the current bitmap/video element mounted when possible.
- defer expensive layout, markdown, table, gallery, or rich preview recalculation until idle.

Low-cost interaction mode exits on idle. To avoid a UI staying in shell mode during continuous interaction, renderers should also use a maximum shell duration. V1 can start with a 2 second maximum before restoring full rendering, unless the renderer explicitly opts into a longer duration.

Video playback nodes, realtime 3D/Live2D viewports, streaming previews, and other nodes whose primary value is live feedback may opt out of heavy-content freezing. Static image, document, markdown, table, and gallery previews are safe default candidates for freezing or shell rendering during fast interaction.

## Current Hot Spots

The following current code paths are candidates for refactoring:

- `CanvasData.viewport` is updated by `setViewport`, so pan and zoom modify the full document object.
- `CanvasApp` subscribes broadly to `useCanvasStore()`, causing the root app to rerender on many store changes.
- the save effect serializes the full `canvasData` for every canvasData change, including pure viewport changes.
- status sync includes full node/connection data and is sensitive to `canvasData` identity changes.
- `useViewportTransform` sends pan and wheel updates directly to `onViewportChange`.
- `resizeNode`, `moveNode`, and `rotateNode` write node data on pointer movement.
- `CanvasGrid` renders SVG dots and recomputes them on viewport changes.
- node render contexts pass `viewport` through to every visible node.

## Implementation Direction

Recommended phases:

1. **Separate runtime viewport state**
   - Add a Webview runtime viewport store or selector-backed state separate from persisted `canvasData`.
   - Keep `canvasData.viewport` as an optional restored preference or final snapshot.
   - Do not save on pure runtime viewport changes.

2. **Narrow root subscriptions**
   - Replace broad `useCanvasStore()` usage in `CanvasApp` with selectors for nodes, connections, selection, viewport, and actions.
   - Use shallow comparison where appropriate.

3. **Add interaction preview state**
   - Keep drag/resize/rotation local during pointer movement.
   - Commit with `moveNodeEnd`, `resizeNodeEnd`, and `rotateNodeEnd`.
   - Add throttled affected-edge projection if live connection following is required.

4. **Memoize and throttle projections**
   - Memoize `renderedNodeIds`.
   - Keep connection projection tied to structural dependencies.
   - Throttle viewport culling and minimap updates during pan/zoom when node count is large.
   - Freeze or affected-edge-update connection lines during drag/resize when connection density is high.

5. **Reduce grid cost**
   - Prefer a single canvas-backed grid renderer over regenerating many SVG dot elements per viewport frame.
   - CSS background grids remain a fallback for simple themes, but canvas drawing better supports dynamic theme tokens and adaptive grid density.

6. **Protect heavy content**
   - Add an interaction rendering mode to node content context.
   - Let rich renderers skip expensive recalculation during fast pan/zoom or resize.

## Non-Goals

- Do not move Canvas document semantics into the renderer layer.
- Do not persist runtime-only URLs, DOM handles, or Extension Host resources.
- Do not make every renderer responsible for its own viewport lifecycle.
- Do not remove culling; make it cheaper and dependency-aware.

## Consequences

Canvas interactions should become closer to compositor-only transforms for pan and zoom. Node drag and resize should feel responsive because visual previews no longer require full document saves, status sync, and heavy content rerendering on every frame.

This adds one more explicit runtime layer, but it lowers coupling: document persistence, interaction feedback, and render projections can evolve independently.

## Implementation Notes

The initial implementation in `neko-canvas` follows this ADR with the following concrete boundaries:

- Runtime pan/zoom is owned by a Webview-only runtime viewport store. Existing `CanvasData.viewport` is still accepted as an initial seed for compatibility, but runtime viewport movement is excluded from document save fingerprinting and full status sync triggers.
- Drag, resize, and rotation use hook-local preview state during pointer movement. Canvas root no longer wires per-frame transform callbacks to the document store; `moveNodeEnd`, `resizeNodeEnd`, and `rotateNodeEnd` are the commit paths and skip unchanged values so history/audit stay gesture-scoped.
- Large-canvas degradation is implemented through a pure render-refresh decision helper. Viewport-derived culling and MiniMap viewport snapshots use throttled runtime viewport snapshots above the large-canvas threshold. Dense or very large transform interactions may freeze connection projection and reconcile on commit.
- The grid renderer uses a single `<canvas>` surface instead of regenerating SVG dot elements. Theme tokens are read from computed CSS variables at draw time.
- Node content context now carries a low-cost interaction render mode. Static node-card previews can render shells during large active interactions and exit shell mode after a maximum duration; video poster previews remain opted out.

## Open Questions

- Should the first implementation use VS Code `workspaceState`, a per-document editor state cache, or both for viewport snapshots?
- Should default thresholds start at `> 100` nodes for throttled culling and `> 500` nodes for heavy-content freezing, or should they be derived from measured frame time?
- Which realtime node types beyond video playback and 3D/Live2D previews should opt out of heavy-content freezing?
