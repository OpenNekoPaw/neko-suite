## ADDED Requirements

### Requirement: Beat-grid UI state uses project state sync, not runtime audio messages
The system SHALL synchronize beat-grid and automation project state through existing project init/sync and operation messages. Webview MUST NOT introduce `audio:*` runtime messages for persisted tempo map or automation edits.

#### Scenario: project init includes tempo and automation
- **WHEN** Extension initializes a `.nka` v2.2 audio Webview
- **THEN** `project:init` includes `tempoMap` and automation fields as part of `AudioProjectData`

#### Scenario: automation edit uses operationApplied
- **WHEN** Webview commits an automation edit
- **THEN** it sends the typed project operation through the existing project operation sync path rather than an `audio:*` playback/export request

### Requirement: Project sync carries AI operation metadata for feedback
The system SHALL allow `project:sync` notifications to include the applied `EditOperation` metadata for Agent-originated edits. Webview MUST treat this as state replacement plus optional feedback metadata, not as a command to mutate state again.

#### Scenario: AI project sync drives feedback
- **WHEN** Webview receives `project:sync` with `operation.meta.source === 'ai'`
- **THEN** it may display an AI action badge or highlight for affected UI elements after replacing project data

#### Scenario: sync operation is not re-dispatched
- **WHEN** Webview receives `project:sync` with an applied operation
- **THEN** it does not send the same operation back to Extension as a new `operationApplied` user edit
