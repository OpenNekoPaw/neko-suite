## Context

`neko-canvas` currently stores the active viewport in `CanvasData.viewport`. `setViewport()` updates `canvasData`, and `CanvasApp` has effects keyed by `canvasData` that serialize and sync the full document. Pan and zoom are therefore routed through the same path as semantic document edits.

Drag, resize, and rotation also update node records during pointer movement. The existing hooks keep local interaction state, but they also call store mutation callbacks on every move. This keeps visual feedback accurate, but it wakes document persistence, status synchronization, culling, grid, connection projection, and rich node rendering more often than necessary.

The design follows `docs/architecture/adr-canvas-render-refresh-tiering.md`:

- L0 document data: saved, history-aware semantic Canvas data.
- L1 runtime viewport: active pan/zoom and gesture viewport state.
- L2 transient interaction: drag/resize/rotate previews.
- L3 derived render projection: culling, connection projection, minimap, status inputs.
- L4 heavy content surface: image/video/document/rich container previews.

## Goals / Non-Goals

**Goals:**

- Make pan and zoom runtime interactions that do not update persisted `canvasData` per frame.
- Keep `.nkc` compatibility by still accepting/restoring existing `canvasData.viewport`.
- Prevent pure viewport movement from triggering document save, history, operation audit, or full `canvasStatus` sync.
- Narrow React store subscriptions so Canvas root and heavy node renderers rerender from relevant dependencies only.
- Make drag, resize, and rotation commit document changes on end while preserving responsive preview during the gesture.
- Add deterministic, testable policies for viewport snapshots, interaction degradation, and heavy-content shell mode.

**Non-Goals:**

- Do not remove `CanvasData.viewport` from the shared type in this change.
- Do not redesign the `.nkc` file format.
- Do not move Canvas document semantics into render components.
- Do not rewrite all node renderers.
- Do not introduce a new external rendering dependency.

## Decisions

### 1. Runtime viewport store owns active pan and zoom

Create a Webview-only runtime viewport state surface, either as a small Zustand store or a selector-backed local store colocated with Canvas. It owns active `viewport`, interaction phase, and viewport snapshot write state.

Initial runtime viewport is seeded from `canvasData.viewport` when a document is loaded. After seeding, pan and zoom update runtime state, not `canvasData`.

Alternatives considered:

- Keep viewport in `canvasData` and special-case save/status effects. This reduces the first patch size but keeps document identity changing on every frame.
- Remove `viewport` from `CanvasData`. This is cleaner long-term but unnecessary before launch and would touch more contracts.

### 2. Document save excludes pure viewport changes

`CanvasApp` should save based on semantic document data. The save effect must not stringify the full document for runtime viewport movement.

V1 can use a helper that creates a save fingerprint from semantic fields, or it can keep the full `canvasData` dependency after active viewport is no longer stored there. The important invariant is that pan/zoom does not schedule a `save` postMessage.

Alternatives considered:

- Store viewport snapshots in the `.nkc` file. Rejected as default because viewport position is UI state, not Canvas content.
- Save viewport on every idle event into the document. Rejected because it still marks view navigation as document churn.

### 3. Viewport snapshot writes are deduplicated and non-semantic

Viewport snapshots are convenience state. V1 should use one debounced writer. Blur, close, and explicit save only flush the pending write. The writer compares against the last written snapshot and drops duplicates.

The preferred storage target is VS Code `workspaceState` or an equivalent per-document editor state cache. If Extension storage is deferred, the Webview can still keep runtime viewport in memory and use the existing `canvasData.viewport` only for initial restore.

### 4. Root subscriptions use selectors

`CanvasApp` should avoid broad `useCanvasStore()` subscription. It should subscribe to the smallest sets needed by each UI region:

- document data slices: nodes, connections, narrative/projected metadata.
- selection state.
- runtime viewport state.
- stable action references.

This keeps unrelated store changes from rerendering the whole workbench. Use shallow comparison for small object groups where useful.

### 5. Transient interaction previews commit on end

Drag, resize, and rotation should keep pointer-frame visual state in hook-local state or a dedicated interaction store. The persisted store is updated on gesture end through existing `moveNodeEnd`, `resizeNodeEnd`, and `rotateNodeEnd` paths.

Connection following during interaction is a derived render concern. In small graphs it may update affected endpoints live. In large or dense graphs it may freeze and reconcile on commit.

### 6. Derived projections are dependency-aware

Projection helpers remain pure. Memoization should use narrow dependencies:

- culling: runtime viewport, container size, node bounds.
- connection projection: structural nodes, connections, visible node IDs, expanded containers, render bounds.
- minimap: committed node bounds and throttled runtime viewport.
- status sync: semantic document summary and selection, not pan position.

### 7. Grid rendering should move away from per-frame SVG dots

A single `<canvas>` grid renderer is the preferred direction because it can consume theme tokens and adaptive density without remounting many SVG dot elements. CSS background remains acceptable for simple fallback themes.

### 8. Heavy content gets an interaction rendering mode

Node content context should eventually include an interaction rendering mode such as `idle | fast-viewport | transforming`. Static heavy renderers can show stable shells or freeze expensive layouts during fast interaction.

V1 can start with the plumbing and apply it to obvious heavy surfaces. Video playback, realtime 3D/Live2D, and streaming previews opt out by default.

## Risks / Trade-offs

- **Risk: viewport restore behavior changes** → Seed runtime viewport from existing `canvasData.viewport` and add targeted tests for initial restore.
- **Risk: final viewport snapshot is lost if Extension storage is deferred** → Treat snapshot persistence as a follow-up; runtime performance improvement remains valid without it.
- **Risk: connection lines look stale during dense graph interaction** → Apply freeze only above thresholds and reconcile on commit; expose this as a policy flag.
- **Risk: selector refactor changes render ordering or stale closures** → Migrate CanvasApp incrementally and keep focused tests around save, status sync, selection, and keyboard behavior.
- **Risk: local preview state diverges from committed store** → Use existing end-commit actions as the only document mutation path and add tests for history/operation recording on end only.
- **Risk: canvas grid implementation misses theme updates** → Keep theme token inputs explicit and test renderer updates when token-derived colors change.

## Migration Plan

1. Add runtime viewport state and seed it from loaded `canvasData.viewport`.
2. Route `InfiniteCanvas`, minimap, zoom controls, and viewport math through runtime viewport.
3. Keep existing persisted viewport field accepted but stop updating it on every pan/zoom.
4. Adjust save/status effects so pure viewport changes do not schedule document saves or full canvas status sync.
5. Refactor root subscriptions and add tests.
6. Convert drag/resize/rotation to preview-first commit-on-end behavior.
7. Add grid and heavy-content optimizations behind small, reversible components or flags.

Rollback is straightforward for P0/P1: runtime viewport routing can fall back to `canvasData.viewport` and existing store actions if needed.

## Open Questions

- Should viewport snapshots land in `workspaceState`, a per-editor Webview state cache, or both?
- Should the default `>100` and `>500` thresholds be fixed initially or derived from measured frame time?
- Which node types beyond video playback, 3D/Live2D, and streaming previews should opt out of heavy-content freezing?
