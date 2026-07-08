## ADDED Requirements

### Requirement: Agent owns workbench surface descriptors

The Agent package SHALL provide host-neutral Workbench Core descriptors for Agent contextual panel, Agent main panel, and floating composer. Hosts MUST consume these descriptors instead of owning Agent placement semantics.

#### Scenario: Desktop registers Agent surfaces

- **WHEN** Desktop assembles Workbench Core contributions
- **THEN** Agent surface contributions MUST have the Agent package as owner
- **AND** Desktop MUST NOT mark those Agent surfaces as desktop bootstrap-owned

#### Scenario: Agent descriptors are imported by a host

- **WHEN** a host imports Agent workbench surface descriptors
- **THEN** the descriptors MUST be pure data and MUST NOT include React elements, VSCode objects, Electron objects, or Agent runtime handles
