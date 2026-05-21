# ADR: Asset Federation — neko-suite 跨子包素材联邦架构

## 状态

Proposed (2026-04-25)

## 关联 ADR

- 上层依赖:[adr-four-layer-contract.md](./adr-four-layer-contract.md), [adr-capability-protocol.md](./adr-capability-protocol.md)
- 平行配合:[adr-engine-ai-native-foundation.md](./adr-engine-ai-native-foundation.md)(共享词汇/索引基础设施)
- 既有融合:[asset-knowledge-graph.md](./asset-knowledge-graph.md), [adr-character-unified-index.md](./adr-character-unified-index.md), [agent-media-architecture.md](./agent-media-architecture.md), [adr-capability-protocol.md](./adr-capability-protocol.md)
- 项目格式治理:Format Strategy ADR(.nk\* 命名 + JSON Schema SSOT)

## 背景

[adr-engine-ai-native-foundation.md](./adr-engine-ai-native-foundation.md) 初版假设"语义化素材"由引擎中心化处理:asset 入库 → 引擎自动语义化 → 写入全局 SemanticAsset 库。这是**严重的架构错误**,因为:

### 现实:neko-suite 是 11+ 子包的联邦

```
neko-cut       (NLE)         拥有 .nkcut + clip/track/effect
neko-canvas    (分镜板)      拥有 .nkc + shot-node
neko-model     (3D)          拥有 .nkm + glTF/HDR
neko-sketch    (2D 栅格)     拥有 .nks + layer-tree
neko-puppet    (2D 骨骼)     拥有 .nkpup + MOC3/animation
neko-story     (剧本)        拥有 .fountain/.nkst + script-index
neko-preview   (预览)        渲染权(无项目格式)
neko-assets    (资产库)      .neko/assets/manifest.json
neko-market    (市场)        plugin-pkg/preset-pkg
neko-tools     (工具)        tool-preset
neko-agent     (AI)          .neko/{drafts,plans,tasks,memory}
```

每个子包既是**资产消费者**又是**资产生产者+所有者**。

### 问题 1:中心化方案破坏子包自治

强行让引擎读 `.nkcut`/`.nks` 等子包格式,违反 [.dependency-cruiser.cjs](../../.dependency-cruiser.cjs) 已强制的 `no-cross-extension-deps` 规则。

### 问题 2:违反 Capability Protocol 的来源四分

[adr-capability-protocol.md](./adr-capability-protocol.md) 明确 Tool 来源四分(internal/mcp/market/local)。素材**也有四来源**(项目内/市场下载/外部链接/导入文件),应**同等待遇**。

### 问题 3:缺少跨包共享身份

同一角色 "Anya" 在 neko-model 是 .glb、在 neko-puppet 是 .moc3、在 neko-sketch 是肖像图。当前每个子包各自命名,**身份在跨包流转中丢失**。

### 问题 4:Send-to 协议网状化未规划

memory 中已有 `neko.sketch.sendToTimeline` / `sendToCanvas` 等点对点 API,但**没有统一协议**,新增子包要改 N-1 处。

### 问题 5:已有散件未串联

下列已有 ADR/模式各自孤立:

- AssetManifest + Handler registry pattern (CLAUDE.md)
- AgentCapabilityProvider 模式(子包贡献能力)
- Send-to-Agent 协议([agent-media-architecture.md](./agent-media-architecture.md))
- asset-knowledge-graph(关系图)
- adr-character-unified-index(角色身份)
- LSP ScriptIndex(script 嵌入,可作为 StoryAssetHandler 样板)

需要一份联邦协议把它们串成完整闭环。

## 决策

采用 **Asset Federation 架构**:

> 每个子包贡献自己的 `AssetHandler`(与 `AgentCapabilityProvider` 同形),**自治拥有**自己的素材;引擎层(`engine-semantic-ontology` / `engine-vector-index` / `engine-provenance` / `engine-semantic-bus`)只提供共享词汇 + 索引 + 跨包事件;`AssetFederationRegistry` 提供跨包路由 + Send-to-Anywhere 协议。

## 设计要点

### 1. 子包资产清单(谁拥有什么)

