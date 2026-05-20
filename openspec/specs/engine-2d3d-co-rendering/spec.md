# engine-2d3d-co-rendering Specification

## Purpose
TBD - created by archiving change implement-2d3d-unified-engine-foundation. Update Purpose after archive.
## Requirements
### Requirement: Mixed Scene And Puppet GPU Export
The engine SHALL export timelines containing both `ElementType::Scene3D` and `ElementType::Puppet` visual elements through the GPU export pipeline.

#### Scenario: Scene and puppet elements are visible together
- **WHEN** a timeline contains visible Scene3D and Puppet elements at the same export timestamp
- **THEN** GPU export collects both element types
- **THEN** the resulting frame includes both rendered layers according to timeline z-index and opacity

#### Scenario: Existing visual elements remain compatible
- **WHEN** a timeline contains media, text, subtitle, shape, Scene3D, and Puppet elements
- **THEN** the addition of Puppet export does not remove or reorder existing non-puppet layer handling except by the established z-index order

### Requirement: Puppet Render Output Adapts To GpuLayer
The engine SHALL adapt puppet render output into the existing `GpuLayer` composition contract instead of adding puppet-specific logic to `TextureCompositor`.

#### Scenario: Puppet GPU output becomes a layer
- **WHEN** Puppet rendering produces a compositable GPU texture for a visible timeline element
- **THEN** the export pipeline creates a `GpuLayer` with the element transform, opacity, blend mode, and z-index

#### Scenario: Compositor stays domain agnostic
- **WHEN** Scene3D and Puppet layers are composited
- **THEN** `TextureCompositor` receives generic `GpuLayer` references
- **THEN** it does not branch on Scene3D or Puppet domain types

#### Scenario: Unsupported GPU interop is explicit
- **WHEN** a Puppet render output cannot be safely represented as a `GpuLayer`
- **THEN** export returns or records an explicit unsupported-capability error for that layer path
- **THEN** it does not silently fall back to CPU readback composition

### Requirement: Render Services Are Injected Into Export Pipeline
The export pipeline SHALL receive scene and puppet render capabilities through export backend or kernel facade boundaries rather than constructing runtime services itself.

#### Scenario: Default backend injects services
- **WHEN** production export creates a GPU export pipeline through the default backend factory
- **THEN** the factory provides the configured scene and puppet render service ports when available
- **THEN** `GpuExportPipeline` does not instantiate scene or puppet services internally

#### Scenario: Tests can inject fake render services
- **WHEN** export orchestration is tested with fake scene or puppet render services
- **THEN** the test can verify layer collection, failure propagation, and z-index ordering without constructing full runtime worlds

### Requirement: Scene And Puppet Timing Is Timeline Relative
Scene3D and Puppet render times SHALL be derived from the timeline element source time and element-specific playback settings.

#### Scenario: Puppet element starts after timeline zero
- **WHEN** a Puppet element starts at a non-zero timeline timestamp
- **THEN** export computes puppet animation/render timing from the element source time rather than the absolute export timestamp

#### Scenario: Scene animation timing remains compatible
- **WHEN** a Scene3D element uses existing animation speed and clip fields
- **THEN** adding Puppet co-rendering does not change Scene3D animation timing behavior
