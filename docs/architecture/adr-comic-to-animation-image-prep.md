# ADR: Comic-to-Animation 图像准备与 TransformImage 能力边界

**状态**: Accepted / Partially Implemented (2026-06-07)
**关联**: `adr-agent-storyboard-table-schema.md` · `adr-composite-artifact-table-protocol.md` · `agent-asset-ref-contract.md` · `agent-media-architecture.md` · `adr-agent-multimodal-perception.md` · `adr-unified-entity-memory-semantic-index.md` · `adr-comic-to-animation-capability-gap.md` · `adr-canvas-artifact-reference-resolution.md`
**范围**: `neko-agent` · `neko-canvas` · `neko-cut` · `@neko/shared` · media provider adapters

---

## 一、背景

Comic-to-animation 的目标不是把漫画页直接丢给视频生成模型，而是把漫画素材逐步整理成可审阅、可执行、可回填的镜头资产准备流程：

```text
漫画/图片/视频素材
  ↓
感知：分格、OCR、主体、对白框、遮罩、角色/场景证据
  ↓
StoryboardTable：镜头语义与 imageStrategy
  ↓
ShotImagePrepPlan：每个镜头如何准备关键帧图片
  ↓
GenerateImage / TransformImage / ResolveMediaRef 等能力执行
  ↓
generatedMediaRefs 回填
  ↓
Canvas 审阅与 Cut 视频生成
```

现有 `StoryboardTable` 已经能表达镜头语义、源图引用、生成提示词和 `imageStrategy`，但它仍偏向“镜头计划”。它不能单独承载切分、上色、去除对白框、补全画面、统一人物形象、参考图绑定、遮罩编辑等图像准备细节。

因此需要在 `StoryboardTable` 与具体图片生成/编辑工具之间增加一层可审阅的图像准备计划。

## 二、当前状态判断

当前实现是**契约与纯运行时骨架已落地，真实 provider / host IO 尚未完整接入**。

已经具备的部分：

- `StoryboardTable` 支持 `imageStrategy`: `reuse-original`、`use-as-reference`、`generate-new`、`transform-original`。
- `StoryboardImageStrategyAction` 已能把 `imageStrategy` 解释为 `GenerateImage`、`TransformImage`、`ResolveMediaRef` 等工具路由。
- `comic-to-storyboard` skill 已要求 Agent 在漫画转分镜时输出 `sourceMediaRefs`、`imageStrategy`、`generationPrompt` 和漫画场景扩展信息。
- Agent runtime 已能发现 `GenerateImage`、`TransformImage`、`ResolveMediaRef` 这类能力名称，并对引用图、mask 支持做保守推断。
- 现有 `ImageGenerationRequest` 已有参考图、mask、control image 等字段，说明底层媒体生成接口具备承载 transform-like 参数的雏形。
- `@neko/shared` 已新增 `ShotImagePrepPlan`、`ShotReferenceBundle`、`ShotImagePrepCostEstimate`、`ShotImagePrepBatchRequest` 与 `comic-shot-asset-prep` profile。
- Agent 已能从 `StoryboardTable` 纯函数推导 `ShotImagePrepPlan`，并投影为 `CompositeArtifact` / `GenericTable(profile="comic-shot-asset-prep")`。
- Agent runtime 已有注入式 `TransformImage` / `GenerateImage` facade 映射、provider unavailable 降级、unknown cost diagnostic、batch gate、bounded concurrency、retry、cancel 和 per-shot backfill helper。
- Canvas shot 面板已能通过 composable preset 展示图像准备状态、操作、source/output refs、mask、reference bundle、prompt、diagnostics 和建议动作。
- Cut handoff 已能优先消费 prepared keyframe ref，避免重新从 raw comic page 推断图像准备结果。

尚未完整具备的部分：

- `TransformImage` 已有 facade 语义和请求映射，但尚未完成真实 Extension Host/provider 层独立工具注册与 IO 接入。
- 漫画分格切分、OCR、对白框 mask、去字补图、上色、扩图、重绘关键帧、人物/场景参考绑定仍未形成端到端流水线。
- Canvas 已能展示图像准备信息和动作元数据，但图像准备结果的候选对比、锁定、替换和重新执行仍需要更完整 UX。

结论：现有架构已经从“策略骨架”推进到“可审阅计划 + 纯 runtime 门禁/执行 helper”。下一步重点是 provider IO、Perception/mask/OCR 接入和 Canvas 审阅闭环。

## 三、架构决策

### 3.1 决策摘要

引入 `ShotImagePrepPlan` 作为 `StoryboardTable` 与媒体生成/编辑能力之间的中间计划。

