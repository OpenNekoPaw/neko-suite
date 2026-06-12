# voice-pack-lipsync-roadmap Specification

## Purpose
Define the design-only roadmap for voice-pack assets, lip-sync driver contracts, and deferred voice/lip-sync integration.
## Requirements
### Requirement: Voice Pack Contract Roadmap
The system SHALL define a design-only contract for voice-pack assets that can bind to puppet or model character entities.

#### Scenario: Voice pack metadata
- **WHEN** a voice-pack asset is described
- **THEN** its metadata includes audio files, language or speaker metadata when available, and optional lip-sync timeline references

### Requirement: Lip-Sync Driver Contract Roadmap
The system SHALL define a design-only `ILipSyncDriver` contract for converting audio into target face parameter timelines.

#### Scenario: Generate puppet face timeline
- **WHEN** a lip-sync driver receives audio and target `puppet`
- **THEN** it returns a timeline of face parameter values suitable for puppet mouth/viseme application

#### Scenario: Generate VRM face timeline
- **WHEN** a lip-sync driver receives audio and target `vrm`
- **THEN** it returns a timeline of face or expression values suitable for model/VRM application

### Requirement: Voice And Lip-Sync Are Deferred
The system SHALL keep ML lip-sync implementation out of the main puppet/model format integration implementation.

#### Scenario: Main integration completes without ML lip-sync
- **WHEN** Live2D import, model Agent tools, asset search, and market targets are implemented
- **THEN** the change can complete without a production ML lip-sync driver

### Requirement: Voice cues bind to entity voice representations
The system SHALL define the design-level handoff between structured voice cues and entity voice representations. A voice cue MAY request a voice representation for a speaker entity, and missing voice assets MUST surface as representation requirements rather than blocking storyboard or Cut import.

#### Scenario: Voice cue resolves voice pack
- **WHEN** a structured voice cue references a speaker entity with a bound voice representation
- **THEN** a TTS or future lip-sync workflow can resolve that representation through the entity representation resolver

#### Scenario: Voice cue lacks voice pack
- **WHEN** a structured voice cue references a speaker entity with no voice representation
- **THEN** the system records or surfaces a missing voice representation requirement and keeps the cue editable

### Requirement: Lip-sync remains deferred behind cue lineage
The system SHALL preserve cue id, speaker entity, generated audio asset id, and source cue lineage so future lip-sync drivers can consume them. This change MUST NOT require a production ML lip-sync driver.

#### Scenario: Generated dialogue audio keeps cue lineage
- **WHEN** TTS generates audio for a structured dialogue cue
- **THEN** the generated audio asset can record the source cue id and speaker entity for future lip-sync or validation workflows

