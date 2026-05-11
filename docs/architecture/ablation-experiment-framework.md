# 消融实验框架设计方案

> 状态更新（2026-05-01）：代码中的 legacy `sessionMemory` / `disableSessionMemory` / `journalAsSSOT=false` rollback toggle 已移除。Journal projection 是会话持久化 SSOT，不再作为消融变量；当前 persistence / memory 相关开关收敛为 `compactLogging`、`projectMemory`、`autoMemoryExtraction`、`memoryRecall`。
>
> **Proposed 扩展（2026-04-24）**：[adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md) 拟新增 7 个 FeedbackArbiter 相关 toggle（`feedbackArbiter` / `feedbackPolicy` / `selfEvalSignal` / `memoryConflictSignal` / `regressionEnabled` / `llmConfidenceSignal` / `stageRegistry`）并明确**消融永不作为 stage**的原则。详见文末 "§附录 A：Proposed FeedbackArbiter Toggles"。
>
> **Proposed 扩展（2026-04-25）**：[adr-capability-protocol.md](./adr-capability-protocol.md) 拟新增 5 个 Capability Protocol 相关 toggle（`twoPhaseRegistration` / `mcpAdapter` / `trustEnforcement` / `hostRequirementEnforcement` / `registryIntrospection`），让协议地基的每个决策都可消融验证。详见文末 "§附录 B：Proposed Capability Protocol Toggles"。

## 当前实现快照（2026-04-24）

- `AblationToggles` 中 persistence / memory 相关开关已收敛为 `compactLogging`、`compression`、`creativeCompression`、`projectMemory`、`autoMemoryExtraction`、`memoryRecall`；Journal SSOT 不再可关闭。
- `MemoryHooks` 现在只负责 context compression；project-only memory 的 recall / extraction 由 `AgentSession + MemoryRecall + ProjectMemoryRouter` 驱动。
- `applyAblationToggles()` 通过 `AblationMarkerHook` 传递 `disableHooks`、`disableCompression`、Skill / ToolInjection 相关标记；`compactLogging`、`projectMemory`、`autoMemoryExtraction`、`memoryRecall` 直接写回 `AgentSessionConfig`。
- `presets.ts` 已提供 `no-compact-logging` / `no-project-memory` / `no-auto-memory-extraction` / `no-memory-recall` 变体，不再提供 `no-session-memory` 或 `no-journal-as-ssot`。

## Context

neko-agent 已具备多层可配置子系统（权限、压缩、Skill、工具注入、校验、重试等），但缺乏统一的功能开关和实验基础设施。无法系统性地对比"关闭某子系统对 Agent 质量的影响"。本方案设计一个轻量消融实验框架，通过组合现有 hooks 和配置机制实现，**近零侵入**现有子系统代码。

### 设计原则：每个功能点可独立消融

消融实验的核心要求是**单变量控制**——每次只关闭一个功能点，对比与 baseline 的差异。这要求每个开关对应一个**不可再分**的功能单元。

早期草案中发现以下耦合问题，当前实现已收口为：

| 问题 | 初版设计 | 修正后 |
|------|---------|--------|
| MemoryHooks 捆绑压缩+会话记忆 | `memory: false` 同时关闭两者 | 现已收敛为 `compactLogging` + `compression` + `projectMemory` + `autoMemoryExtraction` + `memoryRecall`；`MemoryHooks` 只负责压缩，Journal SSOT 不再可关闭 |
| 缺少创意压缩开关 | 未覆盖 `creativeCompression` | 新增独立开关 |
| Skill 系统 3 个子功能捆绑 | `skillSystem: false` 一刀切 | 拆为 `skillDiscovery` + `skillInjection` + `dynamicToolSets` |
| 缺少外部集成开关 | 未覆盖 settingsHooks/projectMemory/traitsRegistry | 现已扩展为 `settingsHooks` / `projectMemory` / `autoMemoryExtraction` / `traitsRegistry` 各自独立 |
| toolInjection 映射错误 | 空 registry 破坏 always 层 | 改为设置 dynamic 层 maxTools=0 |

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
    apply-toggles.integration.test.ts
    presets.test.ts
    # metrics-hooks / experiment-runner 测试待补
```

全部放在 `@neko/agent` 内，不修改 `neko-types`。

---

## 1. 类型定义 — `types.ts`

### AblationToggles（核心开关）

18 个独立开关，按子系统分组，每个对应一个不可再分的功能单元。以下定义以当前代码为准：

```typescript
export interface AblationToggles {
  // === 上下文管理（2 个独立维度） ===

  /** 普通上下文压缩（ConversationCompressor.compress）
   *  false=禁用, object=覆盖阈值 */
  compression?: false | { tokenThreshold?: number; turnThreshold?: number };
  /** 创意压缩（MessageClassifier + CreativeSummarizer 优先级压缩）
   *  false=禁用，回退到普通压缩 */
  creativeCompression?: false;

