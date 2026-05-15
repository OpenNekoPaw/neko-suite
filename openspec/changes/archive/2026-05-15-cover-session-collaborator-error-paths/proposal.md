## Why

Session collaborators now have focused happy-path tests, but the production
failure paths that matter most for restore, persistence, artifact sync, and
prompt composition are still thinly covered. Covering those paths now makes the
recent collaborator boundary extraction safer to maintain without expanding the
scope into another structural refactor.

## What Changes

- Add focused error-path tests for `SessionPersistence` store replacement and
  dispose warning behavior.
- Add focused error-path tests for `SessionArtifactFacade` restore failure,
  artifact write failure, observed artifact sync failure, and task projection
  failure behavior.
- Split `PromptRuntimeFacade` coverage into dedicated tests that exercise
  boundary cases such as no executor, no system history message, and empty
  prompt sections.
- Add focused `FeedbackRuntimeBridge` error-path coverage for control-plane
  guidance / stage-transition persistence failures.
- Preserve current collaborator APIs, port boundaries, trace payloads, public
  `IAgentSession` behavior, provider payload isolation, and tool argument
  isolation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime-boundaries`: Extend focused collaborator test coverage to
  include failure paths and prompt facade boundary cases.

## Impact

- Affected package: `packages/neko-agent/packages/agent`.
- Affected tests: focused session collaborator tests and, if needed, small
  collaborator internals to make failure behavior deterministic.
- Public API impact: no breaking changes expected.
- Validation impact: targeted Vitest suites for session collaborators,
  architecture guards, trace integration, and package extension compile.
