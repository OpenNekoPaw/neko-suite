## ADDED Requirements

### Requirement: Internal continuations are not user transcript messages

The Agent runtime SHALL represent runtime-authored task-result, subagent-result, and system follow-up inputs as internal continuations, not as user-authored transcript messages.

#### Scenario: Task result continuation drives model without user transcript pollution

- **WHEN** a completed background task creates an auto-resume follow-up request
- **THEN** the TUI session MUST deliver the continuation prompt to the model execution path
- **AND** the visible conversation transcript MUST NOT add a `role: 'user'` message containing the continuation prompt
- **AND** the continuation MUST be observable through timeline, journal, or eval facts with source `task-result-continuation`

#### Scenario: Internal continuation prompt is not inferred from text

- **WHEN** a prompt-like input is submitted by runtime continuation handling
- **THEN** the system MUST classify it by typed source metadata
- **AND** it MUST NOT classify the input by matching strings such as `Continue from the completed async task result.`

### Requirement: Continuation queue is source-distinct from message queue

The TUI SHALL distinguish user-authored pending messages from runtime-authored pending continuations in queue metadata, ordering, display, and eval facts.

#### Scenario: User prompt waits while Agent is busy

- **WHEN** the user submits a prompt while the Agent is running
- **THEN** the pending item MUST have source `user`
- **AND** it MUST remain editable or cancellable as a user message queue item until it is released for execution

#### Scenario: Task continuation waits while Agent is busy

- **WHEN** a task-result follow-up request arrives while the Agent is running
- **THEN** the pending item MUST have source `task-result-continuation`
- **AND** it MUST be displayed as a continuation event rather than a queued user message
- **AND** it MUST NOT be editable as user-authored prompt text

### Requirement: Current-turn continuations preserve closed-loop workflows

The TUI SHALL prioritize internal continuations created by tasks from the current parent turn over later user queued messages unless the user explicitly changes ordering or discards the continuation.

#### Scenario: Image generation quality review resumes before later user prompt

- **WHEN** a user asks the Agent to generate an image and analyze its quality
- **AND** the image generation task completes after a later user prompt has been queued
- **THEN** the task-result continuation for the image MUST run before the later user prompt by default
- **AND** the Agent MUST be able to read the generated image resource reference before responding to the later prompt

#### Scenario: Immediate send changes order without discarding continuation

- **WHEN** the user invokes an immediate-send operation for a queued user prompt
- **THEN** the prompt MAY be ordered before pending continuations according to TUI policy
- **AND** pending continuations MUST remain queued unless the user explicitly discards them
- **AND** the ordering change MUST be observable in timeline, journal, or eval facts

#### Scenario: Continuation discard is explicit

- **WHEN** the user or runtime discards a pending continuation
- **THEN** the continuation MUST be marked discarded in timeline, journal, or eval facts
- **AND** discarding MUST NOT be an implicit side effect of normal user message submission

### Requirement: Task Group result delivery is explicit

The Agent runtime SHALL aggregate related background task results only when the task submission owner declares a Task Group and result delivery policy.

#### Scenario: Wait-all task group resumes once

- **WHEN** a batch tool submits related background tasks with the same task group id and policy `wait-all`
- **AND** all expected tasks reach a terminal state
- **THEN** the observation runtime MUST create one grouped continuation for the task group
- **AND** the grouped continuation MUST include the terminal result references or diagnostics for the grouped tasks

#### Scenario: Missing group metadata is not inferred

- **WHEN** multiple background tasks complete without explicit shared task group metadata
- **THEN** the observation runtime MUST NOT infer a group by prompt text, timestamps, task type, output paths, or conversation proximity
- **AND** the tasks MUST be delivered as single-task continuations or fail with a visible diagnostic according to their individual delivery policy

#### Scenario: Continue-on-each requires explicit policy

- **WHEN** a batch owner wants the Agent to review results as each task completes
- **THEN** the owner MUST declare a `continue-on-each` delivery policy
- **AND** default batch delivery MUST remain `wait-all`

### Requirement: Subagent results use continuation summaries

The Agent runtime SHALL hand subagent completion back to the main Agent through a source-distinct internal continuation that contains structured summaries and artifact references, not raw sidechain transcript content.

#### Scenario: Subagent completion resumes main Agent

- **WHEN** a subagent completes and the main Agent needs to consume its result
- **THEN** the follow-up input MUST have source `subagent-result-continuation`
- **AND** the continuation MUST provide summary, status, issues, confidence, and artifact references available to the main Agent
- **AND** the main conversation transcript MUST NOT import the raw subagent sidechain transcript as user or assistant messages

#### Scenario: Failed subagent reports diagnostic summary

- **WHEN** a subagent fails before producing a complete result
- **THEN** the main Agent continuation MUST receive a structured failure summary or diagnostic reference
- **AND** the raw sidechain transcript MUST remain outside the main conversation transcript