  // === Skill 系统（3 个独立维度） ===

  /** Skill 发现和自动匹配（SkillService.match）
   *  false=禁用自动发现，手动激活仍可用 */
  skillDiscovery?: false;
  /** Skill 提示词注入（SkillInjectionCoordinator 3-track: prompt+tools+rules）
   *  false=禁用注入，Skill 可被发现但不注入 */
  skillInjection?: false;
  /** ToolSet 动态激活（ActivateToolSet/DeactivateToolSet 元工具）
   *  false=禁用动态 ToolSet，仅 always 层工具可用 */
  dynamicToolSets?: false;

  // === 工具注入 ===

  /** 工具注入层: 'always-only'=仅核心工具, 默认 'always+dynamic' */
  toolInjection?: 'always-only' | 'always+dynamic';

  // === Hooks 链 ===

  /** 校验 hooks: false=全部禁用 */
  validation?: false;
  /** 重试 hooks: false=禁用, object=覆盖 maxRetries */
  retry?: false | { maxRetries?: number };

  // === 权限 ===

  /** 权限模式覆盖 */
  permissionMode?: PermissionMode;
  /** Traits 权限策略（creative auto mode: reversible/local → auto-allow）
   *  false=禁用，auto 模式无条件允许所有工具 */
  traitsRegistry?: false;

  // === 外部集成 ===

  /** 外部 shell hooks (PreToolUse/UserPromptSubmit from neko/settings.json)
   *  false=禁用，不执行任何外部 hook */
  settingsHooks?: false;
  /** 项目记忆后端（`.neko/memory.md` 的 recall / injection / 写入目标）
   *  false=禁用 project-only memory 路径 */
  projectMemory?: false;
  /** Compaction provenance 是否写回 Journal
   *  false=保留内存压缩，但不写 compaction event */
  compactLogging?: false;
  /** 自动项目记忆抽取（KeyFactExtractor → ProjectMemoryRouter）
   *  false=禁用写路径，保留 recall / injection */
  autoMemoryExtraction?: false;
  /** per-turn recall 注入（MemoryRecallModule）
   *  false=禁用 recall 注入，保留 project memory 文件 */
  memoryRecall?: false;

  // === LLM 参数 ===

  /** 思考预算覆盖（0=禁用 extended thinking） */
  thinkingBudget?: number;
  /** 最大迭代数覆盖 */
  maxIterations?: number;
}
```

### 功能点独立性验证矩阵

每个开关只影响一个功能单元，无交叉副作用：

| 开关 | 影响的组件 | 不影响的组件 | 可独立验证 |
|------|-----------|-------------|-----------|
| `compression: false` | ConversationCompressor.compress / MemoryHooks.beforeThink | Journal projection、project memory recall / extraction、CreativeSummarizer | ✅ |
| `creativeCompression: false` | MessageClassifier + CreativeSummarizer | 普通压缩、project memory 路径 | ✅ |
| `skillDiscovery: false` | SkillService.match() 自动匹配 | 手动激活 + 注入 + ToolSet | ✅ |
| `skillInjection: false` | SkillInjectionCoordinator 3-track 注入 | 发现 + ToolSet | ✅ |
| `dynamicToolSets: false` | ActivateToolSet/DeactivateToolSet 元工具 | 发现 + 注入 | ✅ |
| `toolInjection: 'always-only'` | ToolInjectionManager dynamic 层 | always 层不变 | ✅ |
| `validation: false` | ValidationHooks（image+output） | 其他 hooks | ✅ |
| `retry: false` | RetryHooks | 其他 hooks | ✅ |
| `permissionMode` | PermissionHooks 决策逻辑 | 其他 hooks | ✅ |
| `traitsRegistry: false` | Auto 模式 trait-based 决策 | 其他权限逻辑 | ✅ |
| `settingsHooks: false` | SettingsHookLoader shell 执行 | 内置 hooks | ✅ |
| `projectMemory: false` | Project memory backend（environment 注入 + recall / extraction 目标） | 压缩、Skill、Permission | ✅ |
| `compactLogging: false` | `AgentSession._applyCompressionResult()` 的 compaction event 写入 | 压缩本身、Working Memory 替换 | ✅ |
| `autoMemoryExtraction: false` | `AgentSession._extractProjectMemory()` / `ProjectMemoryRouter.writeFacts()` | project memory recall / injection | ✅ |
| `memoryRecall: false` | `MemoryRecall.recall()` / `MemoryRecallModule` 注入 | project memory 文件本体、自动抽取 | ✅ |
| `thinkingBudget` | LLM extended thinking | 其他所有 | ✅ |
| `maxIterations` | 执行循环上限 | 其他所有 | ✅ |

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
  outputDir?: string;              // 实验输出根目录；提供后默认启用 metadata-only 隔离
  isolation?: ExperimentIsolationMode; // 'none' | 'metadata-only' | 'workspace-root'
  evaluator?: ExperimentEvaluator; // 可选质量评估器，结果写入 metrics.custom.evaluation
  outputWriter?: ExperimentOutputWriter; // 可选输出写入器，负责 result.json / comparison.md 落盘
}

export type ExperimentIsolationMode = 'none' | 'metadata-only' | 'workspace-root';

export interface ExperimentRunDescriptor {
  experimentName: string;
  variantName: string;
  repetitionIndex: number;
  outputDir?: string;
  isolationMode: ExperimentIsolationMode;
}

export interface EvaluationResult {
  score?: number;
  passed?: boolean;
  reason?: string;
  metrics?: Record<string, number | boolean | string>;
  details?: Record<string, unknown>;
}

export interface ExperimentEvaluator {
  evaluate(result: AgentResult, descriptor: ExperimentRunDescriptor): Promise<EvaluationResult>;
}

export interface ExperimentOutputWriter {
  writeTextFile(path: string, content: string): Promise<void>;
}
```

