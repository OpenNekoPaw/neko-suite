## Context

Neko Agent Webview currently has three overlapping presentation sources for one
Agent turn:

- live stream handlers mutate `Message[]` as `streamText`, `toolCall`,
  `toolResult`, and task/media messages arrive;
- `streamComplete` can replace the assistant message with runtime-produced
  `contentBlocks`;
- task and media handlers maintain `AgentWorkItem` state and sometimes append
  synthetic assistant messages.

This creates a non-canonical display model. A text block can continue streaming
above later tool calls, final completion can reshuffle the response, tool errors
can be delayed or moved away from the failing call, and async media tasks do not
share one placement rule.

The relevant local boundaries are:

- Agent runtime owns Agent event ordering and turn lifecycle.
- Extension Host owns VS Code/Webview message delivery, resource projection,
  local file/resource trust boundaries, and task/media delivery adapters.
- Webview owns presentation state, rendering, scroll/focus behavior, and
  user-facing collapse/expand choices.
- `@neko-agent/types` owns cross-boundary DTOs.
- `Message.contentBlocks` remains a persisted history snapshot, not the only
  live rendering model.

### Five-layer analysis

Responsibility:

- Runtime/Extension produces ordered turn timeline events and final persisted
  assistant messages.
- Webview timeline store owns active-turn item state and reconciliation.
- Presenters derive display rows from timeline items and may group only adjacent
  process items.
- Existing components render item bodies: `ToolCallDisplay`, `TaskCard`,
  `RichContentRenderer`, `ContentBlockItem`, and `ProcessRecordsGroup`.

Dependency:

- Shared timeline DTOs live in `@neko-agent/types`, which is already the
  contract package for Extension/Webview messages.
- Extension code must not import React, and Webview code must not import VS Code
  APIs directly.
- No Rust Engine or Protobuf changes are needed.
- No feature package imports another feature package internals.

Interface:

- Timeline events need stable `conversationId`, `turnId`, `messageId`,
  `itemId`, monotonic `sequence`, `kind`, `status`, and optional parent anchors.
- Tool/task/media updates need explicit parent ids rather than placement by
  "last assistant message" heuristics.
- Completion events should carry final persisted content for history but not
  re-own visual order for an already active timeline.

Extension:

- New item kinds can be added by extending a discriminated union and renderer
  registry/facade in the Agent Webview presenter.
- The design remains Agent-local until another package has the same turn/tool
  lifecycle. Extracting a generic timeline to `@neko/ui` now would be premature.
- Structured content renderers keep using the existing rich content registry.

Testing:

- Runtime tests prove emitted sequences and block segmentation for
  `text -> tool -> text`.
- Webview presenter tests prove ordering, parent anchoring, failure placement,
  media readiness, grouping, and reload projection.
- Handler tests prove old fallback paths cannot silently append unknown updates
  to the bottom.
- Extension Development Host smoke via `vscode-extension-debugger` validates
  runtime Webview behavior, scroll position, media rendering, and errors.

## Goals / Non-Goals

**Goals:**

- Establish one canonical live presentation model for an Agent turn.
- Preserve chronological order during streaming and after completion.
- Anchor tool results, failures, confirmations, backfills, background tasks, and
  media progress to their originating item.
- Let ordinary Markdown stream immediately while deferring structured composite
  rendering until the payload is complete and valid.
- Keep persisted `Message.contentBlocks` usable for completed history and reload.
- Make unknown, duplicate, or unanchored timeline updates fail visibly during
  development and tests.

**Non-Goals:**

- Do not create a generic cross-package timeline system.
- Do not migrate durable user project files or Rust engine contracts.
- Do not persist incomplete active-turn timeline state across VS Code restart.
- Do not block all assistant text until stream completion.
- Do not redesign the visual language of tool cards, task cards, media cards, or
  rich content renderers beyond the placement contract.
- Do not change composer queue behavior from
  `complete-agent-message-queue-controls`; queued prompts remain above the
  composer, not part of the turn timeline.

## Decisions

### 1. Live turn timeline is the canonical active-turn display model

Introduce a Webview-facing timeline state for active Agent turns:

