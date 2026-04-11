# ADR: 创作实体统一索引与跨模态绑定（人物优先）

## 状态

Accepted

## 当前实现进度（2026-04-12）

截至 2026 年 4 月 12 日，人物统一索引已完成 Phase 1–3，范围如下：

- 已新增共享 `characters.json` 契约、读写服务和名称解析工具
- 已为 `AssetEntity`、`GalleryNode`、`ShotCharacter`、`GeneratedAsset` 等承载层补充 `registryId` / `characterId` / `characterIds`
- 已打通 story -> canvas / storyboard payload 的 `characterId` 注入路径
- `PreviewPanel`、`neko-agent pipeline`、`canvas capability` 已统一通过 `NekoStoryAPI.resolveCharacter()` 优先解析角色绑定
- 画布图片 / 视频生成入口已统一继承 `characterIds` 与 `sourceNodeId` 到 media task / GeneratedAsset
- `neko-story` 已落地独立的 `CharacterWorkspaceIndexService`，并与 `WorkspaceIndexService` 分层组合
- `neko-story` 已新增 `CreativeEntityWorkspaceIndexService`，为角色定义 / 引用 / 悬停提供统一查询入口
- `neko-story` 已为剧本角色引用补充最小可用的 Rename / CodeAction 入口，显式重命名 `characters.json` 身份而不隐式改写剧本文本
- Fountain LSP 已支持基于注册表的 `Definition`、`References`、`Completion`、`Hover`、`WorkspaceSymbol`
- `NekoStoryAPI` 已暴露 `getCharacterRegistry()` 与 `resolveCharacter()` 供跨扩展复用
- `neko-story` 已新增“打开角色注册表”命令，可自动创建并打开工作区根目录 `characters.json`
- `neko-story` 已新增最小可用资产链接服务，可通过内部命令按角色 / 场景位置查找关联资产

Phase 3 新增（跨模态关系图与出现点索引）：

- 已引入 `CreativeEntityGraphService`，从 canvas/asset/generated-asset 构建 graph 节点和关系边，持久化到 `.neko/.cache/asset-graph.json`
- 已引入 `OccurrenceIndexService`，索引 GalleryNode/ShotCharacter/AssetEntity/GeneratedAsset 的 characterId 出现点
- 已引入 `CrossModalDataProvider`，通过 `NekoCanvasAPI.nodes.list()` + `neko.assets.getAllEntities` + generated index 采集跨扩展数据
- `CreativeEntityWorkspaceIndexService` 已组合 OccurrenceIndex + EntityGraph，`queryCharacter()` 返回跨模态 stats
- Hover 已展示 canvas nodes / asset entities / generated assets 计数
- Find References 已包含跨模态位置

当前尚未完成的部分：

- `scene / object / location / action` 仍停留在预留抽象，尚未形成与人物同级的 registry 链路
- `scene / object / location` 以及跨模态资产侧的 Rename / CodeAction 还没有正式切到统一实体层

## 关联

- [lsp.md](./lsp.md)
- [project-data-management.md](./project-data-management.md)
- [local-storage-strategy.md](./local-storage-strategy.md)
- [canvas-agent-integration.md](./canvas-agent-integration.md)

---

## 一、背景

当前仓库已经具备若干与“人物 / 场景 / 物品 / 动作”相关的局部能力，但它们还没有形成统一事实源：

- `neko-story` 可以从剧本中提取角色名、首次出现位置、出现在哪些 scene
- Asset Library 支持 `AssetEntity(category='character')`、`aliases`、`metadata.character`
- Asset Library 也支持 `environment`、`object`、`vehicle`、`effect` 等实体分类
- `neko-canvas` 有 `GalleryNode.characterName`、`ShotCharacter.characterName`、`referenceNodeId`
- `neko-canvas` 也有 `SceneGroupNode`、`ShotNode.visualDescription`、`characterAction`
- AI 生成资产会进入 `GeneratedAssetIndex`，但只记录 `id/path/prompt/model/type`

这些能力可以支持局部创作流程，但还不能稳定回答以下问题：

1. 剧本里的 `ALICE` 对应哪个角色实体？
2. 哪几张图片、哪几个视频片段、哪个 GalleryNode 属于同一个人物？
3. 某个场景、某个道具、某段动作在剧本、画布、素材之间如何稳定互跳？
4. 从剧本文名词或动词能否稳定 `Go to Definition` 到对应实体或语义节点？
5. 从一张角色图或一个道具素材能否稳定 `Find References` 反查到 scene / shot / gallery / generated asset？

根因不是“缺少 AI”，而是**缺少稳定的创作实体身份层**。当前多数链路依赖 `characterName`、文件名或 prompt 文本做弱关联，这不足以支撑 LSP 所要求的确定性。

