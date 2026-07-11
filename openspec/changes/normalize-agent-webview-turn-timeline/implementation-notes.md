## Implementation Notes

### Final Contracts

- `AgentTurnTimelineMessage`
- `AgentTurnTimelineItem`
- `AgentTurnTimelineItemKind`
- `AgentTurnTimelineItemStatus`
- `buildAgentTurnTimelineMessage`
- `validateAgentTurnTimelineMessage`
- `parentAnchor: 'tool_call' | 'turn' | 'item'`
- `parentToolCallId`
- `parentScope: 'turn'` for explicitly turn-level media/task delivery

### Runtime And Extension Projection

- `AgentEventStreamRuntimeProcessor` now creates a per-turn timeline projection with stable `turnId`, `messageId`, `itemId`, and monotonic `sequence`.
- Runtime emits `agentTurnTimeline` before any non-timeline duplicate notification for the same source event.
- Tool calls, results, confirmations, failures, and result backfills update the original `tool-*` timeline item.
- Tool result updates preserve the original tool item `createdAt`; result, confirmation, and backfill arrival only advance `updatedAt`.
- Background task progress is projected to timeline work items before any non-timeline task notification.
- Direct media turns emit `parentScope: 'turn'` so parentless media is explicit.
- Extension resource projection handles `agentTurnTimeline.events` and `agentTurnTimeline.finalContentBlocks`, so media/document refs are Webview-safe before display.

### Webview Handling And Presentation

- Active turns store timeline state in `conversationStreaming.activeTurnTimeline`.
- `agentTurnTimeline` is the canonical live ordering path. The Webview projects it into assistant `Message.contentBlocks` so existing renderers remain reused.
- Active timeline duplicate detection for tool/task/media handlers uses shared timeline item lookup helpers from `timeline-handlers.ts`.
- `streamText` and `streamThinking` are ignored when an active timeline for the message exists, because the runtime sends canonical timeline events first.
- `streamComplete.contentBlocks` completes the active timeline and stores final snapshot data; it does not replace live display order.
- Tool/task/media/error non-timeline messages for active timeline turns do not create or update UI. They are ignored only when the matching canonical timeline item/result/error is already present; otherwise they fail visibly via `setGlobalError`.
- Conversation-scoped errors become immediate timeline error items only when they arrive as `agentTurnTimeline` events.
- Synthetic media assistant messages remain only for non-active-timeline conversations; active media, including explicit turn-level media, must use timeline anchoring.
- Accessibility and action audit: timeline projection still feeds existing `MessageList`/`ContentBlockItem` render paths and keeps `workItemIds` on the projected assistant message. Tool cards continue to use `ToolCallDisplay` for expand/collapse, open-file, copy, confirmation, and task anchoring actions; media and structured blocks continue through `TaskCard`, `RichContentRenderer`, and `SendToMenu`. No new timeline-only visual component or i18n surface was added for these controls.

### Validation Commands

- `openspec validate normalize-agent-webview-turn-timeline --strict`
  - Passed.
- `git diff --check -- <timeline touched files>`
  - Passed.
- `cd packages/neko-agent && ../../node_modules/.bin/vitest run packages/agent-types/src/__tests__/webview-protocol.test.ts packages/agent/src/runtime/__tests__/agent-event-stream-runtime.test.ts --config vitest.config.ts`
  - Passed: 2 files, 49 tests.
- `cd packages/neko-agent && ../../node_modules/.bin/vitest run packages/agent-types/src/__tests__/webview-protocol.test.ts packages/agent/src/runtime/__tests__/agent-event-stream-runtime.test.ts packages/extension/src/chat/message/__tests__/agentStreamProcessor.test.ts packages/extension/src/services/dashboardWorkItemSource.test.ts --config vitest.config.ts`
  - Passed: 4 files, 91 tests.
- `cd packages/neko-agent/packages/webview && ../../../../node_modules/.bin/vitest run src/handlers/__tests__/work-item-handlers.test.ts src/presenters/__tests__/active-turn-timeline-presenter.test.ts src/presenters/__tests__/message-list-presenter.test.ts src/components/ChatView/MessageList.test.tsx --config vitest.config.ts`
  - Passed: 4 files, 55 tests.
  - Covers active non-timeline rejection, canonical media/task anchoring, immediate timeline errors, completed-history `Message.contentBlocks` projection, and `text -> tool -> text -> failed tool -> retry/success -> media -> final text` completion order.
- `cd packages/neko-agent/packages/agent-types && ../../../../node_modules/.bin/tsc -p tsconfig.json --noEmit --pretty false`
  - Passed.
- `cd packages/neko-agent/packages/webview && ../../../../node_modules/.bin/tsc -p tsconfig.json --noEmit --pretty false`
  - Passed.
