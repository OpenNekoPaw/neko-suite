# 素材知识图谱（AssetLibrary）

> ADR Status: Proposed
> Date: 2026-04-18
> Scope: 统一的素材实体图谱 facade，wrap CharacterRegistry + CreativeEntityGraph + AssetManifest
> Layer: **横向子系统**（被 Plan / Matching / Consistency 消费）

---

## 1. 背景

Neko Suite 已有多套素材管理机制，但各自为政：

- **CharacterRegistry**（[types/character-registry.ts](../../packages/neko-types/src/types/character-registry.ts)）— 人物实体 SSOT（`.neko/characters.json`）
- **CreativeEntityGraph**（[types/creative-entity-graph.ts](../../packages/neko-types/src/types/creative-entity-graph.ts)）— 跨模态关系图（`.neko/.cache/asset-graph.json`）
- **AssetManifest**（[types/asset/manifest.ts](../../packages/neko-types/src/types/asset/manifest.ts)）— 统一素材清单 + Handler Registry
- **GeneratedAsset**（[types/generated-asset.ts](../../packages/neko-types/src/types/generated-asset.ts)）— AI 产出带溯源

消费方（Plan / Matching / Consistency）需要**统一 facade**查询「实体 X 有哪些 asset 变体」「某 asset 关联到哪些 shot」，而不关心底层存储分散。

**AssetLibrary 的职责**：提供 read-first facade，聚合上述四套机制为单一查询入口。

**不属于 AssetLibrary 的**：
- 素材匹配算法 → [cross-modal-matching.md](./cross-modal-matching.md)
- 一致性规则 → [creative-consistency.md](./creative-consistency.md)
- 路由决策 → [workflow-routing.md](./workflow-routing.md)

## 2. 渐进式四级成熟度

| 级别 | 元数据 | 能力 | 工作量 |
|------|-------|------|-------|
| **Level A (Naive)** | 仅文件名 + 文件夹 | 字符串/路径匹配 | 零 |
| **Level B (Tagged)** | manifest.json 标签 | 属性查询 + 名称模糊匹配 | 低 |
| **Level C (Entity Graph)** | 实体图（人物/场景/关系）| 语义查询 + 一致性约束 | 中 |
| **Level D (Learning)** | C + 用户修正反馈 | 自学习，越用越准 | 高 |

**起步从 B，演进到 C，Level D 留给后期**。

## 3. 数据模型

```typescript
interface AssetLibrary {
  entities: Entity[]        // 概念实体（Alice 这个人物）
  assets: Asset[]           // 具体素材（alice_formal.png 是 Alice 实体的表达）
  relations: Relation[]     // 关系（Alice 穿 RedDress；Forest 包含 Oak）
  bindings: Binding[]       // 历史绑定（shot_3 用了 alice_casual + forest_dawn）
}

interface Entity {
  id: 'alice'
  type: 'character' | 'scene' | 'action' | 'prop' | 'style'
  aliases: ['爱丽丝', 'Alice', '主角']
  attributes: { gender: 'female', age: 'young', style: 'fantasy' }
}

interface Asset {
  id: 'alice_casual_v2'
  entityId: 'alice'                 // 关联到实体
  path: 'assets/characters/alice_casual_v2.png'
  type: 'image' | 'video' | '3d-model' | 'puppet' | ...
  variants: { mood: 'neutral', outfit: 'casual', version: 2 }
  embeddings?: { clip: Float32Array }  // 可选，供 MatchingEngine L3 使用
  usedIn: ['shot_3', 'shot_7']        // 反向索引
  source: 'local' | 'git-lfs' | 'registry' | 'ai-generated' | 'remote'
}

interface Relation {
  from: EntityId
  to: EntityId
  type: 'wears' | 'contains' | 'interacts-with' | 'alias-of' | ...
}

interface Binding {
  shotId: string
  slot: 'character' | 'scene' | 'action' | 'prop' | 'style'
  assetId: string
  provenance: 'L1' | 'L2' | 'L3' | 'L4' | 'L5'  // 来自哪层 Matcher
  confidence: number
  userConfirmed: boolean
  timestamp: number
}
```

## 4. 实现分层

```
AssetLibrary (Facade)
├── CharacterAdapter     → wrap CharacterRegistryFile (只读)
├── EntityGraphAdapter   → wrap CreativeEntityGraph (只读)
├── ManifestAdapter      → wrap AssetManifest + Handler Registry (只读)
├── BindingHistory       → 新增持久化 .neko/.cache/bindings.json (append-only)
└── GeneratedAssetIndex  → 索引 GeneratedAsset.sourceNodeId 反查
```

**关键**：AssetLibrary 在 Phase 1 **只读包装** CharacterRegistry / EntityGraph / Manifest，**不修改 schema**，不回写。唯一写入点是 `BindingHistory`（用户修正后的绑定）。

**为什么只读**：用户手动整理的 `characters.json` 是创作者意图的 SSOT，系统不得擅自修改。

## 5. 同实体的多类素材并存

**关键洞察**：一个实体（如 Alice）可以**同时**有多种表达，互补而非互斥：

```
Entity: alice (character)
├── alice_2d_front.png      (2D 概念立绘)
├── alice_puppet.nkpup      (2D 骨骼，可做动画)
├── alice_3d.gltf           (3D 模型)
├── alice_voice.wav         (音色样本)
├── alice_walk.bvh          (动作捕捉)
└── alice_styleref.png      (风格锚点)
```

