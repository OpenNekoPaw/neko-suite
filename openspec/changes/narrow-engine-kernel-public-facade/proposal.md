## Why

After P0/P1 extraction, host crates still import `engine-kernel` internals and instantiate concrete services directly, so crate boundaries are cleaner internally but the public surface remains too wide. P3 introduces a stable kernel facade and service factory so host layers depend on contracts and orchestration entry points rather than implementation modules.

## What Changes

- Introduce a focused `EngineKernelFacade` / `ServiceFactory` / `KernelServices` boundary for constructing and accessing engine services.
- Migrate host-api, host-http, and host-napi call sites away from direct imports of kernel internals such as `gpu`, `encoder`, `decoder`, `audio`, `media_service`, `jvi`, `export`, `preview`, and concrete `services::impls`.
- Replace broad compatibility exports, including `neko_engine_kernel::gpu::*` glob re-export, with explicit allowlisted exports after host imports are narrowed.
- Convert implementation modules to private or `pub(crate)` where practical while preserving stable contract paths for supported callers.
- Add architecture guardrails preventing host crates from calling concrete service constructors or importing internal kernel modules outside approved facade paths.
- Keep transport contracts and persisted project formats unchanged.

## Capabilities

### New Capabilities
- `engine-kernel-public-facade`: Defines the host-facing kernel facade, service factory, public export allowlist, compatibility migration rules, and architecture guardrails for P3 kernel decoupling.

### Modified Capabilities
- `engine-kernel-boundary-contracts`: Extends kernel boundary requirements from internal crate separation to host-facing facade enforcement and top-level public surface control.

## Impact

- Affected Rust crates and modules:
  - `packages/neko-engine/packages/engine-kernel/src/lib.rs`
  - `packages/neko-engine/packages/engine-kernel/src/services`
  - `packages/neko-engine/packages/engine-kernel/src/gpu/mod.rs`
  - `packages/neko-engine/packages/host-api/src`
  - `packages/neko-engine/packages/host-http/src`
  - `packages/neko-engine/packages/host-napi/src`
- Affected APIs:
  - new stable facade/service factory entry points in `neko-engine-kernel`.
  - existing broad module imports become compatibility-only and are removed or narrowed once host callers migrate.
- No protocol, TypeScript client, WebSocket envelope, N-API payload, HTTP route, or persisted project format change is intended.