```ts
type AgentTurnTimelineItemKind =
  | 'assistant_text'
  | 'thinking'
  | 'tool_call'
  | 'task'
  | 'media'
  | 'composite'
  | 'error';

interface AgentTurnTimelineItem {
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly itemId: string;
  readonly sequence: number;
  readonly kind: AgentTurnTimelineItemKind;
  readonly status: 'streaming' | 'pending' | 'succeeded' | 'failed' | 'complete';
  readonly parentItemId?: string;
  readonly parentToolCallId?: string;
  readonly payload: unknown;
  readonly createdAt: number;
  readonly updatedAt: number;
}
```

The exact type names can follow local style during implementation, but the
contract must be a discriminated shape with stable identity and ordering.

Rationale: The UI needs to order by turn event sequence, not by whichever
handler last mutated `Message[]`.

Rejected alternative: keep `Message.contentBlocks` as the active display source
and patch each handler. That fixes the immediate `text -> tool -> text` bug but
leaves async tasks, media progress, final completion, and reload reconciliation
as separate ordering systems.

### 2. Runtime/Extension assigns sequence and parent anchors

Each turn gets a `turnId` and monotonic sequence. The runtime should assign
sequence when reducing Agent events. Extension adapters may add parent anchors
when projecting local media/task delivery, but they must not guess placement from
the currently visible Webview row.

Required parent anchors:

- `toolResult` updates reference `toolCallId`.
- background task and media task updates reference `parentToolCallId` when they
  originate from a tool result.
- tool-result backfills reference `toolCallId`.
- provider or stream errors without a tool parent attach to the current turn
  cursor as an `error` item.

Rationale: Parent anchors keep late async updates in the original location.

Rejected alternative: Webview-side placement by most recent pending tool. This
breaks for concurrent tools, retries, delayed backfills, conversation switching,
and restored conversations.

### 3. Streaming text segments close on structural events

The active assistant text item is closed when a structural event arrives:

- `toolCall`
- `toolConfirmation`
- `taskCreated`
- `mediaTaskCreated`
- valid completed composite block extraction
- turn-level error

Subsequent `streamText` creates a new text item at a later sequence.

Rationale: This matches runtime behavior already present in
`agent-stream-state.ts` and prevents later text from continuing in the first
Response block above tools.

Rejected alternative: treat assistant text as one block per turn. That may be
simple for persistence, but it cannot represent interleaved tool reasoning and
response segments.

### 4. `streamComplete` finalizes, but does not reorder active timeline items

For an active turn, `streamComplete` should:

- mark open streaming items complete;
- store or upsert the final persisted assistant `Message` snapshot;
- reconcile missing terminal metadata such as final content blocks;
- never replace the live display order with `contentBlocks` order.

For completed history loaded from storage, Webview may derive a timeline from
`Message.contentBlocks` because there is no active live sequence to preserve.

Rationale: Completion should not visually move content the user just watched
stream in a different order.

Rejected alternative: keep final `contentBlocks` replacement as authoritative.
That is the current source of visible reordering.

### 5. Tool calls own their result, error, and media/task children

Tool timeline items are created at call time and updated in place:

- pending call: spinner and arguments;
- confirmation: inline confirmation controls;
- success: result summary, expandable details, attachments/artifacts/media;
- failure: inline error state with result details;
- backfill: merged result and media/artifact updates;
- background task: child `TaskCard` anchored under the tool.

Existing `ToolCallDisplay`, `ToolCallGroupDisplay`, `TaskCard`, and
`RichContentRenderer` should be reused. The change is their placement and data
source, not a new tool card design.

Rationale: Tool call identity is the natural lifecycle owner for tool output and
failure.

Rejected alternative: append failures or task completions as separate assistant
messages. That makes the transcript easier to implement but hides causal
ownership and creates late bottom-of-chat jumps.

### 6. Media rendering is readiness-based, not turn-completion-based

Media rendering rules:

- Tool-returned Webview-safe image/video/audio/document thumbnail URIs render
  when the tool result or backfill provides them.
- Background media tasks render progress immediately and render result media on
  completion at the anchored task/tool item.
- Structured composites emitted inside assistant text render only after their
  fenced payload is closed, parsed, validated, and resource references can be
  resolved.
