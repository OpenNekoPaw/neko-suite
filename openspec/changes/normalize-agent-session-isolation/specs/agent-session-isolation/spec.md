## ADDED Requirements

### Requirement: Agent session identity is explicit and layered

The system SHALL treat `tabId`, `conversationId`, `turnId`, and `runId` as distinct identities. `tabId` SHALL identify a Webview view binding, `conversationId` SHALL identify the complete Agent session owner, `turnId` SHALL identify a chat turn inside that session, and `runId` SHALL identify leased or long-lived work only when that lifecycle is distinct from the chat turn.

#### Scenario: Tab binds to a conversation

- **WHEN** Webview opens or activates a chat tab
- **THEN** the tab MUST bind to exactly one `conversationId`
- **AND** the tab MUST NOT become the owner of runtime state, durable history, terminal/process handles, task observers, or Skill lifecycle records

#### Scenario: Chat turn owns model and tool requests

- **WHEN** an Agent chat turn starts
- **THEN** the system MUST associate the turn with a `conversationId` and `turnId`
- **AND** model calls and ordinary tool calls inside the turn MUST be distinguishable by request ids such as `llmRequestId` or `toolRequestId`
- **AND** the system MUST NOT require a duplicate `runId` when the run identity would be identical to the `turnId`

#### Scenario: Long-lived work owns a run

- **WHEN** a workflow, artifact/task generation, media task, terminal/process command, or background task can outlive the initiating UI action or require cancellation
- **THEN** the system MUST associate the work with a `conversationId` and a `runId`
- **AND** it SHOULD include the initiating `turnId` when the work was created by a chat turn

#### Scenario: Missing session identity is rejected

- **WHEN** a session-scoped operation or event is missing its required `conversationId`
- **THEN** the system MUST reject it with a typed diagnostic or test-visible failure
- **AND** it MUST NOT apply the operation to the current active conversation as a fallback

### Requirement: New conversations create complete independent sessions

The system SHALL create an independent Agent session for every new conversation. Session state SHALL include all conversation-owned prompts, tools, Skills, context, transcript, streaming, queues, logs, tasks, terminal/process ownership, and recoverable UI state.

#### Scenario: New tab does not inherit previous session state

- **WHEN** the user creates a new chat tab while another conversation has active messages, Skills, context chips, queue items, activation progress, or running tasks
- **THEN** the new conversation session MUST start without inheriting those state entries
- **AND** only explicitly shared global configuration such as available provider catalog or user settings may be reused

#### Scenario: Prompt and Skill state are session-bound

- **WHEN** conversation A has an active prompt mode or Skill lifecycle projection
- **AND** conversation B is created or activated
- **THEN** conversation B MUST resolve prompt mode and Skill lifecycle from B's own session state
- **AND** B MUST NOT show or execute A's active Skill records, prompt sections, tool policy, or activation progress

#### Scenario: Context and queue state are session-bound

- **WHEN** conversation A has context chips, token count, compression state, queued messages, or an active stream timeline
- **AND** conversation B becomes visible
- **THEN** B MUST display only B's context, token, compression, queue, and streaming state
- **AND** A's queued messages or streaming flags MUST NOT remain visible in B

### Requirement: Webview visible state follows the active tab conversation

The Webview SHALL derive visible chat state and mutation targets from the active tab's `conversationId`. Global active conversation state MAY exist as host synchronization metadata, but it SHALL NOT be the default authority for visible tab operations.

#### Scenario: Active tab and active conversation disagree

- **WHEN** the active tab is bound to conversation B
- **AND** host active conversation state still reports conversation A during a switch or replay
- **THEN** Webview mutation actions MUST be disabled or rejected as switching/mismatched
- **AND** they MUST NOT send, clear history, clear Skill, approve plan steps, compress context, or operate queues for conversation A

#### Scenario: Send targets visible tab session

- **WHEN** the user sends a chat message from a visible tab bound to conversation B
- **THEN** the Webview-to-Extension message MUST carry conversation B's `conversationId`
- **AND** the optimistic user message and queue state MUST be written to B's session state

#### Scenario: Tabless entry creates then binds

- **WHEN** the user sends from the entry page without an existing conversation
- **THEN** the system MAY create a new conversation
- **AND** the pending send, initial prompt menu, initial input, and context payloads MUST bind to the newly created `conversationId` before any session-scoped operation is dispatched

### Requirement: Host snapshots cannot pollute other sessions

The Webview SHALL apply Extension Host conversation snapshots only to the session identified by the payload. Snapshot arrival order SHALL NOT determine the visible tab's session.

#### Scenario: Stale active conversation response arrives late

- **WHEN** the visible tab is conversation C
- **AND** a late `activeConversation` snapshot for conversation B arrives
- **THEN** Webview MAY refresh B's background session cache
- **AND** it MUST NOT change the active tab, visible messages, visible streaming state, visible Skill projection, or operation target away from C