---

## 二、问题定义

### 2.1 现状问题

| 问题 | 现状 | 影响 |
|---|---|---|
| 创作实体没有稳定 ID | 当前最明显的是人物仍主要依赖 `characterName` | 同名、别名、改名后容易断链 |
| 生成资产没有实体归属 | `GeneratedAsset` 不含实体级绑定字段 | 无法按人物/道具/场景聚合生成资产 |
| 画布绑定是节点级、非实体级 | `referenceNodeId` 指向节点，不指向统一实体身份 | 迁移和复用困难 |
| 自动匹配接口未落地 | `findSimilarEntities()` 目前基本为空实现 | “自动识别同一人物”不可用 |
| LSP 缺少统一索引层 | 剧本索引、资产索引、画布索引互相独立 | 无法做稳定的 Definition / References / Hover |

### 2.2 目标

本 ADR 解决的是：

- 为创作实体建立项目级稳定身份
- 打通剧本、资产、画布、生成资产之间的实体归属
- 为多模态 LSP 提供确定性的索引基础
- 明确“手工维护”和“自动匹配”的职责边界

本 ADR 不直接解决：

- 复杂的人脸识别模型选型
- 视频中多人物分段跟踪
- 自动台词分配与 speaker diarization 的最终算法

这些能力可以在后续阶段作为增强层接入，但不应成为 Phase 1 的阻塞项。

### 2.3 实体范围与优先级

并非所有“创作概念”都应按同一种方式建模。建议分层如下：

| 类型 | 例子 | 是否一等实体 | Phase 1 建议 |
|---|---|---|---|
| `character` | Alice、Bob | 是 | 立即落地 |
| `scene` | INT. OFFICE - DAY、Scene 12 | 是 | 与人物并行规划，次优先级 |
| `object` | 戒指、手枪、红伞 | 是 | 复用 AssetEntity，逐步接入 |
| `location` | 办公室、森林、咖啡馆 | 是，可视为 scene 子类或独立类 | 先从 scene 的 location 派生 |
| `action` | 推门、拥抱、开枪、奔跑 | 否，不建议作为静态资产实体 | 先做语义索引，不做独立注册表 |

结论：

- **人物、场景、物品**适合做稳定实体
- **动作**更像“事件 / 语义片段”，应先作为索引节点而不是资产注册表项
- 本 ADR 仍以人物为 Phase 1 切入点，但底层抽象必须兼容场景、物品、动作

---

## 三、决策

### 3.1 采用“通用实体抽象 + 人物优先落地”策略

本 ADR 的总体抽象不是“只有人物”，而是：

```ts
CreativeEntityKind =
  | 'character'
  | 'scene'
  | 'object'
  | 'location'
  | 'action';
```

但不同实体的生命周期不同：

- `character / scene / object / location` 适合进入稳定注册表
- `action` 更适合作为附着在 script line / shot / media segment 上的语义索引

因此本 ADR 采用：

- **统一抽象层**：Creative Entity / Semantic Node
- **首个落地点**：人物注册表
- **后续扩展**：场景、物品、地点
- **动作建模**：先做语义节点，不急于做独立 registry

### 3.2 采用“实体注册表 + 关系图 + 出现点索引”三层模型

本 ADR 不选择“只有实体表”或“只有关系图”的单一方案，而采用三层模型：

1. **实体注册表（Registry）**
   - 保存稳定、可人工维护、可提交 Git 的权威对象
   - 回答“它是谁”
2. **关系图（Graph）**
   - 保存实体与剧本、画布、资产、生成物、媒体片段之间的关系边
   - 回答“它和谁有关”
3. **出现点索引（Occurrence Index）**
   - 保存实体或动作在具体位置上的出现记录
   - 回答“它在哪出现过”

三层职责分离：

- Registry 负责身份与默认绑定
- Graph 负责跨模态关系查询
- Occurrence Index 负责精准定位与范围跳转

### 3.3 引入项目级 `characters.json` 作为人物事实源

新增一个**项目级、可提交 Git 的人物注册表**：

```text
<project>/characters.json
```

它是“人物身份”的唯一事实源，职责是：

- 为每个人物分配稳定 `characterId`
- 维护 `canonicalName` 与 `aliases`
- 记录人物的默认视觉/声音绑定
- 记录用户确认后的跨模态绑定

它**不是**运行时缓存，也**不是**自动推断结果堆积区。自动匹配产生的弱结论默认不直接写入这里，只有在用户确认或来源足够确定时才写入。

### 3.4 关系图是派生层，不替代权威层

关系图应记录如下信息：

