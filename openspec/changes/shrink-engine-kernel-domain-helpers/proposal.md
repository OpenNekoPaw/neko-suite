## Why

`engine-kernel` is again carrying domain helper code that does not belong to the orchestration layer: CPU media diff/probe helpers, JVI project parsing, 3D text mesh generation, and several compatibility shells. Moving these helpers to their owning runtime crates keeps kernel focused on service wiring and prevents the old monolith shape from growing back.

## What Changes

- Move CPU-only media toolbox behavior from `engine-kernel/src/media_service` into `runtime-media`.
- Move JVI/NKV project parsing DTOs and loaders into `runtime-media` so timeline diff can leave kernel with its project parser dependency.
- Move 3D text mesh generation from `engine-kernel/src/generators/text_mesh.rs` into `runtime-scene`.
- Replace kernel internal imports with runtime crate imports while preserving existing host-facing contract paths through `neko_engine_kernel::contracts`.
- Remove empty or compatibility-only top-level kernel helper modules after call sites have moved.
- Add architecture checks that prevent these helpers from being reintroduced into `engine-kernel`.

## Capabilities

### New Capabilities

- `runtime-media-toolbox`: CPU-only media probe, diff, subtitle, JPEG, and JVI project parsing utilities owned by `runtime-media`.
- `runtime-scene-text-mesh-generation`: 3D text mesh generation owned by `runtime-scene` as scene authoring domain logic.

### Modified Capabilities

- `engine-kernel-boundary-contracts`: kernel boundary requirements now forbid CPU media toolbox, JVI parsing, text mesh generation, and empty compatibility shells from living in `engine-kernel`.
- `scene-authoring-contracts`: scene authoring contracts include text mesh generation as a runtime-scene capability instead of a kernel helper.

## Impact

- Affected Rust crates:
  - `packages/neko-engine/packages/runtime-media`
  - `packages/neko-engine/packages/runtime-scene`
  - `packages/neko-engine/packages/engine-kernel`
  - `packages/neko-engine/packages/host-api`
- Public host imports through `neko_engine_kernel::contracts::media` and scene service APIs remain source-compatible.
- Kernel line count should drop by removing or replacing `media_service`, `jvi`, `generators`, and empty top-level helper shells.
- Validation requires runtime-media, runtime-scene, engine-kernel, and host-api checks plus OpenSpec validation.
