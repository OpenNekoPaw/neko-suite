## 1. Define Facade And Public Surface

- [ ] 1.1 Add a top-level `facade` module exposing `EngineKernelFacade`, `ServiceFactory`, and `KernelServices` or equivalent names.
- [ ] 1.2 Define the default service graph construction contract for GPU context, task, timeline, preview, export, and backend adapters.
- [ ] 1.3 Add explicit contract re-export modules for host-needed DTOs, service traits, export configs, preview configs, GPU info, and media helper contracts.
- [ ] 1.4 Document which existing kernel public modules are stable, compatibility-only, or internal.

## 2. Migrate Host Initialization

- [ ] 2.1 Update `host-api/src/engine.rs` to initialize engine services through the facade/factory boundary.
- [ ] 2.2 Update host router setup to receive facade-provided service handles instead of constructing `TaskService` and `TimelineService` directly.
- [ ] 2.3 Update host-napi initialization and type conversion imports to use approved facade or contract paths.
- [ ] 2.4 Preserve existing host transport behavior and error mapping while changing construction paths.

## 3. Migrate Host Controllers And Tests

- [ ] 3.1 Replace production `TaskService::new()` and `TimelineService::new(...)` call sites in host controllers with factory/facade-provided services.
- [ ] 3.2 Replace direct host imports from kernel `gpu`, `encoder`, `decoder`, `audio`, `media_service`, `jvi`, `export`, `preview`, and `domain` internals with approved contract paths.
- [ ] 3.3 Move remaining controller-specific low-level needs behind narrow kernel contract re-exports or dedicated helper APIs.
- [ ] 3.4 Update tests to use facade test helpers, service factory helpers, or explicit fakes instead of production direct constructors.

## 4. Narrow Kernel Exports

- [ ] 4.1 Replace `pub use neko_engine_gpu::*` in `engine-kernel::gpu` with explicit compatibility exports.
- [ ] 4.2 Convert implementation modules to private or `pub(crate)` after host call sites migrate.
- [ ] 4.3 Keep only approved top-level `pub mod` declarations in `engine-kernel/src/lib.rs`.
- [ ] 4.4 Ensure compatibility modules document their migration purpose and expose explicit names only.

## 5. Architecture Guardrails

- [ ] 5.1 Add architecture tests that fail on banned host imports from kernel internal modules outside the allowlist.
- [ ] 5.2 Add architecture tests that fail on production direct concrete service constructor calls in host crates.
- [ ] 5.3 Add architecture tests that fail on unapproved top-level `pub mod` declarations in `engine-kernel`.
- [ ] 5.4 Add architecture tests that fail on broad implementation crate glob re-exports such as `pub use neko_engine_gpu::*`.

## 6. Validation

- [ ] 6.1 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [ ] 6.2 Run `cargo check -p neko-engine-host-api --lib --no-default-features`.
- [ ] 6.3 Run host-api controller/router tests or the closest available targeted host-api test suite.
- [ ] 6.4 Run `cargo test -p neko-engine-kernel architecture_tests --lib --no-default-features`.
- [ ] 6.5 Run `openspec validate narrow-engine-kernel-public-facade --strict`.
