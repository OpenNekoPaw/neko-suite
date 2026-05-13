# ADR: Agent 异步任务生命周期 — 后台运行、关闭处理与恢复机制

## 状态

Accepted / Implemented (2026-05-13)

## 背景

neko-agent 的异步任务系统（`TaskManager`）承载图片/视频/音频生成等长时间运行的工作。用户在使用过程中会频繁切换面板、关闭 Webview、甚至重启 VSCode。需要明确任务在这些场景下的行为边界，识别当前实现的缺陷并给出改进路径。

### 现有架构

```
submit() → ConcurrencyPool.acquire() → executor() → updateTask() → storage.save()
                                                          ↓
                                                   progressCallbacks → webview.postMessage()
```

- `TaskManager`（`@neko/agent`）：内存 `Map<string, Task>` + 可选 `ITaskStorage` 持久化
- `MediaTaskExecutor`（`@neko/platform`）：图片/视频/音频生成的具体执行器，支持轮询和 recovery
- `AgentStreamProcessor`（extension 层）：将任务进度通过 `postMessage` 投递到 Webview
- `ChatViewProvider`（extension 层）：管理 Webview 生命周期和 dispose 链

### 并发控制

| 维度 | 默认值 | 配置项 |
|------|--------|--------|
| 全局并发上限 | 10 | `ConcurrencyConfig.maxConcurrent` |
| 按类型并发上限 | 5 | `ConcurrencyConfig.perTypeLimits` |
| 队列超时 | 60s | `ConcurrencyConfig.queueTimeout` |
| 任务保留期 | 7 天 | `TaskManagerOptions.retentionPeriodMs` |
| 自动清理间隔 | 1 小时 | `TaskManagerOptions.cleanupIntervalMs` |

## 当前行为分析

### 1. 后台运行支持 — 部分支持

任务在 Extension Host 进程内运行，不依赖 Webview 可见性：

| 场景 | 任务影响 | 恢复机制 |
|------|---------|---------|
| Webview 隐藏（切 tab） | 无影响，继续执行 | `onDidChangeVisibility` 恢复 UI |
| Webview 销毁（面板关闭） | 无影响，继续执行 | 重新打开面板时可读取任务状态 |
| Extension deactivate | **任务丢失** — running Promise 悬空 | `resumePendingTasks()` 从 Storage 恢复 |
| VSCode 关闭 | **任务丢失** | 同上，下次启动走 recovery 路径 |

**关键点**：Webview 的显隐不影响任务执行。`ChatViewProvider._disposeWebviewBindings()` 只清理 Webview 事件监听器，不触及 `TaskManager`。

### 2. 关闭处理 — 存在缺陷

Extension 的 dispose 链：

```
VSCode deactivate
  → context.subscriptions.forEach(d => d.dispose())
    → ServiceCollection.dispose()
      → ChatViewProvider.dispose()
        → _disposeWebviewBindings()    // 清理 Webview 绑定
        → _messages.dispose()          // 清理消息处理
        → _conversations.dispose()     // 清理会话
      → TaskManager.dispose()
        → clearInterval(cleanupTimer)  // 停止自动清理
        → globalPool.dispose()         // 释放并发池
        → typePools.dispose()          // 释放类型池
        // ← 不取消 running 任务
        // ← 不 flush 待写入的 storage
```

### 3. 恢复机制 — 基础任务可重试，外部任务精确恢复不完整

```
Extension activate
  → TaskManager.initialize()           // 从 Storage 加载所有任务
  → TaskManager.resumePendingTasks()   // running → pending，重新执行
  → MediaTaskExecutor.resumeFromRecovery()  // 设计上通过 externalTaskId 恢复轮询
```

恢复依赖两个 Storage：
- `ITaskStorage`：保存 Task 完整状态（状态/输入/输出）
- `ITaskRecoveryStorage`：保存外部任务映射（taskId ↔ externalTaskId + providerId）

