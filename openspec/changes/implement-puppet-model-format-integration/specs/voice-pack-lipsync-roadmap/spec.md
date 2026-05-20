## ADDED Requirements

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
