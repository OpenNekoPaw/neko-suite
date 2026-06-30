## Context

`neko-agent` already has useful pieces for creative work: IDC run tracking, visible creation documents, Skill lifecycle records, media generation asset refs, content access, and event channels. It also has an existing `creation-events.ts` namespace, but that namespace is run-centric and pre-Apply/persona oriented; it does not define a durable Agent creation domain model.

The accepted ADR `docs/architecture/adr-agent-autonomous-filmmaking-creation-boundary.md` establishes the target boundary:

- `Creation` / `CreationIteration` become the canonical creative identity and process tracking model.
- IDC remains `draft` / `plan` / `apply`; observe, evaluate, and revise are activities or feedback loops, not new IDC stages.
- Prompt-chain remains Skill-provided dynamic guidance, not a workflow DSL.
- Media uses `assetRef` / `ResourceRef`; text artifacts remain direct Agent context.
- `agent-workflow-runtime.ts` should be downgraded to legacy projection/compat and eventually deleted.

This change turns those decisions into implementation-ready contracts and tests without adding a fixed workflow engine.

## Goals / Non-Goals

**Goals:**

- Add public Agent DTOs and validators for `Creation`, `CreationIteration`, `CreationEvent`, prompt-chain observations, and media/text attachments.
- Make `creationId` / `iterationId` the identity anchor for creative process tracking.
- Keep IDC stage references limited to `draft` / `plan` / `apply`.
- Add minimal prompt-chain event semantics: checkpoint, skip, reorder, completion.
- Attach Skill lifecycle record ids, prompt-chain ids, text artifacts, media refs, quality diagnostics, and legacy trace ids to creation iterations.
- Add tests proving creation tracking does not use `workflowRunId` as canonical identity.
- Add path-level tests proving generated media can move through Storyboard, Canvas, Cut, and Preview using stable refs.

**Non-Goals:**

- Do not implement a workflow engine or fixed filmmaking pipeline.
- Do not make Skill manifest `mediaWorkflow` a workflow DSL.
- Do not remove `IdcRun` or `runtime.workflowRuntime` in this change.
- Do not migrate existing local creation documents, conversations, or generated media.
- Do not change Rust engine, Protobuf, Canvas `.nkc`, Cut `.nkv`, or media codec contracts.
- Do not add a cloud-scale orchestration service, remote run store, or multi-tenant abstraction.

## Decisions

### Decision 1: Add an Agent-owned creation contract in `agent-types`

Add a new `agent-creation.ts` or equivalent module in `packages/neko-agent/packages/agent-types/src/`.

The contract should include:

```ts
type AgentCreationStatus = 'active' | 'completed' | 'cancelled' | 'failed' | 'archived';
type AgentCreationIterationStatus = 'running' | 'completed' | 'failed' | 'cancelled';
type AgentCreationActivity =
  | 'analyze'
  | 'plan'
  | 'generate'
  | 'edit'
  | 'review'
  | 'repair'
  | 'handoff'
  | 'observe';

interface AgentCreation {
  readonly creationId: string;
  readonly conversationId?: string;
  readonly title?: string;
  readonly status: AgentCreationStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly textArtifacts?: readonly AgentCreationTextArtifactRef[];
  readonly mediaRefs?: readonly AgentCreationMediaRef[];
  readonly currentIterationId?: string;
  readonly provenance?: AgentCreationProvenance;
}

interface AgentCreationIteration {
  readonly iterationId: string;
  readonly creationId: string;
  readonly idcStage?: 'draft' | 'plan' | 'apply';
  readonly activity: AgentCreationActivity;
  readonly reason?: string;
  readonly status: AgentCreationIterationStatus;
  readonly skillRecordIds?: readonly string[];
  readonly promptChainId?: string;
  readonly textInputs?: readonly AgentCreationTextArtifactRef[];
  readonly textOutputs?: readonly AgentCreationTextArtifactRef[];
  readonly mediaInputs?: readonly AgentCreationMediaRef[];
  readonly mediaOutputs?: readonly AgentCreationMediaRef[];
  readonly diagnostics?: readonly AgentCreationDiagnostic[];
  readonly trace?: AgentCreationTraceRef;
  readonly startedAt: number;
  readonly endedAt?: number;
}
```

Rationale: `agent-types` is the shared Agent protocol package already consumed by runtime, extension, webview, and CLI/TUI. The model is Agent-specific; moving it to `@neko/shared` would broaden the dependency surface too early.

Rejected alternative: Add `CreationIteration` fields to `IdcRun`. That would keep run identity as the creative identity and make non-IDC media review or handoff awkward.

### Decision 2: Keep `creation-events.ts`, but separate legacy run events from canonical creation events

The existing `creation-events.ts` module currently exports `CreationEvent` for run/persona milestones. This change should avoid a type-name collision that makes old run events look canonical.

Preferred approach:

- Introduce explicit names such as `AgentCreationEvent`, `AgentCreationEventKind`, and `AgentCreationEventEnvelope`.
- Keep the existing `CreationEvent` export temporarily as a legacy run/persona event alias if needed.
- Add comments and tests making the distinction clear.

Rationale: This is a prelaunch cleanup boundary. Renaming or separating types is better than letting two incompatible meanings of `CreationEvent` coexist silently.

Rejected alternative: Extend the existing `CreationEvent` union in place. That would mix run lifecycle, user-facing status narration, prompt-chain observation, and media tracking in one unbounded event channel.

### Decision 3: Iteration events carry refs, not binary data or Webview projections

Creation iteration media attachments should accept stable compact summaries of:

- generated asset `assetRef`;
- `ResourceRef`;
- `DocumentArchiveResourceRef`;
- optional media kind, role, label, and provenance.

