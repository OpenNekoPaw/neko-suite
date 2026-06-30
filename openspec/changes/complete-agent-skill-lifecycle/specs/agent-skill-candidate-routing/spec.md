## ADDED Requirements

### Requirement: Automatic Skill lifecycle changes remain runtime-owned
The system SHALL allow automatic Skill injection and cancellation only from typed runtime lifecycle events. It SHALL NOT treat Extension/Webview natural-language candidate routing as a lifecycle activation source.

#### Scenario: Natural language still does not pre-activate Skill
- **WHEN** a user sends a natural-language request that resembles a Skill domain
- **THEN** Extension and Webview code SHALL dispatch the request without activating a Skill record
- **AND** they SHALL NOT send Skill candidate messages or chips
- **AND** any later Skill activation SHALL occur only if the Agent explicitly calls `ActivateSkill` or another typed runtime lifecycle source requests activation.

#### Scenario: Runtime expiry can remove active Skill records
- **WHEN** a typed lifecycle expiry event occurs for a turn, IDC stage, workflow, or inactivity threshold
- **THEN** the runtime MAY remove matching active Skill lifecycle records
- **AND** this automatic cancellation SHALL NOT depend on natural-language keyword matching.

### Requirement: GetContext exposes lifecycle state without candidate hints
The system SHALL expose active Skill lifecycle summaries to the Agent through `GetContext` while continuing to omit code-generated Skill candidate hints.

#### Scenario: Agent sees active lifecycle state
- **WHEN** the Agent calls `GetContext`
- **THEN** the result SHALL include registered Skill catalog metadata
- **AND** it SHALL include active lifecycle summaries for active Skill records
- **AND** it SHALL NOT include `skillCandidateHints`.

#### Scenario: Agent can decide to deactivate
- **WHEN** `GetContext` shows a clearable active lifecycle record
- **THEN** the Agent MAY call `DeactivateSkill` for that clearable target
- **AND** the runtime SHALL enforce lifecycle deactivation policy before removing the record.
