## Context

Neko Agent already queues compatible text messages when the user sends while an
Agent turn is running. The current runtime queue is string-based:

- Webview sends ordinary `sendMessage`.
- Extension/Agent runtime detects the running turn.
- `AgentSessionRunner.appendMessage(input: string)` appends text into
  `_pendingMessages: string[]`.
- `agent-turn-runtime` drains the string list after the active turn completes.
- Webview receives count-oriented `messageQueued` updates and shows a composer
  queue banner above the input box.

This is enough to avoid placing queued messages directly in the transcript, but
not enough for queue item controls. A Webview-only cancel/edit/send-next button
would be fake because the authoritative runtime queue cannot address an item by
id.

The target product behavior follows the Codex-style queue placement shown in
the user's screenshots: pending prompts live in a compact control surface above
the composer, not as normal chat history messages. The Neko variant should stay
work-focused and compact inside the VS Code Webview.

### Five-layer analysis

Responsibility:

- Agent runtime owns queue item identity, order, lifecycle, and execution.
- Extension Host owns Webview command routing, conversation ownership checks,
  diagnostics, and snapshot delivery.
- Webview owns composer presentation, optimistic pending feedback, keyboard and
  focus behavior, and sending typed queue commands through the package facade.
- Conversation transcript owns only sent/executed messages. Queued items are
  session runtime state, not history.

Dependency:

- `@neko-agent/types` remains the Layer 0-ish package contract surface for
  Webview/Extension message DTOs.
- Webview continues to use the shared VS Code bridge through
  `packages/neko-agent/packages/webview/src/messages/index.ts`.
- Extension imports Agent runtime/manager ports; Webview never imports
  Extension or Node/VS Code APIs.
- No Rust Engine or Protobuf change is needed because this is local Agent
  orchestration state, not media/rendering authority.

Interface:

- Queue commands need stable `queueItemId` and `conversationId`.
- Queue snapshots need ordered item metadata sufficient for display and
  reconciliation.
- Runtime ports need item-aware queue methods, not string-only drain/append.
- Unknown ids and non-queueable payloads should return explicit diagnostics or
  errors instead of silent success.

Extension:

- The first version supports text-only queue items.
- Future attachment/context support can extend the queue item payload as a typed
  discriminated shape, but the current MVP should not store arbitrary
  `sendMessage` payloads without a deliberate contract.
- The queue component can remain Agent-local until another Webview has the same
  lifecycle; extraction to `@neko/ui` is premature because the semantics are
  tied to Agent execution.

Testing:

- Runtime unit tests prove enqueue, cancel, edit, promote, drain order, clear,
  and stale-id behavior.
- Extension router/handler tests prove all queue commands resolve the explicit
  conversation id and post queue snapshots or diagnostics.
- Webview presenter/component tests prove queued items stay out of
  `MessageList`, appear above the composer, and wire send-next/cancel/edit
  controls.
- Webview runtime smoke uses Extension Development Host plus
  `vscode-extension-debugger`, because ordinary browser/Vite validation is not
  enough for VS Code Webview message/focus behavior.

## Goals / Non-Goals

**Goals:**

- Add authoritative queue item identity and ordered snapshots.
- Support item-level send-next, cancel, and re-edit from the composer queue.
- Preserve the existing text-only running-turn queue boundary.
- Keep queued items out of the transcript.
- Reconcile Webview optimistic queue state with Extension/runtime snapshots.
- Fail visibly for stale ids, unknown conversations, illegal queue payloads, or
  queue commands sent for non-running/non-existent queues.

**Non-Goals:**

- Do not preempt or interrupt the currently streaming Agent turn for send-next.
- Do not queue rich context, attachments, selected files, slash commands, skill
  invocations, or media generation payloads in the MVP.
- Do not persist pending queue items across VS Code restart.
- Do not build a generic queue framework or cross-package queue design system.
- Do not add compatibility shims that let string-only queue paths claim
  item-level control.

## Decisions

### 1. Queue item contract

Introduce an Agent queue item contract:

```ts
export interface AgentQueuedMessageItem {
  readonly id: string;
  readonly conversationId: string;
  readonly content: string;
  readonly createdAt: number;
  readonly updatedAt?: number;
  readonly source: 'composer';
}

export interface AgentMessageQueueSnapshot {
  readonly conversationId: string;
  readonly items: readonly AgentQueuedMessageItem[];
  readonly pendingCount: number;
}
```

