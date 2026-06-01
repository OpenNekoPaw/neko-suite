# Baseline B0-B2 Audit

Date: 2026-06-01

This audit records the current product-state gap for `neko-model` Basic Editing Baseline before implementation. It separates paths that already have useful Route A code from paths that still need product-level enablement or diagnostics.

## B0: Visual Stream

| Area | Current signal | Baseline status |
|---|---|---|
| Engine visual truth | `App.tsx` mounts `VideoViewport` whenever `enginePort !== null`; Route A boundary tests assert no persistent R3F model fallback. | Reusable |
| Camera navigation | `VideoViewport` owns orbit interaction and forwards camera mutation to Engine. | Reusable, still needs smoke validation |
| Effective resolution | Performance overlay exposes stream/render diagnostics, but baseline 1080p target vs 720p fallback is not a user-facing contract yet. | Gap |
| Empty/no-stream state | Route A stream absence is visible as unavailable/error states, but not all baseline controls explain dependency on Engine readiness. | Gap |

## B1: Object-Level Editing

| Area | Current signal | Baseline status |
|---|---|---|
| Outliner selection | `SceneTree` delegates selection through shared `TreeView` and calls `onSelectNode`. | Reusable |
| Transform inspector | `TransformPanel` can edit numeric Transform fields and call `onTransformCommit`. | Reusable |
| Scene command path | `App.tsx` routes Transform commits through `handleTransformCommit` and scene-control command plumbing. | Reusable, still needs rejection/rollback audit |
| Object/Inspect selection mode | `SelectionModeControls` currently disables every workflow when `typedPickingAvailable` is false. | Gap |
| Material/target inspection | `SelectionTargetInspector` can display selected targets, but Object/Inspect fallback from plain node/material snapshot is incomplete. | Gap |
| Viewport hit-test fallback | `InteractionLayer`/scene-control support typed selection paths, but baseline must explicitly degrade to Outliner selection when hit-test is unavailable. | Gap |

## B2: Scene LookDev

| Area | Current signal | Baseline status |
|---|---|---|
| LookDev UI | `LookDevControls` renders Engine modes from capability and handles pending/applied diagnostics. | Reusable |
| LookDev capability | UI only shows modes present in `lookDevCapabilities.renderModes`; observed state can collapse to PBR-only. | Gap: needs unavailable reasons and capability audit |
| Authored lights | `LightInspectorPanel` and scene command handlers exist from `implement-model-lookdev-scene-controls`. | Reusable, still needs visible-effect smoke |
| Environment/background | `EnvironmentPanel` and Engine-owned environment command paths exist from LookDev work. | Reusable, still needs visible-effect smoke |
| Gray-state diagnostics | Panels use boolean `disabled` props and capability gates but do not consistently expose structured reasons. | Gap |

## Existing LookDev Implementation Reuse

The previous `implement-model-lookdev-scene-controls` change appears to cover contract-level B2 work:

- render mode UI and pending state
- authored light add/update/delete controls
- Engine-owned environment commands
- selection mode controls
- Route A boundary tests for no Webview 3D renderer

This baseline change should reuse those paths, then add:

- explicit disabled/degraded reasons
- Object/Inspect fallback when semantic picking is absent
- repository-owned GLB fixture and smoke coverage
- 1080p target vs 720p fallback reporting
- product-level visual verification for LookDev/light/background effects

## Implementation Update: 2026-06-01 12:33 HKT

Automated coverage added or re-run in this pass:

- Webview availability model now treats ordinary mesh nodes as object-editable assets, not character-editing targets. `resolveCharacterEditingTarget` only resolves Engine-declared `characterId`, `character`, or `character-instance` data.
- Face, Bone, Character Preview, Sculpt, and Animation controls are gated independently:
  - Face requires a resolved character target plus morph-region compatibility.
  - Bone character commands require a resolved character target plus bone/skeleton data.
  - Character Preview requires a resolved character target plus character region data.
  - Sculpt requires a selected topology-editable mesh that belongs to the resolved character target.
  - Animation remains clip-based so ordinary GLB animation playback is not blocked by character semantics.
- Object, Inspect, Transform, LookDev, Light, and Environment availability are not coupled to high-level character downgrade state.
- Store-level light reconciliation now covers authoritative SceneDelta visibility, patch, selection clearing, and deletion.

Validation completed:

- `pnpm --filter @neko-model/webview exec tsc --noEmit --pretty false`
- `pnpm --filter @neko-model/webview exec vitest run src/baseline/editingAvailability.test.ts src/RouteABoundary.test.ts src/components/CharacterPreviewModeSelector.test.tsx src/components/face/FaceEditorPanel.test.tsx src/components/bone-expression/BoneExpressionPanel.test.tsx src/components/SelectionModeControls.test.tsx src/components/Toolbar.test.tsx`
- `pnpm --filter @neko-model/webview exec vitest run src/stores/modelStore.prediction.test.ts src/scene/SceneDocument.test.ts src/components/LookDevControls.test.tsx src/components/panels/LightEnvironmentPanels.test.tsx src/baseline/editingAvailability.test.ts src/RouteABoundary.test.ts`
- `pnpm --filter @neko/neko-client exec vitest run src/__tests__/EngineClient.scene.test.ts src/__tests__/SceneControlSocket.test.ts`
- `cargo test -p neko-runtime-scene command_apply_`
- `cargo test -p neko-engine-scene-renderer authored_lights_replace_editor_light_rig`
- `cargo test -p neko-engine-scene-renderer viewport_descriptor_selects_clay_as_distinct_lookdev_variant`
- `cargo test -p neko-engine-kernel environment_load_diagnostics_are_drained_once`
- `cargo test -p neko-host-api scene_stream_descriptor_reflects_effective_lookdev_mode`
- `cargo test -p neko-host-api scene_stream_descriptor_reflects_h264_experiment_settings`

Manual-only validation still required before closing the visual smoke tasks:

- Load the repository-generated `basic-editable.glb` in the VSCode extension Webview and verify B0-B2 visible behavior: Engine stream display, camera orbit/pan/zoom, Outliner selection, Inspector, Transform, LookDev mode switch, authored light, and background/environment edit.
- Load local `/Users/feng/Git/neko-test/test.glb` as the larger manual fixture and verify the same B0-B2 path.
- Confirm visible render output changes for LookDev, light, and background/environment using Chrome DevTools or the VSCode extension debugger. Current automated tests prove contracts, reconciliation, descriptors, and command handling; they do not prove pixel-visible Webview output.
