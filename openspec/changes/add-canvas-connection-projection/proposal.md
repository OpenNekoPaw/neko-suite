## Why

Canvas currently stores connections as a global relationship graph while the node layer hides children that are drawn inside containers. This creates confusing views: hidden child nodes may still emit visible global lines, container collapse can obscure the meaning of edges, and child order changes can look like connection-order changes without a clear contract.

This change introduces an explicit connection projection layer so Canvas can preserve real graph data while rendering direct, aggregate, internal, or hidden connection views according to container membership, expansion state, and domain order policy.

## What Changes

- Add a Canvas connection projection capability that derives renderable connection views from canonical nodes, container membership, and `CanvasData.connections`.
- Define how direct, aggregate, internal-summary, and hidden connection states behave for top-level nodes, contained nodes, nested containers, collapsed containers, and local container editing.
- Define order semantics separately from connection semantics:
  - container child order remains the organization-order source of truth;
  - connection priority/order is updated only by explicit policy;
  - derived sequence lines MAY be rendered from child order without mutating real connections.
- Define move-in, move-out, reorder, deletion, and cycle policies so container organization does not silently delete or invent real relationship edges.
- Add diagnostics for hidden/aggregated references, unresolved endpoints, policy-disallowed cycles, and ambiguous order synchronization.
- No launch-era legacy migration is required; the implementation may update current pre-launch contracts directly.

## Capabilities

### New Capabilities
- `canvas-connection-projection`: Defines projected Canvas connection views, aggregate/internal rendering semantics, order synchronization policy, and container membership edge behavior.

### Modified Capabilities
- `canvas-container-organization`: Clarifies that ordinary container add/remove/reorder operations do not delete or create real relationship connections unless an explicit connection-order policy or delete-subtree operation requires it.
- `canvas-layered-node-model`: Clarifies that relationship data remains top-level while renderers consume a projected relationship view when organization membership hides or summarizes nodes.

## Impact

- Affected packages:
  - `packages/neko-types`: shared projection/order policy types if the contract is shared across Canvas extension and Webview boundaries.
  - `packages/neko-canvas/packages/webview`: connection projection utility, connection rendering integration, container summaries, store membership/delete behavior, and tests.
  - `packages/neko-canvas/packages/extension`: only if projection diagnostics or future Agent/Canvas context payloads need extension-host serialization.
- Affected modules:
  - `ConnectionLayer`, `Connection`, and connection geometry helpers.
  - `InfiniteCanvas` node visibility and container render integration.
  - `canvasStore` membership, reorder, remove, and delete operations.
  - `containerActions` pure helpers and tests.
- Testing impact:
  - Add pure projection unit tests for direct/aggregate/internal/hidden views.
  - Add store tests for reorder, move-in, move-out, delete-container release/delete-subtree, and cycle guards.
  - Run targeted Canvas typecheck/tests before broader monorepo validation.
