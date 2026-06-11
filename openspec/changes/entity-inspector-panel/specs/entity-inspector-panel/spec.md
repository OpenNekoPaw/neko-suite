## ADDED Requirements

### Requirement: Dashboard registers a persistent Entity Inspector
The system SHALL provide a `neko.entityInspector` WebviewView owned by `neko-dashboard` that displays persistent creative entity detail for the active workspace context.

#### Scenario: Inspector opens with selected entity
- **WHEN** `neko.entity.inspectEntity` is invoked with a valid entity ref
- **THEN** Dashboard focuses the `neko.entityInspector` view and renders detail for that entity

#### Scenario: Inspector shows empty state
- **WHEN** the Inspector is visible and no entity has been selected
- **THEN** it renders an empty state without querying unrelated sources or failing Dashboard

#### Scenario: Dashboard owns rich detail
- **WHEN** the Inspector renders entity detail
- **THEN** it uses Dashboard/entity facade projections and does not require `neko-assets`, Canvas, Agent, Story, Sketch, Model, or Puppet implementation imports

### Requirement: Inspector is read-only and triggers facade actions
The Inspector SHALL display entity identity, candidate state, appearance summary, binding summaries, thumbnails when available, requirements, provenance, and status as read-only data. Entity-global mutations MUST be performed by Entity Facade or Dashboard commands, not by direct Inspector Webview writes.

#### Scenario: Quick edit action invoked from Inspector
- **WHEN** the user clicks an Inspector action such as rename, edit appearance, edit aliases, or set default binding
- **THEN** the Webview sends an action request to its Extension Host and the host invokes the corresponding Entity Facade command

#### Scenario: Complex edit opens Dashboard
- **WHEN** the user chooses an operation that requires multi-field editing, merge, relationship management, or long-form memory edits
- **THEN** the Inspector opens Dashboard deep-linked to the entity rather than embedding the complex editor

#### Scenario: Invalid Webview action rejected
- **WHEN** the Inspector Webview posts an unknown action id or malformed entity ref
- **THEN** the Extension Host rejects the request and does not mutate entity facts

### Requirement: Tools can open Inspector through command protocol
The system SHALL expose `neko.entity.inspectEntity` as the stable cross-extension command for opening or refreshing the Inspector from creative tools and entity browsers.

#### Scenario: Canvas Hover Card opens Inspector
- **WHEN** the user clicks the detail action in a Canvas Hover Card for a confirmed or candidate entity
- **THEN** Canvas Extension Host invokes `neko.entity.inspectEntity` with the entity or candidate ref

#### Scenario: Quick Panel opens Inspector
- **WHEN** the user selects an entity card in the Entity Quick Panel
- **THEN** the Inspector opens or refreshes to that entity without Canvas importing Dashboard implementation modules

#### Scenario: Command unavailable handled gracefully
- **WHEN** a caller invokes Inspector integration but `neko.entity.inspectEntity` is not registered
- **THEN** the caller reports an unavailable action without failing the active creative tool

### Requirement: Inspector refreshes from entity change events
The Inspector SHALL refresh displayed entity detail when the entity runtime emits a change event for the inspected entity, candidate, binding, requirement, or visual draft.

#### Scenario: Confirmed candidate refreshes Inspector
- **WHEN** the inspected candidate is confirmed and an entity change event reports the resulting entity ref
- **THEN** the Inspector updates from candidate state to confirmed entity detail

#### Scenario: Binding update refreshes thumbnails
- **WHEN** an inspected entity receives a binding update event
- **THEN** the Inspector reloads binding summaries and thumbnail state for that entity

#### Scenario: Unrelated event ignored
- **WHEN** an entity change event only affects refs unrelated to the inspected entity
- **THEN** the Inspector keeps its current content without reloading detail

### Requirement: Entity TreeView browses entities through commands
The system SHALL add a `neko.entityBrowser` TreeView to the `neko-asset-manager` ViewContainer. The TreeView MUST obtain entity data through `neko.entity.listEntities` and `neko.entity.getEntity` commands and MUST NOT import entity runtime, Dashboard, Story, Canvas, or Agent implementation modules.

#### Scenario: Entities grouped by kind
- **WHEN** the project contains character, location, object, or style entities
- **THEN** the Entity TreeView lists them grouped by kind with distinguishable confirmed, candidate, deprecated, or missing-representation state

#### Scenario: Tree item opens Inspector
- **WHEN** the user selects an entity item in the TreeView
- **THEN** `neko.entity.inspectEntity` is invoked for that entity ref

#### Scenario: TreeView source unavailable
- **WHEN** entity list commands are unavailable or return invalid data
- **THEN** the TreeView displays an unavailable or empty state without breaking AssetManager

### Requirement: AssetManager can inspect bound creative entities
AssetManager SHALL expose an action to find creative entities bound to or referencing a selected asset, and SHALL open the Inspector for a selected result through command protocol.

#### Scenario: Asset has one bound entity
- **WHEN** the user invokes the bound-entity action for an asset with exactly one entity binding
- **THEN** AssetManager invokes `neko.entity.inspectEntity` for that entity ref

#### Scenario: Asset has multiple bound entities
- **WHEN** the selected asset is bound to multiple entities or roles
- **THEN** AssetManager presents a host-side selection list and opens the Inspector for the chosen entity

#### Scenario: Asset has no bound entities
- **WHEN** the selected asset has no creative entity bindings
- **THEN** AssetManager reports that no bound entity is available and does not create a new entity

### Requirement: Inspector auto-follow is optional
The system SHALL provide an `entityInspector.autoFollow` setting that is disabled by default. When enabled, the Inspector MAY follow explicit entity focus signals from creative tools, and updates MUST be debounced.

#### Scenario: Auto-follow disabled
- **WHEN** `entityInspector.autoFollow` is disabled and the user hovers a Canvas character
- **THEN** the Inspector does not change unless an explicit inspect command is invoked

#### Scenario: Auto-follow enabled
- **WHEN** `entityInspector.autoFollow` is enabled and a creative tool emits an entity focus signal
- **THEN** the Inspector refreshes to the focused entity after debounce

#### Scenario: Rapid focus changes debounced
- **WHEN** multiple entity focus signals arrive within the debounce interval
- **THEN** the Inspector renders only the latest accepted focus target