当前 VSCode extension 已通过 `createStateTaskStorage()` 将 `ITaskStorage` 持久化到 `context.globalState`，storage key 为 `neko.agent.tasks`。`createPlatform()` 启动时会调用 `TaskManager.initialize()` 和 `TaskManager.resumePendingTasks()`，因此 `pending` / `running` 的任务会在重启后被加载并重新执行。

但当前 bootstrap 未给 `TaskManager` 注入持久化的 `ITaskRecoveryStorage`，默认 recovery storage 是内存实现。也就是说：

- **任务状态持久化：已支持**
- **pending/running 自动恢复：已支持，方式是重新执行 executor**
- **外部 provider 任务精确恢复：不完整**，因为 `externalTaskId` 映射可能随进程退出丢失
- **已提交外部任务继续轮询同一个 externalTaskId：仅在 recovery info 被持久化时可靠**

### 4. Agent 会话中断与异步任务生命周期

Agent 会话和异步任务不是同一个生命周期平面：

- Agent 会话运行态表示当前 LLM turn、工具调用循环、确认队列和排队消息是否正在执行。
- 异步任务运行态表示媒体生成、后台工具、SubAgent 等工作是否仍在等待结果、下载输出或收尾。

因此任务必须带有 `conversationId` 归属，方便 UI 恢复、Dashboard 聚合和权限审计；但任务不应默认随会话中断一起取消。是否随会话中断，取决于任务是否仍在主动消耗 token 或执行前台工具循环。

| 任务阶段 | 是否随 Agent 中断 | 理由 |
|----------|-------------------|------|
| `token-active`：当前 LLM stream、foreground SubAgent、judge/evaluator LLM 调用 | 默认取消 | 用户点击 Stop 的语义是停止继续推理和继续消耗 token |
| `external-wait`：已提交外部 provider，只在轮询状态 | 默认继续 | token 已停止消耗，取消会导致已付成本/已排队结果丢失 |
| `local-finalize`：下载、转码、写资产索引、结果 backfill | 默认继续完成 | 保证已完成结果可见，避免半写入状态 |
| 显式后台 token 任务：`run_in_background` SubAgent 等 | 默认继续，但必须可见、可取消 | 用户/Agent 已显式声明后台执行，应进入 Dashboard/TaskTable |
| 临时前台工具任务 | 默认取消 | 属于当前 turn 的执行上下文，不应脱离用户中断意图 |

推荐后续为任务补充显式生命周期元数据：

```typescript
// @neko/shared/types/task.ts
// Layer 0 DTO: no VSCode, no React, no @neko/agent imports.
interface TaskLifecycleMetadata {
  readonly ownerConversationId: string;
  readonly runMode: 'foreground' | 'background';
  readonly costPhase: 'token-active' | 'external-wait' | 'local-finalize' | 'idle';
  readonly interruptPolicy: 'cancel-with-agent' | 'detach-and-continue' | 'finish-critical-step';
  readonly recoverPolicy: 'resume-polling' | 'retry-executor' | 'snapshot-only' | 'none';
}
```

默认策略：

- 前台 token 消耗任务：`cancel-with-agent`
- 后台媒体生成：`detach-and-continue` + `resume-polling`
- 已提交但缺少 external recovery info 的任务：`detach-and-continue` + `retry-executor`
- 本地收尾：`finish-critical-step`

cost phase 的状态转换必须由最接近真实成本边界的执行层负责，而不是由 Dashboard 或 Chat Webview 推断：

```
pending
  → token-active        // executor 即将调用 LLM / SubAgent / token 消耗 API
  → external-wait       // provider 已返回 externalTaskId，后续只轮询状态
  → local-finalize      // provider 已完成，下载/转码/资产索引/backfill
  → idle                // completed / failed / cancelled
```

职责划分：

- `TaskManager` 负责保存通用任务状态、取消信号、持久化和事件通知。
- `TaskExecutor` / provider adapter 负责上报 `costPhase`，因为它知道何时开始消耗 token、何时拿到 `externalTaskId`、何时进入本地收尾。
- `MediaTaskExecutor` 在获得 `externalTaskId` 时必须同时写入 `TaskRecoveryInfo` 并上报 `external-wait`。
- `AgentSession` / `SubAgentRuntime` 在开始 LLM stream 或 foreground SubAgent 时上报 `token-active`，在用户中断时遵循 `interruptPolicy`。
- Dashboard 只消费投影结果，不推断或改写生命周期。

