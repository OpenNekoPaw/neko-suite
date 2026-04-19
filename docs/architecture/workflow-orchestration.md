# 创作工作流编排（Umbrella / Index）

> Status: Accepted（Phase 1-3.5 + 4.1 + 4.3a + 5.1-5.4d + 6.1/6.2 已实现；Phase 4.2/4.3b / 5.4c-rust/5.4e / 6.3 进行中）
> Scope: 总览 + ADR 家族索引
> 原 16 节大 ADR 已按三层分拆（见 §3 重构说明）
> 进度跟踪：[docs/development/workflow-orchestration-impl-plan.md](../development/workflow-orchestration-impl-plan.md)
> 项目状态分层：`.nkproj` / `.neko/` / git 三者正交，见 [format-strategy.md §六](./format-strategy.md)（2026-04-19 评审）

---

## 1. 分层模型

创作工作流分为**三个独立层级** + **三个横向子系统**：

```
┌─ Workflow 层 ────────────────────────┐   "走哪条流程"
│  Router (InputProbe/FastProbe/LLM)   │   元层面：流程模板
│  Route Registry (L0-L4)              │
│  Route Memory                        │
└──────────────┬───────────────────────┘
               │ 输出 Route
               v
┌─ Plan 层 ────────────────────────────┐   "这次具体做什么"
│  Plan Builder                        │   执行前：可 review 工件
│  .nkplan 持久化                       │
│  Plan State Machine                  │
│  Plan Review UI（矩阵视图）            │
└──────────────┬───────────────────────┘
               │ dispatch stages + params
               v
┌─ Pipeline 层 ────────────────────────┐   "正在跑什么"
│  PipelineExecutor (已有)              │   运行态：事件流
│  Stages (已有 6 个)                   │
└──────────────────────────────────────┘

╔═ 横向子系统（被 Plan 层消费）═════════╗
║  AssetLibrary  — 素材知识图谱          ║
║  MatchingEngine — 五层匹配             ║
║  ConsistencyChecker — 一致性校验        ║
╚══════════════════════════════════════╝
```

**类比 Terraform**：Workflow = 「更新流程」；Plan = `terraform plan`；Pipeline = `terraform apply`。

## 2. ADR 家族索引

### 2.1 三层核心

| 层 | ADR | 职责 |
|----|-----|------|
| Workflow | [workflow-routing.md](./workflow-routing.md) | Router + Route Registry + Memory |
| Plan | [plan-mode.md](./plan-mode.md) | `.nkplan` + Plan Builder + State Machine + UI |
| Pipeline | [pipeline-execution.md](./pipeline-execution.md) | Executor + Stage 契约 + 事件协议 + Gate 协议 |

### 2.2 横向子系统

| ADR | 职责 | 消费方 |
|-----|-----|------|
| [asset-knowledge-graph.md](./asset-knowledge-graph.md) | AssetLibrary facade 聚合 CharacterRegistry + EntityGraph + Manifest | Plan / Matching / Consistency |
| [cross-modal-matching.md](./cross-modal-matching.md) | MatchingEngine L1-L5 | Plan Builder |
| [creative-consistency.md](./creative-consistency.md) | ConsistencyChecker + Reference Chain | Plan Builder + Pipeline |

### 2.3 扩展已有 ADR

| 已有 ADR | 扩展点 |
|---------|------|
| [format-strategy.md](./format-strategy.md) | `.nkplan` / `.nkproj` 格式定义 |
| [agent-media-architecture.md](./agent-media-architecture.md) | Reference Chain + 三种生成模式（render / render+AI / reference-only）|
| [clip-ts-binding.md](./clip-ts-binding.md)（新）| `ClipProvider` / `EmbeddingCache` TS 契约 + Rust napi 分阶段落地 |

## 3. 分层职责边界（不可混淆）

| 层/子系统 | **拥有** | **不拥有** |
|---------|---------|-----------|
| Workflow | 路由决策、流程模板 | 素材绑定、阶段执行 |
| Plan | 具体计划、素材绑定、审查 UI | 路由决策、执行机制 |
| Pipeline | 阶段机制、进度、重试 | 为什么跑、跑什么素材 |
| AssetLibrary | 素材数据模型、查询 | 匹配算法、一致性规则 |
| MatchingEngine | 候选匹配算法 | 素材模型、一致性校验 |
| ConsistencyChecker | 规则引擎、Reference Chain | 素材模型、匹配算法 |

## 4. 集成流程（端到端）

