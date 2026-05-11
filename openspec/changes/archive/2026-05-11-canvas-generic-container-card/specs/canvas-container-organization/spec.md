## ADDED Requirements

### Requirement: Container actions are declared and dispatched through typed descriptors
The system SHALL declare container-specific UI actions through typed `ContainerActionDescriptor` metadata and dispatch them through a typed `ContainerActionContext`. Container rendering MUST NOT hardcode Scene, Gallery, or Table action button branches in the generic content dispatcher.

#### Scenario: Scene action bar uses descriptors
- **WHEN** a Scene container renders assign-selected, auto-layout, or batch-generate controls
- **THEN** those controls are derived from `ContainerActionDescriptor` metadata and invoke the matching typed dispatcher action

#### Scenario: Gallery batch generate reuses dispatcher
- **WHEN** a Gallery container renders a generate-all control
- **THEN** it uses the same `batch-generate` descriptor and dispatcher path as other compatible containers

#### Scenario: Table actions update table data through declared IDs
- **WHEN** a Table container renders add-row, add-column, remove-row, or remove-column controls
- **THEN** each control maps to a typed `ContainerActionId` and updates table data through the container action dispatcher

#### Scenario: Batch generate sends existing agent payload
- **WHEN** a container `batch-generate` action is invoked
- **THEN** the dispatcher sends `{ type: 'sendToAgent', nodeIds: child node ids, action: 'batch' }` through the existing Webview postMessage path

### Requirement: Card and container actions share enum condition evaluation
The system SHALL evaluate card and container action availability with the enum `ActionCondition` values `always`, `has-selection`, `has-preview`, `not-generating`, and `has-asset`. Action descriptors MUST NOT embed function predicates or untyped callbacks.

#### Scenario: Container not-generating checks child nodes
- **WHEN** a container action has `enabledWhen: 'not-generating'`
- **THEN** the evaluator checks the container child nodes and disables the action while any child is generating

#### Scenario: Card has-preview checks resolved preview source
- **WHEN** a card action has `enabledWhen: 'has-preview'`
- **THEN** the evaluator uses the card policy's resolved `CardPreviewSource` before falling back to legacy node preview metadata

#### Scenario: Descriptor remains serializable
- **WHEN** container or card action metadata is created by a preset or policy
- **THEN** the descriptor contains only typed IDs, labels, visibility fields, enum conditions, and serializable metadata