解耦约束：

- `TaskLifecycleMetadata`、`TaskCostPhase`、`TaskInterruptPolicy`、`TaskRecoverPolicy` 必须定义在 `@neko/shared`，作为 Layer 0 DTO。`@neko/platform` 需要上报这些字段，不能反向依赖 `@neko/agent` 或 extension。
- `AgentManager` 不应直接依赖 `TaskManager`。会话中断只发布 `AgentConversationInterrupted` 事件或调用注入的 narrow callback，由 extension bridge 将事件转发给任务生命周期协调器。
- `TaskLifecycleCoordinator` 是 extension bridge 层的组合服务（compose-only），不拥有 domain logic。它只订阅会话中断事件、读取任务 metadata，并调用注入的窄接口（`TaskCancelPort` / media cancel / `SubAgentCancelPort`）。
- `TaskLifecycleCoordinator` 不定义 `interruptPolicy` 默认值，不推进 `costPhase`，不写 task/recovery storage，也不生成 Dashboard 投影。业务规则必须来自 shared lifecycle contract、`TaskManager`、executor/provider adapter 或 SubAgent runtime。
- `TaskManager` 不理解 Agent 会话，只理解任务 metadata 和取消信号。
- Chat delivery 和 Dashboard 必须消费同一个任务投影源，不能各自读取不同状态模型。
- Dashboard 只通过 `DashboardTaskSource` 消费任务投影，不能调用 agent/session 内部对象推断状态。

## 识别问题

### P0: `dispose()` 不处理 running 任务

**文件**: `packages/neko-agent/packages/agent/src/task/task-manager.ts:203-209`

`dispose()` 只清理 timer 和 pool，不遍历 running 任务。Extension deactivate 时：
- 正在 await 的 Promise（HTTP 请求、轮询 sleep）变成悬空 microtask
- 如果在 `executor()` 返回前进程退出，`updateTask()` 来不及执行，任务状态卡在 `running`
- 下次 `resumePendingTasks()` 虽然会将 `running` → `pending` 并重试，但：
  - 已完成的外部任务会被重复请求（幂等性依赖外部 API）
  - `retryCount` 被错误递增

**改进**:

- `dispose()` 中应遍历所有 running/pending 任务，将其状态写为 `pending` 并 flush storage，确保干净恢复。
- `TaskManager` 应向 executor 提供 `AbortSignal` 或等价取消句柄。取消/关闭时先触发 abort，再 snapshot 状态，避免 HTTP 请求、轮询 sleep 或本地收尾继续悬空到进程退出。
- executor 必须在关键 await 前后检查取消信号。对于已进入 `external-wait` 的任务，abort 应停止本地轮询；是否调用 provider cancel API 由 `interruptPolicy` 决定。

### P1: VSCode 端未持久化 `ITaskRecoveryStorage`

**文件**: `packages/neko-agent/packages/extension/src/bootstrap/serviceBootstrap.ts:68-79`

当前 bootstrap 只为 `ITaskStorage` 注入 `StateTaskStorage`，未为 `ITaskRecoveryStorage` 注入文件或 globalState 持久化实现。`TaskManager` 因此使用默认的 `MemoryTaskRecoveryStorage`。程序重启后：

- `neko.agent.tasks` 中的 pending/running 任务仍能恢复
- `externalTaskId` / providerId 映射可能丢失
- 对已提交外部 provider 的任务，系统可能只能重新执行 executor，而不是接着轮询同一个外部任务

这会带来真实成本风险：外部视频、音乐或高价图片任务已经提交成功后，重启导致重复提交，浪费额度并可能生成重复资产。因此该问题优先级高于普通 UI 同步问题。

