## Context

Neko already has an Agent capability provider protocol in `@neko/shared`: providers register tools, prompt fragments, provider cards, and artifact facets through `AgentCapabilityProvider`. Tools already carry permission metadata such as `requiresConfirmation`, `safetyKind`, `targetRequirements`, and `queryBeforeMutate`.

The missing layer is not tool discovery. The gap is a shared lifecycle contract for creative handoffs that need validation, review, approval, execution, diagnostics, and follow-up actions. Canvas Markdown capabilities currently solve one slice of the problem, but they do so through a Canvas-specific Webview message and result DTO. Cut, Model, Sketch, Puppet, and future interactive video planning could repeat the same pattern unless the common lifecycle is made explicit.

This change introduces a local MCP-like capability lifecycle that composes with the existing provider/tool architecture instead of replacing it.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Agent owns invocation orchestration, permission/confirmation, workflow/creation context, and generic rendering of diagnostics/actions. Owning domains own validation semantics, profiles, resource binding, mutation, persistence, and domain node/project creation. Webview owns user shortcuts and display, not domain compilation. Shared contracts own DTOs, discriminants, guards, and generic lifecycle result shapes. |
| Dependency | Layer 0 contracts live in `@neko/shared` and do not import React, VSCode, or feature internals. Agent Webview calls Extension through typed messages. Extension routes invocations through Agent/provider services or owning-domain public APIs. Feature packages do not import each other directly. Canvas Markdown implementation remains in `neko-canvas`. |
| Interface | The public interface is a capability descriptor plus `AgentCapabilityInvocationInput` / `AgentCapabilityInvocationResult`. Domain-specific args/results remain under typed payload slots guarded by descriptor ids. Generic fields cover lifecycle phase, diagnostics, approval, review artifact refs, actions, changed refs, and provenance. |
| Extension | New domains add descriptors and handlers behind their provider. New table-based workflows add domain-owned table profiles instead of new compiler packages. New lifecycle phases require an explicit spec change. |
| Testing | Contract tests cover DTO validators. Provider tests prove descriptors match tools. Runtime tests prove permission, workflow stage, and confirmation are enforced. Canvas tests prove Markdown/table profile behavior. Webview bridge tests prove UI shortcuts use the same invocation path. Poison-path tests prove legacy transfer routes do not return success for new Markdown authoring drafts. |
| Proportionality | This remains a local VSCode capability invocation layer, not a remote orchestration service. It reuses existing tools, providers, permissions, and extension APIs. No server, durable workflow engine, tenant policy layer, or universal compiler registry is introduced. |
| Fail-visible behavior | Unknown capability ids, missing handlers, descriptor/result mismatches, unapproved mutating applies, unsupported phases, invalid table profiles, runtime-only resource handles, and legacy-path hits return typed diagnostics or throw in tests. They must not silently fall back to old transfer payloads, raw paths, or empty success results. |

## Goals / Non-Goals

**Goals:**

- Define a shared lifecycle vocabulary for local Agent-to-provider calls: `describe`, `validate`, `review`, `apply`, and `execute`.
- Add typed descriptors for provider capabilities, including input schema id, output schema id, accepted artifacts, produced artifacts, risk, approval, target requirements, and lifecycle phases.
- Add a generic result shape for diagnostics, review artifacts, actions, changed refs, and next-step suggestions.
- Let Canvas Markdown "Send to Canvas" and Agent tool execution share one backend invocation path.
- Make Canvas Markdown table handling profile-driven inside Canvas, with storyboard as one profile.
- Preserve extensible fields: unknown Markdown table columns stay review/display metadata unless a profile consumes them.
- Align mutating applies with confirmation and workflow/creation context.
- Clean or fail-close legacy Canvas transfer routes for Markdown authoring drafts.

**Non-Goals:**

- Do not replace `Tool`, `ToolRegistry`, or `AgentCapabilityProvider`.
- Do not require all existing simple tools to implement every lifecycle phase.
- Do not create a generic workflow engine or fixed creative DAG.
- Do not let Agent generate Canvas/Cut/Model project JSON directly.
- Do not make table profiles cross-domain business logic; they are descriptors plus domain-owned handlers.
- Do not implement Phase 2 resource-reference Markdown transclusion in this change.

## Decisions

### Decision 1: Add lifecycle metadata beside existing Tool metadata

Introduce descriptor types such as:

