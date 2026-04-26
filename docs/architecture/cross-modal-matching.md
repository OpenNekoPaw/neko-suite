# 跨模态素材匹配（MatchingEngine）

> ADR Status: Accepted（Phase 1 规则层已实现；Phase 4 TS 契约 stub 已落地，Rust napi 绑定待实施）
> Date: 2026-04-18 / Updated 2026-04-19
> Scope: 剧本实体 ↔ 素材的自动绑定算法
> Layer: **横向子系统**（被 Plan 层的 PlanBuilder 消费）

---

## 1. 背景

创作者常同时提供异构多源素材：剧本（文本）+ 人物图/模型 + 场景背景 + 动作参考。系统需要把剧本第 X 行**绑定到**合适的素材：

- "Alice walks through the forest at dawn" → `alice_casual.png` + `forest_dawn.png` + `walk_loop.mov`

这是**跨模态对齐**问题：文本实体 → 图像/视频/模型素材。

**MatchingEngine 的职责**：给定一个 shot（含剧本文本、实体引用）和 AssetLibrary，输出**候选绑定**。

**不属于 MatchingEngine 的**：
- 素材数据模型 → [asset-knowledge-graph.md](./asset-knowledge-graph.md)
- 一致性校验 → [creative-consistency.md](./creative-consistency.md)
- Plan 本身 → [plan-mode.md](./plan-mode.md)

## 2. 五层匹配策略

匹配信号**从强到弱、成本从低到高**：

| 层级 | 策略 | 示例 | 置信度 | 成本 |
|------|------|------|-------|------|
| **L1 显式标记** | 剧本里 `@character:alice`、`@scene:forest_day` 标签 | 用户预先标注 | 0.98 | 零 |
| **L2 命名匹配** | 文件名 `alice_formal.png` 匹配剧本中的 "Alice" | 启发式 | 0.75 | 零 |
| **L3 语义匹配** | CLIP 图像嵌入 + 文本嵌入余弦相似度 | 找"红裙少女" | 0.60 | 中 |
| **L4 LLM 推理** | 给 LLM 剧本+素材清单，让它综合判断 | 最后兜底 | 0.70 | 高 |
| **L5 历史沿用** | 上一镜用了 AliceCasual，本镜大概率也用 | 时间连续性 | 0.90 | 零 |

**策略**：L1 + L5 是主力（准确且便宜），L3 作为实时搜索辅助，L4 兜底复杂场景。

## 3. 匹配算法

```typescript
async function matchShot(
  shot: Shot,
  library: AssetLibrary,
  previousShotBindings: Binding[]
): Promise<ShotBindings> {
  const candidates: ShotBindings = {}
  const refs = parseEntityRefs(shot.scriptLine)
  // e.g., { character: 'Alice', scene: 'forest', time: 'dawn' }

  for (const [slot, ref] of Object.entries(refs)) {
    // L5: 上一镜相同角色 → 强烈倾向复用
    const previous = findInPrevious(ref, previousShotBindings)
    if (previous && isContinuous(shot, previousShot)) {
      candidates[slot] = {
        primary: previous,
        alternatives: otherVariants(ref, library).slice(0, 3),
        provenance: 'L5',
        confidence: 0.90,
      }
      continue
    }

    // L1: 显式标记
    const explicit = library.assets.find(a =>
      a.entityId === ref.id && matchesTags(a, ref))
    if (explicit) {
      candidates[slot] = { primary: explicit, provenance: 'L1', confidence: 0.98 }
      continue
    }

    // L2: 命名匹配
    const nameMatch = fuzzyNameMatch(ref, library.assets)
    if (nameMatch.confidence > 0.8) {
      candidates[slot] = { primary: nameMatch.asset, provenance: 'L2', confidence: nameMatch.confidence }
      continue
    }

    // L3: CLIP 语义匹配（可选）
    if (clipEnabled) {
      candidates[slot] = await semanticSearch(ref, library.assets, { topK: 3 })
      if (candidates[slot].confidence > 0.6) continue
    }

    // L4: LLM 兜底（低频）
    candidates[slot] = await llmMatch(ref, library, shot)
  }

  return candidates
}
```

## 4. 置信度与候选

每个 slot 返回**主候选 + 备选**：

```typescript
interface BindingCandidate {
  primary: Asset
  alternatives: Asset[]      // 供用户切换
  provenance: 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
  confidence: number
  reason?: string            // 可解释性（UI 显示）
}
```

