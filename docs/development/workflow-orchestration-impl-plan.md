# Workflow Orchestration 实施计划

> Status: **Phase 1 + 1.5 + 2 + 3（MVP）已完成**（2026-04-18）；Phase 4-6 待启动
> Date: 2026-04-18
> Owner: TBD
> Related ADRs: [workflow-orchestration.md](../architecture/workflow-orchestration.md)（umbrella）

## 当前进度

| 阶段 | 状态 | 备注 |
|------|------|------|
| Phase 0: ADR 重构 | ✅ 完成 | 16 节 → 5 份聚焦 ADR + umbrella |
| Phase 1 MVP: Router + AssetLib + Matching + LitePlan | ✅ 完成 | 86 条单测 |
| Phase 1.5: 交互 Plan Mode + Webview 卡片 | ✅ 完成 | +5 条单测；feature flag `neko.workflow.orchestrator.enabled` 默认关 |
| Phase 2 core: `.nkplan` + PlanStore + 状态机 + ConsistencyChecker v1 + 生命周期转换 | ✅ 完成 | +57 条单测（148 total） |
| Phase 2 matrix editing: plan-editor + alternative dropdown + apply-to-all + live re-check | ✅ 完成 | +10 条单测（158 total） |
| Phase 2 remainder: Plan fork + diff viewer + Checkpoint pause | ✅ 完成 | +24 条单测（182 total） |
| Phase 3 MVP: LLMRouter（tool-use） + RouterMemory + 成本估算 + 输入 hash 缓存 | ✅ 完成 | +35 条单测（217 total）；feature flag `neko.workflow.router.llm.enabled` 默认关 |
| Phase 2 tail: Checkpoint pause UI（pipelineGate confirm/cancel） | ✅ 完成 | +0 单测（已有 executor 覆盖）；webview `PipelineGatePanel` |
| Phase 3.5: ask_user 交互式兜底（RouterAskBroker + RouterAskModal + budget 暂停） | ✅ 完成 | +4 单测（221 workflow total） |
| Phase 4: CLIP TS binding + L3/L4 | ⏳ 待启动 | 10-14 周 |
| Phase 5: Reference Chain + 2D/3D 三模式 | ⏳ 待启动 | 10-14 周 |
| Phase 6: `.nkproj` + Lossless Upgrade | ⏳ 待启动 | 8-12 周 |

### Phase 1 + 1.5 交付物（已合并）

**Platform 层**（`packages/neko-agent/packages/platform/src/workflow/`）：
- Router：FastProbe 规则层 + InputProbe + RouteRegistry + facade
- AssetLibrary：CharacterRegistry/EntityGraph/Manifest 三 adapter + BindingHistory + facade
- MatchingEngine：L1 Explicit + L2 Name + L5 Continuity 匹配器 + facade
- PlanBuilder：LitePlan + stage 映射

**Extension 层**：
- `workflow/orchestrator-bootstrap.ts` — 组装 Router/AssetLibrary/Matching/PlanBuilder
- `workflow/workflow-plan-handler.ts` — 交互式 PLAN → REVIEW → EXECUTE 协调器
- `chatProvider.ts` 扩展 `setWorkflowPlanHandler` + `workflow/*` 消息路由
- `index.ts` 新增命令 `neko.agent.startRoutedPipeline`（feature flag 门控）

**Webview 层**：
- `hooks/useWorkflowPlan.ts` — 订阅 `workflow/*` 消息的 React hook
- `components/ChatView/WorkflowPlanCard.tsx` — L0-L4 徽章 + 路由理由 + 阶段清单 + Start/Override/Abort
- `components/ChatView/PlanMatrix.tsx` — 只读 shot × 素材绑定矩阵（✅/⚠️/❓ + L5 `*`）
- `components/ChatView/WorkflowPlanPanel.tsx` — Panel 容器 + status badge + dismiss
- `ChatView` / `ChatWorkspace` 挂载点

**Agent-types 层**：
- `workflow-plan.ts` — postMessage-safe `WorkflowLitePlan` + 6 个消息类型

### Phase 2 core 交付物（已合并）

**Format SDK (`@neko/shared/nkplan`)**：
- `types.ts` — `NkPlan` 持久化根类型 + 所有枚举 + 生命周期 (`NkplanStatus`)
- `validator.ts` — 零依赖 pure 校验器（构造错误 + 警告）
- `migrator.ts` — 版本迁移链（v1.0 baseline，为未来 v2+ 做好 scaffold）
- `codec.ts` — `loadNkplan` / `saveNkplan` / `isValidNkplan`（组合 validator + migrator）
- 22 条单测

**Platform Plan 层扩展**：
- `plan/persistence-types.ts` — LitePlan ↔ NkPlan 转换（`toNkPlan` / `toLitePlan`）
- `plan/plan-state-machine.ts` — 严格转换表 (pending→approved→executing→paused/completed/failed/aborted，edited→pending) + `IllegalPlanTransitionError`
- `plan/plan-store.ts` — 文件系统适配器，持久化 `<workDir>/.neko/plans/<id>.nkplan`，安全 id 校验，transition API
- LitePlan 扩展 `constraints?: readonly Constraint[]` + `violations?: readonly Violation[]`
- 28 条新单测

