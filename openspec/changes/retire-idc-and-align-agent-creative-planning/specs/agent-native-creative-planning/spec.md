## ADDED Requirements

### Requirement: Agent grounds creative analysis in actual content evidence
Before proposing a creator-facing direction for a comic, novel, screenplay, PDF, illustration, image sequence, audio/video source, or existing project, the Agent SHALL read the relevant current files or stable ResourceRefs and SHALL distinguish observed source facts, Agent interpretation, creator decisions, and executable actions. It MUST NOT replace missing page, panel, scene, character, dialogue, visual, audio, or project evidence with a generic creative summary.

#### Scenario: Comic analysis separates evidence and interpretation
- **WHEN** the user asks for an animation adaptation plan from a comic
- **THEN** the Agent SHALL identify available page/panel/reading-order/dialogue/character evidence and unresolved ambiguities from the actual source
- **AND** inferred story or visual decisions SHALL be labeled separately from observed source facts

#### Scenario: Missing visual evidence fails visibly
- **WHEN** a requested plan depends on image pixels that the current Agent/perception path cannot inspect
- **THEN** the Agent SHALL report the missing evidence path or request the smallest useful input
- **AND** it SHALL NOT invent panels, dialogue, character appearance, composition, or production readiness

### Requirement: Agent produces creator-reviewable domain documents
For complex, high-cost, long-running, or creatively ambiguous production, the Agent SHALL be able to produce user-editable Markdown and owning-domain documents that expose target, source evidence, creative decisions, alternatives, uncertainties, approval scope, and applicable domain content. Documents SHALL be optional and selected by the task; the system MUST NOT require every request to create Draft, Plan, Task, Character Bible, Storyboard, or another fixed document set.

#### Scenario: Creator reviews adaptation decisions
- **WHEN** source analysis reveals material adaptation, character, style, shot, sound, cost, or delivery choices
- **THEN** the Agent SHALL present those decisions and alternatives in a creator-readable document or conversation projection
- **AND** the creator SHALL be able to revise or approve the content without starting an IDC workflow or editing runtime state

#### Scenario: Existing approved domain document is reused
- **WHEN** the project already contains a current approved Storyboard, character reference, treatment, or style document suitable for the target
- **THEN** the Agent SHALL reuse it and record any needed exceptions
- **AND** it SHALL NOT create a duplicate document merely to satisfy a fixed process stage

### Requirement: Creative execution plans use actionable work units
An optional creative `plan.md` SHALL define observable deliverables and work units specific enough for the Agent to execute and validate. Each applicable work unit SHALL identify its object, trigger or skip condition, current inputs, capability intent, constraints, expected output, acceptance evidence, failure recovery, dependencies, and approval requirement. A list containing only broad phases such as analysis, generation, post-production, and export MUST NOT qualify as an execution-ready plan.

#### Scenario: Comic shot work unit is concrete
- **WHEN** an approved comic adaptation requires a shot to be prepared and animated
- **THEN** the work unit SHALL identify the source page/panel or shot, required references, preparation/animation intent, preservation and timing constraints, expected file/project result, acceptance checks, and recovery alternatives
- **AND** the plan SHALL mark missing or unavailable capabilities as blocked, degraded, or partial rather than implying execution success

#### Scenario: Simple operation does not require a plan file
- **WHEN** the user requests one low-risk, well-specified operation with current valid inputs
- **THEN** the Agent MAY invoke the normal Tool path directly
- **AND** the system SHALL NOT require `brief.md`, `plan.md`, TODO, IDC stage, or plan approval solely because the operation is creative

### Requirement: Markdown plans remain user content rather than executable state
`brief.md`, `plan.md`, creator-review documents, and progress notes SHALL remain ordinary user-editable content. They MUST NOT persist resolved executors, full Tool schemas, Provider or Task handles, temporary/cache/Webview identities, Workflow nodes/transitions, or hidden retry state, and changing them MUST NOT itself invoke a Tool or mutate a project.

#### Scenario: Approved plan is executed through current Tool resolution
- **WHEN** the creator approves a plan and requests execution
- **THEN** the Agent SHALL re-read the current plan and relevant files, choose the next ordinary typed Tool call from current capability state, and pass current validation/policy/approval
- **AND** it SHALL NOT compile the Markdown into a DAG or replay an executor/schema captured while the plan was written