```ts
type AgentCapabilityLifecyclePhase =
  | 'describe'
  | 'validate'
  | 'review'
  | 'apply'
  | 'execute';

interface AgentCapabilityLifecycleDescriptor {
  readonly capabilityId: string;
  readonly providerId: string;
  readonly displayName: string;
  readonly description: string;
  readonly phases: readonly AgentCapabilityLifecyclePhase[];
  readonly inputSchemaId: string;
  readonly resultSchemaId: string;
  readonly accepts?: readonly string[];
  readonly produces?: readonly string[];
  readonly risk: AgentArtifactCapabilityRisk;
  readonly requiresApproval: boolean;
  readonly targetRequirements?: ToolTargetRequirements;
}
```

This can be exposed through `getArtifactFacets()` or a new optional `getLifecycleCapabilities()` method. The first implementation should prefer adding a typed facet if that avoids breaking existing providers.

Rationale: Existing tools already solve registration and LLM-call integration. Lifecycle descriptors add review/apply semantics without forcing every provider to rewrite tools.

Rejected alternative: Create a separate provider registry unrelated to `AgentCapabilityProvider`. That would duplicate discovery, permission, prompt injection, and provider lifecycle work.

### Decision 2: Use one generic invocation result envelope

Add a result envelope that Agent can render and reason about without knowing domain internals:

```ts
interface AgentCapabilityInvocationResult {
  readonly capabilityId: string;
  readonly phase: AgentCapabilityLifecyclePhase;
  readonly status:
    | 'described'
    | 'validated'
    | 'needs-review'
    | 'waiting-approval'
    | 'applied'
    | 'executed'
    | 'blocked';
  readonly diagnostics: readonly AgentCapabilityDiagnostic[];
  readonly reviewArtifact?: AgentCapabilityArtifactRef;
  readonly actions?: readonly AgentCapabilityAction[];
  readonly changedRefs?: readonly AgentCapabilityArtifactRef[];
  readonly data?: unknown;
}
```

Domain-specific detail remains in `data` only when guarded by `resultSchemaId`; generic UI and runtime behavior must use the typed envelope.

Rationale: `ToolResult.data?: unknown` is too weak for review/apply flows. A shared envelope lets Agent show diagnostics/actions and enforce approval consistently.

Rejected alternative: Put every Canvas/Cut/Model result field into one large union. That would become a cross-domain super-protocol and would require shared changes for every domain-specific detail.

### Decision 3: Normalize Webview shortcuts through the same invocation backend

`Send to Canvas` remains a user-facing shortcut, but it should call the same Extension/runtime capability invocation service used by Agent tools. The Webview can assemble user-selected Markdown and stable resource refs, but it must not bypass provider permission, approval, workflow/creation context, or path-level diagnostics.

Rationale: Users need fast UI actions, but the backend behavior must not diverge from Agent tool calls.

Rejected alternative: Keep `invokeCanvasMarkdownCapability` as a separate direct route forever. That preserves duplicate confirmation, diagnostics, and stage-gating logic.

### Decision 4: Move table intent to Canvas-owned profiles

Canvas should own a table profile registry for Markdown-to-Canvas table actions. A profile descriptor includes:

- `profileId`
- accepted source formats
- field aliases and normalization hints
- required or recommended field groups
- unknown-column preservation policy
- resource field hints
- review actions
- apply action id and target capability

Storyboard becomes `canvas.tableProfile.storyboard-draft`. Future profiles can cover approval tables, execution plans, interactive video branch maps, shot image prep, QA review matrices, or generic tables.

Rationale: The shared protocol should support extensibility without centralizing domain-specific column semantics.

Rejected alternative: Put all storyboard/interactive-video fields in shared DTOs. That repeats the over-fixed draft-runtime problem.

### Decision 5: Treat review/action as executable contracts, not labels

Follow-up actions must carry enough typed context to be safely invoked later:

- `actionId`
- `capabilityId`
- `phase`
- source artifact ref or draft node id
- target hint
- approval requirement
- compact argument snapshot or resolver key

Rationale: The important user path is “review this draft, then execute the next approved step.” Labels alone are not enough for robust apply.

Rejected alternative: Let the Agent reinterpret Markdown again when the user clicks the next action. That can lose resource bindings, table profile selection, and validation results.

### Decision 6: Keep resource identity stable and runtime projections out of contracts

Lifecycle inputs and results may reference `ResourceRef`, `DocumentArchiveResourceRef`, generated `assetRef`, project-relative paths, or `${VAR}/path` where existing content-access policy allows them. They must not persist Webview URIs, blob URLs, cache paths, temp absolute paths, or localhost runtime URLs.

Rationale: This keeps the new lifecycle aligned with the existing content-access and resource-cache ADRs.

