> ⚠️ **此 ADR 已被简化版替代**
>
> 本文档为早期设计探索。"创作流/执行流"双流术语是对称美学诱导的过度抽象，实际是"条件激活的单一流程"。
> 实际实施请参考：[agent-unified-workflow.md](./agent-unified-workflow.md)（四层架构 + SDD 3 阶段 Draft → Plan → Apply，2026-04-22 从四阶段简化）
>
> 本文档保留作为设计思考记录。

# 双流架构：创作流 + 执行流 + 审批体系（设计探索，已被替代）

**状态**: Superseded by [agent-unified-workflow.md](./agent-unified-workflow.md)
**日期**: 2026-04-20
**关联范围**: neko-agent · neko-story · neko-canvas · neko-cut · neko-puppet · neko-model
**关联文档**:

- [perception-first-roadmap.md](./perception-first-roadmap.md) - 感知能力路线图
- [agent-media-architecture.md](./agent-media-architecture.md) - GeneratedAsset 协议
- [neko-agent-media-requirements-fit.md](./neko-agent-media-requirements-fit.md) - AgentCapabilityProvider
- [creative-consistency.md](./creative-consistency.md) - Reference Chain / QualityGate

---

## 1. 背景与问题

Neko-Suite 作为创作 Agent 系统，面临一个根本性的架构决策：如何同时服务**创作者的业务语境**和**Agent 的技术语境**。

**核心问题**：

1. 创作语境（编排、方案、审批、执行）与技术语境（Plan、TODO、Approve、Apply、Step）使用不同术语，容易混淆
2. 审批需求既存在于业务层（方向决策），又存在于技术层（工具授权），不应混为一谈
3. Agent 在创作阶段和执行阶段应当表现出不同人格，但不应引入多 Agent 的复杂度
4. 技术问题应优先自治处理，不应频繁打扰用户

**本文档的角色**：作为双流架构的**权威规范**，定义术语体系、分层职责、审批分流、Agent 切换机制以及与当前实现的 GAP。

---

## 2. 核心架构

### 2.1 双流定位

```
创作流（编排层 / Creation Flow / Orchestration）
  - 职责：业务语义、用户交互、创作决策、审美判断
  - 服务对象：创作者（用户）
  - 体现 Agent 的行业专家能力（懂摄影、懂文案、懂视听语言）
  - 外环：用户可见的状态管理

执行流（操作层 / Execution Flow / Operation）
  - 职责：数据结构、工具调用、资源管理、状态机
  - 服务对象：系统（Agent 自身）
  - 体现 Agent 的工具操作能力（懂 API、懂代码、懂文件）
  - 内环：Agent 实际运转的过程管理
```

### 2.2 双流不是等价概念

**关键澄清**：两流是**概念层级对应**，不是同义词翻译。

- 业务概念**使用**技术实现作为载体
- 技术实现**服务**业务概念作为目的
- 每个业务概念对应**一组**技术组件（降维落地），不是一对一替换

---

## 3. 术语体系（权威）

**关键原则**：创作流与执行流是**内外环关系**。创作流（外环，编排层）是业务过程；执行流（内环，操作层）是技术过程。**执行流被创作流的 Review 触发**——只有创作流业务审批通过，执行流才开始规划；执行流不是创作流的翻译，而是创作流 Execution 阶段**内部**的落地机制。

### 3.1 内外环拓扑

```
┌─────────────────────────────────────────────────────────────────────┐
│  创作流（外环 / 编排层 / 用户视角）                                 │
│                                                                     │
│   Orchestration ──► Proposal ──► Review ─┐                          │
│                                          │ (业务审批通过)           │
│                                          ▼                          │
│                                   ┌──────────────────────────┐      │
│                                   │  Execution（业务阶段）   │      │
│                                   │                          │      │
│                                   │  执行流（内环 / 操作层） │      │
│                                   │   Plan ──► TODO ──►      │      │
│                                   │   Approve ──► Apply ──►  │      │
│                                   │   Step ──► (loop)        │      │
│                                   │                          │      │
│                                   └────────────┬─────────────┘      │
│                                                │ (Step 聚合)        │
│                                                ▼                    │
│                                            Status                   │
│                                                │                    │
│            ┌───────────────────────────────────┘                    │
│            ▼ (用户可从 Status 返回任一外环阶段)                     │
└─────────────────────────────────────────────────────────────────────┘
```

**核心关系**：

- **外环驱动内环**：创作流 Review 通过是执行流 Plan 启动的**前置条件**。没有业务审批，不进入技术规划。
- **内环承载外环**：创作流的 Execution 阶段在用户眼里是"业务进行中"，实际在系统内部由执行流的 Plan→Step 循环承载。
- **内外解耦演化**：外环阶段面向用户心智（可新增如"试拍"阶段）；内环原语对齐业界标准（Claude Code/Terraform/ReAct）。