They must not accept Webview URI, cache path, temporary absolute path, or binary payload fields as durable identity.

Text artifacts should reference project-visible text files, artifact ids, or frontmatter-backed creation documents. They should not require `ResourceRef`.

Rationale: This preserves the ADR distinction: text is Agent context; media is managed resource.

### Decision 4: Prompt-chain observation is an event contract, not an executor

Add minimal prompt-chain observation types:

```ts
type AgentPromptChainEventKind =
  | 'checkpoint'
  | 'skip'
  | 'reorder'
  | 'complete';
```

Each prompt-chain event must include `creationId`, `iterationId`, `promptChainId`, event kind, timestamp, and enough reason/checkpoint metadata for tests and UI projection. It should optionally include `skillRecordId` or `skillName`.

Rationale: The Agent remains free to skip, reorder, or repeat guidance. Tests can prove dynamic execution without introducing a hidden workflow DSL.

Rejected alternative: Define an executable prompt-chain plan schema. That would recreate the workflow engine this ADR explicitly avoids.

### Decision 5: `agent-workflow-runtime.ts` becomes legacy projection only

Do not route new creation tracking through `createAgentWorkflowRuntime`, `AgentWorkflowRuntime`, or `AgentWorkflowRun`.

Implementation should:

- add creation/iteration contracts first;
- adapt any needed `workflowRunId` correlations into optional `trace` fields;
- keep `runtime.workflowRuntime` as the bootstrap surface for `stageTracking`, `idcTaskProjection`, and `controlPlane`;
- add tests that fail if creation identity is derived from `workflowRunId`.

Rationale: This preserves current bootstrap plumbing while removing the temptation to make workflow run identity canonical.

Rejected alternative: Delete all workflow types immediately. Current Webview projections, work item contexts, multimodal tooling, and tests still reference workflow identity as optional trace metadata.

### Decision 6: Creation event persistence starts as runtime-local and host-adapted

This change should define a narrow runtime port for recording creation events or projecting them into existing session/journal mechanisms. The initial implementation may use existing journal/event bus infrastructure rather than a new durable store.

The contract should be compatible with a later local metadata store, but should not introduce SQLite tables, remote sync, or a new daemon in this change.

Rationale: Neko Suite is a local VSCode product. The first useful boundary is typed trace and tests, not a heavy persistence layer.

## Five-Layer Analysis

### Responsibility

- `agent-types` owns DTOs, discriminants, validators, and type guards.
- `agent` owns creation/iteration event helpers, IDC/Skill/prompt-chain attachment, and fail-visible validation.
- `extension` only wires host persistence/projection when needed.
- `webview` consumes projections only; it does not infer Skill, IDC stage, or creation strategy.
- Existing media, Canvas, Cut, Preview, and content access packages continue owning their domain facts.

### Dependency

- New public DTOs stay in `agent-types` unless reusable media ref helpers already belong in `@neko/shared`.
- Webview does not import runtime.
- Extension does not import React.
- Feature packages are not made to import `neko-agent` internals; cross-domain validation should use public contracts and existing commands/facades.

### Interface

- New contract fields are typed and validated.
- IDC stage remains a small optional field limited to `draft` / `plan` / `apply`.
- Activity describes creative work, not IDC lifecycle.
- Legacy `workflowRunId` may appear only inside optional `trace` metadata.
- Prompt-chain observation events are append-only facts, not executable instructions.

### Extension

- New activities can be added deliberately through the Agent contract if tests and UI projections need them.
- New prompt-chain event kinds require a spec update.
- Future quality review DTOs can attach to `AgentCreationDiagnostic` or a typed review result without changing the core identity model.

### Testing

- Unit tests for validators and type guards in `agent-types`.
- Runtime tests for iteration creation, prompt-chain events, Skill lifecycle attachment, and workflow identity poison tests.
- Path-level media tests proving stable ref propagation through generated media, Storyboard, Canvas, Cut, and Preview.
- Existing generated asset and content access tests remain supporting evidence but should not replace the new end-to-end path test.

## Risks / Trade-offs

- [Risk] The existing `creation-events.ts` name may cause confusion. → Mitigation: use explicit `AgentCreation*` names and keep legacy names documented until removed.
- [Risk] Creation tracking could grow into a workflow engine. → Mitigation: no executable node/transition schema; only iteration activities and prompt-chain observations.
- [Risk] Too many optional refs reduce contract value. → Mitigation: validators require stable identity for media attachments and reject Webview/cache/temp identities.
- [Risk] Tests may accidentally pass through legacy workflow identity. → Mitigation: add poisoned `workflowRunId` tests and assert `creationId` / `iterationId` are the canonical keys.
- [Risk] Media path tests may become broad. → Mitigation: use focused fixture objects and spy/poison fallback paths rather than full VS Code UI smoke unless UI changes are introduced.

## Migration Plan

1. Add contracts and validators in `agent-types`.
2. Add runtime helper APIs and tests that create iterations independent of `AgentWorkflowRun`.
3. Add prompt-chain observation events and tests.
4. Add media ref attachment tests and path-level cross-domain fixture tests.
5. Mark or isolate `agent-workflow-runtime.ts` as legacy projection/compat in exports/tests.

Rollback strategy: remove the new contracts and helper wiring before any durable store migration exists. Existing user files and generated media are not modified by this change.

## Open Questions

- Should the existing `creation-events.ts` file be renamed in this change, or should it remain with new explicit `AgentCreation*` exports beside legacy run events?
- Should `quality review` produce a dedicated typed review result in this change, or only attach diagnostics and leave detailed review DTOs for a follow-up?
- Should `Creation` records be persisted immediately through the existing journal, or should persistence be deferred until consumers require restore across sessions?
