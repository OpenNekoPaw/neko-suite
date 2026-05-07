# character-authoring-contracts Specification

## Purpose
TBD - created by archiving change implement-3d-editor-1b-authoring-webview-control-plane. Update Purpose after archive.
## Requirements
### Requirement: LayeredCharacterDescription is the character authoring truth
The system SHALL represent editable characters with `LayeredCharacterDescription`. The description MUST include descriptor metadata, topology version, base mesh and skeleton handles, definition controls, behavior drivers, geometry data references, material slots, and optional override data.

#### Scenario: Character description loads as authoring truth
- **WHEN** Engine loads a `.nkc` character asset
- **THEN** Engine treats the `LayeredCharacterDescription` as the authoring source and instantiates ECS components from it

#### Scenario: ECS does not own character authoring data
- **WHEN** a character instance is present in the scene
- **THEN** ECS stores runtime component state and character instance references, not the canonical morph library, override map, or skin weight atlas

### Requirement: Character files use a split `.nkc` and `.nkcdata` model
The system SHALL store lightweight character metadata, schema, references, and overrides in `.nkc`. Large morph delta, skin weight, blend shape, and auxiliary geometry data MUST be stored in `.nkcdata` or AssetDatabase-managed data blocks referenced by stable relative URIs or asset handles.

#### Scenario: Character file is diff-friendly
- **WHEN** a user changes a morph weight override or material parameter
- **THEN** the `.nkc` file records a small structured change without rewriting the large `.nkcdata` block

#### Scenario: Absolute paths are rejected
- **WHEN** a `.nkc` file references a mesh, skeleton, or data block with an absolute filesystem path
- **THEN** the loader rejects the reference or rewrites it through the project path resolver before saving

### Requirement: Library Override merges templates with user edits
The system SHALL support character overrides that reference a base template and store user edits as typed override entries. The override resolver MUST merge base template data and user overrides deterministically and MUST report conflicts when the base template version invalidates an override path.

#### Scenario: Template character is customized
- **WHEN** a user creates a character from a neko-market template and edits `$.geometry.morphLibrary.eyeSize`
- **THEN** the saved `.nkc` contains an override entry for that path and keeps the base template reference intact

#### Scenario: Template update conflicts with override
- **WHEN** a base template update removes or changes the type of an overridden path
- **THEN** the resolver reports a conflict and keeps the user override from being silently applied to an incompatible field

### Requirement: CharacterCommand extends reliable scene command envelopes
The system SHALL express morph, material layer, expression, IK, skeleton, and override edits as `CharacterCommand` values inside `SceneCommandEnvelope`. Character commands MUST include `seq`, `baseRevision`, character identity, command type, and enough payload to apply or reject the edit deterministically.

#### Scenario: Morph command updates authoring data
- **WHEN** Webview sends `CharacterCommand(type='morph:set')` with a current `baseRevision`
- **THEN** Engine updates the character authoring description, projects the result to ECS, and returns an ack with the applied revision

#### Scenario: Stale character command is rejected
- **WHEN** Webview sends a character command against a stale revision that conflicts with newer character edits
- **THEN** Engine rejects the command with a reason and Webview requests resync before retrying

### Requirement: Character schema is versioned and migratable
The system SHALL version `.nkc` schemas, `.nkcdata` layouts, and character asset descriptors. Loader and saver code MUST use explicit migration manifests when opening older character assets.

#### Scenario: Older character schema migrates
- **WHEN** Engine opens a `.nkc` file with an older supported schema version
- **THEN** Engine applies the registered migration and records the resulting version before allowing edits

#### Scenario: Unsupported future schema is blocked
- **WHEN** Engine opens a `.nkc` file with a newer unsupported schema version
- **THEN** Engine refuses destructive edits and reports that the character asset requires a newer runtime

