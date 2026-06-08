# ADR: Comic-to-Animation 能力缺口与分层建设

**状态**: Proposed (2026-06-08)
**关联**: `adr-comic-to-animation-image-prep.md` · `adr-agent-storyboard-table-schema.md` · `adr-agent-multimodal-perception.md` · `adr-unified-entity-memory-semantic-index.md` · `adr-composite-artifact-table-protocol.md` · `agent-media-architecture.md`
**范围**: `neko-agent` · `neko-canvas` · `neko-cut` · `@neko/shared` · media provider adapters · Extension Host IO

---

## 一、背景

Comic-to-animation 的目标不是单次“漫画图生视频”，而是把漫画、剧本、图片、音频和视频素材逐步转换成可审阅、可复用、可回填的动画制作资产。

当前系统已经具备 `StoryboardTable`、`ShotImagePrepPlan`、`CompositeArtifact`、`GenericTable` profile、`TransformImage` facade、Canvas shot 展示和 Cut prepared keyframe handoff 的基础。但从长篇漫画或混合媒体素材稳定生成动画，还缺少一批横跨本地感知、实体记忆、语义索引、provider 执行和 Canvas/Cut 消费的能力。

本 ADR 单独记录 comic-to-animation 的能力缺口，避免把这些跨链路问题塞进图像准备 ADR 或单个 Skill prompt。

## 二、核心判断

Comic-to-animation 当前欠缺的不是单一“生成视频”能力，而是一条从素材到动画资产的完整链路。

推荐总流程：

```text
Local perception / extraction
  -> IndexedRangeState + MediaSemanticIndex + EntityMention
  -> MentionResolver
  -> CharacterMemory / CreativeEntity / StoryContinuityIndex
  -> StoryboardTable
  -> ShotImagePrepPlan
  -> BatchExecutionPlan / approval gate
  -> TransformImage / GenerateImage / GenerateVideo / TTS
  -> Canvas review / Cut timeline
```

能力分层原则：

- 本地/代码负责可确定、可缓存、可索引、涉及权限和副作用的基础能力。
- AI/LLM/VLM 负责语义判断、创作生成、冲突解释和低置信感知兜底。
- Capability provider 负责真实执行、能力发现、成本/设备声明、失败诊断和降级；provider 可以是 `builtin`、`local`、`engine`、`plugin`、`mcp` 或云端服务。
- Skill 负责工作流提示、字段倾向和领域启发式，不能替代协议、provider 注册或长期事实合并。
- RAG/vector search 是增强召回，不是 P0/P1 基础依赖。

## 三、五层分析

| 层 | 设计判断 |
|---|---|
| 职责 | 把素材感知、实体解析、分镜生成、图像准备、视频/音频生成、Canvas/Cut 消费拆成可替换层 |
| 依赖 | Agent 依赖协议和 capability registry；Canvas/Cut 消费稳定 refs；local/cloud provider 由 Extension Host 或 engine sidecar 注入 |
| 接口 | `PerceptionCard`、`IndexedRangeState`、`VisualOccurrence`、`MediaSemanticIndex`、`EntityMention`、`CharacterMemory`、`StoryContinuityIndex`、`StoryboardTable`、`ShotImagePrepPlan`、`BatchExecutionPlan`、capability request |
| 扩展 | 新 OCR/ASR/panel/mask/model/RAG provider 通过 registry 与 sidecar 接入，不改 StoryboardTable 语义 |
| 测试 | 本地提取、引用解析、MentionResolver、profile projection、approval gate、provider unavailable、batch recovery 分层测试 |

### 3.1 接口归属与依赖方向

本 ADR 中出现的新接口不应散落到各子包。契约优先放在共享类型层，执行和渲染分别由 Agent / Extension Host / Canvas / Cut 接入。

| 接口 / 能力 | 归属 | 说明 |
|---|---|---|
| `IndexedRangeState`、`IndexTaskState` | `@neko/shared` / `packages/neko-types/src/types` | 局部索引状态契约和 validator |
| `VisualOccurrence` | `@neko/shared` / `packages/neko-types/src/types` | 视觉证据契约，只保存 refs/range/bbox/confidence |
| `PlotEvent`、`CharacterStateChange`、`ContinuityConstraint` | `@neko/shared` / `packages/neko-types/src/types` | 剧情连续性写入契约 |
| `StoryContinuityQuery`、`StoryContinuitySnapshot` | `@neko/shared` / `packages/neko-types/src/types` | 剧情连续性查询契约 |
| `BatchExecutionPlan` | `@neko/shared` / `packages/neko-types/src/types` | 通用批量审批与恢复信封 |
| `PerceptionCapabilityFacet` | `@neko/shared` / capability contribution typed facet | 本地/云端感知 provider 的注册声明 |
| MentionResolver runtime | `neko-agent/packages/agent` | 两阶段候选召回、AI 消解编排、review artifact 投影 |
| StoryContinuity query runtime | `neko-agent/packages/agent` + Extension Host reader | 查询 semantic index / memory 的只读服务，不直接改事实 |
| Local perception provider adapters | `neko-agent/packages/platform` + Extension Host / engine sidecar | OCR、ASR、分格、mask、embedding、host IO 物化 |
| Canvas render/review | `neko-canvas` | 展示证据、候选、批量审批，不拥有事实源 |
| Cut import/consume | `neko-cut` | 消费 locked keyframes、video prompts、audio refs，不重新解析漫画页 |

