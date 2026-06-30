## Why

Neko Agent currently has a partial pending-message queue: text sent while an
Agent turn is running can be held and shown above the composer, but queue items
do not have authoritative identities or item-level operations. This makes the
queue look present while still missing the user controls users expect from the
Codex-style composer queue: send next, cancel, and re-edit.

This should be completed now because the UI has already moved queued messages
out of the transcript and into the composer area. Without runtime-backed queue
controls, the Webview can only show an optimistic preview and cannot safely
mutate queued work.

## What Changes

- Introduce first-class Agent queue item contracts with stable item ids,
  content snapshots, conversation ownership, timestamps, and queue order.
- Replace the runtime string-only pending queue surface with item-aware
  operations:
  - enqueue while the current turn is running;
  - remove a queued item;
  - edit a queued item;
  - promote a queued item to run next;
  - clear queued items when a turn is cancelled or a conversation is reset.
- Extend the Neko Agent Webview-to-Extension protocol with typed queue commands
  and Extension-to-Webview queue snapshot/update events.
- Make the composer queue above the input box the only user-facing placement for
  pending user messages; queued items must not appear as normal transcript
  messages.
- Add composer controls for each queued item:
  - send now / send next: promote the item to the front of the pending queue;
  - cancel: remove the queued item;
  - edit: remove the queued item and load its text back into the composer for
    revision.
- Treat the Extension/runtime queue as the source of truth after acknowledgement
  or snapshot. Webview optimistic state must reconcile to runtime item ids.
- Add fail-visible diagnostics for stale or invalid queue item operations instead
  of silently no-oping unknown ids.

Non-goals:

- Do not interrupt or preempt the currently streaming Agent response in the MVP.
  "Send now" means "run this queued item next"; if the Agent is already idle, it
  may dispatch immediately.
- Do not support queued attachments, file references, context payloads, slash
  commands, or skill invocations in the first implementation. The existing
  running-turn queue remains text-only until those payload contracts are
  intentionally modeled.
- Do not persist pending queue items across VS Code restarts or durable project
  reloads. The queue is session runtime state.
- Do not introduce a generic cross-package queue framework. This is an Agent
  conversation queue capability unless another package later proves the same
  lifecycle and semantics are needed.

Success criteria:

- A user can send one or more text messages while an Agent response is running
  and see them only in the composer queue above the input box.
- A user can promote any queued item so it becomes the next request processed
  after the current Agent turn finishes.
- A user can cancel a queued item and observe it disappear without affecting the
  active streaming response.
- A user can re-edit a queued item and see its content restored to the composer
  while the removed item no longer runs from the queue.
- Webview reload or conversation switching can restore the visible queue from an
  Extension-provided snapshot for the active conversation.

Compatibility and rollback:

- This is a prelaunch internal contract change for Neko Agent runtime ports and
  Webview messages. Existing string-only queue tests and fixtures should be
  updated to the new item contract rather than kept alive through compatibility
  shims.
- Because queued messages are session runtime state, rollback can remove the new
  controls and return to count-only queue display without migrating durable user
  data.
- Old queue-related Webview messages that lack item identity must not claim
  item-level control success. They may remain only as explicit migration or
  diagnostic paths during the change.

## Capabilities

### New Capabilities

- `agent-message-queue-controls`: Defines Agent pending-message queue identity,
  item-level runtime operations, Webview/Extension queue command semantics,
  composer queue presentation, failure states, and validation expectations.

### Modified Capabilities

- None. The shared `webview-vscode-bridge` transport requirements remain
  unchanged; this change adds Neko Agent domain messages that continue to travel
  through the existing typed bridge facade.

## Impact

- Contracts:
  - `packages/neko-agent/packages/agent-types/src/webview-protocol.ts`
  - `packages/neko-agent/packages/agent/src/runtime/agent-runner-port.ts`
  - queue-related Agent event and stream-state contracts
- Runtime:
  - `packages/neko-agent/packages/agent/src/runtime/agent-session-runner.ts`
  - `packages/neko-agent/packages/agent/src/runtime/agent-turn-runtime.ts`
  - `packages/neko-agent/packages/agent/src/runtime/agent-runtime-manager.ts`
- Extension:
  - `packages/neko-agent/packages/extension/src/ai/*`
  - `packages/neko-agent/packages/extension/src/chat/router/conversationRoutes.ts`
  - chat turn handling and stream processing tests
- Webview:
  - `packages/neko-agent/packages/webview/src/messages/index.ts`
  - `packages/neko-agent/packages/webview/src/handlers/streaming-handlers.ts`
  - `packages/neko-agent/packages/webview/src/presenters/message-queue-presenter.ts`
  - `packages/neko-agent/packages/webview/src/components/ChatView/InputArea/InputArea.tsx`
  - `packages/neko-agent/packages/webview/src/components/ChatView/index.tsx`
  - related hooks, store projections, i18n, accessibility, and tests
- Validation:
  - focused Vitest coverage for contracts, runtime queue operations, router
    commands, stream events, Webview presenters, and InputArea controls
  - VS Code Extension Development Host smoke via `vscode-extension-debugger` for
    composer placement, keyboard/focus behavior, and command wiring
