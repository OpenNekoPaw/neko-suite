## Context

Neko Suite already proxies external device access through the Rust engine sidecar because VSCode Webviews cannot reliably access camera, microphone, MIDI, gamepad, or XR APIs directly. The Rust side has `runtime-device`, service traits in `engine-kernel`, controllers in `host-api`, and WebSocket routes in `host-http` for MIDI/gamepad streams and media streams. The TS side currently exposes low-level `EngineClient` methods and wire DTOs, but it lacks a normalized application contract, permission layer, hotplug/session aggregation, and reusable live tracking service.

`neko-live` also mixes multiple responsibilities in one `LivePanelProvider`: VMC UDP receiving, avatar loading, puppet stream forwarding, recording, and a Webview with duplicated VRM/Puppet renderers. This makes face tracking usable only through `neko-live` and prevents `neko-puppet` and `neko-model` from driving their own editors with the same tracking data.

## Goals / Non-Goals

**Goals:**

- Provide shared device and tracking contracts in `@neko/shared` without importing DOM, React, or VSCode APIs into the shared layer.
- Add `@neko/neko-client` device clients that adapt existing `EngineClient` methods into normalized discovery, permission, session, and event APIs.
- Ensure Webviews only consume authorized stream/session handles and do not become the control path for sensitive device discovery or real-time device action execution.
- Extract tracking from `neko-live` into an Extension Host service API that can be consumed by `neko-live`, `neko-puppet`, and `neko-model`.
- Let `neko-puppet` and `neko-model` implement Live Mode with package-owned renderers and package-owned mapping logic.
- Keep `neko-live` as the scene composition, recording, streaming, and control-panel package rather than deleting it.

**Non-Goals:**

- Full XR runtime implementation.
- Replacing existing H264/PCM/fMP4 stream clients.
- Rewriting Rust `runtime-device` internals beyond the minimum binding/event support needed for this change.
- Building a Webview device management dashboard.
- Making `neko-live` own `neko-puppet` or `neko-model` renderer internals.

## Decisions

### 1. Shared contracts live in `@neko/shared`, low-level engine DTOs stay in `@neko/neko-client`

`@neko/shared` will define application-level types such as `DeviceType`, `DeviceInfo`, `DevicePermissionState`, `DeviceEvent`, `TrackingData`, and `TrackingServiceApi`. Existing `AudioInputDevice`, `CameraDevice`, `MidiPort`, and `GamepadInfo` wire DTOs remain in `@neko/neko-client/src/engine/types.ts`.

Rationale: shared application contracts must be stable across extensions and Webviews, while wire DTOs can remain close to `EngineClient` dispatch actions.

Alternative considered: move all device DTOs into `@neko/shared`. Rejected because it would conflate low-level action responses with normalized UI/workflow state and risk duplicate migration churn.

### 2. `DeviceManager` belongs to `@neko/neko-client`

`packages/neko-client/src/device/DeviceManager.ts` will adapt `EngineClient` device methods, maintain normalized device snapshots, mediate permission checks through injectable policy hooks, and expose listener-based device events. Per-device clients will handle MIDI/gamepad WebSocket subscriptions with injectable WebSocket factories.

Rationale: `@neko/neko-client` is already the engine communication layer and is the natural place for engine-backed device clients.

Alternative considered: create a new top-level `neko-device` package. Rejected because device access is infrastructure, not a user-facing domain package, and a new package would add governance without improving dependency direction.

### 3. Device management UI uses VSCode native surfaces

The management surface will use TreeView, QuickPick, StatusBar, Notification, and commands. Webviews may include workflow-specific device selectors, but the system-level device list and permission/revoke actions stay in Extension Host UI.

Rationale: device management is low-frequency, list-oriented, and security-sensitive. Native VSCode UI avoids a new Webview lifecycle and keeps permissions outside Webview sandbox code.

Alternative considered: create a dedicated device Webview. Rejected because debug visualizers belong in `neko-tools`, not the management capability.

### 4. Real-time device action execution stays in engine