#### Scenario: Foreground activation accepts only expected session

- **WHEN** Webview is waiting for a foreground activation of conversation C
- **AND** an `activeConversation` snapshot for another conversation arrives first
- **THEN** Webview MUST keep the foreground activation pending
- **AND** it MUST NOT display the other conversation as the foreground session

#### Scenario: Host snapshot and local cache conflict

- **WHEN** a host snapshot for conversation B includes authoritative persisted messages
- **AND** Webview has a non-empty local cache for B
- **THEN** the projection MUST use an explicit freshness/conflict rule
- **AND** it MUST NOT blindly prefer the local cache if doing so would display stale transcript, stale Skill lifecycle messages, or stale queue state

### Requirement: Session-scoped protocols require explicit routing identity

Webview-to-Extension, Extension-to-Webview, and Agent runtime messages that mutate or display session state SHALL carry explicit session identity. Protocol parsers and handlers SHALL fail visibly for missing or ambiguous identity.

#### Scenario: Webview mutation message is parsed

- **WHEN** Extension Host receives a Webview message that mutates or controls chat session state
- **THEN** the parser MUST require a non-empty `conversationId`
- **AND** invalid messages MUST be rejected before reaching domain handlers

#### Scenario: Extension event updates Webview state

- **WHEN** Extension Host posts a message that updates messages, streaming, queues, context, Skills, activation progress, tasks, agent state, or logs for a session
- **THEN** the message MUST include the owning `conversationId`
- **AND** Webview handlers MUST route the update by that identity instead of by the current active conversation

#### Scenario: Runtime event identifies turn or run ownership

- **WHEN** Agent runtime emits an event for a turn, tool call, terminal/process handle, background task, or model call that can outlive the initiating UI action
- **THEN** the event MUST include `conversationId`
- **AND** it MUST include `turnId` for turn-scoped work or `runId` for leased/long-lived work so stale events can be detected

### Requirement: Concurrent work is isolated by conversation and turn/run

The system SHALL support multiple open tabs, repeated new conversation creation, multiple Agent runs, and multiple terminal/process-backed tasks without cross-session mutation.

#### Scenario: Two conversations run concurrently

- **WHEN** conversations A and B both have running Agent work
- **THEN** stream text, tool calls, queue snapshots, task updates, Skill lifecycle progress, and completion events for A MUST update only A
- **AND** equivalent events for B MUST update only B

#### Scenario: Terminal or process output is leased

- **WHEN** a terminal/process handle is created for conversation A and run X
- **THEN** all output, exit, cancellation, and error events from that handle MUST carry the lease identity `{ conversationId: A, runId: X }`
- **AND** handlers MUST reject or mark stale any event whose lease does not match an active run

#### Scenario: Cancellation targets one run

- **WHEN** the user cancels a run in conversation A
- **THEN** only A's targeted active run or queue item MUST be cancelled
- **AND** running work in conversation B MUST continue unless B is explicitly cancelled

### Requirement: Logs are partitioned by session and turn/run

Agent logs for model calls, tools, Skills, tasks, terminal/process events, Webview routing, and runtime diagnostics SHALL include enough identity to distinguish sessions, turns, and runs. Sequence counters used to analyze a session SHALL be local to the log partition.

#### Scenario: Model call log is written

- **WHEN** Agent records a model call for conversation A and turn T
- **THEN** the log entry MUST include `conversationId: A`
- **AND** it MUST include `turnId: T`
- **AND** it MUST include `llmRequestId`
- **AND** it MUST NOT include a duplicate `runId` when `runId` would equal `turnId`
- **AND** its session sequence MUST be scoped to the relevant conversation/turn partition

#### Scenario: Workflow log is written

- **WHEN** Agent records durable workflow, artifact/task, terminal/process, media, or background work for conversation A and run X
- **THEN** the log entry MUST include `conversationId: A`
- **AND** it MUST include `runId: X`
- **AND** it SHOULD include the initiating `turnId` when one exists
- **AND** its session sequence MUST be scoped to the relevant conversation/run partition

#### Scenario: Global sequence exists

- **WHEN** a global log sequence is emitted for diagnostic ordering
- **THEN** it MAY be included as supplemental metadata
- **AND** it MUST NOT be the only way to determine session ownership

#### Scenario: Active session log is written

- **WHEN** Agent writes an active JSONL log entry for conversation A
- **THEN** the write MUST target a physical path scoped to conversation A
- **AND** a different conversation B MUST write to a different physical JSONL file
- **AND** the file-local `seq` in B's log MUST NOT continue from A's log file

#### Scenario: Tab diagnostic is recorded

