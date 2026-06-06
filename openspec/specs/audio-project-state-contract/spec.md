# audio-project-state-contract Specification

## Purpose
Defines `.nka` project-state ownership for persisted audio mix data, edit
operations, codec validation, and version downgrade behavior.
## Requirements
### Requirement: Audio project data owns persisted track mix state
The system SHALL persist per-track mix state in `AudioProjectData.trackMix`. Volume, pan, solo, and per-track effect chain changes MUST be represented in project data and MUST NOT be stored only in Webview-local UI state.

#### Scenario: Track volume persists after save and reopen
- **WHEN** a user changes a track volume and saves the `.nka` project
- **THEN** reopening the project restores the changed volume from `AudioProjectData.trackMix`

#### Scenario: Local view state remains non-persisted
- **WHEN** a user changes track height, color, selection, zoom, or panel visibility
- **THEN** the system stores that state as local view/UI state and does not write it into `.nka` mix state

### Requirement: Track mix changes use edit operations
The system SHALL represent track mix changes as typed `TrackMixOperation` entries in the shared `EditOperation` union. The operation apply and invert routers MUST support track volume, pan, solo, add effect, remove effect, update effect, and move effect operations.

#### Scenario: User edit dispatches track mix operation
- **WHEN** the TrackHeader or Mixer changes a track pan value
- **THEN** the Webview dispatches a `track.mix.setPan` operation and applies it through the shared operation router

#### Scenario: Undo reverts track mix edit
- **WHEN** a user performs undo after a track effect is added
- **THEN** the inverted operation removes the same effect and restores the previous project data

### Requirement: Extension cache receives user project operations
The system SHALL synchronize Webview user edit operations to the Extension project cache. The Extension MUST apply received operations to `_projectDataCache`, mark the custom document dirty, and save `.nka` from the updated cache.

#### Scenario: User operation updates Extension cache
- **WHEN** Webview sends `operationApplied` with a valid track mix operation
- **THEN** Extension applies the operation to the cached `AudioProjectData` for the same document and marks the document dirty

#### Scenario: Invalid operation is rejected
- **WHEN** Webview sends an operation that cannot be applied to the cached project data
- **THEN** Extension reports an error and does not mark the project as successfully changed

### Requirement: `.nka` save path uses the shared codec
The system SHALL save audio projects through `saveNka(data)` rather than raw JSON serialization. The codec MUST write the current `.nka` version and validate the persisted project shape unless validation is explicitly disabled for a controlled migration path.

#### Scenario: Saved file includes current version
- **WHEN** Extension saves a project document
- **THEN** the serialized `.nka` file includes the current `CURRENT_NKA_VERSION`

#### Scenario: Invalid project fails validation
- **WHEN** `saveNka(data)` receives invalid required project fields
- **THEN** the save path fails with a validation error instead of writing malformed `.nka`

### Requirement: `.nka` loading handles current and future versions explicitly
The system SHALL accept the current `.nka` version and open unknown future versions in read-only mode with warnings. Because this foundation has not shipped, non-current past versions are not kept as compatibility inputs.

#### Scenario: Past project version is rejected
- **WHEN** `loadNka()` loads a non-current past project version
- **THEN** compatibility metadata marks the version invalid and no effect-name migration is applied

#### Scenario: Future project opens read-only
- **WHEN** `loadNka()` loads a project with an unknown future version
- **THEN** Extension opens the project read-only and exposes compatibility warnings to the user

### Requirement: Downgrade save strips unsupported future schema fields
The system SHALL require explicit user confirmation before saving an unknown future `.nka` version as the current version. After confirmation, `saveNka()` MUST serialize only fields defined by the current schema and MUST NOT preserve unknown future fields in a current-version file.

#### Scenario: User cancels downgrade
- **WHEN** a user attempts to save a read-only future-version project and cancels the downgrade confirmation
- **THEN** Extension does not write the file and keeps the read-only state

#### Scenario: User confirms downgrade
- **WHEN** a user confirms saving a future-version project as the current version
- **THEN** Extension writes a current-version `.nka` file and unsupported future fields are stripped

### Requirement: Audio project state changes keep dependency direction valid
The system SHALL keep shared audio project contracts independent of Webview and VSCode APIs. Shared operation and `.nka` codec modules MUST remain serializable and usable by both Webview and Extension without importing React, VSCode, or Node-only APIs.

#### Scenario: Shared contracts compile without Webview or VSCode imports
- **WHEN** the shared audio project contract modules are compiled
- **THEN** they do not import React, `vscode`, or Webview-only modules

### Requirement: Audio project state supports `.nka` v2.2 tempo and automation fields
The system SHALL extend the current `.nka` project schema to v2.2 with `AudioProjectData.tempoMap` and `AudioTrackMixState.automation`. Loading, saving, validation, and downgrade stripping MUST explicitly account for these fields.

#### Scenario: v2.2 schema validates tempo and automation
- **WHEN** `saveNka(data)` receives a v2.2 audio project with tempo and automation fields
- **THEN** the shared validator checks tempo event ordering, time signature event ordering, automation target validity, point tick ordering, value ranges, and curve values before writing

#### Scenario: downgrade strips v2.2 fields
- **WHEN** a user confirms saving an unsupported future or downgraded audio project as a schema version that does not support tempo/automation fields
- **THEN** the codec strips unsupported tempo and automation fields instead of preserving unknown future data

### Requirement: Shared audio effect parameter metadata owns automation validation
The system SHALL define serializable audio effect parameter metadata in shared code for any effect parameter that can be automated. This metadata MUST include enough information to validate supported numeric automation targets without importing Webview modules.

#### Scenario: shared metadata has numeric bounds
- **WHEN** an automatable numeric effect parameter is registered
- **THEN** shared metadata includes its effect type, parameter key, value kind, minimum, maximum, and optional step/unit

#### Scenario: Webview-only definitions are not imported by shared validators
- **WHEN** `.nka` automation validation runs in shared code
- **THEN** it does not import React, Webview, VSCode, or `packages/neko-audio/packages/webview` modules

### Requirement: Master volume edits use audio operations
The system SHALL represent project master volume edits as a typed audio operation before adding a Mixer master strip. The operation MUST apply, invert, validate range, and synchronize through the same Webview-to-Extension project operation path as other audio project edits.

#### Scenario: master volume operation persists
- **WHEN** a caller dispatches `audio.setMasterVolume`
- **THEN** the operation updates `AudioProjectData.masterVolume`, supports undo, and is saved into `.nka`

#### Scenario: invalid master volume is rejected
- **WHEN** `audio.setMasterVolume` receives a value outside the supported master volume range
- **THEN** the shared operation apply path rejects the operation and does not mutate project data
