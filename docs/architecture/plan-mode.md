# Plan Mode：创作计划工件

> ADR Status: Accepted（Phase 1 + 2 全部已实现，见文末实现索引）
> Date: 2026-04-18
> Scope: `.nkplan` 持久化工件 + Plan Builder + 状态机 + 审查 UI
> Layer: **Plan**（区别于 Workflow 层 / Pipeline 层）

---

## 1. 背景

**Plan 层的职责**：把 Workflow 层选中的抽象路径（Route）具象化为「这次执行要做什么、用哪些素材、在哪里停下等用户」的**可 review 工件**。

**Plan 层不关心**：
- 「为什么选 L3 而不是 L2」— 这是 **Workflow 层** 的事
- 「如何把 text 切成 tokens 发给 LLM」— 这是 **Pipeline 层** 的事

**与 Workflow / Pipeline 的时态区分**：

| 层级 | 时态 | 对象 |
|------|-----|------|
| Workflow | 元（定义好就存在）| 流程模板 |
| **Plan** | **执行前**（可 review / 可编辑 / 可分叉）| **具体实例** |
| Pipeline | 执行中（事件流、进度）| 运行态 |

**类比 Terraform**：Workflow = 「基础设施更新流程」；Plan = `terraform plan` 输出（具体变更清单）；Pipeline = `terraform apply` 执行。

## 2. 为什么需要 Plan Mode

对 L2+ 复杂路径，单纯 chat 消息不够，需要完整的 **PLAN → EXECUTE** 两阶段模型：

| 场景 | 无 Plan Mode | 有 Plan Mode |
|------|-------------|-------------|
| L0 一句话生成 | ✅ 直出即可 | ❌ 多余 |
| L2 广告片（多阶段+高成本）| ❌ 一键执行风险大 | ✅ 预算/阶段/检查点预声明 |
| L3 短剧（跨会话）| ❌ 中途断点难恢复 | ✅ plan 持久化可续 |
| 团队协作 | ❌ 决策不可见 | ✅ plan 可 review |

## 3. 分级启用

与 Progressive Disclosure 原则一致，按路径复杂度分级启用：

```
L0 (直出)      → 无 Plan Mode，show result 即可
L1 (batch)     → 轻量 plan（bullet 列表 + 一键确认）
L2 (scripted)  → 完整 Plan（阶段+产物+预估+检查点）
L3 (full)      → 完整 Plan + 多轮迭代（用户可改 plan 重批）
L4 (visual)    → 完整 Plan + 视觉预览（mood board）
```

**触发规则**：

- 路径 ≥ L2 **自动进入** Plan Mode
- 用户显式说「帮我规划下」→ 强制进入（任何级别）
- 用户显式说「直接开始」→ 强制跳过（任何级别）
- 会话内勾选「不再询问」→ 记忆后自动跳过

## 4. 与 Claude Code Plan Mode 的关键差异

| 维度 | Claude Code | 创作工作流 |
|------|------------|-----------|
| 任务时长 | 单次会话 | 跨多次会话 |
| Plan 形态 | 会话内消息 | 持久化 `.nkplan` 文件 |
| 迭代性 | 一次性 | 多轮编辑 re-approve |
| 成本敏感 | 低 | 高（AI 生成消耗大）|
| Plan 受众 | 只有用户自己 | 可能团队共享 |
| 分叉 | N/A | 支持 A/B 对比多条路径 |

## 5. `.nkplan` 工件格式

Plan 持久化为项目内一等工件，不是一次性 chat 消息：