| 子包 | 项目格式 | 原生资产类型 | 导入格式 | 生成产物 |
|------|---------|------------|---------|---------|
| `neko-cut` | `.nkcut` | clip / track / effect-chain / transition / LUT preset / keyframe-curve | mp4/mov/webm/wav/.cube/.3dl | exports + thumbnails |
| `neko-canvas` | `.nkc` | shot-node / layout / branch / generation-history | image/\* | composed canvas |
| `neko-model` | `.nkm` | scene / skeleton / animation-clip / face-params (22) / procedural-mesh | glTF/glb/VRM/MMD/HDR | rendered frames / fbx |
| `neko-sketch` | `.nks` | layer-tree (raster/vector/text/group) / brush / palette / pattern | PSD / png / jpg | layer composites |
| `neko-puppet` | `.nkpup` | puppet / animation-clip / face-params (32) / pose-snapshot | Live2D MOC3 | rendered puppet frames |
| `neko-story` | `.fountain` / `.nkst` | scene / character-bio / dialogue-tree / script-index | fountain / fdx / .docx | converted timeline |
| `neko-preview` | — | — | PDF/EPUB/CBZ/HDR/360-image | 渲染缓存 |
| `neko-assets` | `manifest.json` | asset-entry(meta only) | 任意 | thumbnails / embeddings |
| `neko-market` | — | plugin-pkg / preset-pkg / model-pkg | nkpkg | install records |
| `neko-tools` | — | tool-preset | — | — |
| `neko-agent` | `.neko/{drafts,plans,tasks}` | draft / plan / task / .nkbg / generated-asset | — | conversation records |

### 2. 三类素材性质,分别策略

```
A. 项目素材(子包独占)         .nkcut/.nks/.nkpup/.nkm/.nkst/.nkc
   生命周期:工程一辈子
   语义owner: 子包,但暴露 schema 给其他包
   联邦角色: AssetHandler 抽语义,引擎只索引

B. 共享素材(跨包流通)         glb/image/audio/HDR/LUT/...
   生命周期:跨工程
   语义owner: 联邦,需统一身份
   联邦角色: 强需 IdentityRegistry + 跨包 send-to

C. 派生素材(自动生成)         thumbnails/embeddings/exports/cache
   生命周期:可重生
   语义owner: 无所谓
   联邦角色: 无历史,源变即失效(对应 AI-Native ADR §3 第⑤层)
```

### 3. AssetHandler trait

每个子包必须实现:

```typescript
interface AssetHandler {
  // 标识 — 与 AgentCapabilityProvider 同形
  readonly id: string                    // 'neko-cut'
  readonly version: string

  // 1. Probe — 我管这个 uri 吗?
  canHandle(uri: AssetUri): HandleClaim
  // ClaimedFully | ClaimedShared | NotMine

  // 2. 语义抽取 — 给定 uri,抽语义元数据
  extractSemantics(uri: AssetUri): Promise<{
    kind: AssetKind
    capabilities: AssetCapability[]
    semantics: AssetSemantics
    confidence: number
  }>

  // 3. 嵌入提供 — 用什么模态做向量?
  computeEmbeddings(uri: AssetUri): Promise<{
    visual?:     Float32Array
    text?:       Float32Array
    audio?:      Float32Array
    structural?: Float32Array  // 如剧本的章节结构嵌入
  }>

  // 4. Send-to 协议 — 我能发给谁
  getSendTargets(uri: AssetUri): SendTarget[]

  // 5. 跨包导入 — 别人发给我,我怎么吸收
  receiveFrom(source: AssetUri, context: ImportContext): Promise<AssetUri>

  // 6. 关系发现 — 跟其他 asset 的关系
  discoverRelations(uri: AssetUri,
                    candidates: AssetUri[]): Promise<AssetRelation[]>

  // 7. 缩略图(可选,UI 用)
  thumbnail?(uri: AssetUri, size: ThumbnailSize): Promise<Buffer>
}
```

### 4. 与 AgentCapabilityProvider 同形(关键纪律)

```
AgentCapabilityProvider           AssetHandler
─────────────────────             ────────────
getId/getVersion         ←→       id/version
getTools(context)        ←→       extractSemantics(uri)
getToolGroups()          ←→       getSendTargets(uri)
getPromptFragments()     ←→       (语义片段反映在 ontology)

注册流程:子包 activate() 时双注册
  context.subscriptions.push(
    capabilityRegistry.register(myCapabilityProvider),
    assetFederation.register(myAssetHandler)         // ← NEW
  )

发现流程:与 CapabilityDiscoveryService 同样的两阶段
  Stage 1 Registration: scan package.json contributes.assetHandlers
  Stage 2 Activation:   activation event 触发 register()
```

### 5. AssetFederationRegistry(联邦入口)

