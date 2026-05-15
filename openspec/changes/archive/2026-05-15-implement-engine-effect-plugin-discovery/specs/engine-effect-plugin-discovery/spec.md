## ADDED Requirements

### Requirement: Audio Effect Factory Registry
The engine SHALL create audio DSP effects through a registration-based factory.

#### Scenario: Built-in audio effect is created
- **WHEN** mixdown configuration references a built-in audio effect type
- **THEN** `AudioEffectFactory` creates the corresponding `AudioEffect`

#### Scenario: Unknown audio effect
- **WHEN** mixdown configuration references an unknown audio effect type
- **THEN** the engine returns an invalid-parameter style error and does not silently insert a passthrough effect

### Requirement: Plugin Capability Activation
The engine SHALL register and unregister plugin-provided effect capabilities during plugin activation and deactivation.

#### Scenario: Shader plugin activates
- **WHEN** a plugin manifest declares a shader capability with a valid WGSL entry
- **THEN** activation registers it as a GPU effect capability

#### Scenario: Plugin deactivates
- **WHEN** a plugin is deactivated
- **THEN** all capabilities registered by that plugin are removed from the registry

### Requirement: Effect Capability Discovery
The engine SHALL expose registered effect capabilities through an ActionRouter controller action.

#### Scenario: Client lists capabilities
- **WHEN** a TS client dispatches `effects:list-capabilities`
- **THEN** the response includes built-in and active plugin capabilities with primitive parameter metadata

### Requirement: Offline ML Preprocessing
The engine SHALL provide an offline ML preprocessing workflow for source replacement without requiring GPU texture interop.

#### Scenario: Clip is preprocessed
- **WHEN** a user requests upscale or denoise preprocessing for a clip
- **THEN** the engine creates an output asset and returns metadata that lets TS replace the timeline source

### Requirement: P0 Rollback Flag Removal
The engine SHALL remove the temporary deprecated `use_pipeline_sink` fallback after P0 validation.

#### Scenario: P1 builds
- **WHEN** P1 effect/plugin discovery is complete
- **THEN** the old inline preview encoding path is no longer selectable through the rollback flag
