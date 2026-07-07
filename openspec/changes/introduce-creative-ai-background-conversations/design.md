## Context

Neko creative packages need AI buttons that can generate, optimize, edit, retry, and batch-process creative objects without forcing the user to manually open Agent first. Existing Agent infrastructure already has conversation-scoped runners, background task projections, SubAgent foreground/background modes, and Canvas-owned authoring capabilities, but the product boundary is not yet explicit for creative-package button entry points.

The core ambiguity is ownership:

- Agent Webview actions already have a selected conversation and should stay in that conversation.
- Creative package buttons originate outside Agent and need explicit source/target provenance, routing, idempotency, and writeback contracts.
- Long-running generation and batch work need concurrency without spawning a new user-visible conversation for every item.
- Generated results must return through the owning package instead of mutating Webview component state from Agent.

This design keeps the system local-client scoped: VS Code Extension Host coordinates conversations and package bridges, Webviews remain sandboxed projection surfaces, Agent runtime owns turn/run orchestration, and domain packages own their `nk*` document facts.

## Goals / Non-Goals

**Goals:**

- Define separate invocation contracts for Agent-internal actions and external creative-package AI buttons.
- Route external package invocations to recent source/document-associated background conversations while keeping Agent panel actions bound to the selected conversation.
- Allow multiple active conversations for the same `nk*` document, with user-managed archive/delete.
- Represent each invocation as a run with immutable source/target/revision/model/capability snapshots and idempotency keys.
- Keep main Agent turns serialized per conversation while allowing run/workItem/SubAgent/provider concurrency.
- Make result writeback package-owned, revision-checked, cancelable at target/workItem granularity, and fail-visible.
- Persist conversation journal/history while keeping long-term Project Memory promotion explicit and proposal-based.

**Non-Goals:**

- Automatically archive conversations on editor close or TTL.
- Make VS Code editor tabs own conversation identity.
- Use new conversations as the primary concurrency mechanism.
- Let one Agent conversation automatically read another conversation's transcript or journal.
- Implement universal AI writeback directly in Agent.
- Replace Canvas authoring catalog, generated asset lifecycle, project file I/O, or content-access contracts.

## Architecture Analysis

### Responsibility

- `@neko/shared` owns host-neutral DTOs: invocation envelopes, source/target refs, routing reason, run snapshot, lifecycle commands, work item references, and apply diagnostics.
- `@neko/agent` runtime owns conversation-scoped turns, run identity, SubAgent/background worker orchestration, observation recording, and memory proposal boundaries.
- `neko-agent` Extension owns conversation creation/reuse, recent association lookup, selected Agent conversation routing, archive/delete commands, journal persistence, and Webview message adaptation.
- Agent Webview owns display and user controls for conversation lists, active/archived states, run/workItem progress, and selected conversation actions.
- Creative package extensions own AI button adapters, source/target extraction, document revision lookup, and package-specific apply adapters.
- Creative package Webviews own UI interactions and render updated package state; they do not call Agent internals directly.

### Dependency

- Shared contracts stay Layer 0 and do not import VS Code, React, DOM, Agent Extension, or feature package implementation.
- Agent runtime consumes shared contracts and domain capability providers through registries/ports.
- Extension Host adapters bridge VS Code commands, Webview messages, and package APIs.
- Webviews communicate through typed postMessage/request-response facades and do not import VS Code or Node APIs.
- Feature packages do not directly depend on each other's extension internals; cross-package behavior flows through shared contracts, capability providers, or command/API facades.

### Interface

The minimum stable interfaces are:

- `AgentInternalInvocation`: selected-conversation action from Agent UI/message blocks.
- `ExternalCreativeAiInvocation`: package-originated invocation with `documentRef`, `sourceRef`, `targetRef`, `intent`, `mode`, revisions, and idempotency input.
- `CreativeAiRoutingDecision`: selected `conversationId`, routing reason, association key, and diagnostics.
- `CreativeAiRunSnapshot`: immutable run input captured before provider/SubAgent work begins.
- `CreativeAiApplyRequest`: owning-package apply request with target, output refs, revision preconditions, and idempotency key.
- `ConversationLifecycleCommand`: archive, restore, delete, stop-and-archive, stop-and-delete.