The id is generated at the Extension/runtime boundary when the queue item is
accepted. The Webview may create a temporary optimistic id for immediate visual
feedback, but must replace it with the authoritative id when a snapshot arrives.

Alternative rejected: reuse Webview user-message ids. Those ids currently belong
to optimistic transcript projections and are not reliable runtime handles after
reload, conversation switch, or queue mutation.

### 2. Item-aware runtime port

Replace the queue portion of `AgentRunnerPort` / `AgentTurnRunner` with
item-aware methods:

```ts
enqueuePendingMessage(input: { content: string; now?: number }): AgentQueuedMessageItem | null;
getPendingMessageQueue(): readonly AgentQueuedMessageItem[];
removePendingMessage(queueItemId: string): AgentQueuedMessageItem;
updatePendingMessage(queueItemId: string, content: string): AgentQueuedMessageItem;
promotePendingMessage(queueItemId: string): AgentQueuedMessageItem;
drainPendingMessageQueue(): readonly AgentQueuedMessageItem[];
clearPendingMessages(): void;
```

The exact naming can follow local style during implementation, but the behavior
must be item-aware. Unknown ids throw a queue-specific error that Extension can
turn into a visible diagnostic. Empty or whitespace-only updates are rejected.

The drained execution loop passes `item.content` into `executeAgentTurnMessage`
and emits a snapshot/update before each queued item starts so the composer queue
removes the item deterministically.

Alternative rejected: keep `string[]` and maintain an id-to-index map in the
Webview. That creates two sources of truth and cannot survive reorder/drain
races.

### 3. Send-next semantics

"Send now" in the UI maps to runtime `promotePendingMessage(queueItemId)`. If the
Agent is running, the promoted item becomes the next drained item after the
current turn completes. If the Agent is idle when the command is processed, the
Extension may dispatch that item immediately through the normal send path.

This preserves current Agent cancellation semantics: stopping the current answer
is still `cancelMessage`, not an implicit side effect of queue promotion.

Alternative rejected: preempt the active Agent turn. Preemption would require a
separate interruption model, partial assistant-message handling, tool-call
cleanup, confirmation cancellation, and user-facing recovery rules. That is a
larger feature than queue controls.

### 4. Re-edit semantics

Re-edit removes the item from the authoritative queue and asks the Webview to
load the removed content into the composer. The user can then revise and send it
again.

Command flow:

1. Webview posts `editQueuedMessage` with `conversationId` and `queueItemId`.
2. Extension removes the item and posts a queue snapshot plus an edit payload.
3. Webview updates queue state and sets composer text to the removed content.

If the composer already contains unsent text, the Webview should preserve that
text through the existing input state rules. The first implementation should use
the least surprising behavior for Neko Agent: append the removed text only when
the composer is empty; otherwise keep the current composer text and surface a
visible diagnostic/action instead of overwriting.

Alternative rejected: inline editing inside the queue row. Inline editing
requires extra focus management, save/cancel state, validation, and conflict
rules while the runtime might drain the item. Removing to composer matches the
Codex mental model and is simpler to validate.

### 5. Webview/Extension protocol

Add domain-specific messages to `webview-protocol.ts`:

- Webview to Extension:
  - `promoteQueuedMessage`
  - `cancelQueuedMessage`
  - `editQueuedMessage`
  - `getMessageQueue`
- Extension to Webview:
  - `messageQueueSnapshot`
  - `queuedMessageEditRequested`
  - optional `messageQueueError` or existing error message with a queue-specific
    code if the package already has a diagnostic shape.

`messageQueued` can either be replaced by `messageQueueSnapshot` for accepted
queue items or retained as an event that includes `item` and `snapshot`. The
canonical UI state should be the snapshot.

Alternative rejected: add ad hoc fields only to `messageQueued`. Count-oriented
events are good for progress but not enough for item-level commands or reload
restore.

### 6. UI placement and controls

The composer owns a compact queue panel directly above the input area. It should:

