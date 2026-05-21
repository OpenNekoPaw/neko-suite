## ADDED Requirements

### Requirement: Projected Canvas files separate layout cache from source of truth
The system SHALL support projected Canvas files for entity and memory graph views where external JSON remains the source of truth and the `.nkc` file stores layout, viewport, and cache metadata only. Projected Canvas data MUST be marked with `projected: true`.

#### Scenario: Entity graph opens from external JSON
- **WHEN** the user opens an entity graph projection from the assets surface
- **THEN** Canvas creates or loads a projected `.nkc` cache and derives nodes and connections from the entity JSON source

#### Scenario: Projected cache can be regenerated
- **WHEN** a projected `.nkc` cache file is missing or deleted
- **THEN** Canvas regenerates the projected graph from the external source and restores only default or available cached layout preferences

### Requirement: Projection adapters own source-specific write-back
The system SHALL route projected graph mutations through projection adapters discovered through shared contracts or extension APIs. Canvas MUST NOT directly import `neko-assets` or `neko-agent` implementation modules to modify entity or memory JSON.

#### Scenario: Slot binding writes through adapter
- **WHEN** the user binds an asset to an entity representation slot in a projected Canvas
- **THEN** Canvas sends a write-back operation to the entity projection adapter and does not edit `neko/entity-bindings.json` directly

#### Scenario: Memory edge update writes through adapter
- **WHEN** the user updates a memory association weight in a projected Canvas
- **THEN** Canvas sends a write-back operation to the memory projection adapter and leaves source-specific mutation rules to that adapter

### Requirement: Projection adapter contracts avoid VSCode API leakage
Projection adapter contracts shared through `@neko/shared` SHALL use serializable DTOs and project-owned disposable/callback shapes. Shared projection contracts MUST NOT expose `vscode.Event`, `vscode.Uri`, or other VSCode API types.

#### Scenario: Source change subscription uses disposable callback
- **WHEN** Canvas subscribes to projection source changes
- **THEN** it uses a callback registration that returns a disposable-like object and the Extension Host adapts any VSCode watcher internally

### Requirement: Projected graph write-back failures are recoverable
The system SHALL surface projection write-back errors without crashing the Canvas editor or corrupting the projected cache. Failed write-back operations MUST leave the authoritative external JSON unchanged unless the adapter reports a successful commit.

#### Scenario: Adapter rejects alias update
- **WHEN** a projected entity alias update fails validation in the adapter
- **THEN** Canvas reports the failure, keeps the editor open, and does not persist the rejected mutation as authoritative state

#### Scenario: Source changes during editing
- **WHEN** the external JSON source changes while the projected Canvas is open
- **THEN** Canvas receives a source-changed notification and reprojects or prompts for conflict handling before overwriting source-owned data

### Requirement: Projected graph status is visible
The system SHALL indicate when a Canvas is projected and auto-generated. Projected Canvas status MUST distinguish source-owned data from local layout/cache preferences.

#### Scenario: Projected graph title indicates generated status
- **WHEN** a projected Canvas is open
- **THEN** the editor title or status area indicates that the graph is auto-generated or projected

#### Scenario: Layout edits persist to cache only
- **WHEN** the user moves a projected node without changing source-owned fields
- **THEN** Canvas persists the layout preference in the projected `.nkc` cache and does not write to the external JSON source
