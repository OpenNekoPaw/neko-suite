## ADDED Requirements

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
