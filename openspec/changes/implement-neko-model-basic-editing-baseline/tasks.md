## Rollback Status

- 2026-06-01: Implementation code for this change was rolled back after runtime testing showed the added control-flow path could delay visible camera/drag feedback by seconds. The proposal/design artifacts remain as requirements input, but the implementation status below is reset to unfinished unless explicitly marked as audit/fixture work.
- Next implementation must enforce an immediate interaction hot path: local UI state updates first, Engine receives latest-only hot updates without SceneControl ack gating, and video/frame metadata reconciles final state asynchronously.

## 1. Baseline Audit And Fixture

- [x] 1.1 Audit current B0-B2 behavior against `adr-neko-model-basic-editing-baseline.md`, including stream visibility, Object/Inspect selection, Transform, LookDev, light CRUD, and background/environment controls.
- [x] 1.2 Record which `implement-model-lookdev-scene-controls` paths already satisfy B2 product behavior and which only satisfy contract-level tests.
- [x] 1.3 Add or generate a redistributable minimal GLB fixture for CI with at least one mesh node, one material slot, non-empty bounds, and stable identifiers.
- [x] 1.4 Add fixture documentation that distinguishes the repository fixture from local-only `../neko-test/test.glb`.

## 2. Disabled And Degraded Diagnostics

- [ ] 2.1 Define a typed disabled/degraded reason model for Engine readiness, scene-control status, missing capability, missing selection, asset incompatibility, and runtime diagnostics.
- [ ] 2.2 Add Chinese and English i18n strings for all baseline disabled/degraded reasons and short tooltip/status labels.
- [ ] 2.3 Wire disabled reason derivation into LookDev, SelectionModeControls, CharacterPreviewModeSelector, Face/Bone panels, Light controls, Environment controls, Transform/Inspector, and toolbar affordances.
- [ ] 2.4 Ensure runtime Engine ack/reject/query diagnostics can update local degraded state even when static capability discovery enabled the control.
- [ ] 2.5 Add Webview unit tests for disabled reason rendering and for silent gray-state regressions.

## 3. Capability And Stream Baseline

- [ ] 3.1 Normalize Engine capability discovery in `@neko/neko-client` so render modes, authored lights, environment, typed picking, and live settings expose explicit supported/unsupported/unknown states.
- [ ] 3.2 Verify or add Engine descriptor metadata for effective resolution, fps, render mode, and fallback diagnostics.
- [ ] 3.3 Make Neko Model Webview show effective 1080p/60fps target or explicit 720p/lower fallback reason without misreporting the active stream.
- [ ] 3.4 Add tests for over-optimistic and over-conservative capability discovery reconciliation.
- [ ] 3.5 Validate B0 stream behavior with the repository GLB fixture and local `../neko-test/test.glb` manual path.

## 4. Object And Inspect Fallback Editing

- [ ] 4.1 Change selection workflow gating so Object and Inspect remain available without `characterRegions` or advanced semantic typed picking.
- [ ] 4.2 Ensure Outliner selection updates selected node state and opens Transform/Inspector for ordinary mesh nodes.
- [ ] 4.3 Ensure Inspect can display selected node/material snapshot or query data without Webview glTF/VRM parsing.
- [ ] 4.4 Wire Engine node-level or target-level hit-test fallback if available; otherwise surface an explicit viewport hit-test unavailable reason while keeping Outliner selection usable.
- [ ] 4.5 Add tests that ordinary GLB assets can use Object/Inspect while Face Region remains disabled with an asset-compatibility reason.

## 5. Transform And Scene Command Reconciliation

- [ ] 5.1 Verify TransformPanel commits ordinary node translation, rotation, and scale through reliable SceneCommand envelopes with base revision and sequence.
- [ ] 5.2 Ensure Transform pending state rolls back on Engine rejection and reconciles on ack, SceneDelta, snapshot, or compatible frame metadata.
- [ ] 5.3 Add tests for stale revision rejection, invalid target diagnostics, and successful Transform SceneDelta reconciliation.
- [ ] 5.4 Confirm Extension Host is not on the high-frequency Transform command path.

## 6. LookDev, Light, And Background Product Baseline

- [ ] 6.1 Audit LookDevControls so PBR, Clay, Wireframe, Normal, and Depth buttons are enabled only from capability/context and always show unavailable reasons when disabled.
- [ ] 6.2 Verify LookDev switching visibly changes Engine output for the repository GLB fixture and does not mutate material slots.
- [ ] 6.3 Verify authored light add/update/delete/visibility/transform affects Engine-rendered output and reconciles through SceneDelta/snapshot.
- [ ] 6.4 Verify background color or environment clear/set affects Engine-rendered output and exposes pending/failure diagnostics.
- [ ] 6.5 Add focused Webview/client/Rust tests for LookDev, light, and background baseline regressions not already covered by `implement-model-lookdev-scene-controls`.

## 7. Character Tool Gating And Downgrade

- [ ] 7.1 Gate Face, Bone, Animation, Sculpt, and character preview controls by selected character id plus morph/bone/clip/topology compatibility rather than only by generic scene-control ready state.
- [ ] 7.2 Show explicit downgrade reasons for ordinary GLB/VRM assets that lack morph, skeleton, animation, or region metadata.
- [ ] 7.3 Keep Object, Inspect, Transform, LookDev, light, and background controls available when higher-level character tools are downgraded.
- [ ] 7.4 Add tests for ordinary mesh downgrade and rigged/character asset enablement paths.

## 8. Route A Boundary And Smoke Validation

- [ ] 8.1 Extend Route A boundary tests to cover baseline editing code paths and ensure no Webview Three.js/R3F visible model renderer or glTF/VRM parser is introduced.
- [ ] 8.2 Add an E2E or integration smoke test that loads the repository GLB fixture and completes B0-B2: display, camera, selection, Inspector, Transform, LookDev, and authored light.
- [ ] 8.3 Run focused Webview tests for controls, store, selection, LookDev, and panels.
- [ ] 8.4 Run focused `@neko/neko-client` tests for capability and scene-control diagnostic normalization.
- [ ] 8.5 Run targeted Rust tests for render viewport descriptor/capability, scene command diagnostics, light/background state, and hit-test if changed.
- [ ] 8.6 Update documentation or ADR notes with final implemented phase boundaries and any remaining manual-only validation.
