## 1. Runtime Viewport Foundation

- [x] 1.1 Add a Webview-only runtime viewport state surface seeded from loaded `CanvasData.viewport`.
- [x] 1.2 Route `CanvasApp`, `InfiniteCanvas`, `ZoomControls`, `MiniMap`, and viewport math through runtime viewport instead of mutating `canvasData.viewport` per frame.
- [x] 1.3 Keep existing `CanvasData.viewport` accepted for document load compatibility and reset/fit initial state behavior.
- [x] 1.4 Add unit tests proving pan and wheel zoom update runtime viewport without changing semantic Canvas document data.

## 2. Persistence And Status Sync Boundaries

- [x] 2.1 Refactor Canvas save fingerprinting so pure runtime viewport changes do not schedule `save` postMessages or full `JSON.stringify(canvasData)`.
- [x] 2.2 Refactor `canvasStatus` sync so runtime pan does not send full status updates and semantic document edits still sync normally.
- [x] 2.3 Add viewport snapshot helper contract with idle debounce, flush, and last-snapshot deduplication.
- [x] 2.4 Add tests for no-save on pure viewport changes, save on semantic edits, and deduplicated viewport snapshot flush.

## 3. Store Subscription Narrowing

- [x] 3.1 Replace broad `useCanvasStore()` subscription in `CanvasApp` with focused selectors for document data, selection, viewport runtime state, and actions.
- [x] 3.2 Use shallow comparison or stable action selectors where appropriate to avoid root rerender churn.
- [x] 3.3 Add focused tests or render-count regression coverage for viewport-only changes not rerendering document-only panels when practical.

## 4. Transient Interaction Preview

- [x] 4.1 Refactor node drag flow so pointer movement uses transient preview state and commits document position on drag end.
- [x] 4.2 Refactor node resize flow so pointer movement uses transient preview state and commits document size/position on resize end.
- [x] 4.3 Refactor node rotation flow so pointer movement uses transient preview state and commits document rotation on rotate end.
- [x] 4.4 Preserve one history and operation audit entry per completed drag/resize/rotation gesture.
- [x] 4.5 Add tests for preview-only movement and commit-on-end history behavior.

## 5. Derived Projection Degradation

- [x] 5.1 Memoize `renderedNodeIds` and keep connection projection keyed to structural dependencies.
- [x] 5.2 Add a configurable interaction degradation policy with default `>100` node throttling and `>500` node heavy-content/edge-freeze thresholds.
- [x] 5.3 Throttle viewport culling and minimap updates during pan/zoom when the degradation policy is active.
- [x] 5.4 Freeze or affected-edge-update connection lines during drag/resize for dense connection graphs and reconcile on commit.
- [x] 5.5 Add projection/culling tests for dependency scoping and degradation decisions.

## 6. Grid And Heavy Content Rendering

- [x] 6.1 Introduce a lower-cost canvas-backed grid renderer that responds to runtime viewport and theme tokens.
- [x] 6.2 Add node content interaction render mode plumbing for `idle`, fast viewport interaction, and transform interaction.
- [x] 6.3 Apply low-cost shell/freeze behavior to safe static heavy content surfaces while keeping video, realtime 3D/Live2D, and streaming previews opted out.
- [x] 6.4 Add tests for grid token updates and heavy-content idle/timeout exit behavior.

## 7. Validation And Documentation

- [x] 7.1 Update Canvas architecture documentation or ADR references if implementation diverges from `adr-canvas-render-refresh-tiering.md`.
- [x] 7.2 Run targeted Canvas Webview tests for runtime viewport, store behavior, connection projection, grid, and node interaction flows.
- [x] 7.3 Run `pnpm --filter neko-canvas compile`.
- [x] 7.4 Run `openspec validate optimize-canvas-render-refresh-tiering --strict`.
- [x] 7.5 Perform Neko quality-gate self-review and record residual risks, especially Webview smoke/performance evidence not covered by unit tests.
