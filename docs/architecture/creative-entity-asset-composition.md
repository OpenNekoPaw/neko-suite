# 创作实体与素材组合设计

> Status: Proposed
> Date: 2026-05-10
> Scope: 统一实体、素材实体、AI 形象生成、Live2D/Live3D 表现包、Story/Canvas/Agent/Live 引用方式
> Related:
> - [创作实体统一索引与跨模态绑定](./adr-character-unified-index.md)
> - [素材知识图谱](./asset-knowledge-graph.md)
> - [文件格式策略](./format-strategy.md)
> - [Asset Federation](./adr-asset-federation.md)
> - [neko-market 客户端设计](./marketplace.md)

## 1. 结论

Neko Suite 应采用“统一实体 + 素材实体 + 绑定组合 + 表现解析”的分层模型：

```text
统一实体
  回答：这是谁？它和谁有什么语义关系？

素材实体
  回答：有哪些文件、变体、缩略图、技术元数据？

绑定组合
  回答：这个实体当前组合了哪些素材？

表现解析
  回答：在 Story / Canvas / Agent / Live / Cut 中应该使用哪个素材表现？
```

实体可以在 UI 中表现为一种“可引用素材卡”，但不应在存储上降级成普通文件素材。角色 Alice 是身份与语义锚点；Alice 的立绘、Live2D、Live3D、声音、动作才是具体素材表现。

## 2. 现有基础

当前代码库已经具备以下基础：

| 能力 | 现状 |
|---|---|
| 人物身份 | `characters.json` + `CharacterRecord`，支持 `confirmed / candidate / deprecated` 状态、默认绑定和脚本名绑定 |
| 素材库存 | `AssetEntity -> AssetVariant -> AssetFile`，支持分类、变体、文件、缩略图、标签、归属范围 |
| 生成资产 | `GeneratedAsset` 已带 `characterIds` 和 `sourceNodeId`，可追踪生成物归属 |
| 关系图 | `CreativeEntityGraphService` 已能从 Canvas / Asset / GeneratedAsset 生成跨模态边 |
| 2D 表现包 | `.nkp` 包装 `.inp/.moc3`，保存参数和 viewport 状态 |
| 3D 表现包 | `.nkm` 包装 `.gltf/.glb/.vrm`，保存脸部参数、动画和相机状态 |
| Live 消费 | `neko-live` 可消费 VRM / Puppet 做实时驱动，但不应拥有实体事实源 |

缺口不在“能不能记录素材”，而在“实体、素材、AI 草案、Live 表现包之间的语义组合关系还没有一等契约”。

## 3. 职责边界

| 层 | 维护内容 | 不维护内容 |
|---|---|---|
| 统一实体 | 名字、别名、人物设定、关系、状态、用户确认的语义事实 | 贴图、骨骼、音频文件清单 |
| 素材实体 | 文件、变体、技术元数据、缩略图、导入来源、版权/归属 | 剧情语义、人物关系 |
| 绑定层 | 实体和素材之间的确认关系、默认表现、用户选择历史 | 底层文件解析、剧情创作 |
| 表现解析器 | 按使用场景选择 portrait / live2d / live3d / voice / motion | 存储权威事实 |
| 使用索引 | Story / Canvas / Agent / Live / Cut 中的出现点 | 改写实体或素材事实 |

与 Asset Federation 的边界：

```text
EntityAssetBindingService
  读写 neko/entity-bindings*.json
  保存 entityId / role / assetRef / status / default
  不解析素材内部结构

AssetRefResolver
  解析 assetRef scheme
  project://  -> neko-assets / AssetLibrary
  market://   -> neko-market + InstallTarget + local install record
  shared://   -> shared library / federation readonly source
  external:// -> external link status / fingerprint

AssetFederationRegistry
  根据已解析素材提供 handler 路由、能力、语义抽取和 send-to
  不拥有实体-素材绑定存储

RepresentationResolver
  组合 CreativeEntityRegistry + EntityAssetBindingService + AssetRefResolver + AssetFederationRegistry
  返回 Story / Canvas / Agent / Live / Cut 可消费的表现结果
```

推荐模型：