- `StoryboardTable` 继续表达镜头语义：画面、镜头、叙事、人物、对白、声音、来源素材和 `imageStrategy`。
- `ShotImagePrepPlan` 表达图像准备意图：源图如何切分、是否去字、是否上色、是否扩图、是否重绘、需要哪些参考图和遮罩。
- `GenerateImage` 与 `TransformImage` 在协议/能力层保持语义区分。
- 执行层可以把二者映射到同一个底层 media image backend，只要请求参数、审阅状态和 backfill 结果保持可区分。
- 参考图不应只靠 prompt 文本描述，应通过 `referenceBundle` 绑定角色、场景、风格、前后镜头和源分格。

### 3.2 三个架构问题

1. **是否符合现有架构？**

   符合。该方案延续 `StoryboardTable` 的“计划先行”、`CompositeArtifact` 的“通用产物审阅”、以及 capability provider 的“执行能力注册”模式。Agent 负责编排和语义决策，Canvas/Cut/provider 负责领域执行。

2. **如何进一步降低耦合？**

   不把漫画图像准备逻辑硬编码到 Canvas 或 Cut。共享层只定义计划契约和纯函数解释；具体 provider 通过 capability registry 动态发现。Canvas 只渲染和审阅计划，Cut 只消费准备好的关键帧与视频生成提示词。

3. **是否易于扩展与测试？**

   是。`ShotImagePrepPlan` 可独立校验；`imageStrategy` 到能力请求的解释可单元测试；provider 不可用时可降级为待执行计划；Canvas 可用 fixture 验证渲染；Cut 可只测试读取 `generatedMediaRefs` 的视频生成输入。

## 四、五层分析

| 层 | 职责 | 归属 |
|---|---|---|
| 职责 | 把镜头语义、图像准备、能力执行、Canvas 审阅、Cut 生成拆开 | Agent / Canvas / Cut / Provider |
| 依赖 | `StoryboardTable` → `ShotImagePrepPlan` → capability request → backfill refs | `@neko/shared` 纯契约优先 |
| 接口 | `imageStrategy`、`ShotImagePrepPlan`、`referenceBundle`、`generatedMediaRefs` | shared types / agent runtime |
| 扩展 | 新 provider、新编辑操作、新 profile 通过 registry 和 profile 描述扩展 | capability registry / artifact profile |
| 测试 | schema validation、strategy interpretation、provider unavailable、backfill、Canvas render | shared / agent / canvas / cut tests |

## 五、能力边界

### 5.1 GenerateImage

`GenerateImage` 表示生成或重构一张新图。它的输入核心是 prompt，也可以携带参考图、控制图、角色参考、风格参考等。

适用场景：

- 原漫画没有对应分格，需要补一个过渡镜头。
- 当前 panel 构图不可用，需要按描述重新绘制关键帧。
- 需要生成角色设定图、场景设定图、道具图、风格样张。
- 源图只作为弱参考，结果不要求严格保持原图像素结构。
- 从剧本或分镜描述直接生成第一版视觉方案。

输出语义：

- 生成结果写入 `generatedMediaRefs`。
- 源图或参考图保留在 `sourceMediaRefs` / `referenceBundle`。
- 不应把生成结果伪装为源图。

### 5.2 TransformImage

`TransformImage` 表示源图绑定的派生编辑。它必须有明确 source image，通常还需要 mask、edit instruction 或 reference bundle。

适用场景：

- 漫画分格已经清晰，只需裁切、清理、上色或风格化。
- 去除对白框、拟声字、水印，并用 inpaint 补全被遮挡画面。
- 对画面边缘做 outpaint，补足视频所需横竖比例。
- 对黑白漫画进行可控上色。
- 在保持原构图基础上重绘角色细节或修复画面缺陷。
- 按统一角色/场景参考做局部一致性修正。

输出语义：

- 源图继续保留在 `sourceMediaRefs`。
- 派生结果写入 `generatedMediaRefs`，role 应为 `derived` 或 `generated`。
- 操作需要能被审阅：用户应知道这张图来自哪张源图、做了什么编辑、用了哪些 mask 和参考。

### 5.3 二者是否可以合并

协议层不应合并。

原因：

- `GenerateImage` 是“从语义生成/重构新图”，`TransformImage` 是“对源图做受约束派生编辑”。
- 二者的用户预期不同：前者允许创作变化，后者强调保留来源与可追溯性。
- 二者的审阅方式不同：Transform 需要展示 before/after、mask、edit instruction；Generate 更关注 prompt、reference、候选图。
- 二者的失败诊断不同：Transform 可能失败于 mask、源图解析、局部补图；Generate 主要失败于模型、prompt、参考一致性。

执行层可以合并到同一个底层 provider。例如某些模型的 image-to-image、inpaint、outpaint 都通过 `GenerateImage` 服务发起；但 Agent 与 Canvas 仍应保留 `TransformImage` 的语义动作，避免审阅和回填混乱。

