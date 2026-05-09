## Context

The previous `canvas-block-container-architecture` change established the optional four-layer Canvas foundation: `content`, `container`, `parentId`, preview capabilities, field bindings, container policies, dual-path rendering, and Agent derive/composite operations. The current Webview still uses the legacy production path for most high-value nodes:

- `annotation.basic` and `text.basic` are the only low-risk composable presets.
- Shot, Scene, Gallery, and Media creation still mostly produces legacy nodes without `content`.
- Scene rendering and viewport filtering still depend on `data.sceneGroupId` and `data.shotIds` in several places.
- Property editing is still dominated by type-specific branches.
- Preview behavior for core nodes remains tied to monolithic node components.

This change continues the migration without changing the flat Canvas model or breaking existing `.nkc` files.

## Goals / Non-Goals

**Goals:**

- Make new Shot, Scene, Gallery, and Media nodes use composable presets once parity is covered.
- Keep existing nodes without `content` rendering through legacy components.
- Move Scene and Group behavior to canonical organization helpers and generic container actions.
- Render migrated Scene children through child-node slots and node preview descriptors rather than mounting full child nodes twice.
- Allow property panels and Agent tools to operate on migrated nodes through field bindings and preset metadata.
- Preserve legacy data mirrors during this phase so rollback and old-file compatibility remain simple.

**Non-Goals:**

- Removing `data.shotIds`, `data.childIds`, or `data.sceneGroupId` from saved files.
- Rewriting every Canvas node type in one pass.
- Introducing parent-local coordinates.
- Replacing top-level `CanvasData.connections`.
- Building heavyweight media, 3D, panoramic, audio, or timeline runtimes inside Canvas.

## Decisions

### Decision 1: Migrate By Preset, Not By Node Type Rewrite

New composable presets will be introduced for `shot.basic`, `scene.basic`, `gallery.basic`, and `media.basic`. Each preset assembles the content tree, preview capabilities, node summary descriptor, default data, container capability, ports, and derive targets for its node type.

Rationale: preset-level rollout lets the Webview keep `*.legacy` compatibility while moving new production creation to composable nodes after parity tests pass.

Alternative considered: converting all existing nodes of a type on load. Rejected because it increases file migration risk and makes rollback harder.

### Decision 2: Keep `node.data` Authoritative

Composable blocks will bind to existing data fields such as `/visualDescription`, `/generationHistory`, `/cells`, `/assetPath`, and `/duration`. Blocks will not own editable state outside `node.data`.

Rationale: this preserves existing Agent, generation, history, clipboard, and save/load behavior.

Alternative considered: storing full block-local values in `content`. Rejected because it would duplicate data and create conflict between block state and legacy node data.

### Decision 3: Treat `container.childIds` As Canonical For Migrated Nodes

For migrated Scene and Group behavior, reads and writes must go through `getContainerChildIds`, `getNodeParentId`, `addContainerChild`, `removeContainerChild`, and `reorderContainerChildren`. Legacy mirrors remain writable, but new UI logic must not branch directly on `scene.data.shotIds` or `shot.data.sceneGroupId` unless it is inside a compatibility helper.

Rationale: this is the minimum step that makes nested and heterogeneous containers real without breaking legacy files.

Alternative considered: keeping Scene-specific code and only adding mirrors. Rejected because it preserves the same coupling the four-layer design is intended to remove.

### Decision 4: Scene Content Uses Child Slots And Summaries

Migrated Scene nodes will render their child list through `ChildNodeSlot` and `NodePreviewDescriptor`. The top-level canvas still stores child nodes in the flat node list and keeps absolute positions. Scene content displays summaries and selection affordances, not embedded full Shot components.

Rationale: this preserves spatial independence and avoids double-mounting interactive node components.

Alternative considered: rendering full children inside Scene content. Rejected because it mixes content and organization layers and breaks selection, culling, and connection assumptions.

### Decision 5: Property Panel Becomes Binding-Aware For Composable Nodes

The property panel will first inspect `node.content` for bindings, collections, child slots, and preview capabilities. It will render generated editors for composable nodes and continue using legacy type branches for nodes without `content`.

Rationale: this reduces duplicate property-panel branches while keeping migration incremental.

Alternative considered: keeping property panel entirely type-specific until all node renderers migrate. Rejected because it would keep a second major source of type explosion.

### Decision 6: Agent Defaults Follow Migrated Presets With Legacy Escape Hatches

Once a preset reaches parity, Agent derive and composite defaults should prefer composable presets. Explicit `*.legacy` presets remain valid for compatibility tests, rollback, and legacy workflows.

Rationale: Agent-created composites are the highest leverage path for reducing multi-call Scene/Shot setup cost, but compatibility must remain explicit.

Alternative considered: forcing all Agent creation through composable presets immediately. Rejected because older workflows may depend on legacy node shapes during migration.

## Risks / Trade-offs

- [Risk] Visual or interaction drift between legacy and composable Shot/Gallery nodes -> Mitigation: add snapshot and behavior parity tests before switching defaults.
- [Risk] Legacy mirrors and canonical container fields diverge -> Mitigation: centralize all membership mutations in container actions and add validator coverage.
- [Risk] Property-panel generated editors miss node-specific behavior -> Mitigation: migrate property panels per preset and keep targeted escape hatches for specialized actions.
- [Risk] Composable content trees increase saved file size -> Mitigation: keep content declarative and avoid persisting preview runtime URLs, tokens, and player state.
- [Risk] Agent tools create mixed legacy/composable scenes -> Mitigation: validate preset compatibility and structured extraction across both paths.

## Migration Plan

1. Add migrated preset metadata and content builders for Shot, Scene, Gallery, and Media while keeping legacy presets registered.
2. Implement missing block renderers and preview descriptors needed by those presets.
3. Switch toolbar, derive, create-node, and composite defaults to migrated presets only after per-preset parity tests pass.
4. Refactor Scene/Group reads in rendering, minimap, viewport filtering, store actions, clipboard, and property panels to use organization helpers.
5. Add generated property-panel support for composable nodes with legacy fallbacks.
6. Update Agent tool metadata and structured extraction to expose migrated bindings and summaries.
7. Run targeted Webview tests and full Canvas package checks.

Rollback strategy: restore default preset mapping to `*.legacy` while preserving existing nodes with `content`. Legacy nodes remain renderable, and composable nodes keep their authoritative `data` bags so they can still be inspected or downgraded by a future repair tool.

## Open Questions

- Should existing nodes gain an explicit user-facing "Upgrade to composable" action in this change, or remain legacy until edited or recreated?
- Should `canvas_create_node` with only `type: "shot"` switch to `shot.basic` immediately after parity, or should Agent callers pass preset names explicitly for one release?
- How much of the current Shot candidate browser should become reusable preview capability behavior in this phase versus remain a preset-specific renderer wrapper?