```text
character:alice
  ├─ semantic relation -> character:bob
  ├─ default portrait  -> asset:alice-portrait-v1
  ├─ default live2d    -> asset:alice-live2d-default
  ├─ default live3d    -> asset:alice-vrm-stage
  └─ default voice     -> asset:alice-voice-cn

asset:alice-live2d-default
  ├─ main       -> alice.nkp
  ├─ model      -> alice.moc3
  ├─ texture    -> texture_00.png
  ├─ physics    -> physics3.json
  ├─ expression -> happy.exp3.json
  └─ motion     -> idle.motion3.json
```

## 4. 核心概念

### 4.1 统一实体

统一实体是创作语义的锚点。Phase 1 就应锁定 `CreativeEntity` 作为契约层接口；`CharacterRecord` 是 `kind: 'character'` 的首个适配实现，而不是后续才出现的抽象。这样下游的 Binding、Requirement、Resolver 从第一天就依赖稳定契约，只是当前可用 adapter 暂时只有人物。

```ts
type CreativeEntityKind = 'character' | 'scene' | 'object' | 'location' | 'style';

interface CreativeEntity {
  id: string;
  kind: CreativeEntityKind;
  canonicalName: string;
  aliases: readonly string[];
  status: 'candidate' | 'confirmed' | 'deprecated';
  metadata?: Record<string, unknown>;
}
```

推荐 adapter 路径：

```text
CreativeEntityRegistry
  ├─ CharacterRecordAdapter     # Phase 1，wrap characters.json
  ├─ SceneEntityAdapter         # Phase 2，wrap scene index / scene registry
  ├─ ObjectEntityAdapter        # Phase 2+
  └─ LocationEntityAdapter      # Phase 2+
```

设计原则：

- 用户创作过程中可以先创建 `candidate` 实体。
- AI 可以提出实体信息建议，但不应直接覆盖用户确认的事实。
- 改名、别名、关系维护在统一实体层完成。
- `CharacterRecord` 可以继续作为人物事实源，但跨模块接口应暴露 `CreativeEntity` 视图。

### 4.2 实体素材卡

实体可以在 UI 中作为“素材卡”展示，例如用户拖拽“林夏”到画布。但这张卡是统一实体的投影，不是一个普通文件。

```text
用户看到：林夏
系统保存：characterId = "char_linxia"
解析结果：portrait / live2d / live3d / voice 等具体素材
```

### 4.3 绑定组合

实体不拥有素材，而是通过绑定组合素材。绑定层负责“这个实体当前使用哪些素材”。

```ts
interface EntityAssetBinding {
  id: string;
  entityId: string;
  entityKind: CreativeEntityKind;
  assetRef: string;
  role: 'portrait' | 'reference' | 'live2d' | 'live3d' | 'voice' | 'motion' | 'style';
  isDefault?: boolean;
  status: 'suggested' | 'confirmed' | 'rejected';
  source: 'user' | 'importer' | 'story' | 'canvas' | 'agent' | 'matcher';
  confidence?: number;
  updatedAt: string;
}
```

绑定文件保存“当前确认态”，版本管理交给 Git，不在应用层重复实现 revision / event log / append-only history。替换默认立绘、取消绑定、切换 Live2D 都表现为绑定文件 diff：

```diff
- assetRef: project://assets/linxia-portrait-v1
+ assetRef: project://assets/linxia-portrait-v2
```

绑定数据不应放在 `.neko/.cache/` 下；`.cache` 只保存可重建的图谱、索引、向量或匹配候选。`characters.json` 最多保存轻量默认绑定摘要，不应保存完整文件结构。

`assetRef` 用 URI 风格表达来源，便于 Resolver 统一处理 project / market / shared / external：

```text
project://assets/linxia-portrait-v1
market://package/com.example.avatar@1.2.0/files/linxia.nkp
shared://team-library/characters/linxia
external://https/example.com/assets/linxia.zip
```

### 4.4 表现解析器

消费方不应自己猜测哪个素材可用，而应调用表现解析器：

```ts
type RepresentationKind =
  | 'portrait'
  | 'reference'
  | 'live2d'
  | 'live3d'
  | 'voice'
  | 'motion'
  | 'video';

interface RepresentationResolveRequest {
  entityId: string;
  target: 'story' | 'canvas' | 'agent' | 'live' | 'cut';
  preferredKind?: RepresentationKind;
  fallbackOrder?: readonly RepresentationKind[];
  allowFallback?: boolean;
}

type RepresentationResolveResult =
  | {
      status: 'resolved';
      entityId: string;
      assetEntityId: string;
      resolvedKind: RepresentationKind;
      fallback: boolean;
      role: string;
      files: readonly ResolvedRepresentationFile[];
      capabilities: readonly string[];
    }
  | {
      status: 'missing-representation';
      entityId: string;
      missingKinds: readonly string[];
      suggestedActions: readonly ('generate' | 'import' | 'bind-existing' | 'dismiss')[];
    };
```

