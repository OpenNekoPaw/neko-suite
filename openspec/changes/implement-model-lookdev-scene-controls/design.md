## Context

Neko Model is already on Engine-only Route A: the Webview displays Engine H.264 frames in `VideoViewport` and uses overlays, `InteractionLayer`, `ViewportShell`, and scene-control commands for editing. Current implementation has useful foundations but incomplete LookDev authoring:

- `EngineViewportDescriptor.renderMode` already includes `pbr`, `wireframe`, `unlit`, `normal`, `depth`, `lightComplexity`, and `shadowAtlas`, but `VideoViewport` currently creates descriptors with `renderMode: 'pbr'`.
- Scene contracts include command names such as `node-add`, `node-remove`, and `light-update`, but `/v1/scenes/control` currently handles only a subset of commands such as transform, visibility, animation, character, and modeling session operations.
- `EnvironmentPlacement` exists in shared TS types and can be posted to the Model Webview, but it is not Engine-owned scene render state.
- Hit-test and overlay queries are viewport-scoped, but selection is still primarily node-level rather than typed by material slot, submesh, primitive, bone, or character region.

This change operationalizes `docs/architecture/adr-model-lookdev-scene-editing.md` while staying aligned with `adr-3d-editor-rendering-architecture.md`, `adr-unified-viewport-protocol.md`, `adr-engine-dual-api-scene-split.md`, and the existing OpenSpec specs for Route A rendering and scene authoring.

Five-layer analysis:

- Responsibilities: Engine owns render modes, clay/material override, authored lights, environment state, typed picking, revisions, and deltas. Webview owns controls, pending UI, overlays, and command dispatch. Extension Host owns VSCode file picker, Engine discovery, and low-frequency command entry points.
- Dependencies: Contract definitions flow from Proto/generated shared types to `@neko/neko-client`, host-api/host-http, runtime-scene, renderer, and Webview UI. Webview must not import VSCode/Node APIs; Extension must not import React.
- Interfaces: Add or extend viewport lookdev settings, light patch, environment patch, safe node remove payloads, and typed selection targets. Commands continue using reliable scene envelopes and ack/delta reconciliation.
- Extension: P0 can ship by restarting streams for render-mode switches; P1 adds live viewport-settings updates. P3/P3.5 split basic LDR environment from HDRI/IBL. P4/P4.5 split mesh-level picking from `.nkc` semantic character regions.
- Tests: Contract parity, host parser tests, runtime scene mutation tests, render graph tests, Webview component/store tests, and Route A boundary checks gate each phase.

## Goals / Non-Goals

**Goals:**

- Surface Engine render/debug modes in Neko Model UI without adding Webview-side 3D rendering.
- Add a true Clay/white model mode that is separate from `unlit` and preserves shape-reading cues such as normals, light direction, and tone mapping.
- Support authored light add/update/remove/visibility/transform through scene commands and Engine scene state.
- Move environment/background selection into Engine scene state using Engine file access or asset handles.
- Extend picking and selection toward typed targets: node, material slot, submesh, primitive, bone, morph control, and `.nkc` character region.
- Add LookDev, Light, Environment, and Selection controls to the Model Webview while preserving Workbench Shell responsibilities.
- Keep existing projects compatible: default editor light rig remains for scenes without authored lights; old environment placement can be normalized during migration.

**Non-Goals:**

- Do not reintroduce Three.js/R3F, glTF parsing, or a visible Webview model renderer.
- Do not implement full UE-level rendering features such as Lumen, Nanite, path tracing, or full production shadow pipelines.
- Do not require ordinary GLB/VRM files to have MetaHuman-style semantic regions.
- Do not make LookDev debug modes mutate real material slots or final export materials.
- Do not move high-frequency scene control, video frames, SceneDelta, or brush patches through Extension Host.

## Decisions

### Decision 1: Add LookDev as Engine render state, with stream restart first

P0 switches PBR/Wireframe/Unlit/Normal/Depth/LightComplexity by rebuilding the `ViewportDescriptor` and restarting `startSceneRenderStream`. Webview must retain the last frame, show pending state after 250ms, surface retry after 1500ms without first frame, and roll back to the last confirmed render mode if reconnect fails.

Alternative considered: implement a local Webview shader/material override. Rejected because it violates Route A and would recreate the dual-renderer drift the 3D rendering ADR removed.

Alternative considered: implement live `viewport-settings-update` first. Deferred to P1 because stream restart uses the existing `scenes:stream` contract and gives faster, lower-risk debug-mode value.

### Decision 2: Treat Clay as a first-class render mode, not an alias for Unlit

Clay mode should use a neutral material override while retaining geometry, normals, lighting direction, and tone mapping. It must not write to scene material slots and must be reported as LookDev state, not asset material state.

Alternative considered: expose `unlit` as "white model". Rejected because unlit removes the shape-reading cues users expect from clay/white model inspection.

### Decision 3: Lights are authored scene nodes, while editor helper lights remain non-persistent

User-created lights are scene nodes with Light components and Transform state. `node-add(kind='light')`, `light-update`, `transform`, `visibility-set`, and `node-remove` are authoritative commands. The renderer's default editor rig remains only when no authored enabled lights exist, and a manual "Editor Light Rig" LookDev helper is non-persistent unless converted into authored lights.

