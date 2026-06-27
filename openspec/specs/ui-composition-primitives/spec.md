# ui-composition-primitives Specification

## Purpose
TBD - created by archiving change introduce-ui-composition-primitives. Update Purpose after archive.
## Requirements
### Requirement: Layout-only composition primitives

The system SHALL provide `@neko/ui` composition primitives for fixed creative panels that share visual structure, accessibility, keyboard/focus affordances, theme integration, and dense editor layout without requiring callers to create `PropertyDefinition` schemas.

#### Scenario: Fixed panel renders a typed property row

- **WHEN** a fixed domain panel renders a stable field such as transform position, opacity, audio volume, brush size, or color
- **THEN** it MUST be able to use `@neko/ui` composition primitives with typed props and callbacks from the owning package
- **AND** it MUST NOT need to map the field into a generic `PropertyDefinition` solely for visual layout reuse

#### Scenario: Composition primitive receives domain-specific children

- **WHEN** a panel needs domain-specific controls, labels, reset actions, keyframe affordances, or extra inline actions
- **THEN** the composition primitive MUST accept those differences through props, children, or slots
- **AND** it MUST NOT import or understand feature package stores, commands, project formats, or business types

### Requirement: Two-phase edit propagation

The system SHALL preserve separate preview and commit phases through shared composition primitives and composed controls.

#### Scenario: Slider row previews and commits

- **WHEN** a user drags a slider rendered through `SliderPropertyRow` or an equivalent composition primitive
- **THEN** the primitive MUST surface preview updates separately from final commit updates
- **AND** callers MUST be able to update interactive preview state without committing a project mutation on every pointer move

#### Scenario: Axis group edits a numeric field

- **WHEN** a user edits an axis value through `AxisGroup`
- **THEN** the axis control MUST expose the same preview/commit distinction as the underlying number input or slider
- **AND** the owning package MUST be able to attach typed callbacks for the edited axis without parsing a string property path

### Requirement: Dynamic PropertyPanel role

The system SHALL keep generic `PropertyPanel` for truly dynamic schemas while ensuring its visual rendering uses the same composition primitives as fixed panels.

#### Scenario: Runtime schema renders dynamic parameters

- **WHEN** a runtime provider, Puppet parameter source, Engine/plugin manifest, or schema registry supplies an unknown property list
- **THEN** the UI MUST be able to render those fields through `PropertyPanel`
- **AND** the schema MUST remain the canonical contract for that dynamic parameter surface

#### Scenario: Fixed panel does not create temporary schema

- **WHEN** a panel field set is stable and known at compile time
- **THEN** the panel MUST use typed composition primitives instead of creating temporary `PropertyDefinition[]` solely to reuse `PropertyPanel`
- **AND** normal edit paths MUST NOT depend on `id.split('.')`, unchecked `typeof value` dispatch, or empty-patch fallback

### Requirement: Fixed panel adapter migration

The system SHALL migrate fixed-domain property adapters to typed composition when the field set is stable and belongs to the owning package.

#### Scenario: Cut fixed property path is migrated

- **WHEN** a migrated `neko-cut` fixed property such as transform, audio, style, or text commits a value
- **THEN** the edit MUST flow through typed domain callbacks or explicit domain patch helpers
- **AND** tests MUST prove the normal path does not call the legacy shared property adapter or return an empty patch for valid fixed fields

#### Scenario: Sketch brush path is migrated

- **WHEN** a migrated `neko-sketch` brush property commits a value
- **THEN** the edit MUST flow through typed brush callbacks or explicit brush patch helpers
- **AND** it MUST NOT rely on generic `PropertyValue` plus `typeof` dispatch for the normal fixed brush path

#### Scenario: Dynamic parameter path remains schema-driven

- **WHEN** a Puppet runtime parameter or registry-provided parameter list is not known at compile time
- **THEN** it MUST remain schema-driven through `PropertyPanel` or an equivalent dynamic schema renderer
- **AND** fixed-panel migration MUST NOT replace it with hard-coded rows

### Requirement: Shared UI domain isolation

The system SHALL keep `@neko/ui` free of feature-package business semantics while allowing low-semantics creative visual shells.

#### Scenario: Shared menu helper has no Agent defaults

- **WHEN** a shared menu helper is exported from `@neko/ui`
- **THEN** it MUST NOT embed Agent-specific names, default labels, icons, runtime actions, or capability concepts
- **AND** any Agent or “send to agent” label/icon/action MUST be supplied by the owning package or moved to an Agent-owned helper

#### Scenario: Viewport prediction kinds are domain-extensible

- **WHEN** a domain creates a viewport prediction for brush, bone, blendshape, IK, morph, or similar domain behavior
- **THEN** the domain MUST define the domain-specific prediction kind or metadata in its own package
- **AND** `@neko/ui` MUST expose only generic prediction primitives or an explicitly extensible custom kind contract

#### Scenario: Keyframe visual shell avoids domain DTOs

- **WHEN** a package renders keyframe timeline visuals through `@neko/ui`
- **THEN** the shared component MUST consume UI-local visual DTOs that represent tracks, points, labels, selection, timing, and visual affordances
- **AND** Cut, Model, Puppet, or other domains MUST project their own keyframe models into those DTOs in package-owned wrappers

### Requirement: Path-level validation and guardrails

The system SHALL provide tests or checks that make adapter regressions and `@neko/ui` domain leaks visible.

#### Scenario: Migrated fixed panel accidentally hits legacy adapter

- **WHEN** a test exercises a migrated fixed panel edit path
- **THEN** the test MUST assert that the canonical typed path was used
- **AND** it MUST fail if the legacy schema adapter handles the normal migrated edit

#### Scenario: New domain semantic is added to shared UI

- **WHEN** production `@neko/ui` source introduces a feature-package import, Agent-specific default, Cut/Model/Puppet/Sketch-specific business type, or equivalent domain semantic
- **THEN** a boundary check or focused test MUST fail with an actionable diagnostic
- **AND** approved exceptions MUST identify the owning boundary, reason, validation command, and removal condition

#### Scenario: Primitive behavior is shared across fixed and dynamic panels

- **WHEN** `PropertyPanel` and a fixed domain panel render equivalent low-semantics rows or sections
- **THEN** tests MUST prove both paths use the shared primitive behavior for layout and interaction
- **AND** the fixed domain panel MUST still keep its own typed callbacks and domain state ownership
