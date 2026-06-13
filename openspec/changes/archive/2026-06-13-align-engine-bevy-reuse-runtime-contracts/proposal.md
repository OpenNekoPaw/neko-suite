## Why

The engine ADRs now agree on the runtime split, Bevy reuse boundary, and Phase 1C convergence points, but those decisions are not yet captured as implementable OpenSpec contracts. Without a proposal-backed contract, scene and puppet work can still duplicate animation, deformation, and Bevy integration choices while assuming the other runtime owns them.

This change turns the ADR conclusions into a small set of buildable contracts before Phase 2 runtime work starts: reuse narrow Bevy crates where they reduce duplicated engine infrastructure, keep full Bevy runtime/renderer out of Neko Engine, and assign shared animation/deformation primitives to their owning crates.

## What Changes

- Add Bevy reuse governance for engine runtime crates:
  - direct reuse allowed for `bevy_ecs` and evaluated for `bevy_tasks` / `bevy_color`
  - `bevy_math` deferred behind a `glam` version alignment gate
  - full Bevy `App`, `Schedule`, `Renderer`, `Window`, asset pipeline, and plugin runtime remain out of scope
- Add a common animation leaf sampler contract so future AnimationGraph work can call 2D `AnimationClip2D` and 3D clip samplers through shared DTOs without merging scene and puppet ECS systems.
- Add an `engine-gpu` owned shared Morph/BlendShape compute primitive for the common `position += sum(delta * weight)` operation used by 2D BlendShapes and 3D morph targets.
- Tighten the existing native puppet deformation path with `bevy_tasks` parallel CPU evaluation requirements, deterministic fallback behavior, and extreme-case consistency fixtures.
- Preserve current runtime layering decisions:
  - `runtime-puppet` stays GPU-free and exposes render-extract data only
  - `runtime-scene` remains the 3D runtime owner
  - renderer companion crates adapt extracted data into GPU layouts
  - MOC3 parsing remains a documented transitional exception, not a new broad runtime dependency
- No TypeScript, Webview, persisted project format, HTTP, WebSocket, N-API, full `runtime-stage`, or Live2D SDK integration changes are intended in this proposal.

## Capabilities

### New Capabilities

- `engine-bevy-reuse-governance`: Defines which Bevy crates and algorithms Neko Engine may reuse directly, which are deferred, and which must remain excluded from runtime architecture.

### Modified Capabilities

- `runtime-animation-common-contracts`: Adds the cross-runtime AnimationGraph leaf sampler contract while keeping scene and puppet animation systems independent.
- `engine-gpu-core-extraction`: Adds ownership of the shared Morph/BlendShape compute primitive to `engine-gpu` without importing scene or puppet renderer internals.
- `engine-puppet-control-and-renderer`: Extends the native puppet deformation path with `bevy_tasks` CPU parallelization, deterministic fallback, and parity fixtures against the serial path.

## Impact

- Affected Rust crates:
  - `packages/neko-engine/packages/engine-types`
  - `packages/neko-engine/packages/engine-gpu`
  - `packages/neko-engine/packages/runtime-scene`
  - `packages/neko-engine/packages/runtime-puppet`
  - scene and puppet renderer companion crates or current renderer modules that consume extracted deformation data
- Affected dependency policy:
  - `bevy_ecs = 0.15` remains the ECS foundation
  - `bevy_tasks` may be used directly where already available through `bevy_ecs`
  - `bevy_color` requires a focused evaluation before adoption
  - `bevy_math` requires coordinated `glam` alignment before adoption
- Affected validation:
  - architecture checks for excluded Bevy crates
  - contract tests for animation leaf sampler DTOs
  - CPU serial/parallel puppet deformation parity tests
  - shared CPU/GPU Morph/BlendShape parity fixtures
  - benchmarks covering many-shapes and large-delta deformation cases
- Compatibility expectations:
  - existing scene and puppet APIs continue to compile through current names or compatibility wrappers
  - no durable file format migration is required
  - rollback can remove the new shared contracts and keep the existing serial CPU deformation path active