Resolver 必须定义回退语义。`preferredKind` 表示优先尝试的表现，`fallbackOrder` 可覆盖默认回退链，`allowFallback = false` 时只接受 `preferredKind`，否则没有匹配就返回 `missing-representation`。返回 `resolved` 时必须包含实际命中的 `resolvedKind` 和是否经过回退的 `fallback`，用于 UI 展示“已降级到立绘”或 Agent 建议补素材。

默认回退链：

| target | 默认回退 |
|---|---|
| `story` | `reference -> portrait` |
| `canvas` | `portrait -> reference -> live2d -> live3d` |
| `agent` | `reference -> portrait -> live2d -> live3d` |
| `live` | `live3d -> live2d`，不回退到 portrait |
| `cut` | `video -> live2d -> live3d -> portrait` |

这样 Story、Canvas、Agent、Live 都只处理同一种解析结果，同时避免 Live 这类运行场景错误降级到不可驱动的 portrait。

### 4.5 视觉身份草案

真实创作流程通常是：

```text
用户写人物
  ↓
AI 生成多张形象草案
  ↓
用户选中其中一张
  ↓
系统固化角色视觉设定
  ↓
生成资产绑定到角色
```

因此需要一个介于“人物设定”和“正式素材”之间的视觉草案：

```ts
interface VisualIdentityDraft {
  id: string;
  characterId: string;
  source: 'story' | 'canvas' | 'agent';
  prompt: string;
  generatedAssetIds: readonly string[];
  selectedAssetId?: string;
  extractedVisualFacts?: readonly VisualFactSuggestion[];
  status: 'drafting' | 'selected' | 'applied' | 'discarded';
}

type WellKnownVisualFactKey =
  | 'hair'
  | 'outfit'
  | 'age'
  | 'style'
  | 'expression'
  | 'body'
  | 'accessory'
  | 'skin_tone'
  | 'eye_color'
  | 'height'
  | 'scar';

type VisualFactKey = WellKnownVisualFactKey | (string & {});

interface VisualFactSuggestion {
  key: VisualFactKey;
  value: string;
  confidence?: number;
  accepted?: boolean;
}
```

AI 生成结果是候选事实。只有用户确认后，才更新统一实体的视觉设定或默认素材绑定。

`VisualFactKey` 必须保持开放扩展。well-known key 方便 UI 做结构化表单和本地化，自定义 string 允许模型、插件或特定项目扩展 `tattoo_style`、`species_trait`、`school_uniform_variant` 等字段。

### 4.6 AssetRef 解析

`assetRef` 是实体绑定与素材后端之间的稳定引用，不等同于文件路径。Resolver 不应直接解析字符串，而应通过 `AssetRefResolver`：

```ts
type AssetRefScheme = 'project' | 'market' | 'shared' | 'external';

interface ParsedAssetRef {
  scheme: AssetRefScheme;
  raw: string;
  authority?: string;
  path: string;
  version?: string;
  /** Optional source-specific qualifiers, e.g. variant, channel, entitlement hint, or rendition. */
  query?: Record<string, string>;
}

interface AssetRefValidation {
  valid: boolean;
  reason?: string;
}

interface ResolvedAssetRef {
  ref: string;
  scheme: AssetRefScheme;
  /** Parsed URI scheme is syntax; source is the resolved backend after aliases or redirects. */
  source: 'project' | 'market' | 'shared' | 'external';
  readonly: boolean;
  assetEntityId?: string;
  uri?: string;
  localPath?: string;
  capabilities?: readonly string[];
}

interface AssetRefResolver {
  parse(ref: string): ParsedAssetRef;
  validate(ref: string): AssetRefValidation;
  resolve(ref: string): Promise<ResolvedAssetRef>;
}
```

`ParsedAssetRef.query` 是后端限定参数，不参与实体身份判断。典型用途包括：

```text
project://assets/linxia?variant=portrait-v2
market://package/com.example.avatar@1.2.0/files/linxia.nkp?channel=stable
shared://team-library/characters/linxia?rendition=thumbnail
```

