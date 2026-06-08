# ADR: 统一实体、人物记忆与媒体语义索引协议

**状态**: Proposed (2026-06-07)
**范围**: `@neko/shared` · `neko-agent` · `neko-story` · `neko-canvas` · `neko-cut` · `neko-assets` · `neko-dashboard` · `runtime-media` · 后续创意子包
**关联**: `creative-entity-asset-composition.md` · `adr-character-unified-index.md` · `adr-composite-artifact-table-protocol.md` · `adr-agent-multimodal-perception.md` · `adr-structured-data-persistence.md` · `agent-media-architecture.md` · `project-cache-search-service.md` · `intent-aware-content-access.md` · `video-content-understanding-for-editing.md`

---

## 一、背景

长篇漫画、剧本、视频、音频和生成资产会持续产生人物信息：

- 剧本中的人物名称、关系、对白和事件。
- 漫画图片中的角色外观、服装、动作、气泡文字和分格位置。
- 视频中的字幕、ASR 文本、画面 OCR、镜头边界和人物出现。
- 生成图片、TTS、视频和验证结果中的漂移、候选表现和 cue lineage。
- 用户在 Canvas、Cut、Dashboard 或 Agent 审阅中做出的人工确认。

当前仓库已经有两类关键共享契约：

- `CreativeEntityRef` / `CreativeEntityCandidate` / `EntityAssetBinding` / `RepresentationResolver`：统一创意实体与素材表现绑定。
- `CharacterObservation` / `CharacterEvidenceLedger` / `CharacterStateSnapshot` / `CharacterChangeEvent` / `CharacterGenerationContext`：渐进式人物记忆。

但这些目前主要是共享数据契约，还没有形成完整的全局运行时协议：每个子包如何动态贡献实体候选、人物记忆、OCR/字幕证据、媒体语义索引，以及哪些包可以确认事实、哪些包只能提交草稿，仍需要明确。

---

## 二、核心判断

Neko Suite 应采用：

```text
统一实体协议
  -> 人物记忆证据层
  -> 媒体/文本/感知语义索引
  -> 子包能力注册与贡献协议
  -> Agent / Dashboard 审阅确认
```

关键决策：

1. `CreativeEntityRef` 是全局身份锚点，不再为 character-memory 创建第二套人物身份。
2. `CharacterMemory` 是 append-only evidence 层，不自动改写实体事实、素材 metadata 或绑定。
3. OCR、字幕、ASR、画面描述和 PerceptionCard 的可索引投影进入语义索引，作为可追溯 evidence，不直接成为确认人物事实。
4. 各子包可以动态贡献实体候选、人物观察、媒体文本段和语义标签，但确认、合并、冲突处理必须经过 review/approval。
5. 工程文件可以保存语义 sidecar / index；原始媒体文件默认不被修改。
6. 子包对协议的支持应通过 capability registry typed facets 声明，而不是 Agent 或 Skill 硬编码。

---

## 三、架构三问

### 3.1 是否符合现有架构？

符合。

现有架构已经把职责分为：

- Story 管剧本事实和角色来源。
- Agent 管语义提取、编排和 review artifact。
- Canvas/Cut 管领域编辑和渲染。
- Assets 管素材文件和技术 metadata。
- Dashboard 管聚合审阅和导航。
- Engine/runtime-media 管 OCR、ASR、subtitle、probe、diff 等计算能力。

本 ADR 不改变这些边界，只补充跨包语义流通协议。

### 3.2 如何降低耦合？

通过四个协议层解耦：

- `CreativeEntityRef`：身份引用。
- `CharacterObservation`：人物证据。
- `MediaSemanticIndex` / `TextSegment`：媒体文本和语义索引。
- `EntityMemoryContribution`：子包贡献信封。

子包只提交 contribution，不直接调用其他子包内部 API，也不直接写确认事实。

### 3.3 是否易于扩展与测试？

易于扩展。

新增 OCR provider、字幕 extractor、Canvas 节点 analyzer、Cut timeline analyzer 或 Story parser 时，只需注册对应 facet 并输出标准 contribution。测试可以分别覆盖：

- 类型/validator。
- provider contribution。
- Agent review artifact。
- Dashboard accept/reject/conflict 操作。
- generation context assembly。

---

## 四、协议分层

### 4.1 统一实体层

统一实体回答：**这是谁 / 这是什么？**

已有共享契约：

```ts
interface CreativeEntityRef {
  entityId: string;
  entityKind: 'character' | 'scene' | 'object' | 'location' | 'style';
  projectRoot?: string;
  source?: string;
}
```

