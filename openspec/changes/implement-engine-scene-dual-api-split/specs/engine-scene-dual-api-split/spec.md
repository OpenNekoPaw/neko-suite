## ADDED Requirements

### Requirement: Creative And Data Access Separation
The scene and puppet runtimes SHALL expose separate creative and data access contracts for user-intent operations and data-oriented pipeline operations.

#### Scenario: Controller uses creative access
- **WHEN** a host-api controller applies a user scene edit
- **THEN** it uses creative access operations with revision semantics
- **AND** it does not import the DataAccess trait

#### Scenario: Render extraction uses data access
- **WHEN** the render pipeline extracts render state
- **THEN** it uses a typed data access method rather than a public raw world mutation method

### Requirement: SceneComputation Facade
The engine SHALL move live scene world ownership into `SceneComputation` while preserving existing `SceneService` public behavior.

#### Scenario: Existing scene controller call
- **WHEN** an existing scene controller method calls `SceneService`
- **THEN** the method signature remains compatible
- **AND** implementation delegates to `SceneComputation`

### Requirement: Snapshot Scene Rendering
The engine SHALL render scene frames from `RenderWorld` snapshots rather than from the live ECS world.

#### Scenario: Renderer receives snapshot
- **WHEN** `SceneComputation` extracts a `RenderWorld`
- **THEN** `SceneRenderer` renders from the snapshot without holding the live world mutex

#### Scenario: Renderer import guard
- **WHEN** CI checks the renderer module
- **THEN** imports of live `World` or `DataAccess` fail the guard

### Requirement: Escape Hatch Removal
The engine SHALL replace public `ecs_world_mut()` escape points with typed DataAccess methods.

#### Scenario: Escape points migrated
- **WHEN** the scene split migration is complete
- **THEN** known service escape points use typed methods for render extraction, serialization, procedural spawn, command batch, modeling delta, and revision reads

#### Scenario: Raw access remains internal only
- **WHEN** crate-local raw world access is temporarily needed
- **THEN** it is marked deprecated and not exported to controllers or renderers
