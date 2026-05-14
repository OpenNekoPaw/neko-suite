## Why

After the engine has sink-based GPU output, effect discovery, GPU budget, preview routing, and puppet rendering, the remaining advanced media work can connect those foundations into richer GPU workflows: panoramic video, scene/puppet preview providers, puppet H.264/export, ML GPU bridge, and transition-as-effect.

## What Changes

- Add PanoramicRenderer-based video preview provider and scene/puppet preview providers.
- Add puppet H.264 stream and export integration using StreamSink and MuxerSink.
- Add ML GPU bridge design hooks for export-time texture/tensor workflows.
- Add transition-as-GpuEffect support for two-input transitions.
- Keep realtime ML effects out of scope unless a later lightweight runtime is designed.

## Capabilities

### New Capabilities

- `engine-advanced-gpu-media`: Defines advanced GPU media composition workflows including panoramic video preview, scene/puppet preview providers, puppet stream/export integration, ML GPU bridge hooks, and transition GPU effect composition.

### Modified Capabilities

- None.

## Impact

- Affects preview providers, puppet webview integration, export composition, GPU effect traits, and runtime-ml bridge boundaries.
- Depends on PipelineSink, MuxerSink, GPU budget, preview routing, PanoramicRenderer, and PuppetRenderer foundations.