- 实体与实体的关系
- 实体与资产的关系
- 实体与脚本位置、镜头节点、媒体片段之间的关系
- 关系来源、强弱、置信度

但关系图默认是**派生数据**，不应反过来替代 Registry 成为“身份真相源”。

规则：

- `Definition / Rename / 自动回写` 只信任强关系
- `Hover / 搜索增强 / 候选推荐` 可以展示弱关系

### 3.5 采用“手工确权，自动扩散”策略

核心决策：

- **人物身份必须可人工维护**
- **自动匹配只做建议层，不做权威层**
- **只有确定性来源才允许自动落库**

具体原则：

1. 用户手工创建/确认 `characterId`
2. 生成链路若已有明确人物上下文，可自动继承 `characterId`
3. 规则匹配和 AI 匹配只产出候选，不直接修改权威绑定

### 3.6 `characterId` 必须贯穿所有承载人物的结构

以下结构都应支持稳定的人物 ID：

- 剧本角色解析结果
- Asset Entity（角色实体）
- GalleryNode
- ShotCharacter
- GeneratedImage / GeneratedVideo / GeneratedAudio

`characterName` 继续保留，但仅作为展示名和输入友好层；真正的跨模态关联基于 `characterId`。

### 3.7 Phase 1 不依赖视觉语义模型

Phase 1 先建立结构闭环：

- 剧本角色名 -> `characters.json`
- `characters.json` -> 角色实体 / 画布节点 / 生成资产
- 多模态 LSP 基于结构索引工作

CLIP / face embedding / speaker embedding 属于 Phase 2+ 的建议增强层，不能替代 Phase 1 的结构绑定。

---

## 四、数据模型

### 4.1 `characters.json` 建议结构

```jsonc
{
  "version": 1,
  "characters": [
    {
      "id": "char_alice",
      "canonicalName": "ALICE",
      "displayName": "Alice",
      "aliases": ["艾丽丝", "小艾", "Alice"],
      "status": "confirmed",
      "metadata": {
        "role": "protagonist",
        "gender": "female",
        "ageRange": "20s",
        "notes": "主角，短发，冷色调服装"
      },
      "defaults": {
        "assetEntityId": "entity_hero_alice",
        "galleryNodeId": "gallery_node_01",
        "voiceAssetId": "asset_voice_alice_v1"
      },
      "bindings": {
        "assetEntityIds": ["entity_hero_alice"],
        "galleryNodeIds": ["gallery_node_01"],
        "generatedAssetIds": [],
        "scriptNames": ["ALICE", "Alice"]
      }
    }
  ]
}
```

### 4.2 建议 TypeScript 契约

```ts
interface CharacterRegistryFile {
  version: 1;
  characters: CharacterRecord[];
}

interface CharacterRecord {
  id: string;
  canonicalName: string;
  displayName?: string;
  aliases: string[];
  status: 'confirmed' | 'candidate' | 'deprecated';
  metadata?: {
    role?: string;
    gender?: string;
    ageRange?: string;
    notes?: string;
  };
  defaults?: {
    assetEntityId?: string;
    galleryNodeId?: string;
    voiceAssetId?: string;
  };
  bindings?: {
    assetEntityIds?: string[];
    galleryNodeIds?: string[];
    generatedAssetIds?: string[];
    scriptNames?: string[];
  };
}
```

### 4.3 各模块的最小字段扩展

#### 剧本索引

剧本索引本身仍可保留：

```ts
CharacterEntry {
  name: string;
  first_line: number;
  scene_ids: string[];
}
```

但在 LSP 解析阶段需要增加“名字 -> `characterId`”解析结果：

```ts
ResolvedCharacterOccurrence {
  name: string;
  characterId?: string;
  source: 'exact' | 'alias' | 'unresolved';
}
```

#### Asset Entity

角色实体建议增加显式绑定字段，而不是只靠 `name` / `aliases`：

```ts
interface CharacterMetadata {
  registryId?: string;
  role?: string;
  personality?: string[];
  voiceActor?: string;
  ageRange?: string;
  gender?: string;
}
```

#### Canvas

```ts
interface ShotCharacter {
  characterId?: string;
  characterName: string;
  referenceNodeId?: string;
  emotion?: string;
}

interface GalleryCanvasNode['data'] {
  characterId?: string;
  characterName?: string;
}
```

#### Generated Asset

```ts
interface BaseGeneratedAsset {
  id: string;
  path: string;
  prompt?: string;
  model?: string;
  characterIds?: string[];
  sourceNodeId?: string;
}
```

`characterIds` 允许：

- 单人物图像/视频：1 个 ID
- 群像镜头：多个 ID
- 环境或无人物素材：空

### 4.4 通用实体抽象

