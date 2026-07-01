## 1. Command Surface Foundation

- [x] 1.1 Audit current Ink TUI and non-Ink interactive CLI command paths for `/plan`, `/ask`, `/auto`, `/model`, `/media`, `/skill`, `/status`, `/clear`, `/compact`, `/history`, `/resume`, `/market`, command artifacts, and `$skill` invocation.
- [x] 1.2 Introduce a shared TUI control command router/facade that accepts explicit host dependencies for session, config, Skill service, tool registry, queue, context, task, and artifact/reference ports.
- [x] 1.3 Move duplicated command handling from Ink `useSlashCommands` and non-Ink `runner.ts` special cases onto the shared router without changing existing command behavior.
- [x] 1.4 Add focused command-router tests for existing commands to prove the canonical router path is hit and old special-case paths no longer own the behavior.

## 2. Mode Model And Parameter Commands

- [x] 2.1 Add `/mode` commands for session mode selection and status, including diagnostics for unsupported modes.
- [x] 2.2 Upgrade `/model` and `/media` to list and select explicit provider/model identities when available, while preserving readable terminal labels.
- [x] 2.3 Add `/param` command handling for LLM presets and media generation parameters, routed through existing capability validation.
- [x] 2.4 Update TUI status output to show compact active execution mode, session mode, LLM model identity, media model summary, and active Skill lifecycle summary.
- [x] 2.5 Add tests for mode/model/media/parameter command success, invalid identity diagnostics, and unsupported parameter diagnostics.

## 3. Prefix Suggestions

- [x] 3.1 Refactor `InputEditor` suggestion state so `/`, `$`, and `@` are handled as distinct trigger namespaces with one active menu at a time.
- [x] 3.2 Wire `/` suggestions to the command catalog and command artifacts.
- [x] 3.3 Wire `$` suggestions to enabled Skills and dispatch selected entries through canonical Skill lifecycle invocation.
- [x] 3.4 Wire `@` suggestions to terminal-safe file/context/reference candidates and insert or attach references without Webview previews/chips.
- [x] 3.5 Add Ink component tests for `/`, `$`, and `@` filtering, selection, Escape close, and namespace isolation.

## 4. Context Controls

- [x] 4.1 Expose context token count and context compression methods from the TUI session hook/runner through explicit command-router dependencies.
- [x] 4.2 Implement context token/status fields in `/status` and context compaction through canonical `/compact`.
- [x] 4.3 Display compression results with original tokens, compressed tokens, and ratio when available.
- [x] 4.4 Add tests proving `/status` reports context diagnostics, `/compact` uses the runtime compaction path, and missing context ports fail visibly.

## 5. Message Queue And Cancellation

- [x] 5.1 Extend TUI state to track authoritative message queue snapshots, item ids, versions, and queue diagnostics per conversation/session.
- [x] 5.2 Allow running-turn TUI input to submit queue-compatible text prompts instead of disabling all input during active runs.
- [x] 5.3 Implement `/queue list`, `/queue promote <id>`, `/queue cancel <id>`, and `/queue edit <id>` against the item-aware runtime queue.
- [x] 5.4 Preserve Escape as active-turn cancellation only and ensure it does not clear queued messages.
- [x] 5.5 Add tests for enqueue while running, non-queueable input diagnostics, stale id diagnostics, promote/cancel/edit behavior, and Esc cancellation boundaries.

## 6. Timeline And Process Projection

- [x] 6.1 Add a terminal turn projector that consumes ordered Agent timeline/work-item/process events and produces compact terminal rows with stable ids and parent anchors.
- [x] 6.2 Replace last-assistant-message structural mutation for tools/tasks/media/errors with timeline-aware projection while preserving streaming text rendering.
- [x] 6.3 Display tool confirmations, results, failures, and backfills with originating tool call ids.
- [x] 6.4 Display task and media progress with task id, status, parent identity, and concise progress details.
- [x] 6.5 Add fixture tests for `text -> tool -> text`, tool failure anchoring, background task progress, media progress, and invalid/unknown anchor diagnostics.

## 7. Artifact And Reference Formatting

- [x] 7.1 Add a terminal reference formatter for image/video/audio/document/artifact outputs using stable refs, asset ids, task ids, media kind, dimensions/duration/probe summaries, and workspace-relative or `${VAR}/path` paths.
- [x] 7.2 Ensure formatter rejects or omits Webview URI, blob URL, temp absolute path, and runtime cache path as durable identities.
- [x] 7.3 Implement `/artifact list`, `/artifact show <id>`, `/artifact open <id>`, and `/artifact send <target> <id>` when corresponding host/runtime actions are available, with visible diagnostics otherwise.
- [x] 7.4 Add tests for image, video, audio, and document reference summaries plus poisoned Webview/blob/temp/cache path fixtures.

## 8. Validation And Documentation

- [x] 8.1 Update TUI command help and user-facing text so `/`, `$`, and `@` meanings are clear and terminal-specific.
- [x] 8.2 Add or update TUI snapshot tests for status bar, input suggestions, queue display, context status, and timeline/reference rows.
- [x] 8.3 Run focused TUI tests for `packages/neko-agent/packages/cli-tui` and affected Agent runtime/type tests.
- [x] 8.4 Run `pnpm check` or document the narrower validation set if the implementation scope is limited to focused TUI changes.
- [x] 8.5 Record residual risks for any unavailable host action, deferred command compatibility, or formatter field intentionally deferred.