### 3.2 创作流（外环）原语集合

创作流是**用户视角的业务过程**，五个原语**不是必经流水线**，而是**可编排的阶段原语**——Agent 根据任务类型、用户意图明确程度、模式（Auto/Ask）按需启用。

| 原语                      | 定位                   | 产出物                                | 主要活动                                  | 默认必经 |
| ------------------------- | ---------------------- | ------------------------------------- | ----------------------------------------- | -------- |
| **Orchestration**（编排） | 创作意图的认知组织过程 | 创作蓝图（含意图、方向、风格、参考）  | 用户与 Agent 发散讨论、比较路线、取舍取材 | 否       |
| **Proposal**（方案）      | 有叙事的可审视制品     | 方案卡（镜头表/分镜/素材清单 + 理由） | Agent 将蓝图具象化为可讨论的方案          | 否       |
| **Review**（审批）        | 业务方向的决策过程     | Review Record（含犹豫/对比/修改轨迹） | 用户评估、对比、修改、批准/驳回/分叉      | 否       |
| **Execution**（执行）     | 用户感知的业务阶段     | 业务事件流（承载执行流 Plan→Step）    | 用户追踪进度、接收里程碑、介入调整        | 是       |
| **Status**（态势反馈）    | 聚合的整体健康度视图   | 态势仪表（里程碑/健康度/叙事化进度）  | 多源数据聚合 + 叙事化，供用户决策下一步   | 是       |

**典型跳过场景**：
| 场景 | 跳过的原语 | 实际路径 |
|------|----------|---------|
| 用户直说"生成 16:9 封面" | Orchestration | Proposal → Review → Execution → Status |
| AutoMode 明确单任务 | Orchestration / Review | Proposal → Execution → Status（事后追认）|
| 对话澄清 / 改参数 | 全部（仅 Status 反馈） | 直接 Execution → Status |
| 失败后用户改方向 | Orchestration | 从 Status 回到 Proposal |

**外环特征**：

- 每原语**以用户为中心**，服务创作者心智
- 过程**非线性**（用户随时从 Status 回到任一原语；Orchestration/Proposal/Review 可选启用）
- 产出物**有语义**（含"为什么"，不只是"做什么"）
- Execution/Status **必经**（只要有技术动作发生就必然产生），其余按需
- Agent 在此环中以**共创伙伴**人格出现

### 3.3 执行流（内环）原语集合

执行流是**系统视角的技术过程**，本质是 **ReAct 循环**（`think → act → observe`）的原语化表达——每轮循环按需启用原语，不是固定流水线。

| 原语        | 定位             | 产出物                                    | 主要活动                             | 默认必经 |
| ----------- | ---------------- | ----------------------------------------- | ------------------------------------ | -------- |
| **Plan**    | 待授权的意图列表 | `.nkplan`（结构化意图条目）               | Agent 生成可机读的待办意图           | 否       |
| **TODO**    | 进度追踪清单     | TodoList（pending/in_progress/completed） | 原子指令拆解与状态推进               | 否       |
| **Approve** | 操作授权记录     | Approval Record（原子授权条目）           | 针对单条指令/资源的操作授权决定      | 否       |
| **Apply**   | commit 触发动作  | Apply Event（资源消耗边界）               | 将 TODO 正式提交到内核，触发实际调用 | 是\*     |
| **Step**    | 原子执行单元     | Step Log（think → act → observe）         | 单次 ReAct 循环的结构化日志          | 是       |

\* 纯 think 型 Step（推理、检索、计算，无副作用）不产生 Apply。

**典型跳过场景**（ReAct 编排）：
| 场景 | 启用原语 | 说明 |
|------|--------|-----|
| 单步原子任务（如读取当前场景） | Step(think+act) | 无需 Plan/TODO/Approve，直接 Step |
| 低风险只读工具（查状态/列资源）| Apply → Step | 策略包判定免审，跳过 Approve |
| 多步任务（如"生成 12 镜头"）| Plan → TODO → [Approve] → Apply → Step | 完整循环 |
| 自愈重试 | Apply → Step | 复用原 Plan，跳过 TODO/Approve |
| 纯推理（无工具调用） | Step(think-only) | 只产生 think 日志，无 Apply |
| Plan-Mode（用户要求仅规划） | Plan → (停) | 不进入 Apply |

**内环特征**：

- **启动前提**：若外环 Review 存在，需先通过；AutoMode 下可直接进入（事后向 Status 追认）
- **ReAct 循环驱动**：每轮 observe 后 Agent 决定下一轮启用哪些原语（不是固定顺序）
- **依赖顺序**（启用时）：Plan 先于 Approve，Approve 先于 Apply，Apply 产生 Step；但任一前置原语可跳过
- **Step 必经**：任何 Agent 活动最终都以 Step 形式记录（think-only 也算 Step）
- Agent 在此环中以**执行者 / 质检员**人格出现

