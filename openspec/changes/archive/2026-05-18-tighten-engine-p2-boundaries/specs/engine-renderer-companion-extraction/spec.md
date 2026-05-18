## MODIFIED Requirements

### Requirement: Renderer Companions Stay Domain-Specific
Renderer companion crates SHALL exist only when they own a domain renderer that bridges runtime data and GPU infrastructure. Thin GPU support modules that do not own a domain renderer SHALL live in `engine-gpu`.

#### Scenario: Export support types live in engine-gpu
- **WHEN** export or preview orchestration needs `GpuPipelineTiming`, `Nv12FrameResult`, or `LayerTexturePool`
- **THEN** those types are imported from `engine-gpu`
- **THEN** no `engine-export-renderer` crate is required

#### Scenario: Workspace does not include thin export renderer crate
- **WHEN** dependency checks inspect the neko-engine workspace
- **THEN** `packages/engine-export-renderer` is not a workspace member
- **THEN** engine-kernel does not depend on `neko-engine-export-renderer`

#### Scenario: Export orchestration remains in kernel
- **WHEN** export jobs are started, cancelled, or reported
- **THEN** job orchestration remains in engine-kernel export services
- **THEN** engine-gpu only owns reusable GPU support types and does not import kernel services
