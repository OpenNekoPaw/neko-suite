## Rollback Status

- 2026-06-01: Implementation code for this change was rolled back after runtime testing showed the added control-flow path could delay visible camera/drag feedback by seconds. The implementation status below is reset to unfinished unless explicitly marked as audit/fixture work.
- Next implementation must enforce an immediate interaction hot path: local UI state updates first, Engine receives latest-only hot updates without SceneControl ack gating, and video/frame metadata reconciles final state asynchronously.
- 2026-06-02: Proposal/design/spec artifacts were restored after rollback cleanup left only `tasks.md`. They now include the hot-path constraints from `adr-neko-model-basic-editing-baseline.md`, `adr-viewport-stream-control-boundary.md`, and `viewport-semantic-control-review-checklist.md`.
- 2026-06-02: All model/client/engine implementation code for this change has been rolled back. The proposal remains active, but implementation progress is reset to document/audit-only status. Reimplementation must start from the old immediate viewport interaction path as a hard constraint.
- 2026-06-02: ADR/proposal/specs now explicitly prohibit modifying the restored interaction path, lowering Engine GPU performance, or lowering render quality as a default implementation strategy.
- 2026-06-02: Repository fixture source and generated `test-fixtures/model/basic-editable.glb` were added. CI smoke work can use this fixture; local `../neko-test/test.glb` remains manual-only.
- 2026-06-02: Reimplementation batch 1 kept the restored stream lifecycle intact: capability discovery now exposes supported/unsupported/unknown states, Object/Inspect stays available without semantic picking, Outliner selection opens the Inspector/Transform dock, and the performance overlay explicitly reports 1080p60 target vs effective stream fallback. VSCode debugger smoke confirmed local `../neko-test/test.glb` opened in `neko.neko-model` with an Engine stream (`39 objects`, Engine port `55593`, revision `1`) without restarting or adding streams during validation.
- 2026-06-02: Reimplementation batch 2 verified Transform authoring: numeric Transform and viewport gizmo commits use SceneCommand envelopes with base revisions, predictions roll back on rejected ACKs and reconcile through SceneDelta/render metadata, and Route A boundary tests prevent high-frequency Transform from returning to Extension Host `updateTransform` postMessage paths.
- 2026-06-02: Reimplementation batch 3 tightened LookDev/light/environment control coverage without touching stream lifecycle: LookDev mode buttons now stay visible for baseline modes and expose supported/unsupported/unknown diagnostics, light/environment panels retain localized disabled reasons, and existing SceneDelta/client/Rust tests cover state reconciliation. Visual Engine-output smoke for LookDev/light/background remains open.
- 2026-06-02: Reimplementation batch 4 verified higher-level character downgrade: selected ordinary mesh nodes no longer satisfy character-authoring selection, Face/Bone/Character Preview controls expose asset or morph/bone compatibility reasons, and baseline Object/Inspect/Transform/LookDev/light/background controls remain independent.
- 2026-06-02: Reimplementation batch 5 reinforced the restored hot path without changing stream lifecycle: latest-only backpressure tests now prove frames already submitted to WebCodecs/VideoToolbox continue to output, mesh/light drag tests prove local prediction appears before transform ACK, and boundary tests require camera/wheel/keyboard/transform/light/slider controls to stay off stream restart/profile lifecycle paths.
- 2026-06-02: Reimplementation batch 6 removed LookDev switching from the video stream lifecycle: LookDev buttons now send `viewport-settings-update` through scene-control, keep the current H.264 stream alive, and only mark applied from current-stream descriptor/frame metadata. Boundary tests now fail if LookDev requested/applied mode becomes a stream effect dependency or if Webview exposes restart-stream UI copy.
- 2026-06-03: Reimplementation batch 7 removed the remaining camera-to-Engine GOP reconfigure path: `VideoViewport` no longer sends `streamProfile/profileTtlMs` from camera hot updates, Engine `ViewportStreamInteractionProfile::Interactive` no longer changes the encoder contract, and `viewport-settings-update` now applies live `renderMode/helperPassesEnabled/showGrid` state without stream restart or scene revision mutation. Capabilities now advertise `liveViewportSettings: true`; helper/grid changes send live scene-control commands instead of restarting the stream.
- 2026-06-03: Reimplementation batch 8 isolated live viewport settings failures from the global viewport interaction state: LookDev/helper `viewport-settings-update` ACKs are tracked by seq, rejected live settings update only the local LookDev diagnostic, and global SceneControl `error`/resync is not used for render-only viewport settings. Route A boundary tests now guard this failure isolation alongside the no stream restart / no GOP reconfigure constraints.

