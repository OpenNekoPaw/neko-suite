# 消融实验框架设计方案

## Context

neko-agent 已具备多层可配置子系统（权限、压缩、Skill、工具注入、校验、重试等），但缺乏统一的功能开关和实验基础设施。无法系统性地对比"关闭某子系统对 Agent 质量的影响"。本方案设计一个轻量消融实验框架，通过组合现有 hooks 和配置机制实现，**零侵入**现有子系统代码。

---

## 模块结构

```
packages/neko-agent/packages/agent/src/experiment/
  types.ts                  -- 类型定义（AblationToggles, ExperimentConfig, Metrics, Result）
  apply-toggles.ts          -- AblationToggles → AgentSessionConfig 映射（纯函数）
  metrics-hooks.ts          -- MetricsHooks（实现 ExecutorHooks，采集指标）
  experiment-runner.ts      -- ExperimentRunner 编排器
  presets.ts                -- 预置消融变体（baseline, no-compression, no-skills 等）
  comparison.ts             -- 对比表生成
  index.ts                  -- 公共导出
  __tests__/
    apply-toggles.test.ts
    metrics-hooks.test.ts
    experiment-runner.test.ts
```

全部放在 `@neko/agent` 内，不修改 `neko-types`。

---

## 1. 类型定义 — `types.ts`

### AblationToggles（核心开关）

```typescript
export interface AblationToggles {
  /** 上下文压缩: false=禁用, object=覆盖阈值 */
  compression?: false | { tokenThreshold?: number; turnThreshold?: number };
  /** Skill 系统: false=禁用发现和注入 */
  skillSystem?: false;
  /** 工具注入层: 'always-only'=仅核心工具, 默认 'always+dynamic' */
  toolInjection?: 'always-only' | 'always+dynamic';
  /** 权限模式覆盖 */
  permissionMode?: PermissionMode;
  /** 校验 hooks: false=全部禁用 */
  validation?: false;
  /** 重试 hooks: false=禁用, object=覆盖 maxRetries */
  retry?: false | { maxRetries?: number };
  /** Memory hooks: false=禁用压缩和会话记忆 */
  memory?: false;
  /** 思考预算覆盖（0=禁用 extended thinking） */
  thinkingBudget?: number;
  /** 最大迭代数覆盖 */
  maxIterations?: number;
}
```

### ExperimentVariant

```typescript
export interface ExperimentVariant {
  name: string;                    // 'baseline', 'no-compression' 等
  description: string;
  toggles: AblationToggles;
  repetitions?: number;            // 重复次数（统计显著性）
}
```

### ExperimentConfig

```typescript
export interface ExperimentConfig {
  name: string;
  taskPrompt: string;
  taskContext?: ExecutionContext;
  variants: ExperimentVariant[];
  baseSessionConfig: AgentSessionConfig;
  variantTimeoutMs?: number;       // 单变体超时
  outputDir?: string;              // 默认 .neko/experiments/
}
```

### Metrics 体系

```typescript
export interface TokenMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ToolCallMetric {
  name: string;
  success: boolean;
  latencyMs: number;
  retryCount: number;
  error?: string;
}

export interface TurnMetrics {
  turnIndex: number;
  tokenUsage: TokenMetrics;
  toolCalls: ToolCallMetric[];
  latencyMs: number;
}

export interface ExperimentMetrics {
  totalTokens: TokenMetrics;
  turns: TurnMetrics[];
  iterations: number;
  totalLatencyMs: number;
  toolSummary: {
    totalCalls: number;
    successCount: number;
    failureCount: number;
    byTool: Record<string, { calls: number; successes: number; failures: number }>;
  };
  custom: Record<string, unknown>;
}
```

### Result 体系

```typescript
export interface VariantRunResult {
  variantName: string;
  repetitionIndex: number;
  success: boolean;
  agentResult: AgentResult;
  metrics: ExperimentMetrics;
  toggles: AblationToggles;
  error?: string;
}

export interface VariantResult {
  variant: ExperimentVariant;
  runs: VariantRunResult[];
  averageMetrics: ExperimentMetrics;
}

export interface ExperimentResult {
  name: string;
  startedAt: string;
  completedAt: string;
  taskPrompt: string;
  variants: VariantResult[];
  comparison: ComparisonEntry[];
}

export interface ComparisonEntry {
  variantName: string;
  avgTotalTokens: number;
  avgLatencyMs: number;
  avgIterations: number;
  avgToolCalls: number;
  toolSuccessRate: number;
  successRate: number;
}
```

---

## 2. Toggle 映射 — `apply-toggles.ts`

**核心函数**: `applyAblationToggles(base, toggles) → AgentSessionConfig`

纯函数，克隆 base config 后按 toggles 逐项覆盖。**不修改** `createExecutorHooks`，而是通过两个机制实现 hook 过滤：

### 策略：包装 customHooks + 替换内置 hooks 的依赖