### 3.4 ReAct 化编排与 L2 模式联动

每轮循环启用哪些原语，由 **L2 模式层**（§4.1）决定：

| L2 模式      | 外环原语启用                              | 内环原语启用                                         | 行为                                     |
| ------------ | ----------------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| **PlanMode** | Orchestration → Proposal → Review（必经） | Plan（必经）→ 停                                     | 仅规划不行动，产出方案与 Plan 待用户确认 |
| **AskMode**  | Proposal → Review（必经）                 | Plan → TODO → Approve（每步）→ Apply → Step          | 每个 Apply 前追问用户                    |
| **AutoMode** | 可跳过 Orchestration/Review               | Plan → TODO → Apply → Step（Approve 按策略包自动决） | 自主推进，Status 事后汇报                |

**设计含义**：

- 原语集合是**能力池**，不是**必经管线**
- 模式层**决定每轮启用哪些池中原语**
- 策略包（§5）决定单个原语的**通过/升级**行为
- ReAct 循环的本质——"根据 observe 决定下一步"——在每一轮原语选择中体现

### 3.4 两环审批不同（关键区分）

| 维度         | 创作流 Review（业务审批）                | 执行流 Approve（操作授权）                  |
| ------------ | ---------------------------------------- | ------------------------------------------- |
| **审批对象** | Proposal / Scheme / Workflow（业务方向） | Todo 条目 / 工具调用 / 资源消耗（技术操作） |
| **审批主体** | 用户主导（Agent 呈现方案）               | 系统主导（按策略包决策，必要时升级用户）    |
| **触发作用** | 通过后**进入执行流 Plan**                | 通过后**允许 Apply**                        |
| **粒度**     | 方向级（整个方案批/不批）                | 原子级（单条指令批/不批）                   |
| **频率**     | 一次方案一次 Review                      | 一次 Plan 可能多次 Approve                  |

**例**：用户在 Review 阶段批准一个"生成 12 镜头分镜"的 Proposal →进入执行流 Plan（列出 12 个 TODO 条目）→每个 TODO 独立 Approve（如某镜头模型调用需用户追认）→Approve 通过后 Apply →产生 Step 日志 →12 个 Step 聚合 →外环 Status 更新"12 镜头已生成"。

### 3.5 常见误解澄清

❌ **"五个原语是必经流水线"** — 错。原语是**可编排的能力池**，不是强制管线。外环 Orchestration/Proposal/Review 可跳过；内环 Plan/TODO/Approve 可跳过。本质是 ReAct 循环，每轮按需启用（详见 §3.4）。

❌ **"外环 Review 和内环 Approve 是同一个审批"** — 错。Review 是业务方向审批（粒度粗，用户主导，启用时通过后触发内环）；Approve 是技术操作授权（粒度细，系统主导，通过后允许 Apply）。详见 §5。

❌ **"Proposal 就是 Plan 的用户版"** — 错。Proposal 是**业务叙事制品**（有镜头表、有理由），属外环；Plan 是**技术意图列表**（结构化、可机读），属内环。两者可独立出现（如 AutoMode 下可能有 Plan 但无 Proposal）。

❌ **"Execution 阶段就是 Apply 动作"** — 错。Execution 是用户感知的**持续业务阶段**（数分钟到数小时），内部可能发生**多轮**内环 ReAct 循环；Apply 只是内环的**瞬时 commit 动作**（毫秒级事务边界）。

❌ **"Status 是 Step 的汇总"** — 部分对。Status 由内环 Step 聚合 **+** 外环业务叙事化构成，单纯 Step 日志不是 Status；Status 还包含里程碑识别、健康度评估等外环加工。

❌ **"执行流必须由创作流 Review 触发"** — 部分对。**AskMode 必须**；**AutoMode 下**用户明确任务后可跳过 Review 直接进入内环（Status 事后追认）；**PlanMode 下**甚至可停在 Plan 不进入 Apply。"Review 触发 Plan"是典型路径，不是唯一路径。

---

## 4. 分层架构

### 4.1 完整分层

```
L4 视角层（View Recipe）
  创作视角 / 执行视角 / 审批视角
  ← 用户心智呈现层

L3 能力层（Orchestration / Domain Capabilities）
  Workflow（创作方法论，食谱）
  Scheme（本次施工图，绑定素材+约束+成本）
  Pipeline（后处理加工链：upscale/encode/watermark）
  + 各种 Step 级 Operation（微能力）
  ← Agent 按需编排这一层

L2 模式层（Execution Mode）
  PlanMode（仅规划不行动）
  AskMode（每步确认）
  AutoMode（自主推进）
  ← Agent 根据模式决定行为密度

L1 基础层（Infrastructure / Universal Primitives）
  Plan（审批意图列表，对齐 Claude Code）
  Todo（进度追踪清单，对齐 Claude Code TodoWrite）
  Apply（commit 动作，对齐 Terraform apply）
  Step（原子执行单元，Phase 化状态机）
  + Approval 原语（横切）
  ← 系统保证，Agent 不触碰
```

