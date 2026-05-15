## Why

After GPU effects can be registered, the engine still needs plugin activation, audio effect registration, capability discovery, and offline ML workflows to make those contracts useful to TypeScript clients and extension packages.

## What Changes

- Replace hard-coded audio DSP factory creation with `AudioEffectFactory`.
- Implement `PluginActivationHandler` integration for shader, audio, model, and LUT capabilities.
- Add `EffectCapability` metadata and an `effects:list-capabilities` action.
- Migrate TS effect discovery away from hard-coded built-in lists.
- Add an offline ML preprocessing action for timeline source replacement.
- Remove the temporary `use_pipeline_sink` rollback flag after P0 validation.

## Capabilities

### New Capabilities

- `engine-effect-plugin-discovery`: Defines effect capability discovery, plugin effect activation, audio effect factory registration, and offline ML preprocessing workflows.

### Modified Capabilities

- None.

## Impact

- Affects `engine-kernel` audio DSP and GPU effect registration surfaces.
- Affects `host-api` plugin activation and effects/models controllers.
- Affects TS effect discovery and timeline integration for offline ML preprocessing.
- Depends on `engine-gpu-effect-registry` for GPU effect registration semantics.
