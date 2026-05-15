## Why

GPU effect dispatch is currently routed through hard-coded string matches and unknown effects can fall into CPU fallback behavior. This blocks plugin shader effects from using the fast texture-to-texture path and makes each new built-in effect require dispatcher edits.

## What Changes

- Add a `GpuEffect` trait for registered texture-to-texture GPU effects.
- Replace hard-coded `EffectDispatcher` routing with a registry lookup.
- Wrap existing blur, style, color, and custom shader preset processors as registered effects.
- Return `UnknownEffect` for unregistered effect ids instead of silently falling back to CPU round trips.
- Reserve default `estimated_cost()` and `supports_in_place()` methods for later GPU budget optimization.

## Capabilities

### New Capabilities

- `engine-gpu-effect-registry`: Defines registered GPU effect dispatch, unknown effect failure behavior, and no-CPU-fallback guarantees for GPU effect chains.

### Modified Capabilities

- None.

## Impact

- Affects `engine-kernel/src/export/gpu_export_pipeline.rs` and GPU processor modules.
- Adds `engine-kernel/src/gpu/effect_trait.rs`.
- Provides the base for later plugin activation, effect discovery, ML bridge, transition, and GPU budget cost signals.
