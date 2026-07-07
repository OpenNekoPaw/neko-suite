## 1. Shared Contracts

- [ ] 1.1 Add host-neutral DTOs for `AgentInternalInvocation`, `ExternalCreativeAiInvocation`, creative source refs, creative target refs, routing reasons, run snapshots, lifecycle commands, apply requests, and apply diagnostics in the shared contract layer.
- [ ] 1.2 Add validators/type guards for invocation envelopes, refs, routing decisions, lifecycle commands, and run snapshots with fail-visible diagnostics for missing source/target/conversation identity.
- [ ] 1.3 Add contract tests for Agent-internal invocation validation, external creative-package invocation validation, mutating invocation target requirements, and runtime-handle/cache-path rejection.
- [ ] 1.4 Export the contracts through the established shared package entry points without importing VS Code, React, DOM, Agent Extension, or feature package internals.

## 2. Conversation Routing And Association

- [ ] 2.1 Implement an Agent Extension routing service that accepts Agent-internal invocations and routes them only to the selected Agent conversation.
- [ ] 2.2 Implement external creative-package routing by recent active document/source association, including `recent-associated-conversation`, `created-new-background-conversation`, and user-selected routing reasons.
- [ ] 2.3 Persist and update conversation association metadata for source package, document/source association key, last activity, and active/archived/deleted state.
- [ ] 2.4 Add routing diagnostics for archived/deleted/unavailable conversations, missing selected Agent conversation, missing external source/target, and prohibited cross-domain fallback.
- [ ] 2.5 Add tests proving package invocations do not silently use the Agent panel selected conversation and Agent panel actions do not silently use recent document conversations.

## 3. Run, WorkItem, And Concurrency Runtime

- [ ] 3.1 Add run snapshot creation for accepted invocations, including document/source association, source refs, target refs, revisions, mode, intent, model/capability revision refs, and idempotency identity.
- [ ] 3.2 Add idempotency lookup so duplicate external invocations return existing run/workItem state without duplicate provider/SubAgent execution or duplicate transcript messages.
- [ ] 3.3 Add or adapt a background run coordinator for long-running creative work so creative package invocations can start background workItems without blocking the main Agent turn.
- [ ] 3.4 Ensure main Agent turns remain serialized per conversation while independent run/workItems, provider tasks, media tasks, and background SubAgents can progress concurrently.
- [ ] 3.5 Add workItem event projection for run start, progress, completion, cancellation, stale target, failed apply, and generated observation states.
- [ ] 3.6 Add runtime tests for queued main turns, concurrent background workItems, SubAgent event projection, run id propagation, cancellation, and no one-conversation-per-workItem behavior.

## 4. Lifecycle, Archive/Delete, And Memory Boundaries

- [ ] 4.1 Add lifecycle commands for archive, restore, delete, stop-and-archive, and stop-and-delete with active-run checks.
- [ ] 4.2 Update conversation list/index persistence to represent active, archived, deleted/unavailable, background/source association metadata, and last activity.
- [ ] 4.3 Ensure closing a VS Code editor tab does not archive/delete associated conversations and no TTL-based archival path is introduced.
- [ ] 4.4 Ensure archived conversations are excluded from default routing and automatic recall while remaining inspectable/restorable until deleted or cleaned up.
- [ ] 4.5 Ensure delete removes conversation history/index data but does not delete promoted project facts, assets, resources, Project Memory entries, or saved references.
- [ ] 4.6 Add tests for archive, restore, delete, stop-and-delete, editor-close behavior, multiple active conversations for one document, and memory isolation.

## 5. Agent Webview Projection And Controls

- [ ] 5.1 Extend Agent Webview conversation list projection to show active and archived background conversations with source package, document/source label, active run summary, last activity, and lifecycle actions.
- [ ] 5.2 Add UI actions for open/focus, archive, restore, delete, stop-and-archive, and stop-and-delete with clear disabled/diagnostic states for active work.
- [ ] 5.3 Render run/workItem observations, generated result refs, stale diagnostics, apply diagnostics, and SubAgent progress in the selected conversation without requiring a separate subagent conversation.
- [ ] 5.4 Add Webview handler tests for lifecycle actions, selected-conversation routing, background conversation opening, and stale/archived conversation diagnostics.
- [ ] 5.5 Run VS Code Webview runtime smoke for conversation list/status interactions after UI implementation and record residual risk if the smoke cannot run.

## 6. Owning Package Apply Adapter Integration

- [ ] 6.1 Implement the first canonical creative-package adapter, preferably Canvas, that emits external creative AI invocation envelopes with explicit source refs, target refs or candidate targets, document revision, target revision, mode, and intent.
- [ ] 6.2 Implement the matching owning-package apply adapter for the first package with revision preconditions, target existence checks, target-level lock/supersession behavior, idempotency, undo/history integration, and structured diagnostics.
- [ ] 6.3 Ensure generated binary outputs are promoted or represented through stable generated asset/resource refs before apply; reject Webview URIs, blob URLs, cache paths, provider runtime handles, or temp paths as durable target/source identity.
- [ ] 6.4 Add per-target batch behavior for the first package: deleted/stale target cancels or fails only the affected workItem unless the run declares atomic behavior.
- [ ] 6.5 Add package-level tests for source/target extraction, apply success, stale target, deleted target, target field conflict, candidate-only output, batch partial failure, and no direct Agent mutation of Webview component state.

## 7. Validation And Quality Gates

- [ ] 7.1 Run focused unit/contract tests for shared DTO validators, routing service, run snapshot/idempotency, lifecycle commands, and first package apply adapter.
- [ ] 7.2 Run Agent extension/runtime tests covering conversation isolation, background workItem concurrency, SubAgent projection, memory isolation, and lifecycle deletion safeguards.
- [ ] 7.3 Run package-specific tests for the first migrated creative package.
- [ ] 7.4 Run `pnpm check` and relevant package `vitest` commands; expand to `pnpm test` or `pnpm build` if shared contracts or package exports affect broad surfaces.
- [ ] 7.5 Run `pnpm smoke:webview:runtime` or equivalent `vscode-extension-debugger` validation for Agent Webview conversation lifecycle UI changes.
- [ ] 7.6 Document any legacy AI button paths left intentionally unmigrated, including owner, replacement path, validation command, and removal condition.
