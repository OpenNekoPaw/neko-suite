## Why

Neko Suite already has Rust-side device I/O for audio input, MIDI, gamepad, and camera scaffolding, but TypeScript consumers only see scattered low-level engine DTOs and package-specific flows. This prevents consistent permissions, hotplug state, stream lifecycle handling, and reusable live tracking workflows across `neko-live`, `neko-puppet`, `neko-model`, and future XR/device integrations.

## What Changes

- Add a shared application-level device contract in `@neko/shared` for device type, normalized device info, permission state, capabilities, sessions, and device events.
- Add `@neko/neko-client` device clients that adapt existing `EngineClient` methods into a `DeviceManager`, MIDI client, gamepad client, and camera client with explicit lifecycle and injectable WebSocket factories.
- Add an Extension Host permission model for sensitive device access, including workspace/global persistence, denial behavior, and revoke handling.
- Add a shared tracking service contract and owner model so VMC tracking is no longer private to `neko-live`.
- Introduce live device workflow contracts so `neko-puppet` and `neko-model` can consume tracking data in-place through Live Mode, while `neko-live` keeps scene composition, recording, and streaming responsibilities.
- Reserve a Rust-side input binding layer for real-time MIDI/gamepad actions so device input execution does not round-trip through Webviews.

## Capabilities

### New Capabilities

- `device-management`: Normalized device discovery, permission, session, event, and stream-client behavior across TS consumers.
- `tracking-service`: Shared Extension Host tracking service API for VMC and future tracking sources.
- `live-device-workflows`: Live Mode and live session workflows that bind devices/tracking to `neko-live`, `neko-puppet`, and `neko-model` without renderer duplication.

### Modified Capabilities

- None.

## Impact

- `packages/neko-types/src/types/`: new shared device and tracking contracts.
- `packages/neko-client/src/device/`: new device manager and per-device stream clients built on existing `EngineClient` methods.
- `packages/neko-engine/packages/runtime-device`, `engine-kernel`, `host-api`, `host-http`: possible additions for device event binding and camera completion, while preserving existing actions and stream routes.
- `packages/neko-live/packages/extension`: extraction of VMC receiver and live session state from `LivePanelProvider`.
- `packages/neko-live/packages/webview`: removal path for duplicated VRM/Puppet renderers after replacement workflows exist.
- `packages/neko-puppet` and `packages/neko-model`: new Live Mode consumers for tracking data and package-owned renderers.
- VSCode contribution points: optional TreeView, QuickPick commands, status bar indicators, and permission/revoke commands.