**改进**: 在 VSCode extension 层提供持久化 recovery storage。可选实现：

- `context.globalState` 存储 `TaskRecoveryInfo[]`
- workspace `.neko/agent-task-recovery.json`，但必须遵守路径系统和多 workspace 边界

优先建议使用 `globalState`，与现有 `neko.agent.tasks` 生命周期一致，避免向 workspace 写入尚未声明的恢复元数据文件。

### P2: Webview 结果投递无缓冲

**文件**: `packages/neko-agent/packages/extension/src/chat/message/agentStreamProcessor.ts:113`

```typescript
postMessage: (message) => {
  void webview.postMessage(message);  // Webview 销毁后静默失败
},
```

如果任务在 Webview 销毁后完成，`postMessage` 静默丢弃。虽然任务状态持久化在 Storage，但 Webview 重建后（`resolveWebviewView`）只做 `_restoreState()` 恢复对话历史，**不主动查询已完成但未投递的任务结果**。

**影响**: 用户关闭面板 → 图片生成完成 → 重新打开面板 → 看不到生成结果（需手动刷新或等待下次轮询）。

**改进**: `resolveWebviewView` 中添加 pending 任务状态同步逻辑，或引入消息缓冲队列，在 Webview 就绪后 flush。

补充约束：

- 不应继续把任务同步逻辑堆进 `ChatViewProvider`。新增 `TaskDeliveryBridge` 或等价服务，负责：
  - 从 `TaskManager`/media service 拉取 active、recent terminal 任务；
  - 将任务投影为 Chat Webview 和 Dashboard 都能消费的 WorkItem/`DashboardTask`；
  - 管理投递 cursor 和重放。
- “最后可见时间戳”不能只存在内存中。Extension 重启后该值会丢失，仍可能漏投。应持久化 per-conversation delivery cursor 到 `globalState`。
- cursor 推荐使用单调递增 `taskDeliverySeq` 或 `(updatedAt, taskId)` 复合游标。仅用 wall-clock 时间存在时钟回拨、同毫秒多任务和重启竞态。

### P3: `waitForCompletion` busy-wait

**文件**: `packages/neko-agent/packages/agent/src/task/task-manager.ts:358-387`

```typescript
while (true) {
  // ...check status...
  await new Promise((resolve) => setTimeout(resolve, 100));  // 100ms 轮询
}
```

使用 100ms `setTimeout` 轮询，没有利用已有的 `onProgress` 回调机制。大量并发等待时有不必要的 CPU/事件循环开销。

**改进**: 改为 Promise + EventEmitter 模式，任务状态变更时直接 resolve 等待者。

### P4: AI SDK 同步任务无 recovery 覆盖

**文件**: `packages/neko-agent/packages/platform/src/media/media-task-executor.ts:85-151`

`resumeFromRecovery()` 依赖 `TaskRecoveryInfo`（externalTaskId + providerId），只有轮询类任务（视频生成等）会调用 `saveRecoveryInfo()`。AI SDK 同步生成（如 `generateImage` 直接返回 base64）不写 recovery info，崩溃后无法恢复。

**评估**: 同步任务通常几秒内完成，崩溃窗口很小。但对于通过 chat completions 生成图片（Gemini/GPT-image）的场景，可能耗时较长。

**改进**: 低优先级。可在 `executeTaskCore` 入口统一写 checkpoint，但成本收益比不高。

## 改进计划

### PR1: `dispose()` 优雅关闭与取消传播 (P0, ~1d)

```typescript
// task-manager.ts
async dispose(): Promise<void> {
  if (this.cleanupTimer) {
    clearInterval(this.cleanupTimer);
  }

  this.abortRunningExecutors('extension-deactivate');

  const snapshots: SerializableTask[] = [];
  for (const [id, task] of this.tasks) {
    if (task.status === 'running' || task.status === 'pending') {
      task.status = 'pending';
      task.updatedAt = Date.now();
      snapshots.push(task as SerializableTask);
    }
  }

  await withTimeout(
    Promise.allSettled(snapshots.map((task) => this.storage.save(task))),
    this.shutdownTimeoutMs,
  );

  this.globalPool.dispose();
  this.typePools.dispose();
}
```

