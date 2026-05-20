## ADDED Requirements

### Requirement: Model Scene Capability Provider
The Agent capability system SHALL accept `neko-model` as a domain capability provider for 3D scene query and editing tools.

#### Scenario: Model provider registers tools
- **WHEN** `neko-model` activates in a host where Agent is available
- **THEN** it registers model scene query, node manipulation, and animation control tools through the existing capability registration flow

#### Scenario: Query tool remains read-only
- **WHEN** the model scene query tool is registered
- **THEN** capability metadata marks it with `isReadOnly: true`, `isConcurrencySafe: true`, and `safetyKind: 'read-only-query'` so injection policy can treat it differently from editing operations

#### Scenario: Editing tools respect host availability
- **WHEN** model editing tools require VSCode Extension Host state or an active model editor
- **THEN** injection or execution reports unavailable status when those requirements are not met

#### Scenario: Mutation tools declare targets and query guidance
- **WHEN** model editing tools are registered
- **THEN** each mutation tool declares `targetRequirements` and `queryBeforeMutate` guidance that points to the model scene query tool before execution

#### Scenario: Canvas transfer remains out of scope
- **WHEN** Agent needs target-aware Canvas active-context query or Canvas content application
- **THEN** those tools and contracts are provided by `targeted-agent-plugin-transfer-and-query-apis`, while this change only aligns model/asset providers to the shared metadata fields
