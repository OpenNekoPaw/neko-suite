# dashboard-creative-entity-management Specification

## Purpose
Define the Dashboard Work Mode surface for managing project creative entities as a semantic ledger while keeping entity facts, Story workflows, Assets workflows, and file navigation owned by their source extensions.

## Requirements
### Requirement: Dashboard Exposes Creative Entity Management
The Dashboard SHALL provide a Work Mode Creative Entities surface that lists project creative entities, script-derived candidates, missing material requirements, visual drafts, and default representation bindings as a project-level ledger.

#### Scenario: Confirmed and candidate entities are visible
- **WHEN** Dashboard opens in a workspace that has confirmed entities and script-derived candidates
- **THEN** the Creative Entities surface lists both confirmed entities and candidates with distinguishable status, kind, source, and project identity

#### Scenario: Entity without asset remains manageable
- **WHEN** an entity has no portrait, reference, Live2D, voice, generated asset, or bound material
- **THEN** Dashboard still displays the entity and surfaces missing representation state rather than hiding it behind Assets

#### Scenario: Work Mode includes entity section
- **WHEN** Dashboard enters Work Mode
- **THEN** it offers a Creative Entities section alongside project overview, runtime context, and task monitoring

#### Scenario: Entity UI follows Webview locale
- **WHEN** the Dashboard Webview locale is Chinese or English
- **THEN** the Creative Entities title, filters, table headings, empty states, status labels, detail labels, and action labels render through Dashboard i18n bundles instead of hard-coded English strings

### Requirement: Dashboard Uses Shared Creative Entity Source Contracts
The system SHALL define Dashboard creative-entity DTOs and source contracts in `@neko/shared` without depending on VSCode, React, Story, Assets, Agent, or Dashboard implementations.

#### Scenario: Valid source accepted
- **WHEN** a command returns a creative-entity source with the expected contract version, source id, snapshot method, detail method, action method, and change event subscription
- **THEN** Dashboard accepts the source and may render its snapshot

#### Scenario: Invalid source rejected
- **WHEN** a command returns an invalid creative-entity source or invalid entity DTO
- **THEN** Dashboard rejects that source or drops that DTO without failing the whole panel

#### Scenario: Webview receives projected DTOs only
- **WHEN** Dashboard sends entity data to the Webview
- **THEN** the data conforms to shared Dashboard creative-entity DTOs and does not include source-owned cache JSON shapes

### Requirement: Dashboard Discovers Entity Sources Through Commands
Dashboard SHALL discover creative-entity sources through programmatic commands and MUST NOT directly import `neko-story` or `neko-assets` implementation modules.

#### Scenario: Story source discovered
- **WHEN** `neko.story.getDashboardCreativeEntitySource` is registered and returns a valid source
- **THEN** Dashboard subscribes to the source and includes its entity snapshot

#### Scenario: Story source missing
- **WHEN** the Story extension or source command is unavailable
- **THEN** Dashboard shows the Creative Entities surface as unavailable or empty without breaking project overview or task monitoring

#### Scenario: Duplicate source refresh replaces subscription
- **WHEN** Dashboard refresh discovers a source id that was already subscribed
- **THEN** Dashboard disposes the previous subscription and replaces it with the latest valid source

### Requirement: Entity Detail Shows Identity, Occurrences, Bindings, Drafts, And Requirements
Dashboard SHALL provide an entity detail projection containing identity, aliases, status, source, occurrences, relationships where available, default bindings, all bindings, missing requirements, visual drafts, and sync suggestions.

#### Scenario: Detail loaded for selected entity
- **WHEN** the user selects an entity row
- **THEN** Dashboard requests detail from the owning source and renders the projected identity, occurrences, bindings, requirements, drafts, and suggestions

#### Scenario: Missing requirement is actionable
- **WHEN** detail contains an open missing representation requirement
- **THEN** Dashboard displays actions to generate, import, bind existing, or dismiss through source-owned actions

#### Scenario: Default binding shown by role
- **WHEN** an entity has default portrait, reference, Live2D, voice, or motion bindings
- **THEN** Dashboard displays those bindings grouped by representation role

### Requirement: Entity Actions Are Delegated To Owning Sources
Dashboard SHALL send entity action requests to the source that owns the selected entity or suggestion and MUST validate entity refs, action ids, and payload shape before dispatch.

#### Scenario: Bind existing asset action
- **WHEN** the user chooses to bind an existing asset for an entity role
- **THEN** Dashboard delegates the action to the owning source or source-designated command instead of writing `entity-bindings.json` directly

#### Scenario: Confirm candidate action
- **WHEN** the user confirms a script-derived candidate as a real creative entity
- **THEN** Dashboard delegates the confirmation to the owning source and refreshes the entity snapshot after the action succeeds

#### Scenario: Open source action
- **WHEN** the user chooses to open an entity source from Dashboard
- **THEN** Dashboard delegates `open-source` to the owning source, and the source resolves the registry or script location in Extension Host code before opening the editor

#### Scenario: Invalid action rejected
- **WHEN** Webview sends an unknown action id or an entity ref that does not belong to a known source
- **THEN** Dashboard rejects the action and does not mutate project facts

### Requirement: Asset Sync Suggestions Are Explicit
Dashboard SHALL display entity-to-asset sync suggestions as read-only recommendations until the user explicitly applies or ignores them.

#### Scenario: Entity rename creates suggestion
- **WHEN** an entity canonical name changes and a bound asset label or tag appears stale
- **THEN** Dashboard may show a sync suggestion but does not automatically change the asset metadata

#### Scenario: User applies sync suggestion
- **WHEN** the user applies a sync suggestion
- **THEN** Dashboard delegates the mutation to the owning source or Assets command and records the action result before refreshing

