## Context

The Agent TUI currently keeps a `TuiMessageQueue` inside `useAgentSession`, publishes snapshots to `useAgentStore`, manually drains queued prompts after each turn, and projects queue acceptance through `event-adapter.ts` as system transcript messages. The input remains enabled while a turn runs and `/queue` exposes item operations, but `App.tsx` has no queue panel above `InputEditor`; users primarily see an internal id such as `queue-1` in the transcript and a count in `StatusBar`.

The shared Agent runtime already owns an item-aware pending-message queue for other surfaces. Webview queue controls treat runtime snapshots as authoritative and keep pending prompts outside the transcript. TUI therefore has the right user capability but the wrong presentation boundary and a parallel execution owner.

This is a local terminal UI and Agent runtime change. It does not require a generic distributed queue, durable persistence, Rust Engine work, or Webview UI changes.

### Five-layer analysis

- **Responsibility:** Agent runtime owns accepted queue item identity, order, lifecycle, cancellation, and release into a turn. TUI owns composer intent, terminal presentation, keyboard focus, and visible diagnostics.
- **Dependency:** `cli-tui` depends on Agent queue contracts and a narrow runtime/session port. Agent runtime does not depend on Ink, Zustand, or TUI components.
- **Interface:** Existing `AgentQueuedMessageItem` and `AgentMessageQueueSnapshot` remain the data contract. The TUI consumes snapshot and operation ports rather than a package-local execution queue. Current-turn steering is not added to this interface.
- **Extension:** Queue rows are package-local terminal components with source-aware actions. A later Steer capability can add a separate submission policy without changing queue item semantics.
- **Testing:** Pure presenter/component tests cover layout and actions; command tests cover terminology and stale ids; session/runtime tests prove ordering, cancellation, and canonical path use; focused Agent evaluation covers running-turn submission and continuation projection.

## Goals / Non-Goals

**Goals:**

- Keep running-turn text follow-ups available.
- Show pending content and order in a stable queue panel above the composer.
- Keep queue acceptance, promotion, edit, and cancellation out of ordinary transcript history.
- Align labels with real behavior: promotion means "send next after the active turn", not interruption.
- Make continuation priority and active-turn cancellation deterministic and testable.
- Move queue execution ownership to the shared Agent runtime and remove the TUI-local successful path.

**Non-Goals:**

- Current-turn steering.
- Active-turn preemption.
- Durable pending-message persistence.
- Queuing unsupported slash, Skill, attachment, or execution-metadata payloads.
- A cross-package generic queue framework.
- Webview visual changes.

## Decisions

### 1. Queue state is rendered in a composer rail, not the transcript

Add an Agent-local `MessageQueuePanel` between modal/approval surfaces and `InputEditor`. It reads the authoritative snapshot, displays a compact ordered preview, and exposes source-appropriate controls. Queue acceptance events update snapshot state but do not call `addSystemMessage` for user-authored pending prompts.

Internal continuations may use a distinct activity/timeline projection when their domain event is meaningful, but the generic queue acceptance message is not a transcript row.

**Alternative rejected:** keep `Queued message: queue-1` and add richer `/queue list`. This leaves normal use undiscoverable and continues to confuse pending state with sent history.

### 2. Runtime ids remain operational, while primary copy uses content

Rows display truncated content, order, source label, and count. Stable ids remain available to slash commands, diagnostics, automation facts, and optional verbose output, but are not the primary label.

**Alternative rejected:** hide ids everywhere. Terminal commands and stale-item diagnostics still need an unambiguous identity.

### 3. Promotion is named send-next and never means preemption

The canonical command family is `/queue promote <id>` and `/queue send-next <id>`. `/queue send-now` no longer returns success and emits a visible migration diagnostic. UI labels use "Send next".

**Alternative rejected:** keep `send-now` as an alias. The active turn cannot be interrupted, so successful "now" language is false.

### 4. Queue ordering has one explicit eligibility policy

A snapshot preserves display order. Drain chooses the first eligible item according to a documented policy. Internal continuation priority, if retained, is displayed as a separate priority class and `promote` for a user item promises only the next eligible user follow-up. If product behavior requires global next-item promotion, the runtime drain policy must change before the UI makes that promise.

Initial implementation keeps internal continuation priority because it closes task/subagent result loops, and labels user promotion as "Next user message" when a higher-priority continuation is pending.

**Alternative rejected:** leave array order and hidden continuation priority inconsistent.

### 5. Escape cancels only the active turn and pauses automatic queue drain

Existing accepted pending messages are not silently deleted by Escape, matching the prior TUI control-surface contract. After cancellation the queue remains visible and does not auto-start until the user submits/promotes/resumes through an explicit action. This avoids both data loss and unexpected execution.

**Alternative rejected:** clear the queue on Escape. Pending user-authored work has value and the completed TUI specification already defines Escape as active-turn cancellation only.

### 6. Shared Agent runtime becomes the only execution authority

Migration proceeds in two steps:

1. Complete snapshot-driven TUI projection using current ports, with tests that queue state never enters the transcript.
2. Add/use a narrow runtime-owned queue facade for TUI enqueue, operations, and drain. Poison the package-local queue path in canonical-path tests, then remove `messageQueueRef`, `drainQueuedPrompts`, and `cli-tui/core/message-queue.ts` execution ownership.

Pure TUI formatting helpers may remain package-local; mutation and drain policy may not.

**Alternative rejected:** indefinitely synchronize two queue implementations. Dual ownership will continue to drift in cancellation, continuation priority, and snapshot versions.

### 7. Steer remains a separate future contract

Until Agent runtime has an active-turn inbox with accepted/rejected acknowledgement, running-turn Enter is explicitly described as queueing the next turn. Tab remains available for suggestion completion and is not repurposed in this change.

**Alternative rejected:** rename current queue submission to Steer. That would claim the model can observe input in the active turn when it cannot.

## Risks / Trade-offs

- **[Dirty concurrent workspace can cause overlapping edits]** → Change only queue-owned hunks, inspect diffs before staging, and stage explicit files/hunks per batch.
- **[Queue panel increases terminal height or flicker]** → Use fixed row count in collapsed mode, truncate content, avoid timers, and subscribe only to the queue snapshot slice.
- **[Continuation priority surprises users]** → Display continuation source/priority and test exact release order.
- **[Runtime convergence touches AgentSession flow]** → Split presentation and runtime migration into separate commits; add path-level tests before deleting the local implementation.
- **[Removing `send-now` breaks scripts]** → This is a prelaunch command cleanup; return a fail-visible migration diagnostic naming `/queue send-next` rather than silently aliasing.
- **[Queue remains after Escape]** → Keep it visible and paused, and require an explicit resume/send action before drain.

## Migration Plan

1. Add queue presenter/component tests and composer placement.
2. Stop generic user queue acceptance from creating transcript messages.
3. Correct command/UI terminology and ordering/cancellation tests.
4. Introduce or expose the shared runtime queue facade needed by TUI.
5. Route enqueue, snapshot, operations, and release through the runtime facade.
6. Poison and remove the TUI-local queue/drain path.
7. Run focused TUI tests, Agent runtime tests, Agent evaluation, type checks, legacy-debt checks, and quality review.

Rollback can revert each commit independently. No durable data migration is required because pending queue state is process-local.

## Open Questions

- Whether a dedicated explicit "resume queue" command is preferable to using `/queue send-next <id>` after Escape will be resolved during interaction tests.
- Rich queued references and current-turn steering remain separate follow-up changes.
