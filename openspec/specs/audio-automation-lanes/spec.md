# audio-automation-lanes Specification

## Purpose
Define audio automation lane persistence, validation, editing operations, parameter metadata, and render/mix behavior.
## Requirements
### Requirement: Track mix state persists automation lanes
The system SHALL persist automation lanes in `AudioTrackMixState.automation`. Automation points MUST use tick positions as their time source of truth and MUST NOT persist derived seconds.

#### Scenario: automation persists after save and reopen
- **WHEN** a user creates a volume automation lane and saves the `.nka` project
- **THEN** reopening the project restores the lane target, enabled state, point ticks, values, and curve types from `AudioProjectData.trackMix`

#### Scenario: automation stores ticks only
- **WHEN** automation points are serialized to `.nka`
- **THEN** each point stores `ticks`, `value`, and `curve`, and does not store a derived `seconds` field

### Requirement: Automation targets are structured and validated
The system SHALL represent automation targets as structured identities. Supported targets MUST include track volume, track pan, and effect parameter targets addressed by `effectId` and `param`.

#### Scenario: track volume target validates numeric range
- **WHEN** an automation lane targets track volume
- **THEN** validator accepts values in `[0, 2]` and rejects values outside that range

#### Scenario: effect parameter target validates against shared registry
- **WHEN** an automation lane targets an effect parameter
- **THEN** validator confirms the effect exists in the track effect chain and validates the parameter against shared audio effect parameter metadata

### Requirement: Audio effect parameter metadata is shared
The system SHALL define the audio effect parameter metadata needed for automation validation in `neko-types`. Webview UI definitions MAY add display details, but validator, Agent tools, and Engine-facing config MUST NOT import Webview-only effect definition modules.

#### Scenario: validator reads shared parameter metadata
- **WHEN** validator checks an `effect-param` automation target
- **THEN** it reads parameter type and numeric range from the shared registry rather than from `packages/neko-audio/packages/webview`

#### Scenario: Webview reuses shared metadata
- **WHEN** the EffectEditor renders an automatable numeric effect parameter
- **THEN** its UI definition is derived from or checked against the shared parameter metadata for the same effect type and parameter key

### Requirement: Automation edits use typed operations
The system SHALL represent automation changes through typed `TrackMixOperation` entries. The apply and invert routers MUST support setting an automation lane collection for a track without bypassing undo/redo or Extension synchronization.

#### Scenario: user automation edit dispatches operation
- **WHEN** a user adds, removes, or edits automation lane points
- **THEN** the Webview dispatches a `track.mix.setAutomation` operation with before data for undo

#### Scenario: undo restores previous automation
- **WHEN** a user performs undo after editing automation points
- **THEN** the inverted operation restores the previous automation lane collection for that track

### Requirement: Automation lanes are editable in the audio Webview
The system SHALL provide a per-track automation lane UI that can be expanded from TrackHeader. The UI MUST edit persisted automation through `audioProjectStore` operations and MUST NOT store automation only in local view state.

#### Scenario: TrackHeader expands automation lanes
- **WHEN** a user activates the automation control for a track
- **THEN** the timeline shows editable automation lanes for that track

#### Scenario: lane edit updates project state
- **WHEN** a user drags an automation point
- **THEN** the committed edit updates `AudioProjectData.trackMix[trackId].automation` through the shared operation dispatch path

### Requirement: Automation affects mix stream and export rendering
The system SHALL apply enabled automation lanes to track volume, track pan, and supported effect parameters during Engine mix stream and mix export rendering.

#### Scenario: volume automation changes rendered output
- **WHEN** a track has enabled volume automation over time
- **THEN** mix stream and mix export output reflect the automated volume values at render time

#### Scenario: disabled automation lane is ignored
- **WHEN** an automation lane is persisted with `enabled: false`
- **THEN** mix rendering ignores that lane and uses the static track/effect value
