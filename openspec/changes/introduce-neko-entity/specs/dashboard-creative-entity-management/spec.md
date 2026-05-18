## ADDED Requirements

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
