## 1. Contract And Projection Planning

- [x] 1.1 Decide whether dynamic editor camera `near`/`far` belongs on `EditorCameraRig`, `ViewportCameraRef`, or a separate viewport projection policy object, and update `design.md` if the chosen shape differs from the current proposal.
- [x] 1.2 Add optional editor camera projection fields to the Proto/shared contract when needed, regenerate types, and keep absent fields backward-compatible with existing Engine defaults.
- [x] 1.3 Add `@neko/neko-client` normalizer/serializer coverage for optional editor camera projection fields and any surface hit metadata used by viewport zoom.

## 2. Webview Camera Safety

- [x] 2.1 Audit the existing Model Webview AABB clipping guard against the `model-viewport-camera-zoom` spec and adjust edge cases for selected subtrees, multi-target selection, invisible nodes, and off-bounds orbit targets.
- [x] 2.2 Implement scale-aware editor camera near/far calculation from focused selection or scene bounds, including configured minimum/maximum clamps and far/near ratio protection.
- [x] 2.3 Send dynamic editor camera projection values with the Model viewport descriptor without changing imported scene camera semantics.
- [x] 2.4 Update wheel, keyboard, and drag zoom paths so every default zoom route uses the same safe radius and dynamic projection policy.

## 3. Surface-Anchored Zoom

- [x] 3.1 Define a short-lived surface hit cache for wheel bursts keyed by viewport, scene revision, cursor position, and selection filter.
- [x] 3.2 Request or consume Engine hit-test results for cursor surface points without synchronously blocking high-frequency wheel input.
- [x] 3.3 Use valid cursor hits as temporary zoom anchors and fall back to selected/scene bounds when hits are missing, stale, or invalid.
- [x] 3.4 Add tests proving stale hits are ignored and bounds fallback still prevents clipping.

## 4. Internal Viewing And Feedback

- [x] 4.1 Add a minimal explicit clipping-guard bypass mode or modifier gesture for internal inspection, with clear state naming.
- [x] 4.2 Add non-modal viewport feedback when zoom is clamped by the clipping guard or intentionally bypassed.
- [x] 4.3 Keep object transform scale unrestricted while adding only advisory warnings for suspicious scale where relevant.

## 5. Validation

- [x] 5.1 Add focused Model Webview unit tests for 1:1 centered models, tiny selected props, large scenes, off-bounds targets, selected subtrees, and multi-selection bounds.
- [x] 5.2 Add Proto/generated type and EngineClient contract tests if editor camera projection or hit-test DTOs change.
- [x] 5.3 Add Rust Engine tests for camera projection ingestion or hit-test/raycast behavior if Engine code changes.
- [x] 5.4 Run `pnpm --filter @neko-model/webview test`, `pnpm --filter @neko-model/webview exec tsc --noEmit`, `pnpm check:3d-route-a-boundaries`, and `pnpm smoke:webview:runtime`.
- [x] 5.5 If Proto or Engine paths change, run the relevant generated-contract checks and Engine test/smoke commands, or record explicit residual risk.

Validation note: `pnpm ci:local:proto` regenerated types successfully and then failed only at `git diff --exit-code packages/neko-types/src/generated/` because this change intentionally updates generated scene types, fixture, and contract assertions.
