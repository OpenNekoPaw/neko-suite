## 1. Shared Contracts

- [x] 1.1 Add `packages/neko-types/src/types/device.ts` with `DeviceType`, `DeviceInfo`, `DeviceCapabilities`, `DevicePermissionState`, `DeviceConnectionState`, `DeviceEvent`, `DeviceSession`, and `DisposableLike`.
- [x] 1.2 Add `packages/neko-types/src/types/tracking.ts` with `TrackingSource`, `TrackingData`, `TrackingStatus`, and `TrackingServiceApi`.
- [x] 1.3 Export the new device and tracking contracts from `packages/neko-types/src/types/index.ts` and the package public entrypoint.
- [x] 1.4 Add shared contract tests that verify the new types can be imported from `@neko/shared` without DOM, React, or VSCode dependencies.

## 2. Neko Client Device Layer

- [x] 2.1 Create `packages/neko-client/src/device/` with public barrel exports and low-level DTO adapters from existing `EngineClient` audio, camera, MIDI, and gamepad methods.
- [x] 2.2 Implement `DeviceManager.refresh()` and `DeviceManager.list()` with normalized snapshots and type filtering.
- [x] 2.3 Implement `DeviceManager.requestPermission()`, `connect()`, `disconnect()`, and `onDeviceChange()` using injectable permission and lifecycle dependencies.
- [x] 2.4 Implement `MidiClient` with connect/disconnect, JSON event parsing, close/error handling, and injectable WebSocket factory.
- [x] 2.5 Implement `GamepadClient` with connect/disconnect, JSON event parsing, close/error handling, and injectable WebSocket factory.
- [x] 2.6 Implement `CameraClient` as the normalized adapter around existing camera list/start/stop actions, preserving current camera stub limitations.
- [x] 2.7 Export device clients from `@neko/neko-client` without breaking existing `EngineClient` exports.
- [x] 2.8 Add unit tests for DTO normalization, cached listing, permission denial, session disconnect, listener disposal, and fake WebSocket event streams.

## 3. Permission And Native Device Surface

- [x] 3.1 Add an Extension Host device permission service with workspace/global lookup, ask/granted/denied states, and typed denial errors.
- [x] 3.2 Add revoke behavior that disconnects active sessions and emits permission/device change events.
- [x] 3.3 Add VSCode commands for listing devices, requesting permission, revoking permission, and choosing a device through QuickPick.
- [x] 3.4 Add optional TreeView/status bar wiring for global device management using native VSCode UI.
- [x] 3.5 Add Extension Host tests for permission state precedence, denial behavior, revoke disconnect, and command wiring.

## 4. Engine Internal Input Binding

- [x] 4.1 Define the Rust-side input binding or routing service boundary for MIDI/gamepad event-to-action execution.
- [x] 4.2 Implement the minimal engine binding path needed for non-Webview MIDI/gamepad action execution or add a typed stub with TODO(P1) boundaries if full execution is deferred.
- [x] 4.3 Add Rust tests or service-level tests proving configured MIDI/gamepad events can be consumed without Webview roundtrip.
- [x] 4.4 Ensure existing MIDI/gamepad WebSocket routes continue to work for observation and diagnostics.

## 5. Tracking Service

- [x] 5.1 Move VMC receiver ownership behind a `TrackingServiceApi` implementation while preserving the current `neko-live` start/stop behavior during migration.
- [x] 5.2 Register `neko.tracking.getApi`, `neko.tracking.start`, `neko.tracking.stop`, and `neko.tracking.status` command entrypoints.
- [x] 5.3 Implement multi-consumer tracking data and status subscriptions with disposable listener handles.
- [x] 5.4 Add idempotent start/stop behavior, port-conflict error reporting, malformed packet logging, and dispose cleanup.
- [x] 5.5 Add tests with a fake VMC receiver for lifecycle, listener disposal, error status, and multiple consumers.

## 6. Live Workflow Integration

- [x] 6.1 Extract `LiveSessionService` from `neko-live/packages/extension/src/LivePanelProvider.ts` for session snapshot, scene update, recording, stream control, and device role binding.
- [x] 6.2 Update `neko-live` to consume `DeviceManager` for device lists and `TrackingServiceApi` for tracking, without directly instantiating `VmcReceiver` in the provider.
- [x] 6.3 Move `puppetMapping` into `neko-puppet` and add Live Mode that subscribes to tracking data and drives the existing puppet preview or engine-backed puppet state.
- [x] 6.4 Move `vmcMapping` into `neko-model` and add Live Mode that subscribes to tracking data and drives the existing model preview or engine-backed model state.
- [x] 6.5 Add mapping tests for clamp behavior, missing parameter filtering, and representative ARKit-to-puppet/VRM cases.
- [x] 6.6 Gate removal of `neko-live` duplicated `AvatarViewer`, `Viewport3D`, and `PuppetViewer` until `neko-puppet` and `neko-model` Live Mode workflows are usable.
- [x] 6.7 Update `neko-live` UI text and empty state to focus on scene composition, recording, streaming, and control panels after renderer migration.

## 7. Documentation And Validation

- [x] 7.1 Update architecture docs or ADR references if final owner names, config keys, or engine binding names differ from `adr-device-management.md`.
- [x] 7.2 Run `pnpm --filter @neko/shared test` for shared contracts.
- [x] 7.3 Run `pnpm --filter @neko/neko-client test` for device clients and stream client tests.
- [x] 7.4 Run targeted package tests for `neko-live`, `neko-puppet`, and `neko-model` Live Mode changes.
- [x] 7.5 Run Rust tests for changed `neko-engine` packages if engine binding code is implemented.
- [x] 7.6 Run `pnpm check` or the narrowest available boundary check to verify Webview/Extension/shared dependency direction.
