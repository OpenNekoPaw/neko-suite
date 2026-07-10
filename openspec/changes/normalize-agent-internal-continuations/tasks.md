## 1. Contracts And Types

- [x] 1.1 Add TUI turn source/display metadata types for user prompts, task-result continuations, subagent-result continuations, and system continuations.
- [x] 1.2 Extend queue item creation so pending user messages and pending continuations carry source, display kind, and execution metadata.
- [x] 1.3 Add typed continuation event/fact shapes for task id, task group id, subagent id, observation id, parent message id, run id, status, and discard/order events.

## 2. TUI Session Execution Path

- [x] 2.1 Add an internal continuation submit path in `useAgentSession` that can call low-level prompt execution without creating a `role: 'user'` transcript message.
- [x] 2.2 Route task-result auto-resume dispatch through the internal continuation submit path instead of ordinary user `submit()`.
- [x] 2.3 Update queue drain ordering so current-parent task-result continuations run before later user queued messages by default.
- [x] 2.4 Add explicit handling for immediate-send, interrupt-current-turn, and discard-continuation semantics at the TUI session/queue boundary.

## 3. Projection, Journal, And Display

- [x] 3.1 Update conversation store/projection so internal continuations appear only as timeline/system events, journal entries, or eval facts, never as user transcript messages.
- [x] 3.2 Update queued event presentation so user queued messages, task continuations, and subagent continuations have distinct terminal text.
- [x] 3.3 Ensure continuation discard/order changes are recorded in timeline or journal with enough information for diagnostics.

## 4. Task Group And Subagent Delivery

- [x] 4.1 Add or wire Task Group metadata for batch task submitters that require `wait-all` result delivery.
- [x] 4.2 Update task result observation handling so explicit `wait-all` groups produce one grouped continuation and missing group metadata is not inferred.
- [x] 4.3 Route subagent completion through `subagent-result-continuation` summaries and artifact references without importing raw sidechain transcript into the main conversation.

## 5. Debug Automation And Eval

- [x] 5.1 Extend debug automation `session.facts` with continuation events, queue item sources, display kinds, parent ids, task ids, group ids, subagent ids, observation ids, and continuation idle state.
- [x] 5.2 Update `session.waitForIdle` so pending internal continuations are included in full-idle decisions and timeout diagnostics.
- [x] 5.3 Update agent eval assertions/reports to require canonical continuation facts and to fail when internal continuation prompts appear as user-authored messages.

## 6. Tests And Validation

- [x] 6.1 Add focused queue tests for source metadata, ordering, immediate-send, and discard-continuation behavior.
- [x] 6.2 Add TUI session tests proving task-result continuations reach model execution without adding user transcript messages.
- [x] 6.3 Add debug automation tests for continuation facts and wait-for-idle behavior.
- [x] 6.4 Add Task Group tests for wait-all aggregation and no inference without explicit group metadata.
- [x] 6.5 Add or update eval scenarios for async image generation quality review and subagent/batch result continuation paths.
- [x] 6.6 Run focused TUI/agent tests, `pnpm_config_verify_deps_before_run=false pnpm test:agent:eval`, and the packaged CLI TUI build.
