## Why

Creative packages such as Canvas, Sketch, Cut, and Story need AI buttons for generation, optimization, editing, retry, and batch work, but today the ownership boundary between package UI, Agent conversations, background tasks, SubAgents, memory, and writeback is not explicit enough. Without a shared contract, package buttons can accidentally pollute the currently selected Agent chat, create excessive one-off conversations, repeat expensive context loading, or write generated results back to stale targets.

This change defines a local, VS Code-oriented background Agent conversation model for creative-package AI invocations while preserving Agent panel behavior, package ownership of `nk*` document state, and fail-visible writeback.

## What Changes

- Introduce a shared creative AI invocation contract that distinguishes:
  - Agent-internal invocations, which run in the currently selected Agent conversation.
  - External creative-package invocations, which carry explicit `sourceRef`, `targetRef`, document/source association, mode, intent, revisions, and routing metadata.
- Route external creative-package AI buttons to the most recent active background Agent conversation associated with the invocation's document/source, creating one when none exists; do not silently route them into the Agent panel's selected conversation.
- Keep Agent panel inputs and actions bound to the selected Agent conversation; do not silently route Agent panel actions to recent document conversations.
- Model each AI invocation as a run with immutable source/target/revision/model/capability snapshots, idempotency identity, work items, observations, and diagnostics.
- Support run/work-item/SubAgent/provider concurrency inside a conversation while keeping main Agent turns serialized per conversation.
- Define background conversation lifecycle operations: active, archive, restore, delete, stop-and-archive, and stop-and-delete.
- Allow multiple active conversations for the same `nk*` file; users manage archive/delete manually. Closing a VS Code editor tab does not archive a conversation, and no TTL-based archival is introduced.
- Persist background conversation journal/history, but do not automatically commit long-term Project Memory. Cross-conversation reuse requires explicit promotion to memory, domain facts/resources, or user-saved textual references.
- Require generated result writeback to go through owning package capability/apply adapters with target validation, revision preconditions, target-level cancellation, and fail-visible diagnostics.

Non-goals:

- Do not make every AI button create a new user-visible Agent conversation.
- Do not make VS Code editor tabs own Agent conversations.
- Do not allow Agent conversations to automatically read or recall other conversations' transcript/journal.
- Do not let Agent directly mutate Canvas/Sketch/Cut/Story Webview component state or `nk*` project files.
- Do not solve long-term Project Memory extraction beyond proposal-based promotion boundaries.
- Do not introduce cloud service, multi-tenant, or distributed orchestration concepts; this remains a local VS Code client design.

## Capabilities

### New Capabilities

- `creative-ai-invocation-routing`: Defines Agent-internal versus external creative-package AI invocation contracts, source/target envelopes, routing domains, idempotency identity, and audit metadata.
- `agent-background-conversation-lifecycle`: Defines background Agent conversation visibility, lifecycle, archive/delete behavior, run/work-item concurrency, memory isolation, and owning-package result writeback boundaries.

### Modified Capabilities

- None.

## Impact

- `@neko/shared` / `packages/neko-types`: New host-neutral DTOs for creative AI invocation envelopes, source/target refs, routing reasons, run snapshots, lifecycle commands, and result/apply diagnostics.
- `@neko/agent` runtime and `neko-agent` extension: Conversation association registry, background conversation creation/reuse, run/workItem orchestration, SubAgent/background coordinator integration, archive/delete lifecycle, memory isolation, and journal persistence.
- `neko-agent` Webview: Conversation list projections for active/archived background conversations, run/workItem display, archive/delete/restore controls, and selected-conversation routing for Agent-internal actions.
- Creative packages such as `neko-canvas`, `neko-sketch`, `neko-cut`, `neko-story`, and future `nk*` editors: AI button adapters that emit external invocation envelopes with explicit source/target refs and package-owned apply adapters for generated results.
- Existing Canvas Agent authoring capabilities: Reused as owning-package mutation/apply surfaces; this change does not replace Canvas-owned authoring catalog or direct asset import boundaries.
- Generated asset lifecycle and project file I/O: Existing stable resource/ref and host-mediated write rules remain authoritative; this change consumes those contracts rather than weakening them.
- Validation: Contract tests for routing and idempotency, runtime tests for same-conversation concurrency and cancellation, Webview/Extension message tests for lifecycle controls, and VS Code Webview smoke for conversation list/status interactions.
