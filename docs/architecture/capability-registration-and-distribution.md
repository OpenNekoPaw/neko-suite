> ⚠️ **此 ADR 已被简化版替代**
>
> 本文档为早期设计探索，存在过度设计（外环 5 阶段、10 类能力、8 层防御、Plan 概念混淆等）。
> 实际实施请参考：[agent-unified-workflow.md](./agent-unified-workflow.md)（四层架构 + 二分格式原则 + IDC 3 阶段 Draft → Plan → Apply）
>
> 本文档保留作为设计思考记录。

# 能力注册与分发协议（设计探索，已被替代）

**状态**: Superseded by [agent-unified-workflow.md](./agent-unified-workflow.md)
**日期**: 2026-04-20
**关联范围**: neko-agent · neko-market · @neko/shared · 所有子包
**关联文档**:

- [dual-flow-architecture.md](./dual-flow-architecture.md) - 双流架构与 L1 原语
- [neko-agent-media-requirements-fit.md](./neko-agent-media-requirements-fit.md) - AgentCapabilityProvider 协议
- [marketplace.md](./marketplace.md) - neko-market 分发基础
- [registry-server.md](./registry-server.md) - 后端存储/分发
- [model-runtime.md](./model-runtime.md) - onPostInstall 模型部署
- [perception-first-roadmap.md](./perception-first-roadmap.md) - 能力路线图

---

## 1. 背景与问题

neko-suite 目前已走通 `AgentCapabilityProvider`（Tool 级能力注册，neko-cut 示范完成）。随着双流架构落地（[dual-flow-architecture.md](./dual-flow-architecture.md)）和 neko-market 从"素材仓库"升级为"能力分发中枢"，需要统一的能力注册与分发协议来承载：

**核心问题**：

1. 子包（neko-cut/story/...）既要贡献执行层能力（Tool/Operation），也要贡献创作层能力（ProposalArtifact/OrchestrationSkill 等），协议应同构
2. neko-market 未来承载素材/Skill/插件/Shader/模型/Workflow 六大类，其中五类（除素材）需要注册到能力中心
3. 第三方贡献者（VSCode 扩展、MCP server、market 社区包）进入系统时，必须有信任模型 + 防御机制，防止污染/崩溃/安全事故
4. 未注册子包绝不能被"误注入"到创作流/执行流
5. 避免概念混淆：**阶段**（时间坐标）、**能力**（可注册载荷）、**机制原语**（Step 内部状态）三者必须严格区分

**本文档的角色**：作为能力注册与分发的**权威规范**，统一定义四维概念模型、协议层、注册中心层、分发层的职责，以及面向第三方的信任与防御模型。

---

## 2. 四维概念模型（权威）

本协议建立在**四个互相正交**的概念维度上。混淆任一维度都会导致类型系统崩塌或用户心智分裂。

### 2.1 四维总览

```
                         两层共用的机制
                    ┌────────────────────────┐
                    │  ReAct 循环（过程骨架）│
                    │  Observe → Think → Act │
                    └──────────┬─────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
     ┌─────────────────┐             ┌─────────────────┐
     │ 外环应用：      │             │ 内环应用：      │
     │ 5 个具名阶段    │             │ 单一 Step 概念  │
     │ (用户感知锚点)  │             │ (系统感知锚点)  │
     └────────┬────────┘             └────────┬────────┘
              │ 循环的 Think/Act               │ 循环的 Think/Act
              ▼ 调用                           ▼ 调用
     ┌─────────────────┐             ┌─────────────────┐
     │ 创作能力原语    │             │ 执行能力原语    │
     │ (可注册载荷)    │             │ (可注册载荷)    │
     │                 │             │                 │
     │ OrchestrationSkill│             │ Tool            │
     │ ProposalArtifact │             │ Operation       │
     │ ReviewStrategy   │             │ PipelineStage   │
     │ StatusNarrator   │             │ ApplyPolicy     │
     │ StageViewRecipe  │             │ AutohealStrategy│
     └─────────────────┘             └─────────────────┘
                                              │
                                              │ Step 内部调用
                                              ▼
                                   ┌─────────────────────┐
                                   │ Step 内部机制原语    │
                                   │ (不注册，单实现)     │
                                   │                     │
                                   │ Plan / TODO /       │
                                   │ Approve / Apply     │
                                   └─────────────────────┘
```

### 2.2 四维定义

#### 维度 1: ReAct 创作阶段（外环过程骨架）

**本质**：用户与 Agent 的**对话式 ReAct 循环**，应用为 5 个具名阶段：

| 阶段 | ReAct 聚焦 | 概念定位 |
|-----|----------|---------|
| Orchestration | 发散 Observe + 引导 Think + 对话 Act | 创作意图的认知组织 |
| Proposal | 结构化 Think + 方案 Act | 具象化方案制品 |
| Review | 等待 Observe（用户决策）| 业务方向审批 |
| Execution | **让位给内环 ReAct 循环** | 创作流↔执行流的交接点 |
| Status | 聚合 Observe + 叙事 Act | 态势反馈 |

**特性**：概念强固定，不可注册、不可替换、不可禁用（可跳过）。用户心智锚点。