## 六、Comic-to-Animation 决策矩阵

| 场景 | 推荐 `imageStrategy` | 推荐能力 | 说明 |
|---|---|---|---|
| 分格清晰、画面干净、可直接作为关键帧 | `reuse-original` | `ResolveMediaRef` | 不生成新图，只解析源素材 |
| 分格清晰，但需要上色、去字、修复、扩图 | `transform-original` | `TransformImage` | 保持源图约束，输出派生图 |
| 分格可作为构图/角色参考，但风格或比例不适合视频 | `use-as-reference` | `GenerateImage` with references | 生成新关键帧，源图作为强参考 |
| 没有可用分格，需要补镜头或转场 | `generate-new` | `GenerateImage` | 由镜头描述和 reference bundle 生成 |
| 首次建立角色/场景设定图 | `generate-new` | `GenerateImage` | 产出长期参考资产 |
| 已有角色/场景设定，需要保持一致重绘镜头 | `use-as-reference` 或 `transform-original` | `GenerateImage` / `TransformImage` | 根据是否保留源构图选择 |
| 对已有关键帧做局部修正 | `transform-original` | `TransformImage` | 需要 source + mask + edit instruction |

重要原则：

- 不是只有第一次才使用 `GenerateImage`。补镜头、重构不可用 panel、生成角色/场景参考、风格探索都需要它。
- 也不是所有后续镜头都只能 `TransformImage`。如果源 panel 无法满足动画构图，仍应使用 `GenerateImage` 并绑定参考。
- 对漫画源图的清理、去字、补图、上色、扩图，优先走 `TransformImage`。
- 对从文本补充、视觉重构、设定图生成，优先走 `GenerateImage`。

## 七、ShotImagePrepPlan 契约

`ShotImagePrepPlan` 是执行前的审阅计划，不是工具调用结果。

```typescript
interface ShotImagePrepPlan {
  readonly schemaVersion: 1;
  readonly kind: 'shot-image-prep-plan';
  readonly planId: string;
  readonly storyboardId?: string;
  readonly sceneId: string;
  readonly shotId: string;
  readonly sourceMediaRefs: readonly StoryboardMediaRef[];
  readonly imageStrategy: StoryboardShotImageStrategy;
  readonly operationPlan: readonly ShotImagePrepOperation[];
  readonly referenceBundle?: ShotReferenceBundle;
  readonly targetAspectRatio?: string;
  readonly targetStyle?: string;
  readonly editInstruction?: string;
  readonly generationPrompt?: string;
  readonly negativePrompt?: string;
  readonly maskRefs?: readonly StoryboardMediaRef[];
  readonly perceptionCardRefs?: readonly PerceptionCardRef[];
  readonly outputMediaRefs?: readonly StoryboardMediaRef[];
  readonly status:
    | 'planned'
    | 'needs-approval'
    | 'approved'
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'skipped';
  readonly diagnostics?: readonly ShotImagePrepDiagnostic[];
  readonly metadata?: ShotImagePrepJsonRecord;
}

type ShotImagePrepOperation =
  | 'crop-panel'
  | 'remove-text'
  | 'inpaint'
  | 'outpaint'
  | 'colorize'
  | 'upscale'
  | 'style-normalize'
  | 'redraw'
  | 'generate-keyframe';

interface ShotReferenceBundle {
  readonly sourcePanelRefs?: readonly StoryboardMediaRef[];
  readonly characterRefs?: readonly CharacterReferenceRef[];
  readonly sceneRefs?: readonly SceneReferenceRef[];
  readonly styleRefs?: readonly StoryboardMediaRef[];
  readonly previousShotRefs?: readonly StoryboardMediaRef[];
  readonly continuityNotes?: readonly string[];
}

interface CharacterReferenceRef {
  readonly entityRef: CreativeEntityRef; // entityKind must be 'character'
  readonly role?: 'identity' | 'appearance' | 'outfit' | 'expression' | 'pose' | 'voice' | 'continuity';
  readonly assetRefs?: readonly StoryboardMediaRef[];
  readonly memoryObservationIds?: readonly string[];
  readonly confidence?: number;
}

interface SceneReferenceRef {
  readonly entityRef: CreativeEntityRef; // entityKind should be 'scene' or 'location'
  readonly role?: 'layout' | 'lighting' | 'time-of-day' | 'mood' | 'prop-continuity' | 'continuity';
  readonly assetRefs?: readonly StoryboardMediaRef[];
  readonly semanticIndexRefs?: readonly string[];
  readonly confidence?: number;
}
```

