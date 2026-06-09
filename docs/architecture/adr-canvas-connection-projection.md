# ADR: Canvas Connection Projection And Container Order Semantics

- **Status**: Proposed
- **Date**: 2026-06-09
- **Scope**: neko-canvas, @neko/shared Canvas contracts
- **Related**: `adr-canvas-block-container.md`, `adr-canvas-generic-container-card.md`, `adr-canvas-interactive-narrative.md`
- **OpenSpec Change**: `openspec/changes/add-canvas-connection-projection`

---

## Context

Canvas keeps relationship edges in top-level `CanvasData.connections`, while container membership is represented by `container.childIds` and child `parentId`. The node layer can hide children that are summarized inside a container, but the connection layer previously drew every global connection whose endpoint nodes existed. That allowed a hidden child to leak a visible line from an invisible endpoint.

Order semantics were also ambiguous. `container.childIds` is organization order, while connection order can mean sequence, branch priority, dependency, reference, or association. Moving a node into a container or reordering it should not silently delete, create, or retarget real graph edges.

## Decision

Introduce a Canvas connection projection layer. `CanvasData.connections` remains the source of truth for real relationships. Renderers consume a projected view that classifies edges as:

- `direct`: both endpoints are independently visible.
- `aggregate`: one or more hidden child edges are represented through visible container endpoints.
- `internal`: both endpoints are hidden children of the same container and are summarized on that container.
- `hidden`: the edge is omitted because an endpoint is missing or cannot be projected safely.

Projection is implemented as a pure Webview utility over serializable Canvas nodes, connections, visible node IDs, expanded container IDs, and optional render bounds. It does not read DOM state or mutate Canvas data.

## Order Policy

Container child order and connection order are separate authorities.

```ts
type ConnectionOrderSyncMode =
  | 'none'
  | 'derive-from-container'
  | 'sync-sequence-edges'
  | 'sync-branch-priority';
```

Default policy:

| Container/domain                   | Mode                    | Meaning                                                            |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| Scene                              | `derive-from-container` | Render sequence hints from child order without writing real edges. |
| Group / Gallery / Artboard / Table | `none`                  | Reorder only changes organization order.                           |
| Narrative / Flow                   | `sync-branch-priority`  | Explicit branch reorder updates priority metadata only.            |
| Explicit sequence editor           | `sync-sequence-edges`   | Explicit sequence commit may reconcile sequence edges.             |

Default container reorder MUST NOT rewrite real connection endpoints or IDs.

## Move And Delete Semantics

Moving a node into a container sets `parentId` and inserts the child into `container.childIds` by explicit index, drop-derived index, or append fallback. Moving a node out clears membership. Neither operation creates a container-child relationship edge or deletes existing child relationships.

Deletion is explicit:

- Delete a node: remove that node and all real connections touching it.
- Delete a `release-children` container: release children, remove the container, remove only connections touching the container, and preserve child connections.
- Delete a `delete-subtree` container: remove the container, descendants, and all connections touching any removed node.
- Remove/release a child from a non-gallery container: preserve the child's real connections.
- Remove a gallery child with delete-subtree semantics: delete that child and its connections.

## Cycle Policy

Container organization cycles are always invalid. Relationship cycles are connection-type aware:

- `derived-from`, strict `sequence`, and strict `transition` cycles are invalid.
- `choice`, explicit loop/repeat, `reference`, and `association` cycles may be valid domain relationships.
- Validation reports diagnostics instead of silently flattening or deleting edges.

## Display, Direction, And I18n

`CanvasConnection.sourceId` and `CanvasConnection.targetId` define a directed relationship in the data model. Renderers SHOULD show an arrow toward the target endpoint for direct and aggregate edges so users can inspect the stored direction without opening the property panel. If a future domain needs truly undirected relationships, it should add explicit directionality metadata instead of inferring it from a connection type name.

Projection utilities MUST NOT emit localized UI strings. They expose structured counts, endpoint records, and connection metadata. Webview renderers localize system-owned labels such as connection type names, source/target labels, connection titles, and aggregate/internal count badges through the Canvas i18n bundle.

User-authored connection content remains authored content and is not translated by the renderer. This includes `connection.label`, narrative choice text, condition text, and other domain payload copied into connection metadata.

## Consequences

Connection rendering now matches the node layer: hidden container children no longer leak raw global lines. Aggregate/internal summaries preserve provenance to real connection IDs, so UI can select or drill into underlying relationships later.

This keeps Canvas layered: organization changes do not own relationship data, and relationship renderers do not reimplement container membership rules inline.