- Incomplete streamed composites remain normal Markdown/code text during
  streaming.

Rationale: Users should see tool/media results as soon as they are available,
but invalid partial structured payloads should not flicker between broken rich
renderers and text.

Rejected alternative: wait until the whole assistant turn completes before
rendering media or structured content. That makes ordering easier but degrades
long-running creative workflows and hides useful early results.

### 7. Process grouping is a display projection over adjacent timeline items

`ProcessRecordsGroup` can remain, but its input must be adjacent process items
from the timeline. Grouping must not move tools across response segments or
collect all process items for a turn into one bucket.

Rationale: Grouping is a visual compression choice, not a source of order.

Rejected alternative: group all successful hidden tools after the first response
or before the final response. That recreates the current confusing placement.

### 8. Fail-visible migration from old success paths

During the migration boundary, old paths must not silently succeed for active
live turns:

- `streamComplete.contentBlocks` replacement should be disabled for active
  timeline-owned turns.
- synthetic media assistant messages should be restricted to parentless
  task/media events or migration tests.
- unknown parent ids, duplicate item ids, missing sequence, and invalid renderer
  payloads should produce diagnostics or test failures.

Rationale: Prelaunch cleanup should remove conflicting sources of truth instead
of keeping a fallback that masks broken timeline projection.

Rejected alternative: keep old and new rendering in parallel and choose whichever
produces output. That prevents path-level acceptance and will hide ordering bugs.

## Risks / Trade-offs

- Timeline DTO scope grows beyond current Webview messages -> Keep the contract
  Agent-local, discriminated, and minimal; do not extract a generic framework.
- Event sequence bugs become visible -> This is desirable. Add diagnostics and
  focused tests rather than fallback placement.
- Reload projection may differ slightly from active live projection -> Treat
  persisted `contentBlocks` as a completed snapshot and test both paths.
- Media/task events without parent anchors may surface errors during migration
  -> Allow an explicit parentless turn-level item only for events whose source is
  genuinely not a tool.
- Virtualized list scroll may jump when grouped item heights change -> Add
  presenter height estimates and VS Code Webview smoke coverage for long turns.
- More presenter tests are needed -> The complexity already exists implicitly;
  this design makes it testable.

## Migration Plan

1. Add timeline DTOs and pure presenter/store functions behind focused tests.
2. Teach runtime/Extension stream projection to emit ordered timeline events or
   enough metadata for Webview handlers to build them without guessing.
3. Emit `agentTurnTimeline` as the only active-turn UI update path for
   streaming text, thinking, tool calls/results/backfills/confirmations,
   task/media work items, and errors. Non-timeline realtime messages for an
   active turn may be ignored only when the matching canonical timeline item is
   already present; otherwise they must fail visibly and must not create or
   update UI.
4. Change `MessageList` projection to prefer active timeline items for active
   turns while still rendering completed history from persisted messages.
5. Disable old active-turn `streamComplete.contentBlocks` replacement and
   synthetic media-message success paths. Explicitly parentless turn-level
   task/media items must arrive as `agentTurnTimeline` events.
6. Update tests and fixtures to assert canonical path usage.
7. Run focused checks, then VS Code Extension Development Host smoke for a long
   turn with text, tools, failures, retry/success, media, and completion.

Rollback:

- Completed history can still render from `Message.contentBlocks`.
- If timeline migration must be reverted, restore direct content-block rendering
  for active turns and remove timeline event handling in one scoped rollback.
  Because the change does not migrate durable project data, rollback does not
  require user data migration.

## Open Questions

- Should the runtime emit full timeline items, or should it emit sequence/anchor
  metadata and let Webview project item bodies from existing messages? The
  preferred first implementation is sequence/anchor metadata plus Webview pure
  presenters to keep Extension messages compact.
- Should failed structured composite parsing produce an inline warning item or
  remain plain text with diagnostics hidden in development logs? For creator
  workflows, an inline warning is useful when the assistant intended structured
  output, but ordinary Markdown should not show noisy parser errors.
- Should active timeline snapshots be persisted for crash recovery? This is out
  of scope for the first change; completed message snapshots are enough for
  reload after normal turn completion.