建议在人物注册表之上预留通用实体引用模型：

```ts
interface CreativeEntityRef {
  kind: 'character' | 'scene' | 'object' | 'location' | 'action';
  id: string;
  label?: string;
}

interface SemanticOccurrence {
  entity: CreativeEntityRef;
  source:
    | 'script'
    | 'canvas-node'
    | 'asset-entity'
    | 'generated-asset'
    | 'timeline-element'
    | 'media-segment';
  sourceId: string;
  range?: {
    start?: number;
    end?: number;
  };
}
```

实体与动作应区别建模：

- `character / scene / object / location` 主要回答“它是谁 / 它在哪里 / 它被谁引用”
- `action` 主要回答“发生了什么 / 出现在何时何处 / 关联了哪些角色和物品”

因此建议：

- 把动作建成 `SemanticOccurrence` 或 `ActionNode`
- 不把动作和静态资产实体完全等同

### 4.5 关系图模型

建议在现有 `AssetGraph` 思路之上，上升为 `CreativeEntityGraph`：

```ts
interface CreativeGraphNode {
  id: string;
  kind:
    | 'entity'
    | 'occurrence'
    | 'asset'
    | 'canvas-node'
    | 'script-range'
    | 'timeline-element'
    | 'media-segment'
    | 'generated-asset';
  refId?: string;
  label?: string;
}

interface CreativeRelationEdge {
  from: string;
  to: string;
  type:
    | 'alias-of'
    | 'depicts-character'
    | 'depicts-object'
    | 'set-in-scene'
    | 'appears-in-scene'
    | 'appears-in-shot'
    | 'references-entity'
    | 'performs-action'
    | 'uses-object'
    | 'voices-character'
    | 'generated-from'
    | 'derived-from'
    | 'default-visual-for';
  strength: 'confirmed' | 'inferred';
  confidence?: number;
  provenance?: 'user' | 'lineage' | 'rule' | 'ai' | 'import';
  metadata?: Record<string, unknown>;
}
```

设计原则：

- Registry 决定“身份”
- Graph 决定“连接”
- Graph 必须记录 `strength` / `provenance`
- 弱关系可用于推荐，不可直接污染权威层

### 4.6 出现点索引模型

出现点索引不是简单关系边，而是专门服务 LSP 精确跳转的数据层：

```ts
interface OccurrenceIndexEntry {
  entity: CreativeEntityRef;
  source:
    | 'script'
    | 'canvas-node'
    | 'asset-entity'
    | 'generated-asset'
    | 'timeline-element'
    | 'media-segment';
  sourceId: string;
  locator: {
    uri?: string;
    lineStart?: number;
    lineEnd?: number;
    nodeId?: string;
    elementId?: string;
    timeStart?: number;
    timeEnd?: number;
  };
}
```

用途：

- `Go to Definition` 之外的精确跳转
- `Find References` 的结果来源
- 悬停时展示“最近出现位置”
- 后续 Rename / Code Action 的安全范围计算

### 4.7 语义向量层模型

语义向量层不是 Registry 或 Graph 的替代物，而是额外的“近似检索层”。

它主要回答：

- “像不像”
- “语义上接不接近”
- “这段描述可能对应哪些历史素材”

而不直接回答：

- “它是谁”
- “它是否已经被确认绑定”

建议抽象：

```ts
interface SemanticVectorEntry {
  id: string;
  modality: 'text' | 'image' | 'video' | 'audio' | 'mixed';
  ref: CreativeEntityRef | { kind: 'occurrence'; id: string };
  vector: readonly number[];
  metadata: Record<string, unknown>;
}
```

建议索引粒度：

- `scene:<scriptPath>:<sceneId>`：剧本场次文本
- `asset:<entityId>:<variantId>`：资产描述文本或视觉 embedding
- `shot:<canvasId>:<nodeId>`：镜头描述与镜头图
- `generated:<assetId>`：AI 生成资产
- `segment:<mediaId>:<t0>-<t1>`：视频/音频片段
- `action:<sourceId>:<span>`：动作语义片段

设计原则：

- 向量层只用于**召回候选**
- 最终排序应结合 Graph 约束与 OccurrenceIndex 定位信息
- 向量结果默认属于 `inferred`，不直接写回 Registry

### 4.8 哪些关系需要向量化

适合向量化的关系：

- 剧本视觉描述 ↔ 图片 / 视频素材
- prompt ↔ 生成资产
- 人物形象一致性候选匹配
- 物品 / 场景的相似素材召回
- 动作文本 ↔ 镜头 / 媒体片段
- 台词 / 音频文本 ↔ 剧本对白

不应依赖向量化的关系：