实体层拥有：

- confirmed entity。
- candidate entity。
- alias / canonical name。
- entity lifecycle。
- entity-to-asset binding。

实体层不拥有：

- OCR 文本。
- 原始媒体 payload。
- Agent 草稿结论。
- 未审阅的人物记忆。

### 4.2 人物记忆层

人物记忆回答：**我们为什么相信某个角色在某个范围内有什么状态？**

已有共享契约：

- `CharacterObservation`
- `CharacterEvidenceLedger`
- `CharacterStateSnapshot`
- `CharacterChangeEvent`
- `CharacterGenerationContext`

原则：

- observation 是 draft / reviewable。
- accepted observation 仍是 evidence，不自动改写 `CharacterRecord` 或 `EntityAssetBinding`。
- snapshot 是生成上下文的可用投影，不是永久事实本身。
- change event 显式记录长期演化。

### 4.3 媒体语义索引层

媒体语义索引回答：**这个素材里有哪些可检索、可引用、可追溯的语义证据？**

索引层需要同时对齐两类现有引用：

- `ContentStableSourceRef`：来自 `content-access.ts`，描述资产、文件、文档、媒体库或生成资产的稳定内容来源。`MediaSemanticIndex.sourceRef` 应优先使用它，因为索引首先属于某个可访问素材。
- `CharacterMemorySourceRef`：来自 `character-memory.ts`，描述 story / canvas-node / cut-range / artifact-resource / generated-asset / document / tool-result / manual 等可追溯证据位置。`MediaTextSegment.sourceRef` 应优先使用它，因为文本段后续会被投影为 `CharacterObservation.sourceRef`。

因此 ADR 不再引入未定义的 `StableResourceRef` 或 `StableSourceRef`。如果未来需要 `MediaSourceRef` 命名，也应只是上述两类引用的别名或小型适配层，而不是第三套来源系统。

建议新增或收敛为共享协议：

```ts
type MediaSemanticSourceRef = ContentStableSourceRef;
type MediaEvidenceSourceRef = CharacterMemorySourceRef;
type MediaTextSourceKind = CharacterObservationSource;

interface MediaBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  unit?: 'pixel' | 'normalized';
}

interface MediaTextRange extends CharacterMemorySourceRange {
  boundingBox?: MediaBoundingBox;
}

interface PerceptionCardRef {
  assetId: string;
  cacheKey?: string;
  sourceToolCallId?: string;
  contextPacketId?: string;
  createdAt?: number;
}

interface SemanticTag {
  tagId: string;
  label: string;
  confidence?: number;
  source?: MediaTextSourceKind;
}

interface MediaSemanticIndex {
  version: 1;
  assetId: string;
  sourceRef: MediaSemanticSourceRef;
  textSegments?: readonly MediaTextSegment[];
  entityMentions?: readonly EntityMention[];
  perceptionRefs?: readonly PerceptionCardRef[];
  semanticTags?: readonly SemanticTag[];
  updatedAt?: string;
}

interface MediaTextSegment {
  segmentId: string;
  kind: 'ocr' | 'subtitle' | 'asr' | 'caption' | 'script' | 'manual' | 'agent';
  text: string;
  language?: string;
  confidence?: number;
  sourceRef: MediaEvidenceSourceRef;
  range?: MediaTextRange;
  provenance: {
    providerId: string;
    toolCallId?: string;
    sourceKind: MediaTextSourceKind;
  };
}
```

V1 不要求一次性实现完整类型，但方向应明确：OCR/字幕/ASR 的结果必须是可引用 segment，而不是散落在 Agent 文本里。

`MediaTextSegment.provenance.sourceKind` 应与 `CharacterObservation.provenance.source` 使用同一组来源词汇，或在 validator 中提供显式映射。推荐映射如下：

| Media text 来源 | `sourceKind` / observation source | 推荐 `CharacterMemorySourceRef` |
|---|---|---|
| Story script / structured facts | `story` | `story` |
| 漫画页 OCR / panel caption | `comic` | `artifact-resource` + `pageId` / `panelId` |
| 视频字幕 / 视频 OCR / 镜头描述 | `video` | `artifact-resource` 或 `cut-range` |
| 音频 ASR | `audio` | `artifact-resource` 或 `cut-range` |
| 生成资产分析 | `generated-asset` | `generated-asset` |
| 文档导入 | `document` | `document` |
| Canvas 节点分析 | `canvas` | `canvas-node` |
| Cut timeline 元素 | `cut` | `cut-range` |
| 人工录入 | `manual` | `manual` |
| Agent 推断或整理 | `agent` | 原始 evidence 的 sourceRef，无法定位时才用 `tool-result` |

