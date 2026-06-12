# creative-entity-asset-composition Specification

## Purpose
TBD - created by archiving change implement-creative-entity-asset-composition. Update Purpose after archive.
## Requirements
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

### Requirement: Creative Entity Search Does Not Require Visual Identity
The system SHALL expose confirmed creative entities, script-derived entity candidates, and missing representation requirements to project search even when they do not have a visual identity draft, generated asset, confirmed asset binding, or resolved representation.

#### Scenario: Script character is searchable before portrait exists
- **WHEN** Story identifies a candidate character from a script and no portrait or visual identity exists for that name
- **THEN** project search can return the candidate as an entity-candidate or script-role result

#### Scenario: Confirmed entity without asset is searchable
- **WHEN** a creative entity exists as a confirmed project fact but has no bound asset
- **THEN** project search can return that entity by canonical name or alias

#### Scenario: Missing representation requirement is searchable
- **WHEN** the project records that an entity is missing a portrait, reference image, Live2D model, or other representation
- **THEN** project search can surface the entity and requirement without creating a fake asset record

#### Scenario: Visual identity remains optional layer
- **WHEN** search returns an entity that has no visual identity
- **THEN** the result indicates the entity identity and missing representation state without treating visual facts as required identity fields

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

### Requirement: Entity Runtime Is Owned By neko-entity
The system SHALL provide `packages/neko-entity` as the neutral runtime owner for creative entity facts, lifecycle operations, bindings, requirements, visual drafts, representation resolution wiring, and entity change events. The package MUST consume shared entity contracts from `@neko/shared` and MUST NOT depend on Story, Assets, Agent, Dashboard, Search, React, or Webview implementation modules.

#### Scenario: Shared contracts remain in shared
- **WHEN** a consumer validates or exchanges `CreativeEntity`, entity refs, bindings, requirements, visual drafts, or representation request data
- **THEN** it uses `@neko/shared` contract types and guards rather than DTO definitions owned by `neko-entity`

#### Scenario: Story no longer owns confirmed entity runtime
- **WHEN** a confirmed creative entity is listed, resolved by name, renamed, deprecated, or bound to a representation
- **THEN** the operation is routed through `neko-entity` runtime services rather than Story-only management services

#### Scenario: Search consumes entity projection
- **WHEN** project search indexes creative entities
- **THEN** it consumes projections from `neko-entity` or registered entity providers and does not mutate entity facts

### Requirement: Character Registry Compatibility Is Preserved
The system SHALL preserve existing project-root `characters.json` as the compatibility source for character identities until an explicit migration is implemented. `neko-entity` MUST adapt records from `characters.json` into `CreativeEntity(kind='character')` and MUST keep current character workflows functional.

#### Scenario: Existing character remains visible
- **WHEN** a project contains a valid `characters.json`
- **THEN** `neko-entity` lists each character record as a creative entity with stable id, character kind, canonical name, aliases, status, and metadata projection

#### Scenario: Character update writes compatibility source
- **WHEN** the user renames, aliases, confirms, deprecates, or updates metadata for a character through the entity service
- **THEN** the persisted character fact remains compatible with `characters.json` unless the user has explicitly migrated that project to a new character store

#### Scenario: Missing character registry is created lazily
- **WHEN** the user confirms the first character candidate in a project without `characters.json`
- **THEN** the service creates a valid `characters.json` compatibility file rather than requiring manual setup

### Requirement: Non-Character Entities Use Git-Trackable Project Entity Facts
The system SHALL persist first-class non-character entities such as scenes, locations, objects, and styles as Git-trackable project facts outside `.neko/.cache`. The entity store MUST be reviewable, rebuild-independent, and selected by explicit project root/context resolution.

#### Scenario: Location entity is confirmed
- **WHEN** the user confirms a script-derived location candidate as a project entity
- **THEN** the service persists a `CreativeEntity(kind='location')` in the project entity store outside `.neko/.cache`

#### Scenario: Cache deletion preserves entities
- **WHEN** `.neko/.cache/` is deleted
- **THEN** confirmed non-character entities remain available from Git-trackable entity fact files

