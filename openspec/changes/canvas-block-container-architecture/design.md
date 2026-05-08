## Context

`neko-canvas` is the spatial orchestration surface for Neko Suite creative work. Today it represents Canvas content as a closed `CanvasNodeType` union with type-specific data interfaces, factory switch branches, monolithic React node components, hand-written property panel branches, and a fixed Agent tool enum.

The current model also mixes concerns that should remain independent:

- Spatial placement lives beside Scene/Group-specific containment logic.
- Node-internal UI and editable fields are hardcoded inside each node component.
- Scene and Group use incompatible child references.
- Preview behavior is implemented per node instead of through shared asset/preview capability contracts.
- Agent composite creation requires multiple non-transactional tool calls.

The ADR `docs/architecture/adr-canvas-block-container.md` defines the target architecture: a flat Canvas graph with absolute coordinates, composable content, generic container capability, independent connections, preview capability composition, and registry-driven extension points.

## Goals / Non-Goals

**Goals:**

- Preserve existing `.nkc` files and legacy node rendering while introducing optional new contracts.
- Define a four-layer Canvas node model: spatial, content, organization, and relationship.
- Add content composition through blocks, sections, collections, projections, field bindings, presets, and child-node slots.
- Add generic container organization through `ContainerCapability` and container policy registry.
- Add preview capability composition through preview roles, preview variants, playback runtime state, delegate actions, and node-summary descriptors.
- Provide validation and migration helpers so new and legacy containment fields can coexist during the migration.
- Expose Agent-safe derive/composite/structured-content operations only after shared placement and layout utilities exist.

**Non-Goals:**

- Rewriting all existing node components in one change.
- Making Canvas a professional media viewer, 3D renderer, video editor, audio mixer, or panoramic viewer.
- Changing the authoritative Rust/media engine ownership of heavy probe, decode, transcode, waveform, turntable, thumbnail, or proxy generation.
- Replacing top-level `CanvasData.connections` with embedded container or block-owned connections in the first migration.
- Converting table rows, Gallery cells, tags, or key-value entries into CanvasNodes by default.

## Decisions

### Decision 1: Keep CanvasData Flat And Coordinates Absolute

Canvas nodes remain stored in a flat `CanvasData.nodes` array, and `node.position` remains canvas-world absolute even when the node has a `parentId`.

Rationale:

- Current drag, marquee selection, minimap, viewport culling, connection rendering, clipboard, and history behavior already assume absolute coordinates.
- Creators rely on spatial memory in the infinite canvas.
- Container membership expresses organization, not a parent-local coordinate system.

Alternative considered: parent-local coordinates for children. Rejected because it would make migration, selection, culling, connection routing, and cross-container movement much more complex.

### Decision 2: Model Nodes As Four Decoupled Layers

Each node composes four orthogonal capabilities:

- Spatial: `position`, `size`, `zIndex`, `rotation`, selection, drag, resize, culling.
- Content: `content`, blocks, collections, projections, previews, field bindings.
- Organization: `parentId`, `container.childIds`, container policy, child order/layout intent.
- Relationship: top-level `connections`, ports, endpoint resolution.

Layers communicate through IDs, field bindings, endpoint references, policy names, and store actions. They do not embed each other's implementation details.

Alternative considered: one unified nested node tree. Rejected because it would make content layout, organization, graph relationships, and spatial rendering share one persistence model.

### Decision 3: Introduce Content Composition Before Replacing Legacy Nodes

New `content` definitions are optional. Nodes with `content` use the composable rendering path; nodes without it continue through existing monolithic components. Presets define new node creation behavior but do not force immediate migration of existing nodes.

The composable content model includes:

- `ContainerSection` and layout renderer registry.
- `Block` / `AssetBlock` / control and data blocks.
- `FieldBinding` with JSON Pointer-style paths into `node.data`.
- `CollectionView` for rows/cells/tags/entries.
- `ProjectionView` for views over existing nodes or data.
- `ChildNodeSlot` for rendering child node summaries inside container content.

Alternative considered: rewrite ShotNode first as proof. Rejected as the first implementation step because ShotNode has the highest visual and behavior risk. A simple text/annotation node path is safer for validating infrastructure.

### Decision 4: Use ContainerCapability Plus Policy Registry

Scene, Group, and Artboard become built-in container policies over the same `ContainerCapability`. Future Board, Folder, Sequence, Layer, or Timeline Section policies can register behavior without changing the core node model.

Container policy owns:

- accepted child types/presets,
- default layout behavior,
- delete/release semantics,
- derive targets,
- batch actions.

It does not own child business data. Children remain normal CanvasNodes.

Alternative considered: keep Scene and Group as special cases. Rejected because it preserves incompatible containment behavior and blocks nested/heterogeneous organization.

### Decision 5: Treat Tables, Galleries, And Storyboard Tables As Collections Or Projections By Default

Table rows, Gallery cells, tags, and entries are content collections by default. Storyboard tables are projections over Scene/Shot data by default. They are promoted to CanvasNodes only when they need independent selection, dragging, connection, generation lineage, copying, or Agent reference.

