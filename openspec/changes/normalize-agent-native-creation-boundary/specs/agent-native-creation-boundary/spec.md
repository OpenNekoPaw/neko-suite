## ADDED Requirements

### Requirement: Agent-native creation owns lifecycle

The system SHALL model creative lifecycle, validation feedback, review decisions, approval gates, artifact provenance, and next-action decisions through existing Agent session/turn, validator, approval, artifact, and capability behavior. IDC profiles, Skills, domain adapters, and prompt-chain guidance MUST NOT provide separate lifecycle, feedback, state, approval, or execution runtimes.

#### Scenario: Creation state is Agent-native
- **WHEN** a creative task enters a staged creation path
- **THEN** the active state SHALL remain inside Agent session/turn, artifact, validator, approval, and capability mechanisms
- **AND** the system SHALL NOT create an `AgentWorkflowRun`, `WorkflowNode`, `WorkflowTransition`, or equivalent executable workflow object as the canonical state.

#### Scenario: Domain adapter cannot own lifecycle
- **WHEN** Canvas, Cut, Model, File, or another domain capability participates in a creation stage
- **THEN** the domain adapter SHALL expose typed capability behavior and diagnostics
- **AND** it SHALL NOT own the Agent creation lifecycle, review state, approval state, or stage progression.

### Requirement: Stage guidance remains declarative

The system SHALL allow Skills and prompt guidance to describe stage semantics without turning those stages into a fixed type union, DAG, scheduler, or standalone runtime.

#### Scenario: Built-in IDC default profile
- **WHEN** IDC guidance is active
- **THEN** `draft`, `plan`, and `apply` SHALL be treated as method guidance
- **AND** those ids SHALL NOT require a separate IDC runtime, workflow run, or globally fixed stage type for new code.

#### Scenario: Non-IDC profile with additional stages
- **WHEN** storyboard guidance describes steps such as `read-reference`, `analyze-panels`, `generate-storyboard`, `validate-storyboard`, `revise-storyboard`, and `handoff-to-canvas`
- **THEN** the Agent MAY use those steps to reason and validate output
- **AND** the system SHALL NOT require a new profile runtime or fixed stage registry before the Agent can proceed.

### Requirement: Stages are feedback-driven and repeatable

Each Agent-native creation stage SHALL support repeated attempts, validator diagnostics, Agent revision, user feedback, review decisions, and regression to earlier stages without requiring an executable workflow transition engine.

#### Scenario: Validator feedback revises artifact
- **WHEN** a stage artifact fails validation after the Agent has streamed its response
- **THEN** the system SHALL record validation feedback with diagnostics
- **AND** the Agent SHALL be able to use that feedback to revise, supplement, or ask for user input in a later turn.

#### Scenario: User regresses stage
- **WHEN** the user rejects or modifies a stage artifact
- **THEN** the Agent SHALL receive the review decision through normal conversation, artifact, validator, or capability feedback
- **AND** the next Agent turn SHALL be able to continue or regress based on the user's feedback without creating a workflow transition object.

### Requirement: Workflow runtime concepts are prohibited for new creation behavior

New Agent creation behavior MUST NOT introduce or depend on executable workflow runtime concepts including `WorkflowRuntime`, `WorkflowRun`, `WorkflowNode`, `WorkflowTransition`, workflow DAG schedulers, workflow node executors, or hidden pipeline runtimes.

#### Scenario: New creation path poisons legacy workflow runtime
- **WHEN** tests execute a canonical Agent-native creation path with the legacy workflow runtime replaced by a throwing fake
- **THEN** the creation path SHALL still succeed or return its intended Agent-native diagnostics
- **AND** the throwing workflow fake SHALL NOT be called.

#### Scenario: Legacy workflow ids are not canonical
- **WHEN** a work item, task, or artifact still carries a legacy `workflowRunId` for trace compatibility
- **THEN** new behavior SHALL use Agent session/turn, artifact scope, or capability result identity as canonical
- **AND** missing legacy workflow ids SHALL NOT prevent creation state, validation feedback, or review projection.

### Requirement: Skill prompt-chain is observation-only

Skill prompt-chain behavior SHALL be represented as Agent-readable method guidance plus prompt-chain observations. Prompt-chain observations MUST NOT define executable nodes, transitions, retry policies, or hidden execution plans.

#### Scenario: Prompt-chain checkpoint recorded
- **WHEN** the Agent follows a meaningful checkpoint from an active Skill prompt-chain
- **THEN** the system SHALL be able to record a prompt-chain observation linked to creation id, iteration id, prompt-chain id, and Skill identity
- **AND** no workflow node or transition SHALL be created for that checkpoint.

#### Scenario: Prompt-chain skip or reorder recorded
- **WHEN** the Agent skips or reorders prompt-chain guidance because the context makes another step more appropriate
- **THEN** the system SHALL record the reason as a prompt-chain observation
- **AND** the Agent SHALL remain responsible for deciding the next action.

### Requirement: Approval and capability invocation stay Agent-native

Stage profiles and Skills MAY declare review policies and capability hints, but real approval state and side effects SHALL remain Agent-native and capability-lifecycle controlled.

#### Scenario: Skill cannot imply approval
- **WHEN** a Skill prompt-chain says to send a storyboard to Canvas
- **THEN** the Agent SHALL still invoke the relevant Canvas capability through the typed capability lifecycle and approval boundary
- **AND** the Skill prompt text SHALL NOT be treated as proof that the side effect succeeded or was approved.

#### Scenario: Capability result updates creation state
- **WHEN** a capability returns changed refs, diagnostics, review artifact refs, or next actions
- **THEN** the Agent SHALL be able to use those results in the current conversation/artifact context
- **AND** the domain capability SHALL NOT become the owner of stage lifecycle.

### Requirement: Composer does not expose staged creation controls

The Webview composer SHALL NOT display IDC or staged-creation start/resume/stop controls under the input area or in a global toolbar. Staged creation status SHALL be projected through conversation, artifact, diagnostic, review, or status surfaces.

#### Scenario: Normal Agent composer has no staged creation toolbar
- **WHEN** an Agent conversation supports staged creation internally
- **THEN** the composer SHALL NOT show start, resume, or stop staged-creation buttons solely because a staged creation control callback or capability exists
- **AND** users SHALL interact through normal conversation, explicit Skill/command invocation, review actions, or capability actions.

#### Scenario: Stage status appears as projection
- **WHEN** staged creation is active
- **THEN** the Webview SHALL be able to project current profile, stage, diagnostics, and review actions outside the composer input toolbar
- **AND** the projection SHALL NOT require users to manually operate workflow-style controls.