- `cd packages/neko-agent/packages/extension && ../../../../node_modules/.bin/tsc -p tsconfig.json --noEmit --pretty false`
  - Blocked by current worktree type errors outside this timeline change: `../agent/src/task/task-view-projector.ts` references `RenderableGeneratedAsset.draftRef`.
- `cd packages/neko-agent/packages/agent && ../../../../node_modules/.bin/tsc -p tsconfig.json --noEmit --pretty false`
  - Blocked by broad current worktree type drift in existing tests and `src/task/task-view-projector.ts`; rerun after the review fix still showed no `agent-event-stream-runtime.ts` timeline type error in the reported failures.
- `cd packages/neko-agent/packages/webview && ../../../../node_modules/.bin/vitest run src/components/ChatView/MessageList.test.tsx --config vitest.config.ts`
  - Passed after aligning the stale test expectation to the current `Active Skill records` label and `Clear record: ...` button name.
- `npx -y pnpm@10.29.2 --version`
  - Passed: `10.29.2`. The repository and `node_modules/.modules.yaml` both record `pnpm@10.29.2`; using the Codex runtime `pnpm@11.7.0` was the cause of the earlier dependency-state purge prompt.
- `npx -y pnpm@10.29.2 check`
  - Ran after switching to the repository pnpm version.
  - Failed in `check:unused` / `knip` on existing non-timeline issues: unused dependencies `adm-zip`, `cheerio`, `@neko/content`, `adm-zip`; unused exports `setRootLogger` and `getRootLogger`; and existing `knip.config.ts` / package entry configuration hints.
  - The timeline-owned unused exports reported in the first rerun (`applyTimelineMessageToConversation`, `clearActiveTurnTimelineForMessage`, `projectActiveTurnTimelineToMessage`) were fixed by making those helpers internal.
- `npx -y pnpm@10.29.2 check:deps`
  - Passed: dependency-cruiser reported no dependency violations across 1679 modules and 6183 dependencies.
- `npx -y pnpm@10.29.2 check:legacy-debt`
  - Passed after clearing the remaining blocking surfaces.
  - Removed/renamed production and test surfaces in the scoped cleanup boundary:
    `artifact-service.ts` managed-artifact path wording, queue snapshot
    version naming in `conversationHandler.ts` / `agent-turn-runtime.ts`,
    request-time Skill projection adapter comments, and the retired single-slot
    diagnostic code -> `single-injection-slot-blocked`.
- `npx -y pnpm@10.29.2 check:legacy-debt:ledger`
  - Passed ledger validation. Warning remains for `REQ-LCDR-014` because the
    required coverage pattern `packages/neko-types/src/vscode/extension/*resource-cache-provider.ts`
    currently has no matches.
- `cd packages/neko-agent && npx -y pnpm@10.29.2 exec vitest run packages/webview/src/presenters/__tests__/skill-presenter.test.ts packages/extension/src/chat/handlers/__tests__/conversationMessageHandler.test.ts packages/agent/src/runtime/__tests__/artifact-service.test.ts packages/agent/src/runtime/__tests__/agent-turn-runtime.test.ts packages/agent/src/skill/__tests__/stage-persona-binding.test.ts --config vitest.config.ts`
  - Passed: 4 files, 50 tests under the root Agent Vitest config.
- `cd packages/neko-agent/packages/webview && npx -y pnpm@10.29.2 exec vitest run src/presenters/__tests__/skill-presenter.test.ts --config vitest.config.ts`
  - Passed: 1 file, 2 tests under the Webview Vitest config.
- `npx -y pnpm@10.29.2 smoke:webview:runtime`
  - Passed: `vscode-debugger-skill-smoke` observed 2 VS Code page targets and 5 Webview targets, including `neko.neko-agent`.
  - The command validates that the VS Code/Electron debugger skill can see Extension Webview runtime targets. It does not by itself exercise a scripted long-turn transcript with live tool failure/retry/media interactions.

### Residual Risks

- `pnpm check` now runs under the repository pnpm version, but remains blocked from passing by existing knip unused-dependency/export/config issues outside the timeline path.
- VS Code Extension Development Host smoke now starts and observes Neko Agent Webview targets. A scripted long-turn transcript with live tool failure/retry/media interactions, scroll behavior, focus, and conversation switching remains useful before archive if visual acceptance is required.
- `streamText`/`streamThinking` are intentionally not routed through non-timeline message mutation when active timeline exists; they are discarded after canonical timeline delivery. If a provider emits stream chunks without matching `agentTurnTimeline`, the active timeline path should fail visibly rather than append through direct message mutation.
- Existing completed-history rendering still uses persisted `Message.contentBlocks`; focused message-list presenter tests cover this reload source, but VS Code Webview runtime smoke is still needed before archive.

