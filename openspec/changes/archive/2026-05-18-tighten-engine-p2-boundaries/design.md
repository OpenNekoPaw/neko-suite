## Context

The engine crate graph is now mostly layered, but two residual shortcuts remain:

- `engine-export-renderer` is a thin crate containing only `GpuPipelineTiming`, `Nv12FrameResult`, and `LayerTexturePool`. All three types are GPU infrastructure helpers and already depend on `engine-gpu` and `wgpu`.
- `host-http` imports runtime-scene scene-control DTOs directly for WebSocket routes. This creates a side path around `engine-kernel::contracts`, even though those routes operate through `EngineApi`.

## Goals / Non-Goals

**Goals:**

- Collapse export GPU support types into `engine-gpu` without changing export behavior.
- Remove the workspace member and dependency edge for `engine-export-renderer`.
- Expose scene-control/modeling DTOs through `engine-kernel::contracts::scene`.
- Remove `host-http`'s direct runtime-scene dependency.
- Add architecture tests covering both boundaries.

**Non-Goals:**

- Do not split large `services/impls/*.rs` files in this change.
- Do not move export job orchestration out of kernel.
- Do not change scene WebSocket envelope formats, command JSON shape, or binary brush-patch framing.
- Do not change GPU zero-copy export/preview semantics.

## Decisions

### Move export support types into engine-gpu

`GpuPipelineTiming`, `Nv12FrameResult`, and `LayerTexturePool` are GPU support types, not renderer companion logic. They use `GpuContext`, `GpuOutputHandle`, and `wgpu::Texture`; keeping them in `engine-gpu` makes the owner obvious and removes a crate whose maintenance cost is larger than its isolation value.

The module will be named `engine-gpu::export_support`, with root re-exports for the three existing type names to minimize call-site churn.

### Keep export orchestration in engine-kernel

`GpuExportPipeline`, export backend factories, sink factory wiring, job progress, cancellation, and mux/encoder orchestration remain in kernel. The migration only moves GPU support types.

### Route host-http scene DTOs through kernel contracts

`host-http` should depend on host-api and kernel contracts for engine-facing DTOs, not on runtime-scene directly. `engine-kernel::contracts::scene` will re-export the runtime-scene DTOs needed by:

- `scene_control.rs`: `SceneDelta`, `SceneCommandAck`, `SceneCommandAckStatus`, `SceneCommandEnvelope`, `SceneCommandEvent`, `SceneCommandPhase`, `TopologyOperation`
- `scene_modeling.rs`: `VertexBrushPatchMetadata`

If future host transport routes need more runtime-scene DTOs, they must be added explicitly to `contracts::scene`.

## Risks / Trade-offs

- **Risk: accidental API churn in export code** -> Mitigation: keep type names unchanged and re-export them from `neko_engine_gpu`.
- **Risk: removing a workspace member affects Cargo.lock broadly** -> Mitigation: validate targeted kernel, engine-gpu, and host-http checks.
- **Risk: host-http tests may use concrete runtime-scene constructors** -> Mitigation: imports should come from the kernel contract re-export, preserving type identity while removing the direct dependency.
- **Trade-off: engine-gpu grows slightly** -> Acceptable because the moved code is only ~262 lines and is GPU infrastructure.

## P3 Follow-up

The remaining services readability concern should be handled later as a separate P3 change, likely splitting large implementation files into submodules while keeping ownership in kernel:

- `services/impls/scene.rs`
- `services/impls/timeline.rs`
- `services/impls/video.rs`