- 已确认的人物身份绑定
- shot 明确引用 gallery / asset
- scene 与 SceneGroup 的显式映射
- 生成资产对 source node 的血缘继承

结论：

- **结构关系负责确权**
- **向量关系负责召回**
- **LSP 变更型能力只信任结构关系**

---

## 五、绑定优先级

为避免“自动匹配污染权威数据”，定义统一优先级：

| 优先级 | 来源 | 是否可自动写入权威层 | 说明 |
|---|---|---|---|
| P0 | 显式 `characterId` | 是 | 用户已确认或系统已有稳定绑定 |
| P1 | 生成链路继承 | 是 | 例如从已绑定 `ShotNode` / `GalleryNode` 生成 |
| P2 | 精确别名命中 | 否，默认待确认 | 名字可能冲突，仍需确认 |
| P3 | 规则匹配 | 否 | 文件名、标签、目录结构等 |
| P4 | AI/视觉/语音相似度 | 否 | 只做候选建议，不可直接确权 |

结论：

- **LSP 只信任 P0/P1**
- **UI 可以展示 P2/P3/P4 候选**
- **该规则对人物、场景、物品都成立；动作默认只进入建议和语义索引层**

进一步要求：

- Graph 边必须带 `strength`
- Registry 只能由 `confirmed` 关系或显式编辑更新
- Occurrence Index 可以同时接收 `confirmed` 与 `inferred`，但查询默认优先返回 `confirmed`

---

## 六、自动匹配策略

### 6.1 为什么不能全自动

LSP 的 `Definition / References / Rename` 需要稳定结果。如果系统把一个视频误识别为另一个人物：

- 跳转会跳错
- 引用统计会污染
- 批量替换和重命名可能产生破坏性后果

因此自动匹配在本架构中只能是“建议器”，不是“裁判”。

### 6.2 可自动继承的确定性场景

以下场景允许系统自动绑定 `characterId`：

1. 从带 `characterId` 的 `GalleryNode` 生成角色图
2. 从带 `characterId` 的 `ShotNode` 生成镜头图/视频
3. 资产明确导入到某个已绑定角色实体下
4. 用户在 UI 中执行“设为默认形象 / 设为该人物语音”

这些场景本质上不是“识别”，而是“沿血缘传播”。

### 6.3 只做建议的弱匹配场景

#### 名称与别名匹配

- 文件名包含 `alice_front.png`
- 目录名为 `characters/alice/`
- tags / aliases / prompt 中出现角色名

适合做第一轮过滤，成本低，但不能单独确权。

#### 图像建议匹配

后续可接入：

- face embedding
- CLIP image-text / image-image similarity
- 服装 / 发型 / 主色调等视觉特征

输出应为：

```ts
CharacterMatchSuggestion {
  characterId: string;
  confidence: number;
  reason: string[];
  source: 'name' | 'visual' | 'semantic' | 'lineage';
}
```

#### 视频建议匹配

视频不直接按整段识别，应按关键帧抽样：

1. 每 N 秒抽关键帧
2. 对关键帧做人脸或角色 embedding
3. 对全片做投票聚合
4. 输出人物候选列表与置信度

#### 音频建议匹配

音频建议可分两层：

- 文本层：ASR 后按剧本角色名/别名匹配
- 声纹层：speaker embedding 对齐角色声音样本

音频匹配更适合作为 `voiceAssetId` 或“配音候选”辅助工具，不应直接作为主视觉身份源。

### 6.4 非人物实体的匹配建议

#### 场景 / 地点

场景和地点建议优先使用结构信息，而不是视觉猜测：

- 剧本 `scene_id`
- `SceneGroupNode.sceneTitle`
- `location + time`
- timeline / storyboard 中的场次编号

场景是叙事锚点，优先依赖剧本和画布结构映射。

#### 物品 / 道具

物品建议以 Asset Library 为主：

- `AssetEntity(category='object' | 'vehicle' | 'effect')`
- tags / aliases / variant attributes
- script 中的名词命中
- shot / prompt 中的显式提及

重复出现、需要跨场景保持一致的道具应升级为稳定实体。

#### 动作

动作不建议先做独立注册表，而应从这些来源派生：

- 剧本 action line
- `ShotNode.characterAction`
- ASR / OCR / vision 提取出的事件片段
- timeline 中的时间片段标签

动作适合做：

- scene/shot/media-segment 级索引
- “Find References for action phrase”
- “在哪些镜头里发生过同类动作”

但不宜先做成与人物同级的静态资产实体。

### 6.5 语义关系与向量化边界

是否需要多模态向量化，取决于问题类型。

#### 不需要向量化也必须先做好的能力

这些能力属于 LSP 主干，必须由结构关系保证：