注意：

- `TaskManager.dispose()` 签名从 `void` 改为 `Promise<void>`，需同步更新 `IRuntimeTaskManager` 接口。
- 不应把 `ServiceCollection.dispose()` 改成异步并依赖 VSCode `context.subscriptions` await；VSCode `Disposable.dispose()` 是同步契约。
- 正确落点是在 extension 导出的 `deactivate()` 中显式 `await taskManager.dispose()` 或 `await services.disposeAsync()`，再让 `ServiceCollection.dispose()` 保持同步兜底。
- `TaskExecutor` 契约需要扩展取消能力，例如第三参 `context: { signal: AbortSignal }`，或在 `TaskInput` 外增加 runtime-only execution context。不要把 `AbortSignal` 写入持久化 payload。
- deactivate 可用时间有限，不能串行等待大量任务逐个 save。关闭流程应：
  - 先同步触发所有 running executor 的 abort signal；
  - 对 pending/running 任务生成 snapshot；
  - 使用 `Promise.allSettled()` 并行 flush task storage 与 recovery storage；
  - 设置短超时兜底，例如 1500-3000ms；
  - 超时后记录 warn 并返回，避免阻塞 VSCode shutdown。

推荐关闭伪代码：

```typescript
export async function deactivate(): Promise<void> {
  const taskManager = getService(ITaskManager);
  await withTimeout(taskManager?.dispose() ?? Promise.resolve(), 2500);
}
```

### PR2: 持久化外部任务 recovery info (P1, ~0.5d)

在 VSCode bootstrap 中为 `TaskManager` 注入持久化 `ITaskRecoveryStorage`，存储 `TaskRecoveryInfo[]`：

```typescript
const recoveryStorage = createStateTaskRecoveryStorage({
  storageKey: 'neko.agent.taskRecovery',
  adapter: {
    load: (key) => context.globalState.get<TaskRecoveryInfo[]>(key, []),
    save: (key, infos) => context.globalState.update(key, [...infos]),
  },
});

const taskManager = new TaskManager({
  storage: taskStorage,
  recoveryStorage,
  cleanupIntervalMs: DEFAULT_TASK_CLEANUP_INTERVAL_MS,
  retentionPeriodMs: DEFAULT_TASK_RETENTION_PERIOD_MS,
});
```

如果不新增 `createStateTaskRecoveryStorage()`，也可复用现有 `FileTaskRecoveryStorage` 思路实现 globalState adapter，但共享层接口应保持 `ITaskRecoveryStorage`，避免 VSCode 类型泄漏进 `@neko/agent`。

### PR3: Webview 重建时同步未投递任务 (P2, ~1d)

在 `TaskDeliveryBridge` 中提供 Webview ready/reconnect 后的任务同步能力。`ChatViewProvider.resolveWebviewView()` 只负责把 Webview 生命周期事件转交给 bridge，不直接实现 diff、cursor 和任务投影。

PR3 必须同时抽出共享任务投影源，避免 Chat 和 Dashboard 在该 PR 之后仍然各自维护一套任务读取逻辑：

- `TaskProjectionSource` / `AgentTaskProjectionSource` 是 extension bridge 层的只读投影服务，负责把 `TaskManager` / `AgentWorkItem` 转成稳定的任务投影 DTO。
- `TaskDeliveryBridge` 消费该投影源，负责 Chat Webview 的终态重放、cursor diff 和投递确认。
- `DashboardWorkItemSource` 消费同一个投影源提供 `getSnapshot()` / `onDidChangeTask()`。PR5 只在同一投影上增加 lifecycle 字段、后台继续状态和独立 cancel action。
- 投影层只做 DTO 映射和排序过滤，不定义任务取消策略、不推进 cost phase。

