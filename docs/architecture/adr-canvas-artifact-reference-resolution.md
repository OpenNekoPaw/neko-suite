# ADR: Canvas 与 Artifact 稳定引用解析和生成注入协议

**状态**: Proposed (2026-06-09)
**范围**: `@neko/shared` · `neko-canvas` · `neko-agent` · `neko-cut` · `neko-assets` · Extension Host · media provider adapters
**关联**: `agent-asset-ref-contract.md` · `agent-media-architecture.md` · `adr-comic-to-animation-image-prep.md` · `adr-unified-entity-memory-semantic-index.md` · `creative-entity-asset-composition.md` · `adr-composite-artifact-table-protocol.md` · `adr-capability-protocol.md` · `adr-canvas-preview-boundary.md`

---

## 一、背景

Canvas、Agent artifact 和媒体 provider 已经同时需要“引用其他素材”的能力：

- `ShotNode` 需要引用源漫画 panel、上一镜头、角色参考、mask、已生成关键帧和视频提示词。
- `GalleryNode` 需要引用角色三视图、表情、服装、姿势和风格参考。
- `MediaNode`、`DocumentNode`、`ScriptNode` 需要引用文件、漫画页、剧本、OCR/ASR/字幕索引片段。
- `SceneGroupNode`、`StoryboardNode` 需要引用场景级连续性、镜头组和布局信息。
- `entity`、`representation-slot`、`occurrence`、`generated-asset` 等注册节点需要引用统一实体、形象槽位、视觉出现证据和生成资产。
- `ShotImagePrepPlan`、`CompositeArtifact`、`GenericTable` 等 Agent 产物需要携带引用，供 Canvas 审阅和 provider 执行。

当前系统已经有若干局部实现：

- Canvas 节点可保存 `referenceImageResourceRef`、`referenceResourceRef`、`referenceImagePath` 等字段。
- Extension Host 可把部分 document/archive ref 投影为 runtime-only preview URI。
- Agent runtime 可从 Canvas `referenceRefs` 解析部分 IP-Adapter refs。
- `ShotImagePrepPlan` 可以表达 `sourceMediaRefs`、`maskRefs`、`referenceBundle`、`outputMediaRefs`。
- `TransformImage` / `GenerateImage` 工具需要真实 provider 输入，例如 `sourceImageUri`、`referenceImageUri`、`referenceImageBase64`、`maskUri`、`ipAdapterRefs`。

主要缺口是：**快速展示引用**和**生成时引用注入**还没有统一协议。节点或 artifact 中的 stable refs 不能直接等价于 provider 可消费输入；Webview preview URI、blob/data URL、绝对路径和 provider 临时句柄也不能进入持久化数据。

---

## 二、核心判断

Neko Suite 应采用通用的稳定引用解析协议：

```text
CanvasNode / CompositeArtifact / ShotImagePrepPlan / Entity Memory
  -> collectStableReferences()
  -> validateReferenceDescriptors()
  -> resolveStableRefsInHost()
  -> buildProviderInputs()
  -> GenerateImage / TransformImage / GenerateVideo / TTS 等能力
  -> backfill output refs / lineage / diagnostics
```

关键决策：

1. 引用协议不绑定 `ShotNode`。`ShotNode` 是 comic-to-animation 的高价值入口，但底层 resolver 必须支持通用 Canvas 节点和 Agent artifact。
2. 持久化层只保存 stable refs、语义用途和审阅状态；runtime preview URI 和 provider 临时输入只存在于运行时。
3. Agent 负责选择语义引用，Canvas 负责展示和审阅引用，Extension Host 负责把 stable refs 解析为真实 IO，provider 只接收已解析输入。
4. `entityRef` 不是 provider 可消费的图像输入。人物一致性必须通过 `entityRef -> memory / representation resolver -> visual asset refs -> host-resolved inputs` 注入。
5. 引用解析失败必须产生 diagnostic，不得伪造成 prompt 文本或已执行结果。
6. 引用收集通过 capability registry 的 typed facet 注册，不新建与 capability protocol 并行的 registry 地基。
7. resolver 必须支持批量解析、去重、缓存和 severity-aware diagnostic，避免长篇 storyboard / canvas 的引用完整性检查退化为逐项 IO。