DTOs should use stable refs, resource refs, document refs, workspace-relative paths, `${VAR}/path`, asset/entity IDs, or generated asset refs. They must not carry Webview URIs, blob URLs, cache paths, provider runtime handles, or component-local state as durable identity.

### Extension

The design makes each new creative package implement a thin adapter:

1. Extract source/target refs and revisions for its AI buttons.
2. Call the shared creative AI invocation route.
3. Implement apply adapter(s) for generated result types it owns.
4. Project status/result refs back into its own UI.

New package buttons should not require changes to Agent Webview internals beyond shared invocation and workItem projections.

### Testing

Validation should cover:

- Contract validators for invocation envelopes, source/target refs, routing decisions, run snapshots, lifecycle commands, and apply diagnostics.
- Routing tests proving Agent-internal actions use the selected conversation and external package actions use recent source/document association.
- Idempotency tests proving duplicate external invocations return an existing run/workItem instead of creating duplicate provider calls.
- Runtime tests proving main turns are serialized per conversation while background workItems/SubAgents can run concurrently.
- Cancellation tests for conversation, run, workItem, and target deletion/supersession.
- Apply-adapter tests for revision match, stale target, deleted target, same-target lock, and per-target batch failure.
- Webview/Extension tests for active/archived/deleted conversation projections and stop-and-archive/delete controls.
- VS Code Webview runtime smoke for the Agent conversation list/status UI once UI changes are implemented.

### Proportionality

The design avoids cloud-style queue services, distributed locks, tenant isolation, or background daemons. The necessary abstractions are local contracts and Extension/runtime adapters because the real boundaries are VS Code Webview sandboxing, package ownership of `nk*` documents, provider/SubAgent asynchrony, generated asset stability, and user-managed conversation history.

### Fail-Visible Behavior

- Missing `conversationId`, `documentRef`, `sourceRef`, or mutating `targetRef` fails with typed diagnostics.
- External invocations must not fall back to the selected Agent conversation when recent association is unavailable.
- Agent-internal invocations must not fall back to recent document conversations when no selected conversation exists.
- Stale/deleted targets must return diagnostics or per-target cancellation rather than applying silently.
- Archived/deleted conversations must not be silently revived for external invocations.
- Runtime-only refs, cache paths, and Webview projection handles must be rejected before persistence or writeback.

## Decisions

### 1. Invocation routing has two domains

Agent-internal invocations run in the selected Agent conversation. Creative-package buttons run through source/document association and create a background conversation only if none is available.

Alternative rejected: route every package button to the selected Agent conversation. This would pollute unrelated chats when the user happens to have Agent focused.

Alternative rejected: route Agent panel actions to recent document conversations. This would make Agent UI behavior depend on hidden editor history.

### 2. Conversations are user-managed creative threads

Multiple active conversations may be associated with the same `nk*` document. The default package route uses the most recent active association, but users can create a new conversation, select another conversation, archive, restore, or delete manually. Closing a VS Code editor tab does not archive and there is no TTL.

Alternative rejected: one permanent conversation per file. Long-lived files can accumulate too much context and stale history.

Alternative rejected: one conversation per editor tab or per invocation. This fragments history, duplicates context loading, and makes continuous/batch creation harder to inspect.

### 3. Runs, not conversations, are the concurrency unit

Main Agent turns remain serialized per conversation to preserve transcript order. Long-running generation, media tasks, SubAgents, and batch work execute as run/workItems inside the same conversation. Current foreground coordinator behavior is insufficient for long creative work; implementation should add or adapt a background coordinator/run orchestrator path.

Alternative rejected: create a new conversation for each concurrent operation. This avoids runner busy state but creates repeated context load, scattered results, and poor user history.

### 4. Result writeback belongs to the owning package

Agent records observations and calls package-owned apply adapters. Canvas writes Canvas nodes/fields, Cut writes timeline state, Sketch writes layers/assets, Story writes script/scene state, and Assets owns promoted generated assets.