- 剧本人名跳到角色定义
- scene 跳到 SceneGroupNode
- object 跳到默认资产实体
- shot / gallery / asset 的显式引用反查
- 生成资产沿 source node 继承身份

这类能力依赖：

- Registry
- Graph
- OccurrenceIndex

而不应依赖向量相似度。

#### 需要向量化增强的能力

这些能力天然是“模糊语义查询”，适合向量层：

- “找所有压抑对峙感的场景”
- “这段视觉描述对应哪些历史图片/视频”
- “这张图可能是哪个人物 / 哪个道具”
- “这段视频里哪些片段和某个动作最接近”
- “这段音频最像谁在说”

因此本 ADR 的结论是：

- **LSP 主干不依赖向量**
- **语义关系增强需要向量**
- **多模态检索最终需要多模态向量**
- **身份确权不能只靠向量**

#### 推荐向量化顺序

1. 文本向量
   - scene 文本
   - prompt 文本
   - asset description
   - action phrase
2. 图像 / 视频向量
   - 图像 embedding
   - 视频关键帧 embedding
   - 人脸 / 角色 embedding
3. 音频向量
   - ASR 文本 embedding
   - speaker embedding

建议原因：

- 文本向量当前基础最好、成本最低
- 图像 / 视频向量对人物和场景一致性价值最高
- 音频向量价值高，但优先级低于图像 / 视频

---

## 七、多模态 LSP 行为定义

### 7.1 Go to Definition

#### 从剧本人名出发

优先跳转顺序：

1. `characters.json` 中的人物记录
2. 该人物的 `defaults.galleryNodeId`
3. 该人物的 `defaults.assetEntityId`

说明：

- 逻辑上的“定义”应是人物注册表，而不是任意某张图
- 画布和资产实体是人物的代表性形象入口

#### 从资产或 Gallery 出发

- 角色图 / 视频 / 语音资产可回跳到 `characters.json`
- GalleryNode 可回跳到角色记录

#### 从场景 / 物品 / 动作出发

- `scene` 的定义应优先回到剧本场次或 `SceneGroupNode`
- `object` 的定义应优先回到 Asset Entity 或默认道具绑定
- `action` 的定义应优先回到首次被确认的 script line / shot semantic node

### 7.2 Find References

从 `characterId` 反查：

- 剧本中的所有角色出现位置
- Scene / Shot / Gallery 节点
- 角色实体与其 variants/files
- 生成图 / 生成视频 / 生成音频

对其他实体也应支持同构查询：

- `sceneId` -> script scene / scene group / shots / generated storyboard assets
- `objectId` -> asset entity / scene / shot / generated assets
- `actionKey` -> script lines / shot nodes / video segments / audio segments

### 7.3 Hover

悬停人物时应展示：

- 规范名与别名
- 默认形象入口
- 角色出现的场景数 / 镜头数 / 资产数
- 最近生成的角色素材

### 7.4 Rename

人物重命名应区分两层：

- **身份不变，显示名变化**：修改 `canonicalName` / `displayName` / `aliases`
- **剧本文字替换**：单独作为 code action 或批处理，不自动隐式执行

原因：

- 角色身份和文本词面不是同一层
- 剧本可能故意保留旧称呼、昵称、不同语言名

---

## 八、架构分层

### 8.1 权威层

```text
Entity Registry
├─ characters.json
└─ future: entities.json
```

只保存稳定、人工确认后的身份与默认绑定。

### 8.2 派生索引层

```text
CreativeEntityWorkspaceIndex
├─ EntityRegistry
├─ CreativeEntityGraph
├─ OccurrenceIndex
├─ VectorStore (optional read path)
├─ ScriptWorkspaceIndex
├─ AssetLibrary
├─ Canvas document index
└─ GeneratedAssetIndex
```

负责拼装 LSP 查询视图，但不直接成为事实源。

其中人物是 Phase 1 的首个垂直切片，可先以 `CharacterWorkspaceIndex` 形式落地，再逐步提升为通用 `CreativeEntityWorkspaceIndex`。

### 8.3 图层

```text
CreativeEntityGraph
├─ entity -> entity
├─ entity -> occurrence
├─ entity -> asset
├─ entity -> generated-asset
└─ occurrence -> media-segment / canvas-node / script-range
```

负责跨模态邻域查询，但不单独承担权威身份管理。

### 8.4 出现点层

```text
OccurrenceIndex
├─ script line / scene range
├─ canvas node
├─ timeline element
└─ media segment
```

负责精准定位，优先服务 Definition / References / Hover。

### 8.5 向量召回层