`ParsedAssetRef.scheme` 是字符串语法层；`ResolvedAssetRef.source` 是解析后的后端语义层。通常二者相同，但 shared alias、market mirror、project-local fork 等情况可能让 `source` 与原始 scheme 不完全等价。

`AssetRefResolver` 与 `PathResolver` 的边界：

```text
AssetRefResolver
  解决：这个素材引用属于哪个来源、哪个后端、哪个 AssetEntity 或 package。

PathResolver
  解决：已解析出的文件路径如何映射到磁盘或变量路径。
```

例：`project://assets/linxia-portrait-v1` 先由 `AssetRefResolver` 解析到 AssetEntity；AssetEntity 内部的文件 path 再交给 `PathResolver` 处理。

### 4.7 待补素材需求

当剧本中出现新人物，但素材库没有对应素材时，系统不应阻塞创作，而应创建待补素材需求：

```ts
interface EntityAssetRequirement {
  id: string;
  entityId: string;
  entityKind: CreativeEntityKind;
  source: 'story' | 'canvas' | 'agent' | 'live';
  sourceRef: string;
  requiredKinds: readonly ('portrait' | 'reference' | 'live2d' | 'live3d' | 'voice' | 'motion')[];
  status: 'missing' | 'suggested' | 'generated' | 'bound' | 'dismissed';
}
```

UI 展示为“待补素材”队列，而不是自动创建假素材文件。

## 5. Live2D / Live3D 管理

Live2D / Live3D 应作为角色的“可驱动表现包”管理，而不是普通单文件素材。

```text
角色身份：character:linxia
  ├─ Live2D 表现包：asset:linxia-live2d-v1
  ├─ Live3D 表现包：asset:linxia-vrm-v1
  ├─ 声音包：asset:linxia-voice-cn
  └─ 参考图：asset:linxia-reference-sheet
```

建议为表现包补齐文件角色：

```ts
type RepresentationFileRole =
  | 'main'
  | 'model'
  | 'texture'
  | 'rig'
  | 'skeleton'
  | 'physics'
  | 'expression'
  | 'motion'
  | 'material'
  | 'voice'
  | 'lipsync'
  | 'thumbnail'
  | 'calibration'
  | 'tracking-profile'
  | 'source';
```

Live2D 常见组成：

- `.nkp` 项目包装
- `.moc3` 或 `.inp` 模型
- texture atlas
- physics / expression / motion 文件
- 预览图、参考图
- 口型或语音样本

Live3D 常见组成：

- `.nkm` 项目包装
- `.vrm/.glb/.gltf` 模型
- 材质、贴图、骨骼、blend shape
- 动作、表情预设
- tracking mapping / calibration
- 语音或口型样本

`neko-live` 只消费解析后的表现包，用于实时驱动、校准、录制，不维护实体身份和素材事实源。

## 6. 用户流程

### 6.1 从剧本创建人物

```text
用户输入：
林夏，17 岁，转校生，性格冷淡，常穿深色制服。

系统行为：
1. 识别人物名“林夏”
2. 查询 characters.json 和别名索引
3. 没有匹配时创建 candidate character
4. 创建 portrait/reference 的待补素材需求
5. 在角色面板显示“未绑定形象”
```

自动识别分三层：

| 层 | 作用 |
|---|---|
| 规则识别 | 对白名前缀、人物表、`@角色`、剧本格式 |
| 注册表匹配 | 通过 canonicalName、aliases、scriptNames 匹配已有角色 |
| AI 辅助 | 从自然叙述中抽取人物、关系、外貌、声音线索 |

### 6.2 通过 AI 生成形象

```text
candidate character
  ↓
生成多张 visual draft
  ↓
用户选择一张
  ↓
GeneratedAsset.characterIds = [characterId]
  ↓
提升为 AssetEntity 或绑定到已有 AssetEntity
  ↓
更新默认 portrait/reference
  ↓
AI 提取的视觉事实进入待确认列表
```

用户确认前，AI 提取的“黑色长发、深色校服、冷淡表情”等只作为建议。用户可以接受全部、逐条接受、仅作为参考图或丢弃。

### 6.3 在 Canvas 使用实体

用户可以拖拽实体卡到画布。Canvas 保存稳定引用，不保存实体事实：

```text
GalleryNode.data.characterId = "char_linxia"
ShotCharacter.characterId = "char_linxia"
```

Canvas 注释、容器文本或普通文本中如果使用实体，应通过索引器提取出现点：

