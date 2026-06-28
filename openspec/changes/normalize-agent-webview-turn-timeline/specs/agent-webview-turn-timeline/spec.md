## ADDED Requirements

### Requirement: Active Agent turns render from an ordered timeline
The Agent Webview SHALL render an active Agent turn from a canonical ordered
turn timeline with stable item identity, monotonic sequence, and conversation
ownership.

#### Scenario: Timeline item order follows event sequence
- **WHEN** an active turn receives timeline events with increasing sequence
  values
- **THEN** the Webview MUST render timeline items in sequence order
- **AND** it MUST NOT reorder items by message mutation time, tool completion
  time, task update time, or renderer grouping rules

#### Scenario: Invalid timeline event is rejected visibly
- **WHEN** the Webview receives an active-turn timeline event with a missing
  turn id, missing item id, duplicate item id for a different item, missing
  sequence, or sequence that violates the active turn contract
- **THEN** the Webview MUST produce a visible diagnostic or test-observable
  failure
- **AND** it MUST NOT silently append the item to the bottom of the transcript

#### Scenario: Conversation switching preserves active timeline state
- **WHEN** a timeline event arrives for a non-current conversation
- **THEN** the Webview MUST update that conversation's cached timeline state
- **AND** activating that conversation MUST render the same ordered active-turn
  timeline without rebuilding order from the currently visible conversation

### Requirement: Streaming text segments close before structural items
The Agent Webview SHALL place streamed assistant text at the current turn cursor
and close the active text segment before rendering structural items such as tool
calls, tasks, media, composites, or turn-level errors.

#### Scenario: Text after a tool creates a new response segment
- **WHEN** an active turn receives events in the order `streamText`, `toolCall`,
  `toolResult`, and then another `streamText`
- **THEN** the first text MUST render before the tool item
- **AND** the second text MUST render after the tool item
- **AND** the second text MUST NOT be appended into the first response block

#### Scenario: Completion does not move streamed text
- **WHEN** an active turn has already rendered interleaved text and tool items
  from live events
- **AND** the turn receives `streamComplete` with final assistant content blocks
- **THEN** the Webview MUST mark open streamed text as complete
- **AND** it MUST NOT replace the active timeline order with the final content
  block order

#### Scenario: Ordinary Markdown streams immediately
- **WHEN** streamed assistant text contains ordinary Markdown without an
  incomplete structured payload
- **THEN** the Webview MUST render the Markdown incrementally in the current text
  segment
- **AND** it MUST continue to update that text segment until a structural event
  closes it

### Requirement: Tool lifecycle updates remain anchored to the tool item
The Agent Webview SHALL render each tool call as a stable timeline item and
apply tool results, confirmations, failures, backfills, artifacts, and tool-owned
media to that same item.

#### Scenario: Tool result updates the matching tool item
- **WHEN** the Webview receives a `toolResult` for a known `toolCallId`
- **THEN** it MUST update the existing tool item for that `toolCallId`
- **AND** it MUST NOT create a new assistant message or move the result to the
  bottom of the transcript

#### Scenario: Tool failure appears immediately at the failing tool
- **WHEN** the Webview receives a failed `toolResult` for a known tool call
- **THEN** the matching tool item MUST render a failed state and the error
  message immediately
- **AND** the failure MUST NOT wait for `streamComplete`
- **AND** the failure MUST NOT be rendered as only a final assistant error
  message unless the error is turn-level and has no tool parent

#### Scenario: Tool backfill preserves original placement
- **WHEN** a delayed tool-result backfill arrives for a known `toolCallId`
- **THEN** the Webview MUST merge the backfill into the original tool item
- **AND** any media, artifacts, diagnostics, or perception cards from the
  backfill MUST appear at that original tool placement

#### Scenario: Unknown tool parent fails visibly
- **WHEN** a tool result, confirmation, or backfill references an unknown
  `toolCallId` in an active timeline-owned turn
- **THEN** the Webview MUST produce a visible diagnostic or test-observable
  failure
