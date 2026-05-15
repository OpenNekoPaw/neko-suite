## Why

`runtime-device` and `runtime-ml` currently depend upward on `neko-engine-kernel` for error and service contracts, which breaks the intended engine layering after the kernel decoupling work. Fixing this now makes both runtime crates independently testable and reusable by hosts without pulling in kernel orchestration.

## What Changes

- Move device and ML service contracts, shared request/response DTOs, and boundary errors out of `engine-kernel` into `engine-types` or runtime-local contract modules.
- Update `runtime-device` and `runtime-ml` to compile without a Cargo dependency on `neko-engine-kernel`.
- Keep kernel as the orchestration/adapter layer that consumes runtime crates through lower-level contracts.
- Update host-api wiring to continue receiving facade-provided service handles while avoiding runtime-to-kernel reverse dependencies.
- Add architecture tests that fail if runtime-device or runtime-ml reintroduces a kernel dependency or imports kernel source paths.
- Preserve HTTP, WebSocket, N-API, TypeScript, and persisted project contracts.

## Capabilities

### New Capabilities
- `runtime-kernel-dependency-inversion`: Defines runtime-device/runtime-ml dependency direction, contract ownership, kernel adapter responsibilities, and regression guardrails.

### Modified Capabilities
- `engine-kernel-boundary-contracts`: Extends the engine boundary model to forbid runtime-device/runtime-ml from depending on kernel orchestration.

## Impact

- Affected Rust crates:
  - `packages/neko-engine/packages/engine-types`
  - `packages/neko-engine/packages/runtime-device`
  - `packages/neko-engine/packages/runtime-ml`
  - `packages/neko-engine/packages/engine-kernel`
  - `packages/neko-engine/packages/host-api`
- Affected APIs:
  - service trait and DTO import paths for device and ML runtime boundaries.
  - kernel facade/service factory construction paths if adapter shims are required.
- No user-visible protocol or persisted data change is intended.