#### 维度 2: 创作能力原语（外环可注册载荷）

**本质**：ReAct 创作循环的 Think/Act 节点**调用的业务工具**，可由子包注册。

```typescript
interface ICreationCapability {
  id: string;                    // 'cut.timeline-proposal'
  domain: string;                // 'cut'
  kind: CreationCapabilityKind;  // 'skill' | 'artifact' | 'strategy' | 'narrator' | 'view'
  servesPhase: CreationPhase;    // 'proposal'（明确服务阶段）
  servesReActNode: ReActNode;    // 'act'（明确 ReAct 节点）
  ...
}

type CreationPhase = 'orchestration' | 'proposal' | 'review' | 'execution' | 'status' | ExtendedPhase;
type ReActNode = 'observe' | 'think' | 'act' | 'ui';
```

**特性**：子包动态注册，数量灵活，必须声明**服务阶段 + 服务 ReAct 节点**。

#### 维度 3: ReAct 执行阶段（内环过程骨架）

**本质**：Agent 内部的**技术 ReAct 循环**，应用为单一 Step 概念。

```
一个 Step 的内部状态机：
  queued → running → completed/failed
             │
             ├─ observe_phase  (感知工具返回 / 错误)
             ├─ think_phase    (思考下一步)
             │    ├─ (Plan?)     可选：产出规划
             │    ├─ (TODO?)     可选：更新清单
             │    └─ (Approve?)  可选：请求授权
             └─ act_phase      (Apply 发生在这里)
```

**Plan / TODO / Approve / Apply 不是独立阶段，而是 Step 内部的可选机制原语**。

**特性**：概念内置，单一 Step 原语 + 4 个可选内部机制，用户不直接感知。

#### 维度 4: 执行能力原语（内环可注册载荷）

**本质**：Step 内部的 Think/Act 节点**调用的技术工具**，可由子包注册。

```typescript
interface IExecutionCapability {
  id: string;                    // 'cut.export-mp4'
  domain: string;                // 'cut'
  kind: ExecutionCapabilityKind; // 'tool' | 'operation' | 'pipeline' | 'policy' | 'autoheal'
  servesStepNode: StepNode;      // 'act' | 'observe' | 'guard'
  ...
}

type StepNode = 'observe' | 'think' | 'act' | 'guard';
```

**特性**：子包动态注册，必须声明**服务 Step 节点**。

### 2.3 四维正交矩阵

|  | ReAct 阶段（过程骨架）| 能力原语（可注册载荷）|
|--|---|---|
| **外环（创作层）** | 5 个具名阶段（Orch/Prop/Rev/Exec/Status）| 5 类创作能力（Skill/Artifact/Strategy/Narrator/View）|
| **内环（执行层）** | Step 单一原语（+ 4 个内部机制）| 5 类执行能力（Tool/Operation/Pipeline/Policy/Autoheal）|

**关键对称性**：
- 两层都有"ReAct 循环 + 能力原语"结构
- ReAct 阶段是**概念锚点**（不注册），能力原语是**可注册载荷**
- 能力原语必须声明**所属层级 + 服务阶段/Step 节点 + 服务 ReAct 节点**

**关键非对称性**：
- 外环 ReAct 应用为 **5 个具名阶段**（用户心智需要命名锚点）
- 内环 ReAct 应用为 **单一 Step**（系统内部不需要多命名锚点）
- Plan/TODO/Approve/Apply 降级为 **Step 内部机制原语**，不作为能力注册

### 2.4 常见概念误解

❌ **"五阶段是能力"**
→ 错。五阶段是**时间坐标**，不可注册、不可替换、不可多选。能力是阶段**内部**的可注册载荷。

❌ **"Plan/TODO/Approve/Apply 是能力"**
→ 错。它们是 **Step 内部的机制原语**，单一实现，不开放注册。可注册的执行能力是 Tool/Operation/Pipeline/ApplyPolicy/AutohealStrategy。

❌ **"ProposalArtifact 服务于 Proposal 阶段（一一绑定）"**
→ 部分错。主要服务 Proposal，但 Status 阶段可引用（回看），Review 阶段作为决策对象。正确说法："在外环 ReAct 循环的 Act 节点被调用，**主要活跃于** Proposal 阶段"。

❌ **"Execution 阶段应该有专属创作能力"**
→ 错。Execution 是创作流 ↔ 执行流的交接点，创作层在此**静默**让位给内环 Step 循环。硬造专属能力只是翻译层，无价值。

❌ **"两层能力协议应该同构"**
→ 错。见 §4 本质差异。形态、失败语义、时间尺度、数量级全维度异构。

---

## 3. 设计原则

### 3.1 贡献者 / 分发通道 / 运行时宿主 三者分离

```
贡献者（Contributor）────贡献能力元数据
  ├─ 第一方子包（neko-cut/story/canvas/puppet/model/sketch）
  ├─ 第三方 VSCode 扩展开发者
  ├─ Shader 作者
  ├─ 模型打包者
  ├─ Skill 作者
  └─ MCP server 作者

分发通道（Distribution Channel）────传输与安装
  ├─ VSCode Marketplace（扩展）
  ├─ neko-market（素材/Skill/Shader/模型/Workflow）
  └─ MCP 生态（外部服务）

运行时宿主（Runtime Host）────承载执行
  ├─ VSCode Extension Host（扩展）
  ├─ neko-engine（Shader / 本地模型）
  ├─ neko-agent（Skill / Workflow / Registry）
  └─ 文件系统（素材，通过 AssetManifest 发现）
```

