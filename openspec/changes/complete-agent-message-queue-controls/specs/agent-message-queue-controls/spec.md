## ADDED Requirements

### Requirement: Pending Agent messages have authoritative queue identity

Neko Agent SHALL model each pending running-turn message as an authoritative
queue item owned by the Agent runtime for a single conversation. Queue items
MUST include a stable item id, conversation id, text content snapshot, creation
time, and ordered position while they remain pending.

#### Scenario: Text is queued during a running Agent turn

- **WHEN** the user sends a queueable text-only message for a conversation whose
  Agent turn is already running
- **THEN** the Agent runtime MUST create a pending queue item with an
  authoritative id and ordered position
- **AND** Extension MUST publish a queue snapshot or accepted queue event that
  includes the item and current pending count

#### Scenario: Text is sent while Agent is idle

- **WHEN** the user sends text for a conversation whose Agent turn is idle
- **THEN** the message MUST start through the normal foreground send path
- **AND** the system MUST NOT create a pending queue item for that foreground
  turn

#### Scenario: Queued items are session runtime state

- **WHEN** the VS Code window or Extension runtime restarts
- **THEN** pending queue items MUST NOT be restored from durable project files or
  conversation history
- **AND** the Webview MUST treat the queue as empty unless Extension provides a
  current runtime snapshot

### Requirement: Composer queue is the user-facing placement for pending items

Neko Agent SHALL display pending queue items in a compact control surface above
the composer input. Pending items MUST NOT be rendered as ordinary transcript
messages before they begin execution.

#### Scenario: Queued item is accepted

- **WHEN** Extension acknowledges a queued item or sends a queue snapshot with
  pending items
- **THEN** Webview MUST render the pending item in the composer queue above the
  input box
- **AND** `MessageList` MUST NOT render that pending item as a normal user chat
  bubble

#### Scenario: Multiple queued items are visible

- **WHEN** a conversation has more than one pending queue item
- **THEN** the composer queue MUST display the pending count and preserve runtime
  order
- **AND** item controls MUST target the corresponding authoritative queue item id

#### Scenario: Queued item begins execution

- **WHEN** the runtime dequeues a pending item to execute it
- **THEN** Webview MUST remove that item from the composer queue
- **AND** the user's prompt MAY become a normal transcript message for the
  executing turn
- **AND** the item MUST no longer be cancellable or editable as a pending item

#### Scenario: Webview reloads or switches conversations

- **WHEN** Webview reloads, remounts, or switches to a conversation with pending
  runtime queue items
- **THEN** Extension MUST be able to provide the current ordered queue snapshot
  for that conversation
- **AND** Webview MUST render that snapshot above the composer without relying on
  hidden transcript messages

### Requirement: Queue controls mutate authoritative runtime state

Neko Agent SHALL support item-level queue controls for send-next promotion,
cancel, and re-edit. Each command MUST include the target conversation id and
queue item id, and Extension/runtime MUST be the source of truth for command
success.

#### Scenario: User promotes a queued item

- **WHEN** Webview sends a send-next or promote command for a pending queue item
- **THEN** runtime MUST move that item before the other pending items in the same
  conversation
- **AND** Extension MUST publish an updated queue snapshot reflecting the new
  order

#### Scenario: Promoted item executes next

- **WHEN** the active Agent turn completes after a queued item was promoted
- **THEN** runtime MUST execute the promoted item before later pending items
- **AND** the queue snapshot MUST remove the promoted item before or when its
  execution starts

#### Scenario: User cancels a queued item

- **WHEN** Webview sends a cancel queued item command for a pending queue item
- **THEN** runtime MUST remove only that pending item from the conversation queue
- **AND** the active streaming Agent response MUST continue unless separately
  cancelled
- **AND** Extension MUST publish an updated queue snapshot

#### Scenario: User re-edits a queued item

- **WHEN** Webview sends a re-edit queued item command for a pending queue item
- **THEN** runtime MUST remove that item from the pending queue
- **AND** Extension MUST ask Webview to restore the removed item content into the
  composer for revision
