## Why

Neko Agent Webview currently renders live stream chunks, tool calls, async task
updates, media previews, and final assistant snapshots through competing message
projections. This causes visible order jumps: text continues streaming into an
earlier Response block after tools run, tool failures may appear late, and media
tasks do not share one placement rule.

This should be addressed now because Agent skills increasingly mix long
streaming explanations, document/image tools, background media tasks, structured
content, and recoverable errors in one turn. The Webview needs a deterministic
turn timeline before more Agent workflows depend on the current unstable
ordering behavior.

## What Changes

- Introduce an Agent Webview turn timeline capability that treats each Agent
  turn as an ordered list of display items rather than rendering directly from a
  mutable assistant-message `contentBlocks` array.
- Add a typed live projection contract for turn events with stable `turnId`,
  message id, item id, sequence, status, and parent anchors such as
  `parentToolCallId`.
- Make streaming text render at the current timeline cursor:
  - a tool call closes the active text segment;
  - text after a tool call creates a new response segment;
  - final stream completion must not reorder already rendered live items.
- Normalize tool placement:
  - tool calls create stable timeline items;
  - tool results, confirmations, backfills, and failures update the same item;
  - tool errors are visible at the failing tool when the failure arrives.
- Normalize async task placement:
  - background tasks and media tasks attach to the tool item or turn item that
    created them;
  - progress and completion update that anchored item instead of appending a
    synthetic assistant message unless the task truly has no parent.
- Normalize media and structured content rendering:
  - tool-returned images, video, audio, document thumbnails, artifacts, and
    perception cards render at their anchored tool/task item when data is ready;
  - streamed Markdown renders incrementally;
  - structured composite/gallery/storyboard blocks render as structured
    components only after their payload is complete and valid, otherwise they
    remain ordinary streaming text/code.
- Keep persisted conversation `Message.contentBlocks` as a history snapshot and
  reload source, but make the live Webview timeline the canonical presentation
  path during an active turn.
- Add fail-visible diagnostics for illegal timeline events, unknown parent
  anchors, duplicate item ids, non-monotonic sequences, and renderer contract
  mismatches instead of silently appending items to the bottom.
- Remove or fail-close old success paths where `streamComplete.contentBlocks`,
  synthetic media messages, or fallback message mutation can mask broken live
  timeline projection.

Non-goals:

- Do not introduce a generic cross-package timeline framework. This is scoped to
  Neko Agent Webview turn presentation until another package proves identical
  lifecycle semantics.
- Do not change Rust Engine or Protobuf contracts. This is local Agent
  Extension/Webview orchestration and display state.
- Do not persist unfinished live timeline state across VS Code restart beyond
  what can be reconstructed from existing conversation messages and task
  snapshots.
- Do not block ordinary streamed Markdown rendering until the whole answer is
  complete.
- Do not use browser-only or Vite-only validation as acceptance for VS Code
  Webview runtime behavior.

Success criteria:

- A turn containing `text -> tool -> text -> failed tool -> retry/success ->
  media result -> final text` renders in that same order while streaming and
  remains in that order after completion.
- A failed tool shows the error in its tool card immediately when the
  `toolResult` failure arrives, without waiting for the final assistant
  snapshot.
- A media/background task created by a tool remains visually anchored to that
  tool and updates in place through progress and completion.
- Final `streamComplete` and conversation reload do not cause visible response
  or tool reordering.

Compatibility and rollback:

- This is a prelaunch internal Webview/Agent protocol and presenter migration.
  Existing tests and fixtures should move to the new canonical timeline path
  rather than preserving old fallback success behavior.
- Durable conversation history remains `Message[]` with `contentBlocks`; reload
  can rebuild a completed timeline from this snapshot.
- Rollback can restore direct `contentBlocks` rendering for completed history,
  but active live turns must fail visibly if timeline projection is disabled or
  missing during this change.

## Capabilities

### New Capabilities

- `agent-webview-turn-timeline`: Defines ordered Agent turn display semantics for
  streaming text, tool calls/results, async tasks, media, structured content,
  errors, completion, reload projection, and Webview validation.

### Modified Capabilities

- None. The existing `webview-vscode-bridge` and
  `webview-foundation-capabilities` contracts remain transport/foundation
  concerns; this change adds an Agent-domain presentation contract on top of
  those surfaces.

## Impact

- Contracts:
  - `packages/neko-agent/packages/agent-types/src/webview-protocol.ts`
  - `packages/neko-agent/packages/agent-types/src/message.ts`
  - Agent stream/timeline DTOs in `packages/neko-agent/packages/agent/src/runtime`
- Runtime and Extension:
  - `packages/neko-agent/packages/agent/src/runtime/agent-stream-state.ts`
  - `packages/neko-agent/packages/agent/src/runtime/agent-event-stream-runtime.ts`
  - `packages/neko-agent/packages/extension/src/chat/message/agentStreamProcessor.ts`
  - `packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts`
  - task/media delivery bridges that currently emit anchored or synthetic
    messages
- Webview:
  - `packages/neko-agent/packages/webview/src/handlers/streaming-handlers.ts`
  - `packages/neko-agent/packages/webview/src/handlers/tool-handlers.ts`
  - `packages/neko-agent/packages/webview/src/handlers/task-handlers.ts`
  - `packages/neko-agent/packages/webview/src/handlers/media-handlers.ts`
  - `packages/neko-agent/packages/webview/src/presenters/message-presenter.ts`
  - `packages/neko-agent/packages/webview/src/presenters/message-list-presenter.ts`
  - `packages/neko-agent/packages/webview/src/presenters/content-block-presenter.ts`
  - `packages/neko-agent/packages/webview/src/components/ChatView/*`
- Validation:
  - focused Vitest coverage for stream/tool/task/media/error timeline ordering
  - reload projection tests from persisted `Message.contentBlocks`
  - VS Code Extension Development Host smoke via `vscode-extension-debugger`
    for runtime rendering, scroll behavior, media display, and failure placement