```
                         每子包贡献 AssetHandler

  neko-cut       → CutAssetHandler        (拥有 .nkcut + 视频/音频/LUT)
  neko-canvas    → CanvasAssetHandler     (拥有 .nkc + shot-node)
  neko-model     → ModelAssetHandler      (拥有 .nkm + glTF/HDR)
  neko-sketch    → SketchAssetHandler     (拥有 .nks + 图层/笔刷)
  neko-puppet    → PuppetAssetHandler     (拥有 .nkpup + MOC3/动画)
  neko-story     → StoryAssetHandler      (拥有 .fountain/.nkst)
  neko-preview   → PreviewAssetHandler    (PDF/HDR/360 仅渲染权)
  neko-agent     → AgentAssetHandler      (drafts/plans/tasks/.nkbg)
                            │
                            ▼
                  ┌─────────────────────────┐
                  │  AssetFederationRegistry │
                  │  ───────────────────────  │
                  │  • probe  uri → handler   │
                  │  • route  uri → action    │
                  │  • bus    跨包语义事件    │
                  │  • send-to 双向网状协议   │
                  └─────────────────────────┘
                            │
                            ▼
              ┌───────────────────────────────────┐
              │  共享语义层 (ENGINE)              │
              │  ───────────────────────────────  │
              │  • engine-semantic-ontology       │
              │  • engine-vector-index            │
              │  • engine-provenance              │
              │  • engine-semantic-bus            │
              └───────────────────────────────────┘
```

### 6. 跨包语义共享三级

#### 6.1 共享身份 (AssetIdentity)

> 同一个"角色 Anya"以多种形态存在,但**身份唯一**。

```
              AssetIdentity { kind: 'character', id: 'anya' }
              ──────────────────┬──────────────────
                                 │ has-form
        ┌────────────────────────┼─────────────────────┐
        ▼                        ▼                     ▼
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │ neko-model       │  │ neko-puppet      │  │ neko-sketch      │
  │ anya-3d.glb      │  │ anya-2d.moc3     │  │ anya-portrait.nks│
  │ form: rigged-3d  │  │ form: moc3-2d    │  │ form: raster     │
  └──────────────────┘  └──────────────────┘  └──────────────────┘

身份持久化:.neko/identity-manifest.json(项目级)
吸收:asset-knowledge-graph + adr-character-unified-index
落地:engine-semantic-ontology::IdentityRegistry 子模块
```

身份用稳定 ulid,**与文件路径解耦**(防文件移动/重命名后身份丢失)。

#### 6.2 共享词汇 (SemanticOntology)

```
"温暖" 在不同子包语境下:
  neko-cut:    LUT 色温 < 5500K + 高光柔和
  neko-sketch: 滤镜 EXPOSURE+ TEMPERATURE+
  neko-model:  HDR skybox 黄昏色调 + 偏暖
  neko-story:  情绪 tag warmth ∈ [0.6, 1.0]

如果不共享,LLM 每次都要现学每包的词汇 → 灾难
共享方案:engine-semantic-ontology 提供 'warmth' 槽
         每包 Handler 把自己的具体参数映射到 'warmth' 槽
         AI 只用 'warmth',不感知具体实现
```

#### 6.3 共享关系图 (Knowledge Graph)

```
neko-story: scene-X(剧本场景)
      │
      │ generates ─►  neko-canvas: layout-X.nkc
      │                     │
      │                     │ contains-shot ─► shot-X1
      │                                            │
      │                                            │ rendered-from ─►
      │                                            │   neko-sketch: shot-X1.nks
      │                                            │     │
      │                                            │     │ exported-to ─►
      │                                            │     │   neko-cut: clip-X1.mp4
      │                                            │     │       │
      │                                            │     │       │ used-in ─►
      │                                            │     │       │  project.nkcut
      │ uses-character ─► AssetIdentity('anya')
      │                          │ has-form ─► anya-3d.glb
      │                          └ has-form ─► anya-portrait.nks
```

完整可达图,任何一步失败都能定位上游。这是 [asset-knowledge-graph.md](./asset-knowledge-graph.md) 的形式化承载。

### 7. Send-to-Anywhere 协议(扩展自 Send-to-Agent)

[agent-media-architecture.md](./agent-media-architecture.md) 已经有 Send-to-Agent 单向协议(file-level + content-level, zero base64)。本 ADR **扩展为双向网状**:

