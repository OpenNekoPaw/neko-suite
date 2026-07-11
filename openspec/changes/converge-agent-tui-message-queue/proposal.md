## Why

Neko Agent TUI can enqueue text while a turn is running, but it exposes queue acceptance as transcript diagnostics such as `Queued message: queue-1`, hides queued content behind slash commands, and maintains package-local drain semantics that can diverge from the Agent runtime queue contract. The queue must remain available for long-running creative workflows, but its user-facing projection and execution ownership need to become explicit before adding Codex-style current-turn steering.

## What Changes

- Add a compact terminal queue panel directly above the TUI composer that displays ordered queued content, count, source, and terminal-native actions without rendering queue acceptance as normal transcript messages.
- Replace misleading "send now" language with "send next" semantics: promotion changes the next eligible queued item after the active turn and never claims to interrupt the active turn.
- Define and test ordering between user follow-ups and internal task/subagent/system continuations so queue controls cannot promise an order the drain policy does not honor.
- Define active-turn cancellation behavior for pending messages and expose the resulting queue state visibly rather than leaving ambiguous automatic work.
- Converge TUI queue commands, snapshots, identity, lifecycle, and drain behavior on the Agent runtime-owned queue port; remove the package-local successful fallback and manual drain path after the canonical runtime path is wired.
- Keep pending messages as transient session state and keep them out of durable conversation history until their turn actually executes.
- Defer current-turn Steer to a separate runtime contract. Until then, running-turn `Enter` remains an explicit next-turn queue action and the UI states that behavior.

Non-goals:

- Do not interrupt or preempt the currently running Agent turn.
- Do not implement current-turn steering in this change.
- Do not persist pending queue items across process restarts.
- Do not introduce a generic cross-package queue framework.
- Do not render queue items as ordinary user or system transcript messages.

Success criteria:

- While the Agent is running, a user can submit multiple text follow-ups and see their content and order above the composer without transcript noise.
- A user can promote, edit, or cancel eligible queued user messages through discoverable terminal controls or canonical `/queue` commands.
- "Send next" ordering matches the runtime drain contract, including documented continuation priority.
- Cancelling the active turn produces a deterministic, visible queue state and never silently starts unexpected work.
- Tests prove the runtime-owned queue path is hit and the removed TUI-local queue path cannot return success.

Compatibility and rollback:

- This is a prelaunch internal cleanup. TUI-local queue ids and count-only transcript diagnostics are not durable data and require no migration.
- `/queue send-now` is removed as a successful alias because it promises unsupported interruption semantics; users use `/queue promote` or `/queue send-next`.
- Rollback may restore the previous TUI projection, but must not create or migrate durable project data.

## Capabilities

### New Capabilities

- `agent-tui-message-queue`: Defines terminal queue presentation, runtime ownership, queue operations, ordering, cancellation, transcript boundaries, and validation behavior.

### Modified Capabilities

- None.

## Impact

- `packages/neko-agent/packages/cli-tui`: composer components, event adapter, session hook, queue command routing, queue projection, localization, and tests.
- `packages/neko-agent/packages/agent`: runtime queue port/facade only where required to make queue ownership authoritative across TUI and Webview surfaces.
- `packages/neko-agent/packages/agent-types`: queue command or snapshot contracts only if existing contracts cannot express the required source/order/cancellation state.
- `openspec/changes/align-agent-tui-control-surface`: remains complete; this change is a focused follow-up rather than reopening its accepted scope.
- No Webview, Rust Engine, Protobuf, CSP, durable project format, or cloud orchestration change is intended.