```
用户输入（prompt / 文件 / drop）
    ↓
Workflow.Router.decide(input)
    ↓ Route {level, flowId, skipStages, stageParams}
Plan.PlanBuilder.fromRoute(route, probe)
    ├── 调用 AssetLibrary 查可用素材
    ├── 调用 MatchingEngine 生成 bindings
    ├── 调用 ConsistencyChecker 验证 constraints
    └── 计算 referenceChain（Phase 5）
    ↓ LitePlan (P1) / .nkplan (P2+)
用户 review 矩阵视图，批准或编辑
    ↓ Plan.status = approved
PipelineExecutor.execute(flowId, ctx, stageConfig)
    ↓
Stages 按 Plan.bindings 执行（见 pipeline-execution.md）
    ├── render-engine stage（Phase 5.4d，前置：渲染 anchor shot）
    │   └── 选择 RenderMode：
    │       ├── pure-render      — 纯 puppet/scene 渲染（无 AI）
    │       ├── render-then-ai   — 渲染 + AI 增强
    │       └── reference-only   — 仅生成 reference 图，不出终稿
    ├── batch-generate stage（Phase 5.4a-b）
    │   ├── 读 ctx.renderedAnchorPaths 作为 anchor reference
    │   ├── 读 referenceChain 解析 per-shot reference paths
    │   └── MediaGenerationService 生成（带 reference）
    └── 回写 GeneratedAsset 到 AssetLibrary
    ↓
输出视频 / 资产（可选：Lossless Upgrade 记入 .nkproj.upgradeHistory）
```

## 5. 三层之间的数据契约

```typescript
// Workflow → Plan
interface Route {
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4'
  flowId: FlowId
  skipStages: Stage[]
  stageParams: Record<string, unknown>
  reason: string
  confidence: number
}

// Plan → Pipeline
interface PipelineDispatch {
  flowId: FlowId
  context: PipelineContext     // 包含 Plan 的 bindings、checkpoints
  config: PipelineConfig       // skipStages、gates、hooks
}
```

**关键不变**：`PipelineExecutor` 签名不变（[现有 pipeline-executor.ts](../../packages/neko-agent/packages/agent/src/pipeline/pipeline-executor.ts)）。Plan 层把自己的决策**翻译**为 pipeline 参数。

## 6. 实施优先级总览

```
Phase 0    ✅   ADR 重构（已完成）
Phase 1    ✅   Router 规则层 + LitePlan + AssetLibrary facade + Matching L1/L2/L5
Phase 1.5  ✅   交互 Plan Mode + Webview 卡片
Phase 2    ✅   .nkplan 持久化 + Plan 状态机 + ConsistencyChecker v1
Phase 2.5  ✅   Fork + Diff + Checkpoint pause + PlanBrowser
Phase 3    ✅   LLM Router + 记忆闭环 + 成本估算
Phase 3.5  ✅   ask_user 交互兜底（webview modal + 可暂停 budget）
Phase 4.1  ✅   L3/L4 TS 契约 stub + feature flags（ClipProvider / EmbeddingCache / SemanticMatcher / LLMMatcher）
Phase 4.2  ⏳   CLIP Rust napi 绑定 + host-api TS wrapper
Phase 4.3a ✅   NodeEmbeddingCache（JSON+base64 Float32+LRU）
Phase 4.3b ⏳   模型分发 + binary mmap 替换 JSON + 导入时预计算
Phase 5.1  ✅   Reference Chain TS 契约 stub（buildReferenceChain + 3 策略 + 边界断点）
Phase 5.2a ✅   PlanBuilder 自动计算 chain + LitePlan/.nkplan 持久化 + 验证器
Phase 5.2b ✅   Canvas ShotCharacter.referenceChain 字段（与 nkplan 同步）
Phase 5.3  ✅   PipelineContext 透传 chain + batch-generate stage + MediaGenerateOptions.referenceShotIds
Phase 5.4a ✅   resolveReferencePath hook + referenceImagePaths → referenceImageUrl / ipAdapterRefs / referenceImages
Phase 5.4b ✅   batch-generate in-batch deferred map，dependent shots 等 anchor 完成再 resolve paths
Phase 5.4c-stub ✅  RenderMode / PuppetRenderAdapter / SceneRenderAdapter TS 契约 + selectRenderMode + disabled defaults
Phase 5.4c-rust ⏳  runtime-puppet / runtime-scene Rust adapter 实现（host-napi binding）
Phase 5.4d ✅   render-engine pipeline stage + ctx.renderedAnchorPaths + batch-generate 默认 resolver 优先读 rendered anchors
Phase 5.4e ⏳   bootstrap 注册 render-engine（需要 runtime-puppet/runtime-scene adapter 实例落地）
Phase 6.1  ✅   .nkproj Format SDK（types + validator + migrator + codec + barrel，对齐 nkv/nkplan 模式）
Phase 6.2  ✅   Lossless Upgrade 原语（addArtifacts / removeArtifacts / appendUpgradeEvent / recordLosslessUpgrade）
Phase 6.3a ✅   Clip.lineage — timeline.proto 新增 ClipLineage message + regen timeline.engine.ts（shotNodeId / generationId / planId / routeLevel / recordedAt）
Phase 6.3b ✅   ShotCanvasNode.data.workflowPlanId — 可选字段，手工建的 shot 仍兼容
Phase 6.3c ⏸   输入 handler registry — 推迟（当前 fast-probe.ts 内联 switch 够用，无消费端要求抽取）

治理  C1   ✅   `neko.workflow.orchestrator.enabled` 默认 `true`（workflow-settings.ts + package.json 同步）
治理  C2   ✅   Legacy `neko.pipeline.start` / `neko.agent.generateForNode` JSDoc `@deprecated` 标记，保留可用
```