**原则**：注册协议归贡献者，分发协议归 market/marketplace，运行时协议归宿主。三件事必须分离，不能纠缠。

### 3.2 显式 opt-in 与 Fail-soft

- 未声明 `contributes.neko.*` 的扩展**完全不参与**原语注册
- 注册 schema 校验失败 **warn 不 fail**（已有先例：SkillService.apply 运行时校验）
- 单个贡献者错误不影响全局

### 3.3 创作层与执行层分层 opt-in

三类能力独立声明，缺失不影响其他：

```json
{
  "contributes": {
    "neko": {
      "protocolVersion": "1.0",
      "agentCapabilities": {...},       // 执行层基础：Tool（已有）
      "creationCapabilities": {...},    // 创作层（新增）
      "executionCapabilities": {...}    // 执行层扩展：Operation/Pipeline/...（新增）
    }
  }
}
```

### 3.4 统一三种注册时机

| 时机 | 触发方式 | 加载粒度 |
|-----|---------|---------|
| **启动期静态发现** | 扫描 manifest + 文件系统 | 仅元数据，不加载 schema/content |
| **运行时动态注册** | `neko.agent.registerCapabilities` command | 元数据 + 懒加载详细内容 |
| **激活期加载** | Skill.apply() 触发关联 ToolSet | 加载 schema/content（分级 LoadingTier）|

三者统一到同一 Registry，对消费方（Activation Planner）透明。

---

## 4. 能力分类（10 类可注册 + Step 内部机制 + 横切机制）

### 4.1 创作能力原语（5 类，服务外环 ReAct 阶段）

| 能力 | 协议 | 服务阶段（主导）| ReAct 节点 | 数量级/子包 | 说明 |
|-----|------|--------------|----------|----------|------|
| **OrchestrationSkill** | `IOrchestrationSkill` | Orchestration | Think | 1 | 编排话术 + 问答结构（引导用户发散）|
| **ProposalArtifact** | `IProposalArtifact` | Proposal | Act | 1-5 | 方案制品（含叙事 + schema + renderer + 成本画像）|
| **ReviewStrategy** | `IReviewStrategy` | Review | Observe | 1-3 | 决策空间 + Fork/Refine 规则 + Diff 呈现 |
| **StatusNarrator** | `IStatusNarrator` | Status | Act | 1 | 态势叙事器（Step 聚合 + 里程碑识别）|
| **StageViewRecipe** | `IStageViewRecipe` | 跨阶段（声明适用集合）| UI | 0-10 | UI 配方（ComponentRef + 数据绑定）|

**命名重要变更**：`ProposalKind` → `ProposalArtifact`，消除"阶段的一种类别"歧义。`ViewRecipe` → `StageViewRecipe`，明确可跨阶段。

**Execution 阶段说明**：该阶段**无专属创作能力**。外环 ReAct 循环在此静默让位给内环 Step 循环。只有 `StageViewRecipe` 可在该阶段提供 UI（数据来自下层 Step 聚合）。

### 4.2 执行能力原语（5 类，服务内环 Step 节点）

| 能力 | 协议 | 服务 Step 节点 | 数量级/子包 | 说明 |
|-----|------|-------------|----------|------|
| **Tool** | `AgentCapabilityProvider`（已有）| Act | 10-50 | 工具调用接口 |
| **Operation** | `IOperation` | Act | 10-50 | 业务语义的操作（带 cost/reversible/idempotent 元数据）|
| **PipelineStage** | `IPipelineStage` | 多 Step 组合 | 2-10 | 流水线阶段定义（依赖 DAG + QualityGate）|
| **ApplyPolicy** | `IApplyPolicy` | Guard（Act 前置）| 5-20 | 提交策略（阈值/批量/审计级别/回滚窗口）|
| **AutohealStrategy** | `IAutohealStrategy` | Observe | 10-30 | 五级自愈链具体策略 |

### 4.3 Step 内部机制原语（不注册，单实现）

Plan/TODO/Approve/Apply 是 **Step 内部的可选机制原语**，不是能力。任何 Step 按需启用这 4 个机制，机制实现由 neko-agent 内置唯一版本。

| 机制原语 | 在 Step 的作用位置 | 启用条件 | 对齐业界 |
|--------|----------------|---------|---------|
| **Plan** | Think 前的规划产出 | 多步任务 or PlanMode 显式要求 | Claude Code /plan |
| **TODO** | Plan 的状态化分解 | Plan 存在 且 原子指令 > 1 | Claude Code TodoWrite |
| **Approve** | Act 前的授权校验 | ApplyPolicy 判定需审批 | 通用授权原语 |
| **Apply** | Act 的 commit 边界 | 有副作用工具调用 | Terraform apply |