---

## 三、架构三问

### 3.1 是否符合现有架构？

符合。

该方案延续现有职责边界：

- Agent 管语义选择、计划生成和审阅 artifact。
- Canvas 管节点展示、用户审阅和交互编辑。
- Extension Host 管文件系统、Webview URI、权限校验、缓存和 provider IO。
- Provider adapter 管真实生成/转换能力。
- `@neko/shared` 管稳定契约、validator 和纯 projector。

Webview 不直接访问 Node.js / VSCode API；provider 不直接理解 Canvas 内部节点；Agent 不持久化 runtime URI。

### 3.2 如何进一步降低耦合？

通过三层引用对象解耦：

| 层 | 作用 | 是否持久化 |
|---|---|---|
| stable reference | 表达“引用谁、用途是什么、来源在哪里” | 是 |
| runtime projection | 表达“当前 Webview 如何预览” | 否 |
| provider input | 表达“当前 provider 调用如何消费” | 否，最多记录 lineage |

Canvas、Agent、Cut 不需要知道 provider 支持 URL、base64 还是 IP-Adapter；它们只提交 stable refs 和 reference intent。Extension Host 根据 provider capability 和权限策略生成具体输入。

### 3.3 是否易于扩展与测试？

易于扩展。

新增节点类型、artifact block、provider 输入类型时，只需要：

- 注册 reference contributor / collector。
- 注册 resolver 或 materializer。
- 增加 provider input adapter。
- 补充 validator 和 diagnostic。

测试可以分别覆盖 stable ref 收集、unsafe ref 拦截、Webview preview 投影、provider input 构造、失败 diagnostic、backfill lineage 和 Webview 重建恢复。

---

## 四、五层分析

| 层 | 职责 | 归属 |
|---|---|---|
| 职责 | 区分语义引用、展示预览、provider 输入、执行回填 | shared / canvas / agent / host / provider |
| 依赖 | stable refs -> host resolver -> provider adapter -> output refs | 单向依赖，避免 provider 依赖 Canvas |
| 接口 | `ReferenceDescriptor`、resolver request/result、diagnostic、lineage | `@neko/shared` 优先 |
| 扩展 | 新节点、新 artifact、新 provider 通过 registry/facet 接入 | capability registry / renderer registry |
| 测试 | collector、validator、resolver、preview、provider input、backfill | shared / extension / agent / canvas |

---

## 五、术语

### 5.1 Stable Reference

Stable reference 是可以写入项目文件、sidecar 或 artifact 的稳定引用。它只表达身份、来源、用途和审阅状态，不包含运行时句柄。

示例：

- `ResourceRef`
- `DocumentArchiveResourceRef`
- `StoryboardMediaRef`
- `CreativeEntityRef`
- `CharacterReferenceRef`
- `SceneReferenceRef`
- `VisualOccurrence.cropRef`
- `GeneratedAsset` / generated media ref
- Canvas node id + port/cell/slot reference
- semantic index range / memory observation id

### 5.2 Runtime Projection

Runtime projection 是为了当前 Webview 或当前会话展示而生成的临时 URI 或状态。

示例：

- `runtimeReferenceImagePath`
- Webview URI
- 临时 preview URL
- 缓存缩略图路径
- provider 任务临时 URL

Runtime projection 不允许写入持久化节点、artifact 或长期 memory。

### 5.3 Provider Input

Provider input 是真实工具调用需要的输入格式。

示例：

- `sourceImageUri`
- `referenceImageUri`
- `referenceImageBase64`
- `maskUri`
- `ipAdapterRefs`
- image-to-video keyframe URI
- audio stem URI

Provider input 由 Extension Host 或授权 provider adapter 在执行前构造；Agent / Canvas 只看到 stable refs 和 diagnostic。

---

## 六、支持的引用来源

### 6.1 Canvas 节点

