## ADDED Requirements

### Requirement: Legacy pipeline compatibility adapter is explicitly deprecated
The system SHALL mark legacy pipeline compatibility adapters with deprecation metadata. The metadata MUST include adapter id, owner, introduced date, sunset milestone, workflow-native replacement, and allowed compatibility window.

#### Scenario: Legacy adapter reports deprecation metadata
- **WHEN** a legacy pipeline runs through the compatibility adapter
- **THEN** runtime telemetry records the adapter id, deprecation status, sunset metadata, and workflow-native replacement path

#### Scenario: Missing deprecation metadata fails validation
- **WHEN** a legacy compatibility adapter lacks required deprecation metadata
- **THEN** targeted validation fails and reports the adapter file or registration id

### Requirement: New workflow paths use workflow-native definitions
The system SHALL require newly introduced multi-step agent workflows to use `AgentWorkflowDefinition` or workflow node profiles rather than legacy pipeline-only definitions. Legacy adapters MAY continue serving existing flows during the compatibility window.

#### Scenario: New pipeline-only flow is rejected
- **WHEN** a new multi-step workflow is registered only as a legacy pipeline after the sunset gate is enabled
- **THEN** runtime validation rejects it or reports a blocking diagnostic

#### Scenario: Existing legacy flow still runs during compatibility window
- **WHEN** an existing legacy pipeline executes before its sunset milestone
- **THEN** it may run through the compatibility adapter while emitting deprecation telemetry

### Requirement: Legacy pipeline telemetry supports migration planning
The system SHALL record enough telemetry to migrate legacy pipelines to workflow-native definitions. Telemetry MUST include workflow definition candidate, node mapping, missing migration reason, usage count, and last-used timestamp.

#### Scenario: Telemetry identifies unmapped nodes
- **WHEN** a legacy pipeline cannot be fully mapped to workflow nodes
- **THEN** telemetry records the unmapped step ids and missing migration reasons

### Requirement: Sunset gate blocks expired legacy compatibility by policy
The system SHALL block or require explicit compatibility approval for legacy pipeline adapters after their sunset milestone. The block MUST be configurable by policy for test migration windows but default to failure in production validation.

#### Scenario: Expired legacy adapter requires approval
- **WHEN** a legacy adapter is used after its sunset milestone
- **THEN** runtime rejects the path or requires explicit compatibility approval before execution
