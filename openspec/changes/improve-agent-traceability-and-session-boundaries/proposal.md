## Why

`neko-agent` already has strong interface, adapter, registry, and hook composition patterns, but the execution hot path is difficult to diagnose because session, executor, hook, LLM, tool, IDC, feedback, and compaction logs do not share a trace identity.

At the same time, `AgentSession` has grown into a large implementation owner for runtime state, feedback, artifact, persistence, and IDC lifecycle details; this makes future traceability work harder to validate and increases the risk of boundary regressions.

## What Changes

- Introduce an agent execution trace context that links `conversationId`, `runId`, iteration, phase, and downstream LLM/tool request IDs across session, executor, hooks, platform service, and tool registry logs.
- Add structured debug logging to the execution hot path: session entry/exit, ReAct iteration boundaries, think/act phase boundaries, hook entry/exit, context compaction, IDC stage activation, approval decisions, and subagent lifecycle.
- Preserve the existing Logger infrastructure and EventBus responsibilities: logs provide real-time developer debugging while EventBus/Journal remain the audit trail.
- Refactor `AgentSession` toward a thin facade by moving runtime state persistence, IDC run lifecycle, artifact synchronization, feedback guidance state, and prompt-module orchestration details behind focused collaborators.
- Keep public `IAgentSession`, Extension, CLI/TUI, and Webview behavior compatible while tightening runtime boundaries with tests and focused architecture guards.
- Split platform service internals only where needed to keep trace propagation explicit and prevent observability metadata from leaking into provider-specific model payloads.

## Capabilities

### New Capabilities
- `agent-execution-traceability`: Defines correlation, debug logging, and trace propagation requirements for agent execution, hook, LLM, tool, workflow, approval, compaction, and subagent paths.

### Modified Capabilities
- `agent-runtime-boundaries`: Requires `AgentSession` to remain a stable facade while delegating concrete runtime lifecycle, persistence, artifact, feedback, and prompt orchestration details to focused runtime collaborators.

## Impact

- Affected packages: `packages/neko-agent/packages/agent`, `packages/neko-agent/packages/platform`, and shared logger usage through `packages/neko-types`.
- Affected modules: `session/agent-session.ts`, `executor/*`, `hooks/*`, `tools/tool-registry.ts`, `platform/src/service/service.ts`, IDC run/store/event modules, feedback coordinator, artifact service, approval engine, and subagent runtime.
- Public APIs should remain source-compatible unless an internal type needs an additive optional trace field; no Webview or Extension-facing protocol change is expected.
- Tests will cover trace propagation, log payload shape, execution hot-path instrumentation, facade delegation behavior, and no provider payload leakage of trace-only metadata.