```text
文本内容：林夏站在窗边。
索引结果：occurrence(character:char_linxia, source=canvas-text, nodeId=...)
```

Canvas 不应自动更新角色事实；只有用户在实体面板中确认编辑时，才更新统一实体或绑定层。

### 6.4 在 Agent 中引用实体

`@` 是输入辅助，不是持久身份。

```text
用户输入：为 @林夏 生成三视图
持久数据：characterId = "char_linxia"
```

Agent 请求中应传递 `characterIds`、`sourceNodeId`、已解析的参考素材，而不是依赖显示名或 `@` 文本。

### 6.5 在 Live 中使用实体

Live 面板选择的是实体或表现包：

```text
选择：林夏
Resolver：优先 live2d / live3d
结果：
  resolved -> 加载 avatar bundle
  missing -> 提示创建或绑定 Live2D/Live3D
```

Live 的 calibration、tracking profile 属于运行表现配置，可以作为表现包文件角色或 Live session preset 关联，但不应写入人物身份事实。

## 7. UI 功能清单

### 7.1 实体管理面板

功能：

- 查询和展示人物、场景、物品、地点、风格实体
- 展示实体详情、别名、状态、关系、出现点
- 展示默认素材表现：portrait / live2d / live3d / voice / motion
- 展示待确认 AI 建议和待补素材需求
- 支持合并实体、废弃实体、显式重命名实体

### 7.2 素材绑定面板

功能：

- 在实体详情中绑定已有素材
- 从导入文件创建 AssetEntity 并绑定到实体
- 设置默认 portrait / live2d / live3d / voice
- 查看绑定来源、置信度、用户确认状态
- 取消绑定但不删除素材文件

### 7.3 AI 形象生成面板

功能：

- 从人物文本生成多张形象草案
- 选择一张作为默认参考图
- 从生成图提取视觉事实建议
- 将生成资产提升为正式素材或保留为生成历史
- 反向更新角色视觉设定，但必须经过用户确认

### 7.4 待补素材队列

功能：

- 列出没有 portrait / live2d / live3d / voice 的实体
- 按来源过滤：Story / Canvas / Agent / Live
- 一键生成、导入、绑定已有素材或忽略
- 批量处理低风险候选

### 7.5 表现包详情页

功能：

- 展示 Live2D / Live3D 包的组件文件
- 校验缺失贴图、动作、表情、物理、声音
- 展示可用能力：render / tracking / expression / lip-sync / motion
- 设置给哪个角色使用，以及是否为默认表现

## 8. 存储策略

不建议单文件存储所有数据。推荐多文件、分层存储：

| 数据 | 建议位置 | 说明 |
|---|---|---|
| 实体身份 | `characters.json`，未来可扩展为 `neko/entities/*.json` | 可 Git 跟踪，用户可审阅 |
| 素材库存 | `neko/assets/library.json` | 记录 AssetEntity / Variant / File |
| 实体-素材绑定 | `neko/entity-bindings.json` 或 `neko/entity-bindings/*.json` | 当前确认态，依赖 Git 管版本 |
| 生成资产索引 | `.neko/generated/` + generated index | 二进制在磁盘，JSON 只存引用 |
| 关系图缓存 | `.neko/.cache/asset-graph.json` | 派生层，可重建 |
| Live session preset | `.neko/live/*.json` 或表现包附属配置 | 运行配置，不是身份事实 |

原则：

- JSON 只保存路径、引用和元数据，不嵌入大二进制。
- 文件路径遵守项目路径策略，优先相对路径或变量路径。
- 派生缓存可重建，不作为用户语义事实源。
- 用户确认的绑定是 Git 可跟踪的项目事实，不被自动匹配静默覆盖。
- 应用层不再为 `EntityAssetBinding` 实现内部版本系统；审计、回滚、比较由 Git 提供。

## 9. 语义正确性维护

| 来源 | 可以做什么 | 不能做什么 |
|---|---|---|
| AI | 识别候选实体、生成形象、提出视觉事实建议 | 静默覆盖用户确认事实 |
| Importer | 解析文件格式、提取技术元数据、生成绑定候选 | 决定剧情关系 |
| Matcher | 给出素材和实体的匹配置信度 | 低置信度自动写入事实源 |
| Binding Service | 保存用户确认的实体-素材绑定 | 解析底层媒体格式 |
| Consistency Checker | 报告冲突和缺失 | 自动修正语义 |
| User | 确认身份、设定、默认表现和关系 | 不应被迫维护底层文件细节 |