**ConsistencyChecker v1**：
- `consistency/types.ts` — Constraint / Violation / ViolationFix / ConsistencyRule 契约
- `consistency/character-lock.ts` — 同角色跨镜资产锁定（respect `scene-change` / `character-change` 标签）
- `consistency/time-progression.ts` — dawn<morning<noon<dusk<night 单调推进
- `consistency/consistency-checker.ts` — facade 组合规则
- 10 条单测

**Agent-types 扩展**：
- `WorkflowConstraint` / `WorkflowViolation` / `WorkflowViolationFix` 线上类型

**Extension 扩展**：
- `orchestrator-bootstrap.ts` 注入 `consistencyChecker` + `planStore`（带 `tryCreatePlanStore`）
- `workflow-plan-handler.ts`：持久化生命周期（`persistInitial` + `transitionIfStored`），covered by 6 条新 handler 测试
- 6 条 PlanStore 生命周期测试：pending→approved→executing 全链路、abort、override→edited、load round-trip、无 store 时降级

**Webview 扩展**：
- `WorkflowPlanCard.tsx` 增加 Consistency 违规栏（severity 色彩 + fix suggestions）

### Phase 3 MVP 交付物（已合并）

**Platform Router 层**（`packages/neko-agent/packages/platform/src/workflow/`）：
- `router/input-hash.ts` — 纯 sha256 hex 哈希器；工作目录盐；多文件顺序无关
- `router/cost-estimator.ts` — 按 route level 聚合 stage tokens/credits/durationSec（镜像 plan-builder STAGE_META）
- `router/llm-router-tools.ts` — 5 个 OpenAI 兼容 ToolDefinition + 4 个纯 runner（commit_route 是终结态）
- `router/llm-router.ts` — `LLMRouter` 类：有界 tool-use 循环（max 5 iter，2s 硬预算 + `AbortController` 降级）+ in-session Map 缓存 + memory 持久化
- `memory/router-memory.ts` — `.neko/memory.md` H2 section `workflow-router`；JSON-per-line 条目 + LRU trim + 容错解析
- `router/index.ts` facade 扩展：`memory` 优先 > user override > FastProbe committable > LLMRouter > 低置信 fallback；新 options: `llmRouter`, `memory`, `workDir`

**Extension 层**：
- `orchestrator-bootstrap.ts` 新增 `tryCreateRouterMemory` + `tryCreateLLMRouter` + `isLLMRouterEnabled()`；flag `neko.workflow.router.llm.enabled` 默认关
- Router 实例在 bootstrap 时获得 LLM + memory 依赖（存在时）

**测试**：
- `input-hash.test.ts` — 5 条（确定性、工作目录盐、顺序无关、kind 区分、截断）
- `cost-estimator.test.ts` — 3 条（每 level 正数、L0<L3、skip 生效）
- `router-memory.test.ts` — 10 条（序列化/解析/extractSection + 记录/查找/过滤/LRU/重复键取新）
- `llm-router-tools.test.ts` — 8 条（fountain 标题、markdown、CJK、asset 聚合、kind 过滤、无 AssetLibrary 降级、cost 估算、ask_user deferred）
- `llm-router.test.ts` — 9 条（首轮提交、tool 循环、缓存命中、clearCache、无提交、chat 异常、iteration 耗尽、memory 记录 + textLength）
- `router.test.ts` 新增 6 条集成：LLM ambiguous 路由、committable 跳过 LLM、disableLlmRouter 覆盖、LLM undefined 降级、memory 命中（provenance: memory）、memory miss 降级

**范围裁剪**（Phase 3.5 补上）：
- `ask_user` 工具返回 `{ status: 'deferred' }`，Phase 3 MVP 不弹 webview 问用户；Phase 3.5 接入交互 UI
- LLMRouter modelId 默认未指定 → 走 ModelSelector 首个可用 chat 模型；后续可加 "fast" capability 标签专选 Haiku

### Phase 2 remainder 交付物（已合并）

**Platform Plan 层**：
- `plan/plan-forker.ts` — pure `forkPlan(source, options)`；新 id + `parentPlanId` 线缆 + `resetToOriginal` 选项清除 `userConfirmed`
- `plan/plan-diff.ts` — pure `diffPlans(left, right)`；按 route / stages / shots / constraints 分类
- `plan-editor.ts` 新 `toggleStageCheckpoint(plan, input)` — 翻转 `userCheckpoint`，忽略 skipped stages
- LitePlan 扩展 `parentPlanId?`，PlannedStage 扩展 `userCheckpoint?`
- `persistence-types.ts` 双向保留两字段
- 15 条新单测（5 forker + 5 diff + 5 checkpoint）

**Pipeline 层**：
- `PipelineConfig.userCheckpoints?: string[]` — 显式 gate override
- `PipelineExecutor` 合并 `userCheckpoints` ∪ `gate === 'confirm'` 判定暂停
- 2 条新 executor 单测（强制 checkpoint、skipped stage 跳过）