| 节点 | 引用用途 |
|---|---|
| `ShotNode` | 源图、关键帧、前后镜头、mask、图像准备计划、视频提示词 |
| `GalleryNode` | 角色三视图、表情、服装、姿势、风格参考 |
| `MediaNode` | 图片、视频、音频源文件、帧截图、波形、缩略图 |
| `DocumentNode` | PDF/DOCX/EPUB/CBZ 页面、OCR 文本、封面、页面范围 |
| `ScriptNode` | 剧本 scene、角色对白、旁白、段落范围 |
| `SceneGroupNode` | 场景布局、镜头组、地点连续性、道具连续性 |
| `StoryboardNode` | 分镜表、shot/scene 范围、storyboard artifact |
| `entity` | 统一实体身份、候选实体、别名、确认状态 |
| `representation-slot` | 角色/场景/道具的可生成形象槽位 |
| `occurrence` | 视觉出现证据、bbox/crop、时间/页面范围 |
| `generated-asset` | 已生成图片、视频、音频、候选版本和 lineage |
| `ModelNode` | pose、layout、camera、3D reference |
| `CanvasEmbedNode` | 子画布、工作流或上下文引用 |

### 6.2 Agent Artifact

Artifact 中可携带引用，但不直接执行 IO：

- `CompositeArtifact` 的 media/gallery/table/domain block。
- `GenericTable` 的 `media-preview`、`resource`、`json` cell。
- `ShotImagePrepPlan` 的 `sourceMediaRefs`、`maskRefs`、`referenceBundle`。
- `PerceptionCard` 的 panel、OCR、bbox、mask 和 candidate evidence refs。
- `CharacterMemory` 的 observation ids、source ranges 和 visual evidence refs。

Artifact renderer 只能展示和审阅这些引用；执行前必须通过 host-side resolver。

### 6.3 与 CompositeArtifact / GenericTable 的关系

`adr-composite-artifact-table-protocol.md` 仍是 artifact / table 序列化结构的 SSOT；本 ADR 不替代 `CompositeArtifact`、`GenericTable`、cell type 或 profile descriptor。

本 ADR 是**引用解析与执行注入的 SSOT**。也就是说：

- `GenericTable` 的 `media-preview` / `resource` / `json` cell 可以继续使用其既有 cell payload 格式。
- 任何可用于 Canvas 预览、provider 执行、Cut handoff 或长期 memory 的 cell payload，都必须能投影为 `ReferenceDescriptor`。
- 如果某个 cell 只能展示、不能被投影为 `ReferenceDescriptor`，renderer 可以显示它，但不能暴露执行动作。
- Profile 可以约束某列必须可投影为特定 role 的 reference，例如 `source-panel`、`mask`、`character-reference`、`keyframe`。
- Artifact validator 负责 cell 形状与 profile 约束；reference validator 负责 stable ref 安全性、可解析性和 provider 输入可用性。

边界可以概括为：

```text
CompositeArtifact / GenericTable = 展示与审阅 payload 的 SSOT
ReferenceDescriptor              = 跨子包解析、执行、回填引用的 SSOT
```

### 6.4 现有字段归一化策略

项目尚未上线，因此不需要为当前内部字段设计长期 legacy 兼容层。现有 Canvas / Agent 字段应通过 adapter 投影到 `ReferenceDescriptor`，作为 P1/P2 实施期的内部归一化路径；新功能应逐步收敛到 `ReferenceDescriptor`，避免继续扩张散落字段。

| 现有字段 / 结构 | 投影方向 | 兼容策略 |
|---|---|---|
| `referenceImageResourceRef` | image reference descriptor，常用于 `source` / `reference` / `subject` role | 实施期可读；新写入优先使用标准 descriptor |
| `referenceResourceRef` | generic resource descriptor | 实施期可读；media type 不明确时标记 `needs-review` |
| `referenceImagePath` | transitional image path descriptor | 仅作为内部过渡输入；若是绝对路径或 runtime path，产生 warning/error diagnostic |
| `runtimeReferenceImagePath` | runtime projection | 只读展示字段；禁止持久化为 stable ref |
| Canvas `referenceRefs` | node/gallery/generated asset references | 通过 Canvas reference contributor 投影；保留现有生成入口 |
| `sourceMediaRefs` | source media descriptors | 作为 `source` / `source-panel` role 投影 |
| `maskRefs` | mask descriptors | 作为 `mask` role 投影 |
| `referenceBundle.characterRefs` | entity + visual asset descriptors | 先解析 entity representation，再投影为 subject reference |
| `referenceBundle.sceneRefs` | scene/location descriptors | 先解析 scene representation / asset refs，再投影为 layout/continuity reference |
| `generatedMediaRefs` / `outputMediaRefs` | generated output descriptors | 作为 output/keyframe reference；保留 lineage |