当前共享类型已实现上述品牌字段、状态枚举、operation 枚举、`perceptionCardRefs`、`metadata`、validator、storyboard derivation、profile projection 与测试。输出引用只能在 `status: "succeeded"` 后出现；计划阶段不得伪造 `outputMediaRefs`。

当前 operation 词汇表为闭合集合：

- `crop-panel`
- `remove-text`
- `inpaint`
- `outpaint`
- `colorize`
- `upscale`
- `style-normalize`
- `redraw`
- `generate-keyframe`

`CharacterReferenceRef` 和 `SceneReferenceRef` 不建立第二套身份系统。它们只是 `CreativeEntityRef` 的图像准备上下文包装：

- 角色必须引用 `entityKind: "character"` 的统一实体。
- 场景优先引用 `entityKind: "scene"` 或 `entityKind: "location"` 的统一实体。
- `assetRefs` 指向可渲染参考图、设定图、前后镜头或源 panel。
- `memoryObservationIds` 指向 Character Memory 中已接受或待审阅的证据。
- `semanticIndexRefs` 指向媒体语义索引中的 OCR/ASR/字幕/视觉证据片段。
- 不允许用 `CharacterReferenceRef` / `SceneReferenceRef` 自动创建 confirmed entity；新角色或新场景只能作为 candidate entity 或 observation 进入审阅链路。

## 八、参考图与一致性

生成镜头图片时必须支持参考图，否则人物、场景和风格会漂移。

`referenceBundle` 应至少能表达：

- 角色参考：统一实体或 character memory 中的头像、全身、服装、表情、年龄阶段、关键外观差异。
- 场景参考：地点、时代、光照、空间布局、道具。
- 风格参考：线稿风格、上色风格、镜头质感、作品统一美术方向。
- 前后镜头参考：相邻镜头的关键帧，帮助保持连续性。
- 源 panel 参考：当前漫画分格或同页其他分格。

这些参考不应被压成一段自由文本。Prompt 可以描述意图，但稳定引用必须使用 media refs、entity refs、memory refs 或 asset refs。

### 8.1 Canvas / Artifact 引用解析

Shot 图像准备会消费 Canvas 节点、统一实体、Character Memory、PerceptionCard、semantic index 和 generated assets 中的多类引用。引用协议不应只绑定 `ShotNode`；`ShotNode` 是 comic-to-animation 的首个高价值入口，但底层能力应复用通用 Canvas / Artifact stable reference resolver。

详细协议见 `adr-canvas-artifact-reference-resolution.md`。本 ADR 只保留 comic-to-animation 的约束：`referenceBundle`、`sourceMediaRefs`、`maskRefs`、`generatedMediaRefs` 和 Canvas 节点引用都必须保存 stable refs；执行 `GenerateImage` / `TransformImage` / `GenerateVideo` 前，由 Extension Host 将这些 stable refs 解析为 provider 可消费的 URI/base64/ipAdapterRefs/keyframe inputs。

## 九、与统一实体和 Character Memory 的关系

Comic-to-animation 图像准备应消费统一实体和 Character Memory，但不能把图像准备计划变成实体事实源。

推荐关系：

```text
素材感知/OCR/视觉分析
  ↓
CharacterObservation / EntityMemoryContribution
  ↓
统一实体与 Character Memory 审阅/合并
  ↓
ShotReferenceBundle 引用已确认或高置信角色资产
  ↓
GenerateImage / TransformImage
```

规则：

- Agent 可以从当前漫画素材渐进提取人物外观、对白、声音、关系和出场证据。
- 自动提取的信息应先成为 observation/contribution，而不是直接覆盖长期人物设定。
- 生成或转换镜头图片时，优先引用已存在实体和角色 memory，避免重复创建角色。
- 当当前素材证据与已有角色设定冲突时，应生成 diagnostic 或 change event，而不是静默覆盖。
- 长篇创作中的年龄、服装、伤痕、发型、声音变化应通过显式变化事件或时间线状态表示。

## 十、执行流水线

推荐运行时流程：

```text
1. Resolve source refs
2. Perception: panel detection / OCR / mask / character evidence → PerceptionCard
3. Normalize StoryboardTable
4. Build ShotImagePrepPlan
5. Render CompositeArtifact table/gallery for review
6. Approval gate
7. Route by imageStrategy:
   - reuse-original      → ResolveMediaRef
   - transform-original  → TransformImage
   - use-as-reference    → GenerateImage with references
   - generate-new        → GenerateImage
8. Backfill generatedMediaRefs / outputMediaRefs
9. Canvas review and lock approved keyframes
10. Cut consumes keyframes + video prompts
```

PerceptionCard 衔接规则：

