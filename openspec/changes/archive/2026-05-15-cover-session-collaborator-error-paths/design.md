## Context

`harden-agent-session-collaborator-boundaries` added focused collaborator tests
and hardened ports for the highest-risk session collaborators. The remaining
gap is test depth: restore, persistence, projection, and prompt boundary failure
paths are exactly where production defects are likely, but current tests mostly
cover happy paths.

修改前的三个架构判断：

- 是否符合现有架构：符合。本变更只强化测试和小范围 deterministic behavior，不引入
  新 runtime abstraction。
- 如何进一步降低耦合：不新增结构层；通过更窄的 tests 确认协作者可以脱离
  `AgentSession` 独立处理失败。
- 是否易于扩展与测试：是。每个失败路径都可通过 mock port/service 单测验证。

## Goals / Non-Goals

**Goals:**

- Cover `SessionPersistence` warning behavior when replacing or disposing stores
  whose async `dispose()` rejects.
- Cover `SessionArtifactFacade` restore rejection, write rejection, observed
  artifact sync rejection, and task projection rejection behavior.
- Split `PromptRuntimeFacade` boundary tests into dedicated coverage for no
  executor, no system history message, and empty prompt sections.
- Cover `FeedbackRuntimeBridge` control-plane guidance persistence failure
  behavior.
- Keep public APIs and current port structure unchanged unless a tiny internal
  behavior adjustment is needed to make failures deterministic.

**Non-Goals:**

- Do not refactor `FeedbackRuntimeBridge` into ports in this change.
- Do not migrate prompt module legacy fields out of `AgentSession`.
- Do not change provider payloads, tool arguments, Webview protocol, or
  `IAgentSession`.

## Decisions

### Decision 1: Prefer tests over new abstractions

This change targets confidence, not another boundary redesign. Existing
collaborator APIs are enough to simulate the failure paths with mock stores,
artifact services, projections, and prompt composers.

Alternative: continue into `FeedbackRuntimeBridge` port extraction. Rejected
because that mixes structural work with error-path test hardening and makes the
review surface larger than necessary.

### Decision 2: Assert observable outcomes only

Tests should verify warnings, rejected writes, swallowed queue failures, prompt
history behavior, trace logs, and cleanup calls. They should not inspect private
fields or depend on implementation timing beyond existing explicit flush/queue
promises.

Alternative: expose more test-only state. Rejected because the collaborators
already have enough public surface to observe behavior.

### Decision 3: Keep queue failures non-fatal

`SessionArtifactFacade` queue-style methods already catch and warn on observed
artifact sync and task projection failures. Tests should lock that behavior:
queued failures must not reject `flush()` or poison later queue work.

Alternative: propagate queue errors to callers. Rejected because these paths are
background sync/projection paths and current runtime behavior is best-effort.

## Risks / Trade-offs

- Tests become too coupled to warning text -> Match stable message prefixes and
  useful data, not full string formatting when avoidable.
- Async queue tests become flaky -> Always await `flush()` after enqueuing work.
- Prompt facade tests overlap with prompt module tests -> Keep assertions at the
  facade boundary: history mutation, executor cache update, and debug calls.

## Migration Plan

1. Add missing error-path tests to `session-collaborators.test.ts`.
2. Extract prompt facade tests into a dedicated `describe` block or test file if
   needed for readability.
3. Run focused collaborator, trace, guard, and compile validation.
4. Run `pnpm check` and record existing repository baseline failures if they
   remain unrelated.