Rejected alternative: Allow Webview-rendered image URIs to flow back into capability calls. That would make preview projections look like durable resource identity.

### Decision 7: Align mutating phases with approval and IDC/Creation context

`review` and `validate` phases can run without creating production domain nodes. `apply` and mutating `execute` phases must pass confirmation/permission checks and receive workflow/creation context when available. A production node creation request with only a UI mode flag is insufficient evidence of approval.

Rationale: The product goal is plan and execution, not uncontrolled compiler output.

Rejected alternative: Let each provider enforce approval independently with local booleans. That makes cross-domain behavior inconsistent and hard to test.

## Risks / Trade-offs

- [Risk] The lifecycle envelope becomes too abstract. -> Mitigation: keep only cross-domain fields generic; domain payloads remain schema-guarded and provider-owned.
- [Risk] Existing tool execution paths become harder to understand. -> Mitigation: compose with `Tool` and `AgentCapabilityProvider`; migrate only review/apply handoff tools first.
- [Risk] Canvas table profiles become another compiler registry. -> Mitigation: profiles describe validation/review/apply policy inside Canvas only; public contracts stay field-light.
- [Risk] Webview shortcuts lose responsiveness if routed through Agent runtime. -> Mitigation: implement a small Extension invocation service that shares validation/permission plumbing without requiring a model turn.
- [Risk] Workflow/creation context is not always present. -> Mitigation: validate/apply semantics must be explicit: review can proceed without context, mutating apply must either receive context or require direct user confirmation.
- [Risk] Legacy plugin transfer callers still need structured Canvas content. -> Mitigation: remove Canvas structured plugin-transfer payloads and require callers to use lifecycle capabilities or ordinary asset import instead.

## Migration Plan

1. Add shared lifecycle descriptor, invocation input/result, diagnostic, artifact ref, and action DTOs with validators.
2. Add provider registration support for lifecycle descriptors while preserving existing `Tool` registration.
3. Add an Agent-side invocation service that resolves descriptors/handlers, enforces permission and approval, carries workflow/creation context, and returns the generic envelope.
4. Wrap Canvas Markdown capabilities in lifecycle descriptors and adapt their results into the generic envelope.
5. Route Agent Webview "Send to Canvas" Markdown actions through the shared invocation service instead of the direct Canvas Markdown route.
6. Add Canvas table profile descriptors and migrate storyboard detection/validation into the profile layer.
7. Remove legacy plugin transfer Canvas structured paths; keep only ordinary Canvas asset import in plugin transfer and route Markdown/table/storyboard handoff through lifecycle capabilities.
8. Add focused validation and path-level tests.

Rollback strategy: the new lifecycle layer is additive until Canvas Markdown routing switches. If routing causes regressions, keep Canvas direct route behind a temporary diagnostic-only migration flag while preserving fail-closed behavior for new authoring drafts. No durable project data migration is required by this proposal.

## Removed Legacy Transfer Boundary

`canvasText`, `canvasPrompt`, `canvasStructuredContent`, and semantic `canvasStoryboard` are no longer valid Agent plugin-transfer payloads. Agent Webview protocol parsing rejects them, the plugin-transfer runtime throws if an untyped caller bypasses parsing, and Canvas no longer registers the `neko.canvas.importAgentContent` or `neko.canvas.importStoryboard` command handoff entries. The replacement path for Markdown, table, note, and storyboard authoring drafts is the Canvas lifecycle capability route (`invokeCanvasMarkdownCapability` in the Webview, lifecycle facade in the Extension, and Canvas Markdown handlers in `neko-canvas`). Ordinary Canvas asset import remains supported through `singleAsset` / `assetBatch` and `neko.canvas.importAsset`. Validation commands: `pnpm --filter neko-agent exec vitest run packages/agent/src/runtime/__tests__/plugin-transfer-runtime.test.ts packages/extension/src/services/pluginTransferBridge.test.ts packages/extension/src/chat/__tests__/chatWebviewMessageRouter.test.ts` plus the Canvas Markdown capability tests.

## Open Questions

- Should lifecycle descriptors be returned from `getArtifactFacets()` or a new optional `getLifecycleCapabilities()` method?
- Should the invocation service live in `neko-agent` runtime only, or should Extension expose a small host-side facade for Webview shortcuts that do not require a model turn?
- Which table profiles are first-class in this change besides storyboard draft and generic table: approval table, execution plan table, or interactive video branch map?
- Should typed action argument snapshots be stored in Canvas draft node metadata or only resolved from the source artifact at apply time?
