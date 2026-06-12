## Context

Canvas already separates organization and relationships at the data-model level: container membership is stored as container child IDs plus child `parentId`, while relationship edges remain in top-level `CanvasData.connections`. The current renderer does not fully preserve that separation. `InfiniteCanvas` hides nodes that are drawn inside containers, but `ConnectionLayer` still iterates all global connections and draws any edge whose endpoint nodes exist. A hidden child can therefore produce a visible line from an invisible endpoint.

Container order adds another ambiguity. `container.childIds` is an organization order, while connections can also imply sequence, flow, dependency, reference, or association order. Moving a child inside a Scene should update the Scene's child order and visual sequence, but it should not silently rewrite unrelated graph edges. Moving a node into or out of a container should similarly change organization membership without deleting the node's real relationships.

This design keeps `CanvasData.connections` as the canonical relationship graph and introduces a pure projected view for rendering and diagnostics.

## Goals / Non-Goals

**Goals:**

- Preserve the layered Canvas model: organization, spatial state, content, and relationships remain separate authorities.
- Introduce a pure connection projection utility that maps canonical nodes and connections into renderable direct, aggregate, internal, hidden, and diagnostic outputs.
- Render top-level Canvas connections correctly when container-managed children are hidden or summarized.
- Define explicit order synchronization policies so container reorder can update visual order without accidentally rewriting real connections.
- Define move-in, move-out, deletion, and cycle policies that can be tested independently of React rendering.
- Fix ordinary container release behavior so it preserves real child connections unless the node is actually deleted.

**Non-Goals:**

- Do not replace `CanvasData.connections` as the persisted relationship source of truth.
- Do not introduce parent-local coordinates for contained nodes.
- Do not implement a full graph layout engine or automatic route optimization.
- Do not require long legacy migration work; the product is pre-launch.
- Do not make Agent, Canvas, or Cut infer domain story order from arbitrary visual positions without an explicit policy.

## Decisions

### Decision 1: Add a Pure Projection Utility Before Rendering

Create `packages/neko-canvas/packages/webview/src/utils/connectionProjection.ts` with a pure API similar to:

```ts
export function projectCanvasConnectionView(input: CanvasConnectionProjectionInput): CanvasConnectionProjectionResult;
```

The input includes nodes, connections, visible node IDs or viewport visibility, expanded container IDs, selected node/connection IDs, and a projection mode. The output contains direct connection views, aggregate connection views, internal summaries, hidden connection IDs, and diagnostics.

Alternative considered: teach `ConnectionLayer` to branch on `parentId` inline. That would make the renderer own organization rules, make unit tests harder, and duplicate logic in future minimap, Agent context, and diagnostics surfaces.

### Decision 2: Persist Real Connections, Render Projected Connections

The persisted connection graph remains unchanged during projection. Projection produces display records:

- `direct`: real edge drawn between visible endpoint nodes.
- `aggregate`: one or more child/external edges summarized as container-to-external or container-to-container.
- `internal`: same-container child edges hidden in top-level view and represented by a container summary or local container view.
- `hidden`: edge intentionally omitted because both endpoints are hidden, unresolved, or not meaningful in the current surface.

The projection result must preserve provenance back to real connection IDs so selection, diagnostics, and future drill-down can still target the original relationships.

Alternative considered: rewrite connections to container endpoints when nodes enter containers. That loses endpoint precision and makes move-out destructive.

### Decision 3: Use Container Render Bounds for Aggregate Endpoints

Aggregate lines target the currently rendered container surface, not the container's full content-size assumption. Collapsed containers and card-like renderers may use visual-only render heights that differ from stored `node.size`. The projection or geometry layer must be able to use render bounds supplied by the node renderer when available, falling back to stored node bounds.

Alternative considered: always use `node.size`. That makes lines attach to invisible regions for collapsed or summarized containers.

### Decision 4: Separate Organization Order From Connection Order

Container child order is the source of truth for organization. Real connection order is only changed by explicit policy:

