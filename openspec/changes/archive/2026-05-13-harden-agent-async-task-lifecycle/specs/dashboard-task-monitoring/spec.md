## ADDED Requirements

### Requirement: Agent dashboard source uses shared task projection
The agent dashboard task source SHALL consume the same agent task projection source used by Chat task delivery. Chat replay and Dashboard snapshots MUST NOT maintain separate task-reading models for agent async tasks.

#### Scenario: Chat and Dashboard share task projection
- **WHEN** an agent async task changes status, progress, outputs, or lifecycle metadata
- **THEN** Chat task delivery and Dashboard task monitoring observe the change through the same projection source

#### Scenario: Dashboard snapshot matches replay projection
- **WHEN** a terminal agent task is replayed to a rebuilt Chat Webview
- **THEN** the Dashboard snapshot for the same source task id contains consistent status, progress, actions, and output refs

### Requirement: Projection source remains read-only
The shared agent task projection source SHALL only map, filter, sort, and fan out task projection DTOs. It MUST NOT cancel tasks, retry tasks, infer task cost phase, define interruption policy defaults, or write task/recovery storage.

#### Scenario: Projection maps task to dashboard row
- **WHEN** Dashboard requests an agent task snapshot
- **THEN** the projection source returns DTO state without mutating the underlying task

#### Scenario: Action still delegates to owning source
- **WHEN** the user invokes cancel or retry from Dashboard
- **THEN** the owning dashboard source resolves the task ref and delegates the action to the injected task/media port rather than to the projection source

### Requirement: Background detached tasks remain visible and cancellable
Agent tasks that continue after Agent session interruption SHALL remain visible in Dashboard task monitoring while they are queued, running, external-waiting, or finalizing. If the owning source can cancel them, their Dashboard task DTO MUST include a cancel action.

#### Scenario: Detached external wait task appears in Dashboard
- **WHEN** an Agent conversation is stopped while an external-wait task continues in the background
- **THEN** Dashboard task monitoring still displays the task with its current status and output refs when available

#### Scenario: Detached task can be cancelled separately
- **WHEN** a detached background task exposes a cancel action
- **THEN** invoking Dashboard cancel calls the owning source cancellation path for that task without cancelling the whole Agent conversation