| Toggle | 映射方式 |
|--------|---------|
| `compression: false` | 传入 no-op `ConversationCompressor`（`shouldCompress()` 始终返回 false） |
| `compression: { thresholds }` | 覆盖 `contextSettings.maxTokens` / turn 阈值 |
| `memory: false` | 同 compression:false（MemoryHooks 依赖 compressor） |
| `validation: false` | 在 `customHooks` 前插入一个 `FilterHook`，拦截 validation hook 的效果 |
| `retry: false` | 同上，过滤 retry hook |
| `retry: { maxRetries }` | 通过 `customHooks` 插入覆盖版 RetryHooks |
| `permissionMode` | 直接映射到 `executionMode` |
| `skillSystem: false` | 不提供 `toolGroupRegistry`（阻止 Skill 注册） |
| `toolInjection: 'always-only'` | 提供空的 `toolCategoryRegistry`（dynamic 层为空） |
| `thinkingBudget` | 直接覆盖 `config.thinkingBudget` |
| `maxIterations` | 直接覆盖 `config.maxIterations` |

**关键实现**：由于 `createExecutorHooks` 硬编码了 4 个内置 hook，对于 validation/retry 的禁用，最简洁的方式是**扩展 `ExecutorHooksFactoryConfig` 增加可选的 `disableHooks?: string[]` 字段**。这是对 `executor-hooks-factory.ts` 的**唯一小改动**（3 行），符合 OCP：

```typescript
// executor-hooks-factory.ts 新增（仅 3 行改动）
export interface ExecutorHooksFactoryConfig {
  // ... existing fields ...
  /** Hook names to exclude from the chain (for ablation experiments) */
  disableHooks?: string[];
}

// createExecutorHooks 内：
const allHooks = [memoryHooks, validationHooks, permissionHooks, retryHooks];
const hooks = config.disableHooks
  ? allHooks.filter(h => !config.disableHooks!.includes(h.name!))
  : allHooks;
```

---

## 3. 指标采集 — `metrics-hooks.ts`

`MetricsHooks` 实现 `ExecutorHooks`，插入为 hooks 链的**第一个**（观察所有事件）：

```typescript
export class MetricsHooks implements ExecutorHooks {
  name = 'experiment-metrics';

  // 实现以下生命周期：
  onExecuteStart()        // 记录开始时间，初始化 metrics
  beforeThink()           // 记录 turn 开始时间（pass-through，不修改 context）
  afterThink(step)        // 从 step.usage 提取 token 用量
  beforeAct(toolCalls)    // 记录工具调用开始
  afterAct(results)       // 记录工具结果、延迟、成功/失败
  onIterationComplete()   // 累加迭代计数
  onExecuteEnd(result)    // 汇总总延迟、total tokens
  onError()               // 记录错误

  // 公共 API
  getMetrics(): ExperimentMetrics
  reset(): void
}
```

**关键**：`onToolCall` 返回 `null`（不拦截），让下游 hooks 正常执行。工具指标通过 `beforeAct/afterAct` 成对采集。

---

## 4. 实验编排 — `experiment-runner.ts`

```typescript
export class ExperimentRunner {
  constructor(config: ExperimentConfig)

  /** 流式运行，yield 进度事件 */
  async *run(): AsyncIterable<ExperimentProgressEvent>

  /** 一次性运行，返回完整结果 */
  async runAll(): Promise<ExperimentResult>
}
```

每个变体的执行流程：

```
1. applyAblationToggles(baseConfig, variant.toggles) → 新 config
2. 创建 MetricsHooks，插入 config.hooks 首位
3. new AgentSession(config)
4. session.execute(taskPrompt, taskContext) + 超时控制
5. metricsHooks.getMetrics() → 收集结果
6. session.dispose()
```

进度事件类型：

```typescript
export type ExperimentProgressEvent =
  | { type: 'variant_start'; variant: string; repetition: number }
  | { type: 'variant_complete'; variant: string; repetition: number; metrics: ExperimentMetrics }
  | { type: 'variant_error'; variant: string; repetition: number; error: string }
  | { type: 'experiment_complete'; result: ExperimentResult };
```

---

## 5. 预置变体 — `presets.ts`

```typescript
export const BASELINE: ExperimentVariant = {
  name: 'baseline', description: 'All features enabled', toggles: {}
};

export const NO_COMPRESSION: ExperimentVariant = {
  name: 'no-compression', description: 'Context compression disabled',
  toggles: { compression: false, memory: false }
};

export const NO_SKILLS: ExperimentVariant = {
  name: 'no-skills', description: 'Skill system disabled',
  toggles: { skillSystem: false }
};

export const NO_VALIDATION: ExperimentVariant = {
  name: 'no-validation', description: 'Validation hooks disabled',
  toggles: { validation: false }
};

export const NO_RETRY: ExperimentVariant = {
  name: 'no-retry', description: 'Retry hooks disabled',
  toggles: { retry: false }
};

export const MINIMAL: ExperimentVariant = {
  name: 'minimal', description: 'Only permission hooks',
  toggles: { validation: false, retry: false, memory: false, compression: false }
};

/** 标准消融套件：baseline + 逐个关闭每个子系统 */
export function createStandardAblationSuite(): ExperimentVariant[]
```