隔离策略说明：`metadata-only` 会把 `{ experiment: { name, variant, repetition, outputDir, isolationMode } }` 注入 `taskContext.metadata`，不改变原 workspace；`workspace-root` 额外把 `taskContext.workspaceRoot` 指向该 run 的输出目录，用于强隔离 `.neko` 状态、journal、project memory 等磁盘副作用。

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

纯函数，克隆 base config 后按 toggles 逐项覆盖。

### 完整映射表

| Toggle | 映射层 | 具体机制 |
|--------|-------|---------|
| **上下文管理** | | |
| `compression: false` | MemoryHooks | 传入 `MemoryHooksOptions.disableCompression: true`（新增字段） |
| `compression: { thresholds }` | initializeSession | 覆盖 `contextSettings.maxTokens` / `turnThreshold` |
| `creativeCompression: false` | initializeSession | 设置 `config.creativeCompression = undefined`（不创建 Classifier/Summarizer） |
| **Skill 系统** | | |
| `skillDiscovery: false` | AgentSession | 不调用 `SkillService.match()`（通过 customHooks 拦截或 config flag） |
| `skillInjection: false` | AgentSession | 不创建 `SkillInjectionCoordinator`，`applySkillInjection` 为 no-op |
| `dynamicToolSets: false` | ToolInjectionManager | 不注册 `ActivateToolSet/DeactivateToolSet` 元工具 |
| **工具注入** | | |
| `toolInjection: 'always-only'` | ToolInjectionManager | 设置 dynamic 层 `maxTools: 0`（always 层正常工作） |
| **Hooks 链** | | |
| `validation: false` | ExecutorHooksFactory | `disableHooks: ['validation']` |
| `retry: false` | ExecutorHooksFactory | `disableHooks: ['retry']` |
| `retry: { maxRetries }` | ExecutorHooksFactory | 替换 RetryHooks 实例 |
| **权限** | | |
| `permissionMode` | AgentSessionConfig | 直接映射到 `config.executionMode` |
| `traitsRegistry: false` | AgentSessionConfig | 设置 `config.traitsRegistry = undefined` |
| **外部集成** | | |
| `settingsHooks: false` | AgentSessionConfig | 设置 `config.settingsHookLoader = undefined` |
| `projectMemory: false` | AgentSessionConfig | 设置 `config.projectMemoryManager = undefined`（同时关闭 recall / injection 与写入目标） |
| `compactLogging: false` | AgentSessionConfig | 设置 `config.compactLogging = false`，跳过 compaction event Journal 写入 |
| `autoMemoryExtraction: false` | AgentSessionConfig | 设置 `config.autoMemoryExtraction = false` |
| `memoryRecall: false` | AgentSessionConfig | 设置 `config.memoryRecall = false` |
| **LLM 参数** | | |
| `thinkingBudget` | AgentSessionConfig | 直接覆盖 `config.thinkingBudget` |
| `maxIterations` | AgentSessionConfig | 直接覆盖 `config.maxIterations` |

### 对现有代码的改动

当前实现中的关键接线点集中在 **3 类入口**（均为小改动，符合 OCP）：

**改动 1**：`executor-hooks-factory.ts` — 增加 `disableHooks` 过滤（约 6 行）

```typescript
export interface ExecutorHooksFactoryConfig {
  // ... existing fields ...
  /** Hook names to exclude from the chain (for ablation experiments) */
  disableHooks?: string[];
}

// createExecutorHooks 内部:
const builtinHooks = [memoryHooks, validationHooks, permissionHooks, retryHooks];
const hooks = [
  ...(config.disableHooks
    ? builtinHooks.filter(h => !config.disableHooks!.includes(h.name!))
    : builtinHooks),
  ...(config.customHooks ?? []),
];
```

