## Context

`narrow-engine-kernel-public-facade` introduced `EngineKernelFacade`, `ServiceFactory`, and `KernelServices`, then moved host imports to `contracts` and `facade`. A follow-up audit found one remaining structural weakness: `KernelServices` exposes concrete service types, and several host controllers store those concrete handles directly.

五层分析：

- 职责：factory constructs concrete services; facade should expose contracts, not implementations.
- 依赖：host controllers should depend on service traits and DTO contracts.
- 接口：`KernelServices` is the public injection interface and should use trait objects where possible.
- 扩展：alternate service implementations and tests should be injectable without changing controller types.
- 测试：architecture tests should block concrete service handles from returning to facade or host controllers.

## Goals / Non-Goals

**Goals:**

- Convert `KernelServices` controller-facing service fields to `Arc<dyn I*Service>`.
- Update host-api controllers to accept trait-object handles when their operations are covered by service traits.
- Preserve concrete construction in `ServiceFactory` and keep internal concrete service implementations crate-private.
- Add architecture tests for `KernelServices` and host controller concrete-handle regressions.
- Keep existing runtime behavior, error mapping, and transport contracts unchanged.

**Non-Goals:**

- Do not redesign service business methods.
- Do not remove all concrete compatibility re-exports from `contracts::services` in this change.
- Do not change device runtime concrete services unless their traits already fully cover host controller behavior.
- Do not introduce a global service locator or singleton registry.

## Decisions

### Decision 1: Facade fields use trait objects for host-facing services

`KernelServices` should expose `Arc<dyn ITaskService>`, `Arc<dyn IVideoService>`, `Arc<dyn IAudioService>`, and equivalent trait handles for scene, puppet, image, node, timeline, export, and effects services. Concrete service construction remains in `ServiceFactory::create_with_gpu`.

Alternative considered: make `KernelServices` generic over service types. This was rejected because it would leak type parameters through router/controller setup and make host code noisier.

### Decision 2: Keep factory-local concrete handles only when needed for wiring

Some concrete services require references to other services during construction. `ServiceFactory` may create local `Arc<ConcreteService>` variables and then coerce them into trait objects before returning `KernelServices`.

Alternative considered: hide construction behind per-service provider traits immediately. This is heavier than needed for the current coupling issue.

### Decision 3: Host controllers consume traits, not concrete service structs

Controllers should accept `Arc<dyn I*Service>` for injected kernel services. Tests should obtain handles from `ServiceFactory` or provide fakes implementing the traits.

Alternative considered: keep concrete controller fields while only changing `KernelServices`. This would simply move the coupling into router conversion code and fail the DIP objective.

### Decision 4: Device services are deferred unless already trait-complete

`runtime-device` camera/midi/gamepad services are outside `engine-kernel` and already have separate service traits. If their controller APIs are fully trait-covered, they can be migrated in the same style; otherwise they can remain concrete until a device-specific boundary change.

Alternative considered: migrate every service-like handle at once. This risks widening the change beyond kernel facade abstraction.

### Decision 5: Guardrails check source shape, not only Cargo graph

Architecture tests should inspect `facade.rs` and host controller sources to catch concrete service handle regressions even though the crate dependency graph would still compile.

### Decision 6: Keep compiler dead-code guardrails active

The previous kernel-wide `#[allow(dead_code, unused_imports)]` hid both legitimate migration scaffolding and newly introduced dead code. This change keeps the crate-level guardrail removed. Code that is intentionally retained for a planned boundary, such as preview provider routing or legacy encode-only export adapters, may use targeted `#[allow(dead_code)]` only with a local TODO explaining the migration path.

Alternative considered: restore a module-wide compatibility allow while P3 settles. This was rejected because it would make future regressions invisible and weaken the architectural cleanup.

## Risks / Trade-offs

- Some service traits may not cover helper methods used by controllers. Mitigation: add narrow trait methods only when they are already part of the host-facing behavior.
- Trait objects can obscure concrete capabilities. Mitigation: keep concrete implementation access internal to factory/services and expose only contract behavior.
- Tests that rely on concrete services may need minor setup rewiring. Mitigation: use `ServiceFactory::create_with_gpu(None)` for default CPU-only handles.
- Targeted dead-code annotations can become stale. Mitigation: require a TODO with phase/context and keep kernel self-warning count at zero during validation.

## Migration Plan

1. Identify `KernelServices` fields and matching service traits.
2. Change facade fields to trait-object handles and keep factory-local concrete construction.
3. Update host-api engine/router/controller fields and constructors to accept trait handles.
4. Remove unneeded concrete service imports from host controllers.
5. Add architecture tests for facade and host controller concrete service handle bans.
6. Remove kernel-wide dead-code blanket allows and either delete confirmed dead helpers or annotate planned migration scaffolding locally.
7. Run cargo check/test and OpenSpec validation.