```text
VectorStore
├─ TextEmbeddingIndex
├─ ImageEmbeddingIndex
├─ VideoKeyframeEmbeddingIndex
└─ AudioEmbeddingIndex
```

负责近似检索与候选召回，服务以下场景：

- 文本描述找相似 scene / prompt / asset / action
- 图片 / 视频找相似人物、场景、物品
- 音频找相似对白或说话人样本

约束：

- 只负责召回，不负责确权
- 检索结果默认属于 `inferred`
- 进入 LSP 写操作前必须经过 Graph / OccurrenceIndex / 用户确认的二次约束

### 8.6 建议层

```text
RuleMatcher / LLMClassifier / CandidateRanker
  -> reads VectorStore
  -> reads CreativeEntityGraph
  -> reads OccurrenceIndex
```

负责融合规则、血缘、向量召回结果，输出候选，不直接修改权威层。

### 8.7 推荐依赖方向

```text
UI / Provider
  -> CreativeEntityWorkspaceIndex
     -> EntityRegistry
     -> CreativeEntityGraph
     -> OccurrenceIndex
     -> VectorStore (semantic query only)
     -> WorkspaceIndexService
     -> AssetLibrary
     -> GeneratedAssetIndex
     -> Canvas APIs

Suggestion services
  -> CreativeEntityWorkspaceIndex (read-only)
  -> VectorStore
  -> EntityRegistry update command (explicit user confirm only)
```

---

## 九、与现有能力的对接方案

### 9.1 `neko-story`

- 保留现有 `ScriptIndex`
- 新增“角色名解析到 `characterId`”步骤
- 已引入独立 `CharacterWorkspaceIndexService`，不与 `WorkspaceIndexService` 混合建模
- `Definition / References / Completion / Hover / WorkspaceSymbol` 已优先使用注册表别名与规范名
- `NekoStoryAPI` 已开放 `getCharacterRegistry()` 与 `resolveCharacter()` 供跨扩展复用

### 9.2 `neko-assets`

- 角色实体增加 `registryId`
- import 时先跑分类，再尝试产出角色候选
- 只有用户确认后才把素材并入人物实体

### 9.3 `neko-canvas`

- `GalleryNode`、`ShotCharacter` 增加 `characterId`
- `import_script_to_canvas` 不再写死 `characters: []`
- 若脚本角色已在注册表中存在，导入时直接注入 `characterId`

### 9.4 `GeneratedAssetIndex`

- 增加 `characterIds` 与 `sourceNodeId`
- 生成完成时从 source node 继承人物身份

### 9.5 `AssetGraph`

建议将现有 `AssetGraph` 视为后续 `CreativeEntityGraph` 的子集，而不是平行体系。

最小演进路径：

1. 保持 `AssetGraph` 现有接口与持久化策略
2. 增加 entity / occurrence 相关节点类型
3. 增加创作语义关系边
4. 在不破坏现有 asset-only 使用方式的前提下，上升为 `CreativeEntityGraph`

可扩展关系边例如：

- `depicts-character`
- `voices-character`
- `references-character`
- `default-visual-for`
- `depicts-object`
- `set-in-scene`
- `occurs-in-action`

但这不应阻塞 Phase 1 的人物统一索引落地。

### 9.6 未来扩展到场景 / 物品 / 动作

- `scene`：优先从 `ScriptIndex.scenes[]` 和 `SceneGroupNode` 建稳定映射
- `object`：优先复用现有 Asset Entity 分类体系
- `location`：先作为 `scene.location` 的可索引字段，再决定是否升格为独立实体
- `action`：优先落在 script line / shot / media segment 级语义索引，不急于建独立 registry

---

## 十、方案比较

### 方案 A：纯手工维护

优点：

- 最稳定
- 最容易保证 LSP 正确性

缺点：

- 导入和整理成本高
- 大量历史资产归档效率低

### 方案 B：纯自动匹配

优点：

- 初期体验看似省事

缺点：

- 误匹配会污染所有 LSP 行为
- 无法支撑确定性的重命名与引用查询

### 方案 C：手工确权 + 自动建议 + 血缘继承

优点：

- 兼顾正确性与效率
- 与仓库现有能力最契合
- 适合逐步演进，不要求一次性引入重模型

缺点：

- 需要增加确认 UI 和绑定命令
- 需要维护一份项目级注册表

**决策：选择方案 C。**

---

## 十一、实施顺序

### Phase 1：结构闭环

- [x] 新增 `characters.json` 契约与读写服务
- [x] 为 `GalleryNode` / `ShotCharacter` / `GeneratedAsset` 增加 `characterId`
- [x] 增加 `CharacterWorkspaceIndex`
- [x] 剧本人名 `Definition / References` 接到人物注册表
- [x] `Completion / Hover / WorkspaceSymbol` 接到人物注册表
- [x] `NekoStoryAPI` 暴露角色注册表读取与解析能力