**改动 2**：`hooks/hooks.ts` — MemoryHooks 只保留压缩相关开关（约 3 行）

```typescript
export interface MemoryHooksOptions {
  compressor?: IConversationCompressor;
  /** Disable compression in beforeThink (for ablation) */
  disableCompression?: boolean;
}

// MemoryHooks.beforeThink 内:
if (this.compressor && !this.disableCompression) { ... }
```

**改动 3**：`experiment/apply-toggles.ts` + session 初始化链路

- `AblationMarkerHook` 负责携带 `disableHooks` / `disableCompression` / `disableSkillDiscovery` / `disableSkillInjection` / `disableDynamicToolSets` / `toolInjectionMode`
- `compactLogging` / `projectMemory` / `autoMemoryExtraction` / `memoryRecall` 直接写回 `AgentSessionConfig`
- `agent-session-initializer.ts` / `agent-session.ts` 读取这些配置，分别作用到 hook 链、Skill 发现/注入、ToolInjection 以及 project memory / compaction / persistence 路径

**不改动**的文件：session、permission、context、skill、validation、retry 的核心逻辑。

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
  constructor(config: ExperimentConfig, sessionFactory: ISessionFactory)

  /** 流式运行，yield 进度事件 */
  async *run(): AsyncIterable<ExperimentProgressEvent>

  /** 一次性运行，返回完整结果 */
  async runAll(): Promise<ExperimentResult>
}
```

每个变体的执行流程：

```
1. applyAblationToggles(baseConfig, variant.toggles) → 新 config
2. 为 variant/repetition 生成 ExperimentRunDescriptor 与隔离 metadata
3. 创建 MetricsHooks，插入 config.hooks 首位
4. 通过 ISessionFactory 创建 session
5. session.execute(taskPrompt, isolatedTaskContext) + 超时控制
6. 可选 evaluator.evaluate(agentResult, descriptor)，写入 metrics.custom.evaluation
7. metricsHooks.getMetrics() → 收集结果
8. 若提供 outputDir + outputWriter，写入 result.json 与 comparison.md
9. finally session.dispose()，错误与超时路径也释放资源
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

### 单功能消融（标准套件，每次仅关闭一个）

```typescript
export const BASELINE: ExperimentVariant = {
  name: 'baseline', description: 'All features enabled', toggles: {}
};

// --- 上下文管理 ---
export const NO_COMPRESSION: ExperimentVariant = {
  name: 'no-compression', description: 'Context compression disabled',
  toggles: { compression: false }
};
export const NO_CREATIVE_COMPRESSION: ExperimentVariant = {
  name: 'no-creative-compression', description: 'Creative compression disabled, fallback to basic',
  toggles: { creativeCompression: false }
};

// --- Skill 系统 ---
export const NO_SKILL_DISCOVERY: ExperimentVariant = {
  name: 'no-skill-discovery', description: 'Skill auto-matching disabled',
  toggles: { skillDiscovery: false }
};
export const NO_SKILL_INJECTION: ExperimentVariant = {
  name: 'no-skill-injection', description: 'Skill prompt/tools/rules injection disabled',
  toggles: { skillInjection: false }
};
export const NO_DYNAMIC_TOOLSETS: ExperimentVariant = {
  name: 'no-dynamic-toolsets', description: 'ToolSet activation/deactivation disabled',
  toggles: { dynamicToolSets: false }
};

// --- Hooks ---
export const NO_VALIDATION: ExperimentVariant = {
  name: 'no-validation', description: 'Validation hooks disabled',
  toggles: { validation: false }
};
export const NO_RETRY: ExperimentVariant = {
  name: 'no-retry', description: 'Retry hooks disabled',
  toggles: { retry: false }
};

// --- 外部集成 ---
export const NO_SETTINGS_HOOKS: ExperimentVariant = {
  name: 'no-settings-hooks', description: 'External shell hooks disabled',
  toggles: { settingsHooks: false }
};
export const NO_PROJECT_MEMORY: ExperimentVariant = {
  name: 'no-project-memory', description: 'Project memory backend disabled',
  toggles: { projectMemory: false }
};
export const NO_COMPACT_LOGGING: ExperimentVariant = {
  name: 'no-compact-logging', description: 'Compaction event logging disabled',
  toggles: { compactLogging: false }
};
export const NO_AUTO_MEMORY_EXTRACTION: ExperimentVariant = {
  name: 'no-auto-memory-extraction', description: 'Automatic project-memory KeyFact extraction disabled',
  toggles: { autoMemoryExtraction: false }
};
export const NO_MEMORY_RECALL: ExperimentVariant = {
  name: 'no-memory-recall', description: 'Per-turn memory recall injection disabled',
  toggles: { memoryRecall: false }
};
export const NO_TRAITS: ExperimentVariant = {
  name: 'no-traits', description: 'Trait-based permission disabled',
  toggles: { traitsRegistry: false }
};

// --- LLM 参数 ---
export const NO_THINKING: ExperimentVariant = {
  name: 'no-thinking', description: 'Extended thinking disabled',
  toggles: { thinkingBudget: 0 }
};
```

