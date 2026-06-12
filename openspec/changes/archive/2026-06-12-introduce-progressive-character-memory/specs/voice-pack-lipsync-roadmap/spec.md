## ADDED Requirements

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