**关键**：这 4 个机制**不开放注册**。子包想扩展行为应通过注册对应的能力原语（如 `ApplyPolicy` 扩展 Approve 策略，`AutohealStrategy` 扩展 Observe 后的错误处理）。

### 4.4 横切机制层（不注册，单实现）

| 能力 | 归属 | 原因 |
|-----|------|-----|
| ApprovalEngine 核心 | `@neko/shared` | 机制共性，单引擎 |
| AuditLogger | `@neko/shared` | 横切 |
| EventBus | `@neko/shared` | 横切 |
| PermissionManager | `neko-agent` | 单实现 |
| SkillInjectionCoordinator | `neko-agent` | 单实现 |
| ContextManager | `neko-agent` | 单实现 |
| PhaseOrchestrator | `neko-agent` | 外环阶段状态机 |
| StepScheduler | `neko-agent` | 内环 Step 调度 |

**原则**：横切机制**不开放注册**，避免碎片化。策略通过**策略包**（Strategy Pack）扩展（对齐 [dual-flow-architecture.md §5.2](./dual-flow-architecture.md) 单引擎双策略包）。

### 4.5 能力使用矩阵（创作能力 × 阶段）

| 创作能力 | Orchestration | Proposal | Review | Execution | Status |
|---------|:-:|:-:|:-:|:-:|:-:|
| `OrchestrationSkill` | ✅ 主导 | 🟡 残留 | ❌ | ❌ | ❌ |
| `ProposalArtifact` | ❌ | ✅ 主导 | 🟡 引用 | ❌ | 🟡 引用（回看）|
| `ReviewStrategy` | ❌ | ❌ | ✅ 主导 | ❌ | ❌ |
| `StatusNarrator` | ❌ | ❌ | ❌ | 🟡 数据采集 | ✅ 主导 |
| `StageViewRecipe` | ✅ | ✅ | ✅ | ✅ | ✅ |

**规律**：
- 每阶段**有且仅有一个主导创作能力**（Execution 除外）
- `StageViewRecipe` 是唯一全阶段贡献
- Execution 阶段创作层"静默"是特性，印证双流交接点设计

---

## 5. 两层能力的本质差异

子包同时贡献两层能力时，必须理解两者**物种不同**，不应强求协议同构。

| 维度 | 创作能力原语 | 执行能力原语 |
|-----|----------|----------|
| **服务对象** | 创作者（人）| Agent（系统）|
| **核心价值** | 业务语义表达 | 系统行为落地 |
| **产出物本质** | 叙事制品（含"为什么"）| 结构化记录（含"怎么做"）|
| **有无副作用** | 无（可丢弃）| 有（资源消耗）|
| **重做成本** | 零（方案丢了再提）| 高（Apply 后难回滚）|
| **域知识浓度** | 极高（剪辑/编剧/动画）| 低到中（工具 + 状态机）|
| **数量级** | 稀疏（1-5 个 ProposalArtifact）| 密集（10-50 个 Operation）|
| **演化速度** | 慢（业务原语稳定）| 快（工具持续新增）|
| **发现时机** | 启动期静态为主 | 启动期 + 运行时动态 |
| **Schema 严格度** | 宽松（允许 narrative 自由文本）| 严格（Zod 强校验）|
| **懒加载需求** | 弱（数量少）| 强（分级加载）|
| **组合性** | 跨域 Artifact 归 neko-agent | Operation 天然组合 |
| **失败容忍** | 可渐进注册（有通用兜底）| 必须完备（缺失即阻塞）|
| **服务 ReAct 节点** | Think/Act/Observe（外环）| Act/Observe/Guard（内环 Step）|
| **时间尺度** | 分钟~小时 | 毫秒~秒 |

**设计含义**：

- 创作层 → manifest 静态注册为主，单个贡献小而精
- 执行层 → manifest + command 混合 + 分级懒加载，贡献大而广
- 不要为两层设计相同的"注册元数据详细度"

---

## 6. 子包贡献范围

### 6.1 按子包定位分类

| 类型 | 子包 | 创作能力 | 执行能力 | 注册优先级 |
|-----|-----|----------|----------|-----------|
| **完整创作域** | neko-cut, neko-story, neko-canvas, neko-puppet, neko-model, neko-sketch | ✅ 必须 | ✅ 必须 | P1-P3 |
| **能力提供者** | neko-assets, neko-market | ❌ 不提供 | 🟡 可选 | P2 |
| **消费型** | neko-preview, neko-tools | ❌ 不提供 | 🟡 可选 | P3 |
| **基础设施** | neko-agent | ❌ 不提供 | ✅ 提供核心内置（fallback）| P0 |

**重要边界**：子包**只贡献能力原语**，不贡献 ReAct 阶段（外环 5 阶段 + 内环 Step）。阶段是概念锚点，不可注册。

### 6.2 单个子包内部注册顺序

```
P0: Tool（最小可用）
P1: Operation（执行层核心，加 cost/reversible/idempotent 元数据）
P2: ProposalArtifact（创作层核心，让用户能讨论方案）
P3: OrchestrationSkill + StatusNarrator（提升叙事质量）
P4: StageViewRecipe（自定义 UI）
```

