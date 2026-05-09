## Context

The previous `canvas-block-container-architecture` change established the four-layer Canvas foundation: `content`, `container`, `parentId`, preview capabilities, field bindings, container policies, composable rendering, and Agent derive/composite operations. The current Webview still uses the legacy production path for most high-value nodes:

- `annotation.basic` and `text.basic` are the only low-risk composable presets.
- Shot, Scene, Gallery, and Media creation still mostly produces legacy nodes without `content`.
- Scene rendering and viewport filtering still depend on `data.sceneGroupId` and `data.shotIds` in several places.
- Property editing is still dominated by type-specific branches.
- Preview behavior for core nodes remains tied to monolithic node components.

This change continues the migration without changing the flat Canvas model. The product has not launched, so compatibility with old core-node `.nkc` shapes is not a constraint for Shot, Scene, Gallery, or Media.

## Goals / Non-Goals

**Goals:**

- Make Shot, Scene, Gallery, and Media nodes use composable presets as their only built-in core-node path.
- Remove legacy Shot, Scene, Gallery, and Media renderer components and removed `*.legacy` preset metadata.
- Move Scene and Group behavior to canonical organization helpers and generic container actions.
- Render migrated Scene children through child-node slots and node preview descriptors rather than mounting full child nodes twice.
- Allow property panels and Agent tools to operate on migrated nodes through field bindings and preset metadata.
- Remove Scene/Shot membership mirrors so `container.childIds` and child `parentId` are the only organization source of truth.

**Non-Goals:**

- Migrating arbitrary pre-launch local `.nkc` files that still contain removed core-node legacy shapes.
- Rewriting every Canvas node type in one pass.
- Introducing parent-local coordinates.
- Replacing top-level `CanvasData.connections`.
- Building heavyweight media, 3D, panoramic, audio, or timeline runtimes inside Canvas.

## Decisions

### Decision 1: Migrate Core Nodes By Preset And Remove Core Legacy Presets

New composable presets will be introduced for `shot.basic`, `scene.basic`, `gallery.basic`, and `media.basic`. Each preset assembles the content tree, preview capabilities, node summary descriptor, default data, container capability, ports, and derive targets for its node type.

Rationale: preset-level composition keeps extension and Agent creation contract-driven while removing the old core React component path. Because the product has not launched, keeping `shot.legacy`, `scene.legacy`, `gallery.legacy`, and `media.legacy` would only preserve duplicate behavior and test burden.

Alternative considered: keeping dual-path compatibility for core nodes. Rejected because it keeps the same coupling and data mirror risks the four-layer design is intended to remove.

### Decision 2: Keep `node.data` Authoritative

Composable blocks will bind to existing data fields such as `/visualDescription`, `/generationHistory`, `/cells`, `/assetPath`, and `/duration`. Blocks will not own editable state outside `node.data`.

Rationale: this preserves existing Agent, generation, history, clipboard, and save/load behavior.

Alternative considered: storing full block-local values in `content`. Rejected because it would duplicate data and create conflict between block state and legacy node data.

### Decision 3: Treat `container.childIds` As Canonical For Migrated Nodes

For migrated Scene behavior, reads and writes must go through `getContainerChildIds`, `getNodeParentId`, `addContainerChild`, `removeContainerChild`, and `reorderContainerChildren`. UI, store, clipboard, outline, and Agent paths must not branch on `scene.data.shotIds` or `shot.data.sceneGroupId`.

Rationale: this is the minimum step that makes nested and heterogeneous containers real without carrying divergent membership sources.

Alternative considered: keeping Scene-specific code and only adding mirrors. Rejected because it preserves the same coupling the four-layer design is intended to remove.

### Decision 4: Scene Content Uses Child Slots And Summaries

Migrated Scene nodes will render their child list through `ChildNodeSlot` and `NodePreviewDescriptor`. The top-level canvas still stores child nodes in the flat node list and keeps absolute positions. Scene content displays summaries and selection affordances, not embedded full Shot components.

Rationale: this preserves spatial independence and avoids double-mounting interactive node components.

Alternative considered: rendering full children inside Scene content. Rejected because it mixes content and organization layers and breaks selection, culling, and connection assumptions.

### Decision 5: Property Panel Becomes Binding-Aware For Composable Nodes

The property panel will first inspect `node.content` for bindings, collections, child slots, and preview capabilities. It will render generated editors for composable core nodes and keep type-specific branches only for node types that have not been migrated.

Rationale: this reduces duplicate property-panel branches while keeping migration incremental.

Alternative considered: keeping property panel entirely type-specific until all node renderers migrate. Rejected because it would keep a second major source of type explosion.

### Decision 6: Agent Defaults Follow Migrated Core Presets

Agent derive and composite defaults should use composable presets for Shot, Scene, Gallery, and Media. Explicit removed core `*.legacy` presets are invalid.

Rationale: Agent-created composites are the highest leverage path for reducing multi-call Scene/Shot setup cost, and there is no shipped legacy workflow to preserve.

Alternative considered: preserving explicit core legacy presets for rollback. Rejected because it would keep two authoring contracts before launch.

## Risks / Trade-offs

- [Risk] Local pre-launch `.nkc` files with removed core legacy shapes stop rendering -> Mitigation: acceptable before launch; new creation paths produce composable nodes.
- [Risk] Canonical container fields drift between parent and children -> Mitigation: centralize all membership mutations in container actions and add validator coverage.
- [Risk] Property-panel generated editors miss node-specific behavior -> Mitigation: migrate property panels per preset and keep targeted escape hatches for specialized actions.
- [Risk] Composable content trees increase saved file size -> Mitigation: keep content declarative and avoid persisting preview runtime URLs, tokens, and player state.
- [Risk] Agent tools request removed legacy core presets -> Mitigation: reject unsupported presets and keep tests for that failure mode.

## Migration Plan

1. Add migrated preset metadata and content builders for Shot, Scene, Gallery, and Media.
2. Implement missing block renderers and preview descriptors needed by those presets.
3. Switch toolbar, derive, create-node, and composite defaults to migrated presets.
4. Refactor Scene/Group reads in rendering, minimap, viewport filtering, store actions, clipboard, and property panels to use organization helpers.
5. Add generated property-panel support for composable core nodes.
6. Update Agent tool metadata and structured extraction to expose migrated bindings and summaries.
7. Remove core legacy renderer components, core legacy preset metadata, and Scene/Shot membership mirrors.
8. Run targeted Webview tests and full Canvas package checks.

Rollback strategy: this is a breaking pre-launch cleanup. Runtime rollback to core `*.legacy` is not supported; source rollback remains possible through version control if product direction changes.

## Open Questions

- Should Group be migrated from its remaining type-specific renderer to a fully composable container preset in a follow-up?
- Should non-core legacy node presets keep `creationMode: "legacy"` or be renamed to an explicit non-composable mode?
