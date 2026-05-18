## ADDED Requirements

### Requirement: Entity Changes Do Not Automatically Rewrite Asset Metadata
The system SHALL keep creative entity facts separate from asset metadata and SHALL NOT automatically rewrite asset names, tags, descriptions, file names, paths, or representation package metadata when entity identity fields change.

#### Scenario: Entity canonical name changes
- **WHEN** the user changes an entity canonical name or alias
- **THEN** the system updates the entity fact and may produce sync suggestions without automatically changing asset metadata

#### Scenario: Bound asset remains unchanged until explicit apply
- **WHEN** a bound asset label differs from the updated entity label
- **THEN** the asset label remains unchanged until the user explicitly applies a sync suggestion or edits the asset

#### Scenario: Read-only asset is protected
- **WHEN** a bound asset comes from `market://`, `shared://`, or another read-only source
- **THEN** entity changes do not attempt to rewrite that asset metadata automatically

### Requirement: Entity Asset Sync Is Suggested And Auditable
The system SHALL represent entity-to-asset metadata synchronization as explicit suggestions and SHALL require a user action or source-approved command before mutating asset metadata or entity bindings.

#### Scenario: Sync suggestion generated
- **WHEN** entity facts and linked asset metadata diverge in a way that can be safely suggested
- **THEN** the system can surface a sync suggestion describing the proposed target, fields, reason, and owner source

#### Scenario: Sync suggestion applied
- **WHEN** the user applies a sync suggestion
- **THEN** the owning source or Assets command performs the mutation and returns an action result that can be refreshed in Dashboard

#### Scenario: Sync suggestion ignored
- **WHEN** the user ignores a sync suggestion
- **THEN** the system records or delegates the ignore decision without mutating asset metadata

### Requirement: Assets Remain Representation Resources
The system SHALL treat `neko-assets` as the owner of asset files, asset metadata, thumbnails, variants, media probing, and representation package operations, while unified creative entity identity remains owned by project semantic facts.

#### Scenario: Asset card links to entity
- **WHEN** an asset is linked or bound to a creative entity
- **THEN** Assets may display the linked entity identity but does not become the authority for the entity name, aliases, relationships, or status

#### Scenario: Entity dashboard opens asset workflow
- **WHEN** Dashboard needs the user to choose or edit a representation asset
- **THEN** it delegates to Assets or the owning source rather than directly mutating asset library records from Webview state
