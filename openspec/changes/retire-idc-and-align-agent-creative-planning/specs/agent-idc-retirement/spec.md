## ADDED Requirements

### Requirement: Fixed IDC staged creation is retired
The canonical Agent runtime SHALL NOT create, restore, plan, enter, advance, or complete an IDC `draft`, `plan`, or `apply` run. Fixed `IdcStage`, stage activation matrix, stage planner/registry/tracker/guardian/dispatcher, IDC run identity, and stage transition state MUST NOT participate in ordinary Agent analysis, planning, approval, Tool execution, recovery, or completion.

#### Scenario: Ordinary creative request runs without IDC
- **WHEN** a user requests content analysis, a creator-review document, a plan, or actual media production
- **THEN** the request SHALL use the existing Agent session/turn and capability paths without creating an IDC run or stage
- **AND** execution SHALL succeed or fail based on current inputs, Tools, policy, Approval, Task, and owning results

#### Scenario: Legacy IDC entry is rejected
- **WHEN** a retired IDC start, resume, stage transition, or restore call reaches a remaining migration boundary
- **THEN** it SHALL return a fail-closed retired-path diagnostic or throw in development/test
- **AND** it SHALL NOT activate persona, create runtime state, or return legacy success

### Requirement: General Agent services are independent of IDC configuration
Approval, permission and Tool traits, preferences, event/audit/step logging, validation, recovery diagnostics, document IO, Task lifecycle, and asynchronous conversation continuation SHALL initialize and operate according to their own session/runtime configuration. Their availability and behavior MUST NOT depend on `stageTracking`, an IDC run, a stage tracker, or a stage persona.

#### Scenario: Approval remains active after IDC removal
- **WHEN** a high-cost, external, mutating, or irreversible Tool is requested in a normal Agent session
- **THEN** the existing permission and Approval boundaries SHALL evaluate it even though no IDC/stage runtime exists
- **AND** denial or required confirmation SHALL remain visible to the Agent and user

#### Scenario: Validation and continuation remain active
- **WHEN** a Tool result requires validation or an async Task completes in a session without IDC
- **THEN** the validation/diagnostic and originating-conversation continuation paths SHALL run normally
- **AND** no stage identity or stage event SHALL be required

### Requirement: Stage personas do not own Agent behavior
The runtime SHALL NOT automatically activate, switch, lock, or expire `creation-persona`, `execution-persona`, or `iteration-persona` based on a creation stage. General execution discipline SHALL live in the system prompt/runtime, domain creative judgment SHALL live in domain Skills, and Tool execution SHALL live in capability boundaries.

#### Scenario: Domain Skill remains active during execution
- **WHEN** an Agent moves from creator review to approved Tool execution
- **THEN** it SHALL keep or deliberately change its applicable domain/reference Skills through normal Skill lifecycle semantics
- **AND** no stage persona SHALL replace the domain Skill or narrow Tools because of `apply`

#### Scenario: Persisted stage persona is not restored
- **WHEN** a conversation contains an old runtime-owned stage persona record
- **THEN** the system SHALL ignore or reject that runtime-only record with an explicit retired-state diagnostic
- **AND** it SHALL preserve user Skill files, Markdown, project files, generated assets, settings, and trust state

### Requirement: IDC execution artifacts no longer own plan or progress state
Runtime `Draft`, `ExecutionPlan`, and staged `Task` artifacts SHALL be removed, migrated to ordinary user Markdown or generic TaskManager data when a real caller remains, or rejected at legacy boundaries. The system MUST NOT retain them as a compatibility execution state or require their identities before Agent Tool calls.

#### Scenario: User plan remains readable after runtime cleanup
- **WHEN** a user has an existing visible `brief.md`, `plan.md`, or checklist document
- **THEN** the document SHALL remain an ordinary workspace file that the Agent can read and edit under normal file policy
- **AND** removal of IDC runtime indexes or schemas SHALL NOT delete its content

#### Scenario: Runtime-only IDC state has no migration value
- **WHEN** persisted data contains only IDC run/stage/persona/checkpoint state and no user-authored content or project fact
- **THEN** the migration MAY intentionally discard or rebuild it with a visible diagnostic
- **AND** it SHALL NOT recreate a hidden compatibility runtime to resume it

### Requirement: IDC retirement is proven by poisoned paths
Tests and real Agent evaluations SHALL configure retired IDC stage, run, persona, and Draft/ExecutionPlan execution paths to throw or return fail-closed diagnostics. Canonical planning, Approval, execution, Task continuation, validation, and delivery scenarios SHALL fail if any poisoned IDC path participates.

#### Scenario: Canonical execution survives poison
- **WHEN** a creator-review and approved-execution evaluation poisons all fixed IDC/stage paths
- **THEN** the Agent SHALL still analyze, plan, obtain applicable approval, invoke current Tools, observe results, and deliver actual outputs
- **AND** the evidence SHALL identify the Agent session/turn, Tool/Task, Approval, and output paths that replaced IDC