```
当前(memory 中已有):
  neko.sketch.sendToTimeline    → neko-cut.importGeneratedClip
  neko.sketch.sendToCanvas      → neko-canvas.updateNodeImage
  neko.canvas.editInSketch      → neko-sketch.editImage

扩展为统一协议:
  AssetFederationRegistry.send(
    source: AssetUri,
    target: SendTarget,           // 由 Handler.getSendTargets 自描述
    options: SendOptions
  )
  
  路由:
    1. resolve source uri → sourceHandler
    2. 询问 sourceHandler.getSendTargets(uri) → 候选目标列表
    3. 校验 target 在候选列表
    4. 调用 targetHandler.receiveFrom(source, context)

新能力:
  • 网状(任何子包到任何子包,O(N) 实现)
  • 自描述(子包不必互相导入接口)
  • 可审计(send 操作进 engine-provenance)
  • 可拒绝(targetHandler 返回 RejectionReason 带语义)
```

### 8. 引擎层 vs 子包层分工(明确边界)

```
┌─ 引擎层(共享基础) ─────────────────────────────┐
│  ✓ engine-semantic-ontology    全局词汇         │
│  ✓ engine-vector-index         统一嵌入索引     │
│  ✓ engine-provenance           跨包因果链       │
│  ✓ engine-semantic-bus         跨包事件总线     │
│  ✓ AssetFederationRegistry     handler 注册中心 │
│  ✗ 不持有任何具体素材                            │
│  ✗ 不知道 .nkcut / .nks 内部结构                │
└──────────────────────────────────────────────────┘

┌─ 子包层(自治拥有) ─────────────────────────────┐
│  ✓ 自己的项目格式 schema (.nkcut etc.)         │
│  ✓ 自己的 AssetHandler 实现                     │
│  ✓ 自己的 capability mapping(温暖→具体参数)    │
│  ✓ 与其他子包的 send-to 双边协议                │
│  ✗ 不直接读其他子包的项目格式                    │
│  ✗ 不绕过引擎层做语义查询                        │
└──────────────────────────────────────────────────┘
```

### 9. 与已有架构的关系

| 已有 | 在新架构中的角色 |
|------|-----------------|
| AssetManifest + Handler registry (CLAUDE.md) | 就是 `AssetFederationRegistry` 的雏形,扩展为联邦 + 语义 |
| `AgentCapabilityProvider` 模式 | `AssetHandler` 与之同形,共享发现/注入两阶段机制 |
| Send-to-Agent ([agent-media-architecture.md](./agent-media-architecture.md)) | Send-to-Anywhere 的子集,扩展双向 + 网状 |
| [asset-knowledge-graph.md](./asset-knowledge-graph.md) | 关系图实现,吸收为 `engine-vector-index` 的图存储 |
| [adr-character-unified-index.md](./adr-character-unified-index.md) | `AssetIdentity` 的特化(角色),应吸收 |
| Format Strategy ADR | 子包项目格式 schema 治理,直接复用 |
| LSP ScriptIndex | `StoryAssetHandler.extractSemantics` 的样板 |

**结论**:**几乎不需要新发明**,主要是把上述散件用联邦协议串起来。最大的新建是 `AssetFederationRegistry` + `AssetHandler` trait + 每包 Handler 实现。

### 10. 每个子包的具体改造点

| 子包 | 改造项 | 优先级 | 工作量 |
|------|--------|--------|--------|
| `neko-cut` | CutAssetHandler:probe `.nkcut`,抽 clip 语义(via CLIP/Whisper),getSendTargets | **P0** | 3 PR |
| `neko-canvas` | CanvasAssetHandler:probe `.nkc`,抽 shot-node 语义(已有 generatedImage 接口) | **P0** | 2 PR |
| `neko-model` | ModelAssetHandler:probe `.nkm`/glTF,抽 22 face-params + 骨骼 humanoid 映射 | **P0** | 3 PR |
| `neko-sketch` | SketchAssetHandler:probe `.nks`,layer 语义(已有 layer-tree) | **P0** | 2 PR |
| `neko-puppet` | PuppetAssetHandler:probe `.nkpup`,32 face-params 映射(已有标准) | **P0** | 2 PR |
| `neko-story` | StoryAssetHandler:probe `.fountain`,**复用 LSP ScriptIndex** | **P0** | 1 PR |
| `neko-preview` | PreviewAssetHandler:只 probe + 不抽内部语义(rights to render) | P1 | 1 PR |
| `neko-assets` | 升级 manifest 为联邦 registry 入口 | **P0** | 2 PR |
| `neko-market` | MarketAssetHandler:plugin-pkg/preset-pkg 元数据 | P1 | 1 PR |
| `neko-agent` | AgentAssetHandler:drafts/plans/tasks 已有 schema | P1 | 1 PR |

## 后果

### 正面

