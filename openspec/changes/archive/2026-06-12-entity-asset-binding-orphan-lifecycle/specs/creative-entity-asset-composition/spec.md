## ADDED Requirements

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
