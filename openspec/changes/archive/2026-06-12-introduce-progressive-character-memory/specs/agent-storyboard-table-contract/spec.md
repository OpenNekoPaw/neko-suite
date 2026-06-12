## ADDED Requirements

### Requirement: Storyboard character participation preserves continuity details
The system SHALL preserve per-shot character participation details during storyboard rendering and projection. Participation details MUST include stable identity when available, display name, role, action, emotion, and continuity notes where the target contract supports them.

#### Scenario: Canvas projection preserves character role and action
- **WHEN** a valid storyboard shot includes a character with role, action, emotion, and continuity notes
- **THEN** the Canvas projection preserves those fields or emits a capability diagnostic if the current Canvas contract cannot store them

#### Scenario: Webview renders continuity notes
- **WHEN** Agent Webview renders a storyboard table with character continuity notes
- **THEN** the notes are visible or inspectable without requiring the user to open raw JSON

### Requirement: Storyboard characters can reference creative entities
The system SHALL allow storyboard character participation to carry a creative entity reference in addition to backward-compatible character id and display name fields. Consumers MUST treat unresolved or candidate characters as reviewable planning data rather than projection-blocking errors.

#### Scenario: Known storyboard character has entity ref
- **WHEN** Agent generates a storyboard shot for a confirmed project character
- **THEN** the shot character can include the corresponding creative entity reference for downstream representation resolution

#### Scenario: Unresolved storyboard character remains renderable
- **WHEN** a storyboard shot names a character that has not been confirmed as an entity
- **THEN** the storyboard remains renderable and projectable with a missing-entity or candidate diagnostic instead of failing validation

### Requirement: Storyboard voice cues support speaker and voice binding
The system SHALL support optional structured voice cues for dialogue and voice-over while preserving existing string fields for backward compatibility. Structured cues MUST include cue id, cue kind, text, optional speaker entity reference, optional display speaker, optional emotion or delivery metadata, optional voice representation request, and source refs where available.

#### Scenario: Dialogue cue projects to Cut with speaker metadata
- **WHEN** a storyboard shot includes a structured dialogue cue with speaker entity and text
- **THEN** Cut projection preserves the cue text, timing, speaker identity, and voice binding metadata where supported

#### Scenario: Legacy dialogue string still works
- **WHEN** a storyboard shot only includes the existing `dialogue` string field
- **THEN** existing rendering and Cut metadata cue behavior continues to work without requiring structured cue data

### Requirement: Storyboard generation context uses character memory
The system SHALL allow Agent or host runtime to assemble character generation context from storyboard character participation, creative entity refs, active memory snapshots, and resolved representations before executing image, video, or TTS generation.

#### Scenario: Shot generation uses active snapshot
- **WHEN** a storyboard shot is generated for animation and character memory is available
- **THEN** generation receives active character state and continuity constraints for the shot range rather than relying only on the short storyboard text