- **AND** it MUST NOT guess placement from the last assistant message

### Requirement: Async tasks and media progress are parent anchored
The Agent Webview SHALL attach async background task and media progress items to
the tool or turn item that created them and update that anchored placement
through completion.

#### Scenario: Background task created by a tool renders under that tool
- **WHEN** a tool result creates a background task and includes a parent tool
  anchor
- **THEN** the Webview MUST render the task card under the originating tool item
- **AND** task progress and completion updates MUST update that same anchored
  task card
- **AND** they MUST NOT append synthetic assistant messages for that task

#### Scenario: Media task created by a tool renders under that tool
- **WHEN** a media task is created from a tool-owned Agent turn
- **THEN** the Webview MUST anchor the media task to the originating tool item or
  its child task item
- **AND** media progress, delivery errors, and completed result media MUST update
  the anchored item in place

#### Scenario: Parentless async task is explicit
- **WHEN** an async task or media update has no originating tool or turn item
- **THEN** the Extension/Webview contract MUST mark it as parentless explicitly
- **AND** the Webview MAY render it as a turn-level item
- **AND** it MUST NOT treat a missing parent as permission to guess placement

### Requirement: Media and structured content render when ready
The Agent Webview SHALL render media and structured content according to payload
readiness rather than waiting for the whole turn or rendering invalid partial
payloads.

#### Scenario: Tool-returned media renders before turn completion
- **WHEN** a tool result or backfill provides Webview-safe image, video, audio,
  document thumbnail, artifact, or perception-card data
- **THEN** the Webview MUST render that media or artifact at the anchored tool or
  task item as soon as the payload is valid
- **AND** it MUST NOT wait for `streamComplete` solely to display the media

#### Scenario: Incomplete streamed composite remains text
- **WHEN** streamed assistant text contains an incomplete fenced structured
  payload such as a composite, gallery, or storyboard block
- **THEN** the Webview MUST continue rendering it as ordinary streaming
  text/code
- **AND** it MUST NOT invoke the structured rich-content renderer until the
  payload is closed, parsed, and validated

#### Scenario: Completed structured payload becomes a structured item
- **WHEN** a streamed structured payload becomes closed, parseable, valid, and
  its referenced resources can be resolved or diagnosed
- **THEN** the Webview MUST render it as a structured content item at its
  timeline position
- **AND** any resource-resolution diagnostics MUST remain associated with that
  structured item

### Requirement: Process grouping preserves timeline order
The Agent Webview SHALL treat process grouping as a visual projection over
adjacent timeline items and MUST NOT use grouping to change canonical order.

#### Scenario: Adjacent process items are collapsible
- **WHEN** two or more adjacent timeline items are eligible process records such
  as successful hidden tools or thinking blocks
- **THEN** the Webview MAY render them as one collapsible process group
- **AND** expanding the group MUST reveal the items in their original timeline
  order

#### Scenario: Process grouping does not cross response segments
- **WHEN** process items are separated by assistant response text, visible media,
  visible tool failures, plans, diffs, or composites
- **THEN** the Webview MUST NOT merge those process items into one group across
  the separating item
- **AND** it MUST preserve the separating item in its timeline position

### Requirement: Completed history can be rebuilt from persisted messages
The Agent Webview SHALL be able to render completed conversation history from
persisted `Message.contentBlocks` while preserving the live timeline as the
canonical path for active turns.

#### Scenario: Completed conversation loads from history
- **WHEN** a completed conversation is loaded from persisted `Message[]` records
  with assistant `contentBlocks`
- **THEN** the Webview MUST derive a completed display timeline from those
  content blocks
- **AND** it MUST render tool results, media, structured content, and errors in
  the persisted order

#### Scenario: Active timeline survives final snapshot
- **WHEN** an active timeline-owned turn receives a final persisted assistant
  message snapshot
- **THEN** the Webview MUST store the snapshot for history and reload
- **AND** the active displayed order MUST remain owned by the live timeline until
  the turn is no longer active
