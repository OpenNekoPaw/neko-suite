## 1. Command Protocol

- [x] 1.1 Add `PuppetCommandEnvelope`, `PuppetCommand`, ack, and error DTOs.
- [x] 1.2 Add puppet WebSocket command route with sequence and revision validation.
- [x] 1.3 Update puppet service to accept typed commands.
- [x] 1.4 Keep REST endpoints as aliases into the typed command path.
- [x] 1.5 Add ordering, conflict, and REST parity tests.

## 2. Renderer Foundation

- [x] 2.1 Add `engine-kernel/src/gpu/puppet_renderer/mod.rs`.
- [x] 2.2 Add SpriteBatch rendering module for textured puppet meshes.
- [x] 2.3 Add WGSL shaders for puppet textured mesh rendering.
- [x] 2.4 Add texture atlas/resource cache ownership.

## 3. Service Integration

- [x] 3.1 Add optional `PuppetRenderer` to puppet service wiring.
- [x] 3.2 Extract deformed mesh data from runtime-puppet into renderer input.
- [x] 3.3 Produce `VideoOutput::GpuFrame` with `GpuFrameLease`.
- [x] 3.4 Acquire GPU budget permits before render work.

## 4. Verification

- [x] 4.1 Compare standard puppet pose output against Canvas2D reference.
- [x] 4.2 Verify puppet GPU frames can be accepted by PipelineSink-compatible test sinks.
- [x] 4.3 Verify typical puppet performance target with representative vertex/texture counts.
- [x] 4.4 Run affected Rust and TS tests.