Plan 矩阵视图按 confidence 着色：
- `≥ 0.9` → ✅ 绿色
- `0.6-0.9` → ⚠️ 黄色
- `< 0.6` → ❓ 红色（强制用户决策）

## 5. L1 ExplicitMatcher（显式标签）

**输入规范**：剧本中的内联标签

```
EXT. FOREST - DAWN [@scene:forest_dawn]

ALICE [@character:alice_casual]
   (looking up)
Where am I?
```

**实现**：预编译正则表 `/@(\w+):(\w+)/g`，O(n) 扫描。

**约束**：标签必须对应 AssetLibrary 中存在的 `entityId` 或 `asset.id`，否则降级到 L2。

## 6. L2 NameMatcher（命名模糊）

**算法**：Dice Coefficient（双字母组相似度），阈值 0.8。

**优化**：
- 预先构建 `tokenize(entity.aliases) → n-gram 索引`
- 复用 [NekoStoryAPI.resolveCharacter()](../../packages/neko-story/packages/extension/src/extension.ts) 的 alias 解析（不重复实现）

**例**：
- `"Alice"` → entity `alice` (aliases: `['爱丽丝', 'Alice', '主角']`) → confidence 1.0
- `"the forest"` → entity `forest` → confidence 0.9

## 7. L3 SemanticMatcher（CLIP 向量）

**依赖**：runtime-ml 的 CLIP（[clip.rs](../../packages/neko-engine/packages/runtime-ml/src/ml/clip.rs)）+ TS binding（见第 10 节）。

**流程**：
1. 导入素材时，预先计算 `clip_image()` 嵌入 → 存入 `.neko/.cache/embeddings.idx`（Float32 mmap-style 文件）
2. 查询时，`clip_text(ref.description)` 获取文本嵌入
3. 对该 entity 下所有 asset 的 image embedding 做余弦相似度，top-K

**缓存**：
- embedding 变更键 = `sha256(asset.path + asset.mtime)`
- 新素材导入时增量计算
- 批量导入支持并行（EngineClient 多路复用）

**何时启用**：
- L1+L2 已给出 confidence > 0.9 → 跳过 L3
- 否则作为第三优先级触发

## 8. L4 LLMMatcher（兜底）

**何时启用**：所有其他层 confidence < 0.6 时。

**策略**：给 LLM 结构化输入 + 工具调用：

```typescript
const llmMatchTools = [
  { name: 'list_candidates_for_slot', input: { slot, topK } },
  { name: 'read_asset_metadata', input: { assetId } },
  { name: 'commit_binding', input: { slot, assetId, reason } },
  { name: 'skip_slot', input: { reason } },
]
```

**约束**：
- 仅 Haiku 4.5（分类任务，小模型够用）
- 单次预算 ≤ 5 tool calls
- 超时降级到 UserAsk

## 9. L5 ContinuityMatcher（历史沿用）

**输入**：`AssetLibrary.findRecentBindingsFor(entityId, slot)` + 当前 shot 的 `sceneGroupId`。

**判断连续性**：
```typescript
function isContinuous(currentShot: Shot, previousShot: Shot): boolean {
  // 同 scene group
  if (currentShot.sceneGroupId === previousShot.sceneGroupId) return true
  // 相邻 shot 且无场景切换标记
  if (currentShot.index - previousShot.index === 1 &&
      !currentShot.tags?.includes('scene-change')) return true
  return false
}
```

**优先级最高**（除 L1 显式覆盖）：用户既然上一镜选了 `alice_casual`，本镜默认沿用。

## 10. CLIP TS Binding 依赖

**现状**：Rust 端 [clip.rs](../../packages/neko-engine/packages/runtime-ml/src/ml/clip.rs) 已有完整实现（ONNX Runtime，512-dim embedding）。

**缺口**：TS 端缺少 binding。

**需建**：
- `packages/neko-engine/packages/host-napi/src/ml/clip_bridge.rs` + index.d.ts — napi 导出 `clip_image(imageBytes)` / `clip_text(tokenIds)`
- `packages/neko-engine/packages/host-api/src/ml/clip.ts` — TS wrapper + BPE tokenizer（可用 `js-tiktoken` 或类似）
- Embedding 缓存层：`packages/neko-agent/packages/platform/src/workflow/matching/embedding-cache.ts`

**归属**：该 binding 是引擎侧能力，作为 runtime-ml TS 扩展 ADR 单独立项。MatchingEngine 是**消费方**。

## 11. API 契约

