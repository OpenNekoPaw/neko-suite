## ADDED Requirements

> **Superseded stage-persona clauses (2026-07-15):** Requirements for IDC stage-owned persona activation, lock, expiry, or restore are non-executable history. Only ordinary domain/reference Skill lifecycle records remain canonical.

### Requirement: Skill lifecycle records are the active Skill source of truth
The system SHALL represent active Skills as typed conversation-scoped lifecycle records. Prompt sections, tool policy, model overrides, and UI indicators SHALL be projections from those records, not independent active Skill state.

#### Scenario: Explicit user activation creates a domain Skill record
- **WHEN** the user invokes `$quality-review changed files`
- **THEN** the runtime SHALL load and validate the `quality-review` Skill
- **AND** it SHALL create a lifecycle record in the `domainSkill` slot for the current conversation
- **AND** the record SHALL include the rendered `SkillInjection`, owner, lifetime, deactivation policy, and activation source.

#### Scenario: Agent activation creates a domain Skill record
- **WHEN** the Agent calls `ActivateSkill` with a valid Skill name
- **THEN** the runtime SHALL create or renew a lifecycle record through the same lifecycle activation path used by explicit `$skill`
- **AND** it SHALL NOT mutate an unrelated single active injection slot as the source of truth.

#### Scenario: Stage persona creates an IDC-owned record
- **WHEN** IDC runtime enters a stage that requires a stage persona
- **THEN** the runtime SHALL create a `stagePersona` lifecycle record owned by IDC
- **AND** the record SHALL be scoped to the run id and stage.

### Requirement: Agent turns project Skill lifecycle state into request context
The system SHALL recompute Skill prompt sections, tool policy, and visible active Skill indicators from active lifecycle records for every Agent turn.

#### Scenario: Turn request includes projected Skill sections
- **WHEN** an Agent turn starts with active lifecycle records
- **THEN** turn assembly SHALL project those records into deterministic prompt sections
- **AND** section order SHALL be stable by slot and priority
- **AND** the provider request SHALL use the projected prompt rather than a stale mutation from a previous turn.

#### Scenario: Projection refreshes after deactivation
- **WHEN** a lifecycle record is removed before the next Agent turn
- **THEN** the next turn projection SHALL omit that record's prompt section
- **AND** it SHALL omit that record from visible active Skill indicators
- **AND** it SHALL recompute tool policy without relying on previous allow-rule cleanup.

#### Scenario: Projection reports invalid lifecycle state
- **WHEN** a lifecycle record references an unknown slot, missing Skill injection, or unavailable Skill content
- **THEN** request projection SHALL fail visibly with a lifecycle diagnostic
- **AND** it SHALL NOT silently skip the record and return a successful Agent turn.

### Requirement: Skill deactivation is policy checked
The system SHALL evaluate deactivation requests against lifecycle record ownership, slot, lifetime, and lock state before removing records.

#### Scenario: User clears clearable domain Skill
- **WHEN** the user clears an active `domainSkill` lifecycle record that is marked clearable by the user
- **THEN** the runtime SHALL remove that record
- **AND** the next request projection SHALL exclude its prompt and tool policy contributions.

#### Scenario: User cannot clear IDC stage persona
- **WHEN** the user attempts to clear an IDC-owned `stagePersona` lifecycle record
- **THEN** the runtime SHALL reject the request with a locked deactivation diagnostic
- **AND** the record SHALL remain active until the owning IDC stage exits or runtime explicitly clears it.

#### Scenario: Ambiguous clear by Skill name fails
- **WHEN** a deactivation request targets a Skill name that matches multiple lifecycle records
- **THEN** the runtime SHALL reject the request with an ambiguous deactivation diagnostic
- **AND** it SHALL require a record id or slot-scoped target.

#### Scenario: Internal expiry is tied to lifecycle event
- **WHEN** runtime expiry is requested for a turn, stage, workflow, or inactivity event
- **THEN** the runtime SHALL remove only records whose lifetime matches that event
- **AND** it SHALL leave unrelated records active.

### Requirement: Skill lifetimes drive automatic cancellation
The system SHALL automatically remove lifecycle records when their declared lifetime expires.

#### Scenario: Turn-scoped Skill expires after turn
- **WHEN** an `ephemeralSkill` record has a turn-scoped lifetime
- **AND** that Agent turn completes, fails, or is cancelled
- **THEN** the runtime SHALL remove the record before the next turn projection.

#### Scenario: Stage-scoped Skill expires on stage exit
- **WHEN** an IDC stage exits
- **THEN** the runtime SHALL remove lifecycle records scoped to that run id and stage
- **AND** it SHALL preserve records scoped to other stages or conversation-level domain Skills.