依赖方向：

```text
@neko/shared contracts
  -> neko-agent runtime/projectors
  -> Extension Host / provider adapters
  -> sidecar + SQLite projection

@neko/shared contracts
  -> neko-canvas render/review
  -> neko-cut consume/import
```

Canvas、Cut、provider 不应反向依赖 Agent Webview 的内部状态。Agent 可以生成 artifact 和计划，但长期事实写入必须经过 shared 契约、sidecar/memory 和 review/approval 规则。

### 3.2 P1 最小契约子集

为避免一次性实现过多接口，P1 应收敛到以下最小子集：

1. `IndexedRangeState` + `IndexTaskState`：支持素材局部 range 的 indexing 状态和 stale 判断。
2. `VisualOccurrence`：支持人物 bbox/crop/mask/appearance evidence 持久化。
3. `PerceptionCapabilityFacet`：支持 OCR、panel detection、speech balloon mask 三类本地感知 provider 注册。
4. `BatchExecutionPlan`：先覆盖 `asset-indexing` 与 `shot-image-prep`，`video-generation` / `voice-generation` 可后续接入。
5. `StoryContinuityQuery` + 最小 `StoryContinuitySnapshot`：先支持按 story position 查询 recent events、character states、blocking constraints。
6. Projectors：`PerceptionCard` / semantic evidence -> `StoryboardTable` refs；`StoryboardTable` -> `ShotImagePrepPlan`；`ShotImagePrepPlan` / `BatchExecutionPlan` -> `CompositeArtifact` / `GenericTable`。

P1 不要求完成 embedding/RAG、本地 VLM、视频人物跟踪、完整道具图谱或自动剧情推理。它只要求证据能落盘、能查询、能展示、能被后续计划引用。

### 3.3 与既有协议的集成点

| 既有协议 | 集成方式 |
|---|---|
| `PerceptionCard` | 感知中间产物；其 refs/evidence 投影到 `IndexedRangeState`、`VisualOccurrence`、`MediaSemanticIndex` |
| `StoryboardTable` | 继续表达镜头语义；通过 `sourceMediaRefs` / `extensions` 引用 evidence、entity、continuity refs |
| `ShotImagePrepPlan` | 继续表达图像准备计划；`referenceBundle` 引用 `VisualOccurrence.cropRef`、`CharacterMemory` observation、scene refs |
| `CompositeArtifact` | 展示 Storyboard、visual evidence、character memory、BatchExecutionPlan 的通用审阅信封 |
| `GenericTable` | 用 profile 投影 `comic-shot-asset-prep`、candidate entity review、batch execution review |
| `ArtifactExecutionSummary` | 承载 provider 执行回填和 batch 结果，不替代 `BatchExecutionPlan` |

### 3.4 SSOT 与关联 ADR 边界

本 ADR 不重新定义仓库级持久化标准，而是把 comic-to-animation 的证据链映射到既有 ADR：

| 文档 | 职责 |
|---|---|
| `adr-structured-data-persistence.md` | 定义 sidecar/JSON 作为可审计事实源，SQLite/FTS/vector 作为可重建缓存投影 |
| `adr-unified-entity-memory-semantic-index.md` | 定义统一实体、Character Memory、semantic index contribution 的全局协议 |
| 本 ADR | 定义 comic-to-animation 需要哪些局部 range、视觉证据、剧情连续性和批量审批数据，以及它们如何接入上述事实源 |

SSOT 规则：

- 原始素材的事实源是 source assets，不写入 AI 结论。
- OCR/ASR/panel/visual occurrence/plot event 的事实源是 `.neko/semantic-index` sidecar。
- CreativeEntity、CharacterMemory、merge/correction history 的事实源是 `.neko/memory` sidecar。
- Agent run artifact、`BatchExecutionPlan`、approval record 和 execution summary 的事实源是 `.neko/runs`。
- SQLite/FTS/vector 只作为查询投影和 cache，可删除后从 sidecar/JSON 重建。

## 四、本地/代码基础能力

这些能力是长篇稳定性的地基，应由 Extension Host、provider adapter、共享契约和确定性代码实现。Skill 可以要求使用这些能力，但不能替代它们。

