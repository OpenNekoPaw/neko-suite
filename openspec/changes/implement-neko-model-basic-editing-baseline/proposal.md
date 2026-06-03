## Why

`neko-model` already exposes many Route A controls, but ordinary GLB/VRM assets still do not reliably complete the basic visual editing loop: see the model, select an object, edit Transform/LookDev/lights, and receive authoritative Engine feedback. This blocks higher-level Headshot/AI workflows because generated assets cannot become usable creative objects until the baseline editor is dependable.

The first implementation attempt for this change was rolled back after runtime testing showed visible camera/drag feedback could be delayed by seconds. The proposal remains valid, but the old immediate interaction path is now a hard compatibility contract: local UI intent first, Engine latest-only hot updates second, and video/frame metadata reconciliation asynchronously. New capability diagnostics, LookDev controls, selection queries, and SceneControl status handling may observe or reconcile this path, but MUST NOT replace it, gate it, or route it through a reliable acknowledgement flow.

This reimplementation also has two non-negotiable quality constraints: it MUST NOT lower the Engine GPU performance baseline, and it MUST NOT lower render quality to make control wiring appear responsive. Fixes must preserve the existing Engine GPU/zero-copy/hardware-encode path and the current 1080p/60fps visual target unless an explicit, diagnosed fallback is required by the host.

This change is intentionally narrower than Headshot/AI, semantic face regions, or texture projection. It makes `neko-model` a reliable model editing surface first; advanced asset-conversion workflows can then land on a predictable editor instead of a set of gray or delayed controls.

## What Changes

- Add a `neko-model` Basic Editing Baseline that treats B0-B2 as current P0: visual stream, object/material selection, Transform editing, LookDev mode switching, light CRUD, and background/environment basics.
- Make disabled model UI controls explain why they are unavailable using structured, localized diagnostics instead of silent gray states.
- Decouple Object and Inspect workflows from advanced semantic `typedPicking`/`characterRegions` so ordinary GLB/VRM files remain editable through Outliner, selected-node Inspector, and Engine hit-test fallback where available.
- Require capability discovery to be reconciled with actual Engine ack/reject/query diagnostics so Webview state follows runtime truth when static capabilities are wrong.
- Preserve the camera/drag/slider hot path: no ACK gating, no Extension Host forwarding, no stream restart, no WebCodecs reset, and no suppression of frames already submitted to hardware decode.
- Treat the pre-change camera/orbit/drag/slider path as a required legacy baseline. Any new baseline-editing implementation that changes this path MUST include a rollback switch or prove equivalence with focused tests and VSCode debugger smoke before it can remain enabled.
- Preserve GPU performance: no hot-path CPU readback, no GPU-to-CPU-to-Webview frame transfer, no disabling zero-copy/hardware encoder, no default resolution/DPR/FPS/bitrate downgrade, and no extra synchronous render or encode waits.
- Preserve render quality: no default degradation of PBR, Clay lighting, normals/tangents, sRGB/tone mapping, shadows, AO, antialiasing, texture sampling, material precision, helper pass composition, or 1080p edge clarity.
- Add a repository-owned GLB fixture strategy for CI while keeping `../neko-test/test.glb` as a local manual test input only.
- Keep Route A boundaries unchanged: Webview remains a control surface and must not parse mesh/glTF/VRM or introduce a Webview 3D renderer as visual truth.

## Implementation Boundaries

- B0 visual stream and camera navigation are the first gate. Do not widen UI enablement until camera/wheel/drag feedback is proven immediate under frequent operations.
- The previous immediate interaction path is the compatibility baseline. Diagnostic wiring, selection fallback, LookDev readiness, stream descriptor reconciliation, and SceneControl error handling are not allowed to set global states that disable or delay this path.
- The Engine GPU render path and current stream quality are compatibility baselines. New baseline-editing code is not allowed to trade GPU performance or visual quality for control availability.
- B1 object/inspect fallback must work without semantic picking. Outliner selection is a valid baseline fallback when Engine hit-test is unavailable.
- B2 LookDev/light/background work must prove visible Engine output changes, not only command acknowledgements.
- B3/B4 character, semantic, Headshot, AI provider, and texture projection controls remain gated by asset compatibility and are not part of this change.
- Fixture work is required before CI smoke can be closed; the restored fixture README only defines requirements and does not count as the fixture implementation.