#### Scenario: Plan edit has no side effect
- **WHEN** the creator edits a work unit, progress checkbox, or prose in Markdown
- **THEN** no media task, project mutation, asset-library import, export, or delivery SHALL occur solely from that edit
- **AND** the changed content SHALL require a later Agent turn and applicable approval before execution

### Requirement: TODO is a bounded progress projection
The Agent MAY project a small set of near-term work items with `pending`, `in_progress`, `completed`, or `blocked` status for conversation and task UI. TODO SHALL be derived display state, SHALL have at most one `in_progress` item per executing Agent task, and MUST NOT be a project, plan, recovery, or completion authority.

#### Scenario: TODO communicates current work
- **WHEN** the Agent executes a multi-step approved creative task
- **THEN** the user MAY see the current work item, recently completed items, next pending items, and explicit blockers
- **AND** the projection MAY be deleted or rebuilt without changing files, ResourceRefs, projects, approvals, or Task results

#### Scenario: Completed TODO cannot prove delivery
- **WHEN** a TODO item is marked `completed` but its expected file, ResourceRef, project revision, Tool result, or required validation is missing
- **THEN** the creative work SHALL remain incomplete
- **AND** downstream delivery or mutation gates SHALL use owning results rather than the TODO status

### Requirement: Approved plans continue through ordinary Agent ReAct
After required creator decisions are approved, the same Agent SHALL choose and execute the next available work unit through the existing session/turn, Tool lifecycle, Approval, Task, and owning-domain boundaries. It SHALL continue after synchronous or asynchronous results until the approved deliverable is produced, a required approval is reached, or a fail-visible blocker prevents progress; producing a plan alone MUST NOT finish an execution request.

#### Scenario: Execution request does not stop at planning
- **WHEN** the user requests actual production and the next work unit has sufficient input, support, permission, and approval
- **THEN** the Agent SHALL invoke the applicable current Tool instead of returning only an overall plan
- **AND** it SHALL observe the result before choosing the following work unit

#### Scenario: Async result resumes the same conversation
- **WHEN** a media Task completes after the initiating turn
- **THEN** its file/ResourceRef/digest/lineage or diagnostic SHALL return to the originating conversation
- **AND** the Agent SHALL continue normal ReAct without requiring an active Webview, IDC resume, or separate continue button

### Requirement: Material creative replans require renewed approval
When approval is required, it SHALL bind the approved document digest or content, critical input identity, target, creative scope, cost/risk ceiling, mutation scope, and delivery boundary using the existing Approval owner. The Agent MAY reorder, split, retry, repair, or substitute an equivalent capability inside that scope, but a material change to story, character, core style/sound, primary production technique, cost/risk level, mutation scope, or deliverable SHALL require creator review and renewed approval.

#### Scenario: Local recovery remains in scope
- **WHEN** a Tool diagnostic permits a smaller batch, reordered work, local repair, or equivalent current capability without changing the approved creative and delivery scope
- **THEN** the Agent MAY continue after normal Tool validation and policy checks
- **AND** it SHALL record the recovery reason in the conversation or living plan

#### Scenario: Major technique change returns for review
- **WHEN** recovery would replace an approved Puppet/layered animation strategy with generative video or otherwise materially change style, cost, risk, mutation, or delivery
- **THEN** the Agent SHALL revise the creator-facing decision or plan and request applicable approval
- **AND** the old approval SHALL NOT authorize the changed path

### Requirement: Completion remains bound to actual outputs
Creative completion SHALL be established by actual generated files with ResourceRef/digest/lineage, owning-domain project revisions for `.nk*` mutations, applicable Tool/Task results, and required Quality/Export evidence. Conversation prose, Markdown plan text, TODO state, prompt-chain observation, or retired IDC state MUST NOT substitute for these outputs.

#### Scenario: Generated output is directly usable
- **WHEN** an image, video, or audio generation succeeds
- **THEN** the result SHALL identify the actual file under the generated-output boundary and its ResourceRef/digest/lineage
- **AND** asset-library promotion SHALL NOT be required unless the user explicitly requests formal import or entity binding

#### Scenario: Missing owning capability limits the deliverable
- **WHEN** the requested target requires a domain operation that no current Tool can execute or validate
- **THEN** the Agent SHALL report the missing capability and the smallest valid partial deliverable
- **AND** it SHALL NOT use plan prose, TODO completion, or an Agent-owned substitute project model to claim the target succeeded