```yaml
version: 1.0
id: plan-2026-04-18-a1b2c3
createdAt: 2026-04-18T10:00:00Z
status: pending | approved | executing | completed | aborted
route:
  level: L2
  reason: "4 个场景 + 2 个角色需要一致性"
  confidence: 0.85
  hash: sha256(input+workDir)
stages:
  - id: script
    input: novel.txt
    expectedOutput: story/main.nks
    estimatedCost: { tokens: 8000, duration: 30s }
    checkpoints: [after_scene_split]
  - id: storyboard
    depends: script
    expectedOutput: canvas/shots.nkc
    estimatedCost: { tokens: 4000, duration: 20s }
  - id: generation
    depends: storyboard
    estimatedCost: { credits: 50, duration: 5min }
    userCheckpoint: true  # 生成后必须确认
artifacts:
  characters: []        # 从 AssetLibrary 查询（见 asset-knowledge-graph.md）
  styleAnchors: []
bindings:               # 每个镜头的素材绑定（由 MatchingEngine 填充）
  - shotId: shot_3
    character: { entityId: alice, asset: alice_casual.png, confidence: 0.95 }
    scene: { entityId: forest, asset: forest_dawn.png, confidence: 0.80 }
    alternatives: {}
    userConfirmed: false
constraints:            # 由 ConsistencyChecker 验证（见 creative-consistency.md）
  - type: character_lock
    entity: alice
    shots: [1..5]
    lockedAsset: alice_casual_v2
interventionPoints:
  - "script done → 用户确认场景划分"
  - "storyboard done → 用户确认分镜"
  - "first clip done → 用户确认风格"
```

**格式定义归属**：`.nkplan` 的 codec/validator/migrator 扩展 [format-strategy.md](./format-strategy.md)，文件位于 `packages/neko-types/src/nkplan/`。

## 6. Plan 生命周期状态机

```
pending (plan 已生成，待 review)
  ├─ approved (用户批准，进入 executing)
  ├─ edited (用户编辑后，回到 pending 重新 review)
  └─ aborted (用户放弃)

executing (按 stages 执行)
  ├─ paused (遇到 checkpoint，等待用户确认)
  │   ├─ resumed → executing
  │   └─ aborted
  ├─ completed (全部 stages 完成)
  └─ failed (某 stage 失败，记录原因)
```

**实现**：`packages/neko-agent/packages/platform/src/workflow/plan/plan-state-machine.ts`

## 7. Plan 审查 UI

### 矩阵视图（核心）

Plan 展示为**镜头 × 素材类型矩阵**，三色高亮：

```
镜头  | 人物          | 场景           | 动作          | 状态
------|--------------|---------------|--------------|------
#1    | ✅ Alice-C    | ✅ Forest-Dawn | ✅ walking   | 已确认
#2    | ✅ Alice-C*   | ⚠️ ?          | ✅ running   | 需补场景
#3    | ❓ Alice-?    | ✅ Cave        | ❓ ?         | 冲突
#4    | ✅ Alice-C    | ✅ Cave        | ✅ falling   | 自动
```

- ✅ 绿色：高置信度，无需介入
- ⚠️ 黄色：缺失素材，需补充或 AI 生成
- ❓ 红色：低置信度或冲突，必须用户决策
- `*` 表示来自连续性锁定（见 [creative-consistency.md](./creative-consistency.md)）

### 一键操作

- 「应用到所有镜头」— 用户改一个，相同实体全部同步
- 「让 AI 补齐缺失素材」— 触发素材生成
- 「采用连续性默认」— 接受连贯性提议
- 「从素材库搜索」— 打开 AssetLibrary 浏览器

## 8. Plan 迭代与分叉

- **编辑**：用户修改后 `status` 回到 `pending`，重新 review — 见 [plan-editor.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/plan-editor.ts)
- **分叉**：fork 产生新 plan（`parentPlanId` 保留线缆）；同一输入可产生多个 `.nkplan`（L1 快出 vs L3 精修），对比成本/质量 — 见 [plan-forker.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/plan-forker.ts)
- **Diff viewer**：对比两个 plan 的 route/stages/shots/constraints 差异；webview 内嵌展示 — 见 [plan-diff.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/plan-diff.ts) + [PlanDiffView.tsx](../../packages/neko-agent/packages/webview/src/components/ChatView/PlanDiffView.tsx)
- **Checkpoint**：用户在 matrix 列表可给任意未 skipped 的 stage 打 `userCheckpoint`；调度时 pipeline 在该 stage 完成后 gate 暂停（与原 `gate: 'confirm'` 合流），见 [pipeline-executor.ts](../../packages/neko-agent/packages/agent/src/pipeline/pipeline-executor.ts) 的 `userCheckpoints` 处理

## 9. 与 Workflow 层集成