### 4.2 L1 原语对齐业界

| L1 原语 | 对齐来源                              | 语义                                          | 启用条件                       |
| ------- | ------------------------------------- | --------------------------------------------- | ------------------------------ |
| Plan    | Claude Code /plan + Codex plan mode   | Agent 产出的待授权意图列表                    | 多步任务 or PlanMode 显式要求  |
| Todo    | Claude Code TodoWrite                 | 执行进度清单（pending/in_progress/completed） | Plan 存在 且 原子指令 > 1      |
| Approve | 通用授权原语                          | 单条指令/资源的授权记录                       | 策略包判定需审批               |
| Apply   | Terraform apply + Claude Code confirm | 意图→执行的触发动作，资源消耗边界             | 有副作用工具调用（非纯 think） |
| Step    | ReAct step（通用）                    | 最小原子执行单元（think→act→observe）         | **始终产生**（含 think-only）  |

**设计原则**：Step 是唯一必经原语；其余按 §3.4 的 L2 模式 + 任务特征按需启用。原语间依赖顺序在启用时有效（Plan 先于 Approve、Approve 先于 Apply），但任一前置原语可跳过。

---

## 5. 审批体系

### 5.1 双审批流

审批必然分两种，**对象和时机不同**：

| 维度           | 创作流审批                       | 执行流审批                              |
| -------------- | -------------------------------- | --------------------------------------- |
| **审批对象**   | Plan / Scheme / Workflow         | Todo / Step / Artifact / Pipeline       |
| **审批时机**   | Apply 之前（预审）               | Run 进行中（追认）                      |
| **决定空间**   | approve / reject / fork / refine | accept / reject / retry / refine / skip |
| **成本语义**   | 零成本（丢弃意图）               | 已消耗（决定是否复烧）                  |
| **UI 呈现**    | Plan Card / Matrix / Diff        | Gallery / TodoList / Gate Panel         |
| **Agent 人格** | 共创伙伴（发散、鼓励）           | 质检员（简洁、决策）                    |
| **心智模式**   | 工程师看需求文档                 | 艺术总监看样片                          |

### 5.2 单引擎 + 双策略包

审批引擎**不拆分**，策略**分双包**：

```
ApprovalEngine（L1 单引擎）
  核心机制（唯一实现）：
    - RequestBroker
    - PolicyEvaluator
    - DecisionRegistry
    - AuditLogger
    - TimeoutManager
    - RollbackCoordinator

  插拔策略包：
    - CreationStrategyPack（外环）
    - ExecutionStrategyPack（内环）
```

**设计依据**：

- **机制是共性**（请求/决定/审计/超时/回滚）→ 拆了就是重复
- **策略是特性**（决定空间/默认策略/UI/Persona）→ 策略包里表达
- **审批流会繁衍**（未来可能加 Security、Collaboration 等策略包）→ 扩展只需注册新 Pack

---

## 6. 创作/执行 Agent 切换机制

### 6.1 项目约束（务实设计）

基于实际项目条件：

1. **统一 LLM API** — 不涉及成本/性能切换
2. **Skills + Subagent** — 处理上下文和能力隔离
3. **异步任务/Subagent** — 处理耗时操作
4. **默认自治** — 自动重试/替代方案/解决问题，而非强要求用户介入

### 6.2 单 Agent + 双 Skill 模型

不采用双 Agent 架构，而是**同一主 Agent 会话 + Skill 切换人格**：

```
Agent 主会话（单一实例）
  ├─ Creation Skill（业务阶段激活）
  │   - 业务人格提示词
  │   - 创作工具白名单
  │   - 禁止执行性工具
  │
  ├─ Execution Skill（执行阶段激活）
  │   - 技术人格提示词
  │   - 执行工具白名单
  │   - 自愈策略规则
  │
  └─ Shared Memory
      用户画像、创作历史、Session 状态
```

### 6.3 Skill 切换触发

```
用户输入 → 默认 Creation Skill
  │
  │ 用户按下 Apply
  ▼
Creation Skill → Execution Skill（自动切换）
  │
  │ 所有 Step 完成
  ▼
Execution Skill → Creation Skill（自动切回，汇报）
  │
  │ 中途遇到宏修正需求
  ▼
FlowTransition 事件 → 切回 Creation Skill
```

### 6.4 Subagents 作为上下文隔离工具

Subagent **不是独立的业务 Agent**，而是**上下文隔离的临时工**：

