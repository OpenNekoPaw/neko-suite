## ADDED Requirements

### Requirement: Running-turn follow-ups remain available
The Agent TUI SHALL accept queue-compatible user text while an Agent turn is running and SHALL represent it as a pending next-turn message rather than current-turn steering.

#### Scenario: Enter queues text while running
- **WHEN** the Agent is running and the user submits non-empty queue-compatible text with Enter
- **THEN** the runtime SHALL accept an item with stable identity and ordered queue position
- **AND** the TUI SHALL state that the item will run after the active turn rather than claiming the active model turn has observed it.

#### Scenario: Unsupported payload fails visibly
- **WHEN** the Agent is running and the user submits an unsupported slash command, Skill invocation, attachment payload, or execution-metadata prompt
- **THEN** the TUI SHALL reject it with a visible not-queueable diagnostic
- **AND** it SHALL NOT create a pending item or transcript message that claims success.

### Requirement: Pending messages render above the composer
The Agent TUI SHALL render pending queue state in a compact composer-adjacent panel and SHALL NOT render generic queue acceptance as ordinary transcript history.

#### Scenario: Queue panel shows ordered content
- **WHEN** one or more items are pending
- **THEN** the panel above the composer SHALL show pending count, ordered content previews, and source-aware state
- **AND** stable runtime ids SHALL remain available for commands and diagnostics without being the primary user-facing label.

#### Scenario: Empty queue hides the panel
- **WHEN** the authoritative queue snapshot contains no items
- **THEN** the queue panel SHALL not consume terminal rows
- **AND** the composer SHALL retain keyboard focus.

#### Scenario: Queue acceptance does not pollute transcript
- **WHEN** a user message is accepted into the pending queue
- **THEN** the TUI SHALL update the queue panel and status projection
- **AND** it SHALL NOT append `Queued message: <id>` or an equivalent generic queue system note to the transcript.

#### Scenario: Item enters transcript only when executed
- **WHEN** a queued user item is released into a new Agent turn
- **THEN** it SHALL enter conversation history through the normal executing user-turn path
- **AND** it SHALL not be represented as already sent before release.

### Requirement: Queue controls match execution semantics
The Agent TUI SHALL expose promote, edit, cancel, and inspect operations whose labels and results match the runtime queue contract.

#### Scenario: Send next does not interrupt
- **WHEN** the user promotes a pending user item while an Agent turn is running
- **THEN** the active turn SHALL continue without interruption
- **AND** the item SHALL become the next eligible user follow-up according to the documented queue priority policy.

#### Scenario: Send-now alias fails visibly
- **WHEN** the user invokes `/queue send-now <id>`
- **THEN** the command SHALL NOT report successful immediate sending
- **AND** it SHALL return a migration diagnostic directing the user to `/queue send-next <id>` or `/queue promote <id>`.

#### Scenario: Edit preserves user authorship boundary
- **WHEN** the user edits a queued user item
- **THEN** the runtime SHALL update or remove-and-restore that item through the queue contract
- **AND** internal continuation items SHALL reject user-message edit operations visibly.

#### Scenario: Cancel removes only the selected item
- **WHEN** the user cancels an eligible queued user item
- **THEN** the runtime SHALL remove that item and publish a new snapshot
- **AND** the active Agent turn and other queued items SHALL remain unaffected.

### Requirement: Queue ordering is explicit
The Agent runtime SHALL be the authority for queue release order, and the TUI SHALL not promise ordering that conflicts with continuation priority.

#### Scenario: Continuation priority is visible
- **WHEN** internal continuations and user follow-ups are pending together
- **THEN** the snapshot projection SHALL distinguish their sources and priority class
- **AND** the TUI SHALL describe a promoted user item as the next eligible user message unless the runtime contract provides global priority.

#### Scenario: Release order matches display semantics
- **WHEN** the active turn finishes and pending items drain
- **THEN** the released item SHALL match the documented eligibility policy
- **AND** tests SHALL assert the exact runtime item id and source released next.

### Requirement: Active-turn cancellation has deterministic queue behavior
Cancelling the active Agent turn SHALL preserve accepted pending messages, pause automatic queue drain, and expose the remaining queue state visibly.

#### Scenario: Escape preserves and pauses queue
- **WHEN** the user presses Escape while an Agent turn and pending queue both exist
- **THEN** only the active turn SHALL be cancelled
- **AND** pending messages SHALL remain visible without automatically starting until an explicit resume or send-next action occurs.

### Requirement: Agent runtime owns queue execution
The shared Agent runtime SHALL own queue identity, mutation, snapshot version, lifecycle, and release into turns; TUI SHALL own only terminal input intent and projection.

#### Scenario: Canonical runtime path handles queue operation
- **WHEN** TUI enqueues, promotes, edits, cancels, snapshots, or releases a pending item
- **THEN** the operation SHALL pass through the runtime-owned queue port for the explicit conversation
- **AND** path-level tests SHALL prove the package-local legacy queue implementation did not participate.

#### Scenario: Legacy TUI queue path cannot return success
- **WHEN** a new-path TUI request would reach the removed package-local queue or manual drain fallback
- **THEN** the request SHALL fail visibly in tests or diagnostics
- **AND** it SHALL NOT return an apparently successful queue result.

### Requirement: Pending queue state is transient
Pending Agent queue items SHALL remain process-local session state and SHALL not be persisted as durable conversation history before execution.

#### Scenario: Session persistence excludes pending queue items
- **WHEN** conversation history is persisted while pending items exist
- **THEN** pending items SHALL not be serialized as executed user or system messages
- **AND** process restart may discard the transient queue without project-data migration.
