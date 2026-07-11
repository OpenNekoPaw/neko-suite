## 1. Queue Projection Contract

- [x] 1.1 Add a pure TUI queue presenter that derives visible rows, count, source labels, truncation, and action eligibility from `AgentMessageQueueSnapshot`.
- [x] 1.2 Add presenter tests for empty, single, multiple, long-content, user-message, and internal-continuation snapshots.
- [x] 1.3 Add terminal localization labels for next-turn queue, send-next, next-user-message, edit, cancel, continuation priority, and paused-after-cancel state.

## 2. Composer Queue Panel

- [x] 2.1 Add an Agent-local `MessageQueuePanel` directly above `InputEditor` with stable collapsed height and ordered content previews.
- [x] 2.2 Wire promote/send-next and cancel controls to existing session queue operations while preserving composer focus.
- [x] 2.3 Add edit-to-composer flow that does not silently overwrite a non-empty draft and rejects editing internal continuations visibly.
- [ ] 2.4 Add Ink component tests for placement, empty hiding, truncation, action wiring, source-specific controls, and draft conflict handling.

## 3. Transcript Boundary Cleanup

- [x] 3.1 Stop user queue acceptance and release snapshot events from creating generic `Queued message: <id>` transcript system messages.
- [x] 3.2 Preserve source-aware task/subagent continuation activity without representing internal continuation prompts as user-authored messages.
- [x] 3.3 Add adapter/session tests proving pending user items stay out of transcript and enter history only through the executing turn path.

## 4. Command And Ordering Semantics

- [x] 4.1 Add canonical `/queue send-next <id>` behavior and make `/queue send-now <id>` fail visibly with migration guidance.
- [x] 4.2 Define queue presenter copy and runtime tests for internal continuation priority versus promoted user-message priority.
- [x] 4.3 Add exact-id/source release-order tests for mixed user and continuation queues.
- [x] 4.4 Update command help, tests, and automation fixtures for the canonical terminology.

## 5. Cancellation And Resume Policy

- [x] 5.1 Add explicit paused-after-active-turn-cancel state without clearing accepted pending items.
- [x] 5.2 Prevent automatic queue drain after Escape until an explicit resume/send-next action occurs.
- [x] 5.3 Add tests for Escape preserving queue items, no unexpected next turn, explicit resume, and status/panel projection.

## 6. Runtime Queue Convergence

- [x] 6.1 Audit and define the minimal Agent runtime queue/session port used by both TUI and existing runtime queue consumers.
- [ ] 6.2 Route TUI enqueue, snapshot, promote, edit, cancel, and release through the explicit-conversation runtime-owned queue port.
- [ ] 6.3 Add canonical-path tests with the TUI-local queue path poisoned so any fallback fails visibly.
- [ ] 6.4 Remove `messageQueueRef`, manual `drainQueuedPrompts`, package-local queue mutation ownership, and obsolete count-only compatibility paths.
- [ ] 6.5 Run legacy-debt and unused-code checks proving the removed TUI-local queue path is no longer reachable.

## 7. Validation And Delivery

- [ ] 7.1 Run focused cli-tui presenter, component, event-adapter, command-router, and session tests after each implementation batch.
- [ ] 7.2 Run focused Agent runtime queue/turn tests and TypeScript checks for affected packages.
- [ ] 7.3 Use `neko-agent-evaluation` to validate running-turn enqueue, mixed continuation ordering, cancellation, and transcript/source projection.
- [ ] 7.4 Run `neko-quality-review`, record validation commands and residual risks, and confirm no Webview/Rust/durable-data boundary changed.