**代码锚点速查**（每 Phase 的主要落地文件）：

| Phase | 主要文件 |
|-------|---------|
| 1 Router | [router/fast-probe.ts](packages/neko-agent/packages/platform/src/workflow/router/fast-probe.ts) · [router/route-registry.ts](packages/neko-agent/packages/platform/src/workflow/router/route-registry.ts) · [router/index.ts](packages/neko-agent/packages/platform/src/workflow/router/index.ts) |
| 1 AssetLibrary | [asset-library/](packages/neko-agent/packages/platform/src/workflow/asset-library/) · [binding-history.ts](packages/neko-agent/packages/platform/src/workflow/asset-library/binding-history.ts) |
| 1 Matching L1/L2/L5 | [matching/explicit-matcher.ts](packages/neko-agent/packages/platform/src/workflow/matching/explicit-matcher.ts) · [name-matcher.ts](packages/neko-agent/packages/platform/src/workflow/matching/name-matcher.ts) · [continuity-matcher.ts](packages/neko-agent/packages/platform/src/workflow/matching/continuity-matcher.ts) |
| 2 Plan 持久化 | [plan/plan-store.ts](packages/neko-agent/packages/platform/src/workflow/plan/plan-store.ts) · [plan/plan-state-machine.ts](packages/neko-agent/packages/platform/src/workflow/plan/plan-state-machine.ts) · [nkplan codec](packages/neko-types/src/nkplan/codec.ts) |
| 3 LLM Router | [router/llm-router.ts](packages/neko-agent/packages/platform/src/workflow/router/llm-router.ts) · [router/llm-router-tools.ts](packages/neko-agent/packages/platform/src/workflow/router/llm-router-tools.ts) · [memory/router-memory.ts](packages/neko-agent/packages/platform/src/workflow/memory/router-memory.ts) |
| 3.5 ask_user | [router-ask-broker.ts](packages/neko-agent/packages/extension/src/workflow/router-ask-broker.ts) · [RouterAskModal.tsx](packages/neko-agent/packages/webview/src/components/ChatView/RouterAskModal.tsx) |
| 4.1 Matching L3/L4 stub | [matching/semantic-matcher.ts](packages/neko-agent/packages/platform/src/workflow/matching/semantic-matcher.ts) · [matching/llm-matcher.ts](packages/neko-agent/packages/platform/src/workflow/matching/llm-matcher.ts) |
| 4.3a Embedding cache | [matching/embedding-cache.ts](packages/neko-agent/packages/platform/src/workflow/matching/embedding-cache.ts) |
| 5.1-5.2 Reference chain | [plan/reference-chain.ts](packages/neko-agent/packages/platform/src/workflow/plan/reference-chain.ts) · [nkplan types](packages/neko-types/src/nkplan/types.ts) |
| 5.2b Canvas 字段 | [types/canvas.ts](packages/neko-types/src/types/canvas.ts) |
| 5.3-5.4b Pipeline 集成 | [pipeline/types.ts](packages/neko-agent/packages/agent/src/pipeline/types.ts) · [stages/batch-generate.ts](packages/neko-agent/packages/agent/src/pipeline/stages/batch-generate.ts) |
| 5.4c RenderMode | [render-modes/](packages/neko-agent/packages/platform/src/workflow/render-modes/) |
| 5.4d render-engine stage | [stages/render-engine.ts](packages/neko-agent/packages/agent/src/pipeline/stages/render-engine.ts) |
| 6.1/6.2 .nkproj | [nkproj/](packages/neko-types/src/nkproj/) |
| Consistency v1 | [consistency/consistency-checker.ts](packages/neko-agent/packages/platform/src/workflow/consistency/consistency-checker.ts) |
| Settings 集中化 | [workflow-settings.ts](packages/neko-agent/packages/extension/src/workflow/workflow-settings.ts) |

