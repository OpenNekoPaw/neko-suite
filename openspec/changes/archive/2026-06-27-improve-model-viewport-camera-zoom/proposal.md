## Why

Model viewport zoom currently behaves as camera dolly toward the orbit target, so creators can accidentally push the editor camera through geometry or hit the near clip plane while expecting surface magnification. This is especially visible when editing 1:1 models, small props, and detailed parts such as eyes, jewelry, buttons, or mechanical components.

The Scene ADR for model viewport camera zoom establishes the desired product behavior: default zoom should not misclip, small objects still need close-up inspection, and internal inspection should be explicit rather than accidental.

## What Changes

- Add a Scene/Model viewport camera zoom capability that defines safe default zoom, surface-anchored zoom, dynamic editor camera near/far behavior, and explicit internal viewing modes.
- Extend the Model Webview camera state and controls so wheel/keyboard/drag zoom use a scale-aware safety constraint instead of fixed world-distance limits.
- Introduce a contract path for editor camera projection settings and surface hit information when precision beyond AABB bounds is needed.
- Add user-visible feedback when clipping guards stop zoom or when a deliberate internal viewing mode bypasses the guard.
- Preserve creative freedom by not limiting object transform scale; warnings may be added for suspicious scales, but the viewport must adapt to the content.

## Capabilities

### New Capabilities

- `model-viewport-camera-zoom`: Covers safe model viewport zoom, surface anchoring, dynamic near/far for small objects, explicit internal viewing modes, and validation requirements for Scene/Model camera interactions.

### Modified Capabilities

- None.

## Impact

- Affected packages: `packages/neko-model/packages/webview`, `packages/neko-client`, `packages/neko-types`, `packages/neko-proto`, and Rust scene runtime/renderer crates if dynamic editor camera near/far or hit-test contracts require engine support.
- Affected docs: `docs/domains/scene/adr-model-viewport-camera-zoom.md` and Scene domain architecture references.
- Affected behavior: Model viewport wheel/keyboard/drag zoom, frame selection, editor camera projection, clipping guard feedback, and internal inspection modes.
- Compatibility: no durable project format change is expected. Any new Proto or EngineClient fields must be optional and backward-safe during the prelaunch transition.