归一化规则：

- P1/P2 保留现有内部字段读取路径，新增 adapter 和 validator，不要求一次性改写所有开发期 fixture。
- 如果新 `ReferenceDescriptor` 与旧散落字段同时存在，执行路径优先使用新 descriptor，旧字段只用于展示或测试过渡。
- 新代码不应继续扩张散落字段；需要新增引用语义时优先新增 contributor / descriptor role。
- 项目正式对外稳定前，应停止写入可替代的旧散落字段；是否需要工程文件版本迁移由未来上线前的格式冻结决策处理。

---

## 七、职责边界

### 7.1 Agent

Agent 负责：

- 从故事、素材、memory、semantic index 中选择语义引用。
- 生成 `referenceBundle`、`sourceMediaRefs`、`maskRefs`、artifact table 和 diagnostics。
- 判断哪些引用需要用户审阅。
- 生成 provider-agnostic 的 image/video/audio prompt。

Agent 不负责：

- 把 stable ref 转成 Webview URI。
- 读取任意本地文件并编码 base64。
- 把 runtime URL 写进 artifact。
- 绕过 approval gate 调用有费用 provider。

### 7.2 Canvas

Canvas 负责：

- 展示节点引用摘要、引用详情、before/after、diagnostics。
- 允许用户添加、删除、替换、锁定和批准引用。
- 保存 stable refs 和审阅状态。
- 将节点引用发送给 Agent 或 host-side resolver。

Canvas 不负责：

- 猜 provider 需要 URL 还是 base64。
- 持久化 runtime preview URI。
- 直接调用 provider adapter。

### 7.3 Extension Host

Extension Host 负责：

- 校验 ref 权限、工作区边界和 unsafe runtime handle。
- 解析项目相对路径、`${VAR}/path`、document archive ref、resource cache ref。
- 生成 Webview preview URI。
- 在 provider 执行前构造 `sourceImageUri`、`referenceImageBase64`、`maskUri`、`ipAdapterRefs` 等输入。
- 记录 output refs、lineage、diagnostics 和 cache metadata。

### 7.4 Provider Adapter

Provider adapter 负责：

- 声明可接受的输入形态和成本/并发约束。
- 执行真实生成、转换、TTS、ASR、OCR 或 video provider 调用。
- 返回稳定 output refs 和结构化失败信息。

Provider adapter 不应依赖 Canvas 节点内部结构。

### 7.5 Cut

Cut 负责：

- 消费已锁定关键帧、视频提示词、音频/对白 cue 和 timeline-ready refs。
- 对视频生成输入再次请求 host resolver。
- 不重新解析漫画页来猜图像准备结果。

---

## 八、解析流程

### 8.1 收集引用

`collectStableReferences()` 应面向通用输入：

```text
CanvasNode
CompositeArtifact
GenericTable row/cell
ShotImagePrepPlan
CharacterMemory / Entity Memory
StoryboardTable
```

输出应包含：

- reference id。
- source object id。
- reference kind。
- intended role，例如 `source`、`subject`、`style`、`mask`、`layout`、`previous-shot`、`keyframe`。
- target modality，例如 `image`、`video`、`audio`、`text`、`model`、`document`。
- confidence / needs-review / diagnostics。

### 8.2 Contributor 注册与发现

引用收集使用 capability registry 的 typed facet。`ReferenceContributor` 是 capability contribution 的一个 facet / view，不是第四套并行 registry。

推荐契约草案：

