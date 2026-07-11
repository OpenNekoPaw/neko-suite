## ADDED Requirements

### Requirement: Canonical per-conversation render snapshot

The Webview SHALL maintain one canonical in-memory render snapshot for each retained Agent conversation. The snapshot SHALL contain the conversation messages, streaming metadata, queue projection, active Timeline ownership when present, viewport intent, and a monotonically increasing conversation render revision.

#### Scenario: Background Timeline mutation advances only its owner

- **WHEN** a Timeline mutation is accepted for a retained background conversation
- **THEN** the Webview updates that conversation's canonical render snapshot and revision without replacing the foreground conversation's visible state

#### Scenario: Stale conversation revision is rejected

- **WHEN** a mutation attempts to commit a conversation render revision that is not newer than the current accepted revision where monotonic advancement is required
- **THEN** the Webview rejects the mutation with a visible diagnostic instead of applying or silently ignoring ambiguous ownership

### Requirement: Unified foreground activation transaction

Every normal UI Tab, character-role Tab, Extension `tabState`, and Extension `activeConversation` foreground activation SHALL use the same canonical activation transaction.

#### Scenario: Cached background conversation becomes foreground

- **WHEN** a retained background conversation with a synchronized or suspended active Timeline is selected
- **THEN** the Webview flushes relevant pending frames, validates the target snapshot, reconciles required renderer resources, commits cache/refs/visible React state, and only then publishes renderer notifications

#### Scenario: Activation source cannot bypass the canonical transaction

- **WHEN** any supported UI or Extension activation source selects a conversation
- **THEN** path-level evidence proves the canonical activation transaction was invoked and no direct legacy activation path returned success

#### Scenario: Unavailable Timeline is not revived

- **WHEN** a target conversation snapshot contains Timeline ownership marked unavailable
- **THEN** the Webview releases that ownership before foreground commit and does not reconstruct renderer resources for the unavailable Timeline

### Requirement: Timeline-derived Markdown resource reconciliation

Normalized Markdown parser sessions for active Timeline `assistant_text` and `thinking` items SHALL be derived from and reconcilable with the canonical Timeline snapshot. They SHALL NOT become an independent display authority.

#### Scenario: Missing Markdown session is rebuilt during activation

- **WHEN** a foreground activation restores a canonical Timeline item but its Markdown parser session was disposed
- **THEN** the Webview reconstructs the session from the item's identity, content, source generation, item revision, and status before the item is presented

#### Scenario: Stale Markdown session is replaced

- **WHEN** a Markdown session does not match the canonical Timeline source generation, item revision, source, or completion status
- **THEN** the Webview replaces it with the canonical snapshot and publishes one renderer notification after owner-state commit

#### Scenario: Missing resource owner fails visibly

- **WHEN** Timeline-owned Markdown items require reconciliation but the Markdown resource owner is unavailable
- **THEN** activation fails with a diagnostic and does not fall back to direct Markdown parsing or completed-history rendering

### Requirement: Background rendering isolation

A hidden conversation SHALL continue to ingest canonical Agent events without mounting or mutating the foreground conversation's DOM presentation.

#### Scenario: Background stream continues while another Tab is visible

- **WHEN** conversation A streams Timeline updates while conversation B is foreground
- **THEN** conversation A's snapshot, Timeline, queue, and status data advance while conversation B retains its messages, input focus, viewport, and visible streaming state

#### Scenario: Returning to a background-updated conversation

- **WHEN** the user returns to conversation A after it received background updates
- **THEN** the first foreground projection reflects A's latest canonical revision without replaying foreground-only handlers

### Requirement: Per-conversation viewport and auto-scroll intent

The Webview SHALL isolate follow-tail, detached-scroll, and stable viewport anchor intent by conversation. Background mutations SHALL NOT invoke foreground scrolling.

#### Scenario: Detached conversation remains detached after return

- **WHEN** the user scrolls upward in conversation A, switches to conversation B, and later returns to A
- **THEN** conversation A restores its detached viewport anchor instead of scrolling unconditionally to the bottom

#### Scenario: Background stream does not move foreground viewport

- **WHEN** a hidden conversation receives streaming updates
- **THEN** the foreground conversation's scroll position and follow-tail state remain unchanged

#### Scenario: Follow-tail applies only to its owning conversation

- **WHEN** a foreground conversation is in follow-tail mode and receives new streaming content
- **THEN** that conversation follows the tail, while no other conversation's viewport state is modified

### Requirement: Conversation-scoped input, queue, status, and elapsed-time projection

Composer availability, queue projection, running status, and elapsed-time baseline SHALL derive from the active conversation snapshot rather than a global running conversation flag.

#### Scenario: Active conversation accepts queued input while another turn runs

- **WHEN** the active conversation contract allows queued messages during an Agent run
- **THEN** its composer remains usable and submissions enter that conversation's queue regardless of work running in another conversation

#### Scenario: Tab switch immediately updates status projection

- **WHEN** the user switches from one conversation to another
- **THEN** status, queue count, thinking state, and elapsed-time baseline immediately reflect the target snapshot's latest revision

#### Scenario: Background status update does not overwrite foreground status

- **WHEN** a background conversation changes running or queue status
- **THEN** only its retained snapshot and optional Tab indicator update, while foreground status remains owned by the active conversation

### Requirement: Scoped lifecycle cleanup

The Webview SHALL distinguish conversation disposal, active-turn resource release, component detach, Webview realm teardown, and Webview hide/reveal.

#### Scenario: Disposing one conversation preserves another

- **WHEN** one retained conversation is permanently disposed
- **THEN** only that conversation's snapshot, scheduled frames, Markdown resources, subscriptions, and viewport intent are released

#### Scenario: Webview remount reconstructs derived resources

- **WHEN** component cleanup or React StrictMode remount clears derived renderer resources while canonical conversation snapshots remain recoverable
- **THEN** foreground activation reconstructs the resources from canonical ownership without reporting a successful fallback path

#### Scenario: Hidden Webview is not treated as disposed conversation

- **WHEN** VS Code hides and later reveals the Agent Webview
- **THEN** retained conversations remain eligible for canonical restoration and are not silently deleted by hide/reveal lifecycle events

#### Scenario: Mutation after permanent disposal is rejected

- **WHEN** a conversation-scoped mutation targets a permanently disposed conversation without a fresh authoritative host snapshot
- **THEN** the Webview rejects it with a conversation lifecycle diagnostic

### Requirement: Fail-visible ownership diagnostics

The Webview SHALL expose contract violations involving render ownership, identity, revisions, activation ordering, or renderer-resource availability. It SHALL NOT replace these violations with empty state, default success, direct renderer fallback, or completed-history fallback for an active Timeline.

#### Scenario: Renderer publication precedes owner commit

- **WHEN** an activation attempts to publish renderer-resource notifications before committing its visible owner state
- **THEN** the transaction throws a deterministic diagnostic and tests fail

#### Scenario: Conversation identity mismatch

- **WHEN** a host snapshot, Timeline, message, or renderer item identity does not match the target conversation/turn/message ownership
- **THEN** the Webview rejects the transition and includes the conflicting identities in its diagnostic

#### Scenario: Background mutation attempts foreground write

- **WHEN** a background ingestion path attempts to write foreground React state or refs directly
- **THEN** path-level validation rejects the write rather than allowing cross-conversation coupling
