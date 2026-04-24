# ADR: IDC 控制面独立 + Stage Registry + FeedbackArbiter

## 状态

Proposed (2026-04-24)

## 背景

`adr-agent-runtime-bootstrap.md` 冻结了四个 runtime plane（workflow / artifact / capability / feedback）的最小契约，IDC 主链的依赖注入路径随之统一。但 IDC 三阶段骨架本身与反馈迭代流程仍是分散/硬编码的，在当前代码上已经出现三类具体症状。

### 症状 1：IDC 三阶段被固化为 union 与字面量

`IdcStage` 是 union 枚举，STAGE_REGISTRY / 阶段 DAG / mode × stage 允许矩阵 / artifact schema 全部围绕三个字面量展开：

```typescript
// agent-types/src/stage.ts
export type IdcStage = 'draft' | 'plan' | 'apply';

// skill/activation/stage-planner.ts
const allInOrder: IdcStage[] = ['draft', 'plan', 'apply'];

// skill/activation/stage-registry.ts
export const STAGE_REGISTRY: Record<IdcStage, StageMetadata> = {
  draft: { order: 10 },
  plan:  { order: 20, dependsOn: ['draft'] },
  apply: { order: 30, defaultMandatory: true },
};

// artifact-types/execution-events.ts
export type ArtifactKind = 'draft' | 'plan' | 'task';   // task ≠ apply
```

要扩展一个新 stage（如 Review / Critique / Refine），需要同步修改至少 9 个文件：`stage.ts` union、`stage-registry.ts`、`stage-planner.ts`、`stage-activation-matrix.ts`、`stage-persona-binding.ts`、`react-loop-runner.terminalStage`、`stage-dispatcher`、`execution-events.ArtifactKind`、`artifact-validator.SCHEMAS`。这是 `agent-evolution-capacity.md` 将 Orchestration 评级压在 **B+** 的主要结构性原因。

### 症状 2：反馈信号散落，没有仲裁者

反馈循环需要消费至少七类信号：

| 信号 | 当前位置 |
|---|---|
| Artifact validation fail | `ArtifactObservationHooks` |
| Tool call failure | `RetryHooks` |
| Budget 超限 (iterations/tokens/time) | `maxIterations` toggle |
| AI self-evaluation | `SelfEvaluationHooks` |
| User approval / rejection | `approval engine` |
| Memory conflict | `ProjectMemoryRouter` |
| LLM confidence | 未实现 |

这些信号当前**各自处理、不做仲裁**。结果是：反馈循环的"下一步做什么"实际上是由七个独立 hook 的副作用叠加出来的，没有一个模块能回答"当前回合结束后应该 continue / retry / regress / escalate / terminate"。跨 stage 的回退（apply 发现 plan 错了 → 退回 draft）靠 AI 自发再调 DraftWrite 实现，在 Journal 中没有对应事件，不可观察、不可消融。

### 症状 3：消融粒度止步于"组件开关"

`ablation-experiment-framework.md` 定义了 18 个 AblationToggle，但作用域全部是"某个组件启用/关闭"。反馈策略本身（硬规则优先 vs AI 自评优先 vs 用户严审）是典型的**策略层实验对象**，当前无法作为消融维度。这导致一个朴素问题无法回答：**把 AI 自评关掉，只靠硬规则驱动反馈，质量会下降多少？**

### 为什么不做"全动态 stage"

讨论过程中考虑过让 skill 自由定义 stage 字符串，被否决。原因：

1. IDC 三阶段是经验证的认知抽象（想清楚 → 算清楚 → 做对），不是工程偶然
2. 开放任意 stage 会把认知负担推给 AI 和用户——"我现在在 ablation-check stage 应该做什么"无答案
3. 真实扩展需求是有限枚举（Review / Critique / Refine），不是无穷集合
4. Prompt 模块、Persona 绑定、Golden snapshot 都需要和 stage 一一对应，无法接受任意 stage 字符串

本 ADR 采取的是 Registry 化而非动态化：结构开放，内容受约束。

## 决策

### 1. 把 IDC 三阶段从 union 升级为 StageDescriptor Registry

新增 `StageDescriptor` 接口与 `IStageRegistry`，取代 `IdcStage` union 作为运行时 SSOT：

```typescript
// @neko/agent/control/stage/types.ts
export interface StageDescriptor {
  id: string;                      // 'draft' | 'plan' | 'apply' | 'review' | ...
  order: number;
  dependsOn: string[];
  artifactKind: string;            // 绑定对应 ArtifactDescriptor.id
  defaultMandatory: boolean;
  modeWhitelist?: Record<Mode, boolean>;
  personaBinding?: (ctx: StageContext) => string | undefined;
  skipRules?: TaskShapeSkipRule[];
  promptModuleIds?: string[];      // 对应 prompt composer 中的 module id
}

export interface IStageRegistry {
  register(desc: StageDescriptor): void;
  get(id: string): StageDescriptor | undefined;
  ordered(): StageDescriptor[];                         // 拓扑排序
  activeFor(mode: Mode, shape: TaskShape): StageDescriptor[];
}
```

