## Why

`engine-kernel/src/gpu` remains the largest module cluster at roughly 27K lines, mixing GPU context/resource management, platform interop, effect/compositor pipelines, budget control, and domain-specific renderers. A preparation step is needed before crate extraction so `engine-gpu` does not become a large copy of the current mixed module.

## What Changes

- Classify GPU modules into extraction groups and enforce the boundaries in code:
  - GPU core/resource/HAL: context, texture, buffer pool, readback, platform import/export, encoder bridge
  - GPU pipeline/effects: compositor, texture compositor, style/effect processors, transitions, blur, mask, LUT, shaders
  - GPU budget: frame budget controller and queue policy
  - renderer companions: scene renderer, puppet renderer, panoramic renderer remain kernel-owned for now
- Normalize imports and module APIs so GPU core/pipeline files do not depend on export, preview, services, or renderer companion modules.
- Introduce compatibility aliases or prelude modules that later let `engine-kernel::gpu::*` re-export from `engine-gpu`.
- Add architecture checks documenting which `gpu` submodules are extraction-ready and which renderer modules intentionally remain behind.
- Do not create `engine-gpu` in this change; this is a boundary preparation proposal only.

## Capabilities

### New Capabilities

- `engine-gpu-core-extraction-prep`: Defines the GPU module classification, dependency guardrails, and compatibility surface required before creating `engine-gpu`.

### Modified Capabilities

- None.

## Impact

- Affected crates:
  - `packages/neko-engine/packages/engine-kernel`
  - possibly `packages/neko-engine/packages/engine-types` for pure GPU-facing DTOs only
- Affected modules:
  - `engine-kernel/src/gpu/*`
  - `engine-kernel/src/export/*`
  - `engine-kernel/src/preview/*`
  - `engine-kernel/src/services/impls/{scene,puppet,video,timeline}.rs`
  - `engine-kernel/src/architecture_tests.rs`
- Follow-up changes unblocked:
  - `extract-engine-gpu-core`
  - `extract-engine-renderer-companions`
  - host facade narrowing
