## Context

Neko Suite already uses `AgentCapabilityProvider` to let domain packages contribute Agent tools without making `neko-agent` import each package directly. Canvas, Cut, Story, Sketch, Puppet, Audio, and Engine have provider surfaces, while `neko-agent` keeps built-in document/image reading and plugin transfer routing.

The current gap is not capability discovery; it is state targeting. Agent can read some Canvas and timeline state, and can send assets or storyboards to plugins, but it cannot consistently ask "what is selected?", "which container should receive this?", or "apply this prompt to that exact node slot." When structured state is missing, workflows drift toward screenshots/OCR. That helps visual verification, but it cannot provide stable node IDs, container IDs, field paths, or permission context for safe edits.

Relevant constraints:

- Webview cannot access Node or VSCode APIs directly; Extension Host owns command execution, filesystem access, and `asWebviewUri`.
- Shared contracts live in `@neko/shared` / `@neko-agent/types`; plugin-specific implementation stays in the owning package.
- Agent tools must remain schema-driven, permission-aware, and distinguish read-only queries from mutations.
- Canvas containers already have generic membership contracts; new target routing should reuse them instead of adding Scene-specific paths.

Five-layer analysis:

- Responsibilities: Agent plans and routes; domain packages query and mutate their own state; Webview presents choices and sends typed intent; Extension Host bridges commands and local resources.
- Dependencies: Agent depends on shared contracts and VSCode command IDs, not on Canvas/Cut/Story implementation details.
- Interfaces: Query APIs expose stable IDs and compact summaries; mutation APIs accept explicit targets and validated payloads; visual evidence APIs return references, not raw unbounded media.
- Extension: New payload kinds and targets are additive; packages can adopt the contract incrementally.
- Testing: Contract tests cover payload validation and routing; provider tests cover query/mutate schemas; Canvas tests cover target resolution and container membership.

## Goals / Non-Goals

**Goals:**

- Make structured query APIs the primary way for Agent to understand editable project state.
- Allow Agent outputs such as text, optimized prompts, structured scene/shot blocks, assets, and storyboards to be sent to explicit Canvas/plugin targets.
- Let UI buttons and Agent tool calls share the same domain mutation services.
- Keep screenshots/OCR as optional visual evidence and verification tools, not the source of truth for editable state.
- Add safety metadata and confirmation rules for ambiguous, targetless, destructive, or replace-mode operations.
- Provide an incremental path for Canvas first, then Assets and Model provider gaps.

**Non-Goals:**

- Replacing all package commands with Agent tools in one change.
- Exposing every internal store mutation as a public API.
- Implementing OCR or screenshot perception changes beyond clarifying their role.
- Changing the existing `AgentCapabilityProvider` discovery mechanism.
- Migrating all existing Canvas node data to a new persistence format.

## Decisions

### 1. Query-first, evidence-second workflow

Agent-facing workflows SHALL first call structured query tools for editable state, then use screenshots/OCR only when visual evidence is needed. This keeps mutation targets stable and reduces token-heavy visual round trips.

Alternative considered: rely on screenshots/OCR for active editor state. Rejected because visual output cannot reliably expose IDs, parent-child membership, field paths, or current command safety policy.

### 2. Add target-aware transfer payloads

`PluginTransferPayload` will gain content-oriented variants for text, prompts, and structured content, plus an optional `target` reference:

```ts
interface PluginTransferTargetRef {
  readonly plugin?: 'canvas' | 'cut' | 'sketch' | 'model' | 'explorer';
  readonly canvasId?: string;
  readonly nodeId?: string;
  readonly containerId?: string;
  readonly slotId?: string;
  readonly fieldPath?: string;
  readonly mode?: 'insert' | 'append' | 'replace' | 'apply' | 'create-child';
}
```

The target reference describes intent, not implementation. Canvas resolves whether a target is valid using its own node, container, and policy registries.

Alternative considered: create one command per destination and content type. Rejected because it multiplies command IDs and pushes routing complexity into Agent/Webview.

### 3. Canvas owns target resolution and mutation semantics

Agent runtime will build a command plan, but Canvas will validate and apply targets. For example, `nodeId + fieldPath + mode=replace` updates an existing field only if the node/preset allows it; `containerId + mode=create-child` delegates to container membership actions.

Alternative considered: let Agent runtime transform payloads directly into Canvas node patches. Rejected because it couples Agent to Canvas internals and bypasses container validation.

### 4. Commands and Agent tools share domain services

New VSCode commands such as `neko.canvas.importAgentContent` should call the same service path used by Canvas Agent tools and Webview buttons. UI actions may collect a target interactively; Agent tools may pass a target explicitly after querying state.

Alternative considered: implement separate UI-only and Agent-only code paths. Rejected because divergent validation would make behavior inconsistent and harder to test.

### 5. Safety policy is declared, then enforced at execution

Tool metadata SHALL indicate read-only, destructive, concurrency-safe, and confirmation requirements. Execution SHALL fail closed when a mutation lacks a required target or when a replace/delete operation is ambiguous.

Confirmation policy:

- Read-only structured queries may run without confirmation.
- Non-destructive inserts with explicit targets may run after ordinary tool approval.
- Targetless inserts may use current selection or viewport insertion point only when the active package reports a deterministic fallback.
- Replace, delete, overwrite, or cross-container moves MUST require explicit user intent or confirmation.

### 6. Adoption is incremental

Canvas is the first implementation target because it is the main destination for Agent-generated prompts, storyboards, and visual planning content. Assets and Model should be added as follow-up providers or thin adapters because they already expose command/API surfaces but do not yet participate fully in Agent capability registration.

## Risks / Trade-offs

- Ambiguous targets could still lead to surprising edits -> require target queries, typed target references, and confirmation for replace/destructive modes.
- Payload schema could become too broad -> keep variants small and content-oriented; domain packages own conversion from payload to local data.
- Canvas may accumulate command variants -> prefer one `importAgentContent` command with typed payload over many narrow commands.
- Query APIs may expose too much data -> return compact summaries by default and require explicit detail requests.
- Existing UI commands might diverge from Agent tools -> route both through shared services and add contract tests.
- Adding provider gaps for Assets/Model may expand scope -> keep P0 focused on contracts and Canvas; schedule Assets/Model as P1 tasks.

## Migration Plan

1. Add shared transfer and target types without removing existing payload variants.
2. Extend runtime transfer planning to preserve old asset/storyboard behavior while routing new content payloads.
3. Add Canvas query APIs and `importAgentContent` command behind additive contracts.
4. Update Webview send menu to offer target-aware actions when target context exists.
5. Add Canvas Agent tools or extend existing tools to call the same query/apply service.
6. Add provider gaps for Assets and Model only after P0 Canvas transfer is stable.

Rollback is straightforward because changes are additive: disable new payload kinds and commands while preserving existing `singleAsset`, `assetBatch`, `canvasStoryboard`, and `cutStoryboard` behavior.

## Open Questions

- Should Canvas target references prefer `fieldPath` JSON Pointer strings or preset-declared `slotId` values for prompt updates?
- Should targetless Canvas insertion default to current selection, viewport center, or require user confirmation every time?
- Should Asset and Model providers be completed in this change or split into a follow-up implementation change after Canvas lands?
