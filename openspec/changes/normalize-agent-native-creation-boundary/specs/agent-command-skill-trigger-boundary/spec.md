## ADDED Requirements

### Requirement: Stage profile activation is Agent-native

Explicit command or Skill triggers that affect staged creation SHALL route through Agent-native creation/profile activation semantics. They SHALL NOT create or resume executable workflow runs, workflow nodes, workflow transitions, or hidden workflow runtimes.

#### Scenario: Skill invocation uses prompt-chain guidance
- **WHEN** the user explicitly invokes a Skill that declares prompt-chain guidance
- **THEN** the system SHALL activate the Skill through the canonical Skill lifecycle path
- **AND** the prompt-chain SHALL be treated as Agent method guidance rather than an executable workflow.

#### Scenario: Legacy IDC workflow command is not canonical
- **WHEN** a legacy `/idc start`, `/idc resume`, or `/idc stop` route remains during migration
- **THEN** it SHALL either map to Agent-native creation/profile activation diagnostics or fail visibly as legacy
- **AND** it SHALL NOT create a successful workflow runtime run or node for new Agent creation paths.

#### Scenario: Agent-requested stage change is auditable
- **WHEN** the Agent chooses to enter, continue, regress, or complete a creation stage
- **THEN** the action SHALL be represented as Agent-native creation state and provenance
- **AND** it SHALL NOT be represented as a workflow transition.

### Requirement: Prompt-chain terminology replaces workflow execution terminology

Agent help text, command diagnostics, Skill metadata, and user-facing trigger descriptions SHALL use method, staged creation, or prompt-chain terminology when describing Skill-guided creation. They SHALL NOT describe ordinary Skill-guided creation as workflow runtime execution.

#### Scenario: Help avoids workflow runtime wording
- **WHEN** the user requests Agent command or Skill help
- **THEN** the help text SHALL distinguish commands, Skills, context references, staged creation, and prompt-chain guidance
- **AND** it SHALL NOT imply that Skill prompt-chain guidance is a workflow engine.

#### Scenario: Skill workflow wording is diagnostic
- **WHEN** a Skill or command artifact still declares executable workflow semantics
- **THEN** authoring or activation validation SHALL report a visible diagnostic or legacy warning
- **AND** the system SHALL NOT silently grant execution behavior from that wording.
