## Why

SceneService mixes creative commands, ECS data access, and rendering behind a single service shape. The existing `ecs_world_mut()` escape points are legitimate data operations, but they are not expressed as a contract, which makes controller, renderer, serialization, and modeling boundaries hard to audit.

## What Changes

- Add `CreativeAccess` and `DataAccess` traits for scene and puppet runtime worlds.
- Add typed DataAccess methods for render extraction, serialization, procedural spawn, modeling deltas, and revision reads.
- Introduce `SceneComputation` as the live world owner and keep `SceneService` as a facade.
- Introduce `SceneRenderer` that renders `RenderWorld` snapshots and never imports the live ECS world.
- Replace public `ecs_world_mut()` escape points with typed DataAccess calls and CI guardrails.

## Capabilities

### New Capabilities

- `engine-scene-dual-api-split`: Defines creative/data access boundaries, SceneComputation, snapshot-based SceneRenderer, and escape-hatch removal for scene ECS operations.

### Modified Capabilities

- None.

## Impact

- Affects `runtime-scene`, `runtime-puppet`, and scene service implementation modules in `engine-kernel`.
- Adds verification rules that host-api controllers do not import `DataAccess` and renderers do not import live ECS world types.
- Depends on P0a output contracts before the SceneRenderer stream path is connected.