| 能力 | 缺口 | 原因 |
|---|---|---|
| 素材展开与稳定引用 | 将图片、PDF、EPUB、CBZ/CBR、视频帧、音频片段展开为 stable refs、page/panel/frame/time ranges | Agent 不能依赖绝对路径、base64 或一次性上下文保存素材状态 |
| 本地 OCR | 输出 `MediaTextSegment(kind: "ocr")`、bbox、confidence、sourceRef/range | 漫画对白、旁白、背景字需要可索引证据；Vision LLM OCR 只能作为增强或兜底 |
| 本地 ASR / 字幕解析 | 输出 `MediaTextSegment(kind: "asr" | "subtitle")` 与 time range、speaker candidate | 音视频素材需要可渐进索引的台词、旁白和声音证据 |
| 分格检测与阅读顺序 | 识别 panel bbox、page order、reading order、跨页关联 | 分镜不能只靠 Agent 看整页图；否则长篇中无法稳定定位角色与对白 |
| 文本/对白框 mask | 检测 speech balloon、拟声字、水印、文字区域并生成 mask refs | `remove-text`、`inpaint`、上色和重绘需要可审阅 mask |
| 主体/人物候选框 | 识别人物 bbox、脸部/服装区域、panel 内位置 | 为对白归属、角色 reference bundle、局部修复提供定位 |
| 语义 sidecar/index | 写入 `.neko/semantic-index` 或等价 sidecar，保存 OCR/ASR/字幕/视觉证据索引 | AI 上下文无法一次性容纳长篇素材，必须可增量检索 |
| MentionResolver | 基于 range、别名、出场、已有实体、memory 和 semantic index 解析候选实体 | 避免从文档中段开始分析时重复创建角色或找不到对应人物 |
| Character Memory 合并 | observation/contribution 幂等写入、冲突诊断、change event、snapshot 推导 | 长篇人物外观、服装、声音和关系会随时间变化 |
| stable ref 物化 | 执行前由 host 将 stable refs 解析为 provider 所需 URI/base64/bytes | 持久数据不能存 runtime handle，provider 又需要真实文件输入 |
| 批量执行门禁 | cost estimate、approval、并发上限、retry/cancel、resume/backfill | 数百镜头不能无限并发或静默产生成本 |
| Canvas/Cut 确定性消费 | Canvas 展示 shot/prep/memory 证据，Cut 消费 locked keyframes/video prompts | 下游不应重新猜漫画页、对白和关键帧来源 |

### 4.1 本地能力是否需要 provider

本地能力不需要“云 provider”，但需要统一的 capability provider/facet 注册。这里的 provider 表示“能力提供者”，可以是内置纯代码、Extension Host、Rust engine sidecar、本地模型、插件或云服务。

不需要 provider 注册的情况：

- 纯类型校验、normalizer、projector。
- 已有数据上的确定性查询和排序。
- 不触发 IO、模型执行、缓存写入、设备占用或费用的纯函数。

需要 provider/facet 注册的情况：

- OCR、ASR、panel detection、speech balloon mask、visual occurrence、embedding、本地 VLM。
- 需要访问文件、解码媒体、调用 engine/native sidecar、加载模型或写入派生资源。
- 需要被 Agent / Canvas / BatchExecutionPlan 发现、调度、取消、重试或降级。
- 需要声明设备要求、成本、置信度、失败码、缓存键或 provider/model version。

推荐 `PerceptionCapabilityFacet` 最小契约：

```typescript
interface PerceptionCapabilityFacet {
  readonly providerId: string;
  readonly source: 'builtin' | 'local' | 'engine' | 'plugin' | 'mcp' | 'cloud';
  readonly tasks: readonly (
    | 'ocr'
    | 'asr'
    | 'subtitle'
    | 'panel-detection'
    | 'reading-order'
    | 'speech-balloon-mask'
    | 'visual-occurrence'
    | 'embedding'
    | 'vlm-review'
  )[];
  readonly supportedMediaKinds: readonly ('image' | 'comic' | 'document-page' | 'video-frame' | 'audio' | 'subtitle')[];
  readonly executionMode: 'sync-light' | 'async-local' | 'async-cloud';
  readonly deviceTier: 'light' | 'medium' | 'high';
  readonly defaultConcurrency: number;
  readonly cachePolicy: 'required' | 'recommended' | 'none';
  readonly confidenceKind: 'provider-score' | 'heuristic' | 'none';
  readonly approvalRequired?: boolean;
}
```

执行关系：

- capability facet 描述“能不能做、适合怎么做”；具体执行仍由 Extension Host command、engine sidecar、agent platform tool 或 provider adapter 完成。
- 本地 OCR 这类默认能力也要注册，方便 unavailable diagnostic、设备降级、缓存失效和 BatchExecutionPlan 统一处理。
- `confidenceKind: "none"` 的 provider 输出必须在 MentionResolver、StoryContinuity query 和 review gate 中视为 `needs-review`，不能进入自动 high-confidence 绑定或自动 confirmed merge 路径。
- Skill 只能请求或偏好某类能力，不能绕过 capability registry 直接假设本地模型存在。

### 4.2 MentionResolver 两阶段边界

`MentionResolver` 是代码能力，但它不应伪装成完全语义理解器。它应分成确定性候选收集和 AI 辅助消解两个阶段：

```text
Stage A: deterministic candidate collection
  exact alias / canonical name / source range / known speaker link / panel co-location
  -> EntityMentionCandidate[]

Stage B: semantic disambiguation
  pronoun / title / nickname / narrative context / visual similarity
  -> ranked EntityMentionCandidate[] + confidence + diagnostics

Stage C: promotion gate
  high confidence + no conflict -> attach candidate entity ref
  ambiguous / conflict -> review artifact, no confirmed merge
```

代码负责：