`sourceKind` 是来源分类和审阅排序信号，不是稳定身份。稳定身份必须由 `sourceRef` 和 `range` 承担。

`MediaTextRange` 在 V1 复用并扩展 `CharacterMemorySourceRange`，保持 story、comic、video、audio、document、canvas、cut 等证据可用同一套字段表达。它是扁平结构，字段较多但多数场景只会使用其中少数几个。P0 validator 应根据 `sourceRef.kind` 检查有效字段组合；如果长期出现大量无效组合或字段歧义，再升级为按 `sourceRef.kind` 区分的 discriminated union。

### 4.4 PerceptionCard 与语义索引的关系

`PerceptionCard` 是上游感知中间产物，仍归 `adr-agent-multimodal-perception.md` 的感知管线管理。`MediaSemanticIndex` 不嵌入完整 `PerceptionCard`，只保存轻量 `PerceptionCardRef`，并把其中适合检索的 evidence 投影为：

- `textSegments`：transcript、OCR、caption、description 中可检索的文本。
- `entityMentions`：可关联实体或候选实体的 mentions。
- `semanticTags`：稳定标签、镜头/画面语义、质量提示。

也就是说：

```text
PerceptionCard
  -> selected searchable projection
  -> MediaSemanticIndex
  -> CharacterObservation draft / review artifact
```

如果 PerceptionCard 重建或覆盖，语义索引可以根据 `assetId + cacheKey + sourceToolCallId/contextPacketId` 重建投影；索引自身不承担保存完整感知卡片的职责。

### 4.5 Contribution 信封

子包动态添加实体 / memory / media evidence 时，不应直接写最终事实。应输出标准 contribution：

```ts
interface EntityMemoryContribution {
  contributionId: string;
  sourcePackage: string;
  sourceRef: CharacterMemorySourceRef;
  entityCandidates?: readonly CreativeEntityCandidate[];
  characterObservations?: readonly CharacterObservation[];
  mediaTextSegments?: readonly MediaTextSegment[];
  assetRequirements?: readonly EntityAssetRequirement[];
  diagnostics?: readonly ContributionDiagnostic[];
  reviewPolicy: 'draft-only' | 'source-approved' | 'requires-user-review';
}

interface ContributionDiagnostic {
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  code: string;
  message: string;
  path?: readonly CharacterMemoryPathSegment[];
  sourceRef?: CharacterMemorySourceRef;
}
```

这让 Story、Canvas、Cut、Assets、Agent、runtime-media 都能贡献证据，但不获得确认事实的权限。

`reviewPolicy` 只控制 contribution 进入审阅系统时的默认处理方式，不等于自动确认：

| policy | 默认含义 | 不允许做什么 |
|---|---|---|
| `draft-only` | 只作为草稿证据，默认 `reviewStatus = draft` | 不进入自动确认队列 |
| `requires-user-review` | 默认 `reviewStatus = needs-review` | 不跳过用户或 delegated reviewer |
| `source-approved` | 来源包已做初步验证，可进入快速审阅或提高排序权重 | 不直接写 `accepted`，不直接改 confirmed facts |

如果 L4 事实源需要创建 accepted observation，必须通过明确的 source-delegated lifecycle command 或用户确认事件完成，而不是由 contribution 的 `reviewPolicy` 单独完成。

---

## 五、子包动态支持

### 5.1 支持等级

每个子包对全局协议可以有不同支持等级：

| 等级 | 能力 | 示例 |
|---|---|---|
| L0 引用 | 只保存/显示 `CreativeEntityRef` | Canvas shot character |
| L1 消费 | 消费 entity/memory 作为上下文 | Cut voice cue speaker |
| L2 贡献 | 输出 candidate / observation / text segment | OCR、ASR、Storyboard extraction |
| L3 审阅 | 展示 accept/reject/conflict UI | Agent artifact、Dashboard |
| L4 事实源 | 写 confirmed entity 或 binding | Entity service、Story-owned character registry、Asset binding service |

大多数子包只应做到 L0-L2。L4 必须非常少。

### 5.2 Registry facets

建议在 Capability Protocol 下增加 typed facets，而不是另建平行 registry：

