## 1. Compare Existing DTOs

- [x] 1.1 Compare `runtime-scene` animation blend structs with `runtime-puppet` animation blend structs field-by-field.
- [x] 1.2 Identify exact duration units and serde field names used by scene and puppet callers.
- [x] 1.3 Identify scene-only and puppet-only fields that must stay runtime-local.
- [x] 1.4 Record compatibility names that must remain available during migration.

## 2. Add Shared Contracts

- [x] 2.1 Add shared animation blend layer, blend layer info, crossfade request, and blend state DTOs to `engine-types` or the selected shared contract module.
- [x] 2.2 Add explicit duration constructors/newtypes/helpers for seconds and milliseconds.
- [x] 2.3 Add serde attributes or conversion wrappers needed to preserve existing serialized shapes.
- [x] 2.4 Add unit tests for duration conversion and shared DTO serialization.

## 3. Migrate Runtime-Scene

- [x] 3.1 Replace common scene blend DTO definitions with aliases or wrappers over the shared contracts.
- [x] 3.2 Keep scene-only playback state and scene-specific ECS systems in runtime-scene.
- [x] 3.3 Update scene world/system/service imports to use compatibility names or shared contracts.
- [x] 3.4 Add scene blend-state round-trip and behavior regression tests.

## 4. Migrate Runtime-Puppet

- [x] 4.1 Replace common puppet blend DTO definitions with aliases or wrappers over the shared contracts.
- [x] 4.2 Keep puppet-specific ECS systems and math in runtime-puppet.
- [x] 4.3 Update puppet world/system imports to use compatibility names or shared contracts.
- [x] 4.4 Add puppet blend-state round-trip and behavior regression tests.

## 5. Guardrails And Validation

- [x] 5.1 Add architecture tests that prevent reintroducing duplicate common blend/crossfade DTO structs in scene and puppet runtimes.
- [x] 5.2 Run `cargo test -p neko-runtime-scene`.
- [x] 5.3 Run `cargo test -p neko-runtime-puppet`.
- [x] 5.4 Run `cargo check -p neko-engine-kernel --lib --no-default-features`.
- [x] 5.5 Run `openspec validate extract-runtime-animation-common --strict`.