- Recovery Subagent：错误诊断 + 决策建议
- Diagnostic Subagent：复杂失败的根因分析
- Quality Check Subagent：产出评估
- Search Subagent：资料查询（避免污染主会话）

**设计要点**：

- Subagent 在独立上下文中执行
- 结果**结构化回流**到主 Agent 上下文
- 主 Agent 保留全局视图，Subagent 处理细节

### 6.5 AsyncTask 处理耗时操作

```
主 Agent 遇到耗时操作（图像生成/视频渲染/训练）
  │
  │ 提交 AsyncTask
  ▼
继续推进其他并行 Step
  │
  │ AsyncTask 完成时回调
  ▼
主 Agent 接收结果，继续流程
```

---

## 7. 技术层自治策略（约束 4 实现）

### 7.1 五级自愈链条

技术层遇到问题**按顺序自主尝试**，不轻易打扰用户：

```
级别 1: 原样重试
  - 指数退避（1s, 2s, 4s）
  - 最多 3 次
  - 适用：network / rate_limit / timeout

级别 2: 参数降级重试
  - 更低 resolution / 更小 batch / 更宽松 quality
  - 适用：OOM / cost_limit / quality_fail

级别 3: 工具替代
  - 切换 API endpoint
  - 切换模型（在同一 API 下）
  - 切换算法
  - 适用：tool_unavailable / deprecated

级别 4: Subagent 诊断
  - 派发 Recovery Subagent 分析
  - Subagent 可能尝试新策略
  - 适用：complex / unclear

级别 5: 才向用户汇报
  - 带完整诊断（不是单纯报错）
  - 附建议方案（跳过/修改/中止）
  - 仅在 1-4 全部失败时触发
```

### 7.2 预期比例

| 问题处理级别       | 比例目标 | 用户感知   |
| ------------------ | -------- | ---------- |
| 级别 1-2（自愈）   | 70%      | 完全无感   |
| 级别 3（降级）     | 20%      | 信息性通知 |
| 级别 4（Subagent） | 5%       | 进度稍慢   |
| 级别 5（用户介入） | 5%       | 弹窗询问   |

**验收指标**：80%+ 技术错误应在级别 1-4 内解决，级别 5 频率应低于 5%。

---

## 8. 与当前实现的 GAP 分析

基于对 `/Users/zhangfeng144/Git/neko-suite` 的代码核查，盘点已有、部分、缺失能力：

### 8.1 已就位（🟢）

| 能力                            | 位置                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- |
| LitePlan 类型定义               | `packages/neko-agent/packages/platform/src/workflow/plan/types.ts`              |
| `.nkplan` 编解码                | `packages/neko-types/src/nkplan/codec.ts`                                       |
| Plan 状态机                     | `packages/neko-agent/packages/platform/src/workflow/plan/plan-state-machine.ts` |
| PlanStore                       | `packages/neko-agent/packages/platform/src/workflow/plan/plan-store.ts`         |
| Route/flowId 注册               | `packages/neko-agent/packages/platform/src/workflow/router/route-registry.ts`   |
| PromptMode（plan/default）      | `packages/neko-agent/packages/agent/src/prompt/system-prompt-builder-types.ts`  |
| PermissionMode（plan/ask/auto） | `packages/neko-agent/packages/agent/src/permission/types.ts`                    |
| QualityGate stage               | `packages/neko-agent/packages/agent/src/pipeline/stages/quality-gate.ts`        |
| Pipeline gate（auto/confirm）   | pipeline-executor 内                                                            |
| Plan 类型（agent-types）        | `packages/neko-agent/packages/agent-types/src/plan.ts`                          |

### 8.2 部分就位（🟡）

| 能力              | 现状                               | 缺口                              |
| ----------------- | ---------------------------------- | --------------------------------- |
| WorkflowRun 实体  | 仅 `PipelineRunReport`             | 无显式 Run 类型                   |
| TodoList          | 仅 CLI-TUI 组件                    | 未进入 L1 基础层                  |
| Step Phase 状态机 | 有 gate (auto/confirm)             | 无 queued/running/done 显式 Phase |
| Agent 人格        | PlanMode/Default 全局模式          | 无 Creation/Execution 流感知人格  |
| 双流连接契约      | Route → LitePlan → Pipeline 分阶段 | 缺显式"ring/flow context"         |

### 8.3 缺失（🔴）