### 组合消融（验证子系统整体贡献）

```typescript
export const NO_ALL_COMPRESSION: ExperimentVariant = {
  name: 'no-all-compression', description: 'All compression disabled',
  toggles: { compression: false, creativeCompression: false }
};

export const NO_ALL_SKILLS: ExperimentVariant = {
  name: 'no-all-skills', description: 'Entire skill system disabled',
  toggles: { skillDiscovery: false, skillInjection: false, dynamicToolSets: false }
};

export const NO_ALL_EXTERNAL: ExperimentVariant = {
  name: 'no-all-external', description: 'All external integrations disabled',
  toggles: {
    settingsHooks: false, projectMemory: false,
    compactLogging: false, autoMemoryExtraction: false, memoryRecall: false,
    traitsRegistry: false
  }
};

export const MINIMAL: ExperimentVariant = {
  name: 'minimal', description: 'Only permission hooks, nothing else',
  toggles: {
    compression: false, creativeCompression: false,
    skillDiscovery: false, skillInjection: false, dynamicToolSets: false,
    validation: false, retry: false,
    settingsHooks: false, projectMemory: false,
    compactLogging: false, autoMemoryExtraction: false, memoryRecall: false,
    traitsRegistry: false,
    thinkingBudget: 0,
  }
};

/** 标准消融套件：baseline + 14 个单功能关闭变体（合计 15 个变体）
 * 说明：toolInjection / permissionMode / maxIterations 属于参数覆盖型 toggle，
 * 默认不进入标准单功能关闭套件，可按实验目标单独添加。 */
export function createStandardAblationSuite(): ExperimentVariant[]

/** 组合消融套件：baseline + 按子系统整体关闭 */
export function createGroupAblationSuite(): ExperimentVariant[]

/** 参数消融套件：baseline + toolInjection / permissionMode / maxIterations 覆盖 */
export function createParameterAblationSuite(): ExperimentVariant[]
```

### CLI 入口（阶段任务）

`@neko/cli` 已提供实验命令，复用 CLI 的 provider / MCP / core tools / project memory / Skill / runtime bootstrap：

```bash
nekoagent experiment "完成一个短任务" --suite standard --repetitions 1
nekoagent experiment "完成一个短任务" --suite parameter --output-dir .neko/experiments
nekoagent experiment "完成一个短任务" --suite group --isolation workspace-root --timeout 120000
```

输出目录：CLI 默认写入 `.neko/experiments/<timestamp>-<suite>/cli-<suite>-ablation/`，显式 `--output-dir` 只替换根目录，仍保留 timestamp 子目录，避免多次实验互相覆盖。

输出文件：

- `result.json`：完整 `ExperimentResult`
- `comparison.md`：Markdown 对比表
- stdout：同样打印 Markdown report，便于 CI 日志查看

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

以下展示 **2 处代表性 diff**；完整落地点见 §9，且都保持为非侵入式扩展（新增可选字段，不改变默认行为）：

### 改动 1：`hooks/executor-hooks-factory.ts`（约 6 行）

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

### 改动 2：`hooks/hooks.ts` MemoryHooks（当前仅负责压缩）

```diff
 export interface MemoryHooksOptions {
   compressor?: IConversationCompressor;
+  /** Disable compression in beforeThink (for ablation) */
+  disableCompression?: boolean;
 }

 // MemoryHooks.beforeThink:
-  if (this.compressor) {
+  if (this.compressor && !this.disableCompression) {
```

### 不改动的文件

session、permission、context、skill、validation、retry 的核心逻辑 — 全部通过 config 组合集成。

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

## 9. 实施状态

**已完成（按当前仓库实现）** — 核心 experiment 模块、preset、apply-toggles 接线与最小测试已落地；persistence rollback 相关开关也已回补；文档中的 `sessionMemory` 相关描述以下方“历史草案”语境理解。

### 已修改文件

