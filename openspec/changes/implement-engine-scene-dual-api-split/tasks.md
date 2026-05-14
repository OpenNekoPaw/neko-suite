## 1. Access Traits

- [x] 1.1 Add `runtime-scene/src/access.rs` with `CreativeAccess`, `DataAccess`, typed DTOs, and crate-local deprecated raw access.
- [x] 1.2 Implement scene access traits on `BevySceneWorld`.
- [x] 1.3 Add parallel access traits for `runtime-puppet`.
- [x] 1.4 Implement puppet access traits on `BevyPuppetWorld`.

## 2. SceneComputation

- [x] 2.1 Add `SceneComputation` as live world owner with creative and data access entry points.
- [x] 2.2 Convert `SceneService` into a facade while preserving public method signatures.
- [x] 2.3 Add tests that existing scene controller behavior remains unchanged.

## 3. SceneRenderer

- [x] 3.1 Add `SceneRenderer` that consumes `RenderWorld` snapshots and does not hold live world references.
- [x] 3.2 Add watch-channel semantics for realtime preview snapshots with generation tracking.
- [x] 3.3 Add bounded queue semantics for complete export frame sequences.
- [x] 3.4 Connect the scene stream path to `VideoOutput::GpuFrame` and `StreamSink` after PipelineOutput types exist.

## 4. Escape Hatch Migration

- [x] 4.1 Replace render extraction `ecs_world_mut()` calls with `DataAccess::extract_render_world()`.
- [x] 4.2 Replace serialization/export escape points with typed DataAccess readers.
- [x] 4.3 Replace command queue, procedural spawn, modeling delta, and revision reads with typed methods.
- [x] 4.4 Downgrade raw world access to crate-local deprecated usage and remove public exposure.

## 5. Guardrails And Verification

- [x] 5.1 Add CI or test-script grep guard for host-api `DataAccess` imports.
- [x] 5.2 Add CI or test-script grep guard for renderer `World` or `DataAccess` imports.
- [x] 5.3 Verify scene stream visual output remains equivalent.
- [x] 5.4 Run `cd packages/neko-engine && cargo test` for affected crates.