- 精确别名、canonical name、known entity id、source range、panel/time range 和已有 memory ledger 的候选召回。
- 候选去重、confidence 阈值、冲突诊断、幂等 observation/contribution 写入。
- 阻止 AI 直接把候选升级为 confirmed entity 或覆盖长期 Character Memory。

AI 负责：

- 对“他”“她”“队长”“老师”“哥哥”等模糊称呼做上下文判断。
- 在多角色同框、对白框位置不清、文本缺主语时给出排序候选和理由。
- 对低置信结果输出 diagnostic 或待审阅建议，而不是直接确认。

推荐阈值：

- `confidence >= 0.85` 且无冲突：可自动绑定为 candidate entity ref，但仍保留 source evidence。
- `0.55 <= confidence < 0.85`：进入 review artifact，由 Canvas/Agent Webview 展示候选。
- `confidence < 0.55` 或候选冲突：只保留 unresolved mention，不写入 confirmed identity。

## 五、AI / LLM / VLM 语义能力

这些能力适合由 Agent 调用 AI 处理，因为它们需要语义理解、创作判断或跨证据解释。但 AI 输出必须进入可校验协议、候选实体、observation 或 review artifact，不能直接绕过长期事实源。

| 能力 | AI 负责什么 | 输出约束 |
|---|---|---|
| 文本分类 | 区分对白、旁白、心理活动、背景字、拟声词、标题/标注 | 写入 storyboard voice/text cues，并保留 OCR/ASR source range |
| 说话人绑定 | 结合对白框位置、人物 bbox、上下文和称呼推断 speaker | 输出 `speakerEntityRef` 候选与 confidence；冲突时 diagnostic |
| 角色信息提取 | 从画面、对白、叙事中提取外观、服装、性格、关系、声音线索 | 写入 CharacterObservation / EntityMemoryContribution，待审阅或合并 |
| 指代与别名消解 | 解析“他/她/队长/老师/哥哥”等称呼与既有实体的关系 | 通过 MentionResolver 产生候选，不直接 confirmed |
| 分镜语义生成 | 生成 scene/shot、视觉描述、镜头、动作、节奏、叙事目的 | 输出 StoryboardTable / CompositeArtifact |
| 图像准备决策 | 判断每个 shot 应 reuse、transform、use-as-reference 或 generate-new | 输出 `ShotImagePrepPlan`，执行前进入 approval gate |
| prompt 生成 | 生成 image prompt、TransformImage edit instruction、video prompt、negative prompt | prompt 只描述意图，稳定参考必须来自 refs |
| 冲突与变化解释 | 判断同一角色外观/声音/关系变化是剧情变化还是识别冲突 | 生成 diagnostic 或 CharacterChangeEvent |
| 低置信感知兜底 | 当本地 OCR、分格、mask、主体识别低置信时调用 VLM 二次判断 | 结果仍需写回 PerceptionCard / semantic index |

## 六、Provider / 生成执行能力

这些能力可以由云端或本地模型 provider 提供，但必须通过 capability registry 注册能力、成本、输入约束和失败码。

| 能力 | 用途 | 关键要求 |
|---|---|---|
| `TransformImage` | 裁切、去字、inpaint、outpaint、上色、upscale、局部一致性修复 | 必须有 source ref；mask/reference/edit instruction 可审阅 |
| `GenerateImage` | 补镜头、重构不可用 panel、生成角色/场景/风格参考图 | 支持 reference images、character/scene/style refs |
| `GenerateVideo` | 从关键帧、video prompt、镜头参数生成视频片段 | 消费 locked keyframes，不重新解析漫画页 |
| TTS / voice clone | 生成对白、旁白和角色声音 | 绑定 speaker entity / voice profile / voice change state |
| Music / SFX | 生成或检索配乐、音效、环境声 | 绑定 timeline cue 和版权/来源信息 |
| Embedding / vector search | 对文本段、角色观察、镜头、资产 caption 做相似检索 | P3/P4 增强项，不应成为 comic-to-animation 的 P0 硬依赖 |

## 七、BatchExecutionPlan 与审批门禁协议

`approval gate` 不应只是 UI 状态或自然语言确认。长篇 comic-to-animation 需要一个可序列化、可渲染、可恢复的批量执行计划协议，让 Agent Webview、Canvas 和 runtime 对同一批执行达成一致。

`BatchExecutionPlan` 是执行前的审阅产物，不是 provider 执行结果。它可以被 `CompositeArtifact` 的 table/domain block 展示，也可以投影为 Canvas 的批量审批面板。