#### Scenario: Multi-root operation targets owning project
- **WHEN** an entity operation includes a context URI or explicit project root
- **THEN** the service writes the entity fact to the owning project rather than falling back silently to another workspace

### Requirement: Candidate Lifecycle Is Explicit
The system SHALL manage source-derived entity candidates separately from confirmed creative entity facts. Candidate confirmation, rejection, merge, or dismissal MUST be explicit user or source-approved actions, and candidates MUST preserve provenance and source refs until resolved.

#### Scenario: Script role remains candidate
- **WHEN** Story discovers a new script role name that does not match a confirmed entity
- **THEN** the entity service exposes it as a candidate and does not write a confirmed entity fact automatically

#### Scenario: User confirms candidate
- **WHEN** the user confirms a candidate as a creative entity
- **THEN** the service creates or updates a confirmed entity fact, records the candidate provenance, and emits an entity change event

#### Scenario: Candidate merged into existing entity
- **WHEN** the user resolves a candidate as an alias or occurrence of an existing entity
- **THEN** the service updates the existing entity or alias/provenance state rather than creating a duplicate confirmed entity

#### Scenario: Candidate rejection does not remove source text
- **WHEN** the user rejects or dismisses a source-derived candidate
- **THEN** the service records the decision without deleting or rewriting the source script, document, canvas, or asset data

### Requirement: Entity Lifecycle Operations Are Source-Aware
The system SHALL expose entity lifecycle operations for create, confirm, rename, alias updates, metadata updates, deprecate, reactivate, merge, binding updates, requirement updates, and visual draft updates. Operation results MUST include affected entity refs, changed project fact refs, and refresh metadata for Dashboard and Search.

#### Scenario: Entity rename is explicit
- **WHEN** the user renames an entity
- **THEN** the entity fact is updated and downstream consumers receive change metadata without automatically rewriting script text or asset metadata

#### Scenario: Entity merge preserves references
- **WHEN** the user merges duplicate entities
- **THEN** the service selects a surviving entity id, records aliases/provenance where possible, updates entity-owned bindings/requirements/drafts, and reports changed refs

#### Scenario: Deprecated entity remains resolvable
- **WHEN** an entity is deprecated
- **THEN** the service can still resolve it by id for existing bindings or historical refs while excluding it from default active queries unless requested

### Requirement: Entity Package Exposes Provider Integration Points
The system SHALL expose provider integration points so Story, Canvas, Assets, Agent, importers, and document services can contribute candidates, occurrences, relationships, sync suggestions, or representation hints without owning confirmed entity facts.

#### Scenario: Story contributes occurrences
- **WHEN** Story indexes script references for a character, scene, location, or object
- **THEN** it contributes occurrence projections to the entity service without moving Story parsing into `neko-entity`

#### Scenario: Assets contributes representation hints
- **WHEN** Assets identifies an asset that may represent an entity
- **THEN** it contributes a binding candidate or sync suggestion without becoming the authority for entity identity

#### Scenario: Provider unavailable is non-fatal
- **WHEN** a provider such as Story or Assets is unavailable
- **THEN** confirmed entity facts remain listable and manageable, while provider-specific candidates or occurrences are marked unavailable or stale

### Requirement: Entity Package Boundaries Are Enforced
The system SHALL include boundary tests or dependency checks that keep `neko-entity` independent from feature implementation packages and keep Webviews from directly reading or writing entity fact files.

#### Scenario: Core entity package avoids feature imports
- **WHEN** dependency boundary tests scan `packages/neko-entity`
- **THEN** core modules do not import `neko-story`, `neko-assets`, `neko-agent`, `neko-dashboard`, `neko-search`, React, Webview modules, or concrete VSCode-only implementation modules

#### Scenario: Entity host code is isolated
- **WHEN** VSCode-specific entity code is required
- **THEN** it lives under an explicit host integration entrypoint and does not leak VSCode APIs into core runtime modules

#### Scenario: Webview cannot mutate entity files directly
- **WHEN** dependency boundary tests scan Dashboard, Agent, or other Webview packages
- **THEN** Webview code does not import filesystem APIs, entity file stores, or `neko-entity` host internals for direct mutation

