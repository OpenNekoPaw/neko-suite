# engine-gpu-effect-registry Specification

## Purpose
TBD - created by archiving change implement-engine-gpu-effect-registry. Update Purpose after archive.
## Requirements
### Requirement: Registered GPU Effects
The engine SHALL dispatch GPU effects through a registry of `GpuEffect` implementations.

#### Scenario: Built-in effect is registered
- **WHEN** a timeline uses a built-in blur, style, color, or shader preset effect
- **THEN** `EffectDispatcher` resolves it from the registry and applies it through the GPU texture-to-texture path

#### Scenario: New effect does not require dispatcher match edit
- **WHEN** a new GPU effect implementation is registered with an id
- **THEN** the dispatcher can apply it without adding a new hard-coded match branch

### Requirement: Unknown GPU Effects Fail
The engine SHALL return an explicit unknown-effect error for GPU effects that are not registered.

#### Scenario: Unknown effect id
- **WHEN** an effect chain references an unregistered effect id
- **THEN** the engine returns `UnknownEffect`
- **AND** it does not perform GPU readback, CPU processing, and GPU upload as fallback

### Requirement: Built-In Parity
The engine SHALL preserve current behavior for all existing known GPU effects after registry migration.

#### Scenario: Existing project renders known effects
- **WHEN** a project using existing known effects is rendered
- **THEN** the output is visually equivalent to the previous hard-coded dispatcher path

### Requirement: Future Optimization Hooks
The `GpuEffect` trait SHALL expose default cost and in-place support methods without requiring P0 implementers to provide custom values.

#### Scenario: P0 effect omits optimization overrides
- **WHEN** a built-in effect adapter does not override `estimated_cost()` or `supports_in_place()`
- **THEN** the dispatcher treats cost as zero and in-place support as false

