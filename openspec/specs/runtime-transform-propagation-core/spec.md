# runtime-transform-propagation-core Specification

## Purpose
TBD - created by archiving change implement-2d3d-unified-engine-foundation. Update Purpose after archive.
## Requirements
### Requirement: Shared Transform Propagation Algorithm Core
The engine SHALL define a shared transform propagation algorithm core for hierarchy traversal and local-to-global transform composition.

#### Scenario: Root global transform is computed
- **WHEN** a runtime supplies a root entity with a local transform and no parent
- **THEN** the shared algorithm computes that root global transform from the local transform and the runtime-provided identity

#### Scenario: Child global transform is computed
- **WHEN** a runtime supplies a parent with children and local transforms
- **THEN** the shared algorithm computes each child global transform as `parent_global * child_local`
- **THEN** propagation recurses through descendants in hierarchy order

### Requirement: Runtime Systems Keep Component Ownership
The shared transform propagation core SHALL NOT own runtime-specific Bevy queries, component types, insertion policy, or borrow behavior.

#### Scenario: Scene system remains scene-owned
- **WHEN** runtime-scene runs transform propagation
- **THEN** runtime-scene owns queries for `Transform`, `GlobalTransform`, `Parent`, and `Children`
- **THEN** it delegates only the traversal/math shape to the shared core

#### Scenario: Puppet system remains puppet-owned
- **WHEN** runtime-puppet runs transform propagation
- **THEN** runtime-puppet owns queries for `Transform2D`, `GlobalTransform2D`, and puppet hierarchy components
- **THEN** it delegates only the traversal/math shape to the shared core

### Requirement: Matrix Dimensionality Remains Runtime Specific
The shared transform propagation core SHALL support 3D and 2D matrix composition without forcing a single transform data type.

#### Scenario: Scene uses Mat4
- **WHEN** runtime-scene computes global transforms
- **THEN** it uses its existing 3D transform and `Mat4` semantics

#### Scenario: Puppet uses Mat3
- **WHEN** runtime-puppet computes global transforms
- **THEN** it uses its existing 2D transform and `Mat3` semantics

### Requirement: Transform Propagation Regression Tests
The engine SHALL validate shared transform propagation behavior with runtime-specific golden fixtures.

#### Scenario: Scene golden fixture passes
- **WHEN** validation runs for runtime-scene transform propagation
- **THEN** parent-child 3D transform results match the pre-refactor expected globals

#### Scenario: Puppet golden fixture passes
- **WHEN** validation runs for runtime-puppet transform propagation
- **THEN** parent-child 2D transform results match the pre-refactor expected globals
