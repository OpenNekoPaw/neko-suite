## Why

TUI currently routes runtime-generated async task follow-up prompts through the same path as user-authored messages. This makes internal continuations such as `Continue from the completed async task result.` appear as user messages, pollutes eval facts, and allows user queued prompts to break closed-loop workflows like image generation followed by visual quality analysis.

This change normalizes internal continuations as first-class Agent runtime inputs: they can drive the model, but they are not user transcript messages.

## What Changes

- Add a canonical internal continuation path for task-result, subagent-result, and system continuations.
- Split user-authored message queue semantics from runtime-authored continuation queue semantics while allowing a shared ordered drain implementation.
- Preserve current-turn async task continuity by prioritizing related task-result continuations over later user queued messages by default.
- Add explicit control semantics for interrupting a turn, sending a user message immediately, and discarding a pending continuation.
- Add explicit Task Group result delivery semantics: batch owners declare group ids and policies at task submission time; observation runtime does not infer grouping after the fact.
- Extend TUI debug automation facts so eval can assert continuation source/display metadata without parsing terminal text.
- **BREAKING** for internal TUI/eval contracts: runtime-authored continuation prompts must no longer appear as `role: 'user'` transcript messages.

## Capabilities

### New Capabilities

- `agent-internal-continuation`: Defines runtime-authored continuation inputs, continuation queue semantics, Task Group result delivery, subagent result handoff, and transcript/timeline boundaries.

### Modified Capabilities

- `tui-debug-automation`: Expose continuation source/display facts and wait-for-idle behavior so eval can validate internal continuation paths without terminal output parsing.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/cli-tui`: session submit paths, conversation projection, queue projection, debug automation facts.
  - `packages/neko-agent/packages/agent`: task result observation delivery metadata and tests around follow-up requests.
  - `scripts/agent-eval`: assertions/reporting that distinguish user messages from internal continuations.
- Affected docs:
  - `CONTEXT.md`
  - `docs/architecture/adr-agent-internal-continuation-boundary.md`
  - `docs/architecture/adr-agent-message-task-queue-boundary.md` remains authoritative for user message queue semantics.
- No new external dependencies, cloud services, remote schedulers, or project-file migrations are introduced.
