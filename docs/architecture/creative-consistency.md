# 创作一致性约束（ConsistencyChecker）

> ADR Status: Proposed
> Date: 2026-04-18
> Scope: 跨镜一致性规则引擎 + Reference Chain 机制
> Layer: **横向子系统**（被 Plan 层消费）

---

## 1. 背景

AI 视频生成的核心难题是**跨镜一致性**：

- 同一角色在镜头 1 和镜头 5 长相必须一致
- 同一场景的光线/时间不能突变（dawn → morning → night）
- 服装、发型不能无故切换

单纯依靠 MatchingEngine 的素材匹配**不足以保证一致性**——匹配对了参考图，生成结果仍可能漂移。需要**规则层**在 Plan 生成阶段检测冲突，并在生成执行阶段锁定参考。

**ConsistencyChecker 的职责**：
1. 接收 Plan 的 `bindings` + 候选项，验证约束
2. 发现冲突时生成 `Violation`，Plan UI 高亮
3. 执行阶段通过 **Reference Chain** 机制锁定角色/风格

**不属于 ConsistencyChecker 的**：
- 素材本身 → [asset-knowledge-graph.md](./asset-knowledge-graph.md)
- 匹配算法 → [cross-modal-matching.md](./cross-modal-matching.md)
- Plan 工件 → [plan-mode.md](./plan-mode.md)

## 2. 约束类型

### 2.1 character_lock（角色身份锁）

**规则**：同一 `entityId` 在锁定范围内必须用同一 asset variant。

```yaml
type: character_lock
entity: alice
scope:
  shots: [1, 2, 3, 4, 5]  # Scene 2 范围
  # 或 sceneGroupId: scene_2
lockedAsset: alice_casual_v2
allowedBreakConditions:
  - shot.tags.includes('character-change')
  - shot.scriptLine.matches('she changed clothes')
```

**违规例**：shot_3 的 character binding 变成 `alice_formal_v1` 而没有显式切换理由。

### 2.2 time_progression（时间推进）

**规则**：场景在时间维度上单调推进，不可倒流或跳跃。

```yaml
type: time_progression
entity: forest
sequence: [dawn → morning → noon → dusk → night]
shots: [1..10]
```

**违规例**：shot_5 从 `forest_dawn` 直接跳到 `forest_night`，中间没有场景切换（否则应标记为新 scene）。

### 2.3 costume_continuity（服装连续）

**规则**：除非剧本显式切换（"she changed clothes"），否则角色服装变体锁定。

```yaml
type: costume_continuity
entity: alice
attribute: outfit
value: 'casual'
shots: [1..5]
```

**违规例**：shot_2 和 shot_3 之间服装从 `casual` 变为 `formal`，但剧本无切换提示。

### 2.4 style_lock（风格锚定）

**规则**：整部作品或某 scene 的风格 reference 锁定。

```yaml
type: style_lock
styleAnchorAsset: style_ref_ghibli.png
scope: all  # 或 shots: [...]
```

### 2.5 prop_consistency（道具一致）

**规则**：关键道具（武器/饰品）跨镜保持。

```yaml
type: prop_consistency
entity: alice_sword
carrier: alice   # 属于 alice 角色
scope: shots: [3..8]
```

## 3. 约束自动推导

用户无需手填所有约束，ConsistencyChecker 从以下来源**自动生成**：

| 来源 | 推导出的约束 |
|------|-----------|
| 剧本场景标记（`EXT. FOREST - DAWN`）| time_progression |
| NekoStoryAPI.getCharacterRegistry | character_lock (per scene) |
| 分镜 `sceneGroupId` | 以 group 为范围的 character_lock |
| Plan 审查时用户确认的 binding | 锁定为该 shot 的 prop_consistency 源 |

**显式约束 > 自动约束**：用户在 Plan 里手填的约束优先级最高。

## 4. Reference Chain 机制

**问题**：即使 binding 正确（都指向 `alice_casual.png`），AI 生成时每次从同一参考图出发，结果仍可能每次不同（diffusion 的随机性）。

**解决**：**把首镜的生成结果作为后续镜头的 reference**，形成 reference chain：

```
shot_1: 用 alice_casual.png 作 reference → 生成 shot_1_output.jpg
shot_2: 用 shot_1_output.jpg 作 reference → 生成 shot_2_output.jpg
shot_3: 用 shot_2_output.jpg 作 reference（或 shot_1 保底）
...
```

**数据结构**：

```typescript
interface ShotCharacter {
  entityId: string
  referenceNodeId?: string       // 已有字段（neko-types/canvas.ts）
  referenceChain?: string[]      // 新增：有序 reference 列表
}
```

**策略选项**：
1. **顺序链**：每镜用上一镜结果（风险：误差累积）
2. **锚定链**：每镜都回到 shot_1 结果（稳定但可能僵硬）
3. **混合**：shot_1 结果 + 上一镜结果 双 reference（推荐）

**选择依据**：shot 间表情/姿态差异越大 → 越倾向锚定链。

## 5. Violation 结构

