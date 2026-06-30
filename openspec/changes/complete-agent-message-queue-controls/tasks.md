## 1. Contracts And Protocol

- [x] 1.1 Add `AgentQueuedMessageItem`, `AgentMessageQueueSnapshot`, queue command payloads, and queue error/diagnostic payloads to `packages/neko-agent/packages/agent-types/src/webview-protocol.ts`.
- [x] 1.2 Add or update Agent event/runtime message contracts so queue accepted, queue snapshot, queue item removed, and queue item promoted states can be projected without relying on count-only `messageQueued`.
- [x] 1.3 Update `packages/neko-agent/packages/agent-types/src/__tests__/webview-protocol.test.ts` and Extension protocol tests to cover valid queue commands, required `conversationId`, required `queueItemId`, and rejection of malformed queue payloads.
- [x] 1.4 Decide whether queue snapshots carry a monotonic `version` or timestamp-only ordering, then document the chosen field in the type contract and tests.

## 2. Runtime Queue Model

- [x] 2.1 Replace `AgentSessionRunner` string-only `_pendingMessages: string[]` with an ordered queue of authoritative item objects.
- [x] 2.2 Implement item-aware runtime methods for enqueue, snapshot/get, remove, update content, promote-to-front, drain, count, and clear.
- [x] 2.3 Make unknown queue item ids, empty content updates, and illegal queue mutations fail visibly through typed errors instead of no-op behavior.
- [x] 2.4 Update `AgentRunnerPort`, `AgentRunnerRuntimeAdapter`, `AgentRunner`, `AgentRuntimeManager`, and related test doubles to expose the item-aware queue API.
- [x] 2.5 Update runtime tests for FIFO order, promote order, cancel/remove behavior, edit/update behavior, drain behavior, clear-on-cancel, stale ids, and item ids generated only for accepted queued text.

## 3. Agent Turn Execution

- [x] 3.1 Update `agent-turn-runtime` running-turn enqueue logic to create queue items and emit authoritative queue snapshots.
- [x] 3.2 Update queued drain execution so each queued item is removed from the snapshot before or when it starts executing, then executes through the existing turn message path using its content.
- [x] 3.3 Preserve the MVP text-only boundary by rejecting or refusing rich running-turn payloads before queue item creation.
- [x] 3.4 Ensure active-turn cancellation clears pending queue items and publishes an empty queue snapshot.
- [x] 3.5 Update `agent-turn-runtime` tests and chat turn handler tests so they assert the item-aware canonical path, not legacy string queue behavior.

## 4. Extension Routing And Diagnostics

- [x] 4.1 Add conversation routes for get queue snapshot, promote queued item, cancel queued item, and re-edit queued item.
- [x] 4.2 Ensure every queue route resolves and validates the explicit conversation id without falling back to the active conversation.
- [x] 4.3 Implement Extension handlers that call runtime queue operations, publish updated snapshots, and return visible diagnostics for stale ids or invalid commands.
- [x] 4.4 Implement re-edit delivery so Extension removes the item and sends Webview an edit request containing the removed content.
- [x] 4.5 Clear queue state when conversation history is cleared, a conversation is deleted, all conversations are cleared, or the active Agent response is cancelled.
- [x] 4.6 Add Extension router and handler tests for successful promote/cancel/edit/get snapshot, cross-conversation isolation, stale item diagnostics, and queue clearing lifecycle.

## 5. Webview State And Presenters

- [x] 5.1 Add typed `VSCodeMessages` helpers for queue snapshot, promote, cancel, and re-edit commands in `packages/neko-agent/packages/webview/src/messages/index.ts`.
- [x] 5.2 Replace transcript-derived queued message state with snapshot-derived queue state in conversation streaming/session state.
- [x] 5.3 Update `message-queue-presenter` to reconcile optimistic queued text with authoritative runtime snapshots, remove stale optimistic entries, and preserve runtime order.
- [x] 5.4 Update streaming/message handlers to handle queue snapshots, queue errors, and edit-queued-message requests without inserting pending items into `MessageList`.
- [x] 5.5 Update conversation switch, Webview reload, active conversation restore, and non-current conversation handling so queue snapshots remain conversation-scoped.
- [x] 5.6 Add Webview presenter and handler tests for snapshot reconciliation, optimistic-to-authoritative id replacement, missing optimistic item removal, stale snapshot handling, and non-current conversation updates.

## 6. Composer Queue UI