## 0. Hard Constraint Gates

- [x] 0.1 Add or update boundary tests proving baseline-editing code does not modify, replace, reorder, or ACK-gate the restored camera/orbit/drag/slider interaction path.
- [x] 0.2 Add or update perf checks proving baseline-editing code does not lower Engine GPU path, zero-copy/hardware encode path, stream resolution, DPR, FPS target, bitrate, or introduce hot-path CPU readback.
- [x] 0.3 Add or update visual checks proving baseline-editing code does not lower PBR/Clay/Wireframe/Normal/Depth quality, antialiasing, shadows/AO, tone mapping, material fidelity, background/environment, or 1080p edge clarity.
- [x] 0.4 Run VSCode extension debugger smoke on the fixed repository fixture and local `../neko-test/test.glb` before marking any B0-B2 implementation task complete.

## 1. Baseline Audit And Fixture

- [x] 1.1 Audit current B0-B2 behavior against `adr-neko-model-basic-editing-baseline.md`, including stream visibility, Object/Inspect selection, Transform, LookDev, light CRUD, and background/environment controls.
- [x] 1.2 Record which `implement-model-lookdev-scene-controls` paths already satisfy B2 product behavior and which only satisfy contract-level tests.
- [x] 1.3 Add or generate a redistributable minimal GLB fixture for CI with at least one mesh node, one material slot, non-empty bounds, and stable identifiers.
- [x] 1.4 Add fixture documentation that distinguishes the repository fixture from local-only `../neko-test/test.glb`.

## 2. Disabled And Degraded Diagnostics

- [x] 2.1 Define a typed disabled/degraded reason model for Engine readiness, scene-control status, missing capability, missing selection, asset incompatibility, and runtime diagnostics.
- [x] 2.2 Add Chinese and English i18n strings for all baseline disabled/degraded reasons and short tooltip/status labels.
- [x] 2.3 Wire disabled reason derivation into LookDev, SelectionModeControls, CharacterPreviewModeSelector, Face/Bone panels, Light controls, Environment controls, Transform/Inspector, and toolbar affordances.
- [x] 2.4 Ensure runtime Engine ack/reject/query diagnostics can update local degraded state even when static capability discovery enabled the control.
- [x] 2.5 Add Webview unit tests for disabled reason rendering and for silent gray-state regressions.

## 3. Capability And Stream Baseline

- [x] 3.1 Normalize Engine capability discovery in `@neko/neko-client` so render modes, authored lights, environment, typed picking, and live settings expose explicit supported/unsupported/unknown states.
- [x] 3.2 Verify or add Engine descriptor metadata for effective resolution, fps, render mode, and fallback diagnostics.
- [x] 3.3 Make Neko Model Webview show effective 1080p/60fps target or explicit 720p/lower fallback reason without misreporting the active stream.
- [x] 3.4 Add tests for over-optimistic and over-conservative capability discovery reconciliation.
- [ ] 3.5 Validate B0 stream behavior with the repository GLB fixture and local `../neko-test/test.glb` manual path.

## 4. Object And Inspect Fallback Editing

- [x] 4.1 Change selection workflow gating so Object and Inspect remain available without `characterRegions` or advanced semantic typed picking.
- [x] 4.2 Ensure Outliner selection updates selected node state and opens Transform/Inspector for ordinary mesh nodes.
- [x] 4.3 Ensure Inspect can display selected node/material snapshot or query data without Webview glTF/VRM parsing.
- [x] 4.4 Wire Engine node-level or target-level hit-test fallback if available; otherwise surface an explicit viewport hit-test unavailable reason while keeping Outliner selection usable.
- [x] 4.5 Add tests that ordinary GLB assets can use Object/Inspect while Face Region remains disabled with an asset-compatibility reason.

