## Why

The previous traceability change moved high-risk runtime state out of
`AgentSession`, but several new collaborators still depend on broad callback
sets that effectively capture session internals. Hardening these boundaries now
reduces regression risk before more execution-loop and prompt-runtime extraction
work builds on top of them.

## What Changes

- Add dedicated unit tests for `SessionPersistence`, `IdcRunLifecycle`,
  `SessionArtifactFacade`, `FeedbackRuntimeBridge`, and `PromptRuntimeFacade`
  instead of relying only on `AgentSession` characterization paths.
- Replace broad collaborator option bags with smaller capability ports where
  doing so materially reduces hidden `AgentSession.this` coupling.
- Stop mutating shared `AgentContext.trace` for phase-local trace derivation in
  think/act/observe paths; prefer explicit local trace values and typed phase
  inputs.
- Tighten architecture guards so new direct ownership of timers, sinks, queues,
  guidance state, transition buffers, or prompt module instances in
  `AgentSession` is reported by category.
- Preserve `IAgentSession`, Webview protocol, Extension behavior, and existing
  trace log payload compatibility.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime-boundaries`: Harden focused runtime collaborator boundaries,
  collaborator test coverage, phase trace immutability, and `AgentSession`
  field ownership guards.

## Impact

- Affected packages: `packages/neko-agent/packages/agent` and targeted shared
  trace usage through `packages/neko-types`.
- Affected modules: `session/session-persistence.ts`,
  `session/idc-run-lifecycle.ts`, `session/session-artifact-facade.ts`,
  `session/feedback-runtime-bridge.ts`, `session/prompt-runtime-facade.ts`,
  `session/agent-session.ts`, executor phase modules, and architecture guards.
- Public API impact: no breaking changes expected for `IAgentSession`,
  Extension, CLI/TUI, Webview protocol, provider payloads, or model-authored
  tool arguments.
- Test impact: adds focused collaborator unit tests and expands architecture
  boundary guard coverage.