| 文件 | 改动 |
|------|------|
| `packages/neko-agent/packages/agent/src/hooks/hooks.ts` | MemoryHooks 增加 `disableCompression`，不再承载 session-memory 开关 |
| `packages/neko-agent/packages/agent/src/hooks/executor-hooks-factory.ts` | 增加 `disableHooks?: string[]` 按名称过滤 built-in hooks |
| `packages/neko-agent/packages/agent/src/hooks/__tests__/executor-hooks-factory.test.ts` | 修正 hook 数量期望 + 新增 disableHooks 测试 |
| `packages/neko-agent/packages/agent/src/experiment/apply-toggles.ts` | `AblationMarkerHook` + `autoMemoryExtraction` / Skill / ToolInjection 映射 |
| `packages/neko-agent/packages/agent/src/experiment/experiment-runner.ts` | 支持 per-run 隔离 metadata / workspace-root 模式、evaluator 注入、错误与超时路径 dispose |
| `packages/neko-agent/packages/agent/src/experiment/types.ts` | 扩展 `ExperimentIsolationMode` / `ExperimentRunDescriptor` / `ExperimentEvaluator` 契约 |
| `packages/neko-agent/packages/agent/src/experiment/presets.ts` | 新增参数消融套件 `createParameterAblationSuite()` |
| `packages/neko-agent/packages/cli-tui/src/core/experiment.ts` | CLI 实验 runner，复用 CLI bootstrap 并写出 JSON/Markdown 报告 |
| `packages/neko-agent/packages/cli-tui/src/cli.tsx` | 新增 `nekoagent experiment <prompt>` 命令 |
| `packages/neko-agent/packages/agent/src/experiment/__tests__/metrics-hooks.test.ts` | 覆盖 token/tool/latency/iteration/reset 指标采集 |
| `packages/neko-agent/packages/agent/src/experiment/__tests__/experiment-runner.test.ts` | 覆盖 runner 成功、隔离、evaluator、异常、超时与 dispose |
| `packages/neko-agent/packages/agent/src/session/file-conversation-storage.ts` | Journal projection + conversations-index 作为会话持久化 SSOT，不再提供 legacy record-first fallback |
| `packages/neko-agent/packages/agent/src/experiment/presets.ts` | 保留 `no-compact-logging` / `no-auto-memory-extraction` / `no-memory-recall`，移除 legacy `no-session-memory` 与 `no-journal-as-ssot` |
| `packages/neko-agent/packages/agent/src/experiment/index.ts` | 对外导出当前 persistence presets，避免 public API 与 preset 实现脱节 |
| `packages/neko-agent/packages/agent/src/session/agent-session-initializer.ts` | 读取 ablation marker，接线 Skill discovery / ToolInjection flags |
| `packages/neko-agent/packages/agent/src/session/agent-session.ts` | project-only memory recall / extraction / compaction logging honor ablation config |

### 新增文件

```
packages/neko-agent/packages/agent/src/experiment/
  types.ts              — 18 个 AblationToggles + Metrics/Result/ProgressEvent 类型
  apply-toggles.ts      — applyAblationToggles() 纯函数 + AblationMarkerHook
  metrics-hooks.ts      — MetricsHooks（ExecutorHooks 被动观察者）
  experiment-runner.ts  — ExperimentRunner（ISessionFactory 依赖注入，支持 mock / per-run 隔离 / evaluator）
  presets.ts            — 15 个单功能变体 + 4 个组合变体 + 参数变体 + 3 个套件构建器
  comparison.ts         — buildComparison() + formatComparisonMarkdown()
  index.ts              — 公共导出
```

### 待实现

- 历史草案里的 `sessionMemory` / `disableSessionMemory` 路径可在后续整理时单独迁出到归档文档，避免再与现行实现混读

---

## 10. 关键文件路径

| 文件 | 状态 |
|------|------|
| `packages/neko-agent/packages/agent/src/hooks/executor-hooks-factory.ts` | ✅ 已修改 |
| `packages/neko-agent/packages/agent/src/hooks/hooks.ts` | ✅ 已修改 |
| `packages/neko-agent/packages/agent/src/experiment/` | ✅ 新增模块 |
| `packages/neko-agent/packages/agent/src/session/types.ts` | 只读参考 |
| `packages/neko-agent/packages/agent/src/session/agent-session-initializer.ts` | 只读参考 |
| `packages/neko-types/src/types/agent.ts` | 只读参考 |

---

## 11. 验证方式

```bash
# 1. hooks factory（已通过）
pnpm exec vitest run packages/agent/src/hooks/__tests__/executor-hooks-factory.test.ts

# 2. apply-toggles 集成测试（已通过）
pnpm exec vitest run packages/agent/src/experiment/__tests__/apply-toggles.integration.test.ts

# 3. presets 测试（已通过）
pnpm exec vitest run packages/agent/src/experiment/__tests__/presets.test.ts

# 4. experiment SDK + CLI runner 相关测试（已通过）
pnpm exec vitest run \
  packages/agent/src/experiment/__tests__/metrics-hooks.test.ts \
  packages/agent/src/experiment/__tests__/experiment-runner.test.ts \
  packages/agent/src/experiment/__tests__/apply-toggles.integration.test.ts \
  packages/agent/src/experiment/__tests__/presets.test.ts \
  packages/agent/src/experiment/__tests__/index.test.ts \
  packages/cli-tui/src/__tests__/experiment.test.ts

# 5. CLI experiment 命令 smoke test（已通过）
pnpm --filter @neko/cli exec tsx src/cli.tsx experiment --help

# 6. 新增相关文件 TypeScript 筛查（已通过：无输出）
pnpm exec tsc -p packages/cli-tui/tsconfig.json --noEmit 2>&1 | \
  rg "packages/cli-tui/src/(core/experiment|cli|__tests__/experiment)|packages/agent/src/(experiment|mcp/mcp-tool|index)"
```

