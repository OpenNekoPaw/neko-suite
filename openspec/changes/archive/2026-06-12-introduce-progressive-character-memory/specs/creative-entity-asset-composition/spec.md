## ADDED Requirements

### Requirement: Progressive memory reuses creative entity identity
The system SHALL use `CreativeEntityRef` and `CreativeEntityCandidate` as the identity layer for progressive character memory. Progressive memory records MUST NOT introduce a second canonical character id space or persist confirmed character identity outside the creative entity compatibility model.

#### Scenario: Observation references confirmed entity
- **WHEN** a character observation is confidently matched to an existing character entity
- **THEN** the observation stores a `CreativeEntityRef` for that entity rather than copying or inventing a separate canonical id

#### Scenario: Observation references candidate entity
- **WHEN** an extracted character cannot be safely matched to a confirmed entity
- **THEN** the observation links to or creates a `CreativeEntityCandidate` and remains unconfirmed until an approved lifecycle action resolves it

### Requirement: Progressive memory uses representation resolution for assets
The system SHALL use entity representation resolution and entity-asset bindings to obtain portrait, reference, voice, motion, video, or other character assets for generation contexts. Memory records MAY cite representation needs or suggestions, but MUST NOT become the owner of confirmed entity-asset bindings.

#### Scenario: Generation context resolves portrait
- **WHEN** a character state snapshot is assembled for Canvas or Agent generation
- **THEN** the system requests portrait or reference representations through `RepresentationResolver` rather than reading asset metadata directly from memory records

#### Scenario: Missing voice creates requirement
- **WHEN** a voice cue references a character entity without a usable voice representation
- **THEN** the system can record an `EntityAssetRequirement` for `voice` and keeps the voice cue available as unresolved rather than fabricating a binding

### Requirement: Accepted memory does not automatically rewrite asset metadata
The system SHALL keep accepted character observations and state snapshots separate from asset metadata. Applying a memory-derived trait to an asset label, tag, description, package, or binding MUST require an explicit sync suggestion or source-approved operation.

#### Scenario: Accepted outfit trait does not rename asset
- **WHEN** a user accepts an observation that a character wears a school uniform in a scene
- **THEN** bound portrait or reference asset metadata remains unchanged unless the user explicitly applies an asset sync action