### Requirement: Entity projections support NPC profile assembly
The system SHALL provide a deterministic NPC profile projection over project creative entity facts. The projection MUST consume existing entity identity, metadata, bindings, visual drafts, relationships, occurrences, and provider evidence through shared contracts or injected ports, and MUST NOT depend on Agent runtime, SubAgent implementation, LLMs, Dashboard, Story, Assets, React, or Webview modules.

#### Scenario: Character entity assembles NPC source
- **WHEN** a confirmed character entity has aliases, role metadata, visual facts, default voice or portrait bindings, relationships, and occurrences
- **THEN** the NPC profile assembler returns an `NpcProfileSource` containing those facts with provenance and authority metadata

#### Scenario: Entity projection avoids Agent dependency
- **WHEN** dependency boundary tests scan `@neko/entity/projections`
- **THEN** NPC profile assembly code does not import `@neko/agent`, SubAgent modules, LLM services, Dashboard Webview modules, Story implementation modules, or Assets implementation modules

### Requirement: NPC profile facts preserve source and authority
The system SHALL represent NPC profile inputs as facts with explicit source and authority. Confirmed project facts MAY be used as authoritative prompt content; suggested facts MAY be included only when labelled as uncertain and MUST NOT be written back to entity metadata without user confirmation.

#### Scenario: Confirmed entity metadata is authoritative
- **WHEN** character metadata contains confirmed role, age range, or notes
- **THEN** the assembled NPC profile facts mark those values as confirmed and identify the registry or entity metadata source

#### Scenario: AI inferred fact is suggested
- **WHEN** enrichment infers a speech pattern from script dialogue
- **THEN** the assembled NPC profile marks that speech pattern as suggested with source `agent-inferred` or `script-extraction`

#### Scenario: Suggested fact does not mutate entity
- **WHEN** the NPC profile includes a suggested backstory, relationship, or speech pattern
- **THEN** the entity fact store remains unchanged until the user applies a suggestion through an entity update action

### Requirement: NPC write-back uses entity lifecycle operations
The system SHALL route confirmed NPC evaluation suggestions through entity lifecycle operations or provider-approved relationship update commands. NPC evaluation MUST NOT directly write `characters.json`, entity fact files, binding files, or asset metadata.

#### Scenario: Metadata suggestion applies through service
- **WHEN** the user applies a suggested speech pattern or motivation
- **THEN** the system calls an entity metadata update operation and emits normal entity change metadata

#### Scenario: Relationship suggestion applies through owner
- **WHEN** the user applies a suggested relationship between two entities
- **THEN** the owning entity or relationship provider validates and writes the relationship rather than the NPC evaluator writing graph files directly

#### Scenario: Asset requirement is not used for personality
- **WHEN** evaluation suggests backstory, speech pattern, motivation, knowledge boundary, or relationship facts
- **THEN** the suggestion is represented as an NPC/entity fact suggestion and not as an `EntityAssetRequirement`

### Requirement: Native Puppet Entity Binding
The creative entity system SHALL support native 2D puppet bindings through a `puppet-bone` representation role or equivalent native puppet role metadata.

#### Scenario: Character binds native puppet
- **WHEN** a character entity is associated with a native `.nkp` puppet
- **THEN** `.nkentity` v2 stores a binding that identifies the puppet as the native bone/BlendShape representation rather than a legacy Live2D representation

#### Scenario: Legacy Live2D binding can coexist
- **WHEN** a converted character keeps its original Live2D asset as fallback
- **THEN** `.nkentity` can contain both the native puppet binding and an optional legacy `live2d` binding without ambiguity over the default representation

### Requirement: Native Puppet Entity Metadata
The creative entity contract SHALL expose native puppet capability metadata such as rig template, BlendShape standard, implemented BlendShapes, and source generation status.

#### Scenario: Entity metadata advertises rig capability
- **WHEN** a native puppet entity is exported or indexed
- **THEN** metadata includes enough rig and BlendShape capability data for Agent, Live, and editor consumers to discover supported operations