- `PerceptionCard` 仍归 `adr-agent-multimodal-perception.md` 的感知管线管理，是 Asset -> AgentObservation 的中间产物。
- `ShotImagePrepPlan` 不内嵌完整 `PerceptionCard`，只引用其 stable asset refs、evidence 摘要、panel/mask refs 或 `PerceptionCardRef`。
- panel detection、OCR、对白框 mask、主体框、候选角色匹配等感知结果先进入 `PerceptionCard` / semantic index，再由 Agent 投影为 `ShotImagePrepPlan` 和 `GenericTable(profile="comic-shot-asset-prep")`。
- 如果 PerceptionCard 不可用，Agent 仍可基于已有 `sourceMediaRefs` 生成低置信 prep plan，但必须标注缺失感知 diagnostic。

能力缺失时：

- 不伪造工具结果。
- 保留 `ShotImagePrepPlan`。
- 在 CompositeArtifact / Canvas 中显示 unavailable diagnostic。
- 允许用户稍后安装 provider、切换 provider 或手工替换输出。

## 十一、comic-shot-asset-prep Profile

`comic-shot-asset-prep` 是用于审阅图像准备计划的 `GenericTable` profile。它承载 `ShotImagePrepPlan` 的表格视图，不替代 `ShotImagePrepPlan` 本体。

最小列 schema：

| columnId | cellType | required | 说明 |
|---|---|---:|---|
| `shotId` | `string` | 是 | 绑定 `StoryboardShotRow.shotId` |
| `sourcePanel` | `media-preview` | 是 | 当前镜头主要源 panel 或源图 |
| `imageStrategy` | `enum` | 是 | `reuse-original` / `use-as-reference` / `generate-new` / `transform-original` |
| `operationPlan` | `tags` | 是 | `crop-panel` / `remove-text` / `inpaint` / `outpaint` / `colorize` / `generate-keyframe` 等 |
| `textRemoval` | `status` | 否 | `not-needed` / `needed` / `mask-ready` / `blocked` |
| `maskRefs` | `json` | 否 | `{ "refs": StoryboardMediaRef[] }`，只保存 stable refs |
| `referenceBundle` | `json` | 否 | `{ "characters": CharacterReferenceRef[], "scenes": SceneReferenceRef[], "styleRefs": StoryboardMediaRef[] }` |
| `generationPrompt` | `string` | 否 | 图像生成或转换提示词摘要 |
| `videoPrompt` | `string` | 否 | 后续视频生成提示词摘要 |
| `targetAspectRatio` | `string` | 否 | 目标画幅，例如 `16:9`、`9:16`、`1:1` |
| `output` | `media-preview` | 否 | 已生成或转换后的候选关键帧 |
| `status` | `status` | 是 | 投影 `ShotImagePrepPlan.status`，不维护独立审批状态 |
| `diagnostics` | `diagnostic` | 否 | 缺少 mask、provider 不可用、speaker/character 不一致等 |

Profile descriptor 约束：

- `shotId`、`imageStrategy`、`operationPlan`、`status` 必须存在。
- `status` 必须来自 `ShotImagePrepPlan.status`；profile 不维护独立的 `approvalStatus`，避免 plan 层与表格层状态分裂。
- `rejected` / `blocked` 不作为 plan 状态；用户拒绝映射为 `skipped` 并记录原因，阻塞条件通过 `diagnostics` 表达。
- `sourcePanel` 在 `reuse-original`、`use-as-reference`、`transform-original` 中必须存在；`generate-new` 可为空，但应有 `generationPrompt` 或 `referenceBundle`。
- `maskRefs` 的 JSON shape 只做浅层校验：必须有 `refs` 数组，不递归验证完整媒体对象；完整 ref 校验由 `StoryboardMediaRef` validator 负责。
- `referenceBundle` 的 JSON shape 只校验 `characters`、`scenes`、`styleRefs` 等顶层键；其中 entity/media refs 由对应 validator 校验。
- `output` 只能在执行后写入；Agent 生成计划时不得伪造 output。

已注册 actions：

| actionId | 作用 | 副作用 |
|---|---|---|
| `approve-shot-prep` | 批准单个 shot 的 prep plan | 无，状态变更 |
| `reject-shot-prep` | 拒绝单个 shot 的 prep plan | 无，状态变更为 `skipped` |
| `edit-shot-prep` | 修改 strategy、operation、prompt 或 refs | 无，生成新的 plan revision |
| `estimate-batch-cost` | 估算已批准计划的批量执行成本 | 无，生成成本摘要 |
| `run-shot-prep` | 执行单个 shot 图像准备 | 有，调用 capability |
| `run-approved-shot-prep-batch` | 批量执行已批准计划 | 有，调用 capability |

## 十二、Approval Gate 交互设计

Approval gate 必须发生在 expensive 或有副作用的能力执行前。它不是一个简单的全局确认按钮，而是支持 shot 级别审阅。

