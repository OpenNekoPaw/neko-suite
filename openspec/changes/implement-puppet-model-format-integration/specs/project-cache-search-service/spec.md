## ADDED Requirements

### Requirement: Asset Dimension Search Projection
The project search service SHALL project puppet/model asset dimensions from AssetLibrary records through the `asset-library` partition.

#### Scenario: Project search returns puppet model asset
- **WHEN** AssetLibrary contains a puppet model dimension record
- **THEN** ProjectSearch can return an `asset` item with media kind `puppet-model` and asset dimension `model`

#### Scenario: Project search returns model motion asset
- **WHEN** AssetLibrary contains a model motion dimension record
- **THEN** ProjectSearch can return an `asset` item with media kind `model-motion` and asset dimension `motion`

### Requirement: Bundle-Memory Metadata Projection
The project search service SHALL preserve bundle-memory metadata in projected search items without treating bundle locators as local file paths.

#### Scenario: Search item contains bundle metadata
- **WHEN** AssetLibrary contains a bundle-memory file record with `bundlePath#entryPath`
- **THEN** ProjectSearch includes the relevant storage mode and locator metadata in item metadata or navigation data

#### Scenario: Search does not read ZIP bytes
- **WHEN** ProjectSearch projects a bundle-memory asset
- **THEN** it does not open ZIP files or parse domain bundle contents during normal query projection

### Requirement: Same Partition Adapter Collision Avoidance
The system SHALL avoid registering multiple independent `ProjectSearchAdapter` instances for the same `asset-library` partition unless the coordinator supports composite same-partition providers.

#### Scenario: AssetLibrary adapter remains owner
- **WHEN** puppet and model dimensions are made searchable
- **THEN** they are projected through the AssetLibrary search adapter or a composite provider rather than replacing each other through duplicate partition registration
