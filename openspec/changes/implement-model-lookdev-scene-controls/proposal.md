## Why

`neko-model` already uses Engine-only Route A for visual 3D truth, but its LookDev and scene-editing controls are still incomplete: render debug modes are not surfaced, white/clay inspection is not a first-class mode, authored lights cannot be added or removed end-to-end, environment placement remains Webview-local, and picking is limited mostly to node-level selection. This change turns the ADR for Neko Model LookDev and scene editing into implementable contracts and UI work while preserving the MetaHuman-style pattern of Engine-rendered frames plus a Webview control surface.

## What Changes

- Add model LookDev controls for PBR, Clay, Wireframe, Normal, Depth, and Light Complexity using Engine render modes, with P0 stream-restart UX safeguards and a path to live viewport settings updates.
- Extend scene command contracts and Engine control handling for authored light CRUD, light property updates, safe node removal, and environment set/update/clear commands.
- Promote environment/background placement from transient Webview state to Engine-owned scene state using Engine file access or asset handles.
- Extend viewport picking from node-only results toward typed selection targets, first for material slots/submeshes/primitives and later for `.nkc` character regions.
- Add Model Webview UI panels and controls for LookDev mode switching, light authoring, environment controls, and selection-mode-aware inspectors.
- Preserve Route A boundaries: Webview must not reintroduce Three.js/R3F as a visible model renderer, parse glTF/VRM for authority, or store Engine-owned scene facts only in Zustand.
- No breaking file-format change is required for existing `.nkm`/`.nkc` files; old projects continue using the default editor light rig until authored lights or environments are added.

## Capabilities

### New Capabilities

- `model-lookdev-control-surface`: Defines the Neko Model Webview control-surface behavior for LookDev modes, light controls, environment controls, selection modes, pending states, and Route A UI boundaries.

### Modified Capabilities

- `engine-render-viewport`: Add render-mode/lookdev requirements for Clay/debug modes, stream descriptor confirmation, restart UX budgets, and future live viewport-settings updates.
- `scene-authoring-contracts`: Add reliable scene commands and delta semantics for light CRUD, environment state, safe `node-remove`, and typed selection targets.
- `webview-engine-control-surface`: Tighten Route A Webview constraints for LookDev, light, environment, and picking controls so they compile to Engine commands or queries.
- `character-authoring-contracts`: Add `.nkc` character region descriptor requirements for MetaHuman-style semantic region selection without applying that requirement to ordinary GLB/VRM meshes.

## Impact

- `packages/neko-proto` and generated contracts in `packages/neko-types` for render modes, lookdev settings, light/environment patches, selection targets, and command payloads.
- `packages/neko-client` `EngineClient` normalization and typed helpers for viewport descriptors, scene commands, and scene-control query results.
- `packages/neko-engine` host-api/host-http/runtime-scene/engine-scene-renderer for render graph variants, command parsing, scene state mutation, RenderWorld extraction, environment loading, and hit-test results.
- `packages/neko-model/packages/webview` for `VideoViewport`, Model store, `SceneDocument`, `InteractionLayer`, Outliner/Inspector panels, LookDev controls, Light inspector, Environment panel, and tests.
- `packages/neko-model/packages/extension` for `neko.model.useEnvironment` migration from Webview-only placement to Engine-backed environment commands.
- Documentation and validation updates for Route A boundary checks, targeted Vitest suites, Rust parser/runtime tests, and visual/integration verification.
