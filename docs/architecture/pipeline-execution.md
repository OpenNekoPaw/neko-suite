# 管线执行（Pipeline Execution）

> ADR Status: Accepted（基于已有 PipelineExecutor / 6+ stages，2026-04-19 补档）
> Date: 2026-04-19
> Scope: `PipelineExecutor` 契约 + Stage 类型 + 事件协议 + gate 语义 + hook 注入
> Layer: **Pipeline**（区别于 Workflow 层 / Plan 层）

---

## 1. 背景

Workflow Orchestration 三层中 Pipeline 层**最早落地**（Phase 0 前就已存在），PlanBuilder / Router 都设计成"不改 PipelineExecutor 签名"。本 ADR 不是对未来的设计提案，而是**固化现状契约**——把代码里隐式运转的规则显式化，防止未来跑偏。

**Pipeline 层的职责**：给定 `PipelineConfig + PipelineContext + Stage[]`，按顺序跑、在 gate 停、发事件、允许取消/重试/hook 介入。

**Pipeline 层不关心**：
- 为什么跑这条 flow —— 是 Workflow 层的事
- 用哪些素材跑 —— 是 Plan 层注入 context 的事
- 生成接口长什么样 —— 是 stage 内部 `MediaGenerationService` 的事

## 2. 三种 Stage 类型

```typescript
type StageType = 'linear' | 'parallel' | 'reactive';
type GateType = 'auto' | 'confirm';

interface IPipelineStage<TCtx extends PipelineContext = PipelineContext> {
  readonly name: string;
  readonly type: StageType;
  readonly gate: GateType;          // 'confirm' → 进入前停等用户
  execute(ctx: TCtx): Promise<TCtx>;
}
```

| 类型 | 语义 | 已有实例 |
|------|------|---------|
| **linear** | 跑一次、上下文透传 | parseStoryboard / generatePrompts / arrangeOnTimeline / readDocument / importStoryboardToCanvas / renderEngine |
| **parallel** | `tasks(ctx)` 分裂任务 → `Promise.allSettled` → `merge()` 合回 | batchGenerate |
| **reactive** | `execute` → `evaluate` → 决策 `pass/retry/escalate` | qualityGate（P3+）|

**已注册 stage**（[packages/neko-agent/packages/agent/src/pipeline/stages/](packages/neko-agent/packages/agent/src/pipeline/stages/)）：
- [read-document.ts](packages/neko-agent/packages/agent/src/pipeline/stages/read-document.ts) — linear
- [parse-storyboard.ts](packages/neko-agent/packages/agent/src/pipeline/stages/parse-storyboard.ts) — linear
- [generate-prompts.ts](packages/neko-agent/packages/agent/src/pipeline/stages/generate-prompts.ts) — linear
- [import-storyboard-to-canvas.ts](packages/neko-agent/packages/agent/src/pipeline/stages/import-storyboard-to-canvas.ts) — linear
- [generate-pilot.ts](packages/neko-agent/packages/agent/src/pipeline/stages/generate-pilot.ts) — linear
- [batch-generate.ts](packages/neko-agent/packages/agent/src/pipeline/stages/batch-generate.ts) — **parallel**
- [arrange-on-timeline.ts](packages/neko-agent/packages/agent/src/pipeline/stages/arrange-on-timeline.ts) — linear
- [quality-gate.ts](packages/neko-agent/packages/agent/src/pipeline/stages/quality-gate.ts) — **reactive**（stub）
- [render-engine.ts](packages/neko-agent/packages/agent/src/pipeline/stages/render-engine.ts) — linear（Phase 5.4d）

## 3. Flow 与 skipStages

```typescript
type FlowId = 'flowA' | 'flowB' | 'flowC' | 'flowD' | 'flowE' | 'flowF';
```

Flow 是**有序 stage 数组**（[pipeline-registry.ts](packages/neko-agent/packages/agent/src/pipeline/pipeline-registry.ts)）。`PipelineConfig.skipStages` 是**运行时剪枝**——Router 根据 RouteLevel 决定跳哪几个 stage，Pipeline 层只负责 honor。

**核心不变**：flow 注册表固定；Workflow 层通过 `skipStages + stageParams` 表达差异，不 fork 新 flow。

## 4. Gate 协议

```
stage.gate === 'confirm'
    ↓ 发 gate_waiting event（携带 preview ctx）
    ↓ 执行器 awaits 用户决策
    ↓
confirmGate(modifications?) → ctx = { ...ctx, ...modifications } → 继续
cancelGate()                 → pipeline_error event → 终止
```

`userCheckpoints?: string[]` 覆盖模式：即使 stage.gate === 'auto'，Plan 层可以通过 config 强制在该 stage 前暂停——这是 Plan State Machine 的 `userCheckpoint` 落到 Pipeline 的实际执行点。

