## ADDED Requirements

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
