## ADDED Requirements

### Requirement: Session collaborators expose focused capability ports
The system SHALL keep session runtime collaborators dependent on focused,
named capability ports rather than broad anonymous callback bags that implicitly
capture `AgentSession` internals. A collaborator MAY receive multiple ports, but
each port MUST represent one cohesive capability such as persistence scheduling,
IDC run storage, artifact synchronization, feedback guidance, or prompt sync.

#### Scenario: Collaborator port does not expose full session state
- **WHEN** a session collaborator needs to read or write runtime subdomain data
- **THEN** it receives a narrow port for that subdomain instead of a callback
  set that can access unrelated `AgentSession` fields

#### Scenario: AgentSession assembles collaborators without changing public API
- **WHEN** `AgentSession` constructs session collaborators
- **THEN** it wires focused ports internally while preserving existing
  `IAgentSession` methods and user-visible events

### Requirement: Session collaborators have focused unit coverage
The system SHALL provide focused unit tests for `SessionPersistence`,
`IdcRunLifecycle`, `SessionArtifactFacade`, `FeedbackRuntimeBridge`, and
`PromptRuntimeFacade`. These tests MUST cover behavior observable through each
collaborator's public methods, including resource cleanup and relevant trace
debug summaries.

#### Scenario: Persistence collaborator is tested independently
- **WHEN** `SessionPersistence` restores, schedules persistence, flushes, or
  disposes runtime state
- **THEN** focused tests verify sink calls, debounce behavior, restore fallback,
  and cleanup without constructing a full `AgentSession`

#### Scenario: Artifact collaborator is tested independently
- **WHEN** `SessionArtifactFacade` restores artifacts, creates write context, or
  drains sync/projection queues
- **THEN** focused tests verify artifact service interaction and queue cleanup
  without relying only on `AgentSession` characterization tests

#### Scenario: Feedback and prompt collaborators are tested independently
- **WHEN** feedback cycle capture, guidance application, prompt sync, or prompt
  cache refresh occurs
- **THEN** focused tests verify collaborator-level behavior and trace/log
  summaries without requiring an end-to-end session turn

### Requirement: Phase trace derivation does not mutate shared agent context
The system SHALL derive phase-local trace contexts through explicit local values,
typed phase dependencies, or return values. Executor, think, act, and observe
paths MUST NOT rely on overwriting shared `AgentContext.trace` to communicate
the active phase.

#### Scenario: Think phase receives explicit trace
- **WHEN** executor enters the think phase
- **THEN** it passes a phase trace explicitly and leaves the turn-level
  `AgentContext.trace` value stable for later phases

#### Scenario: Act phase receives explicit trace
- **WHEN** executor enters the act phase or dispatches tool calls
- **THEN** tool execution receives the derived tool trace through typed runtime
  options rather than through mutation of shared context

#### Scenario: Trace integration remains reconstructable
- **WHEN** a traced session turn emits session, executor, LLM, tool, compaction,
  approval, feedback, and subagent logs
- **THEN** logs can still be reconstructed by conversation, run, turn,
  iteration, phase, and downstream request ids

### Requirement: AgentSession field ownership guard reports high-risk categories
The system SHALL guard new `AgentSession` private fields by both allowlist and
high-risk ownership categories. New fields that directly own timers, persistence
sinks, artifact or task queues, feedback guidance state, IDC transition buffers,
or prompt module instances MUST be reported unless they are explicitly
documented as legacy migration debt or collaborator references.

#### Scenario: New queue field is reported
- **WHEN** a new private field with queue-like ownership is added directly to
  `AgentSession`
- **THEN** the architecture guard reports that the queue belongs in the relevant
  collaborator or facade

#### Scenario: New prompt module instance is reported
- **WHEN** a new prompt module instance field is added directly to
  `AgentSession`
- **THEN** the architecture guard reports that prompt module ownership belongs
  behind `PromptRuntimeFacade` or the prompt orchestrator

#### Scenario: Collaborator references remain allowed
- **WHEN** `AgentSession` holds a reference to a focused runtime collaborator
- **THEN** the architecture guard allows the field if it is an approved facade
  collaborator reference and does not own subdomain internals directly
