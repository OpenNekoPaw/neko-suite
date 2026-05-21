## ADDED Requirements

### Requirement: Mix config carries renderable automation data
The system SHALL extend TypeScript `buildMixConfig(data, ctx)` and Engine-facing mix config types with renderable automation data derived from `AudioProjectData`. Engine-facing configs MUST contain enough timing information for Engine to evaluate automation during stream and export rendering without reading `.nka`.

#### Scenario: buildMixConfig includes enabled automation
- **WHEN** a track contains enabled automation lanes
- **THEN** `buildMixConfig` includes the corresponding automation data in the track render config after validating targets and converting tick timing as required

#### Scenario: buildMixConfig omits invalid automation
- **WHEN** a track contains automation that references a missing effect or unsupported parameter
- **THEN** `buildMixConfig` rejects the config or returns a user-visible warning rather than silently rendering incorrect automation

### Requirement: Engine applies automation during mixdown
The system SHALL apply automation curves in Engine mix stream and mix export paths for track volume, track pan, and supported effect parameters. Automation evaluation MUST be deterministic for the same render config and time.

#### Scenario: mix stream evaluates automation at playback time
- **WHEN** a mix stream renders a buffer that crosses automation points
- **THEN** Engine evaluates the configured curve and applies the correct value for samples or render blocks in that buffer

#### Scenario: export and stream agree
- **WHEN** the same project automation is rendered by mix stream and mix export
- **THEN** both paths use the same automation evaluation semantics

### Requirement: Engine remains independent of `.nka` editing
The system SHALL keep Engine automation rendering independent of `.nka` codec and edit operation logic. Engine MUST receive automation through render config updates and MUST NOT apply `track.mix.setAutomation` operations directly.

#### Scenario: hot update sends full config
- **WHEN** an automation edit affects active playback after hot-update support is enabled
- **THEN** Extension rebuilds and sends a full mix render config replacement to Engine

#### Scenario: Engine does not import project operation types
- **WHEN** Engine mixdown compiles
- **THEN** it does not depend on TypeScript `.nka` edit operation definitions
