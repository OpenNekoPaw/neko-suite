# Baseline B0-B2 Audit

Date: 2026-06-01

Status update: implementation code from the first pass was rolled back after runtime testing showed added control-flow paths could delay camera/drag feedback by seconds. This audit remains useful as product-state input, but reusable implementation signals below must be revalidated before marking tasks complete.

This audit records the current product-state gap for `neko-model` Basic Editing Baseline before implementation. It separates paths that already have useful Route A code from paths that still need product-level enablement or diagnostics.

## B0: Visual Stream

| Area | Current signal | Baseline status |
|---|---|---|
| Engine visual truth | `App.tsx` mounts `VideoViewport` whenever `enginePort !== null`; Route A boundary tests assert no persistent R3F model fallback. | Reusable |
| Camera navigation | `VideoViewport` owns orbit interaction and forwards camera mutation to Engine. | Reusable, but must be revalidated for no ACK gating, no stream restart, and no decoder reset |
| Effective resolution | Performance overlay exposes stream/render diagnostics, but baseline 1080p target vs 720p fallback is not a user-facing contract yet. | Gap |
| Empty/no-stream state | Route A stream absence is visible as unavailable/error states, but not all baseline controls explain dependency on Engine readiness. | Gap |

## B1: Object-Level Editing

| Area | Current signal | Baseline status |
|---|---|---|
| Outliner selection | `SceneTree` delegates selection through shared `TreeView` and calls `onSelectNode`. | Reusable |
| Transform inspector | `TransformPanel` can edit numeric Transform fields and call `onTransformCommit`. | Reusable |
| Scene command path | `App.tsx` routes Transform commits through `handleTransformCommit` and scene-control command plumbing. | Reusable, still needs rejection/rollback audit |
| High-frequency transform drag | Must not be coupled to SceneCommand ACK or stream lifecycle. | Gap |
| Object/Inspect selection mode | `SelectionModeControls` can disable workflows when `typedPickingAvailable` is false. | Gap |
| Material/target inspection | `SelectionTargetInspector` can display selected targets, but Object/Inspect fallback from plain node/material snapshot is incomplete. | Gap |
| Viewport hit-test fallback | `InteractionLayer`/scene-control support typed selection paths, but baseline must explicitly degrade to Outliner selection when hit-test is unavailable. | Gap |

## B2: Scene LookDev

| Area | Current signal | Baseline status |
|---|---|---|
| LookDev UI | `LookDevControls` renders Engine modes from capability and handles pending/applied diagnostics. | Reusable |
| LookDev capability | UI only shows modes present in `lookDevCapabilities.renderModes`; observed state can collapse to PBR-only. | Gap: needs unavailable reasons and capability audit |
| Authored lights | `LightInspectorPanel` and scene command handlers exist from `implement-model-lookdev-scene-controls`. | Reusable, still needs visible-effect smoke |
| Light drag/update hot path | Light position drag must use local feedback and latest-only hot update before final commit. | Gap |
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
- hot-path validation for camera/drag/slider: no ACK gating, no stream restart, no decoder reset, no already-submitted frame suppression
- product-level visual verification for LookDev/light/background effects

## Validation Notes From Rolled-back Pass

The rolled-back pass had useful automated coverage, but those results do not prove the current worktree is complete after rollback. Treat them as reference for the next implementation:

- Webview availability model should treat ordinary mesh nodes as object-editable assets, not character-editing targets.
- Face, Bone, Character Preview, Sculpt, and Animation controls should be gated independently by asset compatibility.
- Object, Inspect, Transform, LookDev, Light, and Environment availability should not be coupled to high-level character downgrade state.
- Store-level light reconciliation should cover authoritative SceneDelta visibility, patch, selection clearing, and deletion.

Manual validation remains required before closing visual smoke tasks:

- Load the repository-generated `basic-editable.glb` in the VSCode extension Webview and verify B0-B2 visible behavior: Engine stream display, camera orbit/pan/zoom, Outliner selection, Inspector, Transform, LookDev mode switch, authored light, and background/environment edit.
- Load local `../neko-test/test.glb` as the larger manual fixture and verify the same B0-B2 path.
- Confirm visible render output changes for LookDev, light, and background/environment using Chrome DevTools or the VSCode extension debugger. Automated tests can prove contracts, reconciliation, descriptors, and command handling; they do not by themselves prove pixel-visible Webview output.
