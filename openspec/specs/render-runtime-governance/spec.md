# render-runtime-governance Specification

## Purpose
TBD - created by archiving change implement-3d-editor-wysiwyg-rendering. Update Purpose after archive.
## Requirements
### Requirement: Simulation and Render World are isolated
The system SHALL isolate Simulation World authoring/runtime ECS data from Render World render-only data. Extract phase MUST copy or transform Simulation data into render-only SoA data, GPU handles, draw lists, and pass inputs. Render World MUST NOT hold live references to Simulation ECS components.

#### Scenario: Render extraction is one-way
- **WHEN** a transform changes in Simulation ECS
- **THEN** extract phase writes render instance data for the frame, and Render World does not mutate the Simulation component

#### Scenario: Authoring components do not hold wgpu objects
- **WHEN** reviewing `runtime-scene` authoring components
- **THEN** they contain stable ids or asset handles rather than `wgpu::Buffer`, `wgpu::Texture`, or `wgpu::BindGroup`

### Requirement: RenderGraph manages render pass structure
The system SHALL provide a minimal RenderGraph for the 3D Engine render path. The graph MUST support pass declarations, input/output resource descriptions, transient and persistent resource lifetime, dependency ordering, dead pass pruning, and execution over wgpu command encoders.

#### Scenario: Existing PBR path runs through RenderGraph
- **WHEN** Engine renders the standard viewport
- **THEN** PBR forward, post-process/tone mapping, GPU color convert, and encoder copy run as RenderGraph passes

#### Scenario: Unused debug pass is pruned
- **WHEN** a viewport descriptor does not request a debug view
- **THEN** RenderGraph compilation excludes debug-only passes that have no live output

### Requirement: ViewportDescriptor controls render variants
The system SHALL derive render graph variants and render settings from `ViewportDescriptor`, including render mode, debug view, resolution, fps, color space, tone mapping, post-process flags, layer mask, and work mode.

#### Scenario: Normal debug view changes render graph
- **WHEN** `ViewportDescriptor.debugView` is `normal`
- **THEN** the compiled render graph enables the normal debug output path for that viewport without changing other viewports

### Requirement: FrameScheduler owns frame budgets and degradation
The system SHALL provide a FrameScheduler that owns per-workMode frame budgets for simulation, extraction, rendering, encoding, and presentation metadata. Under overload, it MUST degrade in this order: auxiliary viewport helper passes, auxiliary viewport fps/resolution, main viewport post-process quality, main viewport fps, main viewport resolution. It MUST NOT block the control WebSocket or command ack path as a degradation strategy.

#### Scenario: Auxiliary viewport degrades before main viewport
- **WHEN** GPU time exceeds budget with one main viewport and one auxiliary viewport
- **THEN** FrameScheduler first reduces or disables auxiliary viewport quality before reducing main viewport quality

#### Scenario: Control ack remains responsive under video load
- **WHEN** video encoding is overloaded
- **THEN** FrameScheduler drops or degrades video work and preserves command ack responsiveness

### Requirement: Runtime diagnostics are emitted
The system SHALL emit render runtime diagnostics sufficient for validation and user-facing diagnostics, including command ack latency, GPU frame time, encode time, dropped frame count, quality tier, frame id, scene revision, and applied command sequence where available.

#### Scenario: RenderFrameMeta includes quality diagnostics
- **WHEN** Engine emits metadata for a rendered viewport frame
- **THEN** the metadata includes frame identity and MAY include diagnostics such as GPU frame time, encode time, dropped frames, and quality tier

#### Scenario: Performance tests can assert budgets
- **WHEN** integration tests run a 1080p viewport baseline
- **THEN** they can assert command ack latency, encode latency, and frame budget metrics produced by FrameScheduler

### Requirement: Multi-viewport budgets share ECS extraction
The system SHALL avoid repeating Simulation ECS tick and extract work for each viewport in the same scene revision. Multi-viewport rendering MUST share scene extraction where possible while keeping viewport-specific render targets, cameras, graph variants, streams, and diagnostics independent.

#### Scenario: Two viewports share scene revision extraction
- **WHEN** the same scene revision is rendered by a perspective viewport and an orthographic viewport
- **THEN** Simulation tick and shared extraction run once while each viewport renders through its own camera and output stream

### Requirement: Exporters do not depend on Render World
The system SHALL ensure scene exporters read Simulation World authoring data and AssetDatabase descriptors. Exporters MUST NOT depend on Render World, RenderGraph resources, or GPU cache state.

#### Scenario: Export works without an active viewport stream
- **WHEN** a scene is exported while no realtime viewport stream is running
- **THEN** export succeeds using Simulation ECS and AssetDatabase data without requiring Render World resources