```typescript
interface BatchExecutionPlan {
  readonly schemaVersion: 1;
  readonly kind: 'batch-execution-plan';
  readonly batchPlanId: string;
  readonly sourceArtifactRefs: readonly string[];
  readonly targetDomain: 'shot-image-prep' | 'video-generation' | 'voice-generation' | 'asset-indexing' | string;
  readonly items: readonly BatchExecutionPlanItem[];
  readonly approvalPolicy: BatchApprovalPolicy;
  readonly costEstimate?: BatchCostEstimate;
  readonly executionPolicy: BatchExecutionPolicy;
  readonly status:
    | 'planned'
    | 'needs-approval'
    | 'approved'
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'partial'
    | 'failed'
    | 'cancelled';
  readonly diagnostics?: readonly ArtifactDiagnostic[];
}

interface BatchExecutionPlanItem {
  readonly itemId: string;
  readonly targetRef: string;
  readonly capabilityId: string;
  readonly providerId?: string;
  readonly inputRefs: readonly string[];
  readonly outputRole?: string;
  readonly estimatedCost?: number;
  readonly estimatedDurationMs?: number;
  readonly status: BatchExecutionPlan['status'] | 'skipped';
  readonly diagnostics?: readonly ArtifactDiagnostic[];
}

interface BatchApprovalPolicy {
  readonly required: boolean;
  readonly scope: 'batch' | 'item' | 'both';
  readonly reason: 'cost' | 'side-effect' | 'provider-risk' | 'bulk-change' | 'user-requested';
}

interface BatchExecutionPolicy {
  readonly maxConcurrency: number;
  readonly retryPolicy: {
    readonly maxAttempts: number;
    readonly retryOn: readonly ('provider-timeout' | 'rate-limit' | 'transient-error')[];
  };
  readonly failurePolicy: 'stop-on-first-failure' | 'continue' | 'continue-approved-only';
  readonly budgetLimit?: {
    readonly maxEstimatedCost?: number;
    readonly maxEstimatedTokens?: number;
    readonly maxOutputAssets?: number;
  };
}
```

关系：

- `ShotImagePrepBatchRequest` 是图像准备领域的执行请求；`BatchExecutionPlan` 是通用审批与恢复信封。
- `BatchExecutionPlan.items[].targetRef` 可以指向 `ShotImagePrepPlan.planId`、video cue、voice cue 或 asset indexing job。
- `targetDomain` 的内置值先覆盖 P1 场景；后续 music、sfx、subtitle、quality-review 等域可按 `adr-capability-protocol.md` 的 capability namespace 扩展，不需要为每个新域重开 batch 协议。
- `costEstimate` 和每行 `estimatedCost` 必须在 expensive provider 执行前生成；unknown cost 需要 explicit approval。
- Canvas 负责渲染批量审批视图、行级批准/跳过/编辑和执行摘要。
- Runtime 负责从 approved `BatchExecutionPlan` 投影为 provider-specific request，并回填 `ArtifactExecutionSummary`。
- Provider 不能直接消费 `BatchExecutionPlan`；它只消费经过 runtime adapter 生成的具体 capability request。

## 八、RAG 与本地索引关系

Comic-to-animation 不应硬依赖外部 RAG 服务。P0/P1 应依赖本地可确定的 semantic sidecar、source range、MentionResolver 和 Character Memory；RAG/vector search 只作为弱召回增强。

推荐分层：

```text
P0/P1: stable refs + local OCR/ASR/subtitle + panel ranges + MentionResolver
P2: local embedding / vector index for project assets
P3: optional external RAG service for large project recall or team workspace search
```

规则：

- 没有 RAG 时，Agent 仍应能通过 source range、实体别名、出场记录和 memory ledger 找回角色。
- RAG 命中只能提供候选证据，不能直接确认实体或覆盖 Character Memory。
- 语义索引保存的是文本段、时间段、bbox、asset refs 和证据摘要，不保存 runtime URI、base64 或 provider 私有句柄。
- 外部 RAG 不应成为 Canvas/Cut 渲染和执行的必要条件；渲染与执行只依赖已持久化的稳定协议数据。

## 九、本地处理与设备约束

本地能力应按成本分级，避免把所有用户都绑定到高性能设备。

| 等级 | 本地能力 | 设备要求 | 降级 |
|---|---|---|---|
| 默认轻量 | 文件展开、字幕解析、OCR、基础分格、sidecar 索引 | 普通 CPU 可接受，适合 on-demand / idle 任务 | 低置信时请求 AI 复核 |
| 中等 | ASR、文本/对白框 mask、主体 bbox、轻量 embedding | 多核 CPU 或可用 GPU 更好 | 允许排队、分批和缓存 |
| 高成本 | 本地 VLM、视频人物跟踪、本地 inpaint/colorize/generate | 需要较强 GPU/内存 | 默认不强制启用，可切云端 provider |

原则：

- 本地优先处理“可确定、可缓存、可索引”的提取任务。
- AI 优先处理“语义判断、创作生成、冲突解释”的任务。
- Capability provider 负责“真实生成/编辑/转写/感知”的执行能力，并声明成本与设备要求。
- Skill 负责选择工作流和输出倾向，不能假设某个本地模型或云 provider 一定存在。

降级策略必须进入 capability registry 与 `BatchExecutionPlan`，不能只停留在 UI 文案：

| 情况 | Registry / Plan 行为 |
|---|---|
| provider unavailable | `BatchExecutionPlanItem.status = "skipped"` 或计划停在 `needs-approval`，写入 `provider-unavailable` diagnostic |
| 设备 tier 不满足 | 标记 `device-requirement-unmet`，建议 cloud/plugin fallback，不自动切换高成本 provider |
| 低置信本地结果 | 写入 evidence + `needs-review` diagnostic，可追加 `vlm-review` item |
| cost unknown | `approvalPolicy.required = true`，禁止静默批量执行 |
| 用户取消 | 已完成 evidence/output 保留，未开始 item 回到 planned/approved 状态 |
| provider transient failure | 按 `retryPolicy.retryOn` 重试；schema/ref/mask 错误不重试 |

