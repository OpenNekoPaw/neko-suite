## ADDED Requirements

### Requirement: Timeline text operations have explicit semantics
The Agent Timeline protocol SHALL represent assistant text and thinking updates with explicit `append`, `replace`, `snapshot`, and completion semantics. Consumers MUST NOT infer operation semantics from string prefixes, payload size, prior content, or legacy message shape.

#### Scenario: Append operation
- **WHEN** the Extension delivers an append operation containing `abc` to an item whose current source is `a`
- **THEN** the Webview source becomes `aabc` regardless of whether the delta starts with the existing source

#### Scenario: Replacement operation
- **WHEN** the Extension delivers an explicit replacement for an active item
- **THEN** the Webview replaces that item's source and starts the replacement revision without applying append heuristics

### Requirement: Timeline delivery is revisioned and ordered
Each active turn SHALL have a monotonically increasing delivery revision and each mutable item SHALL have a monotonically increasing item revision. The Webview MUST apply valid ordered revisions exactly once, reject stale/duplicate mutations, and report gaps or identity mismatches explicitly.

#### Scenario: Duplicate batch
- **WHEN** the Webview receives a batch revision it already applied
- **THEN** it does not append the content again and records a duplicate-delivery diagnostic

#### Scenario: Revision gap
- **WHEN** the Webview receives revision 12 after revision 10 without revision 11
- **THEN** it stops applying dependent mutations and requests an explicit authoritative snapshot or reports that resynchronization is unavailable

### Requirement: One turn-scoped channel owns accumulation and flush boundaries
The Extension SHALL create one mutable stream channel per active turn and reuse it for that turn's provider updates. The channel MUST be isolated by conversation, turn, message, and Webview endpoint generation and MUST be disposed after terminal delivery or cancellation.

#### Scenario: Tool boundary flush
- **WHEN** pending assistant text is followed by a tool call
- **THEN** the channel flushes the text batch before delivering the tool-call event so visible order matches semantic order

#### Scenario: Webview generation changes
- **WHEN** the Webview is disposed and recreated while a turn remains active
- **THEN** the old endpoint generation receives no new messages and the new endpoint can request an authoritative active-turn snapshot

### Requirement: High-frequency updates are coalesced before Webview IPC
Append-compatible text/thinking updates and latest-value progress updates SHALL be coalesced within a bounded delivery window. Tool calls, tool results, errors, replacements, confirmations, cancellation, and completion MUST force an ordered flush and MUST NOT be delayed behind an unbounded token queue.

#### Scenario: Burst of text chunks
- **WHEN** many text chunks for the same item arrive inside one delivery window
- **THEN** the Extension sends one ordered append operation containing their concatenated source

#### Scenario: Error after pending text
- **WHEN** an error follows buffered text
- **THEN** buffered text is delivered first and the error is delivered immediately afterward

### Requirement: Pending delivery work is bounded without content loss
The delivery scheduler SHALL bound pending timers, entries, and bytes per active turn. Reaching a soft byte or latency budget MUST trigger an early flush; it MUST NOT drop assistant text. If the Webview endpoint cannot accept required terminal delivery, the system MUST return a typed diagnostic rather than reporting successful delivery.

#### Scenario: Large burst exceeds soft budget
- **WHEN** buffered append source exceeds the configured internal soft budget before the timer fires
- **THEN** the scheduler flushes early and preserves the complete ordered source

#### Scenario: Terminal postMessage fails
- **WHEN** the Webview is unavailable during required completion delivery
- **THEN** the turn records a terminal delivery diagnostic and retains an authoritative snapshot for explicit resynchronization

### Requirement: Webview state commits follow delivery batches
The Webview SHALL merge a valid Timeline delivery batch into conversation/timeline state with one logical store commit. It MUST NOT perform one full messages projection for each provider chunk contained in that batch.

#### Scenario: Batched append delivery
- **WHEN** one delivery batch contains multiple ordered item operations
- **THEN** the Webview validates, merges, and projects them through one conversation-state transaction

### Requirement: Assistant Markdown uses one stable normalized streaming session
For each assistant Markdown item, the Webview SHALL bind one message/item-scoped `MarkdownStreamingSession` from `@neko/markdown`, append coalesced source to that same session, and finalize that session on completion. Historical content SHALL enter the same canonical path as an immediately finalized session. No direct `react-markdown`, final-only parser, or raw-source success fallback may process assistant Markdown.

#### Scenario: Streaming table finalization
- **WHEN** a GFM table grows over multiple delivered batches and then completes
- **THEN** the same Markdown session advances through monotonic revisions and finalizes with exact source and stable normalized identity

#### Scenario: Unknown normalized node
- **WHEN** the Webview adapter receives an unsupported normalized contract variant
- **THEN** rendering fails visibly with a diagnostic and does not invoke a legacy parser

### Requirement: Render commits are frame-coalesced and terminally complete
The Webview SHALL coalesce multiple valid host deliveries received before the next render opportunity and SHALL not commit more than one streaming render revision per animation frame for the same item. Completion, replacement, error, conversation switch, and disposal MUST cancel or synchronously flush the applicable pending render work.

#### Scenario: Host delivery burst
- **WHEN** multiple append batches arrive before one animation frame
- **THEN** the Webview presents their combined source in one streaming render revision

#### Scenario: Completion before scheduled frame
- **WHEN** completion arrives while a streaming render is scheduled
- **THEN** the Webview flushes the pending source and renders the finalized document without losing the last delta

### Requirement: Active-turn resynchronization is explicit
The Extension SHALL be able to produce an authoritative snapshot for an active turn from its turn accumulator. Webview initialization or revision-gap recovery MUST use an explicit snapshot request/response tied to conversation, turn, message, endpoint generation, and source revision; missing or expired turns MUST return a typed diagnostic.

#### Scenario: Webview reload during generation
- **WHEN** the Webview reloads while the Agent continues streaming
- **THEN** it requests and applies an authoritative active-turn snapshot before accepting later append revisions

#### Scenario: Expired turn snapshot request
- **WHEN** the Webview requests a snapshot for a turn no longer active and no final durable message is available
- **THEN** the Extension returns an explicit unavailable diagnostic rather than an empty successful conversation

### Requirement: VS Code runtime acceptance proves path and performance behavior
The change SHALL include an Extension Development Host replay that sends a table-heavy answer through the real Extension `webview.postMessage` boundary, asserts canonical Timeline/normalized-Markdown paths, poisons removed legacy paths, and observes Webview lifecycle and final content.

#### Scenario: Reported workload replay
- **WHEN** the 5,057-character table-heavy fixture is replayed through approximately 4,000 provider chunks
- **THEN** the Webview remains alive, retains the active conversation, renders exact final content, and shows bounded delivery/render counts rather than per-chunk full snapshots
