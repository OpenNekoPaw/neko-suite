## Why

`neko-model` already exposes many Route A controls, but ordinary GLB/VRM assets still do not reliably complete the basic visual editing loop: see the model, select an object, edit Transform/LookDev/lights, and receive authoritative Engine feedback. This blocks higher-level Headshot/AI workflows because generated assets cannot become usable creative objects until the baseline editor is dependable.

## What Changes

- Add a `neko-model` Basic Editing Baseline that treats B0-B2 as current P0: visual stream, object/material selection, Transform editing, LookDev mode switching, light CRUD, and background/environment basics.
- Make disabled model UI controls explain why they are unavailable using structured, localized diagnostics instead of silent gray states.
- Decouple Object and Inspect workflows from advanced semantic `typedPicking`/`characterRegions` so ordinary GLB/VRM files remain editable through Outliner, selected-node Inspector, and Engine hit-test fallback where available.
- Require capability discovery to be reconciled with actual Engine ack/reject/query diagnostics so Webview state follows runtime truth when static capabilities are wrong.
- Add a repository-owned GLB fixture strategy for CI while keeping `../neko-test/test.glb` as a local manual test input only.
- Keep Route A boundaries unchanged: Webview remains a control surface and must not parse mesh/glTF/VRM or introduce a Webview 3D renderer as visual truth.

## Capabilities

### New Capabilities

- `model-basic-editing-baseline`: Defines the neko-model baseline for ordinary GLB/VRM visual editing, including B0-B2 acceptance, disabled-control diagnostics, fallback selection, fixture requirements, and Route A compliance.

### Modified Capabilities

- `webview-engine-control-surface`: Require visible degraded/disabled reasons for model controls and ensure Object/Inspect flows are not blocked by higher-level semantic picking.
- `scene-authoring-contracts`: Require baseline Transform/light/background commands and selection mirrors to remain reliable for ordinary scene nodes with ack/reject/delta reconciliation.
- `engine-render-viewport`: Require baseline 1080p target stream reporting, explicit 720p fallback diagnostics, and node-level hit-test/query fallback semantics for ordinary model editing.

## Impact

- `packages/neko-model/packages/webview`: toolbar/HUD/panel disabled-state diagnostics, selection mode gating, Outliner/Inspector fallback paths, i18n strings, and focused unit tests.
- `packages/neko-client`: capability discovery normalization and scene-control ack/reject/query diagnostic propagation.
- `packages/neko-engine`: render viewport descriptor/capability reporting, scene-control command diagnostics, light/background command behavior, and optional node-level hit-test support if missing.
- `packages/neko-proto` / `packages/neko-types`: only touched if existing DTOs cannot represent disabled reasons, capability refresh, or baseline query diagnostics.
- `test-fixtures` or model test fixtures: add a redistributable minimal GLB fixture for CI smoke coverage.
- Documentation: keep `adr-neko-model-basic-editing-baseline.md` as the source architectural reference and use this OpenSpec change for implementation tracking.