MIDI/gamepad event streams may be observed by TS clients, but low-latency action execution for audio triggers, scene camera control, puppet parameters, or timeline actions must be bound inside the engine through a `DeviceBindingService`, `InputRouter`, or equivalent Rust-side layer.

Rationale: routing input through Webview and back to engine adds latency and breaks the engine-as-authority model.

Alternative considered: process all MIDI/gamepad input in Webview because React already owns UI state. Rejected because it makes Webview a real-time control loop and duplicates engine domain behavior.

### 5. Tracking service is an Extension Host API, not a shared private class

`VmcReceiver` will be extracted from `neko-live` into a service owner registered through commands. Consumers obtain `TrackingServiceApi` through `neko.tracking.getApi` or use simple `neko.tracking.start/stop/status` commands. The API returns disposable listener handles compatible with `DisposableLike`; Extension Host implementations can use `vscode.Disposable`.

Rationale: independent extensions cannot safely import each other's private source files or rely on a naked `EventEmitter` instance.

Alternative considered: move `VmcReceiver` into `neko-puppet` or `neko-model`. Rejected because tracking is a shared input source, not a renderer domain.

### 6. Live Mode lives in consumer packages

`neko-puppet` owns Live2D/puppet parameter mapping and drives `PuppetCanvas`. `neko-model` owns VRM/3D expression mapping and drives its R3F/editor renderer. `neko-live` consumes the same services only for composition, recording, streaming, and control panels.

Rationale: renderers are domain-specific and already more complete in their packages. Centralizing them in `neko-live` would recreate duplication and cross-package coupling.

Alternative considered: make `neko-live` the universal avatar renderer. Rejected because it would remain a degraded duplicate of editor renderers.

## Risks / Trade-offs

- Tracking service owner is ambiguous across extensions → Mitigation: define `neko.tracking.getApi` and allow migration-time ownership by `neko-live`, then move to `neko-suite` or a platform extension without changing consumers.
- Permission state can diverge from OS-level permissions → Mitigation: treat Neko permission as app-level allow/deny and map OS failures into typed device errors with recovery guidance.
- Device hotplug support varies by Rust backend → Mitigation: `DeviceManager.refresh()` is required; push events are additive and can be synthesized from polling where needed.
- Engine-side binding layer may be larger than the TS client work → Mitigation: keep initial binding scope to MIDI/gamepad event-to-action contracts and avoid changing existing media stream routes.
- Removing `neko-live` renderers too early can break current workflows → Mitigation: deletion is P2 and gated on working `neko-puppet`/`neko-model` Live Mode.
- Shared types may accidentally depend on VSCode/DOM types → Mitigation: use `DisposableLike` and plain serializable DTOs in `@neko/shared`; adapters in Extension/Webview layers bind to concrete APIs.

## Migration Plan

1. Add shared `device` and `tracking` types in `@neko/shared` and export them from the shared type barrel.
2. Add `@neko/neko-client/src/device` adapters around existing `EngineClient` methods and wire DTOs.
3. Add permission service hooks and initial Extension Host commands for request/revoke/list.
4. Extract `VmcReceiver` and OSC parsing behind `TrackingServiceApi`; keep `neko-live` behavior compatible during migration.
5. Add `neko-puppet` Live Mode using migrated `puppetMapping`.
6. Add `neko-model` Live Mode using migrated `vmcMapping`.
7. Extract `LiveSessionService` from `LivePanelProvider`.
8. Remove duplicated `neko-live` avatar renderers only after replacement workflows are available.
9. Add optional device TreeView/status commands after core services are stable.

Rollback strategy: keep existing `EngineClient` methods and `neko-live` message types until replacement consumers pass tests. If a migration step fails, disable new Live Mode commands and keep the old `neko-live` panel path active.

## Open Questions

- Should `TrackingService` be owned initially by `neko-live`, `neko-suite`, or a new platform-level extension module?
- What exact config keys store device permissions at workspace and global scope?
- Should the Rust binding layer be named `DeviceBindingService`, `InputRouter`, or folded into an existing engine service?
- What is the minimum camera implementation needed for this change: list-only adapter, preview stream, or full capture lifecycle?
