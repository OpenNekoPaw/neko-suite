## Context

Scene and puppet runtimes both implement animation blending:

- scene has `SceneBlendLayer`, `SceneCrossfadeRequest`, `SceneAnimationBlendState`, `SceneAnimationPlaybackState`, and info DTOs;
- puppet has `BlendLayer`, `CrossfadeRequest`, `AnimationBlendState`, and info DTOs;
- the core structures are very similar, but scene uses seconds-oriented naming while puppet uses milliseconds in some APIs, and the ECS math differs by domain.

五层分析：

- 职责：shared DTOs express blend state; runtime crates own domain-specific animation evaluation.
- 依赖：shared contracts should live below runtime-scene/runtime-puppet.
- 接口：time units must be explicit to avoid seconds/milliseconds bugs.
- 扩展：future animation runtimes can reuse DTOs without inheriting scene/puppet systems.
- 测试：conversion and serialization tests must prove compatibility.

## Goals / Non-Goals

**Goals:**

- Extract shared blend layer, crossfade request, blend state, and blend layer info contracts.
- Make duration/time-unit semantics explicit.
- Preserve existing scene and puppet public names through aliases or conversion wrappers where needed.
- Keep 2D and 3D ECS systems independent.
- Add guardrails against reintroducing duplicate blend DTO definitions.

**Non-Goals:**

- Do not merge runtime-scene and runtime-puppet animation systems.
- Do not change interpolation math, ECS schedule order, clip sampling, or blend weight behavior.
- Do not force generic-heavy APIs into host-facing code if compatibility aliases are clearer.
- Do not change TypeScript WebSocket/HTTP payloads or saved project formats.

## Decisions

### Decision 1: Extract DTOs, not systems

Only data contracts move to the shared layer. ECS components may wrap shared DTOs, but scene and puppet systems continue to compute their own transforms and domain-specific playback.

Alternative considered: create a unified animation system trait. This was rejected because 2D puppet and 3D scene animation math diverge enough that a shared system would couple unrelated evolution.

### Decision 2: Use explicit duration representation

The shared contract should avoid ambiguous raw duration fields. Acceptable designs include:

- `AnimationDuration { millis: u32 }` with helper constructors for seconds/milliseconds;
- `BlendDurationMillis` and `BlendDurationSeconds` newtypes with explicit conversions;
- a shared internal milliseconds representation plus scene/puppet compatibility constructors.

Alternative considered: use a generic `AnimationBlendLayer<T: TimeUnit>`. This was rejected as the default because it leaks generic complexity into ECS components and serde payloads. Newtypes or explicit DTO fields are easier to test and serialize.

### Decision 3: Compatibility aliases preserve public names

Existing type names such as `SceneBlendLayer` and `BlendLayer` can remain as aliases or thin wrappers around the shared DTO during migration. External callers should not need a large import rewrite immediately.

Alternative considered: rename every caller to the new shared names in one PR. This was rejected because host/kernel code already depends on scene-specific names and compatibility wrappers reduce review risk.

### Decision 4: Serialization stays stable

If existing DTOs are serialized, the shared contract must preserve field names or provide explicit serde compatibility. Changing Rust internals must not change saved scene/puppet state unless a migration is intentionally added.

Alternative considered: use the Rust rename as a protocol cleanup. This was rejected because this change is about internal reuse, not external protocol versioning.

## Risks / Trade-offs

- Unit mismatch between scene seconds and puppet milliseconds -> use explicit newtypes/helpers and conversion tests.
- Shared DTOs can become too broad -> keep the module focused on blend/crossfade state only.
- Alias-based migration can hide duplication -> add source-level tests that fail on reintroduced struct definitions with duplicate names.
- Serde compatibility can be subtle -> include round-trip fixtures for scene and puppet blend state.

## Migration Plan

1. Compare current scene and puppet blend DTOs field-by-field.
2. Add shared animation blend contracts and explicit duration helpers.
3. Replace runtime-scene DTO definitions with aliases/wrappers backed by shared contracts.
4. Replace runtime-puppet DTO definitions with aliases/wrappers backed by shared contracts.
5. Update kernel/service imports only where necessary.
6. Add compatibility and architecture tests.
7. Remove redundant local DTO definitions after tests pass.

## Open Questions

- Should the shared module live in `engine-types::animation` or a new `runtime-common` crate? Default: use `engine-types::animation` because the contracts are pure DTOs and already shared across runtime and kernel callers.
- Should `SceneAnimationPlaybackState` be generalized now? Default: only extract fields that have a puppet equivalent; leave scene-only playback state in runtime-scene until puppet needs the same contract.
