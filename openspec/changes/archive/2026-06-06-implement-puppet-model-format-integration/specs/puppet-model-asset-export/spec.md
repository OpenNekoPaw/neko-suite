## ADDED Requirements

### Requirement: Single Asset Export
The system SHALL support exporting puppet/model asset dimensions as independent shareable assets.

#### Scenario: Export puppet model package
- **WHEN** a user exports a puppet model dimension
- **THEN** the system writes a package containing `.moc3` and texture assets or a bundle-backed equivalent without mutating the original imported ZIP

#### Scenario: Export puppet motion package
- **WHEN** a user exports puppet motions
- **THEN** the system writes motion presets or motion JSON-derived assets independent of the original model bundle

#### Scenario: Export model animation package
- **WHEN** a user exports model animations from a 3D asset
- **THEN** the system writes a model-motion asset package that can be registered independently from the model file

### Requirement: Entity Export
The system SHALL support exporting a creative entity with bindings to model, motion, config, and voice assets.

#### Scenario: Export character entity
- **WHEN** a character has bound puppet/model assets
- **THEN** entity export writes a JSON entity artifact containing entity metadata and relative references to bound asset packages

### Requirement: Character Pack Export
The system SHALL package a character entity and its bound asset dimensions as a bundle suitable for local sharing or Market upload.

#### Scenario: Export character pack
- **WHEN** a user exports a complete character pack
- **THEN** the system creates a bundle manifest with package references or embedded subpackages for model, motion, config, and optional voice assets

#### Scenario: Character pack import routes through Market bundle orchestration
- **WHEN** a character pack ZIP is imported
- **THEN** the system routes it through bundle install orchestration rather than raw media import