```ts
type ReferenceSourceKind =
  | 'canvas-node'
  | 'canvas-document'
  | 'composite-artifact'
  | 'generic-table'
  | 'shot-image-prep-plan'
  | 'character-memory'
  | 'storyboard-table';

interface ReferenceContributorManifest {
  readonly contributorId: string;
  readonly packageName: string;
  readonly sourceKinds: readonly ReferenceSourceKind[];
  readonly nodeTypes?: readonly CanvasNodeType[];
  readonly artifactBlockKinds?: readonly string[];
  readonly tableProfiles?: readonly string[];
  readonly producedRoles?: readonly ReferenceRole[];
  readonly supportedModalities?: readonly ReferenceModality[];
}

interface ReferenceContributor {
  readonly manifest: ReferenceContributorManifest;
  collect(input: ReferenceCollectionInput): readonly ReferenceDescriptor[];
}

interface ReferenceCollectionInput {
  readonly sourceKind: ReferenceSourceKind;
  readonly sourceId: string;
  readonly source: unknown;
  readonly context: ReferenceCollectionContext;
}
```

注册规则：

- `@neko/shared` 定义 manifest、descriptor、diagnostic 和纯 validator。
- 各子包通过 capability contribution 注册 contributor manifest。
- Webview 侧 contributor 只能做纯数据投影；需要文件、缓存、OCR/ASR 或 provider IO 的解析必须交给 Extension Host resolver。
- Agent 可以发现 contributor 的 manifest，用于理解“某类节点/表格能产出哪些 reference role”，但不能因此获得 provider 执行权限。
- 未注册 contributor 的节点仍可通过通用 JSON/path/resource fallback 展示，但不暴露执行动作。

### 8.3 校验引用

必须拒绝或标记：

- `blob:`、`data:`、`file:`、`vscode-resource:`、`localhost`、绝对路径。
- 指向工作区外且未授权的路径。
- provider 临时 URL。
- 缺失 media type 或 source range 的引用。
- `entityRef` 没有可用 representation/asset 的情况。

### 8.4 展示投影

Webview 展示时：

```text
stable ref
  -> host materializer
  -> runtime preview URI
  -> Canvas / Agent Webview render
```

`runtimeReferenceImagePath` 这类字段只用于当前会话展示，不是 stable ref 本体。Webview 重建时应重新 materialize，而不是依赖旧 URI。

### 8.5 生成注入

Provider 执行前：

```text
stable refs + provider capability + user approval
  -> host resolver
  -> provider input bundle
  -> provider adapter
```

不同能力的注入优先级：

- `TransformImage`：source image 必须来自 `sourceMediaRefs` / `sourcePanelRefs` / selected node output；mask 来自 `maskRefs`；角色/场景/风格参考解析为 reference image 或 `ipAdapterRefs`。
- `GenerateImage`：prompt 为核心；角色 refs 作为 subject references；style refs 作为 style references；scene/previous-shot/source refs 作为构图和连续性参考。
- `GenerateVideo`：优先使用已锁定 keyframe / `generatedMediaRefs` / `outputMediaRefs`；motion/camera prompt 只补充运动语义。
- `TTS`：speaker entity 解析为 voice profile / voice sample refs；对白文本来自 voice cue，不从图片 prompt 猜测。
- `ASR/OCR/Perception`：输入来自 media/document refs；输出写入 semantic index 或 PerceptionCard，不直接变成 confirmed entity。

### 8.6 回填

执行结果回填为 stable refs：

- `outputMediaRefs`
- `generatedMediaRefs`
- Canvas node selected candidate。
- `generated-asset` 节点或 asset index。
- `ArtifactExecutionSummary`
- lineage：source refs、prompt、provider、model、cost、diagnostics。

回填不得覆盖源引用；派生结果必须保留 source lineage。

### 8.7 批量解析、缓存与性能

长篇 storyboard / canvas 可能包含数十到数百个节点，每个节点包含多个 stable refs。resolver 必须提供批量接口，避免逐节点、逐引用触发重复 IO。

推荐批量流程：

