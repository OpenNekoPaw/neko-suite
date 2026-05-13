## ADDED Requirements

### Requirement: Agent tasks outlive Webview lifecycle
The system SHALL run agent async tasks in the Extension Host lifecycle rather than the Chat Webview lifecycle. Webview hide, dispose, or rebuild MUST NOT cancel running agent async tasks unless the user explicitly invokes a task cancellation action.

#### Scenario: Webview hidden during task execution
- **WHEN** a Chat Webview is hidden while an agent async task is running
- **THEN** the task continues running in the Extension Host and remains queryable through the task manager

#### Scenario: Webview disposed during task execution
- **WHEN** a Chat Webview is disposed while an agent async task is running
- **THEN** the task continues running in the Extension Host and can be projected again when a Webview reconnects

### Requirement: Shutdown snapshots recoverable tasks with bounded async disposal
The task manager SHALL provide an async disposal path that aborts runtime executors, snapshots pending and running tasks into recoverable persisted state, and flushes task and recovery storage with a bounded timeout. The Extension `deactivate()` function MUST await this bounded disposal path without requiring `ServiceCollection.dispose()` to become asynchronous.

#### Scenario: Running task during deactivate
- **WHEN** Extension `deactivate()` runs while a task is running
- **THEN** the task manager aborts the task execution context, persists a recoverable pending snapshot, and returns before the shutdown timeout

#### Scenario: Executor ignores abort during deactivate
- **WHEN** a running executor does not observe the abort signal before the shutdown timeout
- **THEN** shutdown still returns after the timeout and the persisted task snapshot remains recoverable on the next activation

#### Scenario: ServiceCollection remains synchronous
- **WHEN** VSCode disposes registered `Disposable` instances through `context.subscriptions`
- **THEN** `ServiceCollection.dispose()` remains a synchronous fallback and does not become the required async shutdown path

### Requirement: Executor cancellation is runtime-only
The task executor contract SHALL provide a runtime-only cancellation context, such as an `AbortSignal`, for HTTP calls, polling waits, and local finalization waits. Runtime cancellation handles MUST NOT be serialized in `TaskInput`, `Task`, `SerializableTask`, or `TaskRecoveryInfo`.

#### Scenario: HTTP task is cancelled
- **WHEN** a running task is cancelled or aborted during shutdown
- **THEN** the executor receives a cancellation signal that can stop in-flight HTTP or polling work

#### Scenario: Task is persisted after cancellation signal
- **WHEN** a task snapshot is saved for recovery
- **THEN** the saved payload contains serializable lifecycle state and does not contain `AbortSignal` or any process-local cancellation handle

### Requirement: External recovery info is persisted
The VSCode extension bootstrap SHALL inject a persistent `ITaskRecoveryStorage` implementation for agent tasks. The recovery storage MUST persist `TaskRecoveryInfo` records containing provider id, external task id, internal task id, task type, payload, and timestamps across Extension Host restart.

#### Scenario: External task id survives restart
- **WHEN** a provider task enters external wait and saves recovery info
- **THEN** the same `externalTaskId` and provider id are available after Extension Host restart

#### Scenario: Recovery storage is corrupt
- **WHEN** persisted recovery storage cannot be parsed or loaded
- **THEN** the task manager degrades to empty recovery info without blocking persisted task state recovery

### Requirement: Restart resumes recoverable external tasks
On activation, the task manager SHALL load persisted tasks and recovery info, convert previously running tasks to a recoverable pending state, and resume recoverable external tasks by polling the saved provider `externalTaskId` when the task's recovery policy allows polling.

#### Scenario: Resume polling after restart
- **WHEN** a task was submitted to an external provider, entered `external-wait`, and the Extension Host restarted
- **THEN** the resumed task polls the original provider `externalTaskId` rather than submitting a duplicate provider task

#### Scenario: Recovery info missing for pending task
- **WHEN** a pending or running task is restored without matching external recovery info
- **THEN** the recovery path follows the task recovery policy such as retrying the executor, keeping a snapshot only, or marking recovery unavailable

### Requirement: Task lifecycle metadata is shared and serializable
The shared task contract SHALL define serializable lifecycle metadata for agent async tasks. The metadata MUST include conversation ownership, run mode, cost phase, interruption policy, and recovery policy, and MUST be usable by agent runtime, platform executors, extension bridges, and Dashboard projections without importing VSCode or React types.