#### Scenario: Missing capability is explicit
- **WHEN** a native puppet lacks a standard BlendShape or a full-body rig
- **THEN** metadata or capability query results indicate the missing capability rather than requiring consumers to assume a full ARKit or humanoid set

### Requirement: Native Puppet Representation Resolution
Representation resolution SHALL prefer native puppet bindings for puppet/game/video/native animation targets when present.

#### Scenario: Native puppet preferred for animation
- **WHEN** a consumer requests a character representation for native puppet animation and the entity has a `puppet-bone` binding
- **THEN** the resolver returns the native puppet binding before falling back to legacy Live2D or portrait representations

#### Scenario: Live target can choose fallback
- **WHEN** a Live workflow requires a legacy Live2D representation and no native tracking bridge is available
- **THEN** resolution can return an optional legacy Live2D binding according to target fallback policy

### Requirement: Entity asset bindings track availability separately from review status
The system SHALL add an `availability` field to `EntityAssetBinding` with values `active`, `orphaned`, and `archived`. The field MUST be orthogonal to the binding `status`, and missing `availability` in existing binding data MUST default to `active`.

#### Scenario: Confirmed binding becomes orphaned
- **WHEN** a confirmed binding's project-local asset disappears
- **THEN** the binding keeps `status='confirmed'` and changes `availability` to `orphaned`

#### Scenario: Suggested binding becomes orphaned
- **WHEN** a suggested binding's project-local asset disappears
- **THEN** the binding keeps `status='suggested'` and changes `availability` to `orphaned`

#### Scenario: Old binding data loaded
- **WHEN** a stored binding record has no `availability` field
- **THEN** validators and runtime projections treat the binding as `availability='active'`

### Requirement: Project-local asset deletion marks bindings orphaned
The system SHALL detect project-local asset deletion for bindings that resolve to workspace files and mark affected bindings as orphaned through the entity runtime. Orphan marking MUST preserve entity facts, binding ids, binding status, role, source, and asset ref.

#### Scenario: Bound project asset deleted
- **WHEN** a `project://` asset file bound to an entity is deleted from the workspace
- **THEN** the entity runtime updates matching bindings to `availability='orphaned'`, records `orphanedAt`, and emits an entity change event

#### Scenario: Deleted unbound file ignored
- **WHEN** a project file is deleted and no binding resolves to that asset
- **THEN** the entity runtime does not create or mutate any entity binding

#### Scenario: Bulk delete emits coalesced changes
- **WHEN** multiple bound project assets are deleted in one file operation burst
- **THEN** the runtime may batch updates but MUST report all affected entity refs in emitted change metadata

### Requirement: Project-local asset restoration reactivates orphaned bindings
The system SHALL detect restoration of project-local assets and reactivate matching orphaned bindings without changing their review status.

#### Scenario: Orphaned confirmed binding restored
- **WHEN** the missing file for an orphaned confirmed binding reappears at the same resolved project asset location
- **THEN** the binding changes to `availability='active'`, clears `orphanedAt`, and keeps `status='confirmed'`

#### Scenario: Active binding unchanged
- **WHEN** a project asset appears and matching bindings are already active
- **THEN** the runtime does not rewrite those bindings solely because of the file create event

#### Scenario: Restored file emits refresh metadata
- **WHEN** an orphaned binding is restored
- **THEN** entity change events include affected entity refs so Dashboard, Canvas, Inspector, and search can refresh

### Requirement: Orphaned bindings degrade UI without deleting entity references
Consumers SHALL render orphaned bindings as broken or unavailable representation resources while preserving entity refs, candidate refs, textual appearance notes, and workflow actions.

#### Scenario: Canvas shot row shows broken representation
- **WHEN** a shot character references an entity whose default portrait binding is orphaned
- **THEN** Canvas shows a placeholder or broken-reference marker while retaining the shot character entity ref

#### Scenario: Hover Card keeps text context
- **WHEN** Hover Card loads entity detail with orphaned bindings
- **THEN** it displays the entity identity and appearance text while marking affected thumbnails or assets unavailable

#### Scenario: Dashboard groups orphaned bindings
- **WHEN** Dashboard displays entity detail or orphan management
- **THEN** orphaned bindings are distinguishable from active bindings and can be filtered or grouped by entity and binding status