- show count and the first pending item in collapsed mode;
- support expanding to show all queued items when there is more than one;
- use icon buttons with tooltips for send-next, edit, and cancel;
- keep stable row heights and truncation so long messages do not resize the
  composer unpredictably;
- preserve keyboard focus and accessible labels;
- avoid putting queued items in `MessageList` or normal chat bubbles.

The existing `InputArea` banner can evolve into an Agent-local
`MessageQueueControls` child component if that reduces prop sprawl. This should
remain package-local because it depends on Agent queue commands and composer
state, not a generic UI primitive.

Alternative rejected: render queued user messages as dimmed transcript bubbles.
That confuses queued state with already-sent history and makes cancellation/edit
look like transcript mutation.

### 7. Source of truth and reconciliation

The Webview may optimistically show text immediately after a running-turn send,
but snapshots from Extension/runtime win. When a snapshot arrives:

- optimistic items with matching content may be replaced by authoritative items;
- missing optimistic items are removed;
- authoritative items unknown to the Webview are shown;
- stale command responses are ignored only when a newer snapshot version or
  timestamp proves they are stale.

Snapshots should include either a monotonic `version` or `updatedAt` timestamp to
make reconciliation deterministic. If implementation can keep ordering simple
without a version, tests must still cover reload and rapid command cases.

Alternative rejected: leave Webview optimistic messages in `messages[]` and
derive queue state from transcript projection. That already caused the placement
problem and cannot represent canceled queue items cleanly.

## Risks / Trade-offs

- Runtime queue item ids can race with Webview optimistic ids -> use Extension
  snapshots as source of truth and test rapid enqueue/cancel cases.
- Send-next may be misunderstood as interrupt-now -> label the action as
  "Send next" in UI copy/tooltips, while command names can still use promote
  semantics.
- Removing to composer during edit may conflict with existing draft text -> do
  not overwrite non-empty composer content silently; surface a visible action or
  diagnostic.
- Queue commands for already-drained items can happen during fast completions ->
  return a fail-visible stale-item diagnostic and refresh the snapshot.
- Text-only queue may feel incomplete for attachments -> keep the current
  non-queueable rich-payload behavior explicit and add tests so future support
  is designed through contracts instead of accidental serialization.
- More protocol messages increase test surface -> keep them Agent-domain local
  and covered by focused protocol/router tests.

## Migration Plan

1. Add queue item types and Webview protocol messages in
   `@neko-agent/types`.
2. Update Agent runtime ports and adapters from string-only pending messages to
   `AgentQueuedMessageItem`.
3. Update `agent-turn-runtime` enqueue/drain logic to emit queue snapshots and
   execute item content in order.
4. Add Extension route handlers for promote/cancel/edit/get snapshot, including
   explicit conversation-id checks and diagnostics.
5. Update Webview message facade, handlers, presenters, and conversation state
   to store queue snapshots outside transcript messages.
6. Replace the current banner with item-aware composer controls above the input
   area.
7. Update tests and remove string-only queue fixtures that would hide the new
   canonical path.
8. Run focused package tests and VS Code Webview smoke.

Rollback is low-risk because no durable project data changes. Reverting to a
count-only composer queue would drop item-level controls and the item-aware
runtime API, but it would not require user data migration.

## Open Questions

- Queue snapshots use an explicit conversation-local monotonic `version`.
  Extension/runtime-owned snapshot creation is the canonical source; Webview
  ignores snapshots older than the latest applied version for that conversation.
- Re-edit restores removed queue content only when the composer draft is empty.
  If the user already has unsent text, Webview preserves the draft and surfaces
  a visible conflict diagnostic instead of overwriting.
- The first UI keeps multiple queued items collapsed by default, showing the
  first item plus a count and an explicit expand control. This keeps the
  composer compact while still exposing ordered item-level controls.

Residual UI risks:

- The collapsed default is intentionally compact, but users with many pending
  prompts may need clearer affordance if they do not notice the expand control.
- Edit-with-existing-draft currently reports a diagnostic rather than offering a
  one-click merge/replace recovery action. That is acceptable for the MVP
  because it avoids silent draft loss.

Deferred payload support:

- Attachments, file/context references, slash commands, skill invocations, and
  richer Agent request payloads remain non-goals for this change. They must be
  modeled as typed queue payload variants in a future change rather than hidden
  inside the text-only queue path.