```text
collectStableReferences(canvas/artifact)
  -> normalize + deduplicate by stable reference key
  -> resolveBatch(request, { purpose, providerId, targetCapability })
  -> cache preview/provider materialization by ref key + purpose + provider input kind
  -> fan out results back to per-node / per-row diagnostics
```

批量策略：

- 同一 stable ref 在一次 batch 中只解析一次。
- preview materialization、provider input materialization、metadata probe 分开缓存，避免把 preview URI 当 provider input 复用。
- resolver 应支持 `maxConcurrency`、取消、超时和 partial result。
- 对大批量 provider input 解析，应先运行 dry-run / estimate 模式，只返回可用性、成本和缺失项，不读取或编码全部大文件。
- 缓存 key 必须包含 ref identity、source revision、target purpose、provider input kind；源文件或 sidecar 更新后应失效。
- 批量完整性检查应输出聚合 summary 和 per-reference diagnostic，便于 Canvas / Agent Webview 在表格中定位具体问题。

---

## 九、统一实体和人物一致性

`entityRef` 只回答“是谁”，不回答“用哪张图生成”。

人物一致性注入应走：

```text
CreativeEntityRef
  -> Character Memory / Entity Memory
  -> RepresentationResolver
  -> accepted visual asset refs / occurrence crop refs / gallery refs
  -> host-resolved provider inputs
```

规则：

- 如果实体没有 confirmed representation，应生成 candidate reference 和 needs-review diagnostic。
- 如果当前镜头时间点与角色外观变化事件冲突，应按 story continuity snapshot 选择对应 reference set。
- 如果同一角色有多个形象阶段，不能只按 entityId 取最新图；需要结合 scene/shot/page/time range。
- 如果素材中新出现角色无法匹配已有实体，Agent 可以创建 candidate entity / observation，但不能自动写 confirmed entity。

---

## 十、诊断与降级

Reference diagnostic 必须携带 severity，避免把“可继续审阅”和“阻断执行”的问题混在一起。

常见 diagnostic：

| code | severity | 是否阻断执行 | 场景 |
|---|---|---:|---|
| `reference-unresolved` | `error` | 是 | stable ref 无法解析 |
| `reference-unsafe-runtime-handle` | `error` | 是 | 输入包含 runtime URI、绝对路径、blob/data/file |
| `reference-needs-review` | `warning` | 否 | 低置信或 provider capability 不完整，需要用户确认 |
| `entity-representation-missing` | `warning` / `error` | 视目标能力而定 | entityRef 没有可用 visual/voice representation；纯展示为 warning，生成执行为 error |
| `provider-input-unavailable` | `error` | 是 | provider 需要的 URL/base64/mask/keyframe 无法构造 |
| `reference-conflict` | `warning` / `error` | 视冲突字段而定 | 多个引用互相矛盾，例如 speaker 或角色身份冲突 |
| `cost-estimate-required` | `warning` | 是，针对批量执行 | 大批量生成前缺少成本估算 |
| `reference-transitional-field` | `info` / `warning` | 否 | 使用过渡字段完成展示或解析 |

严重级别语义：

- `error`：阻断 provider 执行或长期事实写入；可继续展示。
- `warning`：允许展示和人工审阅；执行前可能需要 approval 或补充输入。
- `info`：提示来源、fallback、缓存状态或非阻断 lineage。

Diagnostic severity 应在创建 diagnostic 时确定，而不是让每个消费方自行推断。推荐由 diagnostic factory 接收 `targetCapability`、`purpose` 和 `phase`：

```ts
createReferenceDiagnostic({
  code: 'entity-representation-missing',
  targetCapability: 'GenerateImage',
  purpose: 'provider-input',
  phase: 'preflight',
});
```

例如同一个 `entity-representation-missing`：

- 在 Canvas 只读展示中是 `warning`，因为仍可展示实体名称和候选信息。
- 在 `GenerateImage` / `TransformImage` 执行前是 `error`，因为 provider 无法获得可消费的视觉参考。
- 在批量 dry-run 中可以聚合为 warning summary，但对应 reference 的执行状态仍应标记为 blocked。

