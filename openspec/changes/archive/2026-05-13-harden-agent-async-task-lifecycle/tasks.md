## 1. Shared Contracts

- [x] 1.1 Add `TaskLifecycleMetadata`, `TaskCostPhase`, `TaskInterruptPolicy`, and `TaskRecoverPolicy` to shared task types without VSCode or React dependencies.
- [x] 1.2 Extend `Task` and `SerializableTask` to optionally carry lifecycle metadata while preserving compatibility with older persisted tasks.
- [x] 1.3 Extend the task executor contract with a runtime-only execution context carrying cancellation and lifecycle reporting hooks.
- [x] 1.4 Add shared type tests for lifecycle metadata defaults, serialization compatibility, and forbidden host dependency boundaries.

## 2. Task Manager Runtime

- [x] 2.1 Update `IRuntimeTaskManager.dispose()` and `TaskManager.dispose()` to return `Promise<void>` and implement bounded async shutdown.
- [x] 2.2 Track per-task abort controllers or equivalent cancellation handles for running executors.
- [x] 2.3 On shutdown, abort running executors, snapshot pending/running tasks as recoverable pending tasks, and flush task/recovery storage with `Promise.allSettled()`.
- [x] 2.4 Add task lifecycle update support so executors can report cost phase and lifecycle metadata changes through `TaskManager`.
- [x] 2.5 Replace `waitForCompletion()` polling with event-driven waiters resolved from terminal task updates and cleaned on timeout/delete.
- [x] 2.6 Add task manager tests for async dispose, abort propagation, ignored-abort timeout behavior, lifecycle metadata persistence, and multiple completion waiters.

## 3. Persistent Recovery Storage

- [x] 3.1 Add a VSCode state-backed `ITaskRecoveryStorage` adapter or factory that stores `TaskRecoveryInfo[]` under a dedicated key.
- [x] 3.2 Inject persistent recovery storage in `serviceBootstrap.ts` beside the existing state-backed task storage.
- [x] 3.3 Ensure corrupt or missing recovery storage degrades to empty recovery info without blocking task storage recovery.
- [x] 3.4 Update `deactivate()` to explicitly await bounded task manager shutdown while keeping `ServiceCollection.dispose()` synchronous.
- [x] 3.5 Add bootstrap/recovery tests for persisted `externalTaskId` loading across recreated task manager instances.

## 4. Provider Lifecycle Reporting

- [x] 4.1 Update media/provider executors to accept the runtime execution context and observe cancellation around HTTP calls, polling waits, and local finalize waits.
- [x] 4.2 Report `token-active`, `external-wait`, `local-finalize`, and terminal `idle` transitions from executor/provider adapter boundaries.
- [x] 4.3 Save `TaskRecoveryInfo` when a provider returns an external task id, before entering external polling.
- [x] 4.4 Resume provider polling from persisted recovery info when recover policy allows `resume-polling`, avoiding duplicate provider submissions.
- [x] 4.5 Add provider executor tests for cost phase transitions, recovery info write ordering, cancellation during external wait, and no duplicate submit on restart.

## 5. Task Projection And Delivery

- [x] 5.1 Add `TaskProjectionSource` / `AgentTaskProjectionSource` as a read-only extension bridge service for agent task DTO projection.
- [x] 5.2 Refactor `AgentDashboardWorkItemSource` to consume the shared projection source for snapshot/events while retaining source-owned cancel/retry delegation.
- [x] 5.3 Add `TaskDeliveryBridge` for Chat Webview ready/reconnect handling, terminal replay, delivery cursor diff, and delivery acknowledgement.
- [x] 5.4 Persist per-conversation task delivery cursors in `globalState` using a monotonic sequence or `(updatedAt, taskId)` composite cursor.
- [x] 5.5 Wire `ChatViewProvider` to forward Webview ready/reconnect events to `TaskDeliveryBridge` without embedding diff/replay logic in the provider.
- [x] 5.6 Add projection/delivery tests for Webview rebuild replay, extension restart cursor persistence, same-timestamp terminal tasks, and Chat/Dashboard projection consistency.

## 6. Agent Interruption Coordination

- [x] 6.1 Add a narrow Agent conversation interruption event or callback carrying conversation id and stop reason.
- [x] 6.2 Add `TaskLifecycleCoordinator` as a compose-only extension bridge service connecting interruption events, task query ports, and task/subagent cancellation ports.
- [x] 6.3 Ensure `TaskLifecycleCoordinator` does not define interruption defaults, mutate cost phase, write task/recovery storage, or generate Dashboard projections.
- [x] 6.4 Apply interruption policy so `cancel-with-agent` foreground token-active tasks cancel while `detach-and-continue` and `finish-critical-step` tasks continue by default.
- [x] 6.5 Add tests proving Agent manager/session stop does not directly import or call concrete `TaskManager` lifecycle methods.

## 7. Integration And Validation

- [x] 7.1 Add an end-to-end regression for submit -> external-wait -> deactivate -> reactivate -> recovery polling same externalTaskId -> Webview rebuild -> Chat and Dashboard result visibility.
- [x] 7.2 Add architecture guard coverage for shared lifecycle types, platform cost phase reporting without `@neko/agent` imports, Webview dependency boundaries, and extension compose-only coordinator boundaries.
- [x] 7.3 Run targeted TypeScript tests for `packages/neko-types`, `packages/neko-agent/packages/agent`, `packages/neko-agent/packages/platform`, and `packages/neko-agent/packages/extension`.
  - Validation 2026-05-13: `pnpm --filter @neko/shared test -- src/core/__tests__/async.test.ts src/types/__tests__/task-lifecycle.test.ts` passed with 63 files / 626 tests.
  - Validation 2026-05-13: `pnpm vitest run packages/neko-agent/packages/agent/src/task/__tests__/task-manager.test.ts packages/neko-agent/packages/agent/src/task/__tests__/task-manager-persistence.test.ts packages/neko-agent/packages/agent/src/task/__tests__/task-recovery-storage.test.ts packages/neko-agent/packages/platform/src/media/__tests__/media-task-executor-lifecycle.test.ts packages/neko-agent/packages/extension/src/services/taskProjectionSource.test.ts packages/neko-agent/packages/extension/src/services/taskDeliveryBridge.test.ts packages/neko-agent/packages/extension/src/services/dashboardWorkItemSource.test.ts packages/neko-agent/packages/extension/src/services/taskLifecycleCoordinator.test.ts packages/neko-agent/packages/extension/src/services/taskLifecycleArchitecture.test.ts packages/neko-agent/packages/extension/src/services/agentAsyncTaskLifecycle.integration.test.ts` passed with 10 files / 101 tests.
- [x] 7.4 Run the repository check/build target required for affected packages and document any deferred sync-task checkpoint follow-up.
  - Validation 2026-05-13: `pnpm check:agent-boundaries` passed with 1102 checked files and no findings.
  - Validation 2026-05-13: `pnpm build:neko-agent` passed.
  - Deferred follow-up: synchronous provider calls that never expose an `externalTaskId` remain snapshot/retry-only per this change's non-goal. Add lightweight checkpoints only after measuring latency/cost risk for those providers.