| 能力                                   | 影响                                        |
| -------------------------------------- | ------------------------------------------- |
| Apply 显式原语                         | 成本预估/权限/审计三件事无挂载点            |
| 统一 Approval Engine                   | 权限系统 + Plan 审批 + QualityGate 三处独立 |
| Mini-Plan（执行流局部修正）            | Agent 即兴决策无归宿                        |
| creation/execution 事件分流            | 事件全泛型 `PipelineEvent`，无流属标签      |
| Creation/Execution Skill 文件          | 无人格切换物理载体                          |
| 自愈链条实现                           | 错误处理散落，无分级策略                    |
| Subagent 池（Recovery/Diagnostic/...） | 自愈级别 4 无载体                           |
| LayerBridge（创作 ↔ 执行）             | 双流间通讯无统一契约                        |
| Shared Memory Store（跨 Skill）        | Agent 切换时记忆传递不明确                  |

---

## 9. 修正后的开发路线图

### 9.1 Phase 1: Skill 化双流（3 周）

**目标**：双流通过 Skill 物理承载，Agent 按流切换人格。

**任务**：

1. 起草 `creation-flow.md` Skill（业务人格 + 创作工具 + 工作原则）
2. 起草 `execution-flow.md` Skill（技术人格 + 执行工具 + 自愈规则）
3. 实现 Skill 切换触发器
   - Apply 动作自动切到 execution-flow
   - Run 完成自动切回 creation-flow
   - FlowTransition 事件驱动切换

**验收**：Agent 在创作和执行阶段表现出不同人格，端到端跑通 flowA。

### 9.2 Phase 2: 术语与数据模型对齐（3 周）

**目标**：代码术语与映射表一致，关键实体补齐。

**任务**：

1. 代码类型命名按术语表统一
2. 事件命名：`creation.*` / `execution.*`
3. 新增数据结构
   - `WorkflowRun` 实体
   - `TodoList` / `Todo` 原语
   - `Apply` 显式原语
4. 目录重命名
   - `pipeline/` → `workflow/`（承认是外环 Workflow 执行器）
   - 预留 `runtime-media/post-process/` 为真正 Pipeline 位置
5. 类型重命名决定（LitePlan → 最终命名待定）

**验收**：代码和文档术语统一，`.nkplan` 持久化完整。

### 9.3 Phase 3: 自愈链条实现（4 周）

**目标**：五级自愈链条落地，默认不打扰用户。

**任务**：

1. 实现级别 1-3 在 execution-flow Skill 内（重试/降级/替代）
2. 实现级别 4 Subagent 派发
   - RecoverySubagent
   - DiagnosticSubagent
   - QualityCheckSubagent
3. 实现级别 5 用户汇报
   - 结构化诊断信息
   - 建议方案列表
4. AsyncTask 基础设施
   - 提交/轮询/取消
   - 进度反馈回主会话

**验收**：80%+ 技术错误在级别 1-4 内自愈，级别 5 频率 < 5%。

### 9.4 Phase 4: Approval 统一（3 周）

**目标**：单引擎 + 双策略包承接所有审批。

**任务**：

1. 建立 `ApprovalEngine` 核心
2. 注册 `CreationStrategyPack` + `ExecutionStrategyPack`
3. 迁移
   - PermissionManager 对接 execution pack
   - Plan Review 对接 creation pack
   - QualityGate 对接对应 pack
4. Apply 动作审计链

**验收**：三处审批统一接管率 ≥ 95%，Apply 审计日志完整性 100%。

### 9.5 Phase 5: 共享记忆与事件总线（3 周）

**目标**：Skill 切换不断裂，Subagent 结果回流。

**任务**：

1. Memory Store（持久化用户画像、创作历史）
2. 事件总线分频道订阅
3. ProgressNarrator（Step → 业务叙事）
4. MilestoneTracker（关键节点识别）

**验收**：Agent 切换 Skill 后仍保持上下文连贯；用户在 UI 看到"正在生成第 3 个镜头..."而非技术日志。

**总工期**：16 周（4 个月）

---

## 10. 关键设计决策总结

### 10.1 应该做的

✅ **双流概念保留** — 业务语义 vs 技术语义的区分有价值
✅ **术语映射表作为权威** — 解决所有命名冲突的源头
✅ **Skill 承载双人格** — 不引入双 Agent 复杂度
✅ **审批单引擎 + 双策略包** — 机制一致性 + 策略精准性
✅ **技术层默认自治** — 80% 问题不打扰用户
✅ **Subagent 处理上下文隔离** — AsyncTask 处理耗时操作
✅ **L1 原语对齐 Claude Code** — Plan/Todo/Apply/Step 业界已验证

### 10.2 不应该做的

❌ **独立的 Execution Agent** — 单 API 下过度设计
❌ **A2A 协议** — Skill 切换足够
❌ **双模型分层** — 统一 API 约束下无意义
❌ **频繁回退业务层** — 违反约束 4
❌ **审批引擎拆分** — 机制重复，跨流场景无家
❌ **代码按视角组织** — 视角是 UX 封装，不是代码归属

### 10.3 可能演进的