## 5. 事件流（观察语义）

```typescript
type PipelineEvent =
  | { type: 'pipeline_start'; flowId: FlowId; stages: string[] }
  | { type: 'stage_start'; stage: string; index: number; total: number }
  | { type: 'stage_complete'; stage: string }
  | { type: 'stage_skipped'; stage: string; reason: string }
  | { type: 'gate_waiting'; stage: string; preview: unknown }
  | { type: 'gate_confirmed'; stage: string }
  | { type: 'gate_cancelled'; stage: string }
  | { type: 'task_progress'; stage: string; taskId: string; progress: number; total: number }
  | { type: 'pipeline_complete'; result: PipelineContext }
  | { type: 'pipeline_error'; error: string; stage: string };
```

**消费形态**：`PipelineHandle.events` 是 `AsyncIterable<PipelineEvent>`，消费者 for-await。executor 内部是事件队列+notify channel，producer 非阻塞。

**约束**：
- `pipeline_start` / `pipeline_complete | pipeline_error` 成对出现
- `stage_start` / `stage_complete | stage_skipped` 成对出现（含 parallel stage——合并点只发一次）
- `task_progress` 只对 parallel stage 发；linear/reactive 不发任务级进度
- `gate_confirmed` 或 `gate_cancelled` 必在 `gate_waiting` 之后

## 6. Hook 注入

```typescript
interface StageHookConfig {
  stageName: string;                      // '*' = 所有 stage
  timing: 'before' | 'after';
  action: string;                          // 注册到 HookRegistry 的 action id
  params?: Record<string, unknown>;
}
```

Hook 在 `pipeline-executor.ts` 内的 `before[stage.name]` / `after[stage.name]` 点调用 `hookRegistry.run(action, ctx, params)`。用途：日志、metrics、ablation toggle、自定义 validation。

**不变契约**：hook 不能**改变 stage 执行顺序**，只能读 ctx / 写 side effect。修改 ctx 应通过 gate `modifications` 或 stageParams，不走 hook。

## 7. PipelineHandle API

```typescript
interface PipelineHandle {
  readonly id: string;
  readonly flowId: FlowId;
  confirmGate(modifications?: Partial<PipelineContext>): void;
  cancelGate(): void;
  cancel(): void;
  readonly events: AsyncIterable<PipelineEvent>;
  readonly result: Promise<PipelineContext>;
}
```

- `cancelGate()` — 仅在 gate_waiting 时有效，终止整个 pipeline
- `cancel()` — 任何时机都可调，标志位 `cancelled = true`，当前 stage 完成后退出
- `result` Promise 在 `pipeline_complete` 时 resolve；`pipeline_error` 时 reject

## 8. 与 Plan 层的翻译

Plan 层输出 `PipelineDispatch`，Pipeline 层消费：

```typescript
// Plan 层 dispatch
interface PipelineDispatch {
  flowId: FlowId;
  context: PipelineContext;        // Plan 的 bindings / referenceChain / checkpoints 预填
  config: PipelineConfig;          // skipStages / stageParams / hooks / userCheckpoints
}

// Pipeline 层只调用
executor.execute(registry.getFlow(dispatch.flowId), dispatch.config, dispatch.context);
```

**关键翻译点**：
- Plan 的 `bindings[shotId]` → context `matchingBindings`（被 batch-generate 读）
- Plan 的 `referenceChain` → context `referenceChain`（Phase 5.3）
- Plan 的 `stages[].userCheckpoint = true` → config `userCheckpoints[]`（Phase 2）
- Plan 的 `stageParams[stage.id]` → config `stageParams[stage.id]`（任意 stage override）

## 9. Parallel Stage 的 in-batch 依赖（Phase 5.4b）

batch-generate 引入 **deferred map** 让 parallel 任务间互等：

```
tasks(ctx) → 每个任务分配一个 deferred promise
           ↓
任务 A 跑完 → resolveDeferred(A, pathA)
任务 B 若依赖 A（referenceChain 里写了 'B 引用 A'）→ 等 deferred(A)
           ↓ 拿到 pathA，放入 inBatchDepPaths
           ↓ resolveReferencePaths 优先读 inBatchDepPaths
           ↓ 生成 B，把 pathA 塞进 referenceImageUrl / ipAdapterRefs
```

这是 parallel stage 唯一允许的"任务间同步"——其他场景严禁，避免变成反应式网状图。

Phase 5.4d 补充：`ctx.renderedAnchorPaths`（renderEngine 前置 stage 产出）的优先级**高于** taskIds/generatedPaths——puppet/scene anchor 先渲染、batch-generate 再把它们塞作 reference。

