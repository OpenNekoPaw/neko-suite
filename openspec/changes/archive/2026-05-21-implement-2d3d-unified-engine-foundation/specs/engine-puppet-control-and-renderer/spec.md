## MODIFIED Requirements

### Requirement: Engine-Side Puppet Renderer
The engine SHALL provide a GPU puppet renderer that consumes deformed meshes and texture atlases and exposes output that can be submitted to sinks or adapted into GPU composition layers.

#### Scenario: Puppet frame rendered
- **WHEN** puppet deformation data and textures are available
- **THEN** `PuppetRenderer` produces a GPU frame output compatible with `VideoOutput::GpuFrame`

#### Scenario: Puppet output can become composition layer
- **WHEN** export needs to composite a visible Puppet timeline element with other visual layers
- **THEN** the puppet render output can be adapted to a `GpuLayer` without CPU readback when supported by the platform handle

#### Scenario: Canvas2D remains debug only
- **WHEN** engine GPU rendering is available
- **THEN** Canvas2D is not used as a production rendering fallback for export or composition

### Requirement: Puppet GPU Budget Integration
Puppet GPU rendering SHALL acquire GPU budget permits before render work.

#### Scenario: Puppet render under pressure
- **WHEN** PuppetRenderer runs while interactive GPU pressure is high
- **THEN** it follows the configured budget priority behavior instead of switching to CPU rendering

#### Scenario: Export render reports budget pressure
- **WHEN** Puppet rendering is requested by GPU export while the GPU budget is queued or paused
- **THEN** the export path receives an explicit retry/busy error rather than blocking indefinitely

## ADDED Requirements

### Requirement: Puppet Service Uses A Computation Boundary
PuppetService SHALL centralize Bevy world access through a computation boundary equivalent to the scene service `creative<R>()` / `data<R>()` closure pattern.

#### Scenario: Puppet data query locks centrally
- **WHEN** PuppetService reads snapshots, parameters, or deformed meshes
- **THEN** the read path uses the centralized world access helper
- **THEN** lock poisoning maps to the existing service error category consistently

#### Scenario: Puppet mutation locks centrally
- **WHEN** PuppetService applies commands, ticks animation, or updates parameters
- **THEN** the mutation path uses the centralized world access helper
- **THEN** command ordering and revision checks remain compatible

#### Scenario: Public puppet service behavior is preserved
- **WHEN** existing callers use `IPuppetService`
- **THEN** method names, return types, and compatibility command behavior remain stable unless a later spec explicitly changes them