🟡 **Workflow 文件化** — 未来可做 `.workflow.json` 让社区扩展
🟡 **ViewRecipe 系统** — 三视角（创作/执行/审批）作为 UX 配方
🟡 **能力编排语法** — Agent 按需组合能力为临时管道
🟡 **多 Agent 架构** — 若未来需要不同能力画像时演进

---

## 11. 指标与验收

| 阶段    | 北极星指标                      | 阈值             |
| ------- | ------------------------------- | ---------------- |
| Phase 1 | Skill 切换延迟                  | ≤ 50ms           |
| Phase 1 | 创作/执行人格区分度（用户调研） | ≥ 4/5            |
| Phase 2 | 代码术语一致性（静态检查）      | 100%             |
| Phase 2 | 事件命名分流                    | 100%             |
| Phase 3 | 技术错误自愈率                  | ≥ 80%            |
| Phase 3 | 级别 5 用户介入频率             | ≤ 5%             |
| Phase 4 | Approval Engine 统一接管率      | ≥ 95%            |
| Phase 5 | Skill 切换后上下文保持率        | 100%（关键字段） |
| Phase 5 | 进度叙事"人话率"                | 用户调研 ≥ 4/5   |

---

## 12. 风险与缓解

| 风险                    | 概率 | 影响 | 缓解                             |
| ----------------------- | ---- | ---- | -------------------------------- |
| Skill 切换丢失上下文    | 中   | 高   | Shared Memory 强制注入关键字段   |
| 自愈过度导致隐性失败    | 中   | 中   | 每级尝试记录审计，用户可事后复盘 |
| LitePlan 重命名破坏兼容 | 中   | 高   | 类型改名但 `.nkplan` 格式不变    |
| Skill prompt 膨胀 token | 低   | 中   | Skill 分级加载（已有机制复用）   |
| 事件流改造影响订阅者    | 高   | 中   | 先加新事件保留老事件，渐进迁移   |
| Subagent 结果回流不完整 | 中   | 高   | 强制结构化 schema + 契约测试     |

---

## 13. 下一步行动

### 13.1 立即可启动（本周）

1. **起草两个 Skill 文件**
   ```
   ~/.neko/skills/creation-flow.md
   ~/.neko/skills/execution-flow.md
   ```
2. **本 ADR 落盘评审**
3. **起草自愈链条 5 级规则** → `packages/neko-agent/packages/agent/src/autoheal/policy.ts`

### 13.2 2 周内

1. 拆分 Phase 1-2 Epic
2. Skill 切换触发器原型验证
3. 术语重命名影响分析

### 13.3 4 周内

1. Phase 1 首个冲刺交付
2. 端到端跑通 flowA（带 Skill 切换）

---

## 14. 关联变更历史

| 日期       | 变更                                                           | 作者              |
| ---------- | -------------------------------------------------------------- | ----------------- |
| 2026-04-20 | 初版 Proposed，整合双流架构 + 术语体系 + Skill 切换 + GAP 分析 | Architecture Team |
| 2026-04-20 | v2 ReAct 编排化修订：原语能力池 + L2 模式激活 + §3 重写        | Architecture Team |
| 2026-04-20 | P1–P5 全部 epic 落地（20 commits）；三通道 ApprovalEngine live | Implementation    |

---

## 15. 实施进度（Implementation Status）

v2 计划（`~/.claude/plans/idempotent-splashing-puddle.md`）的 **全部 P-级 epic** 已交付并接入。

### 15.1 Epic 完成矩阵

| Epic                 | 代码状态 | 真 live 消费者                                                         |
| -------------------- | -------- | ---------------------------------------------------------------------- |
| P1 Skill 双流        | ✅       | `FlowSwitcher` + 3 persona skills（creation / execution / iteration）  |
| P1.5 激活规划器      | ✅       | 每轮 `plan(mode, flow, taskShape, lastObserveHint)` 由 runner 调用     |
| P1.6 ReAct 编排器    | ✅       | `react-loop-runner` ExecutorHooks，AgentSession 自动注入               |
| P2 W4 改名           | ✅       | `pipeline/` → `workflow/`（52 文件，含 identifiers + subpath）         |
| P2 W5 数据模型       | ✅       | `WorkflowRun` + `TodoList` + `creation-events` / `execution-events`    |
| P2 W6 原语抽象       | ✅       | `apply-primitive` + `TOOL_NAMES_{CREATION,EXECUTION}` 命名空间         |
| P3 五级自愈链        | ✅       | `AutohealChain` 接 runner `afterAct`，事件经 EventBus 发出             |
| P4 Approval 统一     | ✅       | 三通道 live（Permission / QualityGate / PlanReview）                   |
| P5 EventBus + Memory | ✅       | EventBus + SharedMemoryStore + MilestoneTracker + ProgressNarrator     |

### 15.2 关键模块位置