`BatchExecutionPlanItem.capabilityId` 应使用感知或生成能力 id，例如 `perception.ocr`、`perception.panel-detection`、`media.transform-image`、`media.generate-video`。这样本地 OCR 与云端视频生成可以共享批量审批、恢复和诊断机制，但仍由不同 provider adapter 执行。

## 十、素材生命周期与增量索引

新素材加入后应立即可引用，但不要求语义信息立即完整。素材登记和素材分析必须解耦：

```text
file added
  -> registered stable asset ref
  -> pending IndexedRangeState
  -> Agent / Canvas can reference asset immediately
  -> idle / on-demand extraction fills semantic evidence
```

推荐状态：

```text
registered
indexing-pending
indexing-running
indexed-partial
indexed-complete
indexing-failed
stale
```

局部 range 是增量分析的基本单位，而不是整本漫画或整个视频文件：

```typescript
interface IndexedRangeState {
  readonly assetRef: string;
  readonly rangeRef: string; // page / panel / frame / time / bbox
  readonly assetHash: string;
  readonly tasks: {
    readonly ocr?: IndexTaskState;
    readonly asr?: IndexTaskState;
    readonly panelDetection?: IndexTaskState;
    readonly readingOrder?: IndexTaskState;
    readonly visualOccurrence?: IndexTaskState;
    readonly speechBalloonMask?: IndexTaskState;
    readonly speakerBinding?: IndexTaskState;
    readonly plotExtraction?: IndexTaskState;
  };
  readonly evidenceRefs: readonly string[];
}

interface IndexTaskState {
  readonly status: 'pending' | 'running' | 'partial' | 'complete' | 'failed' | 'stale';
  readonly providerId?: string;
  readonly modelVersion?: string;
  readonly confidence?: number;
  readonly updatedAt?: string;
  readonly diagnostics?: readonly ArtifactDiagnostic[];
}
```

增量规则：

- 新素材登记必须快，不阻塞在 OCR、ASR、分格、embedding 或大媒体 probing 上。
- Agent 需要当前页/当前片段时，可触发 on-demand 分析；不必等待全项目分析完成。
- 分析第 11-20 页时，应先加载第 1-10 页已确认和候选的人物、别名、appearance refs、剧情状态，再处理新页。
- 已完成的任务默认复用；只补缺失或 stale 的任务。
- 原素材 hash、provider/model version、schema 或用户修正导致 evidence 失效时，局部 range 标为 `stale`，不全量重建项目。

## 十一、人物形象、统一实体与剧情连续性路径

预分析负责把素材变成可检索证据，创作过程负责把证据变成角色、形象和剧情状态。两者不是二选一，而是轻量预分析 + 创作中渐进建模。

```text
Pre-indexing: source range / OCR / ASR / visual occurrence / plot candidate
Creative resolution: entity binding / memory merge / continuity update / review
```

### 11.1 人物名称与统一实体

人物可以立即被“看见”和引用，但名称通常只能渐进发现和确认。

```text
unknown-character-001
candidate-alias: "队长"
candidate-name: "林白"
linked-entity-candidate
confirmed-entity
```

规则：

- 文件名、剧本、字幕、对白或旁白出现名字时，可生成 `EntityMentionCandidate`。
- 只有视觉出现但无文本证据时，只能创建 candidate character 或 unresolved mention。
- “队长”“老师”“哥哥”等称呼是 alias/title candidate，不是 confirmed canonical name。
- 高置信候选可以绑定到 candidate entity ref；confirmed entity、实体合并、长期名称修正必须保留 provenance 和 review/approval 记录。

### 11.2 人物外貌与视觉证据

外貌可以立即作为视觉证据捕获，但不应立即变成稳定人物设定。

```typescript
interface VisualOccurrence {
  readonly occurrenceId: string;
  readonly sourceAssetRef: string;
  readonly sourceRangeRef: string;
  readonly bbox?: NormalizedBoundingBox;
  readonly cropRef?: string;
  readonly maskRefs?: readonly string[];
  readonly candidateEntityRefs?: readonly string[];
  readonly appearanceText?: string;
  readonly confidence?: number;
  readonly providerId?: string;
  readonly modelVersion?: string;
}
```

路径：

```text
panel / frame
  -> person bbox / crop
  -> VisualOccurrence
  -> appearance / outfit / pose / expression observations
  -> MentionResolver
  -> CharacterMemory
  -> CharacterStateSnapshot
  -> ShotReferenceBundle.characterRefs
```

规则：

- 保存 crop/mask/thumbnail 等派生资源，长期协议只引用 stable refs。
- 外貌 observation 需要带 `sourceRange`、`confidence`、provider/model version。
- 黑白漫画的颜色、遮挡画面的衣着、临时表情和姿态不能直接成为长期事实。
- 生成结果可以作为 derived reference，但不能反向覆盖原始人物事实，除非用户显式确认。
- 后续页分析时先用已有 appearance/crop refs 做召回；匹配不上再创建新 candidate。

