## ADDED Requirements

### Requirement: Creative entities are exposed through a stable facade
The system SHALL define a shared `CreativeEntity` contract with stable `id`, `kind`, canonical name, aliases, status, and metadata fields. Phase 1 MUST expose existing `CharacterRecord` entries through a `CharacterRecordAdapter` as `CreativeEntity(kind='character')` without requiring immediate migration away from `characters.json`.

#### Scenario: Character record is adapted as creative entity
- **WHEN** a character exists in `characters.json`
- **THEN** `CreativeEntityRegistry` returns a `CreativeEntity` with the same stable id, `kind='character'`, canonical name, aliases, status, and metadata projection

#### Scenario: Consumer uses facade instead of character-only type
- **WHEN** a binding, requirement, or representation request references an entity
- **THEN** the public contract uses `CreativeEntity` identity fields rather than direct `CharacterRecord` storage details

### Requirement: Entity-asset bindings are Git-trackable project facts
The system SHALL store confirmed entity-to-asset bindings as current-state project data outside `.neko/.cache/`. Binding records MUST include entity identity, entity kind, representation role, `assetRef`, status, source, optional confidence, default marker, and update timestamp. The system MUST rely on Git for binding version history and MUST NOT implement an internal append-only binding log as the authority.

#### Scenario: Binding file stores current confirmed state
- **WHEN** the user confirms that a character uses a portrait asset
- **THEN** `EntityAssetBindingService` persists a binding in `.neko/entity-bindings.json` or `.neko/entity-bindings/*.json` with status `confirmed` and an `assetRef`

#### Scenario: Binding replacement is a file diff
- **WHEN** the user replaces the default portrait from v1 to v2
- **THEN** the binding file changes the current `assetRef` and does not create an application-level revision event as the authoritative record

#### Scenario: Cache deletion preserves confirmed bindings
- **WHEN** `.neko/.cache/` is deleted and rebuilt
- **THEN** confirmed entity-asset bindings remain available from the Git-trackable binding files

### Requirement: Asset refs resolve through explicit source schemes
The system SHALL define `assetRef` URI schemes for `project://`, `market://`, `shared://`, and `external://` references. `AssetRefResolver` MUST parse, validate, and resolve asset refs into backend-aware `ResolvedAssetRef` values and MUST keep concrete file path resolution delegated to the existing project path resolution layer after the backend asset is known.

#### Scenario: Project asset ref resolves through asset library
- **WHEN** `AssetRefResolver` resolves `project://assets/linxia-portrait-v1`
- **THEN** it routes the reference to the project asset library and returns a resolved asset reference without requiring consumers to parse workspace file paths

#### Scenario: Market asset ref checks installation semantics
- **WHEN** `AssetRefResolver` resolves a `market://` asset ref
- **THEN** it can report whether the package version is installed and leaves upgrade decisions to `neko-market` workflows

#### Scenario: Query parameters are source qualifiers
- **WHEN** an asset ref includes query parameters such as `?variant=portrait-v2` or `?channel=stable`
- **THEN** the resolver treats those parameters as backend qualifiers and not as part of creative entity identity

### Requirement: Asset Federation remains separate from binding ownership
The system SHALL keep entity-asset binding storage independent from Asset Federation handlers. `AssetFederationRegistry` MAY provide handler routing, capabilities, semantics, thumbnails, embeddings, and send-to operations for resolved assets, but it MUST NOT own or write confirmed entity-asset binding files.

#### Scenario: Resolver composes binding and federation data
- **WHEN** `RepresentationResolver` resolves an entity representation
- **THEN** it reads bindings from `EntityAssetBindingService`, resolves asset refs through `AssetRefResolver`, and may query `AssetFederationRegistry` for capabilities or semantics

#### Scenario: Federation handler does not persist bindings
- **WHEN** an Asset Federation handler extracts semantics for an asset
- **THEN** it does not write `.neko/entity-bindings.json` or otherwise become the authority for entity-to-asset binding state