**已完成横向任务**：
- 统一 flag 读取 + VSCode settings 注册（`neko.workflow.*` 7 项）
- 编排器集成测试（E2E-1..5 + 持久化 + fork/diff + consistency，10 条）
- BatchGenerationScheduler 订阅 orchestrator 事件（canvas quiet mode）

**项目状态分层约定**（2026-04-19 评审）：`.nkproj` 保持最小表面积，新增项目级元数据优先进 `.neko/`（配置/记忆/缓存/plans），git 负责文件时间线。三者正交职责见 [format-strategy.md §六](./format-strategy.md#六项目状态分层nkproj-vs-neko-vs-git)。

**并行度**：Phase 1 之后，Workflow / Plan / AssetLibrary / Matching / Consistency 可**独立 track** 推进，不互相阻塞。

详细实施计划见 [`docs/development/workflow-orchestration-impl-plan.md`](../development/workflow-orchestration-impl-plan.md)。

## 7. 关键设计原则

### 7.1 Progressive Disclosure
默认最短路径，不主动展开中间阶段。L0 直出，L2+ 才进 Plan Mode。

### 7.2 路由与 Plan 的可见性
决策必须显式、可解释、可推翻。Agent 是顾问不是管家。

### 7.3 横向子系统独立
AssetLibrary / Matching / Consistency **各自独立**，可被其他模块复用（如角色选择器 UI、资产搜索、一致性插件）。

### 7.4 Lossless Upgrade
低级路径产物可无损升级到高级路径（L0 prompt → L1 storyboard → L2 剧本）。依赖 `.nkproj` 顶层容器。

### 7.5 Memory 分层
三层各自拥有记忆片段，不混用：
- Workflow：路由偏好（`.neko/memory.md` 的 workflow 章节）
- Plan：用户绑定修正、Plan 模板（沉淀到 BindingHistory）
- Pipeline：无持久化记忆（运行态）

## 8. 重构说明（原 16 节大 ADR 的去处）

2026-04-18 重构：原 16 节 ADR 拆分为 5 份聚焦 ADR + 2 份扩展。各节归属：

| 原节 | 新归属 |
|-----|------|
| §1 背景 | [workflow-routing.md](./workflow-routing.md) §1 + 本文档 §1 |
| §2 必要 vs 可选 | [workflow-routing.md](./workflow-routing.md) §2 |
| §3 路由策略 | [workflow-routing.md](./workflow-routing.md) §4 |
| §4 三层路由架构 | [workflow-routing.md](./workflow-routing.md) §4-§5 |
| §5 WorkflowOrchestrator 架构 | 本文档 §4（集成流程）+ 各层 ADR |
| §6 关键原则 | 本文档 §7 + 各层 ADR 对应章节 |
| §7 Plan Mode | [plan-mode.md](./plan-mode.md) 全部 |
| §8 多素材参考与智能匹配 | 拆：[asset-knowledge-graph.md](./asset-knowledge-graph.md) + [cross-modal-matching.md](./cross-modal-matching.md) + [creative-consistency.md](./creative-consistency.md) |
| §9 输入文件类型与跨类型关联 | [workflow-routing.md](./workflow-routing.md) §3（素材→入口映射）+ [agent-media-architecture.md](./agent-media-architecture.md) 扩展 |
| §10 记忆与学习 | [workflow-routing.md](./workflow-routing.md) §7 + [asset-knowledge-graph.md](./asset-knowledge-graph.md) §10 |
| §11 `.nkproj` 依赖 | [format-strategy.md](./format-strategy.md) 扩展 |
| §12 成本与延迟 | [workflow-routing.md](./workflow-routing.md) §8 |
| §13 决策表 | [workflow-routing.md](./workflow-routing.md) §6 |
| §14 实施路线 | 独立实施计划文档 |
| §15 相关 ADR | 各 ADR 末尾交叉引用 |
| §16 一句话结论 | 本文档 §7 |

**重构收益**：
- 每份 ADR 专注单一主题，可独立 review
- 不同子系统可**独立 track** 推进，并行度高
- AssetLibrary 等横向能力可被 workflow 之外的模块复用
- 维护成本降低（改匹配算法不动 Plan 文档）

## 9. 一句话总结

> **Workflow 选「哪种流程」，Plan 定「这次做什么」，Pipeline 跑「正在做什么」；AssetLibrary / Matching / Consistency 是横向能力，被 Plan 层消费，不归属三层中任何一层。项目状态分层正交：`.nkproj` 管创作工件 DAG，`.neko/` 管工作区行为，git 管文件时间线。**