### 11.3 剧情连续性

剧情连贯性也应渐进落盘，而不是依赖单次 AI 阅读完整作品。

```typescript
interface PlotEvent {
  readonly eventId: string;
  readonly sourceRangeRef: string;
  readonly participants?: readonly string[];
  readonly locationRef?: string;
  readonly summary: string;
  readonly eventType?: string;
  readonly orderIndex: number;
  readonly confidence?: number;
  readonly evidenceRefs: readonly string[];
}

interface CharacterStateChange {
  readonly changeId: string;
  readonly characterRef: string;
  readonly dimension: 'appearance' | 'outfit' | 'emotion' | 'knowledge' | 'relationship' | 'goal' | 'injury' | 'location' | 'voice' | 'other';
  readonly before?: string;
  readonly after: string;
  readonly sourceRangeRef: string;
  readonly confidence?: number;
}

interface ContinuityConstraint {
  readonly constraintId: string;
  readonly appliesTo: 'scene' | 'shot' | 'character' | 'prop' | 'location';
  readonly rule: string;
  readonly sourceEvidenceRefs: readonly string[];
  readonly severity: 'info' | 'warning' | 'blocking';
}

interface StoryContinuityQuery {
  readonly projectId: string;
  readonly storyPosition?: {
    readonly chapterId?: string;
    readonly pageId?: string;
    readonly sceneId?: string;
    readonly shotId?: string;
    readonly orderIndex?: number;
  };
  readonly characterRefs?: readonly string[];
  readonly locationRefs?: readonly string[];
  readonly lookbackLimit?: number;
  readonly include: readonly ('events' | 'character-states' | 'constraints' | 'unresolved')[];
}

interface StoryContinuitySnapshot {
  readonly queryId: string;
  readonly events: readonly PlotEvent[];
  readonly characterStates: readonly CharacterStateChange[];
  readonly constraints: readonly ContinuityConstraint[];
  readonly unresolvedQuestions?: readonly string[];
  readonly diagnostics?: readonly ArtifactDiagnostic[];
}
```

后续生成分镜或视频时，应先查询 `StoryContinuityIndex`：

- 当前角色是否在场。
- 角色知道什么、不知道什么。
- 道具属于谁、是否已经丢失或转交。
- 角色关系、情绪、目标是否发生变化。
- 外貌、服装、声音、伤势是否存在有效时间范围。
- 新镜头是否违反前序 continuity constraint。

查询边界：

- `StoryContinuityIndex` 是只读查询服务和索引投影，不是新的事实写入入口。
- Agent 通过 tool/query runtime 获取 `StoryContinuitySnapshot`，再生成 StoryboardTable、diagnostic 或 review artifact。
- MentionResolver 可以消费 `StoryContinuitySnapshot` 辅助代词/称呼消解，但不应把 continuity query 和 entity merge 写死在同一模块。
- Canvas 可以展示 continuity diagnostics；Cut 只消费已审阅的 timeline-ready refs 和 prompts。
- `lookbackLimit` 省略时不表示全量回溯；默认应回溯到当前 scene/chapter 边界，并由 runtime 设置系统上限，避免长篇项目生成过大的 snapshot。

## 十二、落盘、同步与数据库边界

Comic-to-animation 需要落盘，不应每次重建。推荐采用 sidecar/JSON 作为可审计事实源，SQLite/FTS/vector 作为查询投影和缓存，保持与 `adr-structured-data-persistence.md` 一致。

推荐布局：

```text
source assets
  原始素材，不写入 AI 结论

.neko/assets/
  panel crops / character crops / masks / thumbnails / prepared keyframes

.neko/semantic-index/
  OCR / ASR / subtitle / panel ranges / visual occurrences / entity mentions / plot events

.neko/memory/
  CreativeEntity / CharacterMemory ledger / StoryContinuityIndex / merge history

.neko/runs/
  Agent artifacts / BatchExecutionPlan / approval records / execution summaries

.neko/.cache/neko-cache.db
  SQLite / FTS / vector projection, rebuildable cache
```

必须落盘：

- stable asset refs、page/panel/frame/time/bbox range。
- OCR/ASR/subtitle text segment。
- panel detection、reading order、VisualOccurrence、cropRef、maskRef。
- EntityMentionCandidate、CharacterObservation、CharacterChangeEvent。
- PlotEvent、CharacterStateChange、ContinuityConstraint。
- CreativeEntity、CharacterMemory ledger、merge/correction history。
- BatchExecutionPlan、approval record、ArtifactExecutionSummary。

不应落盘：

- webview URI、blob URL、provider 临时 URL、绝对路径。
- 大图 base64。
- 没有 provenance 的 AI 自由总结。
- 未校验的 provider runtime handle。

同步模型：

```text
Extension Host is write authority
  -> write sidecar / memory
  -> update SQLite projection
  -> emit index-updated / memory-updated / artifact-updated
  -> Agent Webview / Canvas refresh paged views
```

重建规则：