```ts
export type ConnectionOrderSyncMode =
  | 'none'
  | 'derive-from-container'
  | 'sync-sequence-edges'
  | 'sync-branch-priority';
```

Default policies:

- Scene-like ordered containers use `derive-from-container`: render derived sequence hints from `childIds` without writing real edges by default.
- Group, Gallery, Artboard, and Table use `none`: reorder only changes organization.
- Narrative/flow containers use `sync-branch-priority`: reorder updates connection priority metadata, not endpoint topology.
- Explicit sequence editors may use `sync-sequence-edges`: reorder reconciles concrete sequence/transition edges.

Alternative considered: always rewrite adjacent edges on reorder. That conflates list order with relationship topology and can destroy reference, dependency, or branch semantics.

### Decision 5: Move-In and Move-Out Preserve Relationships

Moving a node into a container sets `parentId` and inserts the child ID by drop position when available, otherwise appends. Moving a node out clears `parentId` and removes it from the container child list. Neither operation creates a container-child relationship edge or deletes existing child edges.

Projection changes how those existing child edges appear: child-to-external edges become aggregate container edges while the child is summarized, then reappear as direct real edges when the child is drawn independently.

Alternative considered: keep a connection from container to child after move-out to remember origin. That would turn organization history into a relationship edge and create misleading graph semantics.

### Decision 6: Deletion Policy Is Explicit

Deleting a node deletes real connections where that node is a source or target. Deleting a container with `release-children` releases children and deletes only connections to or from the container node. Deleting a container with `delete-subtree` deletes the container, descendants, and all related real connections. Ordinary remove-child/release actions preserve the released child's real connections.

Alternative considered: current broad filtering on remove-child. That can silently lose user-created relationships when a child is merely released from a container.

### Decision 7: Cycle Rules Are Connection-Type Aware

Organization cycles are always invalid. Connection cycles are evaluated by connection semantic kind:

- `derived-from` and strict sequence/transition edges are acyclic by default.
- `choice`, explicit loop/repeat, reference, and association edges may allow cycles.
- The validator emits diagnostics instead of flattening or deleting edges automatically.

Alternative considered: forbid all graph cycles. That blocks valid narrative loops, bidirectional references, and associative memory graphs.

## Risks / Trade-offs

- Projection complexity grows across nested containers -> Keep the utility pure, deterministic, and covered by table-driven tests before integrating React.
- Aggregate lines may hide important endpoint detail -> Preserve provenance IDs and provide count/summary/drill-down metadata on aggregate views.
- Order policies may surprise users -> Default to non-mutating policies and expose explicit sync actions for sequence/flow domains.
- Render bounds can drift from stored node size -> Add a small render-bounds adapter at the node renderer boundary and fall back safely when unavailable.
- Store fixes may affect gallery behavior -> Preserve gallery delete-subtree behavior separately from ordinary release behavior and add tests for both.

## Migration Plan

1. Add shared Webview-side projection types and pure helper tests.
2. Integrate `ConnectionLayer` with the projected result while keeping persisted `CanvasData.connections` unchanged.
3. Add aggregate edge and internal summary rendering for containers.
4. Update store membership/delete helpers so ordinary remove/release preserves child connections and delete-subtree removes them intentionally.
5. Add order synchronization helpers behind explicit policy defaults.
6. Validate with targeted Canvas tests and compile. Broader monorepo validation can follow after existing unrelated dirty changes settle.

Rollback is straightforward because projection is additive at render time. If a renderer integration causes regressions, Canvas can temporarily fall back to direct real-edge rendering while keeping the pure utility and store fixes.

## Open Questions

- Should expanded containers render internal child-child edges in the global SVG layer, or should each expanded container own a local connection layer clipped to its surface?
- Which existing connection `type` / `metadata` fields should be normalized into the first pass of connection semantic kind validation?
- Should aggregate edge selection select all underlying real connections immediately, or open a drill-down popover first?
