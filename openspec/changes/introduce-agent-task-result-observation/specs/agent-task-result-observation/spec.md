## ADDED Requirements

### Requirement: Terminal async tasks become Agent result observations

The system SHALL materialize terminal async task states as Agent task result observations when the task belongs to an Agent conversation.

#### Scenario: Completed owned task records an observation

- **WHEN** an async task reaches `completed` and has an owning Agent conversation
- **THEN** the system records a durable Agent observation for the task result and attaches evidence for the terminal result payload or result references

#### Scenario: Failed owned task records failure evidence

- **WHEN** an async task reaches `failed` and has an owning Agent conversation
- **THEN** the system records a durable Agent observation that describes the failure and attaches evidence containing the task error details

#### Scenario: Cancelled owned task records cancellation

- **WHEN** an async task reaches `cancelled` and has an owning Agent conversation
- **THEN** the system records a durable Agent observation that the task was cancelled without claiming a successful generated result

#### Scenario: Unowned task does not create Agent observation

- **WHEN** an async task reaches a terminal state without an owning Agent conversation
- **THEN** the system updates task/work-item state without creating an Agent conversation observation

### Requirement: Delivery policy controls follow-up behavior

The system SHALL evaluate an explicit task result delivery policy before notifying the user, asking for continuation, or scheduling a follow-up Agent turn.

#### Scenario: Default owned task appends observation only

- **WHEN** an owned async task reaches a terminal state without an explicit auto-resume policy
- **THEN** the system appends the task result observation and does not automatically start another Agent turn

#### Scenario: Ask-user policy creates continuation request

- **WHEN** an owned async task reaches a terminal state with an `ask-user-to-continue` policy
- **THEN** the system appends the task result observation and exposes a visible continuation request instead of synthesizing an Agent turn

#### Scenario: Auto-resume policy schedules follow-up

- **WHEN** an owned async task reaches a terminal state with an explicit `auto-resume-agent` policy
- **THEN** the system appends the task result observation and requests a follow-up Agent turn through the normal turn scheduling boundary

#### Scenario: Disallowed auto-resume is downgraded visibly

- **WHEN** a task requests auto-resume without an explicit allowed policy
- **THEN** the system appends the observation, does not start a follow-up Agent turn, and emits a diagnostic that auto-resume was disallowed

### Requirement: Task events never execute Agent recursively

The system SHALL treat terminal task events as triggers for observation and scheduling only, not as permission to call Agent execution recursively from the task event handler.

#### Scenario: Terminal event arrives while Agent is running

- **WHEN** a terminal task event requests follow-up while the owning Agent conversation is already running
- **THEN** the system enqueues a pending follow-up message through the runner queue with a task-result source

#### Scenario: Terminal event arrives while Agent is idle

- **WHEN** a terminal task event requests follow-up while the owning Agent conversation is idle
- **THEN** the system schedules a normal Agent turn through the existing turn dispatcher rather than invoking the executor directly

#### Scenario: Executor observe loop remains immediate-tool scoped

- **WHEN** an async task result arrives after the originating ReAct iteration has completed
- **THEN** the executor observe loop does not process it in-place and the result becomes context for a later turn through the recorded observation

### Requirement: Observation recording is idempotent and recoverable

The system SHALL prevent duplicate observations and duplicate follow-up scheduling across duplicate terminal events, progress/wait races, and Extension Host restart.

#### Scenario: Duplicate terminal event is ignored after first delivery

- **WHEN** the same terminal task result is delivered more than once
- **THEN** the system records at most one observation/evidence set and at most one follow-up request for that terminal result

#### Scenario: Restart reconciles terminal tasks

- **WHEN** the Extension Host restarts and loads terminal owned tasks that do not yet have recorded observations
- **THEN** the system records the missing observations according to their delivery policies

#### Scenario: Restart does not duplicate completed delivery

- **WHEN** the Extension Host restarts and a terminal owned task already has a recorded task result observation
- **THEN** the system does not append a duplicate observation or enqueue a duplicate auto-resume turn

### Requirement: Result references are stable and safe

The system SHALL store only stable, host-neutral task result references in task result observations.

#### Scenario: Stable result refs are accepted

- **WHEN** a terminal task result contains artifact ids, asset ids, content/resource ids, or trusted provider URLs
- **THEN** the system may include those refs in observation evidence for later Agent and UI resolution

#### Scenario: Local display paths are rejected

- **WHEN** a terminal task result contains local absolute paths, process-local Webview URIs, or unsafe cache URLs as durable identities
- **THEN** the system rejects those refs or fails observation creation with a visible diagnostic instead of storing them as durable result refs

### Requirement: Existing ownership boundaries are preserved

The system SHALL implement task result observation through existing task, session, stream, runner, turn, executor, Extension, and Webview ownership boundaries.

#### Scenario: Task owns terminal state

- **WHEN** task terminal state changes
- **THEN** task storage and recovery remain owned by `task/` and are not moved into a generic runtime control layer

#### Scenario: Session owns durable observation history

- **WHEN** a task result observation is recorded
- **THEN** the observation and evidence are appended through the session journal contract

#### Scenario: Stream owns active work-item projection

- **WHEN** a terminal task update belongs to the active turn timeline
- **THEN** the work-item projection remains anchored through the stream/timeline path and is not replaced by a synthetic assistant message

#### Scenario: ReAct semantics stay in executor

- **WHEN** an async task terminal result is processed
- **THEN** the implementation does not move ReAct observe semantics from `executor/` into `runtime/`