- 正常情况复用已有 evidence，不全量重建。
- 原素材 hash 变化、provider/model version 变化、schema 变化、用户手动 refresh、低置信复核或旧索引缺少新能力时，局部 range 标为 `stale`。
- SQLite cache 可删除并从 sidecar/JSON 重建；不要把 SQLite 作为唯一事实源。
- Webview 状态不是事实源；重建后必须能从 sidecar、memory 和 run artifact 恢复。

性能与准确性门禁：

- 项目打开不触发重型提取，只做 lazy / idle / on-demand。
- Webview 展示必须分页或按当前 shot/range 加载。
- MentionResolver 应使用 alias/entity/source range 索引，避免长篇项目全量线性扫描。
- 所有 OCR/ASR/panel/mask/speaker/entity 结果必须带 confidence 和 provenance。
- 低置信、冲突、跨实体合并、长期事实覆盖必须进入 review artifact。

## 十三、当前优先补齐项

P1 前应优先补齐：

- `PerceptionCapabilityFacet` 以及本地 OCR、panel detection、reading order、speech balloon text mask 的 `local` / `engine` provider 注册。
- `IndexedRangeState`、`VisualOccurrence`、`PlotEvent`、`CharacterStateChange`、`ContinuityConstraint` 的契约草案。
- `StoryContinuityQuery`、`StoryContinuitySnapshot` 的查询契约和最小 runtime reader。
- `PerceptionCard` 到 `StoryboardTable` / `ShotImagePrepPlan` 的引用链路。
- `MentionResolver` 两阶段候选召回/语义消解，消费已有统一实体、Character Memory、OCR/ASR source range，避免中途分析时重复建角色。
- `speakerEntityRef`、对白文本、角色观察、shot character refs 的绑定展示。
- Canvas 对 shot 的分区审阅：人物、对白/旁白/背景字、声音、图像准备、image/video prompt、reference bundle。
- `BatchExecutionPlan` 协议、GenericTable/Canvas 审批投影、provider unavailable/device tier/cost unknown 降级、执行摘要和恢复。
- TransformImage / GenerateImage / GenerateVideo / TTS 的 host IO 解析、成本估算、执行摘要和 backfill 恢复。
- sidecar/JSON SSOT 与 SQLite/FTS/vector 查询投影的同步路径。

P2/P3 再增强：

- 本地 embedding / vector index 与可选 RAG 接入。
- 音视频人物跟踪、speaker diarization、跨镜头 voice consistency。
- 长篇 CharacterChangeEvent 消费，按章节/时间点选择人物形象、服装、声音 reference set。
- 候选图对比、锁定、替换、重新执行和批量恢复 UX。

## 十四、风险与约束

- 如果只建设 GenerateVideo，而不建设 OCR/ASR/panel/mask/semantic index，长篇漫画仍无法稳定绑定角色、对白和关键帧来源。
- 如果 Agent 自动创建实体且不检查已有实体，会造成角色重复和 memory 分裂。
- 如果 MentionResolver 不区分确定性召回和 AI 语义消解，系统会在“可自动绑定”和“必须审阅”之间失去边界。
- 如果视觉证据不落盘，后续分析会反复重跑并产生不同 bbox、crop、外貌描述和角色候选，长篇一致性不可控。
- 如果剧情事件、角色状态变化和 continuity constraints 只留在 Agent 上下文里，后续分镜和视频生成会丢失剧情连续性。
- 如果把 SQLite 当成唯一事实源，cache 损坏或 schema 迁移会威胁创作事实；SQLite 应是可重建查询投影。
- 如果媒体文件缺少 OCR/ASR/semantic index，Agent 很难在长篇素材中渐进检索和复用人物证据。
- 如果把 RAG 当成基础依赖，而不是本地索引和 MentionResolver 之上的增强能力，离线项目、隐私项目和中途分析都会变得脆弱。
- 如果把 provider 权限、子包支持程度或长期事实写入交给 Skill，系统会失去确定性校验和审计边界。
- 如果本地 OCR/ASR/分格/mask 不注册为 local/engine capability provider，Agent 和 Canvas 将无法可靠发现、降级、取消、重试或显示 unavailable diagnostic。
- 如果 `StoryContinuityIndex` 只有写入结构没有查询契约，剧情连续性仍会退化成 Agent 临时上下文。
- 如果批量执行缺少 `BatchExecutionPlan`、成本估算和并发上限，长篇项目会产生不可控费用、rate limit 和 Webview 状态恢复问题。

## 十五、结论

Comic-to-animation 应按能力层建设，而不是把问题压缩成一个 Skill 或一个生成接口：

```text
素材登记 -> 局部增量索引 -> 实体/形象/剧情记忆 -> Agent 语义编排 -> 可审阅计划 -> provider 执行 -> Canvas/Cut 消费
```

近期重点是补齐本地 OCR/ASR、分格、mask 的 local/engine capability provider、`IndexedRangeState`、`VisualOccurrence`、semantic sidecar、MentionResolver 两阶段解析、`StoryContinuityQuery` / `StoryContinuitySnapshot`、`BatchExecutionPlan`、host IO 物化、SQLite 查询投影和 Canvas 分区审阅。RAG、embedding、本地 VLM、视频人物跟踪和长篇变化时间线属于后续增强，但它们应建立在稳定 refs、实体记忆、剧情索引和可审阅 artifact 之上。