## 10. 重试 / 失败模式

| 失败 | 当前行为 | 未来（P3+ reactive）|
|-----|---------|-------------------|
| linear stage throw | `pipeline_error` → 终止 | — |
| parallel task throw | 记录到 `failedScenes` / `failedShots`，其他任务继续 | reactive retry 单任务 |
| parallel 全失败 | 该 stage 标失败，后续 stage 可能仍跑（看 ctx 依赖）| — |
| gate 超时 | **当前无超时**，人为 cancelGate 触发 | 可选 autoDismissAfter |
| cancel() 中途 | 当前 stage 完成后退出，不截断 parallel 任务 | 协作式取消 via AbortSignal |

**未实现但约定**：reactive stage 的 `evaluate().verdict === 'retry'` 会循环调用 execute，最多 `maxIterations` 次。目前只 qualityGate stub 有契约，无真实 evaluator。

## 11. Run Report（Phase 2）

每次执行末尾 [run-report-collector.ts](packages/neko-agent/packages/agent/src/pipeline/run-report-collector.ts) 产出：

```typescript
interface StageRecord {
  name: string;
  status: 'success' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
  skipReason?: string;
}
```

Plan Store 把 Run Report 挂回 `NkPlan.lastRunReport`，供 PlanBrowser / Plan Diff 消费。Pipeline 自身不读——单向输出。

## 12. 反对的做法

- ❌ **Fork PipelineExecutor** —— Router/Plan 的差异一律通过 skipStages + stageParams + hook 表达。
- ❌ **让 stage 直接读 Plan / Router 的决策** —— stage 只信 `PipelineContext`；Plan 的决策必须翻译成 context 字段。
- ❌ **parallel 任务间 shared mutable state** —— 除 Phase 5.4b 的 deferred map 外，任务应独立。
- ❌ **hook 改 ctx** —— hook 只读+side effect；改 ctx 走 gate modifications。
- ❌ **事件类型自由扩展** —— 10 种事件是稳定表面，扩展需 ADR 修订。
- ❌ **`PipelineHandle.events` 多消费者** —— 单 async iterator，多消费者请在外层 fan-out。

## 13. 相关 ADR

| 文档 | 关系 |
|------|-----|
| [agent-unified-workflow.md](./agent-unified-workflow.md) | IDC umbrella，Pipeline 是 Apply 阶段的执行层 |
| [plan-mode.md](./plan-mode.md) | Plan 产物翻译为 PipelineConfig |
| [plan-mode.md](./plan-mode.md) | 产出 NkPlan → PipelineDispatch |
| [cross-modal-matching.md](./cross-modal-matching.md) | MatchingEngine 的 bindings 落入 ctx.matchingBindings |
| [creative-consistency.md](./creative-consistency.md) | referenceChain 经 Plan 透传到 ctx，batch-generate 消费 |

## 14. 实现索引

| 模块 | 文件 | 说明 |
|------|------|-----|
| Executor | [pipeline-executor.ts](packages/neko-agent/packages/agent/src/pipeline/pipeline-executor.ts) | 事件队列 + gate + hook 注入 |
| Types | [types.ts](packages/neko-agent/packages/agent/src/pipeline/types.ts) | IPipelineStage / PipelineEvent / PipelineConfig 契约 |
| Registry | [pipeline-registry.ts](packages/neko-agent/packages/agent/src/pipeline/pipeline-registry.ts) | Stage 注册 + Flow 映射 |
| Resolver | [pipeline-resolver.ts](packages/neko-agent/packages/agent/src/pipeline/pipeline-resolver.ts) | Flow 解析工具 |
| Hook Registry | [hook-registry.ts](packages/neko-agent/packages/agent/src/pipeline/hook-registry.ts) | action → handler 查找表 |
| Run Report | [run-report-collector.ts](packages/neko-agent/packages/agent/src/pipeline/run-report-collector.ts) | 执行记录聚合器 |
| Stages | [stages/](packages/neko-agent/packages/agent/src/pipeline/stages/) | 6+ 内置 stage 实现 |
| Bootstrap | [pipeline-bootstrap.ts](packages/neko-agent/packages/extension/src/pipeline/pipeline-bootstrap.ts) | `startPipeline` / `startRoutedPipeline` 入口 |

## 15. 一句话总结

> **Pipeline 层是纯执行器：linear / parallel / reactive 三种 stage 类型，gate 协议固定，10 种事件稳定，Plan 层通过 `skipStages + stageParams + hooks + userCheckpoints` 表达差异。不 fork executor，不反向读 Plan，不在 hook 改 ctx——这三条守住，Pipeline 就是黑盒。**