Alternative considered: keep all lights as viewport-only presets. Rejected because users expect add/delete/move lights to affect capture/export and scene reload.

### Decision 4: Safe node removal defaults to no cascade

`node-remove` defaults to `cascade: false`. If the target has children, animation bindings, constraints, selection references, or character dependencies, Engine rejects with structured diagnostics. UI may send `cascade: true` only after an explicit destructive confirmation.

Alternative considered: default cascade delete like many scene trees. Rejected because Neko Model has authoring data and animation/character references where accidental cascade can silently corrupt work.

### Decision 5: Environment state is Engine-owned and loads asynchronously

Environment set/update/clear commands mutate Engine scene state. Sources must be Engine file tokens or asset handles. P3 supports background color and LDR equirectangular panorama first. P3.5 adds HDRI prefilter, cubemap/irradiance cache, and specular IBL, preferably reusing preview/panorama resource code. Environment loading is async, keeps previous environment while pending, uses a 64 MiB soft limit, reports pending after 5s, times out in UI after 15s, and is cancellable.

Alternative considered: keep `EnvironmentPlacement` as Webview state. Rejected because stream, capture, export, and reload would not share the same visual truth.

### Decision 6: Typed selection grows in two layers

P4 adds materialSlot/submesh/primitive picking for ordinary meshes. P4.5 adds `.nkc` character region descriptors for MetaHuman-style semantic picking. Tool modes pass selection masks so Object, Face Region, Bone/Pose, Light, Animation, and Export/Inspect workflows receive appropriate candidates.

Alternative considered: require `.nkc` semantic regions before improving picking. Rejected because material/submesh picking gives immediate value for GLB/VRM inspection without blocking on character region schema.

### Decision 7: Webview UI remains a control surface

LookDev controls live in viewport HUD or compact inspector chrome, light/environment editing lives in the right Dock inspector, and Outliner groups nodes, lights, cameras, characters, and environment. All UI changes dispatch Engine commands/queries and commit state only after ack/delta/frame metadata reconciliation.

Alternative considered: store LookDev/light/environment facts in Zustand first and sync later. Rejected because it invites drift and breaks undo, export, and capture consistency.

## Risks / Trade-offs

- [Risk] Stream restart mode switching can flicker or feel slow. -> Mitigation: retain last frame, use explicit pending/retry states, and add live `viewport-settings-update` in P1.
- [Risk] Clay/debug modes may be mistaken for real material edits. -> Mitigation: label them as LookDev render modes, avoid material slot writes, and include UI badges/metadata.
- [Risk] Light CRUD expands scene-control and SceneDelta surface area. -> Mitigation: add typed contracts, parser tests, runtime-scene tests, and revision-gated ack/reject behavior before UI controls.
- [Risk] Environment loading can be heavy or duplicate panorama preview logic. -> Mitigation: split LDR and HDR phases, enforce size/time diagnostics, and reuse preview/panorama resource conversion where possible.
- [Risk] Semantic region picking depends on `.nkc` schema not yet fully defined. -> Mitigation: ship P4 mesh-level picking first and make `.nkc` region descriptor P4.5.
- [Risk] Existing scenes may change visual lighting once a light is added. -> Mitigation: keep default editor rig only for no-authored-light scenes and clearly distinguish helper rig from authored lights.
- [Risk] UI and Engine state can diverge during rejected commands. -> Mitigation: pending state is transient, authoritative state updates only through ack, SceneDelta, snapshot, or compatible frame metadata.

## Migration Plan

1. Add contract deltas in Proto/shared TS/Rust for lookdev settings, clay render mode, light/environment patches, safe removal, and typed selection targets.
2. Implement P0 render-mode UI using existing `scenes:stream` restart semantics and pending/retry/rollback behavior.
3. Add Engine render graph handling for Clay and verify debug render modes return descriptor/frame metadata.
4. Implement light command parsing and runtime-scene mutation, then wire Outliner/Inspector controls.
5. Implement environment state and `neko.model.useEnvironment` migration to Engine-backed commands; ship background color + LDR panorama before HDRI/IBL.
6. Implement materialSlot/submesh/primitive picking, then `.nkc` region descriptors and character region picking.
7. Add persistence for authored lights and environment scene settings; keep viewport render mode as editor/UI state unless explicitly persisted as editor state.

Rollback strategy: each phase is additive. If Engine does not advertise a capability, Webview hides or disables the corresponding UI and existing PBR Route A viewport behavior remains unchanged. Existing `.nkm` files continue to load with default editor lighting.

## Open Questions

- Should Clay mode preserve normal maps from materials, or use geometric normals only for a cleaner sculpting-style read?
- Should authored environment be stored in `.nkm` scene settings immediately in P3, or remain session-only until HDRI/IBL is available?
- Which renderer or preview crate should own reusable equirectangular-to-cubemap and prefilter cache utilities?
- What is the first `.nkc` region descriptor schema: explicit region mesh masks, material-slot tags, morph-control tags, or a hybrid registry?
- Should "Editor Light Rig" be a pure viewport helper forever, or should users be able to convert it into authored light nodes?