**MatchingEngine 根据生成意图选最合适**：

- 生成视频 → 优先 `alice_puppet.nkpup` 或 `alice_3d.gltf`（可动）
- 静态分镜 → `alice_2d_front.png`（快）
- 风格一致性锁定 → `alice_styleref.png`（作为 reference）

## 6. 文件类型到 Entity 的映射

| 文件扩展 | 类型 | 可关联实体类型 |
|---------|------|--------------|
| `.png/.jpg/.webp` | 静态图 | character / scene / prop / style |
| `.mp4/.mov/.webm` | 动态视频 | action / scene clip |
| `.gif/.apng` | 循环动画 | action / style |
| `.psd` | 多图层 2D | character / scene |
| `.nksk` | Sketch 工程 | character / scene |
| `.nkpup / .inp` | 2D 骨骼 | character |
| `.gltf/.glb/.fbx` | 3D 模型 | character / prop |
| `.obj/.stl` | 纯几何 3D | prop / scene |
| `.bvh/.vmd` | 动作捕捉 | action |
| `.wav/.mp3` | 音频 | voice / sfx / bgm |
| `.srt/.ass` | 字幕 | dialog |

## 7. 自动挂载策略

导入新素材时，AssetLibrary 尝试自动关联到已知 Entity：

1. **命名相似度**（最便宜）— 文件名 `alice_*.png` 尝试挂到 `alice` entity
2. **路径启发式** — `assets/characters/alice/` 下的都归 `alice`
3. **CLIP 语义匹配**（可选，Phase 4+）— 见 [cross-modal-matching.md](./cross-modal-matching.md) L3

**冲突处理**：
- 多候选时，置信度 < 0.8 → 标记为 `pending_assignment`，等用户确认
- 用户手动绑定后，写入 BindingHistory 学习

## 8. 查询 API

```typescript
interface AssetLibrary {
  // 实体查询
  listEntities(type?: EntityType): Entity[]
  getEntity(id: EntityId): Entity | undefined
  resolveEntityByName(name: string): Entity | undefined  // 复用 NekoStoryAPI.resolveCharacter

  // 素材查询
  findAssetsForEntity(entityId: EntityId, opts?: {
    type?: AssetType
    variant?: Partial<Variants>
    limit?: number
  }): Asset[]

  // 历史查询
  findRecentBindingsFor(entityId: EntityId, slot: Slot): Binding[]
  findSiblingShotBindings(shotId: string): Binding[]  // 同场景的其他镜头

  // 反向查询
  findShotsUsingAsset(assetId: string): ShotRef[]

  // 写入（仅 BindingHistory）
  upsertBinding(binding: Binding): Promise<void>
}
```

## 9. BindingHistory（唯一写入点）

**位置**：`<workDir>/.neko/.cache/bindings.json`

**特性**：
- Append-only 日志（供审计）
- LRU 上限 500 条/entity
- 并发安全：debounced write（参考 `FileProjectMemoryManager` 模式）
- 索引：`(entityId, slot) → [binding...]` 内存缓存

**用途**：
- MatchingEngine L5 (Continuity) 的数据源
- 用户修正反馈的持久层
- Level D Learning 的训练数据

## 10. 反馈闭环（通向 Level D）

用户在 Plan 审查时修正绑定 → 写入 `BindingHistory` → 下次相同输入特征时优先推荐。

**例**：用户纠正「Alice 在夜晚场景用 `alice_dark` 变体」→ 下次任何 `character:alice + scene:*_night` 组合自动推荐 `alice_dark`。

**实现**：Phase 4+，作为 MatchingEngine 的优先级权重输入。

## 11. 反对的做法

- ❌ AssetLibrary 回写 CharacterRegistry.json（破坏用户 SSOT）
- ❌ AssetLibrary 内含匹配算法（越权到 MatchingEngine）
- ❌ AssetLibrary 做一致性检查（越权到 ConsistencyChecker）
- ❌ Level D 自学习开局（数据不足反而错上加错）
- ❌ 把 AssetLibrary 设计为 workflow 专属（它是横向能力）

## 12. 实施分阶段

| 阶段 | 内容 |
|------|-----|
| Phase A | Level B：facade + 4 个 Adapter + BindingHistory |
| Phase B | Level C：entity graph 反向索引 + resolveEntityByName 深度优化 |
| Phase C | Level D：反馈闭环 + LRU + 权重调整 |

## 13. 相关 ADR

| 文档 | 关系 |
|------|-----|
| [plan-mode.md](./plan-mode.md) | Plan Builder 调用 AssetLibrary 查询 artifacts |
| [cross-modal-matching.md](./cross-modal-matching.md) | Matcher 依赖 AssetLibrary 读取候选 |
| [creative-consistency.md](./creative-consistency.md) | Checker 依赖 AssetLibrary 读取 bindings |
| [adr-character-unified-index.md](./adr-character-unified-index.md) | AssetLibrary 复用 CharacterRegistry 作为 character 实体源 |
| [agent-media-architecture.md](./agent-media-architecture.md) | GeneratedAsset 索引入 AssetLibrary |
| [format-strategy.md](./format-strategy.md) | AssetManifest 格式定义 |