#### Scenario: Platform reports cost phase
- **WHEN** a platform executor reports that a task entered `external-wait`
- **THEN** it can use shared task lifecycle types without importing `@neko/agent` or extension modules

#### Scenario: Persisted task lacks lifecycle metadata
- **WHEN** an older persisted task is loaded without lifecycle metadata
- **THEN** the task manager applies conservative defaults and continues loading the task

### Requirement: Cost phase transitions are executor-owned
Task cost phase transitions SHALL be reported by the runtime component closest to the real cost boundary. Executors and provider adapters MUST report token-active, external-wait, and local-finalize transitions; Dashboard and Chat Webview MUST NOT infer or mutate cost phase.

#### Scenario: Provider returns external task id
- **WHEN** a provider adapter receives an external provider task id
- **THEN** it saves recovery info and reports the task cost phase as `external-wait`

#### Scenario: Provider output enters local finalize
- **WHEN** a provider result is ready and local download, transcode, asset indexing, or backfill begins
- **THEN** the executor reports the task cost phase as `local-finalize`

#### Scenario: Task reaches terminal status
- **WHEN** a task reaches completed, failed, or cancelled
- **THEN** the task cost phase becomes `idle`

### Requirement: Agent interruption policy is explicit
Agent session interruption SHALL use task lifecycle metadata to decide whether related async tasks are cancelled or detached. Foreground token-active tasks with `cancel-with-agent` MUST be cancelled by default; `external-wait` and `local-finalize` tasks with detach or finish-critical-step policy MUST continue by default and remain visible and cancellable.

#### Scenario: Stop cancels foreground token task
- **WHEN** the user stops an Agent conversation with a foreground token-active task whose interrupt policy is `cancel-with-agent`
- **THEN** the task cancellation path is invoked for that task

#### Scenario: Stop does not cancel external wait task
- **WHEN** the user stops an Agent conversation with an external-wait task whose interrupt policy is `detach-and-continue`
- **THEN** the task remains running or polling in the background and remains visible in task surfaces

#### Scenario: Local finalize continues after stop
- **WHEN** the user stops an Agent conversation while a task is writing outputs or backfilling results under `finish-critical-step`
- **THEN** the local finalize work is allowed to complete unless the user explicitly cancels that task

### Requirement: Webview reconnect replays undelivered task results
The Extension bridge SHALL replay terminal or recently updated task projections to a reconnecting Chat Webview using a persisted per-conversation delivery cursor. In-memory last-visible timestamps MUST NOT be the only replay cursor.

#### Scenario: Task completes while Webview is closed
- **WHEN** a task reaches a terminal state while its Chat Webview is disposed
- **THEN** the next Webview connection receives the terminal task result if it is newer than the persisted delivery cursor

#### Scenario: Extension restarts before Webview reconnect
- **WHEN** the Extension Host restarts after a task result was persisted but before a Webview reconnects
- **THEN** the persisted cursor and task state are sufficient to replay the undelivered task result

#### Scenario: Same millisecond terminal tasks
- **WHEN** multiple tasks complete with the same timestamp
- **THEN** the replay cursor distinguishes them by a monotonic sequence or a composite cursor such as `(updatedAt, taskId)`

### Requirement: Task completion waiters are event-driven
The task manager SHALL resolve task completion waiters from task state transitions rather than by polling on a fixed timer. Multiple waiters for the same task MUST resolve or reject exactly once when the task reaches a terminal status or when their timeout expires.

#### Scenario: Multiple waiters resolve
- **WHEN** multiple callers wait for the same running task
- **THEN** all waiters resolve when that task reaches a terminal state without a 100ms polling loop

#### Scenario: Waiter times out
- **WHEN** a completion waiter reaches its timeout before the task becomes terminal
- **THEN** the waiter rejects and is removed from the task manager waiter registry

### Requirement: Full external wait restart path is covered
The system SHALL provide an integration regression for the complete external wait recovery path spanning task submission, provider recovery storage, Extension Host shutdown, restart, Webview replay, and Dashboard visibility.

#### Scenario: External task resumes and result is visible
- **WHEN** a task is submitted, enters `external-wait`, the Extension Host deactivates, the Extension Host reactivates, recovery resumes polling the same external provider task, and the Chat Webview rebuilds
- **THEN** Chat delivery and Dashboard task monitoring both show the recovered result and the provider task was not submitted more than once
