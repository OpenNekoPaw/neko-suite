## Why

The P3 kernel facade narrowed host imports, but `KernelServices` still exposes concrete service implementations such as `Arc<VideoService>` and `Arc<AudioService>`. This keeps host controllers coupled to implementation types and makes fake or alternate service graphs harder to inject.

## What Changes

- Change the host-facing `KernelServices` bundle to expose service trait objects for controller-consumed services.
- Keep concrete service construction inside `ServiceFactory` and internal kernel modules.
- Update host-api controllers and router wiring to consume `Arc<dyn I*Service>` handles where the trait already defines the required behavior.
- Keep concrete compatibility exports available only where they are still needed for non-facade contracts, such as `EffectRegistry`, `StreamSink`, or config DTOs.
- Add architecture guardrails that prevent `KernelServices` and host controllers from regressing to concrete kernel service handles.
- Remove the remaining kernel-wide dead-code blanket allow and replace expected migration scaffolding warnings with targeted annotations plus TODOs.
- Keep HTTP routes, N-API payloads, WebSocket envelopes, persisted formats, and crate dependency graph unchanged.

## Capabilities

### New Capabilities
- `engine-kernel-service-facade-abstraction`: Defines trait-object service handles, injection rules, and regression tests for the kernel facade boundary.

### Modified Capabilities
- `engine-kernel-boundary-contracts`: Tightens host/kernel boundary requirements so facade service access depends on service traits instead of concrete implementations.

## Impact

- Affected Rust modules:
  - `packages/neko-engine/packages/engine-kernel/src/facade.rs`
  - `packages/neko-engine/packages/engine-kernel/src/contracts.rs`
  - `packages/neko-engine/packages/engine-kernel/src/architecture_tests.rs`
  - `packages/neko-engine/packages/host-api/src`
  - `packages/neko-engine/packages/runtime-device/src`
- Affected API shape:
  - `KernelServices` service fields become trait-object handles for host-facing controller injection.
  - `ServiceFactory` remains the default concrete service graph builder.
- No transport, TypeScript, CLI command shape, project format, or media pipeline behavior change is intended.
- Expected warning posture:
  - `engine-kernel` should build without self-owned warnings after this change.
  - Existing `runtime-media`, `runtime-scene`, and `runtime-puppet` warnings are tracked as separate follow-up cleanup.
