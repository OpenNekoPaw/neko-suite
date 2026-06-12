# entity-binding-widget-facade Specification

## Purpose
TBD - created by archiving change entity-binding-widget-facade. Update Purpose after archive.
## Requirements
### Requirement: Entity facade commands expose lifecycle and binding operations
The system SHALL expose typed `neko.entity.*` facade commands for reading entity detail, resolving names, listing candidates, proposing candidates, confirming candidates, updating aliases, renaming entities, updating metadata, binding assets, setting default bindings, and updating visual drafts. Command requests and results MUST be serializable and MUST NOT expose React, Webview, or raw `vscode` API types in shared DTOs.

#### Scenario: Creative tool confirms candidate through facade
- **WHEN** a creative tool has a candidate id and invokes `neko.entity.confirmCandidate`
- **THEN** the entity service confirms or rejects the request through typed validation
- **THEN** the command result includes affected refs and change metadata

#### Scenario: Invalid facade request is rejected
- **WHEN** a command request is missing project context or has an invalid entity ref
- **THEN** the facade rejects the request with a typed error or diagnostic
- **THEN** no entity fact file is mutated

### Requirement: Entity runtime and events are project scoped
The system SHALL maintain a shared entity runtime and change event source per project root for facade commands and Dashboard source adapters. Entity writes through any facade command MUST emit change events observable by Dashboard, Canvas, Inspector, and other subscribers for the same project.

#### Scenario: Confirm event reaches independent consumer
- **WHEN** a candidate is confirmed through a facade command
- **THEN** a Canvas or Dashboard listener subscribed for the same project receives an entity change event containing the candidate changed ref and resulting entity ref

#### Scenario: Multi-root request targets explicit project
- **WHEN** a facade write request includes a project root or context URI
- **THEN** the runtime registry uses that project context rather than falling back silently to another workspace

### Requirement: EntityBindingWidget is a trigger protocol
The system SHALL define `EntityBindingWidget` as a lightweight host integration protocol that surfaces entity binding, candidate confirmation, asset binding, and Quick Edit trigger actions. The widget or host Webview MUST NOT own entity validation, source-approved policy, file writes, or long-lived entity facts.

#### Scenario: Sketch saves representation with entity binding
- **WHEN** Sketch saves a representation asset and the user selects a target entity and role
- **THEN** Sketch sends the binding request through the facade
- **THEN** the entity service persists the binding and emits a change event

#### Scenario: Webview trigger does not mutate files
- **WHEN** a Webview user clicks a Quick Edit or bind button
- **THEN** the Webview sends a trigger message to its Extension Host
- **THEN** the Extension Host invokes a facade command instead of the Webview writing entity files

### Requirement: Quick Edit is centralized and overlay-independent
The system SHALL implement entity-global Quick Edit through Entity Facade / Extension Host command handlers. Hover Card, Quick Panel, Inspector, TreeView, Dashboard, command palette, and future overlay surfaces MAY trigger the same commands. Overlay components MUST NOT be required to implement Quick Edit and MUST NOT own edit validation or write logic.

#### Scenario: Rename uses shared validation
- **WHEN** any surface triggers entity rename
- **THEN** the facade performs the same duplicate-name validation and source policy checks
- **THEN** all subscribers refresh through entity change events after success

#### Scenario: Overlay is optional trigger surface
- **WHEN** an overlay component exists in a future UI layer
- **THEN** it can render a Quick Edit button that invokes facade commands
- **THEN** removing the overlay does not remove the Quick Edit command capability

### Requirement: Quick Edit separates short fields from complex edits
The system SHALL allow Extension Host native UI to edit short entity-global fields such as canonical name, aliases, default binding, and short appearance summary. Long text, relationship edits, memory edits, merge/split, and batch operations MUST route to Dashboard or another full editing surface.

#### Scenario: Short appearance summary edit
- **WHEN** a user triggers edit appearance summary from a creative surface
- **THEN** Extension Host may use `showInputBox` for a bounded short text field
- **THEN** the facade writes metadata only after validation succeeds

#### Scenario: Complex memory edit routes to Dashboard
- **WHEN** a user attempts to edit multi-field character memory or relationships
- **THEN** the system opens or delegates to Dashboard instead of presenting a partial Quick Edit form