**原则**：两层原语非对称可选，但创作域子包应优先补齐两层；执行层可先只提供 Tool，创作层可延后；能力/消费型子包可只提供执行层。

### 6.3 当前覆盖率（基线）

| 子包 | Tool | Operation | ProposalArtifact | ReviewStrategy | OrchestrationSkill | StatusNarrator | StageViewRecipe |
|-----|------|-----------|----------------|----------------|-------------------|---------------|----------------|
| neko-cut | ✅ | 🟡 待抽 | 🔴 | 🔴 | 🔴 | 🔴 | 🟡 部分 |
| neko-story | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🟡 部分 |
| neko-canvas | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| neko-puppet | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| neko-model | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| neko-sketch | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |

**结论**：能力注册近零覆盖，是未来数个季度的核心工程面。

---

## 7. neko-market 作为能力分发中枢

### 7.1 定位修正

neko-market 不再只是"素材仓库"，而是**运行时能力分发中枢**，承载六大类：

| 类目 | 是否走能力注册 | 运行时宿主 | 示例 |
|-----|--------------|----------|------|
| **素材** | ❌ 不注册（走 AssetManifest）| 文件系统 | LoRA / 模板 / 3D 模型 / 音效 |
| **Skill** | ✅ 创作层 | neko-agent SkillRegistry | 行业话术包 / 人格 |
| **插件** | ✅ 全量（Tool + 两层能力）| VSCode Extension Host | 第三方创作域扩展 |
| **Shader** | ✅ 执行层 Operation | neko-engine | GLSL / WGSL 特效 |
| **模型** | ✅ 执行层 Operation | neko-engine / Ollama / MCP | ONNX / GGUF / Safetensors |
| **Workflow** | 🟡 独立协议（未来）| neko-agent Workflow Registry | `.nkworkflow` 食谱 |

**核心原则**：market 是**传输管道 + 运行时容器**，不贡献能力，只承载第三方能力按统一协议融入系统。

### 7.2 InstallTarget 扩展

对齐 [marketplace.md](./marketplace.md) 的 multi-category InstallTarget 设计：

```typescript
type InstallTarget =
  | { kind: 'asset'; handler: AssetHandler; manifest: AssetManifest }
  | { kind: 'skill'; handler: SkillHandler; capability: CreationCapabilitySnippet }
  | { kind: 'extension'; handler: ExtensionHandler; capability: FullCapabilityProvider }
  | { kind: 'shader'; handler: ShaderHandler; capability: OperationDefinition }
  | { kind: 'model'; handler: ModelHandler; capability: OperationDefinition }
  | { kind: 'workflow'; handler: WorkflowHandler; workflow: NkWorkflow };
```

每类 InstallTarget 带：

- **Handler**：安装/卸载/更新的运行时动作
- **Capability snippet**：要注册到 CapabilityRegistry 的元数据（素材除外）

### 7.3 安装流程

```
用户从 market 安装 →
  InstallTarget.kind 分发：
    ├─ asset    → 下载到 .neko/assets/，写 AssetManifest
    ├─ skill    → 下载到 ~/.neko/skills/，调用 neko-agent registerSkill()
    ├─ extension → VSCode 标准安装 → 扩展启动时触发 capability discovery
    ├─ shader   → 下载到 .neko/shaders/，调用 EngineClient registerShader()
    ├─ model    → onPostInstall 分流（GGUF→Ollama / ONNX→Engine）+ 注册 Operation
    └─ workflow → 下载到 .neko/workflows/，调用 neko-agent registerWorkflow()
```

[model-runtime.md](./model-runtime.md) 的 `onPostInstall GGUF->Ollama / ONNX->Engine` 是此模式的先例。

### 7.4 与 registry-server 的协作边界

registry-server（见 [registry-server.md](./registry-server.md)）：**Thin API + object storage 直传 + 上游代理**

market 本地端职责：

- 从 registry-server 拉取包
- 本地验签（见 §9 信任模型）
- 触发 InstallTarget 分发

**注册协议与 registry-server 解耦**：registry 只管"存储+分发"，不参与"注册到哪个 Registry"的决策。

---

## 8. CapabilityDiscoveryService 三通道

### 8.1 通道扩展

原 `AgentCapabilityProvider` 双通道（manifest + command）升级为三通道：

```typescript
class CapabilityDiscoveryService {
  // P0 已有
  discoverFromManifests(): CapabilityProvider[];
  discoverFromCommands(): CapabilityProvider[];

  // 新增（由 market 安装的产物触发）
  discoverFromMarketInstalls(): CapabilityProvider[];
}
```

### 8.2 三通道适用场景

| 通道 | 适用贡献者 | 触发时机 | 特点 |
|-----|----------|---------|------|
| **Manifest 静态** | 第一方子包、VSCode marketplace 扩展 | 扩展启动 | 类型强校验，无副作用 |
| **Command 动态** | 扩展内部运行时注册（如根据用户配置决定启用哪些能力）| 扩展 activate 后任意时刻 | 灵活，需严格防御 |
| **文件系统扫描** | market 安装的 Skill/Shader/模型/Workflow | 启动期 + market 安装后 | 扫描 `~/.neko/skills/`、`.neko/shaders/` 等目录 |