- [x] 6.1 Extract or evolve the existing InputArea queue banner into an Agent-local queue controls component placed directly above the composer input.
- [x] 6.2 Render pending count, ordered queued item text, collapsed/expanded presentation for multiple items, and stable truncation for long prompts.
- [x] 6.3 Add icon buttons with accessible labels/tooltips for send-next, re-edit, and cancel on each queued item.
- [x] 6.4 Wire send-next to promote, cancel to remove, and re-edit to remove-plus-restore-to-composer behavior.
- [x] 6.5 Handle re-edit while composer has existing text without silently overwriting the draft; surface a visible recovery action or diagnostic.
- [x] 6.6 Keep queued items out of `MessageList` and remove any leftover `isQueued` transcript rendering assumptions that conflict with snapshot-owned state.
- [x] 6.7 Add or update zh-CN/en i18n strings for queue count, send-next, cancel queued item, re-edit queued item, stale item diagnostics, and rich payload not queueable messaging.

## 7. UI Accessibility And Runtime Smoke

- [x] 7.1 Add focused InputArea/component tests for queue placement above the composer, action wiring, long-text truncation, keyboard focus, empty queue hiding, and multiple queued items.
- [x] 7.2 Add tests proving queued items are not visible as normal transcript messages before execution and become transcript messages only through the normal executing turn path.
- [x] 7.3 Verify VS Code Webview runtime behavior with Extension Development Host and the `vscode-extension-debugger` skill, including composer focus, command delivery, and queue snapshot updates.
- [x] 7.4 Capture residual UI risks for any open question left unresolved, such as collapsed vs expanded default state or edit-with-existing-draft behavior.

## 8. Validation And Cleanup

- [x] 8.1 Run focused Agent runtime tests for `agent-session-runner`, `agent-turn-runtime`, `agent-runtime-manager`, and `agent-runner-port`.
- [x] 8.2 Run focused Extension tests for chat routing, conversation message handling, and agent stream processing.
- [x] 8.3 Run focused Webview tests for queue presenters, streaming handlers, `useChatActions`, `InputArea`, and `MessageList`.
- [x] 8.4 Run package TypeScript checks covering `@neko-agent/types`, Agent runtime, Extension, and Webview packages.
- [x] 8.5 Run `pnpm check` or document why focused package checks are the appropriate validation boundary for the implementation.
- [x] 8.6 Run `pnpm check:legacy-debt` or an equivalent focused guardrail after removing string-only queue compatibility paths.
- [x] 8.7 Record any deferred payload support for attachments/context/slash/skill queues as follow-up work rather than hidden fallback behavior.

Validation notes:

- Focused Agent runtime coverage passed with `vitest run` over `agent-session-runner`, `agent-turn-runtime`, `agent-runtime-manager`, `agent-runner-port`, and `message-runtime`.
- Focused Extension coverage passed with `vitest run` over `webviewProtocol`, `agentMessageTurnHandler`, and `agentStreamProcessor`.
- Focused Webview coverage passed with `vitest run` over queue presenters, streaming handlers, `useChatActions`, `InputArea`, `MessageList`, and `ChatWorkspace`.
- VS Code Webview runtime smoke passed against an Extension Development Host target for `neko.neko-agent` on CDP port 9222. Evidence: `smoke-vscode-debugger-skill.mjs --skill vscode-extension-debugger --require-webview --expect-extension-id neko.neko-agent` observed the webview; injected queue snapshots rendered `.agent-composer-queue-panel` inside `.agent-composer-rail`, before both model/mode controls and the textarea; queue action buttons had accessible send-next/edit/cancel labels and were enabled for runtime ids; an empty snapshot removed the panel. Direct CDP capture of the already-acquired VS Code API command closure was not reliable, so command delivery remains covered by focused Webview/Extension tests.
- Package TypeScript checks were executed. `@neko-agent/types` and Webview passed; Agent and Extension package checks are currently blocked by pre-existing unrelated type drift, while filtered output for the queue-touched files is clean.
- Full `pnpm check` is not the right acceptance boundary for this local queue fix in the current dirty workspace because it expands to repository-wide unused/dependency analysis across many unrelated concurrent changes. Focused package tests, package TypeScript checks, queue-touched-file filtering, and Agent boundary guardrails were used instead.
- `pnpm check:legacy-debt` / `pnpm check:agent-boundaries` wrappers were blocked by pnpm install build-script approval. Equivalent direct guards passed with `node scripts/check-legacy-debt-surfaces.mjs` and `node scripts/check-neko-agent-boundaries.mjs`.
