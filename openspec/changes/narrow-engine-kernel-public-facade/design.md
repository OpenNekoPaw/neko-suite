## Context

P0/P1 extracted core infrastructure into `engine-types`, `engine-gpu`, `engine-codec`, and `engine-audio`, and P2 extracts renderer companions. However, host crates still depend on many `engine-kernel` internals:

- `host-api/src/engine.rs` imports `neko_engine_kernel::gpu::GpuContext` and constructs `TaskService::new()` / `TimelineService::new(...)`.
- Controllers import modules such as `gpu`, `encoder`, `audio`, `media_service`, `jvi`, `domain`, `preview`, `export`, and `services` directly.
- Tests and routers instantiate concrete services directly instead of going through a factory/facade boundary.
- `engine-kernel/src/lib.rs` exposes many top-level modules as `pub mod`.
- `engine-kernel/src/gpu/mod.rs` still uses a broad `pub use neko_engine_gpu::*` compatibility export.

五层分析：

- 职责：kernel should expose orchestration and stable contracts, not all implementation modules.
- 依赖：host crates should depend on a facade/factory, not GPU/codec/audio/service implementation details.
- 接口：public kernel API needs an allowlist with explicit compatibility paths.
- 扩展：new services should register through factory/bundles rather than forcing host to know constructors.
- 测试：architecture tests must block direct host imports and concrete constructor use.

## Goals / Non-Goals

**Goals:**

- Introduce `EngineKernelFacade`, `ServiceFactory`, or equivalent `KernelServices` bundle as the stable host-facing construction and access boundary.
- Move host-api, host-http, and host-napi off direct imports of kernel implementation modules.
- Replace broad/glob compatibility re-exports with explicit allowlisted exports.
- Convert implementation modules to private or `pub(crate)` where callers no longer need direct access.
- Add architecture tests that prevent host layers from bypassing the facade.

**Non-Goals:**

- Do not change HTTP routes, WebSocket envelopes, N-API payloads, TypeScript APIs, or persisted project formats.
- Do not extract renderer companion crates in this change; P3 assumes P2 has already provided stable renderer boundaries.
- Do not remove all compatibility paths in one step if external callers still require a migration period.
- Do not redesign service business behavior.

## Decisions

### Decision 1: Add a host-facing kernel facade before hiding modules

The kernel will expose a stable construction/access boundary, for example:

- `EngineKernelFacade` for lifecycle and high-level access;
- `ServiceFactory` for constructing default service graphs;
- `KernelServices` for typed service handles used by host controllers.

Host crates should obtain services through this boundary instead of constructing concrete services directly.

Alternative considered: make modules private first and fix compiler errors. This was rejected because it would turn API design into a reactive cleanup and make it harder to preserve compatibility.

### Decision 2: Use explicit service bundles rather than a global singleton

The facade should be an owned object or injected bundle so tests can create isolated service graphs and fakes. It should not become a process-wide singleton.

Alternative considered: global kernel registry. This was rejected because it would make tests order-dependent and hide lifecycle ownership.

### Decision 3: Separate public contracts from compatibility exports

Kernel public exports should be categorized:

- stable facade and service contracts;
- stable domain/DTO re-exports that host legitimately needs;
- temporary compatibility exports with an explicit migration owner;
- private implementation modules.

Broad re-exports such as `pub use neko_engine_gpu::*` should be replaced by explicit exported names or moved behind compatibility modules scheduled for removal.

Alternative considered: keep all `pub mod` surfaces indefinitely. This was rejected because it preserves the original coupling problem even after implementation crates were extracted.

### Decision 4: Host migration is controller-by-controller

Host-api controllers should move incrementally to facade-provided services and contract modules. Tests that instantiate concrete services should either use factory helpers or intentionally local service constructors behind a test-only helper.

Alternative considered: migrate all host crates in one mechanical edit. This was rejected because host controllers mix service calls, domain DTOs, media helpers, and error conversions; controller-by-controller migration keeps review and rollback manageable.

### Decision 5: Architecture guardrails define the new public contract

The change should add tests that fail when:

- host crates import banned kernel modules outside approved facade/contract paths;
- host crates call concrete service constructors directly;
- kernel top-level public modules exceed an allowlist;
- `engine-kernel::gpu` uses a broad glob re-export from `neko-engine-gpu`;
- internal modules regain public visibility without allowlist updates.

Alternative considered: rely on documentation. This was rejected because public surface regressions are easy to reintroduce during feature work.

## Risks / Trade-offs

- Host controllers currently use many internal DTOs and helpers -> provide explicit contract re-exports before making modules private.
- Facade can become a new god object -> keep it as construction/access boundary; service behavior remains in focused services and backend adapters.
- Compatibility removal can be noisy -> use an allowlist and temporary compatibility modules with clear task ownership.
- Tests may need fakes after direct constructors are removed -> add factory test helpers and allow dependency injection for service bundles.
- Some host-napi conversions may legitimately need low-level types -> expose those through dedicated contract modules rather than broad kernel internals.

## Migration Plan

1. Add facade/factory skeleton and `KernelServices` bundle without removing existing exports.
2. Move core host initialization to the facade.
3. Migrate host controllers from direct concrete constructors to facade-provided services.
4. Add explicit contract re-exports for DTOs and service traits required by host crates.
5. Replace `engine-kernel::gpu::*` glob compatibility with explicit exports.
6. Make implementation modules private or `pub(crate)` where no host call sites remain.
7. Add and enforce architecture tests for host imports, constructors, public module allowlist, and glob re-exports.

## Open Questions

- Should `ServiceFactory` live at `neko_engine_kernel::facade` or `neko_engine_kernel::services::factory`? Default: use a top-level `facade` module because it is the host-facing boundary.
- Should media analysis helpers remain exposed through kernel facade or move host-api to `runtime-media` directly? Default: expose stable contract paths first, then consider a later media-service public surface cleanup.