Alternative rejected: generic Agent-side component patching. It would duplicate domain logic, bypass undo/history, and violate package boundaries.

### 5. Conversation history and Project Memory are separate

Background conversations persist their own journal/history. They do not automatically update Project Memory and they do not become recall sources for other conversations. Cross-conversation reuse requires explicit promotion to Project Memory, domain facts/resources, or saved textual references.

Alternative rejected: automatic semantic recall over archived conversations. This risks pulling failed attempts, abandoned styles, or obsolete context into new work.

## Risks / Trade-offs

- [Risk] Users may accumulate many active conversations. -> Mitigation: provide clear file/source labels, last-used sorting, archive/delete controls, and routing reason display.
- [Risk] Most-recent association may choose a surprising conversation when several active conversations share a document. -> Mitigation: record routing reason, expose conversation selector for AI buttons, and allow explicit new conversation.
- [Risk] Background work can complete after a target changes. -> Mitigation: require run snapshots, target revision preconditions, target-level cancellation, and stale diagnostics.
- [Risk] SubAgent/background worker costs can grow during batch work. -> Mitigation: model cost/confirmation policy at run orchestration, support cancellation, and avoid automatic memory writes or recursive continuation.
- [Risk] Existing foreground `coordinate` behavior blocks main Agent turns. -> Mitigation: implement a background coordinator/run orchestrator for creative package invocations instead of using foreground `coordinate` for long tasks.
- [Risk] Deleting conversation history while tasks run can orphan observations. -> Mitigation: require no active runs for delete unless the user chooses stop-and-delete.

## Migration Plan

1. Add shared contracts and validators without wiring package buttons.
2. Add Agent Extension routing/association service and conversation lifecycle commands behind explicit new message/command paths.
3. Add run snapshot/workItem observation support and background coordinator integration.
4. Add Agent Webview projections and controls for active/archived/deleted states.
5. Migrate one package entry point, preferably Canvas AI generation/editing, to external invocation envelopes and package-owned apply adapters.
6. Migrate additional package buttons incrementally after contract tests prove no selected-Agent-conversation fallback.

No existing conversation history needs destructive migration. If old package-local AI shortcuts remain during migration, new-path tests must poison or assert against legacy success paths for migrated buttons.

## Legacy AI Button Paths Intentionally Left During This Change

The first Canvas integration migrates AI button routing and apply contracts, but it does not replace the existing image provider execution/writeback path in the same change. This keeps the current Canvas generation UX working while the generated binary output lifecycle moves from Webview `dataUrl` payloads to stable generated asset/resource refs.

- Owner: Canvas Extension and Agent Extension.
- Current path: Canvas Webview posts `generateForNode`; `CanvasEditorProvider` emits an `ExternalCreativeAiInvocation` through `neko.agent.creativeAi.invokeExternal`; after that routing succeeds, `BatchGenerationScheduler` still calls `neko.agent.generateForNode` and reports `generationProgress` with the returned `dataUrl`.
- Replacement path: Agent run/workItems should execute the provider under the creative AI run identity, promote binary outputs to stable generated asset/resource refs, then call `neko.canvas.creativeAi.apply` with a `CreativeAiApplyRequest` carrying target revision preconditions and idempotency identity.
- Validation command: `/opt/homebrew/bin/pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/creativeAiCanvasAdapter.test.ts packages/neko-canvas/packages/extension/src/__tests__/agentCapabilityProvider.test.ts`, plus the Agent extension command/routing focused test set in this change.
- Removal condition: remove the `neko.agent.generateForNode` scheduler writeback path for migrated Canvas buttons after Canvas image generation returns stable refs and tests prove the migrated buttons no longer rely on Webview `dataUrl` writeback or direct `generationProgress` success to mutate Canvas state.

## Open Questions

- Which package should be the first canonical implementation target: Canvas generation panel, Canvas node AI buttons, or another `nk*` editor?
- Should the first implementation include an AI-button conversation picker, or only route by most recent association plus a later selector?
- Which result types need candidate-only apply by default in the first package implementation?
