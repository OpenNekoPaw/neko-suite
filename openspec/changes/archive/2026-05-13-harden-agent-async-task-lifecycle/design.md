## Context

`TaskManager` already runs inside the VSCode Extension Host and persists task state through `ITaskStorage`. That is the right lifecycle boundary: Chat Webview visibility must not control task execution. The current gap is that shutdown, restart, external provider recovery, Webview replay, and Agent stop semantics are not represented as one explicit lifecycle contract.

The current implementation has these important properties:

- `ITaskStorage` is persisted through VSCode `globalState` in the extension bootstrap path.
- `ITaskRecoveryStorage` has memory and file implementations, but the VSCode bootstrap path does not inject a persistent recovery store.
- `TaskManager.dispose()` is synchronous and only clears timers and concurrency pools.
- `waitForCompletion()` polls every 100ms instead of resolving from task state change events.
- Chat task delivery is tied to Webview `postMessage`, while Dashboard task monitoring maps mirrored work items in a separate source.
- Agent session cancellation currently does not have an explicit contract for which background tasks are detached and which foreground token-active tasks are cancelled.

The change follows the ADR in `docs/architecture/adr-agent-async-task-lifecycle.md`.

## Goals / Non-Goals

**Goals:**

- Preserve the existing three-layer split: shared contracts, host-agnostic agent/platform logic, and VSCode extension bridge wiring.
- Make Extension Host shutdown deterministic enough for recovery by aborting running executors, snapshotting pending/running tasks, and flushing storage with a bounded timeout.
- Persist external provider recovery info so already submitted provider tasks can resume polling the same external task after restart.
- Add shared lifecycle metadata for task ownership, run mode, cost phase, interruption policy, and recovery policy.
- Keep Agent stop semantics separate from async task lifecycle: cancel foreground token-active work by default, detach external-wait and local-finalize work by default.
- Use one task projection source for Chat task replay and Dashboard task monitoring.
- Replace completion busy-waiting with event-driven waiters.
- Add unit and integration tests for shutdown, abort, persisted recovery, replay, projection consistency, interruption policy, and restart recovery.

**Non-Goals:**

- Do not make Webview responsible for task execution, recovery, cancellation policy, or lifecycle inference.
- Do not move provider-specific cost boundary decisions into Dashboard or Chat delivery code.
- Do not make `ServiceCollection.dispose()` asynchronous or depend on VSCode `context.subscriptions` awaiting async disposal.
- Do not persist runtime-only objects such as `AbortSignal`.
- Do not guarantee recovery for synchronous provider calls that never expose an external task id, beyond an explicit checkpoint evaluation.
- Do not change provider APIs beyond the narrow lifecycle/cancellation/reporting contracts needed by this change.

## Decisions

### 1. Add shared lifecycle metadata in Layer 0

Define `TaskLifecycleMetadata`, `TaskCostPhase`, `TaskInterruptPolicy`, and `TaskRecoverPolicy` in the shared task types package. `Task` and `SerializableTask` may carry this metadata.

Rationale: `@neko/platform` must report cost phase and recovery policy without importing `@neko/agent`, and Dashboard must display projected lifecycle state without owning the enum definitions.

Alternatives considered:

- Define lifecycle types in `task-runtime.ts`: rejected because platform/provider adapters would need to depend on agent internals.
- Define lifecycle fields only in Dashboard DTOs: rejected because Dashboard is a projection surface and cannot own task lifecycle truth.

### 2. Keep executor cancellation runtime-only

Extend the executor contract with an execution context that includes an `AbortSignal` or equivalent runtime-only cancellation handle. `TaskInput`, `Task`, `SerializableTask`, and recovery payloads must not serialize the signal.

Rationale: cancellation must reach HTTP calls, polling sleeps, and local finalize waits, but runtime handles are not durable data.

Alternatives considered:

- Only snapshot running tasks to pending on dispose: rejected because executor promises can keep local work running until process exit.
- Persist cancellation state in task payload: rejected because it mixes runtime process handles with recovery data.

### 3. Use async `TaskManager.dispose()` but await it from exported `deactivate()`

Change `IRuntimeTaskManager.dispose()` / `TaskManager.dispose()` to return `Promise<void>`. Extension `deactivate()` explicitly awaits bounded task shutdown. `ServiceCollection.dispose()` remains a synchronous VSCode `Disposable` fallback.

Shutdown order:

1. Abort running executor contexts synchronously.
2. Snapshot pending/running tasks as recoverable pending tasks.
3. Flush task storage and recovery storage with `Promise.allSettled()`.
4. Apply a short timeout, such as 1500-3000ms.
5. Log timeout/failure and return so VSCode shutdown is not blocked indefinitely.

Rationale: VSCode `Disposable.dispose()` is synchronous, but exported `deactivate()` may return a promise. This keeps the VSCode lifecycle contract intact while still flushing critical recovery state.

Alternatives considered:

- Make `ServiceCollection.dispose()` async: rejected because callers using `vscode.Disposable` cannot reliably await it.
- Sequentially save tasks: rejected because shutdown time is limited and many running tasks would increase data-loss risk.

### 4. Persist recovery storage through VSCode `globalState`