**Extension 层**：
- `OrchestratorBootstrapOptions.startPipeline` 接收 `userCheckpoints`；`startRoutedPipeline` 从 `plan.stages[].userCheckpoint` 聚合并下发
- `RoutedPipelineRequest.plan` 支持直接调度已有 plan（forked 场景）
- `workflow-plan-handler.ts` 新增 `handleToggleCheckpoint` / `handleFork` / `handleDiffRequest`；`toWirePlan` 传递 `userCheckpoint` + `parentPlanId`；`toWireDiff` 转换 diff 负载
- 6 条新 handler 单测

**Agent-types 层**：
- 新消息：`workflow/planToggleCheckpoint`、`workflow/planFork`、`workflow/planDiffRequest`（webview → ext）
- 新消息：`workflow/planDiff`（ext → webview）
- 新 payload：`WorkflowPlanDiffPayload` + 4 组 diff 变更类型

**Webview 层**：
- `PlanDiffView.tsx` — 折叠式 route/stages/shots/constraints 差异视图
- `WorkflowPlanCard.tsx` 新增每-stage `CheckpointToggle` + 终态 Fork/Diff 按钮
- `WorkflowPlanPanel.tsx` 在终态渲染 Fork/Diff 按钮并嵌入 `PlanDiffView`
- `useWorkflowPlan` 增加 `diff` / `diffError` / `dismissDiff`

本文档是 Workflow Orchestration ADR 家族的**可执行实施计划**。按新的分层 ADR 结构组织，支持并行 track 推进。

---

## 1. 背景

Workflow Orchestration 原本是一份 16 节的大 ADR，2026-04-18 重构为 5 份聚焦 ADR + 2 份已有 ADR 扩展。详情见 umbrella：[workflow-orchestration.md](../architecture/workflow-orchestration.md) §8。

本计划基于分层结构，把实施拆分为**3 条核心层 track + 3 条横向子系统 track**，支持并行推进。

## 2. 现状盘点（~70% 基础设施已就绪）

| 已存在 | 文件位置 |
|--------|---------|
| PipelineExecutor（事件队列/门控/迭代器） | [packages/neko-agent/packages/agent/src/pipeline/pipeline-executor.ts](../../packages/neko-agent/packages/agent/src/pipeline/pipeline-executor.ts) |
| L2 六阶段 pipeline | [packages/neko-agent/packages/agent/src/pipeline/stages/](../../packages/neko-agent/packages/agent/src/pipeline/stages/) |
| PlanModeHandler（315 行已存在） | [packages/neko-agent/packages/extension/src/chat/handlers/planModeHandler.ts](../../packages/neko-agent/packages/extension/src/chat/handlers/planModeHandler.ts) |
| CapabilityDiscoveryService | [packages/neko-agent/packages/extension/src/services/capabilityDiscoveryService.ts](../../packages/neko-agent/packages/extension/src/services/capabilityDiscoveryService.ts) |
| FileProjectMemoryManager | [packages/neko-agent/packages/agent/src/memory/project-memory-manager.ts](../../packages/neko-agent/packages/agent/src/memory/project-memory-manager.ts) |
| CharacterRegistry SSOT | [packages/neko-types/src/types/character-registry.ts](../../packages/neko-types/src/types/character-registry.ts) + `.neko/characters.json` |
| CreativeEntityGraph | [packages/neko-types/src/types/creative-entity-graph.ts](../../packages/neko-types/src/types/creative-entity-graph.ts) + `.neko/.cache/asset-graph.json` |
| AssetManifest + IAssetHandler | [packages/neko-types/src/types/asset/manifest.ts](../../packages/neko-types/src/types/asset/manifest.ts) + [registry.ts](../../packages/neko-types/src/types/asset/registry.ts) |
| NekoStoryAPI | [packages/neko-story/packages/extension/src/extension.ts](../../packages/neko-story/packages/extension/src/extension.ts) |
| MediaGenerationService | [packages/neko-agent/packages/platform/src/media/media-generation-service.ts](../../packages/neko-agent/packages/platform/src/media/media-generation-service.ts) |
| BatchGenerationScheduler（canvas 批生成） | [packages/neko-canvas/packages/extension/src/services/batchGenerationScheduler.ts](../../packages/neko-canvas/packages/extension/src/services/batchGenerationScheduler.ts) |
| PathResolver | [packages/neko-types/src/path/resolver.ts](../../packages/neko-types/src/path/resolver.ts) |
| CLIP 推理（Rust） | [packages/neko-engine/packages/runtime-ml/src/ml/clip.rs](../../packages/neko-engine/packages/runtime-ml/src/ml/clip.rs) |
| 格式 SDK 模式 | [packages/neko-types/src/nkv/codec.ts](../../packages/neko-types/src/nkv/codec.ts) |
| Ablation Toggles 框架 | [docs/architecture/ablation-experiment-framework.md](../architecture/ablation-experiment-framework.md) |