降级策略：

- 能展示 stable ref 摘要时继续展示。
- 不能执行 provider 时保留计划和 diagnostic。
- 不把引用失败静默改写为 prompt 文本。
- 不自动下载或编码未授权文件。
- 不把失败 provider input 写回为 output ref。

---

## 十一、持久化与同步

持久化原则：

- 项目文件、Canvas 节点、artifact、memory ledger 只保存 stable refs。
- runtime preview、provider 临时 URL、base64、blob、Webview URI 不保存。
- 资源缓存、缩略图、OCR/ASR/semantic index 可写 sidecar 或结构化持久层。
- 输出资产必须记录 source lineage，便于重建、审计和重新生成。

与结构化持久化的关系：

- 当前可使用 JSON sidecar / project cache。
- 后续可接入 `adr-structured-data-persistence.md` 的 SQLite + vector index。
- resolver 应隐藏存储细节，对上层只暴露 reference descriptor 和 diagnostics。

---

## 十二、实施计划

### P0：文档与契约收敛

- 新增本 ADR。
- 在 `adr-comic-to-animation-image-prep.md` 中把 ShotNode 引用细节改为引用本 ADR。
- 明确 stable reference、runtime projection、provider input 的三层边界。
- 明确引用能力面向通用 Canvas 节点和 artifact，而不是 ShotNode 专属。

### P1：ReferenceDescriptor 与 collector

- 在共享层定义通用 reference descriptor / diagnostic / provider input intent。
- 定义 `ReferenceContributorManifest` / `ReferenceContributor`，并作为 capability registry typed facet 注册，不建立独立 registry 地基。
- 为 `ShotNode`、`GalleryNode`、`MediaNode`、`DocumentNode`、`StoryboardNode`、`entity`、`generated-asset` 提供 collector。
- 将 `ShotImagePrepPlan.referenceBundle` 和 Canvas `referenceRefs` 投影到同一引用集合。
- 补充现有内部字段到 `ReferenceDescriptor` 的 adapter 映射：`referenceImageResourceRef`、`referenceResourceRef`、`referenceImagePath`、`runtimeReferenceImagePath`、Canvas `referenceRefs`、`sourceMediaRefs`、`maskRefs`、`generatedMediaRefs`。
- 将 `ReferenceSourceKind` 定义为 manifest 与 collection input 共享的同一组 source kind，不维护两套枚举。
- 增加 reference diagnostic factory，按 `targetCapability` / `purpose` / `phase` 计算 severity。
- 明确 `CompositeArtifact` / `GenericTable` 是展示 payload SSOT，`ReferenceDescriptor` 是解析/执行引用 SSOT。
- 增加 unsafe runtime handle 和 stable ref validator 测试。

### P2：Host-side resolver 与 preview materializer

- 统一现有 `runtimeReferenceImagePath` materializer 和 Canvas generation `referenceRefs` resolver。
- 支持 document archive、resource cache、generated asset、semantic index range、visual occurrence crop 的解析。
- 输出 Webview preview projection 和 provider input bundle。
- 提供 `resolveBatch` / dry-run / estimate 模式，支持去重、缓存、并发上限、取消、partial result 和 per-reference diagnostics。
- 增加 Webview 重建、缓存缺失、权限失败、工作区外路径测试。

### P3：Provider 注入与回填

- 将 resolver 接入 `GenerateImage`、`TransformImage`、`GenerateVideo`、TTS 和后续 OCR/ASR/Perception provider。
- 按 provider capability 选择 URL/base64/ipAdapter/keyframe 输入形态。
- 回填 output refs、lineage、cost 和 execution summary。
- 在 Canvas 节点卡片和属性面板展示多节点引用摘要。

### P4：长篇一致性与跨包复用

- 结合 Character Memory、StoryContinuitySnapshot 和 semantic index 选择时间点正确的 reference set。
- 支持跨章节角色/场景/道具 reference cache。
- 支持 Cut、Story、Dashboard、Assets 对同一 reference resolver 的只读查询。
- 支持批量生成前的引用完整性检查和成本预估。