推荐交互：

- Agent Webview 先展示 `CompositeArtifact`：表格 + source panel gallery + diagnostics。
- 用户可在 Agent Webview 中快速批准/拒绝，也可发送到 Canvas 进行细粒度审阅。
- Canvas shot 面板展示 before/source、operation plan、mask、reference bundle、prompt、diagnostics 和预计成本。
- 用户可以对单个 shot 执行 `approve`、`reject`、`edit`、`run`。
- 批量执行前必须先执行 `estimate-batch-cost`，展示成本摘要后才能执行 `run-approved-shot-prep-batch`。
- 批量执行只选择 `status: "approved"` 且无阻塞 diagnostic 的行。
- `edit` 不直接修改已执行结果，而是创建新的 `ShotImagePrepPlan` revision；旧结果继续可追溯。

推荐状态机：

```text
planned
  -> needs-approval
  -> approved -> queued -> running -> succeeded
  -> approved -> queued -> running -> failed -> needs-approval
  -> skipped
```

审批规则：

- `reuse-original` 可允许轻量自动批准，但仍应显示来源和诊断。
- `transform-original` 需要用户确认源图、mask 和 edit instruction。
- `use-as-reference` / `generate-new` 需要确认 prompt、reference bundle、成本和候选数量。
- provider 不可用、mask 缺失、reference 指向 unsafe URI、角色引用冲突时不能进入 `queued`。
- 用户批量批准时，系统应展示 shot 数量、预计生成次数、预计成本、provider、并发上限和失败后策略。

## 十三、Canvas 与 Cut 展示要求

Canvas 的 shot 面板应支持分区展示：

- 基础镜头：scene、shot、duration、camera、motion。
- 视觉：visual description、character action、imageStrategy、source/generated refs。
- 人物：角色、统一实体引用、出场状态、外观/服装/表情证据。
- 文本：OCR、对白、旁白、背景字、对白框来源。
- 声音：voice cues、speaker entity、voice profile、sound cues。
- 图像准备：operationPlan、mask、referenceBundle、before/after。
- 生成提示：image prompt、video prompt、negative prompt、provider metadata。

Cut 不应重新解析漫画页来猜图片准备结果。Cut 应消费 Canvas/Agent 已审阅的关键帧、视频提示词、音频/对白绑定和 timeline-ready refs。

## 十四、批量执行、并发与成本控制

长篇漫画可能包含数百页、数百到上千个镜头。图像准备必须有批量执行契约，不能把每个 shot 当成孤立工具调用无控制地并发。

建议新增批量请求草案：

```typescript
interface ShotImagePrepBatchRequest {
  readonly batchId: string;
  readonly planIds: readonly string[];
  readonly providerId?: string;
  readonly maxConcurrency: number;
  readonly retryPolicy: {
    readonly maxAttempts: number;
    readonly retryOn: readonly ('provider-timeout' | 'rate-limit' | 'transient-error')[];
  };
  readonly budgetLimit?: {
    readonly maxEstimatedCost?: number;
    readonly maxEstimatedTokens?: number;
    readonly maxOutputImages?: number;
  };
  readonly failurePolicy: 'stop-on-first-failure' | 'continue' | 'continue-approved-only';
}

interface ShotImagePrepCostEstimate {
  readonly planId: string;
  readonly providerId?: string;
  readonly operationPlan: readonly ShotImagePrepOperation[];
  readonly estimateState?: 'known' | 'unknown' | 'unavailable';
  readonly estimatedCost?: number;
  readonly estimatedTokens?: number;
  readonly estimatedDurationMs?: number;
  readonly diagnostics?: readonly ArtifactDiagnostic[];
}
```

批量规则：

- 默认 `maxConcurrency` 应保守，例如 2-4；具体上限由 provider capability 声明覆盖。
- 批量执行前必须先生成 cost estimate；无法估算时显示 unknown cost，不允许静默执行大批量。
- rate limit、timeout、临时 provider 错误可按 retry policy 重试；mask/ref/schema 错误不重试。
- 每个 shot 的执行结果独立 backfill，不能因为一个失败丢弃整个 batch 的成功结果。
- batch summary 应写入 `ArtifactExecutionSummary`，包含 succeeded、failed、skipped、cancelled、unavailable 计数。
- 用户取消 batch 时，已完成结果保留，queued/running 尽量取消，未开始计划回到 `approved` 或 `needs-approval`。

测试重点：

- 并发上限生效。
- 预算超限阻止执行。
- 单个失败不覆盖其他 shot output。
- retry 只作用于 transient failure。
- Webview 重建后可恢复 batch summary 和每行状态。

## 十五、代码、Profile 与 Skill 的职责边界