- **AND** the removed item MUST NOT execute unless the user sends the revised
  text again

#### Scenario: Queue command targets stale item

- **WHEN** Webview sends a queue command for an item id that is no longer pending
  in the specified conversation
- **THEN** Extension MUST report a visible stale-item diagnostic or error
- **AND** Extension MUST refresh the Webview with the current queue snapshot
- **AND** the command MUST NOT be treated as successful

### Requirement: Queue protocol is explicit and typed

Neko Agent SHALL expose typed Webview-to-Extension queue commands and
Extension-to-Webview queue updates through the Neko Agent Webview protocol.
Queue messages MUST preserve the Webview sandbox boundary and MUST use the
package's typed bridge facade for transport.

#### Scenario: Webview sends a queue command

- **WHEN** Webview requests promote, cancel, re-edit, or queue snapshot for a
  pending item
- **THEN** the Webview message MUST include an explicit `conversationId`
- **AND** item-specific commands MUST include the authoritative `queueItemId`
- **AND** Webview MUST NOT call Extension, Node, filesystem, or VS Code APIs
  directly

#### Scenario: Extension publishes a queue snapshot

- **WHEN** queue state changes because of enqueue, promote, cancel, re-edit,
  clear, drain, conversation switch, or Webview snapshot request
- **THEN** Extension MUST publish an ordered queue snapshot for the affected
  conversation
- **AND** the snapshot MUST include enough item data for Webview display and
  command targeting

#### Scenario: Webview optimistic state is reconciled

- **WHEN** Webview has optimistic queued text and then receives an authoritative
  queue snapshot
- **THEN** Webview MUST treat the Extension snapshot as the source of truth
- **AND** optimistic-only items absent from the authoritative snapshot MUST not
  remain visible as pending queue items

### Requirement: Queueable payload boundary is text-only for the first version

Neko Agent SHALL queue only plain text composer messages in this capability.
Running-turn sends that include attachments, file references, context payloads,
slash commands, skill invocations, or other rich payloads MUST NOT be accepted as
pending queue items until a later contract explicitly models those payloads.

#### Scenario: Rich payload is sent while Agent is running

- **WHEN** the user attempts to send a message with attachments, file
  references, context payloads, or other non-text payload while the Agent turn is
  running
- **THEN** the system MUST NOT create a pending queue item
- **AND** Webview MUST NOT show a successful queued state for that payload

#### Scenario: Slash or skill command is entered while Agent is running

- **WHEN** the user enters a slash command or skill invocation while the Agent
  turn is running
- **THEN** the system MUST NOT enqueue it as a plain text pending message
- **AND** command handling MUST remain governed by the existing command or skill
  invocation contract

#### Scenario: Empty queued content is submitted

- **WHEN** Webview or Extension receives a queue operation that would create or
  restore empty or whitespace-only queued content
- **THEN** the operation MUST be rejected with a visible diagnostic or validation
  failure
- **AND** runtime MUST NOT create an empty pending queue item

### Requirement: Queue lifecycle follows conversation cancellation and reset

Neko Agent SHALL clear or refresh pending queue state when conversation-level
actions invalidate the queue. Queue cleanup MUST be visible to Webview through a
snapshot or equivalent state update.

#### Scenario: Active Agent turn is cancelled

- **WHEN** the user cancels the active Agent response for a conversation
- **THEN** runtime MUST cancel the active turn according to existing cancellation
  behavior
- **AND** runtime MUST clear pending queue items for that conversation
- **AND** Webview MUST remove queued composer items for that conversation

#### Scenario: Conversation history is cleared

- **WHEN** the user clears conversation history or deletes the conversation
- **THEN** runtime MUST clear pending queue items for that conversation
- **AND** queued items for other conversations MUST remain unaffected

#### Scenario: Conversation queue is explicitly requested

- **WHEN** Webview requests the message queue for a valid conversation
- **THEN** Extension MUST return or publish the current ordered queue snapshot
- **AND** an empty queue MUST be represented explicitly as zero pending items