---

## 附录 A：Proposed FeedbackArbiter Toggles（2026-04-24）

本附录对齐 [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md) Proposed 内容。ADR 落地后，本附录内容上抬为正式 §1 AblationToggles 小节。

### A.1 原则声明

**消融永不作为 stage。** 消融是横切切面（观察 / 关组件 / 采指标），不占用 IDC stage 位置，也不拥有 artifact kind 或 persona 绑定。新 stage 的扩展走 `StageRegistry.register()` 显式注册路径（见 ADR §7），与消融机制完全正交。

| 反模式 | 为什么错 |
|---|---|
| 把 "ablation-check" 当成一个 stage 插入流程 | Stage 需要 persona / prompt 模块 / artifact schema 三件套，消融不具备 |
| 让 AblationToggle 直接驱动 stage DAG 跳转 | 会把"实验变量"和"流程骨架"耦合——后续难以分离对照组 |
| 用消融覆盖 StageRegistry 默认注册表 | 默认 IDC 三阶段由 runtime bootstrap 固定；消融只能**关某组件**，不能**改骨架** |

### A.2 新增 Toggle 清单

```typescript
export interface AblationToggles {
  // ... 现有 18 个字段保留 ...

  // === Proposed: FeedbackArbiter 相关（见 adr-control-plane-feedback-arbiter.md） ===

  /** 整体开关：关掉 FeedbackArbiter 仲裁，回退到碎片化 hook（validation/retry/observation 各自处理）
   *  对照组：验证"仲裁是否真正提升决策质量" */
  feedbackArbiter?: false;

  /** 策略切换：'default'（硬规则优先 + AI 自评兜底）/ 'hard-rules-only'（纯硬规则）/ 'ai-driven'（AI 自评主导）
   *  用于验证不同决策权分配下的产物质量差异 */
  feedbackPolicy?: 'default' | 'hard-rules-only' | 'ai-driven';

  /** 关闭 AI 自评信号源（SelfEvaluationHooks 不触发 FeedbackSignal）
   *  用于回答"关掉 AI 自评，只靠硬规则驱动，质量会下降多少" */
  selfEvalSignal?: false;

  /** 关闭 Memory 冲突检测信号（ProjectMemoryRouter.detectConflict 不触发）
   *  用于评估 Memory 对反馈决策的贡献 */
  memoryConflictSignal?: false;

  /** 禁用 L2 回退（FeedbackDecision 'regress-to' 降级为 'retry-stage'）
   *  用于验证"回退是否真的提升最终质量" vs 线性推进 */
  regressionEnabled?: false;

  /** 关闭 LLM 置信度信号（保留接口但不触发）
   *  影响 ai-driven policy 的判断 */
  llmConfidenceSignal?: false;

  /** StageRegistry 注册变体：'default'（仅 IDC 三阶段）/ 'with-review'（追加 review stage）
   *  扩展 stage 的实验对照——不是动态 stage，而是"带/不带 review 的对照组" */
  stageRegistry?: 'default' | 'with-review';
}
```

### A.3 预置变体（presets.ts 扩展）

```typescript
{ name: 'no-feedback-arbiter',  toggles: { feedbackArbiter: false } }
{ name: 'hard-rules-only',       toggles: { feedbackPolicy: 'hard-rules-only' } }
{ name: 'ai-driven-feedback',   toggles: { feedbackPolicy: 'ai-driven' } }
{ name: 'no-self-eval',          toggles: { selfEvalSignal: false } }
{ name: 'no-memory-conflict',    toggles: { memoryConflictSignal: false } }
{ name: 'no-regression',         toggles: { regressionEnabled: false } }
{ name: 'with-review-stage',     toggles: { stageRegistry: 'with-review' } }
```

### A.4 功能独立性验证矩阵（追加）