### Requirement: Representations resolve with target-aware fallback
The system SHALL provide `RepresentationResolver` for Story, Canvas, Agent, Live, and Cut targets. Resolution requests MUST support `preferredKind`, optional `fallbackOrder`, and optional `allowFallback`. Resolved results MUST include the actual `resolvedKind` and whether the result used fallback.

#### Scenario: Canvas falls back from Live2D to portrait
- **WHEN** Canvas requests `preferredKind='live2d'` for an entity that has only a portrait and fallback is allowed
- **THEN** `RepresentationResolver` returns `status='resolved'`, `resolvedKind='portrait'`, and `fallback=true`

#### Scenario: Live does not fall back to portrait
- **WHEN** Live requests an avatar representation for an entity that has only a portrait
- **THEN** `RepresentationResolver` returns `status='missing-representation'` and does not return the portrait as a Live avatar

#### Scenario: Explicit no-fallback request fails when preferred kind is absent
- **WHEN** a request sets `preferredKind='live2d'` and `allowFallback=false` for an entity without Live2D
- **THEN** `RepresentationResolver` returns `status='missing-representation'`

### Requirement: Missing representations produce actionable requirements
The system SHALL represent missing entity materials as `EntityAssetRequirement` records instead of blocking creative work or creating fake asset files. Requirements MUST include entity identity, entity kind, source, source reference, required representation kinds, and status.

#### Scenario: New script character has no portrait
- **WHEN** Story identifies a candidate character with no portrait or reference asset
- **THEN** the system records an `EntityAssetRequirement` for portrait or reference material and allows the user to continue writing

#### Scenario: Live request requires avatar asset
- **WHEN** Live attempts to use an entity with no Live2D or Live3D representation
- **THEN** the system surfaces a missing representation requirement with actions to generate, import, bind existing, or dismiss

### Requirement: Visual identity drafts require user confirmation
The system SHALL model AI-generated visual exploration as `VisualIdentityDraft` data linked to a creative entity. Generated assets and extracted visual facts MUST remain draft suggestions until the user confirms a selected asset or accepted facts.

#### Scenario: AI generates multiple character images
- **WHEN** the user generates visual candidates for a character
- **THEN** the system records a visual draft with generated asset ids and does not update confirmed entity visual facts until the user selects or accepts a result

#### Scenario: Visual fact key is extensible
- **WHEN** AI extracts a visual fact with a non-standard key such as `tattoo_style`
- **THEN** the system can store the key as an extensible `VisualFactKey` rather than rejecting it because it is not in the well-known key list

### Requirement: Entity occurrences include text and canvas references
The system SHALL index entity occurrences across Story, Canvas gallery nodes, Canvas shot characters, generated assets, and Canvas text-like content such as notes, comments, and container text. Occurrence indexing MUST NOT rewrite entity facts automatically.

#### Scenario: Canvas text mentions a character
- **WHEN** canvas text content contains a resolvable character name or mention
- **THEN** the occurrence index records the canvas node reference for that entity without changing the entity registry

#### Scenario: Generated asset carries lineage
- **WHEN** Agent or Canvas generation produces an asset with `characterIds` and `sourceNodeId`
- **THEN** graph/index services can connect the generated asset to the creative entity and source canvas node

### Requirement: Market-sourced assets require explicit upgrade choice
The system SHALL treat `market://` assets as market-managed install records and SHALL NOT silently change entity bindings when a newer market package version exists. The user MUST be able to keep the current version, upgrade and update the binding, install the new version without switching defaults, or fork/copy the asset into project storage.

#### Scenario: Market package has a newer version
- **WHEN** a bound `market://` asset has an available update
- **THEN** the system reports the update as an option without changing the binding automatically

#### Scenario: User installs newer market asset side by side
- **WHEN** the user installs a newer version but chooses not to switch the default binding
- **THEN** the existing entity binding continues to reference the original `market://` version