#### Scenario: User ignores sync suggestion
- **WHEN** the user ignores a sync suggestion
- **THEN** Dashboard records or delegates the ignore state without modifying asset files or entity facts beyond the suggestion status

### Requirement: Entity Webview State Avoids Unsafe Local Paths
Dashboard creative-entity Webview state SHALL NOT contain absolute local file paths, `file://` URIs, or `.neko/.cache` paths as authoritative refs. Local navigation refs MUST be workspace-relative or variable-based and resolved by Extension Host code.

#### Scenario: Unsafe occurrence ref rejected
- **WHEN** a source returns an occurrence or asset ref with an absolute local path
- **THEN** Dashboard rejects or sanitizes that ref before it reaches Webview state

#### Scenario: Safe asset refs displayed
- **WHEN** a binding references `project://`, `market://`, `shared://`, or `external://` asset refs
- **THEN** Dashboard may display those refs and delegates resolution/navigation to the owning host code

### Requirement: Entity Table Supports Project Management Workflows
The Creative Entities table SHALL support text search, kind filtering, status filtering, missing-material filtering, binding-state filtering, and deterministic sorting.

#### Scenario: Search by Chinese entity name
- **WHEN** an entity or candidate is named `小橘`
- **THEN** filtering by `小` or `小橘` can reveal the matching row

#### Scenario: Filter missing materials
- **WHEN** the user filters for missing materials
- **THEN** Dashboard shows entities with open missing representation requirements and hides fully satisfied entities

#### Scenario: Sort remains stable
- **WHEN** multiple entities share the same status or kind
- **THEN** Dashboard sorts them deterministically by label, source, and ref without row flicker between refreshes

### Requirement: Entity Source Events Refresh Dashboard State
Dashboard SHALL subscribe to creative-entity source events and refresh affected entity rows or details without polling stable entity state continuously.

#### Scenario: Entity binding changes
- **WHEN** the source emits an event for an entity binding change
- **THEN** Dashboard refreshes the affected row/detail and keeps unrelated task/runtime state intact

#### Scenario: Source reports stale data
- **WHEN** a source snapshot or event reports stale or rebuilding freshness
- **THEN** Dashboard surfaces the freshness state without hiding previously available rows unless the source marks them invalid

#### Scenario: Source event after panel disposed
- **WHEN** Dashboard panel is disposed
- **THEN** Dashboard disposes entity source subscriptions and ignores later source events

### Requirement: Dashboard Can Consume Neutral Entity Source
Dashboard SHALL be able to consume a creative entity source provided by `neko-entity` for confirmed entities, candidate lifecycle actions, bindings, requirements, visual drafts, and sync suggestions. Story MAY continue to contribute Story-specific candidates, occurrences, and navigation, but Dashboard MUST NOT require Story to be the owner of confirmed entity management.

#### Scenario: Neutral entity source discovered
- **WHEN** `neko-entity` registers a valid Dashboard creative entity source command or source registration
- **THEN** Dashboard subscribes to that source and displays confirmed entities, candidates, bindings, requirements, drafts, and suggestions from the neutral entity service

#### Scenario: Story contributes source context
- **WHEN** Story is available and contributes script-derived candidates or occurrences
- **THEN** Dashboard can display those projections through the entity source without directly importing Story implementation modules

#### Scenario: Story unavailable still shows confirmed entities
- **WHEN** Story is unavailable but project entity facts exist
- **THEN** Dashboard still displays confirmed entities from `neko-entity` and marks Story-derived candidates or occurrences unavailable rather than hiding entity management entirely

### Requirement: Dashboard Delegates Entity Lifecycle Actions To Entity Source
Dashboard SHALL delegate create, confirm candidate, rename, alias update, deprecate, merge, bind, requirement, draft, and sync suggestion actions to the owning entity source or source-approved command. Dashboard Webview state MUST NOT directly mutate entity fact files.

#### Scenario: Candidate confirmed through neutral source
- **WHEN** the user confirms a candidate in Dashboard
- **THEN** Dashboard sends the action to the `neko-entity` source or source-approved command and refreshes the affected row/detail after a successful result

#### Scenario: Entity rename does not rewrite assets automatically
- **WHEN** the user renames an entity from Dashboard
- **THEN** the entity source updates the entity fact and may return sync suggestions, but Dashboard does not directly rewrite asset metadata

#### Scenario: Merge action reports changed refs
- **WHEN** the user merges duplicate entities from Dashboard
- **THEN** the entity source returns affected entity refs and refresh metadata so Dashboard can update selected rows and details deterministically

### Requirement: Dashboard Avoids Duplicate Rows Across Story And Entity Sources
Dashboard SHALL avoid duplicate confirmed entity rows when both a neutral entity source and a Story compatibility source are available. Source aggregation MUST prefer the neutral entity source for confirmed entity facts and treat Story rows as provider-specific candidates or occurrence context unless they represent distinct source-owned items.

#### Scenario: Same character from two sources
- **WHEN** both `neko-entity` and Story expose the same confirmed character id
- **THEN** Dashboard displays one confirmed entity row and preserves Story occurrence context in detail rather than showing duplicate confirmed rows

#### Scenario: Story candidate remains distinct
- **WHEN** Story exposes an unresolved script-derived candidate that does not match a confirmed entity
- **THEN** Dashboard displays it as a candidate with Story provenance

#### Scenario: Source replacement is stable
- **WHEN** the neutral source becomes available after Dashboard has loaded a Story compatibility source
- **THEN** Dashboard replaces or merges duplicate confirmed rows without losing the selected entity detail when refs can be mapped
