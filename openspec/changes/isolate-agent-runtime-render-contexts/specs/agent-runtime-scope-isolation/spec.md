## ADDED Requirements

### Requirement: Each conversation owns an independent mutable Agent runtime
The Agent system SHALL create or restore one mutable runtime context per `conversationId`. Session state, conversation configuration, active turns, queues, cancellation, child runs, recovery metadata, and authoritative render projection MUST belong to that context and MUST NOT be inferred from an active Tab or another conversation.

#### Scenario: Concurrent conversations run independently
- **WHEN** conversations A and B both have active Agent turns
- **THEN** events, cancellation, queue changes, configuration, projection updates, and persistence for A MUST mutate only A
- **AND** B MUST continue without being locked, cancelled, rebound, or reconfigured

#### Scenario: Closing a Tab does not cancel its conversation
- **WHEN** the last visible Tab for conversation A closes while A has a background or recoverable run
- **THEN** A's conversation runtime MUST remain owned by A until its run and required persistence reach a terminal lifecycle
- **AND** reopening A MUST restore from A's runtime or persisted state rather than create state owned by the new Tab

### Requirement: Shared services cannot own conversation-mutable state
Provider catalogs, tool definitions, executor implementations, logging infrastructure, host adapters, and resource concurrency schedulers MAY be shared, but they MUST NOT retain mutable state whose meaning depends on the current conversation without an explicit conversation scope.

#### Scenario: Shared global concurrency limit
- **WHEN** Tasks from conversations A and B compete for a shared media executor limit
- **THEN** the global scheduler MAY order or queue both Tasks
- **AND** each queue entry, cancellation controller, event, result, and recovery record MUST retain its complete conversation/run owner

### Requirement: Agent, SubAgent, and Task controls use complete run scope
Every session-scoped run lookup, cancellation, event, result observation, persistence, and recovery operation SHALL require a scope containing `conversationId`, `runId`, and the applicable parent/child identity. A bare `taskId`, `subAgentId`, or `parentId` MUST NOT authorize mutation across the runtime boundary.

#### Scenario: Same child ID in different conversations
- **WHEN** conversations A and B both contain a child run whose local ID is `worker-1`
- **THEN** both runs MUST coexist independently
- **AND** cancelling A's scoped child MUST NOT inspect, cancel, or emit terminal state for B's child

#### Scenario: Owner mismatch fails visibly
- **WHEN** a caller supplies conversation A with a task or SubAgent scope owned by conversation B
- **THEN** the operation MUST fail with an owner-mismatch diagnostic
- **AND** neither run may be mutated

### Requirement: Cancellation follows the scoped run tree
Cancellation SHALL propagate only from a conversation or parent run to descendants owned by that same scope. Disposing one conversation MUST NOT invoke global child cancellation or clear another conversation's run registry.

#### Scenario: Cancel parent Agent run
- **WHEN** Agent run A1 is cancelled in conversation A
- **THEN** SubAgents and Tasks whose parent scope is A1 MUST be cancelled or allowed to complete according to their explicit detached policy
- **AND** runs under conversation B or another parent run in A MUST remain unchanged

### Requirement: Runtime restoration validates ownership
Persisted child-run and recovery records SHALL restore only when their complete owner identity is present and matches the target conversation/run. Ambiguous records MUST fail closed with a diagnostic and MUST NOT be assigned to the active conversation.

#### Scenario: Legacy task record lacks conversation owner
- **WHEN** startup encounters a recoverable task record without an unambiguous `conversationId` and `runId`
- **THEN** the task MUST NOT be attached to the foreground or most recent conversation
- **AND** the system MUST expose a migration or recovery diagnostic without deleting valuable external task information