## 3. Track 结构（分层并行）

每个 track 对应一份 ADR，独立推进不互相阻塞。

```
┌───────────────────────────────────────────────────────────────┐
│ Phase 0: ADR Refactor ✅ 已完成 (2026-04-18)                   │
└───────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────┬──────────────────────────────────┐
│ 核心层 Tracks            │ 横向子系统 Tracks                 │
│  A. workflow-routing     │  C. asset-knowledge-graph         │
│  B. plan-mode            │  D. cross-modal-matching          │
│  (P. pipeline 只需扩展)  │  E. creative-consistency          │
└──────────────────────────┴──────────────────────────────────┘
                           ↓
┌───────────────────────────────────────────────────────────────┐
│ 基建 Tracks                                                   │
│  F. CLIP TS binding (runtime-ml 扩展)                          │
│  G. .nkplan / .nkproj 格式（format-strategy 扩展）              │
│  H. Reference Chain + 3 模式（agent-media 扩展）                │
└───────────────────────────────────────────────────────────────┘
```

### 依赖矩阵

| Track | 依赖 |
|-------|-----|
| A Workflow | 无（核心入口）|
| B Plan | A (MVP 的 LitePlan 需要 Route 输入) |
| C AssetLibrary | 无（独立子系统）|
| D Matching | C (读 AssetLibrary 候选) |
| E Consistency | C (读 BindingHistory) |
| F CLIP | 无（引擎侧独立）|
| G Format | 无（types 包独立）|
| H Reference Chain | C + E（扩展 ShotCharacter）|

**并行度**：A / C / F / G 可立即启动；B / D / E 在 MVP 后接入。

## 4. Phase 1 MVP（4-8 周）— 文件级任务

**目标**：端到端链路打通——Router 选路径 → Plan 卡片展示 → MatchingEngine 填绑定 → 跑既有 Pipeline。零破坏现有 `neko.pipeline.start` / `neko.agent.generateForNode` / `BatchGenerationScheduler`。

### Track A（Workflow Routing）MVP

**目标**：规则层 Router 跑通，LLM Router 留待 Phase 3。

**新建**（`packages/neko-agent/packages/platform/src/workflow/`）：

- `index.ts` / `types.ts` — `ProbeContext` / `FastProbeResult` / `RouteLevel` / `Route` 等契约（对齐 [workflow-routing.md](../architecture/workflow-routing.md) §5）
- `router/input-probe.ts` — `InputProbe.analyze(input): Promise<ProbeContext>`；复用 [DocumentReaderService](../../packages/neko-agent/packages/extension/src/services/DocumentReaderService.ts)
- `router/fast-probe.ts` — 纯函数，覆盖 [workflow-routing.md §5](../architecture/workflow-routing.md) 规则表
- `router/route-registry.ts` — `RouteLevel → { flowId, skipStages, defaultStageParams }`
- `router/index.ts` — `Router.decide()` facade
- `__tests__/fast-probe.test.ts` — 表驱动单测（每条规则一个 case）

**修改**：

- [packages/neko-agent/packages/platform/src/index.ts](../../packages/neko-agent/packages/platform/src/index.ts) — re-export `./workflow`
- [packages/neko-agent/packages/extension/src/bootstrap/serviceBootstrap.ts](../../packages/neko-agent/packages/extension/src/bootstrap/serviceBootstrap.ts) — 注册 Router 到 DI
- [packages/neko-agent/packages/extension/src/pipeline/pipeline-bootstrap.ts](../../packages/neko-agent/packages/extension/src/pipeline/pipeline-bootstrap.ts) — 新增 `startRoutedPipeline(input, userOverride?)`
- [packages/neko-agent/packages/extension/src/index.ts](../../packages/neko-agent/packages/extension/src/index.ts) — 注册命令 `neko.agent.startRoutedPipeline`；feature flag 下委托 `neko.pipeline.start`

**Feature Flag**：`workflow.orchestrator.enabled`（默认关）→ 通过 Ablation Toggles 控制

**验证**：20 条表驱动单测 + E2E 拖入 `.fountain/.nkc/.nkv/prompt/images` 验证 route level

**估时**：2-3 周

### Track B（Plan Mode）MVP — LitePlan 阶段

**目标**：内存态 LitePlan + chat 卡片；`.nkplan` 持久化留 Phase 2。

**新建**：

- `workflow/plan/lite-plan.ts` — `LitePlan` 类型（[plan-mode.md §5](../architecture/plan-mode.md) 精简版）
- `workflow/plan/plan-builder.ts` — `PlanBuilder.fromRoute(route, probe): LitePlan`
- `webview/src/features/plan-card/PlanCard.tsx` — 卡片组件：Start / Override / Edit

**修改**（复用已有 315 行 PlanModeHandler）：

- [planModeHandler.ts](../../packages/neko-agent/packages/extension/src/chat/handlers/planModeHandler.ts) — 添加 `presentRoutePlan(route, probe)`，emit `{ type: 'plan/preview' }`
- [chatProvider.ts](../../packages/neko-agent/packages/extension/src/chat/chatProvider.ts) — 新消息 `plan/preview` / `plan/approve` / `plan/override`