```
Workflow.Router.decide(input) → Route {level, flowId, skipStages, stageParams}
                                    ↓
Plan.PlanBuilder.fromRoute(route, probe) → LitePlan (P1) / .nkplan (P2+)
                                    ↓
Plan.PlanStore.save() → <workDir>/.neko/plans/<id>.nkplan
```

**LitePlan vs .nkplan**：
- **LitePlan**：内存态，P1 MVP 使用，展示为 chat 卡片
- **.nkplan**：持久化文件，P2 起用，支持迭代/分叉

## 10. 与 Pipeline 层集成

```
Plan approved → dispatch to PipelineExecutor
    ↓
existing startPipeline(flowId, ctx, { skipStages, stageParams })
```

**关键不变**：`PipelineExecutor` 本身不感知 Plan 存在。Plan 只是**配置 pipeline 的参数来源**。

**检查点机制**：Plan 中的 `checkpoints[]` 映射到 `PipelineExecutor` 现有的 `gate: 'confirm'` 机制。

## 11. 与横向子系统集成

PlanBuilder 内部调用：

- **AssetLibrary**（[asset-knowledge-graph.md](./asset-knowledge-graph.md)）— 查询可用素材填充 `artifacts`
- **MatchingEngine**（[cross-modal-matching.md](./cross-modal-matching.md)）— 为每个 shot 生成 `bindings` 候选
- **ConsistencyChecker**（[creative-consistency.md](./creative-consistency.md)）— 验证 `constraints`，检测冲突

**所有权**：这些子系统**不属于** Plan 层，只被 Plan 层消费。

## 12. 自主搜索（关联素材库信息）

**默认行为**：接到输入后，Plan Builder **主动搜索**本项目素材库（不联外网）：

| 优先级 | 来源 | 触发条件 |
|-------|------|---------|
| P1 | 当前项目 `.neko/assets/` | 默认总是搜 |
| P2 | workspace 其他项目 | 用户授权过 |
| P3 | 全局库 `~/.neko/library/` | 用户显式触发 |
| P4 | 外部市场 / 在线 | 用户显式启用 |

**匹配率阈值** → 决定下一步：

| 匹配率 | 决策 |
|-------|-----|
| ≥ 80% | 直接进 Plan，缺失项标记为"待生成"/"待补充" |
| 40-80% | 进 Plan 但提示"还缺 N 个素材，是否搜 P2/生成/手动补充？" |
| < 40% | 主动询问："几乎无素材，先建基础素材库还是直接 AI 生成？" |

**三条红线**：
1. 搜索阶段**绝不自动生成**素材或消费 credits
2. 只定向查询（给定 entity → 找 asset），不主动"相关推荐"
3. P4 外部来源必须用户显式启用

## 13. 反对的做法

- ❌ 一上来就展示完整 Plan（违反 Progressive Disclosure，L0 场景冗余）
- ❌ Plan 在 chat 消息里临时拼接（应持久化为 `.nkplan`）
- ❌ Plan 批准后不可回滚（应支持 fork/re-approve）
- ❌ Plan 默默执行无检查点（应支持 intervention points）
- ❌ Plan 内嵌 AssetLibrary/MatchingEngine 实现（应引用消费）

## 14. 相关 ADR

| 文档 | 关系 |
|------|-----|
| [workflow-routing.md](./workflow-routing.md) | Plan 的上游：Route → PlanBuilder |
| [pipeline-execution.md](./pipeline-execution.md) | Plan 的下游：approved → PipelineExecutor |
| [asset-knowledge-graph.md](./asset-knowledge-graph.md) | PlanBuilder 查询素材 |
| [cross-modal-matching.md](./cross-modal-matching.md) | PlanBuilder 生成 bindings |
| [creative-consistency.md](./creative-consistency.md) | PlanBuilder 生成 constraints |
| [format-strategy.md](./format-strategy.md) | `.nkplan` 格式定义（本 ADR 前置）|
| [agent-media-architecture.md](./agent-media-architecture.md) | Plan 的 artifacts 引用 GeneratedAsset |

## 15. 实现索引（更新于 2026-04-18）

