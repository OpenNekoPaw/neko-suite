## Context

After GPU core preparation, extraction-ready GPU modules can move to a dedicated `engine-gpu` crate. The goal is to move reusable GPU infrastructure and pipeline/effect code while keeping domain-specific renderers as kernel-owned compatibility modules or later companion crates.

This is the highest-risk extraction in the kernel decoupling sequence because GPU code is large, platform-specific, and participates in zero-copy decode/render/encode paths. The extraction must be mechanical and guarded by tests.

## Goals / Non-Goals

**Goals:**

- Create `neko-engine-gpu` as the owner of extraction-ready GPU infrastructure.
- Move GPU core/resource/HAL and approved pipeline/effect modules out of `engine-kernel`.
- Preserve `neko_engine_kernel::gpu::*` imports through compatibility re-exports.
- Prevent `engine-gpu` from depending on kernel, host, services, export, preview, domain, codec/audio implementations, or renderer companion modules unless explicitly allowed.
- Preserve zero-copy hot paths and unsupported-capability semantics.

**Non-Goals:**

- Do not move scene renderer, puppet renderer, or panoramic renderer unless preparation marked a specific piece as core-safe.
- Do not redesign shaders, compositor math, budget policy, or platform interop semantics.
- Do not narrow host-api facade.
- Do not change HTTP, WebSocket, N-API, TypeScript, or persisted formats.

## Decisions

### Decision 1: Extract only preparation-approved modules

The moved set is determined by `prepare-engine-gpu-core-extraction`. Any file not marked extraction-ready stays in kernel.

**Rationale:** The preparation change is the contract that prevents accidental broad moves.

**Alternative considered:** Decide moved files during extraction. Rejected because it makes the largest change too ambiguous.

### Decision 2: Kernel keeps compatibility re-exports

`engine-kernel/src/gpu/mod.rs` becomes a compatibility module that re-exports moved GPU core types from `engine-gpu` and keeps kernel-owned renderer companion modules.

**Rationale:** Host and service imports remain stable while implementation ownership changes.

### Decision 3: Use `GpuError` and kernel mapping

`engine-gpu` defines a GPU-local error type for initialization, shader compilation, buffer operations, platform interop, unsupported capabilities, and readback failures. Kernel maps it into `engine-kernel::Error`.

**Rationale:** The infrastructure crate must not depend on kernel errors.

### Decision 4: Keep codec/audio dependencies out of GPU core by default

GPU core can use pure DTOs from `engine-types`. Direct dependency on `engine-codec` or `engine-audio` requires explicit justification and architecture-test allowlisting.

**Rationale:** Codec/audio should compose at kernel/export layers, not inside GPU core.

### Decision 5: Preserve platform dependency features

Move macOS/Linux/Windows platform dependencies with the code that uses them and mirror existing features first. Simplification can happen after tests pass.

**Rationale:** Platform interop is fragile; dependency cleanup should not be mixed with ownership migration.

## Risks / Trade-offs

- **Large file move noise** -> Keep module names and public item names stable; avoid opportunistic refactors.
- **Platform-specific compile failures** -> Mirror existing target dependencies and run checks on current platform; document cross-platform follow-up if needed.
- **Zero-copy lifetime regression** -> Keep GPU handle and RAII semantics unchanged; run sink/export/renderer tests.
- **Renderer modules accidentally move too early** -> Enforce preparation allowlist in tasks and architecture tests.
- **Compatibility re-exports hide remaining coupling** -> Document them as temporary and keep host facade narrowing as a follow-up.

## Migration Plan

1. Create `engine-gpu` crate and module skeleton.
2. Move preparation-approved GPU core/resource/HAL modules.
3. Move preparation-approved pipeline/effect/budget modules.
4. Add GPU-local error and kernel mapping.
5. Convert kernel `gpu` module to compatibility re-exports plus retained renderer modules.
6. Update imports where compatibility re-export is insufficient.
7. Add architecture guardrails for `engine-gpu`.
8. Run `engine-gpu` tests, targeted kernel GPU/export/preview/sink tests, full kernel tests, and OpenSpec validation.

Rollback: remove `engine-gpu` from workspace and restore moved modules under `engine-kernel/src/gpu`. Protocols and persisted formats are unchanged.

## Open Questions

- Which shader modules are preparation-approved for the first extraction?
- Does `budget.rs` belong in `engine-gpu` immediately, or should it remain kernel-owned until scheduling/service boundaries narrow further?
- Should platform interop smoke tests be split into feature-gated test modules for CI matrix coverage?