### Requirement: Dashboard can manage orphaned bindings explicitly
Dashboard SHALL provide explicit actions for orphaned bindings, including rebind, open or locate source when available, archive binding, and cleanup suggested orphaned bindings. These actions MUST be delegated to the owning entity source or facade commands.

#### Scenario: Rebind orphaned binding
- **WHEN** the user chooses to rebind an orphaned binding to an existing asset
- **THEN** Dashboard delegates to the entity binding command and preserves the entity identity while updating the binding asset ref and availability

#### Scenario: Cleanup suggested orphan
- **WHEN** the user removes an orphaned suggested binding
- **THEN** Dashboard delegates the action and does not delete the creative entity unless the user invokes a separate entity lifecycle action

#### Scenario: Confirmed orphan prioritized
- **WHEN** Dashboard lists orphaned bindings
- **THEN** confirmed orphaned bindings are shown with higher recovery priority than suggested orphaned bindings

### Requirement: Non-local asset availability depends on Asset Federation
The system SHALL treat real-time orphan detection for `market://`, `shared://`, and `external://` refs as dependent on Asset Federation resolver refresh or availability probe contracts. Until those contracts are available, consumers MUST NOT claim reliable real-time orphan marking for non-project-local refs.

#### Scenario: Market ref unavailable before federation refresh
- **WHEN** a `market://` bound asset cannot be resolved during an on-demand probe before federation refresh events exist
- **THEN** the consumer may show an unavailable warning for that view but does not require a persistent orphan mark to have been written

#### Scenario: Federation reports unavailable asset
- **WHEN** a future Asset Federation resolver refresh reports a bound non-local asset unavailable with stable identity
- **THEN** the entity runtime may update matching bindings to `availability='orphaned'` through the same binding lifecycle path

#### Scenario: Non-local dependency documented
- **WHEN** project-local orphan lifecycle is implemented
- **THEN** tests and user-facing behavior distinguish guaranteed project-local FileWatcher behavior from federation-dependent non-local behavior

### Requirement: Creative entity candidates record identity basis
The system SHALL add `identityBasis` to `CreativeEntityCandidate` with values `user-named`, `placeholder`, `visual`, and `asset`. Missing `identityBasis` in existing candidate data MUST default to `user-named`.

#### Scenario: User-named candidate
- **WHEN** a candidate is created from a script role, user-entered character name, or explicit Agent named entity
- **THEN** the candidate records `identityBasis='user-named'`

#### Scenario: Visual-only candidate
- **WHEN** a candidate is created from an unnamed face, drawing, pose, or visual occurrence
- **THEN** the candidate records `identityBasis='visual'` and remains addressable by candidate id and provenance

#### Scenario: Old candidate loaded
- **WHEN** a stored candidate record has no `identityBasis` field
- **THEN** validators and runtime projections treat it as `identityBasis='user-named'`

### Requirement: Name-based matching excludes non-user-named candidates
All name-based candidate resolution paths SHALL exclude candidates whose `identityBasis` is not `user-named`. This applies to resolver APIs, open-candidate matching, Entity Facade commands, Dashboard search-as-match flows, and Agent contribution matching.

#### Scenario: Placeholder candidate excluded from fuzzy name match
- **WHEN** a candidate has `identityBasis='placeholder'`
- **THEN** name-based fuzzy matching does not return that candidate as a match for a storyboard or script character name

#### Scenario: Asset-derived candidate excluded from name match
- **WHEN** a candidate has `identityBasis='asset'` and its display label resembles a file name
- **THEN** name-based matching does not merge a user-named character into that candidate automatically

#### Scenario: Explicit id lookup still works
- **WHEN** a caller provides the candidate id for a visual or placeholder candidate
- **THEN** the entity runtime can resolve and display that candidate without using name-based matching

#### Scenario: User names anonymous candidate
- **WHEN** the user assigns a real name to a placeholder, visual, or asset-derived candidate
- **THEN** the runtime updates `identityBasis` to `user-named` after duplicate checks and the candidate can participate in name-based matching

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

