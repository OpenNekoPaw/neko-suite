## Context

The runtime already models child runs with a complete owner scope and a discriminating `childKind: 'subagent' | 'task'`. SubAgents are owned by `SubAgentManager`; asynchronous media and workflow Tasks are owned by the Task/media runtime and deliver terminal results through task-result observations. The ambiguity exists only at the model-facing tool surface: SubAgent creation is named `task`, SubAgent result lookup is named `task_output`, and the latter accepts `task_id` even though its implementation always constructs `childKind: 'subagent'`.

A captured DeepSeek run demonstrated the complete failure chain: `GenerateImage` returned a media `taskId`, the model passed it to `task_output`, the SubAgent registry correctly returned not found, and the media Task later completed through the canonical observation path.

## Goals / Non-Goals

**Goals:**

- Give SubAgent operations an unambiguous model-facing namespace and identifier.
- Preserve the existing independent ownership, lifecycle, and result-delivery paths for SubAgents and Tasks.
- Reject wrong-kind identifiers before registry lookup with a useful diagnostic.
- Prove both the canonical SubAgent path and the forbidden media-Task-to-SubAgent path.

**Non-Goals:**

- Unify SubAgent and Task registries or result APIs.
- Add polling for media Tasks or change automatic task-result observations.
- Change generated asset identity, persistence, or provider execution.
- Preserve compatibility aliases for unreleased `task`, `task_output`, or `task_id` contracts.

## Decisions

### Responsibility

`SubAgentManager` remains the sole owner of SubAgent instances and results. Task/media runtimes remain the sole owners of background Task progress and terminal observations. Tool names express these ownership boundaries instead of presenting a generic task facade.

### Dependency

The change stays within the existing `agent` model-facing tool layer and `platform` media capability descriptions. Shared `ChildRunScope` remains the host-neutral L0 contract; no Webview, Extension, React, VS Code, or provider dependency is introduced.

### Interface

- Rename `task` to `subagent`.
- Rename `task_output` to `subagent_output`.
- Rename `TaskToolArgs` and `TaskOutputToolArgs` to SubAgent-specific type names.
- Accept only `subagent_id` for output lookup and continue returning `subAgentId` in tool results.
- Validate the `subagent-` identifier namespace before constructing a SubAgent scope. A media `task_...` identifier fails with a diagnostic that directs callers to Task observation delivery.
- Media tool descriptions explicitly state that returned `taskId` values are not SubAgent identifiers and must not be passed to SubAgent tools.

Alternative considered: retain old names and improve prose only. Rejected because the captured model already ignored prose that called `task_output` a SubAgent tool; ambiguous schema names remain a stronger routing signal.

Alternative considered: make `task_output` dispatch to either registry. Rejected because it would create a second result-delivery path, weaken ownership, and hide wrong-kind calls behind fallback behavior.

### Extension

Future child-run kinds can use their own model-facing namespace while continuing to share `ChildRunScope` internally. No new factory, registry, provider, or adapter is needed for the current two kinds.

### Testing

- Contract tests assert exact tool names, parameter schemas, result fields, and removal of legacy names/fields.
- SubAgent tests prove `subagent_id` reaches `childKind: 'subagent'` and wrong prefixes fail before manager lookup.
- Media tests assert generated `taskId` remains `childKind: 'task'` and descriptions forbid SubAgent lookup.
- A focused real Agent evaluation covers one background SubAgent collection case and one image-generation case that forbids SubAgent tools while accepting automatic task-result continuation.

### Proportionality and fail-visible behavior

This is a direct contract rename plus boundary validation. It does not add compatibility routing, feature flags, or additional lifecycle services. Unknown legacy names, missing `subagent_id`, and wrong-kind IDs fail visibly; none fall back to another registry.

## Risks / Trade-offs

- [Risk] Existing prompt fixtures or evaluations still call legacy tool names. -> Update all repository-owned references and run legacy-debt search; do not register aliases.
- [Risk] Identifier-prefix validation diverges from ID generation. -> Keep generation and validation in the same SubAgent tool module and cover both with contract tests.
- [Risk] Provider models may still attempt generic Task polling. -> Strengthen media descriptions and require real path-level evaluation rather than relying only on unit schemas.

## Migration Plan

1. Poison/remove legacy tool names and `task_id` assertions in tests.
2. Introduce the canonical SubAgent tool/type names and wrong-kind diagnostics.
3. Update repository callers, catalogs, fixtures, and documentation in one change.
4. Update media descriptions and run deterministic tests.
5. Run focused real Agent evaluation with DeepSeek when configured; otherwise record the exact provider/configuration blocker.

Rollback is a source revert before release. No durable user data or persisted task records require migration because tool-call messages are historical conversation evidence, not executable resumable commands.

## Open Questions

None.