```typescript
interface Violation {
  id: string
  type: ConstraintType
  severity: 'error' | 'warning' | 'info'
  shotIds: string[]
  entity: EntityId
  message: string
  suggestions: ViolationFix[]   // 可一键应用的修复
}

interface ViolationFix {
  description: string
  action:
    | { type: 'replace-binding', shotId: string, slot: Slot, assetId: string }
    | { type: 'add-scene-break', beforeShot: string }
    | { type: 'accept-as-intentional', note: string }
}
```

## 6. 检测时机

| 时机 | 触发 | 作用 |
|------|-----|-----|
| **Plan 构建完成** | PlanBuilder.finalize() 前 | 在 UI 显示 plan 时已经标红冲突 |
| **用户编辑 binding** | 矩阵视图修改 | 实时反馈新冲突 |
| **执行 stage 开始前** | PipelineExecutor gate | 最后防线，严重冲突可 abort |

**不在生成过程中检测**：运行态检测会打断 pipeline，成本高。一致性应当在 Plan 阶段锁死。

## 7. UI 集成

Plan 矩阵视图基础上增加**约束栏**：

```
┌─ 约束（3 个冲突）──────────────────────────┐
│ ❌ Shot 2-3 角色服装切换无理由（character_lock）│
│    [替换为 alice_casual] [标记为 scene break] │
│                                              │
│ ⚠️  Shot 5 时间从 dawn 跳到 night（time_prog）│
│    [改为 dusk] [标记新场景]                   │
└──────────────────────────────────────────────┘
```

## 8. 实施分阶段

| 阶段 | 内容 | 状态 |
|------|-----|------|
| Phase A | character_lock 检测（最高价值） | ✅ 已完成 |
| Phase B | time_progression + costume_continuity | ✅ 已完成 |
| Phase C.1 | Reference Chain TS 契约 stub（`buildReferenceChain` + 三种策略 + 边界断点） | ✅ 已完成（2026-04-19）|
| Phase C.2 | Canvas `ShotCharacter.referenceChain` 字段 + `.nkplan.stages[].referenceChain` | ⏳ 待实施 |
| Phase C.3 | PipelineExecutor 消费 chain + MediaGenerationService 传参 | ⏳ 待实施 |
| Phase D | style_lock + prop_consistency | ⏳ 规划中 |
| Phase E | 自动推导（从剧本/场景自动生成约束） | ⏳ 规划中 |

### Phase C.1 实现索引

- [reference-chain/types.ts](../../packages/neko-agent/packages/platform/src/workflow/reference-chain/types.ts) — `ReferenceChainStrategy` (`sequential` / `anchored` / `hybrid`) + `ReferenceChainShot` + `ReferenceChainEntry` + `ReferenceChainBuilder`
- [reference-chain/reference-chain-builder.ts](../../packages/neko-agent/packages/platform/src/workflow/reference-chain/reference-chain-builder.ts) — pure `buildReferenceChain(shots, options)`
- 边界断点：`sceneGroupId` 切换 / `scene-change` tag / entity 切换 / 缺失 binding → 都会重启 anchor
- 每个 slot 独立成链（角色链与场景链互不影响）
- 契约已冻结：Phase C.2/C.3 可对着稳定类型实现，不会再回改 builder 接口

详见 [workflow-orchestration.md](./workflow-orchestration.md) Phase 5。

## 9. 与 Pipeline 执行的集成

**Pipeline 不需要感知 ConsistencyChecker**——约束在 Plan 层已经验证。Pipeline 只需：

1. 读 Plan 的 `stages[].bindings` 和 `stages[].referenceChain` 字段
2. 按 chain 顺序传递 reference image 给 MediaGenerationService
3. 保存生成结果到 GeneratedAsset，回填 chain 下一环

**MediaGenerationService 契约**：`generateImage({ prompt, referenceImages: [ref1, ref2] })` 已存在（见 [agent-media-architecture.md](./agent-media-architecture.md)）。

## 10. 反对的做法

- ❌ 运行态才做一致性检测（太晚，浪费生成成本）
- ❌ 把一致性规则塞进 MatchingEngine（违反单一职责）
- ❌ 自动回写 Plan 或 binding（应让用户决策）
- ❌ Reference Chain 默认顺序链（误差累积）
- ❌ 把 Reference Chain 数据藏在生成服务内部（应在 ShotCharacter 显式建模）

## 11. 相关 ADR

| 文档 | 关系 |
|------|-----|
| [plan-mode.md](./plan-mode.md) | Plan 的 `constraints` 字段由本组件填充；Violation 在矩阵 UI 高亮 |
| [asset-knowledge-graph.md](./asset-knowledge-graph.md) | 读 BindingHistory 判断 locked variant |
| [cross-modal-matching.md](./cross-modal-matching.md) | 本组件校验 MatchingEngine 的输出 |
| [agent-media-architecture.md](./agent-media-architecture.md) | Reference Chain 传递给 MediaGenerationService |
| [ai-video-reference-system.md](./ai-video-reference-system.md) | 视频参考系统（本 ADR 的视频域延展） |
