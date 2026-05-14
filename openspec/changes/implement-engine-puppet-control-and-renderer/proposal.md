## Why

Puppet currently has a REST-style fire-and-forget control plane and webview Canvas2D rendering, so it lacks ordering/revision validation and cannot produce engine-side GPU frames for high-quality preview, composition, or export. The control plane can be fixed independently, while GPU rendering depends on PipelineSink and GPU budget foundations.

## What Changes

- Add `PuppetCommandEnvelope` and `PuppetCommand` contracts.
- Add a WebSocket puppet command route with sequence and revision validation.
- Keep REST endpoints as compatibility aliases that translate into command handling.
- Add `PuppetRenderer` using wgpu SpriteBatch for deformed meshes and texture atlases.
- Produce `VideoOutput::GpuFrame` from puppet rendering for later stream/export composition.
- Keep Canvas2D as legacy/debug, not as a production fallback.

## Capabilities

### New Capabilities

- `engine-puppet-control-and-renderer`: Defines puppet command ordering, revision-aware control, engine-side puppet GPU rendering, and GPU frame output for puppet workflows.

### Modified Capabilities

- None.

## Impact

- Affects `engine-types`, `host-http`, `runtime-puppet`, and `engine-kernel`.
- Puppet WS command work has no GPU dependency and may land before renderer work.
- PuppetRenderer depends on PipelineSink output contracts and GPU budget permits.