语义正确性的最终维护者是用户；系统通过候选、建议、默认值和批量确认降低维护成本。

## 10. 删除与更新语义

需要区分三种删除：

| 操作 | 含义 | 影响 |
|---|---|---|
| 废弃实体 | 角色不再作为活跃身份使用 | `status = deprecated`，保留历史引用 |
| 取消绑定 | 某素材不再属于该实体 | 删除或标记 EntityAssetBinding，不删除文件 |
| 删除素材 | 移除 AssetEntity 或 AssetFile | 需要检查 Story / Canvas / Agent / Live 引用 |

更新也需要分层：

- 改名、别名、人物关系：更新统一实体。
- 换默认立绘、默认 Live2D、默认声线：更新绑定层。
- 替换贴图、动作、模型文件：更新素材实体或表现包。
- Canvas 文本、注释、容器中出现实体：更新出现点索引，不直接改实体事实。

## 11. 跨项目策略

默认实体是项目级，因为人物设定、关系和剧情语义通常属于项目上下文。

素材可以具备更广的归属范围：

```text
project asset
personal asset
team asset
purchased asset
public asset
```

跨项目复用时，不应直接把另一个项目的角色身份当成本项目身份。推荐流程：

```text
导入外部角色包
  ↓
创建本项目 character
  ↓
绑定外部或复制后的素材
  ↓
保留 source / provenance
```

这样可以避免同名角色、不同世界观版本、商业素材授权范围混淆。

外部素材是否由 `neko-market` 管理，取决于素材来源，而不是取决于它是否来自项目外部：

| 来源 | `assetRef` 示例 | 管理者 | 升级策略 |
|---|---|---|---|
| 项目素材 | `project://assets/asset-id` | `neko-assets` | 不自动升级，用户替换或重新导入 |
| Market 安装素材 | `market://package/id@version/path` | `neko-market` + 对应 InstallTarget | 可检查更新，但必须用户确认 |
| 团队共享库 | `shared://library/id` | 共享库 / Federation 只读引用 | 可提示源变化，不静默覆盖 |
| 外部链接 | `external://...` | `neko-assets` 记录引用状态 | 只检测可用性和指纹变化 |

`neko-market` 是 market 包的安装器、卸载器和版本管理器，不是项目素材事实源。Resolver 遇到 `market://` 引用时可以查询 market：

```text
1. 当前 packageId@version 是否已安装
2. entitlement / license 是否有效
3. 是否存在可升级版本
```

但升级不得静默改变实体绑定，因为 avatar / portrait / voice 的升级可能改变角色形象语义。推荐用户选择：

```text
保持当前版本
升级并更新绑定
安装新版但不切默认
复制 / fork 到项目素材
```

普通本地导入素材和团队共享素材不走 market 升级流程；它们由 `neko-assets` 和 Asset Federation 负责索引、探测、可用性检查和来源提示。

## 12. 需要改动的内容

### 12.1 契约层

- 锁定 `CreativeEntity` 契约，Phase 1 通过 `CharacterRecordAdapter` 填充 `kind: 'character'`。
- 新增或扩展 `EntityAssetBinding` 契约。
- 新增 `EntityAssetRequirement` 契约。
- 新增 `VisualIdentityDraft` 契约。
- 新增 `RepresentationResolveRequest / Result` 契约，包含 `fallbackOrder` 和 `allowFallback`。
- 新增 `AssetRefResolver` / `ParsedAssetRef` / `ResolvedAssetRef` 契约。
- 扩展素材文件角色，覆盖 model / rig / skeleton / physics / expression / motion / voice / calibration 等。
- 为 `AssetEntity` 增加更明确的 representation metadata，避免把 Live2D/Live3D 塞进无语义的 custom 字段。

### 12.2 服务层

- 增加 `CreativeEntityRegistry` facade，先接入 `CharacterRecordAdapter`。
- 增加 `EntityAssetBindingService`，负责实体和素材组合关系。
- 增加 `AssetRefResolver`，负责 `project://`、`market://`、`shared://`、`external://` 解析与校验。
- 增加 `RepresentationResolver`，按目标场景解析默认表现。
- 增加 `EntityAssetRequirementService`，维护待补素材队列。
- 增加 `VisualIdentityDraftService`，管理 AI 视觉草案和用户确认。
- 扩展 `CreativeEntityGraphService`，支持新的绑定边和表现包边。
- 与 `AssetFederationRegistry` 集成，但不把绑定存储放入 Federation Handler。

