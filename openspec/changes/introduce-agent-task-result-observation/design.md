## Context

Neko Agent already has most of the pieces needed to observe async task completion, but they stop at different ownership boundaries:

- `task/` owns async task state, progress callbacks, persistence, recovery metadata, and terminal statuses.
- `runtime/stream/agent-stream-task-observer.ts` detects background tasks that originate from tool results, posts anchored work-item updates, persists result URLs back into tool-result message blocks, and resolves a terminal completion promise.
- `runtime/turn/agent-turn-runtime.ts` and `runtime/runner/agent-session-runner.ts` already provide an item-aware pending message queue for turns that arrive while the Agent is running.
- `session/types.ts` and the journal already support Agent-first `agent.observation.created`, `agent.evidence.attached`, and `agent.rationale.created` events.
- `executor/act-phase.ts` observes immediate tool results inside the ReAct loop, but it cannot observe terminal results that arrive after the original turn has completed.

The gap is therefore not "missing task UI" or "missing task manager". The gap is that a terminal async task result is not a canonical Agent observation, and terminal task events do not have a policy-controlled path to request a later Agent turn. This is especially visible for media/background tasks: the user can see a task card complete, but the Agent does not automatically get a durable observation it can reason over in a later turn.

This design stays within the local VSCode Extension Host plus local Engine boundary. It does not add a distributed event bus, a workflow service, a generic governance plane, or a new ReAct/runtime layer.

## Goals / Non-Goals

**Goals:**

- Materialize completed, failed, and cancelled async tasks as stable Agent task result observations when they belong to an Agent conversation.
- Make the delivery path event-triggered and recoverable after Extension Host restart.
- Append observations/evidence to the existing session journal instead of creating a second history system.
- Allow explicit policy to request follow-up behavior: notify only, append observation, ask user to continue, or auto-resume the Agent.
- Route follow-up turns through the existing turn/runner scheduling boundary, never through synchronous recursive Agent execution inside a task event handler.
- Preserve current task/work-item UI projection and parent anchors.
- Fail visibly for malformed terminal task payloads, unknown task ids, missing conversation ownership, invalid policies, and unsafe result references.

**Non-Goals:**

- Do not create a generic async workflow runtime.
- Do not move ReAct semantics out of `executor/`.
- Do not make every task completion auto-run the Agent.
- Do not persist pending runner queue items across restart.
- Do not redesign TaskCard, active turn timeline, media cards, or composer queue UI.
- Do not add Rust Engine, Protobuf, cloud, marketplace, or project-file migrations.
- Do not expose local absolute/cache paths as durable task result identities.

## Decisions

### 1. Terminal task results become Agent observations

Introduce a host-neutral task result observation contract that normalizes terminal task snapshots before they are written to the Agent journal.

Representative shape:

```ts
export type AgentTaskResultSource =
  | 'task-manager'
  | 'media-task'
  | 'subagent'
  | 'tool-background-task';

export interface AgentTaskResultRef {
  readonly kind: 'resource' | 'artifact' | 'asset' | 'url';
  readonly id: string;
  readonly mimeType?: string;
  readonly label?: string;
}

export interface AgentTaskResultObservation {
  readonly id: string;
  readonly conversationId: string;
  readonly taskId: string;
  readonly source: AgentTaskResultSource;
  readonly taskType: string;
  readonly status: 'completed' | 'failed' | 'cancelled';
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
  readonly summary: string;
  readonly resultRefs?: readonly AgentTaskResultRef[];
  readonly error?: string;
  readonly createdAt: number;
  readonly completedAt: number;
}
```

Implementation names can follow local style, but the behavior must be discriminated, serializable, and host-neutral. The observation is then projected into existing `AgentObservation` plus optional `PerceptionEvidence` journal events:

- completed task: observation summary plus evidence containing result metadata and result refs;
- failed task: observation summary with failure evidence and error details;
- cancelled task: low-confidence observation that the task was cancelled, without pretending a usable result exists.

Alternative rejected: store task completion only as `TaskUpdatedMessage` or `AgentWorkItem`. Work items are presentation state; they do not give the Agent a durable input it can use after reload or in a later turn.

### 2. Task result delivery policy is explicit and conservative

Add a serializable delivery policy for Agent-owned async tasks. The default behavior is:

- tasks without an owning conversation remain task/work-item updates only;
- tasks with `ownerConversationId` append a task result observation;
- auto-resume is disabled unless the task/tool/capability explicitly opts in.

Representative policy:

```ts
export type AgentTaskResultDeliveryPolicy =
  | { readonly kind: 'notify-only' }
  | { readonly kind: 'append-observation' }
  | { readonly kind: 'ask-user-to-continue' }
  | { readonly kind: 'auto-resume-agent' };
```

The policy can be stored with Agent task lifecycle metadata if the implementation needs restart-safe recovery. If that would broaden `@neko/shared` more than necessary, the first implementation may keep an Agent-owned serializable task binding as long as it is persisted with the task and recoverable by `taskId`.

`auto-resume-agent` must be opt-in. It is appropriate only when a user request, Skill/capability declaration, or specific task type explicitly declares that the Agent should continue when the result arrives.

Alternative rejected: infer auto-resume from any completed result. That would surprise users, create hidden cost, and make background tasks behave like uncontrolled Agent turns.

### 3. Events trigger observation; they do not execute Agent recursively

Terminal task events should flow through a small coordinator:

```text
task terminal event
  -> normalize terminal task snapshot
  -> append idempotent observation/evidence to session journal
  -> update anchored work-item projection
  -> evaluate delivery policy
  -> notify, ask user, or request a follow-up turn through runner/turn scheduling
```

The event handler must not call `AgentSession.execute()` or `AgentExecutor` directly. For follow-up:

- if the Agent is already running, enqueue a pending message through the runner queue;
- if the Agent is idle, schedule a normal turn through the same Extension/turn dispatcher used for user messages;
- if the policy is `ask-user-to-continue`, surface a visible continuation action instead of synthesizing an Agent turn.

The pending queue item source should be extended beyond `composer` when needed, for example `task-result-observation`, so UI and tests can distinguish user-typed prompts from policy-driven follow-up.

Alternative rejected: direct execution from `TaskManager.onProgress` or `waitForCompletion`. That creates reentrancy hazards, bypasses queue semantics, and makes cancellation/confirmation/history behavior inconsistent with ordinary turns.

### 4. Ownership stays with existing directories

Do not create a new top-level runtime category. Ownership stays specific:

| Concern | Owner |
| --- | --- |
| Task status, terminal event, recovery snapshot | `task/` |
| Terminal task normalization and task-owned result metadata | `task/` |
| Observation/evidence journal append and idempotence | `session/` |
| Active turn/work-item projection and parent anchors | `runtime/stream/` |
| Follow-up queue and running/idle dispatch boundary | `runtime/runner/` and `runtime/turn/` |
| ReAct observe loop over immediate tool results | `executor/` |
| VSCode event wiring, diagnostics, and continuation commands | `packages/neko-agent/packages/extension` |
| Webview presentation of existing task/work-item state | `packages/neko-agent/packages/webview` |

If this change touches the existing `AgentObservationRecorder`, prefer moving it under `session/` or introducing the task-result recorder under `session/` instead of adding more observation code to the `runtime/` root. Any temporary export from `runtime/index.ts` must be narrow and have a removal task.

Alternative rejected: place all task-result observation code under `runtime/` because it runs at runtime. That repeats the directory ambiguity this project has been removing.

### 5. Result refs are stable access handles, not local paths

Task result observations may reference generated files, assets, artifacts, media previews, or external URLs, but durable observation data must not store local absolute paths or process-local Webview URIs as identity.

Allowed references are stable handles such as:

- artifact ids;
- asset ids;
- content/resource ids resolved through existing content access/resource projection;
- trusted external URLs when the task result already exposes them as public/provider output.

Extension/Webview adapters may project those handles into Webview-safe URIs at display time. Unsafe or unresolvable refs fail observation creation with a diagnostic while preserving the task terminal state.

Alternative rejected: copy `persistResultUrls` directly into the durable observation as-is. Some URLs are display projections or cache paths, not stable Agent memory.

### 6. Recovery is idempotent

Observation recording must be idempotent across duplicate task progress events, `waitForCompletion` races, and Extension Host restart.

Use deterministic ids or an equivalent ledger:

- observation id: derived from `conversationId + taskId + terminal status`;
- evidence id: derived from `conversationId + taskId + result payload/ref hash`;
- follow-up request id: derived from `observationId + policy`.

On startup or conversation restoration, the coordinator should scan terminal tasks with `ownerConversationId` and append missing observations according to policy. It must not enqueue duplicate auto-resume prompts if a follow-up request was already recorded or completed.

Alternative rejected: rely on in-memory "seen task ids". That loses correctness on restart and turns duplicate provider callbacks into duplicate Agent inputs.

### 7. Failure is visible and bounded

Failure handling should be explicit:

- unknown task id: return or log a task-result diagnostic and do not append an observation;
- missing `ownerConversationId` with an Agent-only policy: reject auto-resume and keep task UI state;
- invalid terminal status or malformed output: fail observation creation with a diagnostic;
- unsafe result refs: reject those refs or the observation according to validation severity;
- auto-resume while policy is absent or disallowed: append observation only;
- enqueue/dispatch failure: keep the observation, emit a visible follow-up diagnostic, and do not mark the follow-up as delivered.

This follows fail-visible behavior without using broad try/catch fallbacks or no-op guards that make the Agent look successful when the task result was not actually processed.

## Five-Layer Analysis

### Responsibility

`task/` owns task facts and terminal events. `session/` owns the durable Agent observation graph. `runtime/stream/` owns active-turn task projection. `runtime/runner` and `runtime/turn` own follow-up scheduling. `executor/` continues to own only the immediate ReAct loop. Extension Host adapts VSCode events and commands; Webview renders existing projections.

### Dependency

The task result observation DTO is host-neutral. Shared task lifecycle changes, if needed, stay in `@neko/shared` and must not depend on Agent implementation files. Webview must not import Agent runtime. Runtime must not import VSCode, React, DOM, or concrete domain extension code.

### Interface

The interface is a small set of serializable inputs and outputs: terminal task snapshot, observation/evidence records, delivery policy, and optional follow-up request. Public Webview protocol changes are needed only if the UI needs a new continuation action or diagnostic beyond existing task updates.

### Extension

New async task types can participate by providing terminal metadata and a delivery policy. They should not implement their own Agent-resume logic. Additional result ref kinds can be added as a discriminated extension when a real owner and resolver exist.

### Testing

Focused unit tests should cover normalization, observation recording, idempotence, policy evaluation, queue dispatch, and recovery. Extension tests should cover terminal task event wiring and diagnostics. Webview tests are required only if a new continuation action/message is added. VSCode Webview smoke is not required unless the implementation changes Webview behavior.

### Proportionality

The design adds a narrow coordinator and contract over existing task/session/runner primitives. It avoids a generic workflow system, a central lifecycle governance layer, or new runtime planes because this is a local Agent orchestration gap, not a distributed platform problem.

### Fail-Visible Behavior

Malformed task terminal payloads, missing conversation ownership, unknown task ids, invalid policies, unsafe result refs, duplicate non-idempotent writes, and failed follow-up dispatch must produce explicit errors or diagnostics. The implementation must not silently fall back to "task UI updated" as proof that the Agent processed the result.

## Risks / Trade-offs

- [Risk] Auto-resume can surprise users or consume provider quota. -> Mitigation: default to append-observation; require explicit opt-in for auto-resume.
- [Risk] Adding policy to shared task lifecycle metadata may make generic task types feel Agent-specific. -> Mitigation: keep the policy minimal and serializable, or use an Agent-owned persisted binding if shared metadata would broaden ownership too much.
- [Risk] Duplicate terminal events can create duplicate observations or follow-up turns. -> Mitigation: deterministic ids or a persisted delivery ledger, plus recovery tests.
- [Risk] Result refs can leak local paths or stale Webview URIs. -> Mitigation: validate refs at the observation boundary and project display URIs only at Extension/Webview time.
- [Risk] Follow-up dispatch races with an active Agent turn. -> Mitigation: route through the existing runner queue when running and through normal turn scheduling when idle.

## Migration Plan

1. Add the task result observation and delivery policy contracts.
2. Implement terminal task normalization from task manager/media/background-task snapshots.
3. Add a session-owned recorder that appends idempotent observation/evidence records to the existing journal.
4. Wire terminal task events from stream/task/media adapters into the coordinator.
5. Add policy evaluation and follow-up request dispatch through runner queue or normal turn scheduling.
6. Add restart reconciliation for terminal tasks with missing observations.
7. Add focused tests and update runtime boundary docs only if files move or new owner rules are introduced.

Rollback is straightforward because no durable project format or Engine contract changes are expected. Disable the coordinator wiring and keep existing task/work-item updates; journaled observations remain readable as ordinary Agent observation events.

## Open Questions

- Should the first implementation store delivery policy directly in `TaskLifecycleMetadata`, or keep a package-local Agent task binding until multiple task adapters need the shared field?
- Should `ask-user-to-continue` reuse an existing queue/notification message, or add a small Webview protocol message for a task-result continuation action?
- Should moving `AgentObservationRecorder` from `runtime/` to `session/` happen in this change, or remain a separate cleanup if the implementation can avoid touching it?