**验证**：拖 `novel.txt` → 卡片显示 L3 → Start 跑 pipeline → Override 切 L2

**估时**：2-3 周

### Track C（AssetLibrary）MVP — Level B

**目标**：只读 facade + BindingHistory 写入；Level C entity graph 优化留 Phase 2。

**新建**（`workflow/asset-library/`）：

- `types.ts` — `Entity` / `Asset` / `Relation` / `Binding`（对齐 [asset-knowledge-graph.md §3](../architecture/asset-knowledge-graph.md)）
- `index.ts` — `createAssetLibrary(deps)` facade 工厂
- `character-adapter.ts` — wrap [NekoStoryAPI.getCharacterRegistry](../../packages/neko-story/packages/extension/src/extension.ts) + `resolveCharacter`
- `entity-graph-adapter.ts` — 读 `<workDir>/.neko/.cache/asset-graph.json`
- `manifest-adapter.ts` — 遍历 AssetManifest
- `binding-history.ts` — **新增持久化**：`<workDir>/.neko/.cache/bindings.json`，`upsertBinding` / `findRecentBindingsFor`
- `__tests__/*.test.ts`

**零 schema 改动**。只读 wrap CharacterRegistry + CreativeEntityGraph + AssetManifest；唯一写入 `binding-history.ts`。

**验证**：`listEntities()` + `findAssetsForEntity('alice')` fixture 测试 + BindingHistory 并发写测试

**估时**：2-3 周

### Track D（MatchingEngine）MVP — L1 + L2 + L5

**目标**：规则层匹配器全部跑通；L3 CLIP / L4 LLM 留 Phase 4。

**新建**（`workflow/matching/`）：

- `types.ts` — `ShotBindings` / `BindingCandidate`
- `index.ts` — `MatchingEngine.matchShot()` / `matchPlan()`（算法见 [cross-modal-matching.md §3](../architecture/cross-modal-matching.md)）
- `explicit-matcher.ts` — L1，正则 `@character:alice`
- `name-matcher.ts` — L2，Dice Coefficient（vendor 小型实现，不引依赖）；复用 `NekoStoryAPI.resolveCharacter`
- `continuity-matcher.ts` — L5，读 `binding-history.ts`
- `__tests__/matching-engine.test.ts`

**复用**：`StoryShotPlan` / `StoryScenePlan` / `ShotCharacter[]`（[canvas.ts:245-284](../../packages/neko-types/src/types/canvas.ts)）

**验证**：3 fixture 脚本（显式标签、模糊名、跨镜连续）

**估时**：2-3 周

### Track B + D 联动：Plan 矩阵视图（只读）

**新建**：

- `webview/src/features/plan-matrix/PlanMatrix.tsx` — shots × [character, scene, action] + ✅/⚠️/❓ 角标
- `webview/src/features/plan-matrix/types.ts`

**修改**：[chatProvider.ts](../../packages/neko-agent/packages/extension/src/chat/chatProvider.ts) 加 `plan/matrix` 消息

**验证**：4-shot fixture → 4×3 矩阵，模糊代词 ❓

### Pipeline 层：仅新增调用入口

**修改**（零侵入）：

- [pipeline-bootstrap.ts](../../packages/neko-agent/packages/extension/src/pipeline/pipeline-bootstrap.ts) 新增 `startRoutedPipeline` 直接调用已有 `startPipeline`
- 现有 `PipelineExecutor` / Stages / 测试**全部不变**

### MVP 端到端 E2E 场景

**测试 fixture**：`test-fixtures/workflow/`

| 场景 | 输入 | 期望 |
|------|-----|------|
| E2E-1 | prompt `"make a short clip of a cat jumping"` | 卡片 L0、confidence>0.9、仅 `generate-pilot` stage 跑 |
| E2E-2 | `sample.fountain` | 卡片 L2、skipStages=[read-document]、跑 storyboard + batch |
| E2E-3 | `novel.txt` (3200 字) | 卡片 L3、矩阵显示 4 镜 × 2 角色、模糊代词 ❓ |
| E2E-4 | continuity fixture（shot_1 已绑 alice_casual）| shot_2 矩阵预填 alice_casual* (L5 星标) |
| E2E-5 | flag 关 → 跑旧 `neko.pipeline.start` | 行为完全不变 |

**MVP 总估时**：4-8 周（1-2 名工程师并行）

## 5. Phase 2+ Track 展开

### Track A（Workflow）Phase 2-3

**Phase 2（4 周）**：路由记忆闭环

- `workflow/memory/router-memory.ts` — 读写 `.neko/memory.md` 专属 H2 section
- 会话内决策缓存 + 输入 hash

**Phase 3（8-10 周）**：LLM Router

- `router/llm-router.ts` — Haiku 4.5 tool-using（工具：`analyze_text_structure` / `check_existing_assets` / `estimate_duration` / `ask_user` / `commit_route`）
- 路由预算 < 2s + AbortController 降级
- 成本估算器
- 灰度：`workflow.router.llm.enabled`