需要：
- TaskManager 新增 `listRecentTerminal(since: number)` 方法
- TaskDeliveryBridge 持久化 per-conversation delivery cursor 到 `globalState`
- Webview ready 后按 cursor diff 并投递
- Dashboard source 从同一投影层获取 snapshot，避免 Chat 和 Dashboard 两套任务同步逻辑

### PR4: `waitForCompletion` 改为事件驱动 (P3, ~0.5d)

```typescript
private completionWaiters = new Map<string, Array<(task: Task) => void>>();

waitForCompletion(id: string, timeoutMs = 300000): Promise<Task> {
  const task = this.tasks.get(id);
  if (task && isTerminal(task.status)) return Promise.resolve(task);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new BaseError({...})), timeoutMs);
    const waiters = this.completionWaiters.get(id) ?? [];
    waiters.push((t) => { clearTimeout(timer); resolve(t); });
    this.completionWaiters.set(id, waiters);
  });
}

// 在 updateTask() 中触发：
if (isTerminal(updatedTask.status)) {
  this.completionWaiters.get(id)?.forEach(fn => fn(updatedTask));
  this.completionWaiters.delete(id);
}
```

### PR5: Agent 中断策略显式化 (P1, ~1d)

为后台任务投影增加生命周期策略字段或等价 metadata，并定义 cost phase 状态机：

- `ownerConversationId`
- `runMode`
- `costPhase`
- `interruptPolicy`
- `recoverPolicy`

类型位置：

- `TaskLifecycleMetadata` 及其枚举类型放在 `packages/neko-types/src/types/task.ts`。
- `DashboardTask` 可选择性投影 lifecycle 字段，但不拥有字段定义。
- `TaskRuntime` / `dashboardWorkItemSource` 只做映射，不定义新的并行枚举。

状态转换职责：

- `TaskManager.submit()` 初始化 `pending` / `idle`
- executor 开始 token 消耗时上报 `token-active`
- provider 返回 `externalTaskId` 时 executor 上报 `external-wait` 并写 `TaskRecoveryInfo`
- provider 完成后进入下载/转码/backfill 时上报 `local-finalize`
- `updateTask()` 进入 terminal 状态时清理 waiters，并将 cost phase 归零为 `idle`

并在 `AgentManager.cancel(conversationId)` 语义中明确：

- 取消当前 foreground token-active turn
- 清空该会话 pending messages 和 confirmation
- 不默认取消 `detach-and-continue` 后台任务
- 对 `cancel-with-agent` 的 foreground SubAgent / 临时工具任务执行级联取消
- Dashboard / TaskTable 保持后台任务可见并提供单独 cancel

解耦实现：

- `AgentManager.cancel(conversationId)` 发布会话中断事件，不直接 import 或调用 `TaskManager`。
- extension bridge 注册 listener，将 `{ conversationId, reason: 'user-stop' }` 传给 `TaskLifecycleCoordinator`。
- `TaskLifecycleCoordinator` 是 compose-only 编排器：通过只读 task query port 查找 matching lifecycle metadata，并只把 `interruptPolicy === 'cancel-with-agent'` 的任务转发给取消 port。
- `SubAgentRuntimeCoordinator` 暴露窄接口用于取消 foreground/background SubAgent；是否取消同样由 coordinator 根据 metadata 判断。
- 该 coordinator 属于 extension bridge 或 agent runtime 组合层，不放进 Dashboard，不放进 platform；它不定义新策略，只执行 shared metadata 已表达的策略。

### PR6: 同步任务 checkpoint (P4, 评估后决定)

在 `executeTaskCore` 入口为所有任务类型写 recovery info（lightweight checkpoint）。需评估 Storage I/O 对短任务延迟的影响。

## 决策

