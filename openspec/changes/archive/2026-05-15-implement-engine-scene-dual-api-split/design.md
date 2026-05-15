## Context

Scene operations currently use a mix of OOP-style `SceneWorld` methods and direct ECS access. Rendering, export, modeling, command queue, and procedural generation need data-oriented bulk access, while controllers and user commands need revision-aware creative operations. A single trait cannot represent both safely.

This design follows `docs/architecture/adr-engine-dual-api-scene-split.md`.

## Goals / Non-Goals

**Goals:**

- Formalize creative and data access as separate traits.
- Keep `engine-types` zero-dependency by defining runtime-specific traits in runtime crates.
- Split live world computation from rendering through `RenderWorld` snapshots.
- Remove or downgrade direct `ecs_world_mut()` escape hatches.
- Preserve public controller behavior while refactoring internals.

**Non-Goals:**

- Introduce a new `runtime-core` crate in P0.
- Provide true concurrent read access to Bevy ECS world.
- Change controller action contracts or scene command envelope format.
- Implement PuppetRenderer GPU output; that is covered later.

## Decisions

### Two Access Traits

`CreativeAccess` covers user-intent operations with revision/undo semantics. `DataAccess` covers typed data operations such as render extraction, serialization, procedural spawn, and modeling deltas.

Alternatives considered:

- One large trait. Rejected because it hides caller intent and recreates the current boundary problem.
- Public `&mut World`. Rejected because it only renames the escape hatch.

### Traits Live In Runtime Crates

Scene and puppet access traits live in `runtime-scene` and `runtime-puppet` because they need `glam` and `bevy_ecs` types.

Alternatives considered:

- Put traits in `engine-types`. Rejected because it violates the zero-internal-dependency rule.
- Add `runtime-core` immediately. Rejected because P0 can validate the pattern without a new crate.

### SceneComputation Owns Live World

`SceneComputation` holds the live world mutex and exposes controlled creative/data access. `SceneService` remains a facade with existing public signatures.

Alternatives considered:

- Update all controllers at once. Rejected because it makes PR4a too broad.

### SceneRenderer Uses Snapshots

`SceneRenderer` receives `RenderWorld` snapshots by channel and does not import live `World` or `DataAccess`.

Alternatives considered:

- Keep shared world/renderer mutexes. Rejected because rendering continues to block computation.
- Use `RwLock`. Rejected because Bevy queries still require mutable world access for current extraction paths.

## Risks / Trade-offs

- [Risk] P0 relies partly on module visibility and CI guardrails rather than full type isolation -> Mitigation: grep gates for host-api `DataAccess` imports and renderer `World` imports.
- [Risk] Snapshot extraction still briefly locks world -> Mitigation: keep lock duration to tick/extract and move rendering outside the lock.
- [Risk] Existing controller behavior regresses during facade extraction -> Mitigation: preserve public method signatures in PR4a and add behavior tests before removing escape hatches.

## Migration Plan

1. Add runtime access traits and typed data DTOs.
2. Implement both traits on existing scene and puppet worlds.
3. Extract `SceneComputation` while keeping `SceneService` signatures.
4. Add snapshot `SceneRenderer` and stream path after PipelineOutput types exist.
5. Replace `ecs_world_mut()` callers with typed DataAccess methods.
6. Add CI guardrails and deprecate crate-local raw access.
7. Roll back by keeping the facade path while reverting renderer channel integration if needed.