### 8.3 统一注册中心

三通道发现的能力元数据汇入统一的 Registry：

```typescript
class CreationRegistry implements IPrimitiveRegistry<CreationCapability> {
  register(cap: CreationCapability, source: CapabilitySource): void;
  get(id: string): CreationCapability | undefined;
  list(filter?: CapabilityFilter): CreationCapability[];
  unregister(id: string): void;
}

class ExecutionRegistry implements IPrimitiveRegistry<ExecutionCapability> {
  // 同上
}
```

消费方（Activation Planner、UI、Approval Engine）只需面对 Registry，对通道来源透明。

---

## 9. 信任模型（三级）

市场化引入了"不受信的第三方"，需要分级信任：

| 级别 | 来源 | 能注册的能力 | 沙箱要求 |
|-----|-----|------------|---------|
| **first-party** | 官方签名（neko-suite 团队）| 任意（含保留命名空间）| 否 |
| **community** | 社区验证签名（受信作者）| 非保留命名空间 | 按 Operation 类型可选 |
| **unverified** | 无签名 / 未验证 | 只读能力（ProposalArtifact 叙事）| **强制沙箱**，禁止注册 Operation |

### 9.1 签名与可信度元数据

```typescript
interface MarketInstallTarget {
  id: string;
  signature: string;
  verifiedBy: 'first-party' | 'community' | 'unverified';
  sandboxRequired: boolean;
  protocolVersion: string;
  declaredCapabilities: DeclaredCapabilitySet;
}
```

### 9.2 分级权限表

| 能力类 | first-party | community | unverified |
|-------|------------|-----------|-----------|
| Tool | ✅ | ✅ | ✅（沙箱）|
| Operation（只读）| ✅ | ✅ | 🟡（沙箱 + warn）|
| Operation（有副作用）| ✅ | ✅ | ❌ |
| ProposalArtifact | ✅ | ✅ | ✅ |
| OrchestrationSkill | ✅ | ✅ | 🟡（需用户显式启用）|
| 保留命名空间 | ✅ | ❌ | ❌ |

---

## 10. 八层防御机制

防止未注册/恶意/错误贡献污染系统：

### Layer 1: 显式 opt-in

未声明 `contributes.neko.*` 的扩展**完全不参与**能力扫描。

```typescript
CapabilityDiscoveryService.discover() {
  return extensions
    .filter(ext => ext.packageJSON.contributes?.neko)
    .map(...)
}
```

**防御目标**：风险 1（未注册子包被误认为支持某原语）。

### Layer 2: Schema 校验 + Fail-soft

```typescript
registerCreationCapabilities(provider: unknown, sourceId: string) {
  const result = CreationCapabilityProviderSchema.safeParse(provider);
  if (!result.success) {
    logger.warn(`Invalid capability from ${sourceId}`, result.error);
    return;
  }
  registry.add(result.data, sourceId);
}
```

已有先例：`SkillService.apply()` 运行时校验（记忆记录）。

**防御目标**：风险 2（schema 错误）。

### Layer 3: 协议版本兼容

```typescript
if (provider.protocolVersion < MIN_SUPPORTED_VERSION) {
  return loadLegacyAdapter(provider);
}
if (provider.protocolVersion > MAX_SUPPORTED_VERSION) {
  logger.warn(`Unsupported protocol version, skipping`);
  return;
}
```

**防御目标**：风险 3（版本不兼容）。

### Layer 4: 强制命名空间 + 保留域

所有原语 id 必须带 `{domain}.` 前缀；第一方命名空间受保护：

```typescript
const RESERVED_NAMESPACES = ['cut', 'story', 'canvas', 'puppet', 'model', 'sketch', 'suite'];

validateNamespace(id: string, source: CapabilitySource) {
  const ns = id.split('.')[0];
  if (RESERVED_NAMESPACES.includes(ns) && source.verifiedBy !== 'first-party') {
    throw new Error(`Namespace "${ns}" is reserved`);
  }
}
```

**防御目标**：风险 4（恶意覆盖第一方）。

### Layer 5: 分层 opt-in

`agent / creation / execution` 三类能力独立声明，缺失不影响其他：

- 只注册 `agentCapabilities` 的包 → Agent 不会把它当 Proposal 源
- 没注册 `creationCapabilities` 的包 → 完全不出现在创作流的可用域列表里

**防御目标**：风险 1 的根本隔离。

### Layer 6: 签名与可信度

见 §8。市场包必须声明 `verifiedBy`，影响能注册的能力范围。

**防御目标**：第三方市场包的恶意贡献。

### Layer 7: 安装时能力声明

```typescript
MarketInstallTarget.declaredCapabilities: {
  tools: ['cut.new-filter'],
  proposalKinds: ['cut.vintage-proposal'],
  operations: ['cut.apply-vintage-filter']
}
```

安装后实际注册的能力必须 ⊆ 声明内容。超出则拒绝。用户安装前能看到完整能力声明。

**防御目标**：防止"安装时看起来只是滤镜，运行时偷偷注册数据库操作"。

### Layer 8: 按来源限流

