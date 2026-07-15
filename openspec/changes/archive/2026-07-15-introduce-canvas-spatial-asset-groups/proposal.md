## Why

Canvas Basic currently renders foundational content as heavy cards and summarizes grouped children instead of letting creators arrange the real nodes spatially. Generated media also becomes durable under `neko/generated/<kind>/` before Asset Library promotion, which creates a second user-visible retention location that can be mistaken for disposable output and deleted independently of the curated asset workflow.

This change makes Basic Canvas content visually lightweight, turns Group into a true spatial organizer, and gives generated candidates one explicit retention path: review them in a runtime Canvas group, then save selected nodes or the whole group through AssetLibrary/AssetStore before they become durable Canvas facts.

## What Changes

- Render foundational file/reference, Markdown/text, script, image, audio, and video nodes with low chrome: name plus content by default, no persistent outer card border or shadow, and explicit hover, selection, keyboard-focus, editing, loading, and error states.
- Show a type-aware contextual toolbar after selection, reusing the canonical Canvas action descriptors and dispatcher for open/edit/regenerate/replace, connect, save to assets, and overflow actions.
- Replace Group's child-summary list with a semi-transparent spatial container that renders its actual children, supports free child placement, explicit sorting/auto-arrange, drag-in/drag-out membership, collapse, fit-to-content, and subtree movement while preserving child positions.
- Keep child positions in canonical absolute Canvas coordinates and derive their position relative to a Group; do not add a second persisted coordinate model or a new Canvas node type/profile/file format.
- Project one generation task's reviewable candidates into a runtime spatial Group with unsaved state. Initial layout may be arranged automatically, but subsequent creator movement is authoritative until an explicit sort/auto-arrange action.
- Add node-level and group-level Save to Assets actions. Promotion is owned by AssetLibrary/AssetStore, returns stable Asset identity, preserves provenance, and only then permits durable Canvas authoring against the frozen Board target.
- **BREAKING**: New generated media is no longer retained for Canvas under `neko/generated/<kind>/`. Unpromoted candidates remain pinned runtime/cache projections and cannot be persisted as `.nkc` source facts; retained candidates must be explicitly promoted to AssetLibrary/AssetStore.
- **BREAKING**: A completed media task no longer automatically authors an unpromoted durable media node into the Board `.nkc`. It projects a recoverable runtime review group and persists only successfully promoted assets; Markdown and already-durable file/reference delivery remain unchanged.
- Preserve existing valuable `neko/generated/<kind>/` files and Canvas references. They remain readable legacy durable sources and may be explicitly imported/promoted into AssetLibrary; this change does not delete, silently move, or invalidate them.
- Keep professional Storyboard, Scene/Shot, Gallery, Timeline, Workflow, Agent/Tool, and typed-port nodes on their structured renderers. Basic low-chrome presentation does not become a persisted Basic profile or a global border-removal rule.

## Capabilities

### New Capabilities

- `canvas-basic-node-presentation`: Defines low-chrome foundational node rendering, semantic interaction states, and selection-owned contextual actions without changing `.nkc` node identity.
- `canvas-spatial-groups`: Defines semi-transparent manual-layout Groups, real child rendering, membership, ordering, movement, resize, collapse, and nested spatial behavior.
- `canvas-generated-draft-groups`: Defines runtime grouping of generated candidates, unsaved-state visibility, single/group Asset promotion, frozen Board delivery, and recovery/failure behavior.

### Modified Capabilities

- `agent-board-canvas-delivery`: Changes completed generated-media delivery from automatic durable Board authoring to runtime review projection followed by explicit Asset-backed authoring; non-media typed delivery remains automatic.
- `generated-asset-lifecycle`: Retires `neko/generated/<kind>/` as the canonical location for newly retained Canvas output and requires AssetLibrary/AssetStore promotion before generated media becomes a durable Canvas fact.

## Impact

- `packages/neko-canvas/packages/webview`: foundational node shells, selection overlay/contextual toolbar, spatial Group rendering, child hit testing and transforms, container selection, sorting/fit/collapse UI, generated candidate projection, focus/keyboard behavior, and Webview functional scenarios.
- `packages/neko-canvas/packages/extension`: runtime draft-group projection, frozen target/revision handling, promotion requests, Asset-backed Canvas apply, restart/recovery diagnostics, and Webview message validation.
- `packages/neko-types`: minimal host-neutral presentation/action or runtime projection DTO refinements if existing Canvas/container and promotion contracts are insufficient; `.nkc` keeps existing node, `parentId`, container, layout, and absolute position semantics.
- `packages/neko-agent`: generated task-result delivery state, Board binding continuity, idempotent promotion/apply, and Agent Evaluation coverage. Skill content does not own storage or tool protocol.
- `packages/neko-assets`: canonical create/import/promote facade, AssetEntity/variant/file provenance, stable returned identity, batch promotion behavior, and fail-visible partial failure.
- Generated-output/ResourceCache lifecycle: unpromoted candidates remain pinned session/runtime projections subject to explicit unsaved diagnostics and lifecycle policy; cache paths and render URIs never become Canvas facts.
- Stable specs and architecture documentation for Board Canvas delivery, generated asset lifecycle, interactive Canvas, Asset Library, and cache/path ownership require synchronization.
- No Rust Engine or Protobuf change is expected. The change is a high-risk Canvas Webview plus cross-package lifecycle change and requires producer/consumer contract tests, path-level legacy poison checks, focused Agent Evaluation, and isolated Extension Development Host functional acceptance.