```typescript
interface MatchingEngine {
  matchShot(
    shot: Shot,
    library: AssetLibrary,
    context: MatchContext
  ): Promise<ShotBindings>

  matchPlan(
    plan: LitePlan | NkPlan,
    library: AssetLibrary
  ): Promise<PlanBindings>  // 批量 matchShot + 跨镜优化

  // 调试/可解释
  explain(binding: Binding): MatchExplanation
}

interface MatchContext {
  previousBindings: Binding[]
  enableLayers: ('L1' | 'L2' | 'L3' | 'L4' | 'L5')[]  // 灰度控制
  llmBudget?: number
}
```

## 12. 灰度与 Feature Flag

通过 Ablation Framework 控制：

- `workflow.matching.explicit.enabled` — 默认开
- `workflow.matching.name.enabled` — 默认开
- `workflow.matching.continuity.enabled` — 默认开
- `workflow.matching.semantic.enabled` — 默认关（L3 需 CLIP 基建）
- `workflow.matching.llm.enabled` — 默认关（L4 兜底）

## 13. 反对的做法

- ❌ 纯 LLM 匹配（无规则兜底，成本高 + 非确定性）
- ❌ 一上来就启用 L3+L4（基建不成熟时效果差）
- ❌ MatchingEngine 直接写回 AssetLibrary 以外的东西（越权）
- ❌ 静默提交低置信度 binding（应让 UI 标红让用户决策）

## 14. 实施分阶段

| 阶段 | 层级 | 依赖 | 状态 |
|------|-----|------|------|
| Phase A | L1 + L2 + L5（规则层）| AssetLibrary Level B | ✅ 已完成 |
| Phase B.1 | TS 契约 stub（`ClipProvider` / `EmbeddingCache` / L3 / L4） | — | ✅ 已完成（2026-04-19）|
| Phase B.2 | Rust napi 绑定（clip_bridge.rs + host-api/ml/clip.ts） | runtime-ml clip.rs 已就绪 | ⏳ 待实施 |
| Phase B.3 | L3 CLIP 端到端启用（模型分发 + 持久化缓存）| Phase B.2 + Registry 条目 | ⏳ 待实施 |
| Phase C | L4 LLMMatcher 生产 broker | LLM 预算基建 + Phase 3.5 ask 框架 | ⏳ 待实施 |
| Phase D | 权重学习 / 反馈优化 | BindingHistory 数据积累 | ⏳ 规划中 |

### Phase B.1 实现索引

- [matching/clip-provider.ts](../../packages/neko-agent/packages/platform/src/workflow/matching/clip-provider.ts) — `ClipProvider` 接口 + `UnimplementedClipProvider` / `InMemoryClipProvider` + `cosineSimilarity`
- [matching/embedding-cache.ts](../../packages/neko-agent/packages/platform/src/workflow/matching/embedding-cache.ts) — `EmbeddingCache` 接口 + `InMemoryEmbeddingCache`（LRU）
- [matching/semantic-matcher.ts](../../packages/neko-agent/packages/platform/src/workflow/matching/semantic-matcher.ts) — L3 实现，读 Asset.embeddings.clip → cache → provider
- [matching/llm-matcher.ts](../../packages/neko-agent/packages/platform/src/workflow/matching/llm-matcher.ts) — L4 实现 + `LLMMatchBroker` 契约 + `DisabledLLMMatchBroker`
- [matching/index.ts](../../packages/neko-agent/packages/platform/src/workflow/matching/index.ts) `createFullMatchingEngine()` — 可选装 L3/L4 的 builder
- Feature flags：`neko.workflow.matching.semantic.enabled` / `.llm.enabled`（默认关）

详见 [clip-ts-binding.md](./clip-ts-binding.md)。

## 15. 相关 ADR

| 文档 | 关系 |
|------|-----|
| [asset-knowledge-graph.md](./asset-knowledge-graph.md) | 提供 Asset / Entity / Binding 数据模型 |
| [plan-mode.md](./plan-mode.md) | PlanBuilder 调用 MatchingEngine 填充 bindings |
| [creative-consistency.md](./creative-consistency.md) | 基于 MatchingEngine 输出做一致性校验 |
| [agent-unified-workflow.md](./agent-unified-workflow.md) | IDC 计划构建阶段间接用 AssetLibrary |
| [clip-ts-binding.md](./clip-ts-binding.md) | L3 依赖的 Rust/TS 桥接契约与分阶段落地方案 |