默认注册表由 runtime bootstrap 在 `createAgentSessionWithRuntime()` 中固定写入 draft / plan / apply 三项，不可替换、只可追加。

`IdcStage` union 保留为**类型 alias**（`type IdcStage = string` 的受约束形式），仅用于 TypeScript 层提示；运行时不再依赖 union 字面量做分支。

### 2. Artifact kind 对称化：`task` → `apply`

`ArtifactKind = 'draft' | 'plan' | 'task'` 与 `IdcStage = '...'|'apply'` 命名不对称是已有抽象泄漏。本 ADR 借 Registry 化同步修正：

```typescript
// 新
export interface ArtifactDescriptor {
  id: string;                      // 'draft' | 'plan' | 'apply'
  stageId: string;                 // 1:1 对应 StageDescriptor.id
  schema: FieldSpec[];
  markdownCodec: IArtifactMarkdownCodec;
  subdir: string;                  // '.neko/drafts' | '.neko/plans' | '.neko/apply'
}

export interface IArtifactRegistry {
  register(desc: ArtifactDescriptor): void;
  get(id: string): ArtifactDescriptor | undefined;
  byStage(stageId: string): ArtifactDescriptor | undefined;
}
```

为避免破坏现有磁盘布局，`'apply'` 对应的 subdir **保持为 `.neko/tasks/`**（只改类型层命名，不改文件系统），迁移旧产物通过 ArtifactWatcher 兼容读即可。

### 3. 抽取 ControlPlane 作为元层（第 7 控制面）

当前 `agent-unified-workflow.md §11.6` 定义的六控制面是 Prompt / Schema / Runtime / Policy / Memory / Evaluator。本 ADR 新增第 7 面 **Control**（元层），把 IDC 流程编排与反馈仲裁的职责显式化：

```
ControlPlane
├─ StageRegistry          注册/查询 stage descriptor
├─ StageController        DAG 推进、stage 转换、skip 规则执行
├─ ArtifactRegistry       注册/查询 artifact descriptor
├─ ArtifactController     观察、校验、持久化
└─ FeedbackArbiter        反馈信号仲裁（见决策 4）
```

产物面（Intent / Plan / Apply / ...）只负责自己的产物，不再做流程决策；ControlPlane 成为**唯一的流程仲裁来源**。

ControlPlane 接入 runtime bootstrap 的路径是：

```typescript
interface AgentRuntimeConfig {
  workflowRuntime: IWorkflowRuntime;
  artifactStore: IArtifactStore;
  capabilityRuntime: ICapabilityRuntime;
  feedbackLoop: IFeedbackLoop;
  controlPlane?: IControlPlane;    // 新增，optional
}
```

当宿主不提供 `controlPlane` 时，bootstrap 自动构造默认 ControlPlane（默认注册 IDC 三阶段 + 默认 FeedbackPolicy），保证向后兼容。

### 4. FeedbackArbiter：统一仲裁七类信号

FeedbackArbiter 是 ControlPlane 下的一个子模块，职责是**把七类散落信号归一化为一个 FeedbackDecision**：

```typescript
// @neko/agent/control/feedback/types.ts
export type FeedbackSignal =
  | { kind: 'validation-fail'; errors: ArtifactError[] }
  | { kind: 'tool-failure'; toolCallId: string; attempts: number; lastError: Error }
  | { kind: 'budget-exceeded'; budget: 'iterations' | 'tokens' | 'time' }
  | { kind: 'self-eval'; confidence: number; verdict: 'done' | 'needs-more' }
  | { kind: 'user-feedback'; action: 'approve' | 'reject' | 'amend'; payload?: unknown }
  | { kind: 'memory-conflict'; factId: string; evidence: unknown }
  | { kind: 'llm-confidence'; score: number };

export type FeedbackDecision =
  | { action: 'continue' }                                          // L1
  | { action: 'retry-tool'; toolCallId: string }                    // L0
  | { action: 'retry-stage'; stageId: string }                      // L1
  | { action: 'regress-to'; stageId: string; reason: string }       // L2
  | { action: 'restart-run'; reason: string }                       // L3
  | { action: 'escalate-user'; question: string }                   // L4
  | { action: 'terminate'; outcome: 'success' | 'failed' | 'cancelled' };

export interface IFeedbackArbiter {
  observe(signal: FeedbackSignal): void;
  decide(ctx: RoundContext): FeedbackDecision;
  reset(): void;
}
```

