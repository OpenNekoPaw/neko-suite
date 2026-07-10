## MODIFIED Requirements

### Requirement: Idle and background task observation

Debug automation SHALL expose split idle state for Agent turn completion, background tasks, media delivery, tracked task result observation, and pending internal continuations.

#### Scenario: Wait for async media task

- **WHEN** a turn creates a tracked background media or task result observation
- **THEN** `session.waitForIdle` MUST wait until `turnIdle`, `backgroundTasksIdle`, `mediaDeliveryIdle`, `taskResultObservationIdle`, and `continuationQueueIdle` are all idle or have a typed terminal state
- **AND** timeout results MUST include enough diagnostic facts for an external eval script to classify infrastructure fail versus case fail

#### Scenario: Assistant text finishes before background work

- **WHEN** assistant text streaming completes before media delivery, task result observation, or pending internal continuations complete
- **THEN** `session.waitForIdle` MUST NOT report the session as fully idle until the remaining tracked idle states are idle, failed, cancelled, discarded, or timed out

#### Scenario: Continuation waits behind running turn

- **WHEN** a task-result or subagent-result continuation is queued while another Agent turn is running
- **THEN** `session.waitForIdle` MUST include the pending continuation in idle diagnostics
- **AND** it MUST NOT return fully idle until the continuation has executed, failed, been cancelled, been discarded, or timed out

### Requirement: Session facts

Debug automation SHALL expose machine-readable session facts for validation without requiring terminal output parsing.

#### Scenario: Read validation facts

- **WHEN** an automation client calls `session.facts`
- **THEN** the response MUST include the session id, conversation id, selected target model identity, turn summaries, assistant outputs, Skill activation records, task summaries, task result observations, continuation events, queue item sources, artifact summaries, runtime errors, and split idle state available to the TUI runtime
- **AND** the client MUST be able to request full conversation history for the session
- **AND** secrets such as API keys MUST be redacted

#### Scenario: Internal continuation is exposed as facts, not user message

- **WHEN** a task-result or subagent-result continuation executes
- **THEN** `session.facts` MUST expose its source, display kind, parent identifiers, task id, task group id, subagent id, observation id, and execution status when available
- **AND** full conversation history MUST NOT contain a user-authored message for the internal continuation prompt

#### Scenario: Eval validates continuation path without terminal text parsing

- **WHEN** an eval script validates an async closed-loop workflow
- **THEN** it MUST be able to assert continuation source/display facts from `session.facts`
- **AND** it MUST NOT need to parse rendered TUI terminal text to determine whether the canonical continuation path was used