## 5. Transform And Scene Command Reconciliation

- [x] 5.1 Verify TransformPanel commits ordinary node translation, rotation, and scale through reliable SceneCommand envelopes with base revision and sequence.
- [x] 5.2 Ensure Transform pending state rolls back on Engine rejection and reconciles on ack, SceneDelta, snapshot, or compatible frame metadata.
- [x] 5.3 Add tests for stale revision rejection, invalid target diagnostics, and successful Transform SceneDelta reconciliation.
- [x] 5.4 Confirm Extension Host is not on the high-frequency Transform command path.

## 6. LookDev, Light, And Background Product Baseline

- [x] 6.1 Audit LookDevControls so PBR, Clay, Wireframe, Normal, and Depth buttons are enabled only from capability/context and always show unavailable reasons when disabled.
- [ ] 6.2 Verify LookDev switching visibly changes Engine output for the repository GLB fixture and does not mutate material slots.
- [ ] 6.3 Verify authored light add/update/delete/visibility/transform affects Engine-rendered output and reconciles through SceneDelta/snapshot.
- [ ] 6.4 Verify background color or environment clear/set affects Engine-rendered output and exposes pending/failure diagnostics.
- [x] 6.5 Add focused Webview/client/Rust tests for LookDev, light, and background baseline regressions not already covered by `implement-model-lookdev-scene-controls`.

## 7. Character Tool Gating And Downgrade

- [x] 7.1 Gate Face, Bone, Animation, Sculpt, and character preview controls by selected character id plus morph/bone/clip/topology compatibility rather than only by generic scene-control ready state.
- [x] 7.2 Show explicit downgrade reasons for ordinary GLB/VRM assets that lack morph, skeleton, animation, or region metadata.
- [x] 7.3 Keep Object, Inspect, Transform, LookDev, light, and background controls available when higher-level character tools are downgraded.
- [x] 7.4 Add tests for ordinary mesh downgrade and rigged/character asset enablement paths.

## 8. Route A Boundary And Smoke Validation

- [x] 8.1 Extend Route A boundary tests to cover baseline editing code paths and ensure no Webview Three.js/R3F visible model renderer or glTF/VRM parser is introduced.
- [ ] 8.2 Add an E2E or integration smoke test that loads the repository GLB fixture and completes B0-B2: display, camera, selection, Inspector, Transform, LookDev, and authored light.
- [x] 8.3 Run focused Webview tests for controls, store, selection, LookDev, and panels.
- [x] 8.4 Run focused `@neko/neko-client` tests for capability and scene-control diagnostic normalization.
- [x] 8.5 Run targeted Rust tests for render viewport descriptor/capability, scene command diagnostics, light/background state, and hit-test if changed.
- [x] 8.6 Update documentation or ADR notes with final implemented phase boundaries and any remaining manual-only validation.

## 9. Immediate Interaction Hot Path Regression Guards

- [x] 9.1 Add Webview boundary/unit tests proving camera orbit, wheel, keyboard camera action, transform drag, light drag, and continuous slider paths update local intent before Engine acknowledgement.
- [x] 9.2 Add tests proving high-frequency interactions do not call `startSceneRenderStream()`, do not write `streamProfile` into stream lifecycle state, and do not destroy/recreate the H.264 stream.
- [x] 9.3 Add tests proving interaction profile changes use `H264StreamClient.updateBackpressurePolicy()` or equivalent existing-client policy update, without WebCodecs reset/close/recreate.
- [x] 9.4 Add tests or instrumentation proving latest-only mode does not suppress frames already submitted to WebCodecs/VideoToolbox.
- [x] 9.5 Add Engine/client tests proving high-frequency interaction policy updates keep the active stream and encoder contract stable without requiring a new stream descriptor.
- [ ] 9.6 Run VSCode extension debugger smoke for local `../neko-test/test.glb` and repository fixture, verifying camera/drag visible feedback remains immediate under frequent operations.