```text
CapabilityContribution / AgentArtifactFacetsContribution
  └─ artifactFacets
      ├─ entityProviderFacet
      ├─ entityMemoryContributorFacet
      ├─ mediaTextExtractorFacet
      ├─ perceptionProviderFacet
      ├─ semanticIndexProviderFacet
      ├─ reviewSurfaceFacet
      └─ representationResolverFacet
```

这些 facet 是现有 capability contribution 的 typed fields / typed views，不是新的并行 registry，也不要求 `AgentCapabilityProvider` 立即增加同名运行时方法。Provider 可以继续通过既有入口声明 tools、skills、prompt fragments、provider cards 和 artifact facets；Agent / Dashboard / 子包只从注册结果中读取这些 typed facets 来判断：

- 哪个包能贡献 `EntityMemoryContribution`。
- 哪个包能抽取 `MediaTextSegment`。
- 哪个包能展示 review surface。
- 哪个包拥有 delegated write / confirm 权限。

换句话说，facet 描述“系统能做什么和由谁声明”，具体执行仍由已有 capability/provider command、tool 或 delegated operation 完成。这样能避免 Agent 核心硬编码包名，也避免在 Capability Protocol 之外再维护一套注册生命周期。

子包注册：

```text
neko-story
  entityProviderFacet
  entityMemoryContributorFacet(script facts)

neko-cut
  mediaTextExtractorFacet(subtitle / asr)
  entityMemoryContributorFacet(dialogue / speaker cues)

neko-canvas
  entityMemoryContributorFacet(shot-local role/action/continuity)
  reviewSurfaceFacet(lightweight inspect)

neko-assets
  semanticIndexProviderFacet(asset metadata / sidecars)
  representationResolverFacet(asset bindings)

neko-agent
  orchestration
  extraction
  review artifact projection

neko-dashboard
  reviewSurfaceFacet
  source-delegated confirmed operations
```

---

## 六、OCR / 字幕 / ASR 是否进入索引

结论：**需要进入索引，但必须作为 evidence，不是 confirmed fact。**

### 6.1 为什么需要

长篇创作的一致性依赖大量文本证据：

- 漫画气泡文字帮助识别说话者、语气和剧情信息。
- 视频字幕 / ASR 是角色对白、声音风格、口头禅的来源。
- 图片 OCR 可读取信件、招牌、屏幕 UI、对白框。
- Cut timeline subtitle 是编辑态文本，可能比源视频 ASR 更权威。
- Story script 是结构化文本，应优先于 OCR/ASR。

如果这些文本不进入项目级索引，Agent 每次只能依赖短上下文重新分析，长篇一致性会退化。

### 6.2 索引原则

- OCR/ASR/subtitle extraction 可以在明确请求、idle、导入后任务或生成后验证中执行。
- 基础项目打开不应阻塞在 OCR、embedding 或大媒体 probing 上。
- 索引保存 stable refs、range、confidence、provider，不保存大图、大音频或 base64。
- OCR/截图只能作为视觉证据，不能替代结构化 query 的 nodeId、clipId、fieldPath。
- 可写操作必须回到结构化 editor / project API。
- 本地 OCR 应作为图片/漫画/视频帧文本提取的第一层默认能力；Vision LLM OCR 作为低置信、复杂版式、手写/艺术字或语义分类增强的兜底，而不是唯一入口。
- 本地 OCR 结果必须先落为 `MediaTextSegment(kind: "ocr")`，再由 mention resolver / Agent 投影为 `EntityMention`、`CharacterObservation` 或 review artifact；不能把 OCR 文本直接写成确认实体事实。

### 6.3 文本来源优先级

推荐优先级：

```text
用户确认事实
  > Story / script structured facts
  > Timeline subtitle elements
  > Imported subtitle tracks
  > ASR transcript
  > OCR text
  > VLM description
  > Agent inference
```

这是运行时审阅与排序策略，不是编译期 enum ordinal，也不应被硬编码为所有场景通用的绝对比较函数。具体实现应通过以下信号组合判断：

- `MediaTextSegment.provenance.sourceKind` / `CharacterObservation.provenance.source` 表示来源类别。
- `confidence` 表示 provider 对该条 evidence 的置信度。
- `reviewStatus` 表示是否已经被人或 delegated reviewer 接受。
- `sourceRef` / `range` 表示 evidence 是否可追溯、可复核。
- profile / skill 可以给特定任务提供排序倾向，但不能越权确认事实。

低优先级证据可以提出观察，但不能覆盖高优先级事实。比如 OCR 读到的对白可以生成 `needs-review` observation；如果它与 Story structured facts 冲突，应进入 conflict review，而不是直接覆盖剧本事实。