Rationale:

- Keeps internal structured data lightweight.
- Avoids turning every cell or row into a spatial graph node.
- Prevents duplicate sources of truth for Shot data in storyboard table views.

### Decision 6: Compose Preview Through Capabilities

Preview behavior is declared through capabilities rather than node type branches:

- `AssetIdentityCapability`
- `PreviewCapability`
- `PlaybackCapability`
- `DelegateCapability`
- `GenerationPreviewCapability`
- `CollectionPreviewCapability`
- `NodeSummaryCapability`

Preview resolution flows through `PreviewResolver`, `PreviewRendererRegistry`, and `PreviewRuntime`. Persistent state stores stable asset identity and selected candidate IDs; runtime-only state owns blob URLs, engine tokens, active playback, hover state, and player instances.

Canvas renders lightweight previews only. It delegates interactive panoramic viewing, real-time 3D, video timeline editing, audio editing, and heavy decoding/transcoding to specialized extensions or the Rust engine.

Alternative considered: each asset node owns its own preview component. Rejected because it recreates the same type explosion at the preview layer.

### Decision 7: Keep Connections Top-Level And Prepare Endpoint Evolution

Existing `CanvasConnection` remains valid for the first migration. Endpoint resolution is designed so a future `CanvasConnectionV2` can reference node, port, block, or field endpoints without moving connection ownership into content or containers.

Container operations classify connections as internal, boundary, or external. Containment never implies a graph edge, and graph edges never imply containment.

### Decision 8: Add Validation Before Agent Composite Operations

Agent-facing `canvas_derive_node` and `canvas_create_composite` depend on shared `findFreePosition`, `autoArrangeContainer`, and container invariant validation. They must not expose today's fixed-gap placement or multi-call Scene/Shot linking as the new contract.

## Risks / Trade-offs

- [Risk] Dual-path rendering can drift visually between legacy and composable nodes → Mitigation: start with simple nodes, add visual parity tests for Shot before switching new Shot creation.
- [Risk] New optional fields create a long compatibility period → Mitigation: route all containment reads through helper functions and keep legacy fields as transitional mirrors.
- [Risk] Container cycles or dangling child IDs corrupt Canvas state → Mitigation: add shared validator and run it on migration, save, import, composite creation, and relevant store mutations.
- [Risk] Preview runtime leaks engine tokens or player instances → Mitigation: centralize preview runtime cleanup and test dispose/source-change/failure paths.
- [Risk] `FieldBinding` paths can reference missing or incompatible data → Mitigation: validate presets at creation time and warn in development when required bindings are missing.
- [Risk] Agent composite operations may cover existing content → Mitigation: implement `findFreePosition` and `autoArrangeContainer` before exposing tools.
- [Risk] Serialization grows with `content` definitions → Mitigation: keep content declarative and avoid embedding runtime preview URLs or duplicated media payloads.

## Migration Plan

1. Add shared contracts and validators with all new fields optional.
2. Add v1 to v2 migration helpers that populate `parentId` / `container.childIds` or transitional aliases from `sceneGroupId`, `shotIds`, and `group.childIds` without removing legacy fields.
3. Add dual-path content rendering behind optional `node.content`.
4. Add preset registry and create new simple nodes through composable content while legacy nodes continue rendering unchanged.
5. Add container policy registry, child-node slot summaries, and container store actions behind compatibility wrappers for existing Scene/Group operations.
6. Add preview capability resolver/runtime and move reusable preview behavior behind registry-driven renderers.
7. Add Agent derive/composite/structured-content operations after placement/layout/validation utilities are available.
8. Migrate complex nodes incrementally, starting with low-risk nodes and leaving Shot/Scene/Gallery for later phases.

Rollback strategy: because new fields are optional and legacy fields are retained during migration, a rollback can disable new creation/rendering paths and continue loading existing files through legacy components. Files with `content` should still preserve their `data` bags so legacy fallback can display safe approximations where possible.

## Resolved Questions

- Canonical child membership is `node.container.childIds`. Phase 0 keeps legacy mirrors (`scene.data.shotIds`, `group.data.childIds`, and child `parentId`/`sceneGroupId`) readable and writable through helpers, but does not add a new top-level `childIds` field.
- `annotation.basic` is the first production composable preset, with `text.basic` added as the same low-risk path. Shot, Scene, Gallery, Media, and Storyboard remain legacy until their visual parity criteria are met.
- A separate `CanvasConnectionV2` is deferred. Phase 0 keeps `CanvasData.connections` as the relationship layer and adds optional endpoint descriptors (`sourceEndpoint` / `targetEndpoint`) to the existing connection shape for future node/port/block/field references.
- Canvas uses a narrowed `CanvasPreviewVariant` descriptor for persistent node data. Engine preview manifests, runtime URLs, blob URLs, and engine tokens remain runtime-only resolver outputs and are not persisted into `.nkc`.
