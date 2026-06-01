## Rollback Status

- 2026-06-01: The first implementation is no longer accepted as product-complete. Runtime testing found that Webview control state and Engine video output could diverge, and high-frequency interactions could be delayed when routed through SceneControl/ack/video reconciliation paths.
- The contract and ADR remain useful, but implementation tasks are reset to pending for a redesign that separates cold authoring commands from the immediate interaction hot path.
- Re-entry criteria: camera drag, viewport drag, transform gizmo drag, light-position drag, and continuous sliders must update local intent immediately and send latest-only Engine hot updates without waiting for SceneControl ack or restarting the H.264 stream. Engine frame output remains the final reconciliation source.

## 1. Contract And Capability Wiring

- [ ] 1.1 Extend Proto/shared scene contracts for `clay` render mode, lookdev settings, light patch, environment patch, safe `node-remove`, and typed selection targets.
- [ ] 1.2 Regenerate TypeScript scene engine types and Rust mirror DTOs from the updated contract source.
- [ ] 1.3 Add contract guard/normalization tests for lookdev settings, light commands, environment commands, safe removal, and typed selection candidates.
- [ ] 1.4 Extend `EngineClient` and scene-control helpers with typed request/response normalization for lookdev, light, environment, and selection payloads.
- [ ] 1.5 Add capability discovery flags so Webview can hide or disable live settings, Clay, environment, and typed picking features when Engine does not support them.

## 2. Engine Viewport LookDev

- [ ] 2.1 Add `ViewportRenderMode::Clay` and parse/serialize it through `scenes:stream` options and descriptors.
- [ ] 2.2 Implement Clay render graph/material override behavior without mutating authored material slots.
- [ ] 2.3 Ensure existing Wireframe, Normal, Depth, LightComplexity, and ShadowAtlas modes report effective render mode in descriptor or frame metadata.
- [ ] 2.4 Add tests for render graph variant selection, Clay material override, and unsupported render-mode diagnostics.
- [ ] 2.5 Add the additive `viewport-settings-update` control path or a capability-gated placeholder that cleanly falls back to stream restart.

## 3. Engine Light Authoring

- [ ] 3.1 Add runtime-scene typed APIs for creating light nodes, updating light components, toggling visibility, and removing light nodes.
- [ ] 3.2 Extend `SceneCommandEvent` and host scene-control parser for `node-add(kind='light')`, `light-update`, and safe `node-remove`.
- [ ] 3.3 Emit SceneDelta updates for added lights, updated light properties, removed light nodes, and visibility changes.
- [ ] 3.4 Update RenderWorld extraction so authored enabled lights affect viewport stream and capture rendering.
- [ ] 3.5 Preserve the default editor light rig only when no enabled authored lights exist, and keep it non-persistent.
- [ ] 3.6 Add Rust parser/runtime tests for light add, update, transform, visibility, safe remove reject, and safe remove success.

## 4. Engine Environment State

- [ ] 4.1 Add Engine-owned environment scene state and commands for `environment-set`, `environment-update`, and `environment-clear`.
- [ ] 4.2 Implement background color and LDR equirectangular panorama environment rendering for P3.
- [ ] 4.3 Add async environment loading with previous-environment preservation, cancellation, 64 MiB soft limit, 5s pending diagnostic, and 15s UI timeout support.
- [ ] 4.4 Route environment sources through Engine file access tokens or asset handles rather than Webview-local file paths.
- [ ] 4.5 Add tests for environment set/update/clear, oversized resource diagnostic, pending/timeout diagnostics, and cancellation.
- [ ] 4.6 Document and stub the P3.5 path for HDRI prefilter and cubemap/IBL cache reuse with preview/panorama infrastructure.

## 5. Typed Picking And Character Regions

- [ ] 5.1 Extend hit-test/query result contracts to return typed selection candidates with viewport id, revision, depth/order, and target identities.
- [ ] 5.2 Implement materialSlot, submesh, and primitive picking for ordinary mesh assets where Engine can identify those targets.
- [ ] 5.3 Add Webview-compatible projected bounds or gizmo anchors for non-node targets where available.
- [ ] 5.4 Add `.nkc` region descriptor contract support for stable character region ids and mappings to morph controls, material slots, bones, or mesh data.
- [ ] 5.5 Implement characterRegion/morphControl picking only when a loaded `.nkc` character provides compatible descriptors.
- [ ] 5.6 Add tests for ordinary GLB/VRM degradation, materialSlot/submesh picking, `.nkc` region picking, and stale-revision selection rejection.

## 6. Neko Model Webview Controls

- [ ] 6.1 Add Model store/controller state for requested, pending, applied, rejected, timeout, and unavailable LookDev mode states.
- [ ] 6.2 Update `VideoViewport` descriptor creation to consume selected render mode and preserve the last confirmed frame during stream restart.
- [ ] 6.3 Add `LookDevControls` for PBR, Clay, Wireframe, Normal, Depth, LightComplexity, helper passes, and debug badges.
- [ ] 6.4 Add `LightInspectorPanel` and Light tool actions for add, delete, transform, visibility, color, intensity, range, cone, and shadow controls.
- [ ] 6.5 Add `EnvironmentPanel` for background color, LDR panorama selection, mode, rotation, intensity, exposure, background visibility, clear, retry, and pending diagnostics.
- [ ] 6.6 Extend Outliner/Inspector routing to handle light nodes, environment targets, materialSlot/submesh/primitive targets, bone targets, and characterRegion targets.
- [ ] 6.7 Add selection mode controls for Object, Face Region, Bone/Pose, Light, Animation, and Export/Inspect workflows.
- [ ] 6.8 Ensure all controls compile to Engine commands or queries and commit UI state only after ack, SceneDelta, snapshot, query result, or compatible frame metadata.

## 7. Extension, Persistence, And Migration

- [ ] 7.1 Migrate `neko.model.useEnvironment` from Webview-only placement to Engine-backed environment command routing with Engine file access registration.
- [ ] 7.2 Persist authored lights and environment settings in `.nkm` scene data while keeping transient viewport render mode as editor/UI state unless explicitly saved as editor state.
- [ ] 7.3 Preserve old `.nkm` behavior by using default editor lighting for scenes with no authored enabled lights.
- [ ] 7.4 Normalize legacy `EnvironmentPlacement` state into Engine environment state when possible without breaking existing Webview state restoration.
- [ ] 7.5 Add migration diagnostics for unsupported environment formats, missing file tokens, unsupported `.nkc` region schemas, and ordinary meshes without semantic regions.

## 8. Validation And Documentation

- [ ] 8.1 Extend Route A boundary checks to ensure LookDev, light, environment, and selection code does not import Three.js/R3F or parse glTF/VRM in Webview.
- [ ] 8.2 Add Webview tests for LookDevControls, stream restart pending/retry/rollback, LightInspectorPanel, EnvironmentPanel, selection modes, and Inspector routing.
- [ ] 8.3 Add `SceneDocument` and client/controller tests for command envelopes, typed queries, ack/reject handling, and stale revision behavior.
- [ ] 8.4 Add Rust host-api/host-http/runtime-scene/renderer tests for render modes, light CRUD, environment state, typed picking, and diagnostics.
- [ ] 8.5 Run focused validation: relevant `pnpm --filter @neko-model/webview test`, `pnpm --filter @neko-model/webview build`, Route A boundary script, and targeted `cargo test` packages.
- [ ] 8.6 Update Chinese architecture/user documentation to reference `adr-model-lookdev-scene-editing.md`, supported phase boundaries, and non-goals.