Comic-to-animation 图像准备不能只靠 Skill prompt，也不能把所有领域启发式都固化进代码。推荐采用三层职责：

```text
代码：不可变契约、校验、渲染、状态、副作用、权限、安全
Profile / Manifest：可注册的数据结构、列配置、浅层 schema、action 声明
Skill：任务策略、提示词、生成倾向、领域步骤说明
```

### 15.1 必须由代码处理

| 类型 | 原因 |
|---|---|
| `StoryboardTable`、`ShotImagePrepPlan`、`GenericTable` 等协议类型 | 需要稳定契约与跨子包复用 |
| validator / normalizer / projector | 必须确定性，不能依赖 prompt 自觉 |
| `imageStrategy` 解释规则 | 决定复用、生成、转换或缺能力降级，涉及副作用 |
| `GenerateImage` / `TransformImage` capability 调用 | 涉及真实工具、成本、权限、失败恢复 |
| Canvas / Cut 渲染与导入 | 子包支持程度必须由代码注册和声明 |
| Approval gate / batch execution / cost estimate | 涉及用户确认、并发、费用和安全 |
| media ref 安全校验 | 必须禁止 base64、blob、webview URI、绝对路径等不稳定引用 |
| OCR / ASR / mask / embedding provider 接入 | 真实 IO、模型执行和缓存必须在 Extension Host / provider 层 |
| Character Memory / Entity 持久化合并 | 长期事实源需要幂等、冲突检测、审阅和可追溯性 |

### 15.2 适合由 Profile / Manifest 处理

| 类型 | 原因 |
|---|---|
| `comic-shot-asset-prep` 列定义 | 数据结构可配置，但 cell type 与 schema 仍由代码校验 |
| 字段分组与显示提示 | 方便 Canvas / Agent Webview 复用，不绑定具体 skill |
| action 声明 | 表示可建议操作；是否可执行仍由 capability registry 决定 |
| 浅层 JSON shape | 约束 `referenceBundle`、`maskRefs` 等顶层结构 |
| profile 到 projector 的 mapping | 让不同子包按注册 mapping 消费，而不是解析 Skill Markdown |

Profile/Manifest 可以声明“这个任务产物有哪些字段和建议动作”，但不能提升 provider 权限、绕过 validator、绕过 approval gate，或让子包支持未注册协议。

### 15.3 适合由 Skill 处理

| 类型 | 原因 |
|---|---|
| comic-to-animation 工作流说明 | 指导 Agent 先分析漫画、再生成表格和图像准备计划 |
| 输出 artifact/profile 的倾向 | 例如优先输出 `comic-shot-asset-prep` 和 `comic-to-animation-plan` |
| 是否需要上色、去字、补图、重绘的判断启发式 | 属于领域策略，可随任务和用户偏好调整 |
| 分镜描述风格 | 镜头、叙事、人物、对白、声音的描述倾向 |
| 角色观察提取原则 | 例如“只输出有证据的维度”“不猜测低置信信息” |
| prompt 模板 | 图像生成、视频生成、TransformImage edit instruction |
| 按需字段组合意图 | Skill 可说明当前任务关注哪些 profile 字段 |
| 修复建议和诊断解释 | 面向用户的自然语言说明 |

Skill 只能引用已注册协议、profile 和 capability。它可以引导 Agent 输出某些字段，但不能让 Canvas/Cut 执行未注册操作，不能发明稳定资源引用格式，不能直接写长期实体事实，也不能把“建议执行”变成“已经执行”。

### 15.4 边界判断

一句话原则：

```text
Skill 负责让 Agent 想对、说对；
Profile 负责让结构可注册、可审阅；
代码负责让系统验对、做对、错了可恢复。
```

如果某个逻辑会改变项目状态、调用 provider、产生费用、写入长期事实、或影响跨子包契约，就必须落在代码和 registry 中。如果某个逻辑只是描述任务偏好、提示词风格、字段选择倾向或领域判断启发式，则优先放在 Skill。

## 十六、实施计划

### P0：ADR 与契约收敛

- 新增本 ADR。
- 明确 `GenerateImage` 与 `TransformImage` 在语义层保持区分。
- 在 `StoryboardTable` ADR 中保留 `TransformImage` 是策略路由而非内置实现的说明。
- 确认 `comic-shot-asset-prep` profile 应承载图像准备表，而不是继续扩张 `StoryboardTable`。
- 将 `CreativeEntityRef`、`PerceptionCard` / `PerceptionCardRef`、`GenericTable` profile descriptor 的引用关系写入契约说明。
- 明确代码、Profile/Manifest、Skill 的职责边界，避免 Skill 被误用为运行时能力注册。

### P1：ShotImagePrepPlan 与 profile