### 12.3 Story

- 从剧本识别人物时创建候选实体或素材需求。
- 支持 `@` 作为提及输入，但持久化为 `characterId`。
- 角色详情中展示 AI 形象生成入口和待补素材状态。

### 12.4 Canvas

- Gallery / Shot / 文本 / 注释 / 容器文本都应进入出现点索引。
- Canvas 节点保存 `characterId`、`assetEntityId` 或 resolved representation ref，不保存实体事实。
- 对缺失素材显示占位实体卡，并提供生成、导入、绑定入口。

### 12.5 Assets

- 支持表现包详情页。
- 支持从导入文件生成绑定候选。
- 支持 Live2D / Live3D / voice / motion 作为角色 representation。
- 区分删除素材和取消实体绑定。

### 12.6 Agent

- 生成请求继承 `characterIds` 和 `sourceNodeId`。
- AI 生成结果进入 `VisualIdentityDraft` 或 `GeneratedAsset`，用户确认后绑定。
- Agent 不直接写入确认事实，只提交建议或调用确认后的服务。

### 12.7 Live / Puppet / Model

- `neko-live` 通过 Resolver 获取 avatar bundle。
- `neko-puppet` 负责 2D puppet 格式校验、参数和渲染能力。
- `neko-model` 负责 3D model 格式校验、材质、骨骼、表情能力。
- Live session preset 只保存运行配置，不维护角色身份。

### 12.8 测试

- 契约测试：实体、绑定、需求、视觉草案、表现解析结果。
- Resolver 测试：不同目标场景选择不同默认素材，并覆盖默认回退链 / `fallbackOrder` / `allowFallback=false`。
- AssetRefResolver 测试：`project://`、`market://`、`shared://`、`external://` 解析、校验和后端路由。
- 缺失素材测试：没有素材时返回 `missing-representation`。
- 图谱测试：实体、素材、生成资产、Canvas 节点边可重建。
- UI 行为测试：确认 AI 建议后才更新实体事实。

## 13. 用户维护成本评估

该设计会增加系统内部概念，但不应增加用户手动维护成本。用户看到的是：

- 一个角色卡。
- 一个“生成形象”入口。
- 一个“绑定素材”入口。
- 一个“待补素材”队列。
- 一组确认建议。

复杂关系由系统在后台维护：

```text
用户操作：选择第 2 张形象作为林夏默认图

系统动作：
1. GeneratedAsset 记录 characterIds
2. AssetEntity 创建或更新
3. EntityAssetBinding 标记 confirmed
4. Character defaults 更新默认 portrait 摘要
5. CreativeEntityGraph 重建关系边
6. OccurrenceIndex 可反查出现位置
```

关键是所有自动行为都应保持可见、可撤销、可确认。

## 14. 反对的做法

- 不把 `@林夏` 文本作为持久身份。
- 不把所有实体和素材塞进单个 JSON。
- 不把 Live2D/Live3D 当普通图片或单文件素材。
- 不给 `EntityAssetBinding` 再造内部版本系统；绑定文件版本由 Git 管理。
- 不让 `neko-market` 管理所有外部素材；只有 market 来源素材由 market 管安装和升级。
- 不让 Canvas、Story、Agent、Live 各自维护一套实体事实。
- 不让 AI 生成结果静默改写用户确认的人物设定。
- 不让 `neko-live` 成为角色或素材事实源。
- 不在 `characters.json` 中保存完整贴图、动作、物理、音频文件清单。

## 15. 推荐落地顺序

| 阶段 | 内容 |
|---|---|
| Phase 1 | 文档和契约：Binding / Requirement / VisualDraft / Resolver |
| Phase 2 | Story 人物候选实体 + 待补素材队列 |
| Phase 3 | AI 形象生成草案 + 用户确认绑定 |
| Phase 4 | Canvas 文本/注释/容器实体出现点索引 |
| Phase 5 | Live2D / Live3D 表现包 metadata 和 Resolver |
| Phase 6 | UI 完整实体中心、绑定面板、表现包详情页 |
| Phase 7 | 跨项目素材复用和团队素材范围 |

## 16. 当前实现状态

