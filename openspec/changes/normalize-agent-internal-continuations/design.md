## Context

Agent turns may submit background work such as image generation, document parsing, media generation, or subagent execution. The original assistant stream can finish before the background work reaches a terminal state. When a tracked task later completes, task result observation creates a follow-up request so the main Agent can consume stable result references and finish the user goal.

Today the TUI dispatches that follow-up by reusing the ordinary user `submit()` path. That keeps the functional loop alive, but incorrectly projects runtime-authored continuations as user messages and gives eval no canonical way to distinguish user prompts from internal continuations.

This design implements the ADR in `docs/architecture/adr-agent-internal-continuation-boundary.md` and keeps the solution proportional to a local TUI/runtime boundary.

### Five-layer analysis

Responsibility:

- Agent task result observation owns durable task result facts and follow-up requests.
- TUI Agent session owns user submit, internal continuation submit, queue ordering, and transcript projection.
- Conversation store owns visible transcript and timeline rows, not model execution policy.
- Debug automation owns machine-readable facts for eval and must not infer behavior from terminal text.

Dependency:

- Agent core emits typed follow-up requests without depending on TUI display rules.
- TUI consumes follow-up requests through a continuation port and decides projection/order.
- Eval interacts through debug automation only; it does not import Agent, media, Skill, or TUI internals as acceptance substitutes.

Interface:

- Add source/display metadata to TUI turn submission and queue items.
- Add a separate internal continuation submit path that can reuse low-level execution but cannot call the user-message projection path.
- Add continuation facts to debug automation and wait-for-idle state.

Extension:

- Task-result, subagent-result, and system continuations share one abstraction with different `source` values.
- Batch tasks use explicit Task Group metadata declared by the submitting owner.
- Future UI controls can add interrupt/send-now/discard without changing the Agent core follow-up contract.

Testing:

- Unit tests cover queue source ordering, transcript projection, and continuation submit behavior.
- TUI debug automation tests cover facts and idle semantics.
- Agent eval scenarios assert canonical continuation paths for async image quality review and resource-ref consumption.

## Goals / Non-Goals

**Goals:**

- Prevent runtime-authored continuation prompts from appearing as user transcript messages.
- Preserve closed-loop async workflows by auto-resuming from completed task results when policy allows.
- Distinguish Message Queue from Continuation Queue in types, UI projection, journal, and eval facts.
- Prioritize current-turn task-result continuations over later user queued prompts by default.
- Support batch Task Group `wait-all` delivery without runtime guesswork.
- Let subagent completion reuse the continuation abstraction while keeping raw sidechain transcripts out of the main conversation.

**Non-Goals:**

- No cloud scheduler, distributed task queue, remote workflow engine, or multi-tenant orchestration.
- No migration of durable user project files.
- No generic cross-client queue framework beyond current TUI/runtime needs.
- No merging of subagent sidechain transcript into the main conversation transcript.

## Decisions

### Separate user submit from internal continuation submit

Add a TUI session path equivalent to:

```ts
interface SubmitInternalContinuationInput {
  readonly prompt: string;
  readonly source: 'task-result-continuation' | 'subagent-result-continuation' | 'system-continuation';
  readonly metadata: {
    readonly observationId?: string;
    readonly taskId?: string;
    readonly taskGroupId?: string;
    readonly subagentId?: string;
    readonly parentMessageId?: string;
    readonly runId?: string;
  };
}
```

The implementation may call the same low-level `executePrompt()` used by user submit, but it must not call the path that creates `role: 'user'` transcript messages.

Alternative rejected: continue using `submit(request.prompt)` and hide the message later. That preserves the wrong semantic event and makes journal/eval facts unreliable.

### Source-aware queue items

Queue items carry a source and display kind. User-authored pending prompts remain editable/cancellable user queue items. Runtime-authored continuations are continuation queue items with separate projection and discard semantics.

Alternative rejected: maintain two completely separate queue implementations. The ordering policy is shared and local; duplicating queue mechanics would increase drift without improving the domain boundary.

### Default ordering protects current-turn continuity

When a continuation belongs to the current parent turn, it runs before later user queued messages. The user can still explicitly interrupt, send-now, or discard a continuation.

Alternative rejected: strict FIFO across user messages and continuations. FIFO would let unrelated user prompts break workflows where the original user asked for generation plus quality review.

### Task Group owners declare grouping at submission

Batch tools or runtime adapters must declare `taskGroupId` and result delivery policy when they submit related tasks. Observation runtime consumes this contract and does not group by prompt text, timestamps, paths, or task type proximity.

Alternative rejected: infer groups in observation runtime. That would be brittle, hard to test, and likely to join unrelated tasks in long-running creative sessions.

### Debug automation exposes continuation facts

`session.facts` includes continuation events, queue sources, display kinds, parent ids, task ids, group ids, subagent ids, and split idle state. Eval validates these facts rather than scraping terminal output.

Alternative rejected: keep eval regex checks against TUI text. Terminal formatting is presentation, not an acceptance contract.

## Risks / Trade-offs

- [Risk] Introducing source metadata across queue/message/facts touches several TUI modules. → Mitigation: add focused type-level changes and tests before broad eval scenario updates.
- [Risk] Continuation prompt still needs to enter model context while staying out of transcript. → Mitigation: isolate projection from execution and test both sides with spies/facts.
- [Risk] Existing eval baselines may expect the old user-message artifact. → Mitigation: update eval assertions to use continuation facts and treat old projection as failure.
- [Risk] Task Group metadata may be missing in early batch callers. → Mitigation: missing group contract is handled as single-task delivery or fail-visible diagnostic, never inferred aggregation.

## Migration Plan

1. Add source/display metadata types and tests around queue projection.
2. Implement internal continuation submit path and route task-result auto-resume through it.
3. Update conversation projection so internal continuations appear only in timeline/journal/facts.
4. Extend debug automation facts and wait-for-idle to account for pending continuations.
5. Add Task Group metadata handling for batch delivery paths that need wait-all.
6. Update eval scenarios/reports to assert canonical continuation facts.

Rollback is limited to internal TUI/eval behavior: reverting the submit routing restores old projection, but tests should fail because the old behavior violates the new contract.

## Open Questions

- Which user-facing TUI command names should expose `send-now`, `interrupt-current-turn`, and `discard-continuation`?
- Which batch generation tools are in scope for the first Task Group implementation beyond image generation?
