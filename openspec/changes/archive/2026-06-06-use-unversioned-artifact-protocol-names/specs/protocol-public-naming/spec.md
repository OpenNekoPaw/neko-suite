## ADDED Requirements

### Requirement: Neko-owned pre-release protocols use unversioned public names
The system SHALL expose canonical unversioned public names for Neko-owned shared protocols that do not have multiple incompatible versions in active use. Runtime compatibility MUST be represented by serialized version fields such as `schemaVersion` and `profileVersion`, not by requiring public TypeScript names or registry ids to include `V1`.

#### Scenario: Composite artifact protocol uses canonical name
- **WHEN** a package, Skill, registry facet, transfer DTO, renderer, or projector refers to the shared composite artifact protocol
- **THEN** it uses `CompositeArtifact` as the public protocol name
- **THEN** consumers inspect `schemaVersion` to determine schema compatibility

#### Scenario: Generic table protocol uses canonical name
- **WHEN** Agent or a package refers to the shared dynamic table protocol
- **THEN** it uses `GenericTable` as the public protocol name
- **THEN** profile compatibility is checked through profile id and `profileVersion` where applicable

### Requirement: Version-suffixed names are reserved for side-by-side variants
The system SHALL use version-suffixed names such as `FooV1` and `FooV2` only when incompatible variants must coexist, migration code must distinguish exact variants, or an external API already defines that versioned name. When side-by-side variants exist, the system MUST expose an unversioned union or facade for normal call sites.

#### Scenario: Existing multi-version artifact keeps exact variants
- **WHEN** a contract already has active side-by-side variants and migration behavior such as `NkEntityArtifactV1` and `NkEntityArtifactV2`
- **THEN** those exact variant names remain available
- **THEN** normal call sites use the unversioned union or migration facade where possible

#### Scenario: External API version name is preserved
- **WHEN** Neko implements an external API contract whose upstream name includes a version such as `ImageModelV3`
- **THEN** Neko preserves that upstream name instead of renaming it to an unversioned local alias

### Requirement: Protocol registry strings use canonical names
The system SHALL use canonical unversioned names in protocol registry strings, Skill metadata, profile descriptors, renderer declarations, projector declarations, and validator ids for pre-release Neko-owned protocols. Stale public `V1` strings MUST NOT remain in newly generated Skill guidance or runtime discovery metadata.

#### Scenario: Skill validation requirement references artifact protocol
- **WHEN** a built-in or discovered Skill declares validation requirements for composite artifact output
- **THEN** it declares `CompositeArtifact` and `GenericTable` rather than `CompositeArtifactV1` or `GenericTableV1`

#### Scenario: Domain block references storyboard payload
- **WHEN** a composite artifact domain block carries a storyboard payload
- **THEN** the domain payload kind is `StoryboardTable`
- **THEN** storyboard schema compatibility is checked from the payload `schemaVersion`

### Requirement: Unsupported versions degrade through validators
The system SHALL reject or degrade unsupported serialized versions through validators and diagnostics. Renderers MUST NOT infer compatibility from public protocol name alone, and MUST NOT silently reinterpret unsupported schema or profile versions as the current version.

#### Scenario: Unsupported schema version is received
- **WHEN** a consumer receives a `CompositeArtifact` whose `schemaVersion` is unsupported
- **THEN** validation returns a diagnostic
- **THEN** execution and projection actions for that artifact are disabled unless an explicit migrator succeeds

#### Scenario: Future breaking version is introduced
- **WHEN** a future change introduces an incompatible `CompositeArtifact` schema that must coexist with the current one
- **THEN** that change defines exact versioned variants and a migration or union strategy at that time
- **THEN** this change does not predeclare `CompositeArtifactV2`