| 开关 | 影响的组件 | 不影响的组件 | 可独立验证 |
|------|-----------|-------------|-----------|
| `feedbackArbiter: false` | ControlPlane.FeedbackArbiter + FeedbackDecision 事件写 Journal | 各单独 hook（validation/retry/observation）原路径保留 | ✅ |
| `feedbackPolicy: 'hard-rules-only'` | FeedbackPolicy.decide() 跳过 self-eval / llm-confidence 分支 | 信号采集仍运行 | ✅ |
| `selfEvalSignal: false` | SelfEvaluationHooks 不 emit `{ kind: 'self-eval' }` | Prompt 自评引导文本仍在（只是不转信号） | ✅ |
| `memoryConflictSignal: false` | ProjectMemoryRouter 不 emit `{ kind: 'memory-conflict' }` | Memory recall / extraction 正常 | ✅ |
| `regressionEnabled: false` | Policy 把 `regress-to` 降级为 `retry-stage` | 其他决策动作不变 | ✅ |
| `llmConfidenceSignal: false` | LLM confidence 采集接口 no-op | Thinking budget / extended thinking 不受影响 | ✅ |
| `stageRegistry: 'with-review'` | ControlPlane 追加注册 review StageDescriptor | IDC 三阶段默认行为不变 | ✅ |

### A.5 落地依赖

本附录的 toggle 接线需要 ADR PR-C5（FeedbackArbiter MVP）和 PR-C6（toggle 接线）先合入。在 ADR 落地前，本附录仅作**设计占位**；对应 preset 与 test 代码位于 Proposed 状态，不进入默认 `createStandardAblationSuite()`。

---

## 附录 B：Proposed Capability Protocol Toggles（2026-04-25）

本附录对齐 [adr-capability-protocol.md](./adr-capability-protocol.md) Proposed 内容。ADR 落地后，本附录内容上抬为正式 §1 AblationToggles 小节。

### B.1 原则声明

消融协议地基的每个决策，验证"不做这个决策会怎样"。协议 5 个核心决策各有对应 toggle：两阶段模型 / MCP 适配 / 信任模型 / 宿主降级 / Registry 查询。

### B.2 新增 Toggle 清单

```typescript
export interface AblationToggles {
  // ... 既有字段（含附录 A FeedbackArbiter 系列）...

  // === Proposed: Capability Protocol（见 adr-capability-protocol.md） ===

  /** 两阶段注册：false=注册即注入（回退旧行为）
   *  用于验证"两阶段模型"对 token 成本的影响 */
  twoPhaseRegistration?: false;

  /** MCP 适配器：false=不加载 mcpServers 声明
   *  对照组：关掉 MCP 接入，仅用内部 Tool */
  mcpAdapter?: false;

  /** Trust Level 强制：false=忽略 trustLevel，全部视为 core
   *  用于评估"三级信任矩阵"的约束成本 */
  trustEnforcement?: false;

  /** 宿主要求强制：false=缺失 requirement 时仍注册（行为可能出错）
   *  对照组：跨宿主运行时不降级 vs 降级的行为差异 */
  hostRequirementEnforcement?: false;

  /** Registry 查询 API：false=禁用自省查询（Agent 无法列举自身能力）
   *  用于验证"§11.6.9 自评三件套的可见性基础"的真实贡献 */
  registryIntrospection?: false;
}
```

### B.3 预置变体（presets.ts 扩展）

```typescript
{ name: 'no-two-phase-registration',  toggles: { twoPhaseRegistration: false } }
{ name: 'no-mcp-adapter',              toggles: { mcpAdapter: false } }
{ name: 'no-trust-enforcement',        toggles: { trustEnforcement: false } }
{ name: 'no-host-requirement',         toggles: { hostRequirementEnforcement: false } }
{ name: 'no-registry-introspection',   toggles: { registryIntrospection: false } }
```

### B.4 功能独立性验证矩阵（追加）

| 开关 | 影响的组件 | 不影响的组件 | 可独立验证 |
|------|-----------|-------------|-----------|
| `twoPhaseRegistration: false` | CapabilityRegistry 与 ToolInjectionManager 耦合回退 | CapabilityContribution 声明不变 | ✅ |
| `mcpAdapter: false` | McpAdapter no-op，mcpServers 字段被忽略 | Internal Tool / Skill / ProviderCard 路径不变 | ✅ |
| `trustEnforcement: false` | 能力信任矩阵跳过，untrusted 可贡献所有能力 | 能力实际功能不变 | ✅ |
| `hostRequirementEnforcement: false` | HostRequirement 校验跳过，缺失能力仍注册 | 能力实际 invoke 可能因 API 缺失失败 | ✅ |
| `registryIntrospection: false` | `ListCapabilities` 类元工具禁用 | Registry 内部数据结构不变 | ✅ |

### B.5 落地依赖

本附录的 toggle 接线需要 adr-capability-protocol Stage 1-5 的对应 PR 先合入。在 ADR 落地前，本附录仅作**设计占位**；对应 preset 与 test 不进入默认 `createStandardAblationSuite()`。
