## ADDED Requirements

### Requirement: Character observations are durable source evidence
The system SHALL define host-agnostic `CharacterObservation` contracts for character facts extracted from scripts, comics, videos, generated assets, manual edits, and Agent analysis. Each observation MUST include a stable observation id, source segment reference, observed dimensions, provenance, confidence where available, review status, and either an entity ref, candidate ref, or unresolved mention.

#### Scenario: Comic panel produces character observation
- **WHEN** a comic analysis workflow detects a character appearance, action, emotion, or dialogue in a panel
- **THEN** it records a `CharacterObservation` with the panel source reference, extracted dimensions, confidence, and unresolved/entity/candidate identity link

#### Scenario: Observation does not mutate entity facts
- **WHEN** an observation claims that a character has a new outfit or voice trait
- **THEN** the system stores it as evidence or draft state and does not overwrite confirmed entity facts automatically

### Requirement: Character evidence ledger preserves append-only review history
The system SHALL persist character observations in a bounded, project-scoped evidence ledger outside runtime-only cache. The ledger MUST preserve source refs, review status, conflict state, and supersession links without storing raw binary media payloads.

#### Scenario: User accepts an observation
- **WHEN** the user or a source-approved workflow accepts a character observation
- **THEN** the ledger records the accepted status and keeps the original source/provenance available for audit

#### Scenario: Conflicting traits are retained
- **WHEN** two observations disagree about a character trait in the same active story range
- **THEN** the ledger keeps both observations and marks a conflict or review need rather than silently deleting one

### Requirement: Entity matching is suggestive before confirmation
The system SHALL match observations to existing `CreativeEntityRef` values or `CreativeEntityCandidate` records without creating confirmed entities or merging candidates unless an explicit approved action occurs.

#### Scenario: Known character name is matched
- **WHEN** an observation names a character that resolves to an existing creative entity alias
- **THEN** the observation may link to that `CreativeEntityRef` with matcher provenance

#### Scenario: Ambiguous visual match remains candidate
- **WHEN** a visual observation could match multiple characters
- **THEN** the system records candidate links and confidence values without confirming or merging the entity automatically

### Requirement: Character state snapshots provide scoped generation truth
The system SHALL define `CharacterStateSnapshot` as the active, reviewable character state for a bounded story, scene, shot, canvas node, cut range, or asset range. Snapshots MUST reference the evidence or approval source that produced each included trait.

#### Scenario: Generation resolves active character state
- **WHEN** Agent prepares a shot generation request for a scene range
- **THEN** it can load the relevant character state snapshot and include approved appearance, outfit, emotion, relationship, knowledge, and voice constraints

#### Scenario: Snapshot explains its evidence
- **WHEN** a user inspects a state snapshot
- **THEN** the system can show which observations, approvals, or source refs support the included traits

### Requirement: Character change events model long-form evolution
The system SHALL define `CharacterChangeEvent` records for time-scoped changes to appearance, costume, injury, relationship, knowledge boundary, emotional baseline, age, or voice. Change events MUST include source range, affected dimensions, before/after summary, review status, and provenance.

#### Scenario: Outfit changes after a scene
- **WHEN** a story or comic indicates that a character changes clothes after a scene
- **THEN** the system records a change event and generation for later ranges uses the updated state after review or source-approved acceptance

#### Scenario: Earlier ranges remain stable
- **WHEN** a later change event updates a character's state
- **THEN** earlier scene ranges continue resolving the prior state unless an explicit retroactive correction is approved

### Requirement: Generation context uses entity representations and memory state
The system SHALL assemble a `CharacterGenerationContext` before image, video, or TTS generation when character identity is available. The context MUST include entity refs, resolved visual and voice representations where available, active state traits, continuity notes, missing representation diagnostics, and source refs.

#### Scenario: Image generation receives visual identity context
- **WHEN** a shot contains a character with an entity ref and approved visual state
- **THEN** image or video generation receives the resolved reference/portrait assets and active appearance constraints without requiring the Agent to restate the whole character history

#### Scenario: TTS generation receives voice context
- **WHEN** a dialogue cue has a speaker entity with a bound voice representation
- **THEN** TTS generation can use the resolved voice asset or voice profile and records missing voice diagnostics if none is available

### Requirement: Generated outputs feed back as draft observations
The system SHALL allow generated images, videos, audio, and validation results to create draft character observations linked to the generated asset lineage. These draft observations MUST remain reviewable and MUST NOT overwrite accepted character state automatically.

#### Scenario: Generated image reveals drift
- **WHEN** validation detects that a generated image changed a character's hair color or outfit unexpectedly
- **THEN** the system records a draft observation or conflict diagnostic linked to the generated asset and source generation context

#### Scenario: Generated voice becomes candidate representation
- **WHEN** a TTS result is useful as a character voice candidate
- **THEN** the system may create a draft observation or asset requirement/binding suggestion rather than immediately changing the character default voice

### Requirement: Memory records use stable refs and safe serialized data
The system SHALL reject or diagnose memory records that persist Webview URIs, blob URLs, inline base64 payloads, localhost URLs, absolute local paths, private cache paths, functions, or unbounded JSON payloads.

#### Scenario: Unsafe source ref is rejected
- **WHEN** an observation source ref contains an absolute filesystem path or runtime-only URI
- **THEN** validation reports an error and the record is not accepted into persistent memory

#### Scenario: Large media payload is represented by reference
- **WHEN** an extractor needs to cite an image, video, audio, or document segment
- **THEN** it stores a stable resource, asset, tool-result, story, canvas, or generated-asset reference instead of embedding raw bytes