截至 2026-05-11，Phase 1-6 的核心契约、跨模态服务和命令式 UI 管理入口已落地，并已通过实现评审。评审结论为 PASS；唯一阻塞问题是 `LivePanelProvider.selectCreativeEntity()` 中缺失表现提示分支的缩进可读性，已修复，不改变运行行为。

- `@neko/shared` 已新增 `CreativeEntity`、`EntityAssetBinding`、`AssetRefResolver`、`RepresentationResolver`、`VisualIdentityDraft`、`EntityAssetRequirement` 和表现包文件角色契约。
- VSCode Extension Host 侧已提供 `CharacterRecordAdapter`、`CreativeEntityRegistryService`、`EntityAssetBindingService`、`DefaultAssetRefResolver`、`RepresentationResolver`、`VisualIdentityDraftService`、`EntityAssetRequirementService`。
- 绑定当前态写入 `neko/entity-bindings.json`，不写入 `.neko/.cache/`；绑定版本审计由 Git 负责。`EntityAssetBindingService.setDefault()` 会保证同一实体同一 role 的默认绑定唯一。
- `RepresentationResolver` 已支持默认回退链、`fallbackOrder`、`allowFallback=false`、`resolvedKind` 和 `fallback`，并可通过窄口接入 Asset Federation 能力/组件文件语义。
- 生成媒体血缘可从 `GeneratedAsset.characterIds` 和 `sourceNodeId` 投影为视觉草案与待补素材需求。
- Story 的 `OccurrenceIndexService` 已索引 gallery、shot、生成资产、素材实体，以及 Canvas annotation/text/container 文本中的实体出现点。
- Story 的 `CreativeEntityWorkspaceIndexService` 对未入 `characters.json` 但在剧本中出现的人物返回 candidate 查询结果，并投影 portrait/reference 待补素材动作；它不静默写入角色事实。
- Story 的 `CreativeEntityGraphService` 已把确认的实体-素材绑定投影为 `bound-to-representation` 边，并继续保留 GeneratedAsset 血缘边。
- Agent 媒体任务视图已携带 `characterIds`、`sourceNodeId`、视觉草案上下文和绑定动作候选，不直接写入确认事实。
- Assets 面板和 API 已提供绑定候选、表现包详情，以及“取消绑定但不删除素材”的独立操作。
- Live 面板已通过 `RepresentationResolver` 选择 Live2D/Live3D avatar bundle；缺少可驱动表现时提示生成、导入、绑定或忽略，不会降级到 portrait。
- Story 新增命令式实体管理入口：
  - `neko.story.showCreativeEntityDetail`：展示实体别名、状态、关系、出现点、默认绑定、待补需求和视觉草案摘要。
  - `neko.story.setCreativeEntityDefaultBinding`：选择 portrait/reference/live2d/live3d/voice/motion，并通过 Assets API 选择素材后写入确认绑定。
  - `neko.story.reviewVisualDrafts`：选择生成图、接受或拒绝视觉事实、应用或丢弃草稿；不会自动覆盖人物事实。
  - `neko.story.showMissingMaterialQueue`：对缺失素材执行生成、导入、绑定已有素材或忽略。
  - `neko.story.showRepresentationPackageDetail`：展示表现包组件文件、缺失角色、能力，并可设为实体默认表现。

仍待后续阶段完成：

- 将命令式 QuickPick 管理入口升级为持久 TreeView/Webview 实体中心。
- 合并实体、废弃实体、显式重命名实体仍需接入统一实体 facade 的可写契约。
- 视觉事实的最终落点仍需在 `CharacterRecord.metadata` 与未来 `visualSpec` 之间定稿。
- Live 面板中 `Generate` / `Import` / `Bind Existing` 目前都复用导入命令，后续应拆成独立流程。
- Agent 中 representation requirement 与 binding role 的推导逻辑当前保持显式函数，后续可在不改变契约的前提下合并为共享 helper。

## 17. 开放问题

- 是否将 `characters.json` 继续作为唯一人物事实源，还是迁移到 `.neko/entities/characters.json`？
- 视觉事实应写入 `CharacterRecord.metadata`，还是新增 `visualSpec` 字段？
- AssetEntity 是否增加 `category = 'avatar'`，还是继续用 `category = 'character'` + representation metadata？
- Live session preset 应属于 `.neko/live/`，还是属于表现包 variant metadata？
- 跨项目角色复用时，身份是 fork 还是引用外部 registry？
- 团队共享库的 `shared://` 更新通知由 Asset Federation 事件提供，还是由 neko-assets 定期探测？
