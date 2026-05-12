## ADDED Requirements

### Requirement: Extension builds project mix render instructions
The system SHALL build project playback and export render instructions from Extension-owned `AudioProjectData` using `buildMixConfig(data, ctx)`. Webview MUST send playback/export intents and MUST NOT build or send project `MixdownConfig` for normal project playback/export flows.

#### Scenario: Project playback starts from Extension-built config
- **WHEN** Webview sends `audio:playback` with action `play` for a project
- **THEN** Extension builds `MixdownConfig` from its cached project data and starts `audios:mix_stream` with that config

#### Scenario: Webview does not send project config
- **WHEN** Webview requests project export
- **THEN** the message contains export intent options and does not contain a full project mix config

### Requirement: Mix config construction resolves project paths
The system SHALL resolve `.nka` element source paths from relative or `${VAR}/path` form into Engine-readable file paths before sending `MixdownConfig` to Rust Engine. `buildMixConfig(data, ctx)` MUST require a context that provides project directory and path resolution.

#### Scenario: Relative source path is resolved
- **WHEN** a project element source is stored as a relative path
- **THEN** the produced `MixdownConfig.tracks[].elements[].src` is resolved against the project directory

#### Scenario: Variable source path is resolved
- **WHEN** a project element source uses `${VAR}/path`
- **THEN** the produced config expands the variable through the provided path resolver

### Requirement: Rust CLI maps `.nka` to MixdownConfig independently
The system SHALL keep Rust CLI `.nka` rendering independent from the TypeScript `buildMixConfig()` runtime. Rust `host-cli` MAY implement a read-only `NkaLoader`, but Engine kernel MUST receive only `MixdownConfig` and MUST NOT edit, migrate, or save `.nka` project data.

#### Scenario: CLI exports current `.nka`
- **WHEN** a user runs a CLI export for a supported `.nka` file
- **THEN** `host-cli` loads project metadata, resolves paths with Rust `ProjectContext`, builds `MixdownConfig`, and invokes Engine render logic

#### Scenario: CLI rejects unsupported `.nka` version
- **WHEN** CLI loads an unsupported legacy or future `.nka` version
- **THEN** CLI reports that the file must be upgraded in VSCode rather than migrating it inside Engine kernel

### Requirement: Audio effect types are canonical and renderable status is explicit
The system SHALL define canonical hyphenated engine-supported audio effect types and planned-only effect types. Agent schemas, presets, Webview definitions, `.nka` loading, and Engine-facing configs MUST use canonical names for renderable effects.

#### Scenario: Agent schema uses canonical names
- **WHEN** Agent exposes an audio effect tool schema
- **THEN** renderable effect enum values use hyphenated names such as `parametric-eq` and `noise-gate`

#### Scenario: Planned effect is not silently rendered
- **WHEN** a project contains a planned-only effect such as `noise-reduction`, `pitch-shift`, or `time-stretch`
- **THEN** the system rejects it before Engine transcode or filters it from mix render config with a user-visible warning

### Requirement: Transcode supports effects and trim
The system SHALL support effects and time range trim in `audios:transcode`. Host API request options MUST accept canonical effects and `startTime`/`endTime`, validate effect values, and pass typed effect values to Engine kernel transcode processing.

#### Scenario: Transcode applies gain effect
- **WHEN** Extension calls transcode with a gain effect using `gainDb`
- **THEN** Engine applies the gain during decode/encode processing and the output audio differs by the requested level

#### Scenario: Transcode trims time range
- **WHEN** Extension calls transcode with `startTime` and `endTime`
- **THEN** Engine writes an output file for the requested time range with timestamps rebased from zero

### Requirement: Stateful transcode effects persist across frames
The system SHALL build each transcode `EffectChain` once before the decode/encode loop and reuse it for all decoded frames. Stateful effects MUST NOT be rebuilt per frame.

#### Scenario: Delay or reverb state accumulates
- **WHEN** transcode processes an input with a delay or reverb effect
- **THEN** the effect state persists across decoded frames during the operation

### Requirement: Mixdown endpoint accepts MixdownConfig only
The system SHALL accept `{ config: MixdownConfig, time? }` for `audios:mixdown`. Because this foundation has not shipped, the endpoint MUST NOT accept legacy `{ tracks, sampleRate, channels, time }` input.

#### Scenario: New mixdown request uses config
- **WHEN** a caller sends `audios:mixdown` with `config`
- **THEN** Engine deserializes the config and returns a single mixed PCM snapshot for the requested time

#### Scenario: Missing config is rejected
- **WHEN** a caller sends `audios:mixdown` without `config`
- **THEN** the endpoint returns an invalid-request error that names `config` as required

### Requirement: Mix paths surface unsupported effect warnings
The system SHALL never silently drop unsupported effects in mix stream or mix export paths. Mix playback MAY continue with unsupported effects skipped, but warnings MUST be collected during initial chain build and hot-update chain rebuild; mix export MUST return warnings to Extension.

#### Scenario: Unsupported track effect in export
- **WHEN** a project export contains an unsupported track effect
- **THEN** export succeeds when audio can otherwise be rendered and the response includes a warning naming the unsupported effect

#### Scenario: Unsupported effect during hot update
- **WHEN** a mix stream hot-update config contains an unsupported effect
- **THEN** the update path records or returns a warning instead of silently retaining or dropping chains without notice

### Requirement: Mix stream hot updates replace full render config
The system SHALL hot-update audio mix streams by replacing the full `MixdownConfig` derived from `AudioProjectData`. Engine MUST NOT treat `.nka` edit operations as incremental Engine-side project edits.

#### Scenario: Playback-affecting edit updates active stream
- **WHEN** a playback-affecting project edit occurs during active mix playback after hot-update support is enabled
- **THEN** Extension rebuilds `MixdownConfig` and sends a full config replacement to the active mix stream

#### Scenario: Engine does not apply `.nka` edit operation
- **WHEN** Extension updates a mix stream
- **THEN** Engine receives a render config and not a `.nka` `EditOperation`