| 模块                       | 路径                                                                            |
| -------------------------- | ------------------------------------------------------------------------------- |
| FlowSwitcher + Binding     | `packages/neko-agent/packages/agent/src/skill/flow-*.ts`                        |
| 激活规划器 + DAG           | `packages/neko-agent/packages/agent/src/skill/activation/`                      |
| ReAct runner + 调度器      | `packages/neko-agent/packages/agent/src/executor/react-loop-runner.ts` 等       |
| AutohealChain              | `packages/neko-agent/packages/agent/src/autoheal/`                              |
| ApprovalEngine + 三适配器  | `packages/neko-agent/packages/agent/src/approval/`                              |
| EventBus                   | `packages/neko-agent/packages/agent/src/events/event-bus.ts`                    |
| SharedMemoryStore          | `packages/neko-agent/packages/agent/src/memory/shared-memory-store.ts`          |
| Narrator + Tracker         | `packages/neko-agent/packages/agent/src/narrator/`                              |
| 三 persona skills          | `packages/neko-agent/packages/agent/src/skill/builtins/{creation,execution,iteration}-flow.ts` |
| QualityGate stage 接入     | `packages/neko-agent/packages/agent/src/workflow/stages/quality-gate.ts`        |
| PlanReviewSession 接入     | `packages/neko-agent/packages/extension/src/workflow/plan-review-session.ts`    |
| Extension activation glue  | `packages/neko-agent/packages/extension/src/index.ts`（engine 单例）            |

### 15.3 测试基线

- 148 / 149 test files pass
- 2 276 / 2 281 tests pass（5 个失败是 pre-existing `fileOperationHandler.test.ts` 既有基线，与本次工作无关）
- 全量 `pnpm build` 29 / 29 green

### 15.4 设计保留项（明确未做）

| 项目                                   | 理由                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| AgentSession engine 与 extension 单例共享 | lifecycle 差异大（per-turn vs 常驻）；策略包相同 ⇒ 决策一致，先放着               |
| workflow 车道接入 FlowSwitcher         | 当前 `getFlowKind: () => 'creation'` 硬编码；Plan Review + QualityGate 永远在外环 |
| L4 RecoverySubagent 真实实现           | AutohealChain 已留注入点，等 Q3 RecoverySubagent 合并交付（R1）                   |
| Iteration Skill 的 partialRerun 工具   | Skill 就绪，但 `PipelineAction.partialRerun` 真实体属于 Q3                        |
| 感知工具 (Q2) / Puppet/Model (Q4)      | perception-first ADR 的独立 epic                                                  |

### 15.5 下一步

按 `plan v2` 关键路径，余下大块：

1. **Q3** PipelineAction + partialRerun（激活 Iteration Skill 真实使用路径，纯 TS，2–3w）
2. **Q2** 感知工具骨架（Rust `perception.rs` + 12 TS tools，3w，跨栈）
3. **Q4** Puppet/Model Operations（27 工具 + export adapters，12w）
4. **2027Q1** neko-comic + flowC + Motion（4w+）

---

## 附录 A：与 Perception-First 路线图的集成

本架构与 [perception-first-roadmap.md](./perception-first-roadmap.md) 协同：

| 季度    | Perception 路线目标 | 本架构承载方式                                                          |
| ------- | ------------------- | ----------------------------------------------------------------------- |
| Q2 2026 | Perception 工具化   | 注册为执行流 Skill 的可用工具                                           |
| Q3 2026 | 闭环反馈            | Quality Gate 接入 Approval Engine 执行流策略包；触发自愈级别 4 Subagent |
| Q4 2026 | Operation 补齐      | Puppet/Model Operation 注册为执行流能力                                 |
| 2027 Q1 | Manga/3D 动作       | 新 Workflow 加入能力层（可文件化后即插即用）                            |

---

## 附录 B：术语速查

| 创作流术语（外环） | 执行流术语（内环） | 代码位置（目标） |
| ------------------ | ------------------ | ---------------- |
| Orchestration      | Plan               | `l1/plan/`       |
| Proposal           | TODO               | `l1/todo/`       |
| Review             | Approve            | `l1/approval/`   |
| Execution          | Apply              | `l1/apply/`      |
| Status             | Step               | `l1/step/`       |

| 架构组件                  | 代码位置（目标）           |
| ------------------------- | -------------------------- |
| 创作流 Skill              | `skills/creation-flow.md`  |
| 执行流 Skill              | `skills/execution-flow.md` |
| 自愈（Autoheal）          | `autoheal/policy.ts`       |
| 上下文隔离（Subagent）    | `subagent/`                |
| 耗时操作（AsyncTask）     | `asynctask/`               |
| 双流连接（LayerBridge）   | `bridge/`                  |
| 共享记忆（Shared Memory） | `memory/`                  |
