## Context

Neko Model uses a streamed Engine viewport with Webview-owned gesture handling and Engine-owned scene/render authority. The current editor camera path is target-based Orbit dolly: wheel/keyboard/drag zoom changes the camera radius around an orbit target. That is fast, but it does not match the creator expectation that the cursor surface is being magnified, and it can push the near clip plane or camera origin through geometry.

The Scene ADR `docs/domains/scene/adr-model-viewport-camera-zoom.md` sets the intended behavior:

- Default zoom does not accidentally clip or enter visible geometry.
- Small objects remain inspectable through scale-aware editor camera near/far values.
- Entering object volume is allowed only through explicit internal inspection modes.
- Object transform scale remains creative data and must not be hard-limited to fix viewport behavior.

This change is L2/L3 risk depending on implementation depth. Webview-only AABB guards are L1/L2; Proto/Engine hit-test or editor camera near/far contracts are L3 and need contract plus runtime smoke validation.

## Goals / Non-Goals

**Goals:**

- Define a contract-first path for safe default Model viewport zoom.
- Add scale-aware editor camera projection behavior so small props can be inspected without disabling clipping protection.
- Prefer surface-anchored zoom when a cursor surface hit is available, while preserving an AABB fallback.
- Add explicit user feedback and modes for clipping guard stops and deliberate internal viewing.
- Keep Webview, EngineClient, Proto, and Rust Engine responsibilities separated and testable.

**Non-Goals:**

- Do not restrict authoring object scale or reject tiny/huge models.
- Do not replace the Engine renderer or introduce a Webview-local Three/R3F runtime.
- Do not change durable `.nkm` project camera semantics unless a later format proposal explicitly covers it.
- Do not make X-Ray, section planes, or walk/fly camera fully feature-complete in the first implementation slice; define the extension point and minimum bypass semantics.

## Decisions

### Decision 1: Preserve creative scale; constrain editor camera interaction

The viewport will adapt to scene/selection scale instead of enforcing object transform ranges. Suspicious scale warnings can live in inspectors or export validation, but they are advisory.

Rejected alternative: clamp object scale to a normal range. That would break legitimate small props, stylized scale, imported CAD/VRM/GLTF assets, and creator intent.

### Decision 2: Use a layered clipping guard

Zoom safety will use progressive precision:

1. selected/scene AABB safety radius as the local fallback;
2. Engine hit-test/raycast or depth result for cursor surface anchoring;
3. BVH/depth camera collision later if performance and renderer support justify it.

The safe radius remains:

```text
safeMinRadius = frontDepth + near + margin
```

where `frontDepth` is computed against selected bounds or the surface hit along the current view direction.

Rejected alternative: only lower `near` globally. Lowering near improves micro views but does not prevent camera origin from entering geometry and can reduce depth precision.

### Decision 3: Add optional editor camera projection fields through shared contracts

The editor viewport descriptor/camera ref path should carry optional editor camera `near` and `far` values on `EditorCameraRig` when dynamic projection is enabled. These projection values describe the editor camera itself, while `ViewportCameraRef` continues to identify whether the viewport uses a scene camera or an editor camera. The fields must be optional and backward-safe, with Engine defaults preserved when fields are absent.

Contract order:

1. Update Proto/shared generated types or existing Engine camera DTOs.
2. Update `@neko/neko-client` normalizers/serializers.
3. Update Model Webview descriptor creation and store calculations.
4. Update Rust scene renderer/runtime ingestion if needed.

Rejected alternatives:

- Put `near/far` directly on `ViewportCameraRef`. That mixes camera selection semantics with editor projection parameters and would be awkward for imported scene cameras.
- Add a separate viewport projection policy object. That creates a parallel policy contract before the editor camera has multiple projection strategies.
- Keep `near/far` as Webview-only math. That would make Webview safety disagree with Engine projection, producing false confidence or unexpected clipping.

### Decision 4: Surface-anchored zoom is preferred, AABB zoom remains fallback

When a wheel event has a valid cursor hit, zoom should treat that hit as the local focal point and stop before the surface. When hit-test is unavailable, delayed, filtered, or misses, zoom falls back to the existing orbit target and selected/scene bounds guard.

The Webview owns gesture timing and latest-only input behavior. Engine owns hit-test accuracy. A hit result may be cached briefly for wheel bursts, but stale hits must expire quickly and must not become durable state.

Rejected alternative: synchronously wait for Engine hit-test on every wheel event. That would risk visible input latency and stream/control coupling.

### Decision 5: Internal viewing is an explicit mode or bypass

Default zoom will not enter object volume. Internal inspection requires a mode or temporary bypass:

- X-Ray / transparent viewing;
- section/clip plane;
- isolate/hide outer shell;
- walk/fly or free camera;
- modifier-key clipping guard bypass.

When bypassing the guard, the Webview must show a clear status so clipping is understood as intentional.

Rejected alternative: allow default zoom to enter geometry because some DCC workflows need it. That conflates accidental clipping with intentional inspection and makes normal surface editing unreliable.

## Risks / Trade-offs

- Dynamic near/far can reduce depth precision or cause z-fighting -> clamp near/far by scene radius, cap far/near ratio, and test large and small scenes.
- Engine hit-test may lag behind high-frequency wheel input -> use latest-only requests, short-lived cached hits, and AABB fallback.
- AABB fallback can be conservative for holes, concave meshes, and thin surfaces -> communicate this as fallback and prioritize Engine hit-test for default surface zoom.
- Guard feedback can become noisy -> only show feedback when zoom is actually clamped or bypassed, and keep it non-modal.
- Optional Proto fields can drift from generated TS/Rust handling -> add contract fixtures and normalizer tests before Webview usage.

## Migration Plan

1. Land Webview-only guard refinements and tests without durable format changes.
2. Add optional editor camera near/far and hit-test fields through Proto/shared/client contracts.
3. Enable dynamic editor camera projection in Model viewport descriptors.
4. Add surface-anchored zoom using Engine hit-test with AABB fallback.
5. Add explicit internal inspection/bypass UI feedback.

Rollback strategy: if dynamic projection or hit-test causes regressions, disable those paths behind Model viewport capability flags while retaining the AABB guard fallback. No project data migration is expected.

## Open Questions

- Which internal viewing entry point should ship first: modifier-key bypass, X-Ray, or section plane?
- What stale-hit TTL is acceptable for wheel bursts without causing surface jumps?
- Should clipping guard feedback live in the viewport HUD, status bar, or transient overlay?