- **子包自治**:每个子包独立演进自己的格式,引擎不被绑定
- **横向扩展**:新增子包(如 neko-music)只需实现 AssetHandler,联邦自动接纳
- **跨包搜索**:LLM 可统一问"找个温暖的素材",不感知子包边界
- **关系图完整**:从剧本到导出视频的完整可达图,失败可追溯
- **不重复造轮子**:CLAUDE.md 的 AssetManifest+Handler、AgentCapabilityProvider、Send-to-Agent、asset-knowledge-graph 等散件被串起来

### 负面 / 权衡

- **协议设计成本**:`AssetHandler` trait 设计错误后,所有子包跟着改
- **子包学习曲线**:每个子包作者都要理解联邦协议
- **registry 一致性**:子包注册时机错误会导致部分功能不可用,需 lazy/eager 策略
- **跨包关系图维护**:关系会过期(资产删除/重命名),需 GC + 周期性校验
- **测试复杂度**:跨包测试比单包测试复杂

## 实施路径

```
S1  联邦协议地基(必须先做)
    ┌──────────────────────────────────────────────────┐
    │ ① AssetHandler trait 在 @neko/shared             │
    │ ② AssetFederationRegistry 实现                   │
    │ ③ AssetIdentity + IdentityRegistry              │
    │ ④ Send-to-Anywhere 路由 + 协议                   │
    │ ⑤ 与 engine-semantic-ontology / vector-index     │
    │   / provenance / semantic-bus 集成               │
    └──────────────────────────────────────────────────┘
    工作量: 4-5 PR (依赖 ai-native-foundation S1)

S2  P0 子包 Handler 实施
    ┌──────────────────────────────────────────────────┐
    │ 7 个 P0 子包(cut/canvas/model/sketch/puppet/    │
    │ story/assets)的 Handler                         │
    │ 现有 sendToX 命令迁移到 Send-to-Anywhere 协议    │
    └──────────────────────────────────────────────────┘
    工作量: 15 PR(每子包 1-3 PR,可并行)

S3  联邦能力上线
    ┌──────────────────────────────────────────────────┐
    │ 跨包语义搜索 UI(在 neko-assets)                  │
    │ 跨包 send-to 上下文菜单                            │
    │ AssetIdentity 等价类追溯 UI                        │
    │ asset 演化(被使用 → 自动 derived-tag)             │
    │ P1 子包(preview/market/agent)Handler            │
    └──────────────────────────────────────────────────┘
    工作量: 8-10 PR
```

## 反模式清单

```
FED-1  "子包绕过 Federation 直读他包文件"
       现象:neko-cut 直接 fs.readFile("/path/anya.nks")
       代价:破坏子包自治、循环依赖、违反 dep-cruiser 规则
       修法:走 AssetFederationRegistry.resolve(uri) → AssetHandler

FED-2  "Handler 偷渡内部结构"
       现象:CutAssetHandler.extractSemantics 暴露 nkcut 内部 JSON 字段名
       代价:其他包耦合内部 schema,以后改 schema 全部跟着改
       修法:暴露的只能是语义层(SemanticAsset),不是技术层

FED-3  "全局 Send-to 没有协议"
       现象:每对子包之间各自约定接口
       代价:N×(N-1) 复杂度,新增子包要改 N-1 处
       修法:Send-to 走 AssetHandler trait 的 getSendTargets/receiveFrom

FED-4  "AssetIdentity 用文件路径"
       现象:identity = path
       代价:文件移动/重命名后身份丢失
       修法:identity 用稳定 ulid,与文件路径解耦

FED-5  "引擎插手项目格式"
       现象:engine-* crate 直接读 .nks/.nkcut
       代价:语义层与技术层混淆,引擎成为子包的延伸
       修法:引擎只通过 AssetHandler 接口看素材,看不到原始字节

FED-6  "AssetHandler 同步阻塞"
       现象:probe / extractSemantics 同步执行,卡 VSCode UI
       代价:打开包含 N 个素材的项目时 UI 假死
       修法:全部 async + 进度回调,VSCode progress notification

FED-7  "auto-derived tag 污染 user tag"
       现象:LLM/CLIP 自动打的 tag 与人审 tag 不区分
       代价:噪声反向污染本体
       修法:derived-tag namespace 隔离,evolution-confidence 标记

FED-8  "embedding 当真相"
       现象:删了源文件不删 embedding,搜出幽灵资产
       代价:UX 灾难
       修法:embedding 是 derived 缓存,源变即失效(对应 ai-native-foundation §3 第⑤层)

FED-9  "关系自动落库"
       现象:LLM 推断 "Anya-formal variant-of Anya-casual" 自动 commit
       代价:错误关系污染图
       修法:推断生成 'suggested-relation',人或 AI 确认才落库
```