FeedbackDecision 的五级循环粒度（L0-L4）**首次被形式化**：

| Level | 动作 | 场景 |
|---|---|---|
| L0 | retry-tool | toolCall 瞬时失败，AbortController 层重试 |
| L1 | continue / retry-stage | 同 stage 内继续或重试 |
| L2 | regress-to | 回退到前一 stage（apply 发现 plan 错） |
| L3 | restart-run | 整个 IDC run 重启（换 skill / mode） |
| L4 | escalate-user | 交回用户（approval mode / 仲裁不确定） |

L2 规程事件同步写入 Journal（`feedback.regressed` 事件），可被 Memory 召回与后续分析消费。

### 5. FeedbackPolicy 可插拔，作为消融对象

Arbiter 的决策逻辑从 Policy 策略接口投射：

```typescript
export interface FeedbackPolicy {
  id: string;                                    // 'default' | 'hard-rules-only' | 'ai-driven'
  priority: FeedbackSignal['kind'][];            // 信号优先级
  thresholds: {
    retryMax: number;
    confidenceMin: number;
    regressionAllowed: boolean;
  };
  decide(signals: FeedbackSignal[], ctx: RoundContext): FeedbackDecision;
}
```

默认 Policy 的判断顺序固定为：

```
1. user-feedback     → 最优先，任意动作 override
2. budget-exceeded   → terminate(failed)
3. validation-fail × retry<3 → retry-stage
4. validation-fail × retry≥3 → regress-to(previous) | escalate-user
5. tool-failure × attempts<3 → retry-tool
6. memory-conflict   → regress-to('draft')
7. self-eval 'needs-more' × confidence>0.6 → continue
8. self-eval 'done'        × confidence>0.8 → terminate(success)
9. default → continue
```

### 6. 消融扩展：作用于 Policy，不作为 stage

消融实验**不作为 stage 插入流程**——这是明确的非目标。消融是横切切面，通过 AblationToggle 作用于 Policy 和信号源：

| 新增 Toggle | 消融意图 |
|---|---|
| `feedbackArbiter: boolean` | 关掉仲裁，回退到碎片化 hook（对照组） |
| `feedbackPolicy: 'default' \| 'hard-rules-only' \| 'ai-driven'` | 切换策略 |
| `selfEvalSignal: boolean` | 关闭自评信号 |
| `memoryConflictSignal: boolean` | 关闭 Memory 冲突检测 |
| `regressionEnabled: boolean` | 禁用 L2 回退 |
| `llmConfidenceSignal: boolean` | 关闭 LLM 置信度信号 |
| `stageRegistry: 'default' \| 'with-review'` | 切换默认注册表变体 |

这些 toggle 让 ControlPlane 本身成为可验证的演化对象。

### 7. 新 stage 的接入契约

扩展一个新 stage（如 Review）的代价从 9 文件降至 **1 处注册 + 可选 prompt 模块**：

```typescript
// 第三方 skill 或内置扩展
controlPlane.stageRegistry.register({
  id: 'review',
  order: 25,                        // 介于 plan(20) 和 apply(30) 之间
  dependsOn: ['plan'],
  artifactKind: 'review',
  defaultMandatory: false,
  modeWhitelist: { auto: false, plan: true, ask: true },
  personaBinding: (ctx) => 'reviewer-persona',
  promptModuleIds: ['stage.review'],
});

controlPlane.artifactRegistry.register({
  id: 'review',
  stageId: 'review',
  schema: REVIEW_SCHEMA,
  markdownCodec: reviewMarkdownCodec,
  subdir: '.neko/reviews',
});
```

并通过 AblationToggle `stageRegistry: 'with-review'` 决定是否默认激活。

## 明确不做的事

本 ADR 不包括：

- 不开放"任意字符串 stage"供 skill 自由定义——StageDescriptor 必须显式注册
- 不迁移旧 hook（RetryHooks / ValidationHooks / ArtifactObservationHooks）的代码；新路径并存，通过 `feedbackArbiter` toggle 切换
- 不动 Persona 绑定机制（personaBinding 仍是可选回调，不强制中心化）
- 不替换 Prompt 5-layer Composer 架构，仅通过 `promptModuleIds` 字段声明 stage → module 映射
- 不做 Embedding 向量化的信号匹配（归一化仍是结构化字段，不是语义检索）
- 不把 FeedbackDecision 做成 AI 生成（LLM-as-judge 违反 evolution §7 纪律），Policy 仍是纯函数
- 不动 `.neko/tasks/` 磁盘路径，即便类型层重命名为 `apply`（类型和文件系统解耦）

## 结果与影响

### 正面影响