- 已在共享类型中新增 `ShotImagePrepPlan`、`ShotReferenceBundle`、`ShotImagePrepOperation`。
- 已新增 `comic-shot-asset-prep` GenericTable profile。
- 已支持 Runtime 从 `StoryboardTable` 生成 `ShotImagePrepPlan`。
- 已支持 Canvas 渲染图像准备分区，展示 source/generated refs、operation、prompt、reference bundle。
- 已在 Canvas 暴露 shot 级 approval / skip / estimate / run 动作元数据；完整 plan revision UX 后续继续完善。

### P2：TransformImage facade 与 provider 映射

- 已新增 `TransformImage` facade 级 runtime helper，并已在平台 media tools 中注册 `TransformImage` 工具名与 source/mask/reference/edit 参数 schema。
- 已将 `TOOL_NAMES_MEDIA.TRANSFORM_IMAGE` 与权限 traits 接入；`ai-generate` skill 可调用该工具，`comic-to-storyboard` 仍保持只读分析与计划输出。
- 已将 `transform-original` 请求映射为 source + mask + edit instruction + references。
- 允许底层复用现有 image generation/edit backend。
- 平台工具会在 host 已解析 `sourceImageUri` / `referenceImageUri` / `referenceImageBase64` 时路由到现有 image generation backend；如果只有 stable `sourceImageRef`，会显式失败并提示需要 host IO 解析，不会伪装成成功执行。
- 已增加 provider unavailable、unsafe ref、unknown cost、backfill failed 等测试；mask provider 端到端测试随 P3 provider 接入补齐。

### P3：漫画图像准备流水线

- 接入 panel detection、OCR、对白框 mask、inpaint/outpaint/colorization。
- 支持 before/after comparison、候选图选择、锁定关键帧。
- 将角色/场景 reference bundle 与统一实体、Character Memory、媒体语义索引联动。
- 统一 Canvas `referenceRefs` 与 `ShotImagePrepPlan.referenceBundle` 的 host-side stable ref resolver，将 `StoryboardMediaRef`、`VisualOccurrence.cropRef`、角色/场景/风格 refs、Gallery refs 和通用 Canvas node refs 解析为 provider 可消费的 URI/base64/ipAdapterRefs。
- 在 ShotNode、GalleryNode、SceneGroupNode、StoryboardNode 和注册实体节点中提供轻量引用摘要：来源图、角色参考、场景参考、上一镜头参考、mask、diagnostic 和已锁定输出状态。

### P4：长篇一致性与批量生成

- 支持跨页、跨章节的角色形象和场景参考缓存。
- 已有批量 shot image prep 的纯 runtime 并发、重试、成本门禁和失败恢复 helper；真实 provider 队列恢复与 Webview 重建恢复后续接入。
- 支持角色外观/声音变化时间线，生成时按镜头时间点选择对应 reference set。

## 十七、风险与约束

- 如果把 `TransformImage` 直接并入 `GenerateImage`，短期实现会简单，但会丢失源图派生语义、审阅方式和失败诊断。
- 如果把所有图像准备字段塞进 `StoryboardTable`，分镜表会再次变成万能 JSON，破坏 `CompositeArtifact` 和动态 table profile 的设计目标。
- 如果只依赖 prompt 描述角色和场景，不使用 reference refs，长篇角色一致性会不可控。
- 如果 Agent 自动创建实体且不检查已有实体，会造成角色重复和 memory 分裂。
- 如果媒体文件缺少 OCR/ASR/semantic index，Agent 很难在长篇素材中渐进检索和复用人物证据。
- 如果批量执行缺少成本估算和并发上限，长篇项目会产生不可控费用、rate limit 和 Webview 状态恢复问题。
- 如果把 provider 权限、子包支持程度或长期事实写入交给 Skill，系统会失去确定性校验和审计边界。

## 十八、结论

Comic-to-animation 应采用：

```text
StoryboardTable 负责镜头语义
ShotImagePrepPlan 负责图像准备计划
GenerateImage 负责新图生成
TransformImage 负责源图绑定派生编辑
Canvas 负责审阅与关键帧选择
Cut 负责视频生成消费
统一实体/Character Memory 负责长期一致性参考
```

当前项目已经具备 `imageStrategy`、`ShotImagePrepPlan`、`comic-shot-asset-prep` profile、`TransformImage` facade 工具注册、纯 runtime 门禁/执行 helper、Canvas 展示和 Cut prepared keyframe handoff。后续应继续补齐真实 OCR/ASR/panel/mask provider、通用 Canvas/artifact stable ref 到 host URI/base64/ipAdapterRefs 的 IO 解析、节点引用摘要、候选图审阅/锁定 UX 与长篇批量恢复，而不是把所有逻辑继续写死到分镜表或单个生成工具里。