---

## 6. 对比表 — `comparison.ts`

```typescript
export function buildComparison(results: VariantResult[]): ComparisonEntry[]
export function formatComparisonMarkdown(entries: ComparisonEntry[]): string
```

输出示例：

```
| Variant        | Avg Tokens | Avg Latency | Iterations | Tool Calls | Success Rate |
|----------------|------------|-------------|------------|------------|--------------|
| baseline       | 12,450     | 8,200ms     | 3.2        | 8.5        | 95.0%        |
| no-compression | 18,900     | 7,100ms     | 4.1        | 10.2       | 94.5%        |
| no-skills      | 11,200     | 7,800ms     | 3.0        | 7.8        | 96.0%        |
```

---

## 7. 对现有代码的改动

**唯一改动**：`executor-hooks-factory.ts`（约 6 行）

```diff
 export interface ExecutorHooksFactoryConfig {
   // ... existing ...
+  /** Hook names to exclude from the chain (for ablation experiments) */
+  disableHooks?: string[];
 }

 // createExecutorHooks 函数内部:
- const hooks: ExecutorHooks[] = [
-   memoryHooks, validationHooks, permissionHooks, retryHooks,
+ const builtinHooks: ExecutorHooks[] = [
+   memoryHooks, validationHooks, permissionHooks, retryHooks,
+ ];
+ const hooks: ExecutorHooks[] = [
+   ...(config.disableHooks
+     ? builtinHooks.filter(h => !config.disableHooks!.includes(h.name!))
+     : builtinHooks),
    ...(config.customHooks ?? []),
  ];
```

**不改动**的文件：session、permission、context、skill、validation、retry — 全部通过组合集成。

---

## 8. 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    ExperimentRunner                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Variant A │  │ Variant B │  │ Variant C │  ...            │
│  │ (baseline)│  │(no-compr.)│  │(no-skills)│                 │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                │
│        │              │              │                       │
│        ▼              ▼              ▼                       │
│  ┌─────────────────────────────────────────┐                │
│  │         applyAblationToggles()          │                │
│  │  AblationToggles → AgentSessionConfig   │                │
│  └─────────────────────┬───────────────────┘                │
│                        │                                     │
│                        ▼                                     │
│  ┌─────────────────────────────────────────┐                │
│  │           AgentSession                   │                │
│  │  hooks: [MetricsHooks, ...filtered...]  │                │
│  └─────────────────────┬───────────────────┘                │
│                        │                                     │
│                        ▼                                     │
│  ┌─────────────────────────────────────────┐                │
│  │         MetricsHooks (observer)         │                │
│  │  onExecuteStart → beforeThink →         │                │
│  │  afterThink → beforeAct → afterAct →    │                │
│  │  onExecuteEnd → getMetrics()            │                │
│  └─────────────────────┬───────────────────┘                │
│                        │                                     │
│                        ▼                                     │
│  ┌─────────────────────────────────────────┐                │
│  │         ExperimentResult                 │                │
│  │  variants[] → comparison[] → markdown   │                │
│  └─────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. 实施优先级

### Phase 1 — 核心框架（可立即使用）

1. `types.ts` — 所有接口定义
2. `metrics-hooks.ts` — MetricsHooks 实现 ExecutorHooks
3. `apply-toggles.ts` — applyAblationToggles 纯函数
4. **修改** `executor-hooks-factory.ts` — 增加 `disableHooks` 字段
5. `index.ts` — 公共导出

### Phase 2 — 运行器

6. `experiment-runner.ts` — ExperimentRunner
7. `presets.ts` — 预置变体
8. `comparison.ts` — 对比表生成

### Phase 3 — 测试

9. `__tests__/apply-toggles.test.ts`
10. `__tests__/metrics-hooks.test.ts`
11. `__tests__/experiment-runner.test.ts`（mock IService）

---

## 10. 关键文件路径

| 文件 | 作用 |
|------|------|
| `packages/neko-agent/packages/agent/src/hooks/executor-hooks-factory.ts` | **唯一需修改** — 增加 disableHooks |
| `packages/neko-agent/packages/agent/src/session/types.ts` | AgentSessionConfig 定义（只读参考） |
| `packages/neko-agent/packages/agent/src/session/agent-session-initializer.ts` | initializeSession 流程（只读参考） |
| `packages/neko-types/src/types/agent.ts` | ExecutorHooks / AgentResult / ToolCallInfo 接口（只读参考） |
| `packages/neko-agent/packages/agent/src/hooks/hooks.ts` | MemoryHooks / RetryHooks 实现（只读参考） |

---

## 11. 验证方式

```bash
# 1. 构建
pnpm build

# 2. 单元测试
cd packages/neko-agent && pnpm test

# 3. 集成验证（mock service）
# experiment-runner.test.ts 中用 mock IService 运行标准消融套件
# 验证：每个变体产出独立的 ExperimentMetrics，对比表正确生成
```