- 单个第三方插件 ProposalKind 数量上限（防方案污染）
- 单个第三方插件不能覆盖第一方命名空间（已在 Layer 4）
- community 插件的 Operation 默认 `reversible: false`（强制走 Approve）

**防御目标**：贡献过度 / 隐蔽副作用。

### 9.9 运行时降级兜底

所有防御失败后的最后防线：

```typescript
if (!creationRegistry.has(proposalKindId)) {
  logger.warn(`ProposalKind "${proposalKindId}" not registered`);
  // 降级到通用 FreeFormProposal
  return { proposal: createFreeFormProposal(task), degraded: true };
}
```

**原则**：**未注册不崩溃，降级到通用能力**。创作层降级到 `FreeFormProposal`（自由文本方案），执行层降级到 `McpOperationAdapter`（保守默认元数据）。

---

## 11. 生命周期管理

### 11.1 能力的五个生命周期事件

| 事件 | 创作层能力 | 执行层能力 |
|-----|----------|----------|
| **Install** | 注册到 CreationRegistry | 注册到 ExecutionRegistry |
| **Enable** | 进入 Activation Planner 候选池 | 可被 Tool dispatcher 调用 |
| **Disable** | 从候选池移除（已生成 Proposal 保留）| 从 dispatcher 移除（运行中 Step 允许完成）|
| **Uninstall** | 清理注册 + **保留历史 Proposal 的只读访问** | 清理注册 + **历史 Step 日志保留** |
| **Update** | schema 变更 → 旧 Proposal 进入"只读归档" | 签名变更 → 历史 Apply 可能无法回滚（需提示）|

### 11.2 生命周期原则

- **创作层能力的卸载不应破坏历史** — 用户方案记录是创作资产
- **执行层能力的卸载可能破坏回滚链** — 需提示用户
- **更新不自动生效** — 新 schema 注册后，旧数据走兼容层

---

## 12. 模块落位

```
@neko/shared/types/
  agent-capability.ts          Tool 协议（已有）
  creation-capability.ts       创作层协议（新增）
  execution-capability.ts      执行层协议（新增）
  capability-source.ts         来源元数据（新增：first-party/community/unverified）
  tool-names.ts                TOOL_NAMES SSOT（已有）

neko-agent/packages/agent/services/
  capabilityDiscoveryService.ts   三通道发现（新增 fs 通道）
  creationRegistry.ts             创作层聚合（新增）
  executionRegistry.ts            执行层聚合（新增）
  registrationGuard.ts            八层防御（新增）
  activationPlanner.ts            消费注册做自主编排（扩展）

neko-market/packages/market-core/
  installer/                   InstallTarget 分发器（扩展六类）
  verifier/                    签名验证 + 信任模型（新增）
  lifecycle/                   安装/启用/禁用/卸载钩子（新增）

第一方子包（示例 neko-cut）
  extension/src/
    agentCapabilityProvider.ts        已有
    creationCapabilityProvider.ts     新增
    executionCapabilityProvider.ts    新增
  package.json
    contributes.neko.agentCapabilities        已有
    contributes.neko.creationCapabilities     新增
    contributes.neko.executionCapabilities    新增
```

---

## 13. 分阶段推进路线

| 阶段 | 动作 | 依据 | 验收 |
|-----|-----|-----|------|
| **P0（现在）** | 承认覆盖率空白，文档登记 | 5 创作域子包注册近零 | 本 ADR 落地评审 |
| **P1（3 周）** | 定义协议层：`ICreationCapability` / `IExecutionCapability` 接口 + schema | 复用 `AgentCapabilityProvider` 同款模式 | 协议 + schema 通过单测 |
| **P2（4 周）** | CapabilityDiscoveryService 三通道实现 + 八层防御 | 文件系统通道为 market 支持 | 注册失败场景全覆盖 |
| **P3（4 周）** | neko-cut 示范双注册（ProposalArtifact + Operation）| 已有 Tool 注册基础 | 端到端 flow 跑通 |
| **P4（按需）** | 其他子包按优先级迁移 | neko-story > puppet > model > canvas > sketch | 各子包两层注册就位 |
| **P5（6 周）** | neko-market InstallTarget 六类扩展 + 信任模型 | 对齐 marketplace.md 扩展 | 社区包安装流程跑通 |
| **P6（远期）** | Workflow 文件化 + 元规划 | 原语稳定后 | `.nkworkflow` 可社区分发 |

**优先级理由**：

- neko-story：创作原语最丰富（storyboard/beat/scene），ROI 最高
- neko-puppet：动画原语独特（motion-curve），类型系统价值大
- neko-model：3D 域复杂，Operation 注册收益大
- neko-canvas / sketch：形态简单，可最后做

---

## 14. 指标与验收

| 阶段 | 北极星指标 | 阈值 |
|------|-----------|------|
| P1 | 协议 schema 覆盖率 | 100%（10 类能力）|
| P2 | 注册防御成功率 | 恶意/错误注册 100% 被拦截或降级 |
| P3 | neko-cut 双注册端到端 | 创作流 + 执行流全链路跑通 |
| P4 | 子包注册覆盖率 | 5 创作域子包 ≥ 80% |
| P5 | market 社区包安装成功率 | ≥ 95% |
| P5 | 未注册扩展误触率 | 0% |