1. **任务在 Extension Host 进程内运行，Webview 显隐不影响执行** — 现有设计正确，不改动
2. **`dispose()` 必须优雅处理 running 任务** — PR1，P0
3. **`dispose()` 必须传播取消信号** — 只 snapshot 为 pending 不够，必须停止本地 HTTP/轮询/等待链
4. **VSCode 端必须持久化 recovery info 才能可靠恢复外部 provider 任务** — PR2，P1
5. **Webview 重建后必须同步未投递的任务结果** — PR3，P2
6. **`waitForCompletion` 改为事件驱动** — PR4，P3
7. **同步任务 checkpoint 待评估** — PR6，P4
8. **任务必须归属会话，但不默认随会话中断取消** — 会话中断只默认取消 foreground token-active 工作
9. **外部等待和本地收尾任务默认后台继续** — 已停止 token 消耗或已进入结果交付阶段，应优先保证结果可恢复
10. **cost phase 由 executor/adapter 上报** — TaskManager 保存状态，Dashboard 不推断状态
11. **生命周期策略类型必须在 `@neko/shared`** — 防止 platform 为上报 costPhase 反向依赖 agent
12. **AgentManager 不直接依赖 TaskManager** — 会话中断通过事件/回调桥接到任务生命周期协调器
13. **任务投递 cursor 必须持久化** — 避免 extension 重启后按内存时间戳漏投终态任务
14. **TaskLifecycleCoordinator 是 compose-only bridge 服务** — 只连接事件、查询和取消端口，不拥有中断业务规则
15. **PR3 就必须统一 Chat/Dashboard 的任务投影源** — 终态重放和 Dashboard snapshot 不能形成两套读取逻辑

## 落地结果

本 ADR 已通过 OpenSpec change `harden-agent-async-task-lifecycle` 落地，并归档到 `openspec/changes/archive/2026-05-13-harden-agent-async-task-lifecycle/`。最终实现保持三层架构边界：

- `@neko/shared` 承载生命周期 DTO、canonical `TaskType` 运行时校验，以及通用 async helper（`withTimeout` / `sleepWithAbort`），不引入 VSCode 或 React 依赖。
- `@neko/agent` 的 `TaskManager` 负责任务状态、取消信号、event-driven waiter、recoverable shutdown snapshot 和 storage flush。`dispose()` 为 async，内部 flush timeout 默认 2500ms；dispose 期间 `_notifyProgress()` 静默返回，避免向正在销毁的消费者投递低价值进度事件。
- `@neko/platform` 的 media executor 负责 provider cost phase 上报、`externalTaskId` recovery info 写入，以及从 recovery info 恢复轮询，避免重启后重复提交 provider 任务。
- `@neko-agent/extension` 的 `deactivate()` 显式 await `TaskManager.dispose()`，外层 timeout 为 3000ms，只作为 dispose 前置步骤或内部超时异常未返回时的安全网；`ServiceCollection.dispose()` 保持同步。
- `TaskProjectionSource` / `TaskDeliveryBridge` / `DashboardWorkItemSource` 共享同一投影源，Chat Webview 重建和 Dashboard snapshot 不再各自读取不同任务模型。
- `TaskLifecycleCoordinator` 是 extension bridge 的 compose-only 服务，只连接 Agent interruption event、task query port 和 cancellation ports，不定义 lifecycle 默认值、不推进 cost phase、不写 storage、不生成 Dashboard 投影。

同步 provider 调用如果始终没有 `externalTaskId`，仍按本 ADR 的 non-goal 处理为 snapshot/retry-only。是否增加轻量 checkpoint 需在后续基于延迟和成本风险单独评估。

## 影响范围

