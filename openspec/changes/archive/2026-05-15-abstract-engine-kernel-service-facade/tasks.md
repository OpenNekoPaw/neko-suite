## 1. Define Trait-Based Facade Boundary

- [x] 1.1 Convert `KernelServices` controller-facing fields to `Arc<dyn I*Service>` handles.
- [x] 1.2 Keep concrete service construction local to `ServiceFactory`.
- [x] 1.3 Preserve `EffectRegistry`, GPU context, sink/config DTOs, and other non-service contracts as explicit exceptions.

## 2. Migrate Host Consumers

- [x] 2.1 Update `host-api/src/engine.rs` service fields/accessors to use trait-object handles.
- [x] 2.2 Update router wiring to pass trait-object handles without concrete downcasts.
- [x] 2.3 Update host controllers to store and accept service trait objects where service traits cover behavior.
- [x] 2.4 Update controller tests to use factory-provided trait handles or fakes.

## 3. Guardrails

- [x] 3.1 Add architecture tests that fail when `KernelServices` exposes concrete controller-facing service handles.
- [x] 3.2 Add architecture tests that fail when host controllers store concrete kernel service handles covered by service traits.
- [x] 3.3 Add or tighten architecture tests for `contracts::services` concrete re-export exceptions.
- [x] 3.4 Remove kernel-level blanket dead-code allow and keep only targeted annotations for planned migration scaffolding.
- [x] 3.5 Add regression coverage for `track.reorder` id/index mismatch after exposed payload fields become active contract checks.

## 4. Validation

- [x] 4.1 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 4.2 Run `cargo check -p neko-host-api --lib --no-default-features`.
- [x] 4.3 Run `cargo test -p neko-engine-kernel architecture_tests --lib --no-default-features`.
- [x] 4.4 Run `cargo test -p neko-host-api --lib --no-default-features`.
- [x] 4.5 Run `cargo test -p neko-engine-kernel --lib --no-default-features`.
- [x] 4.6 Run `cargo test -p neko-engine-kernel domain::timeline::tests --lib --no-default-features`.
- [x] 4.7 Run `cargo test --workspace`.
- [x] 4.8 Run `openspec validate abstract-engine-kernel-service-facade --strict`.
