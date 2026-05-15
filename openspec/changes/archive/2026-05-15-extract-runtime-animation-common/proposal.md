## Why

`runtime-scene` and `runtime-puppet` duplicate animation blend DTOs such as blend layers, crossfade requests, and blend-state wrappers with only small naming and time-unit differences. Extracting shared contracts reduces drift while preserving independent 2D and 3D ECS systems.

## What Changes

- Add shared animation blend DTOs and explicit duration/unit types in `engine-types` or a small runtime-common contract module.
- Migrate scene and puppet blend DTOs to reuse the shared contracts or provide thin compatibility aliases/conversions.
- Preserve runtime-scene and runtime-puppet ECS systems as separate implementations.
- Keep external scene/puppet service responses compatible during migration.
- Add tests that verify scene and puppet blend state serialization/conversion and prevent the duplicate DTOs from drifting again.

## Capabilities

### New Capabilities
- `runtime-animation-common-contracts`: Defines shared animation blend/crossfade contracts, time-unit handling, compatibility aliases, and runtime isolation rules.

### Modified Capabilities
- `scene-authoring-contracts`: Clarifies that scene animation blend state uses shared runtime animation contracts while retaining scene-specific behavior.

## Impact

- Affected Rust crates:
  - `packages/neko-engine/packages/engine-types`
  - `packages/neko-engine/packages/runtime-scene`
  - `packages/neko-engine/packages/runtime-puppet`
  - `packages/neko-engine/packages/engine-kernel`
- Affected APIs:
  - Rust import paths for blend layer, crossfade request, and blend state DTOs.
  - compatibility aliases may preserve existing scene/puppet type names.
- No ECS scheduling, animation math, TypeScript protocol, or persisted project format change is intended.
