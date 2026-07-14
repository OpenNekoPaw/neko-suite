## ADDED Requirements

### Requirement: Plan Mode is domain-neutral read-only planning
Plan Mode SHALL allow the Agent to read and analyze current repository or creative content, inspect currently available capabilities, ask clarifying questions, and create or revise user-reviewable planning documents without executing side effects. It MUST NOT identify itself only as a software architect mode, start IDC, activate a stage persona, create a media Task, mutate a project or asset, export a deliverable, or grant implicit permission.

#### Scenario: Creative Plan Mode analyzes actual content
- **WHEN** a user enters Plan Mode for a comic, screenplay, novel, illustration, video, audio, or existing creative project
- **THEN** the Agent SHALL use permitted read/analysis paths to ground the plan in current source evidence and capability availability
- **AND** it SHALL not fall back to a software-only generic implementation-plan prompt

#### Scenario: Plan Mode has no production side effect
- **WHEN** the Agent creates or edits `brief.md`, `plan.md`, a creator-review document, or TODO projection in Plan Mode
- **THEN** no media generation Task, project/asset mutation, export, delivery, IDC run, or stage persona SHALL be created
- **AND** any external, protected, or cost-bearing analysis SHALL still pass its actual trust, permission, cost, and Approval policy

### Requirement: Plan Mode produces execution-ready detail when requested
When the user requests a production plan, Plan Mode SHALL describe concrete work units with current inputs, conditions, capability intents, constraints, outputs, acceptance, recovery, and approval boundaries. It MUST NOT satisfy the request with only broad phases or with guidance limited to what and why while omitting how the work can be executed and verified.

#### Scenario: Plan exposes specific work units
- **WHEN** the user requests a detailed animation or filmmaking plan from available source content
- **THEN** the plan SHALL identify source-grounded units such as page/panel/scene/character/shot/audio/project work and their expected outputs and checks
- **AND** unsupported or unknown execution paths SHALL be marked blocked, degraded, partial, or requiring clarification

### Requirement: Execution mode changes do not create planning state
Changing among `auto`, `ask`, and `plan` SHALL update only the current Agent execution/permission behavior. It MUST NOT create or restore a plan runtime, IDC run, stage state, persona lifecycle record, TODO store, or project fact.

#### Scenario: Leaving Plan Mode uses normal Agent execution
- **WHEN** the user approves a plan and requests execution in an applicable non-plan mode
- **THEN** the Agent SHALL re-read current inputs and invoke Tools through the ordinary current session/turn path
- **AND** no Plan-to-Apply compiler, stage transition, or hidden execution graph SHALL be required