Add a VSCode state-backed `ITaskRecoveryStorage` adapter and inject it beside `ITaskStorage` in `serviceBootstrap.ts`. Use a separate key, for example `neko.agent.taskRecovery`.

Rationale: task state and recovery info have the same Extension Host lifecycle. Persisting provider `externalTaskId` mappings prevents duplicate provider submissions after restart.

Alternatives considered:

- Store recovery info under workspace `.neko`: deferred because it introduces workspace file ownership and multi-root boundary questions.
- Keep memory recovery storage: rejected for external-wait tasks because restart loses the provider mapping.

### 5. Let provider adapters own cost phase transitions

`TaskManager` stores lifecycle metadata and emits changes. Executor/provider adapters report transitions because they know when token consumption begins, when an external task id is returned, and when local finalize starts.

Expected transition:

```text
pending -> token-active -> external-wait -> local-finalize -> idle
```

Rationale: cost boundaries are provider/runtime facts, not UI facts.

Alternatives considered:

- Infer `costPhase` from progress or task status in Dashboard: rejected because task status does not distinguish token-active from external-wait.
- Let `TaskManager` infer provider phases centrally: rejected because it would need provider-specific knowledge.

### 6. Add compose-only lifecycle coordination in the bridge layer

`TaskLifecycleCoordinator` lives in the Extension bridge layer as a compose-only service. It subscribes to Agent interruption events, queries task metadata through a read-only port, and forwards matching tasks to cancellation ports. It must not define default policies, advance `costPhase`, write storage, or generate Dashboard projections.

Rationale: this avoids direct `AgentManager -> TaskManager` coupling while still allowing VSCode extension wiring to coordinate independent services.

Alternatives considered:

- Inject `TaskManager` directly into `AgentManager`: rejected because it makes session logic depend on task manager implementation.
- Put coordinator in Dashboard: rejected because Dashboard is a monitoring and action surface, not an orchestration layer.

### 7. Share task projection between Chat delivery and Dashboard

Introduce `TaskProjectionSource` / `AgentTaskProjectionSource` in the Extension bridge layer. `TaskDeliveryBridge` uses it for Webview terminal replay and cursor diff. `DashboardWorkItemSource` uses the same projection for snapshots and events.

Rationale: PR3 must not leave Chat replay and Dashboard monitoring with two separate task-reading models.

Alternatives considered:

- Add replay logic directly to `ChatViewProvider`: rejected because it expands an already broad Webview lifecycle class.
- Keep Dashboard mapping independent until PR5: rejected because it would preserve drift immediately after PR3.

### 8. Persist delivery cursors

Store per-conversation task delivery cursors in VSCode `globalState`. Prefer a monotonic `taskDeliverySeq`; if that is not feasible, use `(updatedAt, taskId)` as a composite cursor.

Rationale: an in-memory last-visible timestamp is lost on Extension Host restart and wall-clock-only cursors can miss same-millisecond terminal tasks or clock changes.

### 9. Replace completion polling with event-driven waiters

Maintain waiter lists keyed by task id and resolve/reject them from task state updates when a task reaches a terminal status. Clean waiters on timeout and delete.

Rationale: task updates already flow through `TaskManager`; using them removes unnecessary event-loop wakeups and improves concurrency behavior.

## Risks / Trade-offs

- Async shutdown may still exceed the VSCode shutdown window -> use bounded timeout, parallel flush, and warning logs.
- Executors may ignore abort signals -> tests must verify shutdown still returns after timeout and task state remains recoverable.
- Recovery info can be corrupt or stale -> storage loads must degrade to empty recovery info while preserving task state recovery.
- A provider may not support resume polling by external id -> `recoverPolicy` must allow `retry-executor`, `snapshot-only`, or `none`.
- Shared projection can become a dumping ground -> keep it read-only and limited to DTO mapping, sorting, filtering, and event fan-out.
- Lifecycle metadata added to persisted tasks may require migration defaults -> load paths must tolerate missing metadata and apply conservative defaults.

## Migration Plan

1. Add shared lifecycle DTOs and runtime-only executor context types.
2. Update `TaskManager` to store metadata, track abort controllers, implement async dispose, and resolve completion waiters from terminal updates.
3. Add persistent VSCode state-backed `ITaskRecoveryStorage` and inject it during bootstrap.
4. Update media/provider executors to save recovery info and report `costPhase` at token-active, external-wait, and local-finalize boundaries.
5. Add `TaskProjectionSource`, refactor `DashboardWorkItemSource` to consume it, and add `TaskDeliveryBridge` for Webview replay and persistent cursors.
6. Add `TaskLifecycleCoordinator` as compose-only bridge wiring for Agent interruption events and cancellation ports.
7. Add targeted unit tests and the end-to-end restart/replay regression.

Rollback strategy: keep storage formats additive and tolerate missing lifecycle metadata. If projection bridge rollout has issues, Dashboard can temporarily continue consuming mirrored work items while task state and recovery storage remain intact.

## Open Questions

- Should the persisted delivery cursor use a generated monotonic sequence in `TaskManager`, or should PR3 start with `(updatedAt, taskId)` and add sequence later?
- Which providers can reliably resume polling by `externalTaskId`, and which must use `retry-executor` or `snapshot-only`?
- Should synchronous AI SDK image generation receive lightweight checkpoints in this change or remain a follow-up after measuring latency impact?