### Track B（Plan Mode）Phase 2-3

**Phase 2（6-10 周）**：`.nkplan` 持久化

- 格式 SDK 扩展：`packages/neko-types/src/nkplan/{codec,validator,migrator}.ts` + `schema/nkplan-v1.schema.json`（镜像 nkv/ 结构）
- `workflow/plan/plan-store.ts` — 写 `<workDir>/.neko/plans/<id>.nkplan`
- `workflow/plan/plan-state-machine.ts` — pending / approved / executing / paused / completed / aborted
- 矩阵可编辑：drag-drop 绑定、"apply to all"、"AI 补缺失"
- Plan fork / re-approve / diff viewer（复用 `types/diff.ts`）
- Checkpoint-aware pause：扩展 `PipelineExecutor` gate handler 读 `.nkplan.stages[].userCheckpoint`

### Track C（AssetLibrary）Phase 2-3

**Phase 2（4 周）**：Level C 实体图优化

- 反向索引：`findShotsUsingAsset()` 高性能查询
- `resolveEntityByName` 深度优化（CJK + alias 图）
- GeneratedAssetIndex：按 `sourceNodeId` 反查

**Phase 3（4-6 周）**：Level D 反馈闭环

- 用户修正写入权重
- MatchingEngine 读权重调整优先级
- LRU 策略

### Track D（Matching）Phase 2-4

**Phase 4（10-14 周）**：L3 CLIP 集成 + L4 LLM 兜底

- 依赖 Track F（CLIP TS binding）
- `workflow/matching/semantic-matcher.ts` — CLIP 向量检索 + 嵌入缓存
- `workflow/matching/embedding-cache.ts` — `.neko/.cache/embeddings.idx` mmap 风格
- `workflow/matching/llm-matcher.ts` — Haiku 4.5 tool-using 兜底
- 灰度：`workflow.matching.semantic.enabled` / `workflow.matching.llm.enabled`

### Track E（Consistency）Phase 2-5

**Phase 2-3（6 周）**：基础检查

- `workflow/consistency/consistency-checker.ts`
- character_lock + time_progression + costume_continuity（[creative-consistency.md §2](../architecture/creative-consistency.md)）
- Plan 矩阵集成：Violation 栏

**Phase 5（10-14 周）**：Reference Chain

- 扩展 [canvas.ts:245-284](../../packages/neko-types/src/types/canvas.ts) `ShotCharacter.referenceChain: string[]`
- MediaGenerationService 按 chain 传递 referenceImages
- 三种链策略（顺序 / 锚定 / 混合）

### Track F（CLIP TS binding）Phase 3-4

**Phase 3-4（4-6 周）**：引擎侧扩展

- `packages/neko-engine/packages/host-napi/src/ml/clip_bridge.rs` + index.d.ts — napi 导出 `clip_image(bytes)` / `clip_text(tokenIds)`
- `packages/neko-engine/packages/host-api/src/ml/clip.ts` — TS wrapper
- BPE tokenizer 桥接（candidate: `js-tiktoken`）
- 绑定已有 [clip.rs](../../packages/neko-engine/packages/runtime-ml/src/ml/clip.rs)
- 新 ADR：`docs/architecture/runtime-ml-ts-binding.md`

### Track G（Format 扩展）Phase 2 + Phase 6

**Phase 2（与 Track B Phase 2 共建）**：`.nkplan` 格式

- 见 Track B Phase 2

**Phase 6（8-12 周）**：`.nkproj` 容器

- `packages/neko-types/src/nkproj/{codec,validator,migrator}.ts` + schema
- 引用而非内嵌 `.nks/.nkc/.nkv/.nkplan`
- Clip `lineage` 字段：扩展 [timeline.engine.ts](../../packages/neko-types/src/generated/timeline.engine.ts)（proto 源 + regen）加 `lineage { shotNodeId, generationId, planId }`
- ShotNode 加 `workflowPlanId`
- Lossless Upgrade adapter：L0 prompt → L1 skeleton → L2 `.nks`
- 扩展 [format-strategy.md](../architecture/format-strategy.md)

### Track H（Reference Chain + 2D/3D 模型）Phase 5

**Phase 5（10-14 周）**：模型三模式

- 2D puppet 集成：
  - 动画枚举器 via [runtime-puppet](../../packages/neko-engine/packages/runtime-puppet/) + host-napi
  - `workflow/model-inputs/puppet-importer.ts`
- 3D gltf 集成：
  - 骨骼 + 动画枚举器 via [runtime-scene](../../packages/neko-engine/packages/runtime-scene/)
  - `workflow/model-inputs/gltf-importer.ts`
- 三模式 UI（纯渲染 / 渲染+AI / reference-only）
- 新 stage：`packages/neko-agent/packages/agent/src/pipeline/stages/render-engine.ts`
- 扩展 [agent-media-architecture.md](../architecture/agent-media-architecture.md) — 三种生成模式章节

