## Why

After GPU boundary preparation, GPU context/resource/HAL and reusable compositor/effect code should live in a dedicated infrastructure crate instead of `engine-kernel`. This shrinks kernel toward orchestration/facade responsibilities and lets GPU infrastructure compile and test independently.

## What Changes

- Add a new Rust crate `packages/neko-engine/packages/engine-gpu`.
- Move extraction-ready GPU infrastructure out of `engine-kernel`:
  - GPU context and device initialization
  - texture/resource/readback helpers
  - platform import/export and HAL interop
  - compositor/effect/pipeline processors that do not depend on scene/puppet/panoramic renderer internals
  - GPU budget controller if its dependencies are core-only after preparation
- Keep renderer companion modules in `engine-kernel` for this change unless the preparation change explicitly marked a module as GPU-core-safe:
  - `gpu/scene_renderer`
  - `gpu/puppet_renderer`
  - `gpu/panoramic_renderer`
- Keep kernel compatibility re-exports so current imports through `neko_engine_kernel::gpu::*` continue to compile during migration.
- Add architecture checks preventing `engine-gpu` from depending on `engine-kernel`, host crates, services, export, preview, domain, scene/puppet renderer companion modules, or codec/audio implementation crates unless explicitly allowed.
- Preserve zero-copy hot paths and unsupported-capability behavior; do not introduce CPU readback fallback.

## Capabilities

### New Capabilities

- `engine-gpu-core-extraction`: Defines the dedicated GPU infrastructure crate boundary, compatibility re-exports, dependency guardrails, and zero-copy invariants for extracting GPU core from `engine-kernel`.

### Modified Capabilities

- None.

## Impact

- Affected crates:
  - `packages/neko-engine/packages/engine-gpu` (new)
  - `packages/neko-engine/packages/engine-kernel`
  - `packages/neko-engine/packages/engine-types`
  - host crates only if compatibility imports require cleanup
- Affected modules:
  - `engine-kernel/src/gpu/*`
  - `engine-kernel/src/export/*`
  - `engine-kernel/src/preview/*`
  - `engine-kernel/src/services/impls/*`
  - workspace `Cargo.toml` files
- Follow-up changes unblocked:
  - scene renderer companion extraction
  - puppet renderer companion extraction
  - panoramic/preview renderer companion extraction
  - kernel public facade narrowing