#### Scenario: Workflow Skill expires on workflow completion
- **WHEN** a workflow or IDC run completes or is cancelled
- **THEN** the runtime SHALL remove lifecycle records scoped to that workflow or run
- **AND** it SHALL report removed records in lifecycle diagnostics or trace output.

#### Scenario: Inactivity expiry respects recent use
- **WHEN** a lifecycle record has an inactivity lifetime
- **AND** the record has not been used within the configured turn threshold
- **THEN** the runtime SHALL expire the record
- **AND** it SHALL NOT expire records that were renewed or used within the threshold.

### Requirement: Multi-Skill activation uses slot-scoped conflict policy
The system SHALL allow multiple active Skill records only when their slots and conflict policies are compatible. Conflicts SHALL be resolved deterministically or fail visibly.

#### Scenario: Domain Skill defaults to single active record
- **WHEN** a `domainSkill` is active
- **AND** another non-mergeable `domainSkill` is activated
- **THEN** the runtime SHALL apply the configured conflict strategy
- **AND** it SHALL either replace a clearable lower-priority record, reject activation, or request user or Agent choice.

#### Scenario: Stage persona and domain Skill coexist
- **WHEN** an IDC `stagePersona` record is active
- **AND** the user or Agent activates a `domainSkill`
- **THEN** both records SHALL remain active if their tool policy and model policy are compatible
- **AND** projection SHALL render both records in deterministic slot order.

#### Scenario: Incompatible tool policies fail closed
- **WHEN** active lifecycle records produce tool policy rules that cannot be combined deterministically
- **THEN** projection SHALL fail with a tool policy conflict diagnostic
- **AND** it SHALL NOT widen tool access by taking an unsafe union.

#### Scenario: Activation rejects an incompatible tool policy transaction
- **WHEN** activating a lifecycle record would make the post-replacement executable allow-list intersection empty
- **THEN** activation SHALL return a `tool-policy-conflict` diagnostic before creating the requested record
- **AND** the previously valid active records and their projection SHALL remain unchanged.

#### Scenario: Apply persona composes with a domain Skill
- **WHEN** the Apply-stage `execution-persona` is active without a Skill-level allow-list
- **AND** an `image` domain Skill is activated with `GenerateImage`, `TransformImage`, and `ReadImage`
- **THEN** both prompt records SHALL remain active
- **AND** the effective Skill tool policy SHALL be the domain Skill allow-list
- **AND** IDC stage, permission, and approval gates SHALL remain higher-priority enforcement boundaries.

#### Scenario: Meta Tool provider binding is conversation scoped
- **WHEN** two Agent sessions share the Host Tool registry and bind different conversation Skill providers
- **AND** the second session calls `ActivateSkill`
- **THEN** only the second session's provider SHALL receive the activation
- **AND** no lifecycle record SHALL be created or renewed under the first conversation identity.

#### Scenario: Model override conflict is explicit
- **WHEN** two active records both require incompatible model overrides
- **THEN** the runtime SHALL choose the owner defined by slot policy or fail with a model override conflict diagnostic
- **AND** it SHALL NOT silently ignore one override.

### Requirement: Skill lifecycle diagnostics are observable
The system SHALL return observable diagnostics for lifecycle errors, blocked deactivation, conflict rejection, expired records, and stale projection state.

#### Scenario: Unknown Skill activation fails visibly
- **WHEN** lifecycle activation targets a missing, disabled, or unloadable Skill
- **THEN** the runtime SHALL return a visible activation diagnostic
- **AND** it SHALL NOT create a lifecycle record.

#### Scenario: Locked deactivation is shown to UI
- **WHEN** a deactivation request is rejected because a record is locked
- **THEN** the UI projection SHALL include the record and its locked reason
- **AND** the clear action SHALL be disabled or reported as unavailable for that record.

#### Scenario: GetContext includes active lifecycle summary
- **WHEN** the Agent calls `GetContext`
- **THEN** the result SHALL include active Skill lifecycle summaries with slot, owner, clearability, expiry, and diagnostics when present
- **AND** it SHALL NOT include code-generated natural-language candidate hints.

### Requirement: Legacy single active injection is not a parallel success path
The system SHALL migrate current single active Skill behavior onto lifecycle records and request projection. Legacy single-slot injection paths SHALL NOT remain as independent success paths after migration.

#### Scenario: Existing entry points map to lifecycle operations
- **WHEN** existing `$skill`, `invokeSkill`, `ActivateSkill`, or `DeactivateSkill` entry points are used
- **THEN** they SHALL call lifecycle activation or deactivation
- **AND** tests SHALL prove lifecycle projection supplied the prompt and tool policy.

#### Scenario: Legacy state cannot mask projection failure
- **WHEN** lifecycle projection fails for an active record
- **THEN** the Agent turn SHALL fail visibly
- **AND** it SHALL NOT fall back to a previously mutated single active prompt section or ToolGuard state.