## 十三、实施说明

### 13.1 当前已落地路径

当前代码已经落地以下 P1/P2/P3 子集：

- `@neko/shared` 已定义 `ReferenceDescriptor`、`ReferenceContributorManifest`、resolver request/result、diagnostic、validator、Canvas / ShotImagePrepPlan / CompositeArtifact / GenericTable / StoryboardTable projector，以及 reference summary helper。
- Agent runtime 已在 `ShotImagePrepPlan` 执行前收集 stable refs，并在调用 `GenerateImage` / `TransformImage` / `GenerateVideo` 前进行运行时 provider input 注入；Artifact/request 持久数据不保存 URL/base64/runtime handle。
- Canvas Webview 已在节点卡片与属性面板展示轻量引用摘要和 diagnostic 聚合，不展开原始 descriptor JSON。
- Canvas generation 已把现有 `referenceRefs` 投影为 request metadata 中的 stable `referenceDescriptors`，不会把显式 `ipAdapterRefs` base64 持久化为 descriptor。
- Canvas -> Cut handoff 已优先携带 `preparedKeyframeRef` 与 `referenceDescriptors`；Cut 可以消费准备好的关键帧引用，不需要重新解析 raw comic/source media。

### 13.2 Contributor 实施约束

Reference contributor 只能做纯投影：

- 可以读取输入对象已有字段，归一化为 `ReferenceDescriptor`。
- 可以附加 role、modality、confidence、lineage、diagnostic 和 review metadata。
- 不得读取本地文件、生成 Webview URI、编码 base64、调用 OCR/ASR/provider、访问 VSCode API 或写入项目状态。
- 对未知 source kind 或无法验证的 payload，只允许展示 bounded summary / diagnostic，不暴露 provider execution action。

真正的 IO 和 materialization 必须留给 Extension Host resolver：

```text
Webview contributor -> stable descriptors -> host resolver -> preview URI / provider input bundle
```

### 13.3 当前限制

- `TransformImage` / `GenerateImage` / `GenerateVideo` 的 stable ref 注入路径已经有 runtime helper 与测试覆盖，但真实 OCR/ASR/panel/mask provider IO 仍需 Extension Host/provider 层继续接入。
- Cut 目前在导入阶段保留 stable `referenceDescriptors`，并继续使用 `preparedKeyframeRef` / fallback image path 建立 timeline clip；Cut 侧再次请求 host resolver 的视频生成执行链仍属于后续工作。
- package 级 TypeScript 检查仍会被现有 module resolution、DOM lib、旧测试 mock 类型等问题阻塞；本 ADR 相关路径以 targeted Vitest 和 shared validator 测试作为当前验证基线。

---

## 十四、风险与约束

- 如果只支持 `ShotNode`，后续 Gallery、实体节点、场景节点和 generated asset 会各自发明引用格式。
- 如果把 runtime URI 写进持久化数据，Webview 重建、跨机器同步和 provider 重试都会失败。
- 如果 provider adapter 直接理解 Canvas 节点结构，会造成跨包耦合和难以测试的执行路径。
- 如果只把角色名写进 prompt 而不解析视觉 reference，长篇人物形象会漂移。
- 如果 resolver 自动创建 confirmed entity，会导致实体重复、memory 分裂和不可追溯事实污染。
- 如果缺少 diagnostic 和 approval gate，大批量生成会产生不可控费用和难以恢复的失败状态。

---

## 十五、结论

引用能力应作为跨 Canvas、Agent artifact、统一实体、媒体 provider 的通用协议，而不是 `ShotNode` 的专有字段集合。

推荐最终边界：

```text
Agent 选择语义引用
Canvas 展示和审阅引用
Extension Host 解析 stable refs
Provider 消费已解析输入
Asset/Memory/Artifact 回填 stable output refs 和 lineage
```

这样 comic-to-animation 可以复用同一条链路完成角色参考、场景参考、源 panel、mask、关键帧和视频输入注入；其他领域也能用同一协议处理角色设定图、素材库、剧本文档、3D pose、音频 voice sample 和 generated asset 的跨节点引用。
