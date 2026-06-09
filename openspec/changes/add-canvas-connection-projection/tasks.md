## 1. Contract And Projection Types

- [x] 1.1 Define Webview-side projection types for direct, aggregate, internal, hidden, and diagnostic connection view records.
- [x] 1.2 Define `ConnectionOrderSyncMode` and policy defaults for scene, group, gallery, artboard, table, narrative/flow, and explicit sequence surfaces.
- [x] 1.3 Add typed diagnostics for dangling endpoints, hidden endpoints, aggregate projection, unsupported order sync, and policy-disallowed cycles.

## 2. Pure Projection Utility

- [x] 2.1 Implement `connectionProjection.ts` as a deterministic pure utility over serializable nodes, connections, visibility, expansion, and optional render bounds.
- [x] 2.2 Project top-level connections as direct edges when both endpoints are visible independent nodes.
- [x] 2.3 Project child-to-external and child-to-child-across-containers edges into aggregate edges with underlying connection provenance.
- [x] 2.4 Project same-container child-child edges into internal summaries in top-level mode.
- [x] 2.5 Emit diagnostics and hidden IDs for dangling endpoints, unavailable visible containers, and unsupported projection states.
- [x] 2.6 Add table-driven tests for direct, aggregate, internal, hidden, nested-container, and missing-endpoint cases.

## 3. Rendering Integration

- [x] 3.1 Update `ConnectionLayer` to consume projected connection records instead of rendering every raw connection directly.
- [x] 3.2 Add aggregate connection rendering with count/provenance metadata and selection handling that can target underlying real connection IDs.
- [x] 3.3 Add container internal connection summary data to container render inputs or container chrome without embedding connection ownership in content blocks.
- [x] 3.4 Add render-bound fallback support so collapsed or summarized containers attach lines to the visible surface rather than invisible full node size.
- [x] 3.5 Keep pending connection rendering compatible with the projected layer.

## 4. Container Store Semantics

- [x] 4.1 Fix ordinary remove/release child behavior so it preserves real child connections.
- [x] 4.2 Preserve gallery delete-subtree behavior separately from ordinary release behavior.
- [x] 4.3 Ensure move-into-container inserts by explicit index or drop-derived index and appends when no insertion hint is available.
- [x] 4.4 Ensure move-out clears parent membership without creating container-to-child history edges.
- [x] 4.5 Add store tests for move-in, move-out, release-child, delete-node, delete-container-release-children, and delete-container-delete-subtree connection cleanup.

## 5. Order And Cycle Policy

- [x] 5.1 Add pure helpers for resolving a container's connection order sync mode from policy metadata.
- [x] 5.2 Implement non-mutating derived sequence projection for `derive-from-container` mode.
- [x] 5.3 Add typed store action or helper path for `sync-sequence-edges` without applying it to default container reorder.
- [x] 5.4 Add typed store action or helper path for `sync-branch-priority` that updates priority metadata without retargeting endpoints.
- [x] 5.5 Add cycle diagnostics that reject organization cycles and evaluate connection cycles by semantic kind.
- [x] 5.6 Add tests proving reorder does not rewrite real edges in `none` and `derive-from-container` modes.

## 6. Documentation And Validation

- [x] 6.1 Update the relevant Canvas ADR or architecture note with the final projection/order/delete semantics.
- [x] 6.2 Run targeted Canvas tests for projection, container actions, and store behavior.
- [x] 6.3 Run `pnpm --filter neko-canvas compile` or the nearest package-specific compile command available in the repo.
- [x] 6.4 Run `openspec validate add-canvas-connection-projection --strict`.
- [x] 6.5 Perform the Neko quality-gate self-review for the multi-module Canvas change and record residual risks.