| 文件 | PR | 变更 |
|------|-----|------|
| `packages/neko-agent/packages/agent/src/task/task-manager.ts` | PR1, PR4 | dispose/abort 改造 + waitForCompletion 改造 |
| `packages/neko-agent/packages/agent/src/task/task-manager.ts` (tests) | PR1, PR4 | 新增 dispose/abort/waiter 测试 |
| `packages/neko-agent/packages/extension/src/index.ts` | PR1 | `deactivate()` await 异步关闭 |
| `packages/neko-agent/packages/extension/src/bootstrap/serviceBootstrap.ts` | PR2 | 注入持久化 `ITaskRecoveryStorage` |
| `packages/neko-agent/packages/agent/src/task/task-recovery-storage.ts` | PR2 | 可选新增 globalState adapter 工厂 |
| `packages/neko-agent/packages/extension/src/services/taskProjectionSource.ts` | PR3 | 提供 Chat delivery 和 Dashboard 共用的任务投影源 |
| `packages/neko-agent/packages/extension/src/chat/chatProvider.ts` | PR3 | 将 Webview ready/reconnect 生命周期事件转交给 `TaskDeliveryBridge` |
| `packages/neko-agent/packages/extension/src/services/taskDeliveryBridge.ts` | PR3 | 任务投影、终态重放、per-conversation cursor 持久化 |
| `packages/neko-agent/packages/extension/src/chat/message/agentStreamProcessor.ts` | PR3 | 保持流式投递职责；任务终态补偿交给 `TaskDeliveryBridge` |
| `packages/neko-agent/packages/extension/src/services/dashboardWorkItemSource.ts` | PR3, PR5 | PR3 改为消费共享任务投影源；PR5 展示后台继续任务和独立取消入口 |
| `packages/neko-agent/packages/extension/src/services/__tests__/taskDeliveryBridge.test.ts` | PR3 | 覆盖 Webview 重建、extension 重启、cursor diff 与 Dashboard snapshot |
| `packages/neko-agent/packages/extension/src/services/__tests__/taskProjectionSource.test.ts` | PR3 | 覆盖 Chat 和 Dashboard 使用同一投影源 |
| `packages/neko-types/src/types/task.ts` | PR5 | 定义 lifecycle metadata / costPhase / interruptPolicy |
| `packages/neko-agent/packages/agent/src/task/task-runtime.ts` | PR5 | 投影任务生命周期 metadata |
| `packages/neko-agent/packages/platform/src/media/media-task-executor.ts` | PR5 | 上报 costPhase，externalTaskId 阶段写 recovery info |
| `packages/neko-agent/packages/extension/src/ai/agentManager.ts` | PR5 | 发布会话中断事件，不直接依赖 TaskManager |
| `packages/neko-agent/packages/extension/src/services/taskLifecycleCoordinator.ts` | PR5 | compose-only bridge，连接会话中断事件、任务查询端口和取消端口 |

## 测试策略

每个 PR 至少包含对应生命周期测试，优先用 host-agnostic 单元测试覆盖核心规则，再用 extension 层测试覆盖桥接。

| PR | 必测场景 |
|----|----------|
| PR1 | 模拟 running task，调用 `dispose()` 后 abort 被触发，任务 snapshot 为 pending，storage flush 在超时内完成 |
| PR1 | 模拟 executor 忽略 abort，`dispose()` 仍能超时返回并记录 warn |
| PR2 | 写入 `TaskRecoveryInfo` 后重建 `TaskManager`，验证 recovery info 可加载并用于继续轮询同一 externalTaskId |
| PR2 | recovery storage 损坏或缺失时降级为空，不阻塞 task storage 恢复 |
| PR3 | Webview 销毁期间任务完成，重建后按持久化 cursor 重放终态结果 |
| PR3 | Extension 重启后 cursor 仍有效，不因内存时间戳丢失而漏投 |
| PR3 | Chat delivery 和 Dashboard snapshot 来自同一个 task projection source，状态与输出引用一致 |
| PR1+PR2+PR3 | 端到端回归：submit → `external-wait` → VSCode deactivate → reactivate → recovery 继续轮询同一 externalTaskId → Webview 重建 → Chat 与 Dashboard 均可见结果，且 provider 未重复提交 |
| PR4 | 多个 `waitForCompletion()` waiter 在同一任务 terminal 时一次性 resolve，无 100ms 轮询 |
| PR5 | `AgentManager.cancel()` 只发布中断事件，不直接调用 `TaskManager` |
| PR5 | `cancel-with-agent` 任务随会话中断取消，`detach-and-continue` 任务保持运行 |
| PR5 | platform executor 可上报 `costPhase` 而不 import `@neko/agent` |
| PR6 | 同步 AI SDK 任务 checkpoint 不显著增加短任务延迟，失败时不污染 recovery storage |