## Success Criteria

- Opening the repository model fixture completes B0-B2: Engine stream visible, camera immediate, object selected, Inspector populated, Transform edited, LookDev switched, authored light added, and background/environment changed.
- A normal GLB/VRM with no character metadata still has Object, Inspect, Transform, LookDev, light, and background controls when Engine supports them.
- Any disabled or degraded control shows a localized reason derived from Engine readiness, scene-control state, capability, runtime diagnostic, selection, or asset compatibility.
- Frequent camera/drag/slider operations show no stream restart, no ACK-gated local feedback, no WebCodecs reset, and no suppression of frames already submitted to hardware decode.
- A failed hit-test/query, stale capability diagnostic, rejected LookDev command, or disconnected optional control channel does not break the already-active camera/orbit/drag stream. The viewport keeps accepting local input and continues rendering the last active stream while the failing control is degraded independently.
- GPU performance metrics for the fixed GLB fixture do not regress relative to the restored baseline: render/frame time, encode time, zero-copy/hardware encode path, coded size, DPR, presentation scale, and dropped/backpressure counters remain within expected tolerance.
- Render quality for the fixed GLB fixture does not regress relative to the restored baseline: PBR/Clay/Wireframe/Normal/Depth modes, antialiasing, shadows/AO, tone mapping, texture sampling, material appearance, background/environment, and 1080p edge clarity remain intact.
- Effective resolution, FPS target, DPR/canvas scale, decode/presentation health, scene-control health, and metadata delay are visible enough to distinguish GPU/render issues from host presentation or decode behavior.

## Capabilities

### New Capabilities

- `model-basic-editing-baseline`: Defines the neko-model baseline for ordinary GLB/VRM visual editing, including B0-B2 acceptance, disabled-control diagnostics, fallback selection, fixture requirements, performance/hot-path constraints, and Route A compliance.

### Modified Capabilities

- `webview-engine-control-surface`: Require visible degraded/disabled reasons for model controls and ensure Object/Inspect flows are not blocked by higher-level semantic picking.
- `scene-authoring-contracts`: Require baseline Transform/light/background commands and selection mirrors to remain reliable for ordinary scene nodes with ack/reject/delta reconciliation.
- `engine-render-viewport`: Require baseline 1080p target stream reporting, explicit 720p fallback diagnostics, node-level hit-test/query fallback semantics, and runtime interaction stream profile support for ordinary model editing.

## Impact

- `packages/neko-model/packages/webview`: toolbar/HUD/panel disabled-state diagnostics, selection mode gating, Outliner/Inspector fallback paths, i18n strings, hot-path interaction guards, and focused unit tests.
- `packages/neko-client`: capability discovery normalization, scene-control ack/reject/query diagnostic propagation, and H.264 backpressure policy updates without stream lifecycle restart.
- `packages/neko-engine`: render viewport descriptor/capability reporting, scene-control command diagnostics, light/background command behavior, runtime stream profile application, and optional node-level hit-test support if missing.
- `packages/neko-proto` / `packages/neko-types`: only touched if existing DTOs cannot represent disabled reasons, capability refresh, baseline query diagnostics, or runtime stream diagnostics.
- `test-fixtures` or model test fixtures: add a redistributable minimal GLB fixture for CI smoke coverage.
- Documentation: keep `docs/architecture/adr-neko-model-basic-editing-baseline.md` as the source architectural reference and use this OpenSpec change for implementation tracking.

## Rollback And Safety

- If a UI feature is not ready, degrade only that control with a diagnostic while keeping the Engine stream and Outliner selection usable.
- If hot-path latency regresses, roll back the new interaction/control-flow path first. The old immediate camera/orbit/drag/slider path is the safe baseline and takes priority over disabled-state diagnostics, LookDev wiring, hit-test fallback, or new control availability logic.
- If GPU metrics or render quality regress, roll back the new control-flow/render integration before accepting lower resolution, lower DPR, lower bitrate, disabled passes, CPU readback, or Webview rendering fallback as a default.
- If capability discovery is inaccurate, prefer runtime Engine ack/reject/query diagnostics over static capability assumptions.
- If repository fixture generation is delayed, keep CI smoke tasks open and continue using `../neko-test/test.glb` only for local manual debugger checks.
