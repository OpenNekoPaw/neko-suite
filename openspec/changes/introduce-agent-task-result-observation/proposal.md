## Why

Agent-triggered async tasks can finish after the originating turn is already over, but their terminal results are currently projected mainly as task/UI state rather than as a durable Agent observation. This leaves the Agent able to start background work without a canonical way to notice completion, reason about the result, or resume the conversation under an explicit policy.

## What Changes

- Introduce a canonical Agent task result observation contract for async task terminal states.
- Add an event-triggered delivery path that materializes completed, failed, or cancelled task results as conversation/session observations.
- Define policy-controlled follow-up behavior: notify-only, append observation, ask the user to continue, or auto-resume the Agent when explicitly allowed.
- Route any automatic follow-up through the existing runner/message queue boundary instead of recursively invoking Agent execution from a task event handler.
- Keep task ownership in `task/`, session/history ownership in `session/`, active work-item projection in `runtime/stream/`, and ReAct execution semantics in `executor/`.
- Avoid a new generic workflow runtime, governance plane, or distributed event bus.

## Capabilities

### New Capabilities

- `agent-task-result-observation`: Covers how async task terminal results become durable Agent observations and optionally enqueue policy-driven follow-up turns.

### Modified Capabilities

- None.

## Impact

- Affected packages: `packages/neko-agent/packages/agent`, `packages/neko-agent/packages/extension`, `packages/neko-agent/packages/types`, and focused Webview presentation tests only if the task observation requires new host/Webview messages.
- Affected runtime areas: task terminal event handling, stream background task observation, session/journal observation append, runner queue integration, and resource/result reference projection.
- No Rust Engine, Protobuf, cloud service, marketplace trust, or durable project-file migration is expected.
- Compatibility: existing task progress/result UI remains valid; the new path adds a canonical observation/follow-up contract and should fail visibly for missing conversation ids, unknown task ids, malformed terminal payloads, or disallowed auto-resume policies.
