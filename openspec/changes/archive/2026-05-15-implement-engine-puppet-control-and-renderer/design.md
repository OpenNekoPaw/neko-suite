## Context

Runtime puppet computation is engine-side ECS, but rendering is currently webview Canvas2D and control is REST-like. This prevents reliable multi-source editing, command ordering, revision conflict detection, and engine-side GPU composition. The ADR splits P2-PR3 puppet control from P2-PR4 puppet rendering.

## Goals / Non-Goals

**Goals:**

- Add revision-aware puppet WebSocket command protocol.
- Preserve REST compatibility through aliases.
- Add engine-side PuppetRenderer using wgpu SpriteBatch.
- Produce `VideoOutput::GpuFrame` from puppet render output.
- Integrate renderer GPU work with `GpuBudgetController`.

**Non-Goals:**

- Make H.264 puppet stream the primary webview path in this change; that is P3.
- Remove Canvas2D entirely.
- Implement shared-core extraction for scene/puppet hierarchy or animation.
- Implement puppet export integration beyond producing GPU frames.

## Decisions

### WebSocket Command Envelope

Puppet command input uses a command envelope with sequence and revision, mirroring scene command semantics.

Alternatives considered:

- Keep REST fire-and-forget. Rejected because it has no ordering or conflict detection.

### Renderer Is Engine-Side SpriteBatch

`PuppetRenderer` consumes deformed meshes and texture atlases and renders with instanced sprite/mesh batching.

Alternatives considered:

- Keep Canvas2D as the production renderer. Rejected because it cannot provide engine GPU frames or high-quality export.

### GPU Output Uses Existing Sink Contract

PuppetRenderer outputs `VideoOutput::GpuFrame` and lets StreamSink/MuxerSink/SnapshotSink decide the destination.

Alternatives considered:

- Give puppet its own encoder or file output path. Rejected because it duplicates the engine output layer.

## Risks / Trade-offs

- [Risk] Control protocol changes break existing clients -> Mitigation: retain REST aliases and add parity tests.
- [Risk] Renderer output differs from Canvas2D reference -> Mitigation: compare standard pose output against Canvas2D reference images.
- [Risk] Texture atlas lifetime is tricky -> Mitigation: route resources through renderer-owned caches and explicit GPU frame leases.
- [Risk] GPU renderer competes with interactive preview -> Mitigation: acquire GPU budget permits before rendering.

## Migration Plan

1. Add puppet command DTOs.
2. Add WebSocket command route and service handling.
3. Preserve REST endpoints as aliases.
4. Add PuppetRenderer modules and shaders.
5. Connect renderer to puppet service as an optional engine renderer.
6. Validate GPU output compatibility with PipelineSink.
7. Roll back by disabling engine renderer while keeping command protocol aliases.