## 6. 关键文件索引（分包）

### `packages/neko-agent/packages/platform/src/workflow/` 全新

- `index.ts` / `types.ts`
- `router/{input-probe,fast-probe,route-registry,index}.ts`（P1）
- `router/llm-router.ts`（P3）
- `plan/{lite-plan,plan-builder}.ts`（P1）
- `plan/{plan-state-machine,plan-store}.ts`（P2）
- `asset-library/{index,types,character-adapter,entity-graph-adapter,manifest-adapter,binding-history}.ts`（P1）
- `matching/{index,explicit-matcher,name-matcher,continuity-matcher,types}.ts`（P1）
- `matching/{semantic-matcher,llm-matcher,embedding-cache}.ts`（P4）
- `consistency/consistency-checker.ts`（P2-3）
- `memory/router-memory.ts`（P2）
- `model-inputs/{puppet-importer,gltf-importer}.ts`（P5）
- `__tests__/*.test.ts`

### `packages/neko-agent/packages/extension/src/`

- [pipeline/pipeline-bootstrap.ts](../../packages/neko-agent/packages/extension/src/pipeline/pipeline-bootstrap.ts) — 新增 `startRoutedPipeline`（P1）
- [index.ts](../../packages/neko-agent/packages/extension/src/index.ts) — 新命令 + feature flag（P1）
- [bootstrap/serviceBootstrap.ts](../../packages/neko-agent/packages/extension/src/bootstrap/serviceBootstrap.ts) — 注入 Router/AssetLibrary/MatchingEngine（P1）
- [chat/handlers/planModeHandler.ts](../../packages/neko-agent/packages/extension/src/chat/handlers/planModeHandler.ts) — `presentRoutePlan`（P1），完整状态机（P2）
- [chat/chatProvider.ts](../../packages/neko-agent/packages/extension/src/chat/chatProvider.ts) — 新消息 `plan/preview`、`plan/matrix`、`plan/approve`（P1-P2）

### `packages/neko-agent/packages/webview/`

- `src/features/plan-card/PlanCard.tsx`（P1）
- `src/features/plan-matrix/{PlanMatrix.tsx,types.ts}`（P1 只读，P2 编辑）

### `packages/neko-types/src/`

- `nkplan/{codec,validator,migrator,schema/nkplan-v1.schema.json}`（P2）
- `nkproj/{codec,validator,migrator,schema/nkproj-v1.schema.json}`（P6）
- [types/canvas.ts](../../packages/neko-types/src/types/canvas.ts) — `ShotCharacter.referenceChain`（P5）+ `ShotCanvasNode.data.workflowPlanId?`（P6）
- [generated/timeline.engine.ts](../../packages/neko-types/src/generated/timeline.engine.ts) regenerate with `Clip.lineage`（P6）

### `packages/neko-engine/`

- `packages/host-napi/src/ml/clip_bridge.rs` + index.d.ts（P4）
- `packages/host-api/src/ml/clip.ts`（P4）
- `packages/runtime-puppet/` / `packages/runtime-scene/` 暴露动画枚举器（P5）

### `packages/neko-canvas/`

- [services/batchGenerationScheduler.ts](../../packages/neko-canvas/packages/extension/src/services/batchGenerationScheduler.ts) — P2+ 可选挂钩汇报到 `workflow.plan.bindings`；**P1 零改动**

## 7. 验证策略

### Phase 1 MVP E2E 场景

**fixture 目录**：`test-fixtures/workflow/`

| ID | 场景 | 关键验证点 |
|----|-----|---------|
| E2E-1 | prompt → L0 直出 | confidence>0.9、`.neko/memory.md` 无新 entry |
| E2E-2 | `.fountain` → L2 skip story | skipStages=[read-document] |
| E2E-3 | `novel.txt` → L3 full | 矩阵显示 4 镜 × 2 角色；`.neko/.cache/bindings.json` 新 entries |
| E2E-4 | continuity (L5) | shot_2 预填 alice_casual* 星标 |
| E2E-5 | 向后兼容 | flag 关 → 老命令行为不变；Canvas scheduler 不变 |

### 单测必须（合并前）

- `fast-probe.test.ts`：100% 规则表覆盖
- `name-matcher.test.ts`：正例/负例/CJK 别名
- `continuity-matcher.test.ts`：同场景 vs 跨场景阈值
- `binding-history.test.ts`：并发去抖写（参考 `project-memory-manager` 测试模式）
- `router/index.test.ts`：置信度分支
- 所有现有 `pipeline/__tests__/` 不变通过

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|-----|------|
| 改 pipelineBootstrap 破坏既有 L2 | 高 | Additive API（`startRoutedPipeline` 而非改 `startPipeline`）+ feature flag + CI 必须全绿 |
| `.nkplan` / `.nkproj` schema 抖动 | 中 | 镜像 nkv migrator 模式；P1 LitePlan 即带 `version` 字段；day one 就出 migrator v1 |
| CLIP 基建成本（P4）| 中 | Flag 门控 `workflow.matching.semantic.enabled`；复用 runtime-ml ONNX 无新二进制 |
| BindingHistory 无限增长 | 低 | 每 entity 500 条 LRU trim |
| Router 决策让用户困惑 | 中 | [workflow-routing.md §5](../architecture/workflow-routing.md) 原则：始终显示卡片 + reason |
| Canvas scheduler 与新 orchestrator 双队列 | 高 | 单路径：`neko.agent.generateForNode` 仍是叶节点；orchestrator 的 `batch-generate` stage 走同一命令 |
| LLM Router 超时卡 UI | 中 | 2s 硬预算；`AbortController` 降级到 FastProbe |
| 100+ 镜矩阵性能 | 中 | 虚拟滚动；绑定懒加载 |
| 横向 track 发展不均衡 | 中 | Track C/D/E 尽量按 MVP + Phase 2 对齐节奏推进；避免 CLIP 先上但无 AssetLibrary 支撑 |

