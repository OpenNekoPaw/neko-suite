## ADDED Requirements

> **Superseded IDC clauses (2026-07-15):** Any requirement below that starts, resumes, restores, or advances an IDC run/stage/persona is replaced by `retire-idc-and-align-agent-creative-planning`. Explicit Skill activation and ordinary `executionMode` provenance remain valid; no IDC success path may be implemented.

### Requirement: Capability activation requires explicit source
The system SHALL require a typed activation source before creating initial active state for Agent capabilities including Skill records, IDC workflows, IDC stages, and execution mode changes.

#### Scenario: Natural-language turn does not activate capabilities
- **WHEN** a user sends an ordinary natural-language Agent message
- **THEN** Extension and Agent runtime SHALL dispatch the message without creating a Skill lifecycle record
- **AND** they SHALL dispatch the message without starting an IDC run
- **AND** they SHALL dispatch the message without changing execution mode.

#### Scenario: User explicit action activates capability
- **WHEN** the user invokes an explicit capability action such as `$skill`, `invokeSkill`, `Start IDC`, `Resume IDC`, or a mode selector change
- **THEN** the system SHALL create a typed activation intent with source `user-explicit`
- **AND** the target runtime SHALL apply or reject the activation based on that intent.

#### Scenario: Agent tool activates capability
- **WHEN** the Agent calls a typed capability activation tool
- **THEN** the system SHALL create a typed activation intent with source `agent-tool`
- **AND** the target runtime SHALL apply or reject the activation based on that intent.

### Requirement: Hidden default activation fails closed
The system SHALL fail visibly if legacy host or runtime code attempts to create initial capability state without an activation intent.

#### Scenario: Legacy Skill auto activation is blocked
- **WHEN** host-side natural-language Skill discovery finds a high-confidence Skill match before the Agent turn
- **THEN** the system SHALL NOT call `SkillService.apply`
- **AND** it SHALL NOT create a Skill lifecycle record
- **AND** it SHALL emit an assertable diagnostic or test-visible rejection for the legacy path.

#### Scenario: Legacy IDC auto start is blocked
- **WHEN** an ordinary Agent turn starts and no IDC workflow is active
- **THEN** `AgentSession` SHALL NOT call `startIdcRun` as a default side effect
- **AND** stage persona lifecycle records SHALL remain absent.

#### Scenario: Session creation does not activate stage persona
- **WHEN** an Agent session is created with Skill registry and Skill service available
- **THEN** the session SHALL NOT activate an IDC stage persona unless an IDC stage is active from an explicit workflow start or explicit resume.

### Requirement: Runtime continuation requires active lifecycle
Runtime-owned follow-up transitions SHALL only advance, renew, or expire capability state that was already explicitly activated.

#### Scenario: IDC stage advances after workflow start
- **WHEN** an IDC workflow was started by a valid activation intent
- **AND** the ReAct loop planner chooses a terminal IDC stage
- **THEN** the runtime MAY enter that stage
- **AND** it MAY activate the corresponding IDC-owned stage persona lifecycle record.

#### Scenario: Runtime expiry removes existing records
- **WHEN** a turn, IDC stage, workflow, or inactivity expiry event occurs
- **THEN** the runtime MAY remove matching existing lifecycle records
- **AND** it SHALL NOT create new capability activation state.

### Requirement: Activation provenance is observable
The system SHALL expose capability activation provenance to Webview and CLI/TUI projections.

#### Scenario: Active capability shows source
- **WHEN** a Skill, IDC workflow, IDC stage, or execution mode is active
- **THEN** the UI projection SHALL include whether it was triggered by `user-explicit` or `agent-tool`
- **AND** it SHALL include target, action, and reason when available.

#### Scenario: Restored workflow requires visible resume
- **WHEN** persisted IDC runtime state is available during conversation restore
- **THEN** the system SHALL show a visible resume or inactive-state diagnostic
- **AND** it SHALL NOT silently resume and activate stage persona records.

### Requirement: Activation progress is observable without prompt pollution
The system SHALL expose capability activation progress as host/runtime protocol events and SHALL NOT encode activation progress UI steps into Skill prompt text.

#### Scenario: Skill activation emits progress events
- **WHEN** a Skill activation is requested through user-explicit or agent-tool intent
- **THEN** the runtime SHALL emit activation progress events for the request lifecycle
- **AND** the events SHALL distinguish at least request receipt, validation, loading or preparation, lifecycle record creation or renewal, projection, and active or failed completion.

#### Scenario: Activation process does not become Skill prompt content
- **WHEN** a Skill activation is projected into an Agent turn
- **THEN** the Skill prompt sections SHALL contain only the rendered Skill instructions and intentional lifecycle prompt content
- **AND** they SHALL NOT contain UI-only activation progress labels such as requested, validated, loaded, projected, or active.

#### Scenario: UI renders collapsed activation status with expanded timeline
- **WHEN** activation progress events exist for the active conversation
- **THEN** Webview SHALL render a collapsed activation status row by default
- **AND** expanding that row SHALL show the ordered activation event timeline with diagnostics when present.

#### Scenario: Failed activation leaves no partial active state
- **WHEN** activation validation, loading, preparation, lifecycle creation, or projection fails
- **THEN** the runtime SHALL emit a failed activation event with diagnostics
- **AND** it SHALL NOT leave partially applied prompt sections, tool policy, model override, ToolSet activation, permission allow rules, or active lifecycle records for that failed activation.
