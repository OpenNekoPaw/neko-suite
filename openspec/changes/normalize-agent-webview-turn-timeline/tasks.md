## 1. Contract And Characterization

- [x] 1.1 Add characterization tests that reproduce the current active-turn ordering bug for `streamText -> toolCall -> streamText` in Webview message projection.
- [x] 1.2 Add characterization tests for current `streamComplete.contentBlocks` replacement reordering an already rendered active assistant message.
- [x] 1.3 Add characterization tests for current media/task placement paths: tool-owned background task, `mediaTaskCreated` synthetic assistant message, and delayed progress update.
- [x] 1.4 Add characterization tests for immediate tool failure placement and current final-error-message behavior.
- [x] 1.5 Define Agent turn timeline DTOs in `@neko-agent/types` with `conversationId`, `turnId`, `messageId`, `itemId`, `sequence`, `kind`, status, parent anchors, timestamps, and typed payloads.
- [x] 1.6 Add webview-protocol tests for valid timeline events, invalid events, duplicate ids, missing anchors, and parentless task/media events.

## 2. Runtime And Extension Event Projection

- [x] 2.1 Extend Agent stream state/runtime to assign stable turn ids and monotonic sequence values for streamed text, thinking, tool calls, tool results, backfills, errors, and completion.
- [x] 2.2 Update stream segmentation so runtime tests prove structural events close active text segments and later text starts a new segment.
- [x] 2.3 Project tool calls, results, confirmations, failures, and backfills into timeline event messages with explicit `toolCallId` and parent anchors.
- [x] 2.4 Project background task and media task creation/progress/completion messages with explicit parent anchors when the source is a tool result.
- [x] 2.5 Preserve final assistant `Message.contentBlocks` snapshots for persistence while marking them as final snapshots, not active-turn visual ordering authority.
- [x] 2.6 Add runtime/extension tests proving event sequence and parent anchors are produced without Webview placement guessing.

## 3. Webview Timeline Store And Handlers

- [x] 3.1 Implement a pure active-turn timeline store/updater for create, append text, close text, upsert tool, update result, attach task/media, attach error, complete turn, and clear conversation.
- [x] 3.2 Ignore duplicate `streamText` and `streamThinking` after canonical timeline delivery while keeping completed-history fallback for conversations without active timeline state.
- [x] 3.3 Reject active-turn `toolCall`, `toolResult`, `toolResultBackfill`, and `toolConfirmation` messages unless they arrive as `agentTurnTimeline` or are duplicate notifications for already-present canonical items.
- [x] 3.4 Reject active-turn `taskCreated`, `taskUpdated`, `mediaTaskCreated`, and `mediaTaskProgress` messages unless they arrive as `agentTurnTimeline` or are duplicate notifications for already-present canonical items; explicit parentless turn-level items must be timeline events.
- [x] 3.5 Route conversation-scoped errors through canonical timeline error items when a turn is active and reject non-timeline active-turn error creation.
- [x] 3.6 Update non-current conversation caches and active conversation switching to retain active timeline state independently of visible `messages`.

## 4. Webview Presenters And Components

- [x] 4.1 Add a timeline-to-message-list presenter that renders active timeline items in sequence order and estimates stable virtualized row heights.
- [x] 4.2 Update `MessageList` to prefer active timeline projections for active turns while still rendering completed history from `Message.contentBlocks`.
- [x] 4.3 Reuse `ToolCallDisplay`, `ToolCallGroupDisplay`, `TaskCard`, `RichContentRenderer`, `ContentBlockItem`, and `ProcessRecordsGroup` as item renderers fed by timeline projections.
- [x] 4.4 Update process grouping so it only groups adjacent eligible timeline process items and never crosses text, visible tool failures, media, plans, diffs, or composites.
- [x] 4.5 Update media projection so tool-returned media, document thumbnails, artifacts, perception cards, and completed task media render at the anchored timeline item when ready.
- [x] 4.6 Update structured content projection so streamed incomplete composite/gallery/storyboard payloads remain text/code until closed, parsed, validated, and resource-projected.
- [x] 4.7 Ensure timeline item rendering preserves accessible labels, copy/open/send-to actions, collapse state, and existing i18n strings or adds focused new strings where necessary.
- [x] 4.8 Insert late-arriving assistant turn projections at their cross-turn chronological position without globally reordering stable history.

## 5. Non-Timeline Active Path Cleanup

- [x] 5.1 Disable active-turn visual replacement from `streamComplete.contentBlocks`; completion may finalize items and store the persisted message snapshot only.
- [x] 5.2 Restrict synthetic media assistant messages to explicitly parentless migration or turn-level events and remove tool-owned media success through that path.
- [x] 5.3 Remove or fail-close fallback placement that guesses target message by last assistant message for active timeline-owned tool/task/media updates.
- [x] 5.4 Add poisoned-path tests proving the new timeline path is hit and old content-block replacement or synthetic message success paths cannot mask failures.
- [x] 5.5 Update stale fixtures and tests that assume one assistant response block per turn or bottom-appended async media messages.

## 6. Validation

- [x] 6.1 Run focused Vitest suites for Agent stream state/runtime, Webview protocol, streaming/tool/task/media handlers, timeline presenters, and ChatView message list rendering.
- [x] 6.2 Run targeted tests proving `text -> tool -> text -> failed tool -> retry/success -> media -> final text` renders and remains ordered after completion.
- [x] 6.3 Run reload projection tests proving completed `Message.contentBlocks` history renders correctly without active timeline state.
- [x] 6.4 Run `pnpm check` and record any residual type/lint risks.
- [x] 6.5 Run `pnpm test -- --run` or the repository-equivalent affected test command and record residual risk if full test is too large.
- [x] 6.6 Run a real Extension Development Host functional scenario with `vscode-extension-debugger` evidence for live streaming, tool failure, task progress, media rendering, completion, scroll behavior, and conversation switching.
- [x] 6.7 Run `pnpm check:legacy-debt` or confirm equivalent coverage from `pnpm check:quality` after removing old fallback/synthetic paths.
- [x] 6.8 Add and run a regression test proving a late first-turn assistant projection renders before a later second user message.

## 7. Documentation And Handoff

- [x] 7.1 Update `packages/neko-agent/ARCHITECTURE.md` or package docs if the timeline becomes a stable Agent Webview architecture concept.
- [x] 7.2 Document that no active-turn temporary compatibility shim remains, with completed-history reload source and validation commands.
- [x] 7.3 Add implementation notes to the change before archive summarizing final contract names, affected handlers, validation commands, and residual risks.