### 6.4 本地 OCR 作为第一层感知

长篇漫画、文档图片和视频帧需要低成本、可缓存、可复用的文本索引。Neko Suite 应优先提供本地 OCR provider，并把云端 Vision LLM OCR 定位为增强层：

```text
本地 OCR
  -> MediaTextSegment(kind="ocr")
  -> EntityMention extraction
  -> Mention Resolver
  -> CreativeEntityRef / CreativeEntityCandidate
  -> CharacterObservation / review
```

本地 OCR provider 的职责：

- 从图片、漫画页、文档页截图、视频抽帧中提取文本。
- 输出 `text`、`confidence`、`language`、`boundingBox`、`sourceRef`、`range` 和 provider provenance。
- 按 source/page/panel/frame 生成可重建的 segment id，方便幂等更新。
- 将结果写入 `.neko/semantic-index` sidecar 或 project search 投影，供中段文档分析、角色 mention resolution、分镜、字幕和去字 mask 流程复用。

本地 OCR 不负责：

- 直接确认角色身份或修改 `CreativeEntity`。
- 自动决定对白归属、旁白分类或代词消解。
- 持久化原始图片、base64、Webview URI、provider 临时句柄或绝对缓存路径。

Vision LLM OCR / VLM 可以在以下情况介入：

- 本地 OCR 置信度低或文本区域过于复杂。
- 需要区分对白、旁白、背景字、拟声词、UI 文本或招牌。
- 需要结合画面判断气泡归属、人物位置或阅读顺序。
- 需要对 OCR 结果进行语义纠错，但纠错结果仍必须带 provenance 和 confidence。

---

## 七、工程文件和媒体文件中的语义信息

### 7.1 是否需要

需要。但默认写入工程 sidecar / index，不修改原始媒体文件。

推荐布局：

```text
.neko/
  entity-bindings.json
  character-memory.json
  semantic-index/
    media-index.json
    text-segments/
    perception-cards/
    entity-mentions/
  .cache/
    thumbnails/
    embeddings/
```

### 7.2 存储边界

| 存储位置 | 可保存 | 不应保存 |
|---|---|---|
| 原始媒体文件 | 默认不写 | OCR、Agent 结论、项目内 entity id |
| asset metadata | 技术 metadata、轻量标签、sidecar ref | confirmed 人物事实 |
| `.neko/semantic-index` | OCR/ASR/subtitle/text segment、PerceptionCard refs | base64、webview URI、绝对路径 |
| `character-memory.json` | observation、snapshot、change event | 原始媒体 payload |
| `entity-bindings.json` | entity-to-asset binding | 未审阅观察 |

结构化持久化策略沿用 `adr-structured-data-persistence.md`：

- JSON / JSONL / 工程文件仍是 SSOT，适合 Git、人工审阅和 Agent 读写。
- SQLite / FTS / vector index 只作为 `.neko/.cache/` 下的派生缓存或查询投影。
- `CharacterEvidenceLedger`、`MediaSemanticIndex`、entity bindings 和 text segments 可以进入 Tier 1 查询缓存，但写入路径必须先落 SSOT，再由 watcher / indexer 重建缓存。
- cache DB 损坏、缺失或版本不匹配时可删除重建，不应丢失人物记忆或语义证据。

### 7.3 什么时候可以写进媒体包

如果媒体是 Neko 生成或管理的 package，可以写入受控 sidecar：

```text
asset-package/
  media.png
  metadata.json
  semantic.json
```

但对于用户导入的外部视频、图片、音频，默认保持原文件不变。

---

## 八、推荐数据流

### 8.1 从媒体到人物记忆

```text
Image / Video / Audio / Document
  -> runtime-media / perception provider
  -> OCR / ASR / subtitle / vision evidence
  -> MediaTextSegment / PerceptionCard
  -> EntityMention
  -> CharacterObservation(draft)
  -> CompositeArtifact / GenericTable review
  -> user accepts / rejects / marks conflict
  -> CharacterEvidenceLedger
  -> CharacterStateSnapshot
  -> CharacterGenerationContext
```

### 8.2 从子包到统一实体

```text
subpackage local state
  -> EntityMemoryContribution
  -> Agent / Dashboard review
  -> Entity service validates lifecycle action
  -> confirmed CreativeEntity / Candidate / Binding / Memory update
```

### 8.3 从记忆到生成

