## Why

`implement-unified-viewport-protocol` delivered the shared viewport contract, ViewportShell, model migration, puppet migration, and live fallback diagnostics, but the remaining neko-live work depends on an engine-owned compositor stream that does not yet exist. Without a dedicated compositor contract, deleting neko-live's local R3F preview would remove functionality, while pretending the fallback is authoritative would preserve preview/export drift.

## What Changes

- Introduce an engine-owned Live Compositor stream that composes background, puppet, model/scene, camera, and overlay layers into one H.264 `RenderStreamDescriptor` consumable by `ViewportShell`.
- Add shared live compositor scene contracts for scene state, layer descriptors, source references, presets, tracking overlays, output routes, diagnostics, and latency metadata.
- Add engine ActionRouter routes for starting/updating live compositor scenes, layer routing, scene preset switching, tracking overlay configuration, and output route planning.
- Reuse existing engine GPU/streaming primitives where possible: `GpuLayer`, `GpuCompositor`/texture compositor paths, `StreamRegistry`, `RenderStreamDescriptor`, `RenderFrameMeta`, and `H264StreamClient`.
- Add a `LiveController` in neko-live that implements `ISceneController`, consumes the compositor stream through `ViewportShell`, and sends `scene:live:*` commands for scene/preset/layer/output operations.
- Keep neko-live's local R3F/puppet preview behind an explicit non-authoritative fallback until compositor parity and latency tests pass, then isolate or remove it.
- Move the remaining live compositor tasks from `implement-unified-viewport-protocol` into this change so the viewport change can be archived once its delivered scope is verified.

## Capabilities

### New Capabilities

- `live-compositor-stream`: Defines engine-owned live compositor scene contracts, layer/source routing, compositor stream descriptors, frame metadata, latency diagnostics, and fallback parity gates.

### Modified Capabilities

- `device-management`: Align neko-live device/session/output workflows with compositor-owned visual truth, tracking overlays, recording/output routing, and non-authoritative local fallback behavior.
- `webview-engine-control-surface`: Extend the shared ViewportShell migration contract so neko-live consumes a compositor stream through `LiveController` once the compositor capability is available.

## Impact

- Shared contracts: `packages/neko-types/src/types` live/compositor DTOs, possible `RenderStreamDescriptor` metadata extensions, and `ViewportProtocol` payload guards for `scene:live:*`.
- Rust engine: `engine-types`, `engine-gpu`, `engine-kernel`, `host-api` ActionRouter/controllers, `StreamRegistry`, compositor layer extraction, H.264 stream production, and frame metadata emission.
- Client/Webview: `packages/neko-client` stream helpers if compositor descriptors need normalization, `@neko/ui` only if reusable stream-surface helpers are extracted, and `neko-live` Webview/Extension for `LiveController`, scene state, fallback isolation, and output controls.
- Tests: TS/Rust contract parity, engine route and stream lifecycle tests, Webview controller/fallback tests, latency smoke tests, and architecture boundary checks to keep live/model/puppet implementations isolated.