### Phase 2：生成链路打通

- [x] 生成资产模型支持 `characterIds` / `sourceNodeId`
- [x] Asset Entity 支持 `registryId`
- [x] `import_script_to_canvas` 基于注册表填充人物绑定
- [x] 生成资产在所有生成入口统一自动继承 `characterId`

### Phase 3：关系图与出现点索引

- [x] 引入 `CreativeEntityGraphService`（graph 节点/边构建 + 持久化到 `.neko/.cache/asset-graph.json`）
- [x] 引入 `OccurrenceIndexService`（跨模态出现点索引：canvas/asset/generated-asset）
- [x] 引入 `CrossModalDataProvider`（跨扩展数据采集层：canvas nodes + asset entities + generated assets）
- [x] `CreativeEntityWorkspaceIndexService` 组合 OccurrenceIndex + EntityGraph
- [x] References provider 返回跨模态引用（canvas/asset/generated 位置）
- [x] Hover provider 展示跨模态统计（canvas nodes / asset entities / generated assets 计数）
- [x] 共享类型 `@neko/shared` 新增 `creative-entity-graph.ts`（GraphNode / RelationEdge / GraphSnapshot）

### Phase 4：扩展到场景 / 物品

- 引入 `sceneId` / `objectId` 的统一引用模型
- script scene 与 `SceneGroupNode` 形成稳定绑定
- 物品实体接入 Asset Library 与 shot / generated asset 绑定

### Phase 5：规则匹配与文本向量

- 文件名 / aliases / tags 规则匹配
- 基于 prompt / source node / lineage 的建议
- 为 scene / prompt / asset description / action phrase 建文本向量索引
- UI 确认后写回注册表

### Phase 6：多模态向量增强

- 图像：face embedding / CLIP
- 视频：关键帧聚合匹配
- 音频：speaker embedding + ASR
- 让 VectorStore 支持人物 / 场景 / 物品 / 动作的多模态候选召回

---

## 十二、落地后的直接收益

落地后，多模态 LSP 将具备真正可用的“创作实体中心”能力，而人物是第一条跑通的主链：

- 剧本人名 -> 默认角色形象 / 角色实体
- 角色实体 -> 所有剧本出现位置 / Shot / Gallery / 图像 / 视频 / 语音
- 场景 -> 剧本场次 / SceneGroup / storyboard / 相关素材
- 物品 -> 资产实体 / scene / shot / generated asset
- 动作 -> script line / shot semantic node / media segment
- 关系查询 -> 可解释“为什么它们被视为同一对象或关联对象”
- 语义检索 -> 可回答“哪些素材在语义上接近，但尚未确认绑定”
- 画布生成链路保持人物一致性
- 角色改名不再依赖全仓库字符串碰撞
- 自动匹配不再直接污染权威关系

---

## 十三、后果与风险

### 正面后果

- 人物成为一等公民，而不是若干 `characterName` 字符串
- 场景、物品、动作也有清晰的扩展路径，不会卡死在“只有人物”的模型里
- 多模态 LSP 有了可验证、可测试的索引基础
- 语义检索与身份确权被清晰拆层，便于渐进接入多模态模型
- 资产管理与生成链路可以围绕人物聚合

### 风险

- 初期会引入一层新的项目元数据，需要迁移策略
- 老项目可能大量只有名字，没有稳定绑定
- 如果 UI 不足，用户可能不理解“候选”和“已确认”的区别

### 风险控制

- Phase 1 先做兼容模式：无 `characterId` 时按旧逻辑运行
- 所有自动匹配默认进入“候选态”
- 只允许显式确认或确定性血缘继承写入权威层

---

## 十四、结论

多模态 LSP 的关键不在于先上多强的模型，而在于先让“创作实体”成为稳定、可引用、可追踪的项目对象。

因此本 ADR 的最终结论是：

- 在抽象层采用 `Entity Registry + CreativeEntityGraph + OccurrenceIndex + VectorStore`
- 在落地层先用 `characters.json` 建立人物统一身份层
- 用 `characterId` 打通剧本、资产、画布和生成资产
- 为 `scene / object / location / action` 预留同构扩展路径
- 采用“手工确权，自动扩散”的策略
- 将自动匹配严格限制为建议层，不替代权威层
- 将向量层严格限制为语义召回层，不替代 Registry / Graph / OccurrenceIndex 的确定性职责

这是让“人物、场景、物品、动作”等创作要素真正进入统一 LSP 语义空间的最小可行路径，而人物是第一阶段最值得先打通的对象。
