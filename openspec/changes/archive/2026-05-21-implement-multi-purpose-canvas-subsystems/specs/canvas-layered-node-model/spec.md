## ADDED Requirements

### Requirement: Canvas data supports subsystem metadata without kind locking
The system SHALL allow `.nkc` Canvas data to store optional subsystem metadata sections without introducing a file-level Canvas kind discriminator. Subsystem metadata MUST be additive and MUST NOT prevent different subsystem node types from coexisting in the same Canvas.

#### Scenario: Mixed Canvas stores multiple metadata sections
- **WHEN** a Canvas contains narrative and behavior nodes
- **THEN** the persisted Canvas may contain both `narrative` and `behavior` metadata sections without a `kind` field

#### Scenario: Basic Canvas omits subsystem metadata
- **WHEN** a Canvas contains only basic nodes and no active subsystem state
- **THEN** the persisted Canvas may omit subsystem metadata sections

### Requirement: Canvas schema supports projected graph marker
The system SHALL allow Canvas data to mark a file as projected with `projected: true`. The marker MUST identify projection/cache behavior and MUST NOT act as a node-type or capability lock.

#### Scenario: Projected marker does not restrict node types
- **WHEN** a projected Canvas contains entity or memory nodes plus basic annotation nodes
- **THEN** validation accepts the mix when the nodes are structurally valid

### Requirement: NKC v2.1 extends v2.0 without destructive migration
The system SHALL introduce NKC v2.1 as an optional extension over v2.0. Migration from v1.0 or v2.0 to v2.1 MUST preserve unknown fields, existing node data, absolute positions, top-level connections, content trees, and container relationships.

#### Scenario: v2.0 Canvas migrates without structural changes
- **WHEN** a v2.0 Canvas is opened by the v2.1 loader
- **THEN** the loader preserves nodes, connections, viewport, content, organization, and relationship fields while normalizing the version through the NKC migrator

#### Scenario: Unknown optional fields are preserved
- **WHEN** a Canvas file contains optional fields not used by the current renderer
- **THEN** load/save behavior preserves those fields unless an explicit migrator removes them

### Requirement: Registered node and connection types extend Canvas validation
The system SHALL validate Canvas node and connection types against core built-in types plus registered subsystem types. Built-in subsystem types MUST be declared through shared contracts before their Webview renderers are used.

#### Scenario: Registered narrative node validates
- **WHEN** a Canvas contains a structurally valid `choice` node and the narrative subsystem type is registered
- **THEN** validation accepts the node type

#### Scenario: Registered memory connection validates
- **WHEN** a Canvas contains an `association` connection and the memory subsystem connection type is registered
- **THEN** validation accepts the connection type and applies registered rule descriptors

### Requirement: Unknown complete nodes produce warnings in normal load mode
The system SHALL report complete unknown node types as warnings in normal load mode and as errors in strict validation mode. Structurally incomplete nodes MUST remain errors in all modes.

#### Scenario: Normal load reports unknown node warning
- **WHEN** a Canvas file contains a structurally complete unknown node type
- **THEN** the validator reports a warning and allows the Webview fallback renderer to preserve the node

#### Scenario: Strict validation rejects unknown node
- **WHEN** strict validation is requested for a Canvas with an unknown node type
- **THEN** validation reports the unknown node as an error