### Active-Turn Non-Timeline Path Cleanup

- Owner: `neko-agent` Webview/Extension messaging.
- Active Agent turns receive `agentTurnTimeline` first and render through `conversationStreaming.activeTurnTimeline`.
- No active-turn side adapter remains in the Webview presenter: `createAgentTurnTimelineMessageFromLegacyEvent` and the old Webview-side event projection helpers were removed.
- Fail-closed behavior: active timeline-owned tool/task/media/error messages that arrive outside `agentTurnTimeline` are rejected via `setGlobalError` unless the same canonical item/result/error is already present and the message is only a duplicate notification. Active timeline-owned `toolResultBackfill` is always rejected unless it arrives as `agentTurnTimeline`; active timeline-owned `streamComplete.contentBlocks` finalizes the timeline snapshot but does not reorder display.
- Durable completed-history rendering still uses persisted `Message.contentBlocks`; this is not an active-turn live path and remains the reload source.
- Validation command: focused runtime, extension, webview handler, presenter, MessageList suites, dependency-cruiser, legacy-debt gate, legacy-debt ledger, and VS Code Webview runtime target smoke now pass under `pnpm@10.29.2`; `pnpm check` still fails on existing non-timeline `knip` unused/config gates recorded above.

### Conversation Activation Markdown Session Reconciliation (2026-07-11)

- Root cause: per-conversation cache retained the canonical `activeTurnTimeline`, while the module-level normalized Markdown registry could be disposed independently during Webview cleanup/remount. Returning to a cached Tab therefore rendered Timeline-owned Markdown without its parser session. Session keys already include `conversationId`, `messageId`, and `itemId`; this was a lifecycle/commit-order defect, not a cross-conversation key collision.
- `AgentMarkdownSessionRegistry.commitTimelineSnapshot()` now reconciles `assistant_text` and `thinking` sessions from the authoritative Timeline snapshot. It creates missing sessions, replaces stale source generations/revisions, finalizes completed items, and removes sessions omitted from the same conversation/message snapshot.
- All four foreground activation paths now cross the same reconciliation boundary: normal UI Tab activation, character-role UI Tab activation, Extension `tabState`, and Extension `activeConversation` restoration.
- Activation commit order is explicit: reconcile the Markdown registry, commit conversation cache/refs/visible React state, then publish external-store notifications. `MarkdownRenderer` remains strict and does not fall back when a Timeline-owned session is missing.
- Unavailable Timeline snapshots remain fail-closed and are released before reconciliation; the activation path does not recreate rejected ownership.

#### Focused Validation

- `pnpm --filter @neko-agent/webview exec tsc --noEmit --pretty false`
  - Passed.
- `pnpm --filter @neko-agent/webview exec vitest run src/markdown/agent-markdown-session-registry.test.ts src/handlers/__tests__/character-role-context-isolation.test.ts src/components/ConversationController.test.tsx`
  - Passed: 3 files, 47 tests.
- `pnpm --filter @neko-agent/webview test`
  - Passed: 83 files, 741 tests.
- `pnpm --filter @neko-agent/webview build`
  - Passed; Vite reported only the existing Browserslist age and large-chunk warnings.
- `pnpm --dir packages/neko-agent run compile:webview`
  - Passed and copied the production Webview bundle into the extension package.
- `pnpm smoke:webview:runtime`
  - Passed: observed two VS Code page targets and two Webview targets, including `neko.neko-agent` in the Extension Development Host.
- VS Code CDP inspection of the visible Neko Webview target found no current `Normalized Markdown streaming session is missing` text and no Neko console error during the observation window. This is runtime presence/console evidence, not a complete scripted long-turn interaction test.
- `pnpm check:legacy-debt`
  - Failed on 87 blocking occurrences in unrelated concurrent worktree changes (`migrate-now` and `needs-review` classes). The eight Webview files in this fix did not add `legacy`, `fallback`, or `deprecated` production paths.

#### Remaining Runtime Risk

- The registry remains a module singleton inside one Webview JavaScript realm, and `useMessageHandler` cleanup still disposes it on unmount. Foreground activation now deterministically reconstructs it from the canonical per-conversation Timeline, including StrictMode/remount loss, but a fully scripted `Tab A streaming -> Tab B foreground -> A background updates -> return to A` Extension Development Host scenario remains the strongest final acceptance evidence.
- Background Timeline mutations update the owning conversation cache even when that conversation is hidden. Badge/status projection frequency is still separate from Markdown ownership and should be observed during the scripted switching scenario if UI freshness remains a concern.