---

## 15. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|-----|------|-----|
| 协议设计过早固化 | 中 | 中 | protocolVersion 字段 + adapter 机制预留演进 |
| 创作层能力碎片化 | 中 | 高 | ProposalArtifact 基类在 shared 定义必需字段；子包通过泛型扩展 |
| 第三方插件污染命名空间 | 中 | 高 | Layer 4 命名空间强制 + Layer 7 安装时声明 |
| market 社区包安全事故 | 低 | 高 | Layer 6 三级信任 + Layer 8 限流 + 沙箱要求 |
| 注册流程性能瓶颈 | 低 | 中 | 懒加载（仅元数据启动时加载）+ LoadingTier 分级 |
| 旧数据迁移失败 | 中 | 中 | 更新策略为"旧数据只读归档"，不强制迁移 |

---

## 16. 反模式（禁止）

- ❌ **把 ReAct 阶段当作能力注册** — 阶段是概念锚点，不可注册，不可替换
- ❌ **把 Plan/TODO/Approve/Apply 当作能力注册** — 它们是 Step 内部机制，单一实现
- ❌ **为每种能力单独做 `contributes.neko.xxxKinds`** — 合并为 `creationCapabilities` / `executionCapabilities` 两个片段
- ❌ **两层能力协议强行同构** — 形态差异大，必须分层定义
- ❌ **StageViewRecipe 直接嵌入 React 组件** — 通过 ComponentRef 间接引用，保持 webview 边界
- ❌ **OrchestrationSkill 子包各自改 Agent 人格** — 稀释 Creation Flow Skill 一致性；应限为**域知识片段**合并到统一 Skill
- ❌ **Operation 不声明 idempotent/reversible** — 回滚链断裂
- ❌ **AutohealStrategy 粒度过粗** — 一条规则管所有错误
- ❌ **运行时 `flowTag: 'creation' | 'execution'` 开关** — 形状差异不应做成配置开关
- ❌ **跨域 ProposalArtifact 强塞给某子包** — 归 neko-agent 或 `suite.*` 命名空间
- ❌ **市场包安装时未声明能力** — 所有注册必须 ⊆ `declaredCapabilities`
- ❌ **未注册扩展自动进入创作流/执行流** — 违反 Layer 1 opt-in 原则
- ❌ **能力原语不声明 servesPhase / servesReActNode** — 无法被 Activation Planner 正确调用

---

## 17. 下一步行动

### 17.1 立即可启动（本周）

1. 本 ADR 落盘评审
2. 协议 schema 草案（`@neko/shared/types/creation-capability.ts` / `execution-capability.ts`）
3. CapabilityDiscoveryService 三通道接口草案

### 17.2 2 周内

1. 协议 schema 单测全覆盖
2. 注册防御八层机制单测
3. neko-cut 双注册示范 PR 开工

### 17.3 4 周内

1. P3 完成：neko-cut 创作层 + 执行层端到端
2. 协议兼容性测试（first-party / community / unverified 三路径）
3. 开始 P4 子包迁移

---

## 18. 变更历史

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-04-20 | 初版 Proposed，统一能力注册与分发协议 | Architecture Team |
| 2026-04-20 | 引入四维概念模型；ProposalKind → ProposalArtifact；Plan/TODO/Approve/Apply 重分类为 Step 内部机制 | Architecture Team |

---

## 附录 A：与双流架构的集成

本协议是 [dual-flow-architecture.md](./dual-flow-architecture.md) 的落地基础设施：

| 双流架构需求 | 本协议承载方式 |
|-----------|-------------|
| 创作流原语需要可扩展 | 创作层 5 类能力 + 子包注册 |
| 执行流原语对齐业界标准 | 执行层 5 类能力 + Operation/Pipeline 对齐 Terraform/ReAct |
| 单 Approval 引擎 + 双策略包 | 策略包通过 ApplyPolicy / ReviewStrategy 注册扩展 |
| Activation Planner 自主编排 | 消费 Registry 元数据 + activationHint |
| Skill 承载双流人格 | OrchestrationSkill 贡献片段合并到统一 Skill |

---

## 附录 B：与 neko-market 的集成

| market 能力 | 本协议承载方式 |
|-----------|-------------|
| 素材分发 | 不走能力注册（AssetManifest 发现）|
| Skill 分发 | 创作层能力注册 + 文件系统通道 |
| 插件分发 | 全量能力注册（Tool + 两层）|
| Shader 分发 | 执行层 Operation 注册 + Engine 运行时 |
| 模型分发 | 执行层 Operation 注册 + onPostInstall 分流 |
| Workflow 分发（远期）| 独立协议，与能力注册解耦 |

---

## 附录 C：协议版本演进策略

- `protocolVersion: "1.0"` — 本 ADR 定义的初版
- 向后兼容：至少支持 n-2 版本（通过 adapter）
- 破坏性变更：主版本号递增，旧版本包需显式标注 deprecated
- 扩展性变更：次版本号递增，新字段必须可选
- Registry 内部始终使用最新版本的规范化形式