## 9. Rollout 策略

### Feature Flag（复用 Ablation 框架）

见 [ablation-experiment-framework.md](../architecture/ablation-experiment-framework.md)。新增：

- `workflow.orchestrator.enabled` — P1 preview 默认关；P1 验收后默认开
- `workflow.plan.autoApproveThreshold` — 0..1，默认 0.95
- `workflow.matching.continuity.enabled` — 默认开
- `workflow.matching.semantic.enabled` — P4 前默认关
- `workflow.matching.llm.enabled` — P4 前默认关
- `workflow.router.llm.enabled` — P3 前默认关
- `workflow.consistency.enabled` — P2 后默认开

### 渐进迁移

| 步骤 | 变化 | 兼容性 |
|-----|------|-------|
| 0（今）| `neko.pipeline.start` → `startPipeline` | baseline |
| 1（P1）| 新增 `startRoutedPipeline`；旧命令不动；flag 默认关 | 100% 向后兼容 |
| 2（P1 末）| 新工作区默认开 flag | 老项目仍走旧路径 |
| 3（P2）| flag 开时 `neko.pipeline.start` 委托到 routed；legacy 保留 | 快速回滚 |
| 4（P3+）| 遥测 + metrics；legacy 标 deprecated | |
| 5（P6）| legacy 命令 `@deprecated`，次大版本移除 | |

### 不变契约

- `neko.agent.generateForNode` — 签名不变；orchestrator **使用**它
- `neko.agent.reportGenerationProgress` — 不变
- `BatchGenerationScheduler` — 不变；P2+ 可选订阅 orchestrator 事件
- `PipelineExecutor` gate/event/hook 契约 — 零改动
- `.neko/characters.json` — AssetLibrary 只读
- `.neko/.cache/asset-graph.json` — schema 不变
- `.neko/memory.md` — 仅追加新 H2 section

## 10. 立即可开始的任务（Phase 1，按 track 并行）

### Track A 任务（1 名工程师，2-3 周）

1. 创建 `packages/neko-agent/packages/platform/src/workflow/` 目录
2. 写 `types.ts`（契约优先）
3. 写 `router/fast-probe.ts` + 20 条表驱动测试
4. 写 `router/{input-probe,route-registry,index}.ts`
5. 扩展 `pipeline-bootstrap.ts` 加 `startRoutedPipeline`
6. 注册 `neko.agent.startRoutedPipeline` 命令 + feature flag

### Track B MVP 任务（1 名工程师，2-3 周，与 A 并行）

7. 写 `plan/lite-plan.ts` + `plan/plan-builder.ts`
8. 扩展 `planModeHandler.ts` 加 `presentRoutePlan`
9. 写 `PlanCard.tsx` webview 组件
10. 联调：Route → LitePlan → PlanCard

### Track C 任务（1 名工程师，2-3 周，独立并行）

11. 写 `asset-library/types.ts` + 4 个 adapter + `binding-history.ts`
12. 单测 + fixture

### Track D MVP 任务（1 名工程师，2-3 周，依赖 C）

13. 写 `matching/{explicit,name,continuity}-matcher.ts`
14. 写 `matching/index.ts` facade
15. 单测

### Track B + D 联动任务（1 名工程师，1-2 周）

16. 写 `PlanMatrix.tsx` webview 组件（只读版）
17. 联调：Route → LitePlan → Match → Matrix 显示

### MVP 集成测试（全员）

18. E2E-1..5 + 现有 `pipeline/__tests__/` 回归

## 11. 度量与验收

**Phase 1 MVP 验收标准**：

- [ ] 5 条 E2E 测试全绿
- [ ] `pnpm test` 现有测试零回归
- [ ] `pnpm check`（knip + dependency-cruiser）通过
- [ ] `pnpm build` 零 warning
- [ ] Feature flag 关闭时行为与改动前完全一致
- [ ] 手工测试：4 种典型输入（prompt/fountain/novel/images）路径正确
- [ ] 文档：每个新 ADR 的 §1-§5 核心章节在实现中可对应

**每个 track 独立验收**：单测覆盖率 ≥ 80%，公共 API 100% TSDoc。