### Phase 1 — LitePlan + PlanBuilder + 交互卡片（已完成）
- [plan/plan-builder.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/plan-builder.ts) — Route → stages + shots + constraints
- [plan/types.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/types.ts) — `LitePlan` 在内存态的 shape
- webview `WorkflowPlanCard` / `PlanMatrix`（chat 卡片 + 可编辑 shot 矩阵）

### Phase 2 core — `.nkplan` 持久化 + 状态机 + ConsistencyChecker（已完成）
- [@neko/shared/nkplan](../../packages/neko-types/src/nkplan/) — Format SDK（codec + validator + migrator）
- [plan/plan-store.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/plan-store.ts) — FS adapter，写 `<workDir>/.neko/plans/<id>.nkplan`
- [plan/plan-state-machine.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/plan-state-machine.ts) — `pending → approved → executing → paused/completed/failed/aborted`
- [consistency/consistency-checker.ts](../../packages/neko-agent/packages/platform/src/workflow/consistency/consistency-checker.ts) — character_lock / time_progression

### Phase 2 matrix editing（已完成）
- [plan/plan-editor.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/plan-editor.ts) — `editBinding` / `applyToAll` / `toggleStageCheckpoint`
- 用户挑选替代素材 → live 重跑 ConsistencyChecker

### Phase 2 remainder — Fork + Diff + Checkpoint pause（已完成）
- [plan/plan-forker.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/plan-forker.ts) — 新 id + `parentPlanId` + 可选 `resetToOriginal`
- [plan/plan-diff.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/plan-diff.ts) — route / stages / shots / constraints 4 类差异
- [pipeline/types.ts](../../packages/neko-agent/packages/agent/src/pipeline/types.ts) 加 `PipelineConfig.userCheckpoints`；executor 合流到现有 gate 机制
- webview `PlanDiffView.tsx`、`CheckpointToggle`、终态 Fork/Diff 按钮
- webview `PipelineGatePanel.tsx` — 暂停态场景卡片 + Resume/Cancel；`useWorkflowPlan.pendingGate` 状态
- `pipelineTools.ts` 暴露 `registerActivePipeline` + `confirmPipelineGate` + `cancelPipelineGate` 给 webview 回调使用

### Plan 浏览器 + 列举（已完成）
- [plan/plan-store.ts](../../packages/neko-agent/packages/platform/src/workflow/plan/plan-store.ts) `listPlans(options)` / `listForks(parentId)` — 过滤 status/parentPlanId/limit，按 updatedAt 降序
- FileIOAdapter 可选 `readdir(dir)`；Node 用 `fs.readdir`，memory 扫 Map 键
- 线路消息：`workflow/planListRequest` ↔ `workflow/planList`；Handler `handleListRequest` + `toWirePlanListEntry`
- webview `PlanBrowser.tsx` — status chips + 每行 Fork/Diff；`WorkflowPlanCard` terminal 态加 "Browse plans" 按钮

### 编排器跨扩展协调（已完成）
- `neko.canvas.orchestrator.planStateChanged` 命令：agent `broadcastPlanState` 在 executing/paused/completed/aborted/failed 触发
- Canvas `BatchGenerationScheduler.setQuietMode(reason?)` 暂停 pump；live-scheduler registry 让多编辑器同步
- 目标：避免 canvas 批生成队列与 orchestrator 的 `batchGenerate` stage 重复消耗 credits

### PlanMatrix 虚拟滚动（已完成 2026-04-19）
- `useVirtualizedRows` 自研最小虚拟化 hook — 固定行高 + overscan + rAF 节流的 scroll listener（[useVirtualizedRows.ts](../../packages/neko-agent/packages/webview/src/hooks/useVirtualizedRows.ts)）
- [PlanMatrix.tsx](../../packages/neko-agent/packages/webview/src/components/ChatView/PlanMatrix.tsx) — 超过 `virtualizeThreshold`（默认 40 个镜头）切换为带 spacer 行的虚拟化视口，保留 `<table>` 语义
- 默认 `rowHeightPx=28`、`maxViewportPx=420`；header 显示 "Shot bindings (N · virtualized)" 标识
- 低于阈值时行为不变（完整表格），避免小 plan 引入不必要的滚动容器
- 目标：100+ 镜头矩阵不再触发 React 渲染长列表的性能悬崖