- **WHEN** a Webview tab action produces a diagnostic log
- **THEN** the log SHOULD include `tabId` when available
- **AND** it MUST still include `conversationId` for session-scoped actions

### Requirement: Session storage writes are partitioned and race-aware

Session-owned storage SHALL be written through an explicit ownership boundary. Per-conversation journals, shared indexes, rebuildable caches, task storage, and diagnostic logs SHALL NOT infer ownership from the current active conversation when the operation is scoped to another conversation, turn, or run.

#### Scenario: Conversation journal is written

- **WHEN** the Agent persists transcript or session events for conversation A
- **THEN** the write MUST target A's journal partition
- **AND** journal sequence numbers MUST be local to that journal/session writer
- **AND** recovery MUST use `conversationId` rather than the current active tab or active conversation

#### Scenario: Shared JSON cache is updated

- **WHEN** a shared JSON index or cache file contains entries for multiple conversations or runs
- **THEN** each entry MUST carry explicit partition identity such as `conversationId`, `runId`, or resource id
- **AND** the update MUST NOT overwrite another partition by reading or writing the current active conversation as a fallback
- **AND** stale or conflicting writes MUST be detected, rebuilt from authoritative data, or surfaced as diagnostics

#### Scenario: Multiple local writers target the same workspace state

- **WHEN** two VSCode windows, processes, or terminals can write the same workspace-global state, cache, or log file
- **THEN** the system MUST use a visible ownership guard, version/owner check, partition-safe append with writer identity, or typed stale-write diagnostic
- **AND** an advisory session lock alone MUST NOT be treated as a complete mutex

#### Scenario: Tab state is replayed

- **WHEN** Extension or Webview replays persisted tab state
- **THEN** tab state MUST be treated as UI view state only
- **AND** it MUST NOT implicitly switch runtime session ownership or overwrite foreground Webview state unless the expected `conversationId` matches the active tab activation

### Requirement: Legacy active-conversation fallback cannot mask isolation failures

The system SHALL remove, poison, or fail-close legacy paths that apply session-scoped operations to the current active conversation when the intended session identity is missing or mismatched.

#### Scenario: Legacy fallback is reached in tests

- **WHEN** focused isolation tests poison current-active fallback paths to throw
- **THEN** new tab, send, Skill, plan, queue, task, and log flows MUST still pass through explicit session routing
- **AND** the poisoned fallback MUST NOT produce a successful result

#### Scenario: Unknown conversation receives an event

- **WHEN** Webview or Extension receives a session-scoped event for an unknown, closed, or deleted conversation
- **THEN** the event MUST be rejected, ignored with a typed stale diagnostic, or routed to a deletion-safe cleanup path
- **AND** it MUST NOT be applied to any currently visible conversation

#### Scenario: Stale run event arrives after cleanup

- **WHEN** an event arrives for a run that has already completed, been cancelled, or been disposed
- **THEN** the handler MUST detect it as stale using `conversationId` and `runId`
- **AND** it MUST NOT mutate the visible session or resurrect completed UI state

### Requirement: Foreground Tab activation is a correlated transaction

An ordinary Agent Tab activation MUST carry a Webview-realm `activationId`, the complete next Tab state, and the expected Host Tab revision. The Host MUST compare-and-apply that revision before switching the active conversation and MUST echo the accepted activation identity and resulting revision on the projected active conversation.

#### Scenario: Rapid A to B to C switching

- **WHEN** activation B begins and activation C supersedes it before B's projected history completes
- **THEN** B's response MAY refresh B's background canonical snapshot
- **AND** B's response MUST NOT replace C's foreground projection
- **AND** only the response matching C's pending `activationId` MAY complete foreground activation

#### Scenario: Stale Tab state replay

- **WHEN** a `tabState` response has a revision older than the Webview's current optimistic or accepted revision
- **THEN** the Webview MUST reject it without changing open Tabs, active Tab, foreground conversation, Timeline ownership, or Markdown ownership

#### Scenario: Host revision conflict

- **WHEN** an activation or Tab persistence request names an expected revision different from the Host's current revision
- **THEN** the Host MUST reject the mutation visibly
- **AND** MUST return the authoritative current Tab state so the Webview can reconcile

### Requirement: Foreground projection distinguishes loading from empty

The Webview MUST represent an uncached conversation history as `loading` until an authoritative Host snapshot arrives. It MUST NOT project `messages: []` as if the conversation were confirmed empty during that interval.

### Requirement: Foreground activation flush is partition-scoped

A foreground Tab swap MUST flush pending Timeline delivery only for the previous foreground `conversationId`. It MUST NOT synchronously flush unrelated background conversations.

### Requirement: Session diagnostics remain session scoped

A diagnostic carrying `conversationId` MUST be stored and projected under that conversation. Switching Tabs MUST NOT display another conversation's diagnostic as a Webview-global error.