1. **演化能力评级**：Orchestration **B+ → A-**，Schema 面 **A- → A**（消除 union 断点）
2. **新 stage 扩展成本**：9 文件 → 1 处注册，外部 skill 可贡献 stage
3. **反馈循环可观察**：FeedbackDecision 事件统一写 Journal，L2 回退首次形式化
4. **消融颗粒度提升**：策略层实验成为可能，回答"AI 自评贡献多少质量"等核心问题
5. **控制面独立**：agent-unified-workflow §11.6 六控制面 → 七控制面，Control 显式化
6. **命名对齐**：ArtifactKind `'task'` 与 IdcStage `'apply'` 命名统一

### 代价与约束

1. **新增 `control/` 目录与 5+ 新接口**，增加阅读成本——通过保持默认行为与旧路径一致来缓解
2. **agent-unified-workflow.md §11.6 需要同步更新**为七控制面
3. **Golden snapshot 需要对齐**：新增 stage 时必须补 prompt 模块与对应 snapshot
4. **ablation-experiment-framework.md 需要增补**新 toggle 清单并声明"消融永不作为 stage"的原则
5. **向后兼容期内双路径并存**，代码规模短期增加——通过 6 周灰度期后删除旧路径
6. **IdcStage union 软化为 `string` 受约束类型**后，TypeScript 层提示减弱，需要在注册时做运行时校验补偿

### 评级对齐

| 控制面 | 原评级 | 本 ADR 后 |
|---|---|---|
| Prompt | A | A（不变） |
| Schema | A- | A |
| Runtime | A- | A- |
| Policy | B | **B+**（FeedbackPolicy 入 Policy 面） |
| Memory | A | A |
| Evaluator | A | A |
| **Control**（新增） | — | **A-** |

## 后续演进

本 ADR 落地按 6 个 PR 推进，累计工作量约 5-6 工程日。每个 PR 都可独立合并与回滚。

| PR | 目标 | 工作量 | 依赖 |
|---|---|---|---|
| **PR-C1** | 命名对齐：ArtifactKind `'task'` → `'apply'`（类型层，保留磁盘路径） | 0.5d | — |
| **PR-C2** | StageRegistry + StageDescriptor，默认注册三阶段；stage-planner / stage-activation-matrix 读 registry | 1d | C1 |
| **PR-C3** | ArtifactRegistry + ArtifactDescriptor；artifact-validator 读 registry | 1d | C1 |
| **PR-C4** | 新建 `control/` 目录，打包 StageController / ArtifactController / ControlPlane；接入 runtime bootstrap | 1d | C2, C3 |
| **PR-C5** | FeedbackArbiter MVP + 默认 FeedbackPolicy；Journal 写入 `feedback.*` 事件 | 1.5d | C4 |
| **PR-C6** | FeedbackArbiter 消融 toggle 接线；更新 ablation-experiment-framework 与 agent-unified-workflow §11.6 | 1d | C5 |

### 回滚策略

每个 PR 都有对应的 AblationToggle 作为 kill switch：

- PR-C2 回滚：`stageRegistry: 'legacy'`（读旧 STAGE_REGISTRY 常量）
- PR-C3 回滚：`artifactRegistry: 'legacy'`
- PR-C5 回滚：`feedbackArbiter: false`（回到碎片化 hook）

### 与其他 ADR 的对齐

- **agent-unified-workflow.md §11.6**：六控制面 → 七控制面，本 ADR 合入后同步修订
- **agent-evolution-capacity.md**：Orchestration 评级 B+ → A-，三大断点中"编排骨架硬编码"解决
- **ablation-experiment-framework.md**：新增 7 个 FeedbackArbiter 相关 toggle，明确"消融不作为 stage"原则
- **workflow-orchestration-adr 家族**：对齐 FeedbackDecision 作为编排事件的首类概念
- **agent-multi-agent-federation.md**：Federation 的 Inbox polling 可作为 FeedbackSignal 的第 8 类接入（联邦消息触发反馈决策），本 ADR 预留 `FeedbackSignal` 扩展点

### 不纳入本 ADR 的后续工作

以下属于本 ADR 的延伸但不纳入当前范围：

- FeedbackPolicy DSL 化（让 Policy 也变成数据驱动而非代码）——需要稳定 MVP 后评估
- 跨 run 的 FeedbackDecision 历史聚合（哪些策略在哪些场景表现更好）——依赖 Journal 聚合能力
- FeedbackSignal 的 embedding 化（语义匹配而非结构匹配）——与 evolution §7 纪律冲突，暂不考虑
- Stage 之间的并发编排（Review 并发 Reviewer）——属于 workflow-orchestration-adr 家族

---

**核心承诺**：本 ADR 让 IDC 流程从"硬编码骨架 + 散落反馈"演进为"受约束 Registry + 统一仲裁"，在不引入动态化风险的前提下，把演化能力的主要结构性断点一次性解决。