```text
Storyboard shot / Canvas node / Cut cue
  -> CreativeEntityRef
  -> active CharacterStateSnapshot
  -> RepresentationResolver
  -> CharacterGenerationContext
  -> image / video / TTS generation
  -> GeneratedAsset lineage
  -> draft observations for drift / validation
```

---

## 九、权限与安全

1. Skill 只能约束输出倾向和 profile，不授予写入能力。
2. Agent 可以生成 draft contribution，不直接确认事实。
3. 子包 provider 必须声明 capability、risk、approval。
4. Dashboard 可以发起确认操作，但确认仍应走 source-delegated command。
5. OCR、ASR、VLM 结果必须带 confidence 和 provenance。
6. 持久化数据只保存 stable refs 或 `${VAR}/path`，不保存 runtime handle。
7. Webview 只消费投影后的 URI，不持久化 webview URI。

---

## 十、实施建议

### P0: 契约收敛

- 明确 `EntityMemoryContribution` 共享类型。
- 明确 `MediaTextSegment` / `MediaSemanticIndex` 最小类型。
- 将 `ContentStableSourceRef`、`CharacterMemorySourceRef`、PerceptionCard asset refs、`MediaTextSegment.sourceRef` 的语义对齐。
- 定义 `MediaBoundingBox`、`PerceptionCardRef` 和 `sourceKind -> CharacterObservation.provenance.source` 映射。
- 定义 contribution validator：safe refs、bounded JSON、confidence、review policy。
- 明确 `reviewPolicy` 只设置默认审阅入口，不授予 accepted 写入权限。

### P1: Agent 与 Dashboard 审阅

- Agent 将 OCR/ASR/漫画分析结果投影为 review artifact。
- Dashboard 提供统一 review surface：accept / reject / conflict / supersede。
- Dashboard Webview 只发送 `DashboardCreativeEntityActionRequest` + `memoryReviewId`；具体写入由拥有该实体的 `DashboardCreativeEntitySource` 执行。
- `neko-entity` 作为中立 source 首先接入 `CharacterEvidenceLedgerStore`，将 reviewable `CharacterObservation` 投影为 `memoryReviews`，并通过共享 character-memory operation 更新 accepted / rejected / conflict / superseded 状态。
- 所有接受操作必须保留 source-delegated lifecycle / store boundary，不允许 Dashboard 直接写 `character-memory.json` 或实体事实。

### P2: 子包贡献 facet

- Story 注册 script/entity provider。
- Cut 注册 subtitle/ASR/text segment contributor。
- Canvas 注册 shot-local observation contributor。
- Assets 注册 semantic index provider 和 asset sidecar resolver。

### P3: 语义索引与检索

- `.neko/semantic-index` 支持分页和按 asset/source 查询。
- 本地 OCR provider 支持 image/comic/document-page/video-frame 的 on-demand 与 idle extraction，并输出 `MediaTextSegment(kind="ocr")`。
- OCR/ASR/subtitle extraction 支持 idle/on-demand；本地 OCR 为第一层默认文本提取，Vision LLM OCR 为增强/兜底 provider。
- embedding/vector/RAG 作为 optional provider capability，不进入基础必需路径。
- 按 `adr-structured-data-persistence.md` 将语义索引投影到 SQLite / FTS / vector cache；JSON/sidecar 继续作为 SSOT。

---

## 十一、开放问题

1. `MediaSemanticIndex` 是否应作为 `project-cache-search-service` 的 typed projection，还是独立 `.neko/semantic-index`？
2. OCR/ASR 文本的语言检测、分词和 embedding 是否由 runtime-media、agent platform，还是 search provider 负责？本地 OCR provider 应先输出语言/置信度的基础字段，后续分词和 embedding 可由 search/index provider 接管。
3. GeneratedAsset 的 semantic sidecar 是否应进入 asset package 标准格式？
4. `MediaSemanticIndex` 与 `PerceptionCard` 的重建策略应由哪个服务触发：perception pipeline、asset indexer，还是 project cache coordinator？

---

## 十二、结论

统一实体和 character-memory 已经具备全局协议基础，但仍需要补一个跨子包的 contribution / semantic-index 运行时协议。

最终方向：

- `CreativeEntityRef` 做身份锚点。
- `CharacterMemory` 做可审阅证据层。
- OCR、字幕、ASR、PerceptionCard 的可索引投影进入媒体语义索引。
- 子包通过 capability typed facets 动态贡献证据。
- Agent 编排提取和 review artifact。
- Dashboard / 用户确认后才写入长期实体和记忆。
- 工程保存语义 sidecar，原始媒体文件保持干净。
