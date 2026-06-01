# ADR: Agent 结构化分镜表输出契约与校验修复闭环

**状态**: Proposed (2026-05-31)
**关联**: `story-agent-canvas-boundary.md` · `agent-media-architecture.md` · `adr-agent-multimodal-perception.md` · `adr-skill-as-prompt-chains.md`
**范围**: `neko-agent` · `neko-story` · `neko-canvas` · `@neko/shared`（契约归属）· `@neko/agent-types`（展示适配）

---

## 一、背景

`neko-agent` 已经可以用 `neko-composite` fenced JSON 输出 `template: "storyboard-table"` 的富内容块，并且 Webview 能将该内容投影为 Canvas / Cut 可接收的转移 payload。

当前能力足以支持“提示词约束格式”，但还不是长期稳定方案：

- 输出格式主要依赖 prompt 约束，缺少可复用的机器校验契约。
- `storyboard-table` 既可表示 Chat 中的展示表，也可表示可导入 Canvas 的语义分镜计划，二者边界不够清晰。
- Agent 生成 JSON 失败时，目前主要依赖解析器丢弃无效块，缺少结构化修复重试闭环。
- 不同入口可能各自发明表格字段，最终导致 Story、Agent、Canvas 对“分镜表”的理解分裂。
- LLM 输出本质上始终是纯文本；它不能真正嵌入图片或执行生成工具，只能以文本声明计划、引用和策略。图片生成、引用解析、工具调用与回填必须由 runtime / Extension Host 执行。

长期方案需要让 Agent 生成“指定格式分镜表”从 prompt 约定升级为：

```text
Schema 契约 → LLM 文本计划 → Validator 校验 → Strategy 执行 → Repair/Backfill → RichContent 展示 → Canvas/Cut 投影
```

---

## 二、架构决策

### 2.1 决策摘要

引入 `StoryboardTableV1` 作为 Agent 生成分镜表的规范化语义契约。

- `StoryboardTableV1` 是 Agent 输出的**语义分镜计划表**，不是 `neko-story` 的 scene-level 视频准备度表。
- `StoryboardTableV1` 必须能无损投影为现有 `CanvasStoryboardPayload` 的 semantic import 输入。
- `neko-composite` 继续作为 Chat 富内容承载格式，但其中的 `storyboard-table` 数据应逐步升级为 `StoryboardTableV1`。
- Agent 输出后必须经过 schema validation；失败时进入 bounded repair retry，而不是静默丢弃或把错误 JSON 展示给用户。
- LLM 只负责输出 `StoryboardTableV1` 文本计划。是否复用原图、引用原图生成新图、纯文本生成新图或转换原图，必须通过 shot-level `imageStrategy` 明确声明，并由 Agent runtime 解释执行。
- 图片不进入 LLM 文本本体；表格只保存 `mediaRefs` / asset refs / task refs。真实图片 URI 由 Webview 或 Extension Host 在展示时解析，生成结果通过 `toolResultBackfill` 写回对应工具结果或分镜表投影。
- Agent runtime 的“执行”含义是解释计划、校验权限、应用用户 override、路由到 capability provider 并回填结果；不表示 Agent 内置图片、音频、视频或人物形象创作实现。
- Canvas 仍是正式 storyboard 工作台；Story 仍是剧本事实与审阅入口；Agent 只持有当轮生成计划，不成为长期 storyboard 事实源。
- 未来扩展到音频、视频、人物形象创作时，应沿用“纯文本计划 + capability provider + artifact refs/backfill + 专业子包事实源”的模式，而不是让 Agent 成为统一创作中心。

### 2.2 最终设计方案

分镜表最终不是 Agent Chat 里的普通表格，而是一个可校验、可修复、可投影、可调度能力的结构化镜头计划。

```text
LLM 纯文本计划
  ↓
StoryboardTableV1 schema validation
  ↓
bounded repair retry
  ↓
imageStrategy interpretation + user override
  ↓
capability provider routing
  ↓
media/artifact refs backfill
  ↓
Agent lightweight rendering
  ↓
Canvas/Cut projection or editor handoff
```

最终职责边界：

- Agent 负责计划生成、schema validation、修复重试、策略解释、用户 override、capability routing、结果回填和轻量展示。
- Agent 不强依赖子包能力；它可以在 provider 缺失时保留计划、显示缺失能力、禁用对应操作，但不能伪造执行结果。
- Canvas / Cut / Audio / Model / Puppet 等子包负责领域执行、深度编辑、精确预览和长期事实源。
- `@neko/shared` 负责稳定共享契约；子包内部编辑模型、provider 私有参数和 Webview 状态留在子包。
- LLM 只输出计划字段，不输出图片、音频、视频、模型二进制，不输出假路径或假 tool refs。

### 2.3 三个架构问题

1. **是否符合现有架构？**

   符合。该方案延续 `story-agent-canvas-boundary.md` 的职责划分：`story` 负责剧本事实与 scene-level 审阅，`agent` 负责语义决策与流程编排，`canvas` 负责分镜落地与视觉编辑。

2. **如何进一步降低耦合？**

   将分镜表格式收敛到共享契约和纯函数投影层；Agent Webview 只负责展示，Canvas 只消费 `CanvasStoryboardPayload`，Story 不读取 Agent 富内容内部结构。

3. **是否易于扩展与测试？**

   是。Schema、validator、repair prompt、Canvas/Cut projector 都可以单独测试。新增列或字段通过 schema version 演进，不需要改动多个 UI 的临时解析逻辑。

---

## 三、五层分析

### 3.1 职责

| 层 | 职责 | 归属 |
|---|---|---|
| 语义契约 | 定义 `StoryboardTableV1` / `StoryboardShotRowV1` / `StoryboardMediaRefV1` | `@neko/shared` |
| 输出约束 | 指导 Agent 按 schema 生成分镜表 | Skill / Prompt / system prompt module |
| 校验修复 | 校验 JSON，生成修复提示，限制重试次数 | `neko-agent` runtime |
| 策略执行 | 解释 `imageStrategy`，决定复用引用或调用生成工具 | `neko-agent` runtime / Extension Host |
| 能力路由 | 将 validated plan 转成 capability request 并匹配 provider | `neko-agent` runtime / capability registry |
| 领域能力 | 执行图片、视频、音频、人物形象等生成/编辑/预览 | `neko-canvas` / `neko-cut` / `neko-audio` / `neko-model` / future packages |
| 展示投影 | 将有效结构渲染为 Chat 富内容 | `neko-agent` webview |
| 下游投影 | 转成 `CanvasStoryboardPayload` / Cut storyboard payload | projector 纯函数 |

归属决策：

- `StoryboardTableV1`、`StoryboardShotRowV1`、`StoryboardShotCharacterV1`、`StoryboardMediaRefV1`、`StoryboardShotImageStrategyV1` 统一归属 `@neko/shared`。
- `@neko/agent-types` 只能提供 `CompositeBlockData` 展示适配、legacy renderer 类型或 re-export，不拥有分镜表语义 schema。
- 原因是 Canvas/Cut projector 必须读取同一份语义契约；projector 纯函数不应反向依赖 agent-specific package。

### 3.2 依赖

推荐依赖方向：

```text
@neko/shared
  ├─ StoryboardTableV1
  ├─ StoryboardMediaRefV1
  ├─ CanvasStoryboardPayload
  └─ pure projector contracts

@neko/agent-types
  └─ CompositeBlockData adapter / optional re-export

neko-agent runtime
  ├─ validates StoryboardTableV1
  ├─ repairs invalid model output
  ├─ routes capability requests
  └─ emits CompositeBlock

neko-agent webview
  ├─ renders storyboard-table
  └─ exposes Send to Canvas / Send to Cut

capability providers
  ├─ image / canvas providers
  ├─ cut / video providers
  ├─ audio providers
  └─ character / model / puppet providers

neko-canvas
  └─ consumes CanvasStoryboardPayload only

neko-story
  └─ provides ScriptIndex / SceneContext only
```

禁止反向依赖：

- `@neko/shared` 不依赖 Agent、Canvas、Story 实现。
- Canvas 不解析 Agent Markdown。
- Canvas/Cut projector 不依赖 `@neko/agent-types`。
- Agent 不直接依赖子包 Webview 或领域实现，只依赖共享 capability/provider 契约。
- Story 不读取 Agent Chat 的 `storyboard-table` 结构作为事实源。
- Webview 不直接调用 VSCode API 或 Canvas API，继续走 postMessage / command 边界。

Provider 缺失时的降级规则：

- 对应 provider 不可用时，Agent 仍应能生成、校验、修复和展示 `StoryboardTableV1`。
- `Send to Canvas`、`Send to Cut`、生成图片、生成音频等入口必须按 capability availability 启用或禁用。
- 缺失能力应以可读诊断展示，并保留 validated plan 与 refs，方便用户安装/启用能力后继续执行。
- Runtime 不得因为 provider 缺失而把计划标记为已执行，也不得生成假 `toolCallId`、假路径或假 artifact ref。

### 3.3 接口

`StoryboardTableV1` 应表达“镜头级语义计划”，最小字段如下：

```typescript
interface StoryboardTableV1 {
  readonly schemaVersion: 1;
  readonly kind: 'storyboard-table';
  readonly profile?: StoryboardTableProfileV1;
  readonly source: {
    readonly type: 'story' | 'agent' | 'document' | 'image' | 'manual';
    readonly sourceUri?: string;
    readonly sourceSceneId?: string;
  };
  readonly title: string;
  readonly scenes: readonly StoryboardSceneRowV1[];
  readonly extensions?: StoryboardExtensionMapV1;
}

interface StoryboardSceneRowV1 {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly sceneNumber?: number;
  readonly location?: string;
  readonly timeOfDay?: string;
  readonly summary?: string;
  readonly shots: readonly StoryboardShotRowV1[];
}

interface StoryboardShotRowV1 {
  readonly shotId?: string;
  readonly shotNumber: number;
  readonly duration: number;
  readonly visualDescription: string;
  readonly characters: readonly StoryboardShotCharacterV1[];
  readonly shotScale: string;
  readonly cameraMovement?: string;
  readonly cameraAngle?: string;
  readonly characterAction: string;
  readonly emotion: readonly string[];
  readonly sceneTags: readonly string[];
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly generationPrompt?: string;
  readonly visualStyle?: string;
  readonly referenceImagePath?: string;
  readonly vfx?: readonly string[];
  readonly imageStrategy: StoryboardShotImageStrategyV1;
  readonly sourceMediaRefs?: readonly StoryboardMediaRefV1[];
  readonly generatedMediaRefs?: readonly StoryboardMediaRefV1[];
  readonly mediaRefs?: readonly StoryboardMediaRefV1[];
  readonly decisionReason?: string;
  readonly extensions?: StoryboardExtensionMapV1;
}

type StoryboardTableProfileV1 =
  | 'script-breakdown'
  | 'manga-to-video'
  | 'image-sequence'
  | 'ad-storyboard'
  | 'short-video'
  | 'character-design'
  | 'manual';

type StoryboardShotImageStrategyV1 =
  | 'reuse-original'
  | 'use-as-reference'
  | 'generate-new'
  | 'transform-original';

interface StoryboardShotCharacterV1 {
  readonly characterId?: string;
  readonly name: string;
  readonly role?: 'primary' | 'secondary' | 'background';
  readonly action?: string;
  readonly emotion?: string;
  readonly continuityNotes?: string;
}

interface StoryboardMediaRefV1 {
  readonly refId: string;
  readonly role: StoryboardMediaRoleV1;
  readonly locator: StoryboardMediaLocatorV1;
  readonly label?: string;
  readonly mimeType?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

type StoryboardMediaRoleV1 =
  | 'source'
  | 'reference'
  | 'generated'
  | 'derived'
  | 'thumbnail'
  | 'mask';

type StoryboardMediaLocatorV1 =
  | {
      readonly type: 'tool-result';
      readonly toolCallId: string;
      readonly assetIndex: number;
      readonly taskId?: string;
    }
  | {
      readonly type: 'asset';
      readonly assetId: string;
      readonly assetVersion?: string;
    }
  | {
      readonly type: 'workspace-path';
      readonly path: string;
    }
  | {
      readonly type: 'canvas-node';
      readonly canvasNodeId: string;
      readonly outputId?: string;
    }
  | {
      readonly type: 'story-source';
      readonly storyId: string;
      readonly sceneId?: string;
      readonly frameIndex?: number;
    };

type StoryboardExtensionMapV1 = Readonly<Record<`neko.${string}`, unknown>>;
```

说明：

- `StoryboardTableV1` 是语义 schema；`CompositeBlockData` 是 Chat 展示 envelope。
- `profile` 表示当前分镜表采用的场景字段配置。它只影响 profile hints 和推荐字段，不改变 stable core 的基础投影能力。
- v1 阶段 `profile` 使用内置 union，先收敛系统工作流；v1.1 可考虑支持 `custom.${string}` 形式的命名空间扩展，避免直接开放任意字符串。
- `imageStrategy` 是纯文本计划字段，不直接执行任何工具。runtime 必须先校验该字段，再决定是否调 `GenerateImage` / 转换工具，或只复用已有引用。
- `StoryboardShotCharacterV1` 只描述镜头内人物身份、动作和连续性提示；正式人物库或角色资产绑定可在后续版本扩展。
- `sourceMediaRefs` 表示输入素材引用，例如原漫画页、用户上传参考图、已存在的 Canvas 结果。
- `generatedMediaRefs` 表示执行策略后产生的新素材引用，通常由 runtime 在工具完成后 backfill，而不是由 LLM 预先伪造。
- `mediaRefs` 是展示层汇总引用，可由 `sourceMediaRefs + generatedMediaRefs` 规范化得到；长期不应让 LLM 手写重复的展示派生字段。
- 分层 refs 与 `StoryboardMediaRefV1.role` 必须保持一致：`sourceMediaRefs` 只能包含 `source` / `reference` / `thumbnail` / `mask`，不能包含 `generated` / `derived`；`generatedMediaRefs` 只能包含 `generated` / `derived` / `thumbnail` / `mask`，不能包含 `source` / `reference`。
- 兼容期内，如果 LLM 只输出 legacy `mediaRefs` 而未输出分层字段，normalizer 应按 `role` 分拣到 `sourceMediaRefs` 与 `generatedMediaRefs`，并保留规范化后的汇总 `mediaRefs` 供展示使用。
- `StoryboardMediaRefV1.locator` 使用 discriminated union 表达分层引用。`tool-result` 必须携带 `toolCallId` 和 `assetIndex`；`workspace-path` 只能使用相对路径或 `${VAR}/path`，不允许绝对路径。
- 所有 media refs 只能引用工具结果、稳定资产引用、workspace 相对路径、Canvas 节点或 Story 来源帧，不允许内联 base64、blob URL、临时 localhost URL。
- `decisionReason` 是展示和调试字段，Webview 可渲染为 tooltip / 注释；validator 不读取它来推断、接受或拒绝 `imageStrategy`。
- `extensions` 是保留给场景化语义的命名空间扩展区，必须使用 `neko.*` 前缀；validator 只检查命名空间和 JSON-serializable，不把未知 extension 当作错误。
- `extensions` 的值如果不可 JSON 序列化，应产生 `error`，因为这会破坏 Extension Host / Webview / 持久化 / projector 之间的传输契约。
- `shotScale` / `cameraMovement` / `cameraAngle` 最终应收敛到现有 Canvas 类型枚举；早期可由 validator 先做宽松规范化。

### 3.4 策略解释

`imageStrategy` 的解释规则必须由 runtime 固化，不能只依赖 LLM 自由发挥：

| `imageStrategy` | LLM 文本含义 | Runtime 行为 |
|---|---|---|
| `reuse-original` | 原图已足够表达该镜头 | 不调用生成工具；展示 `sourceMediaRefs` |
| `use-as-reference` | 原图作为风格、角色或构图参考，需要生成新图 | 调用生成工具，并把引用素材作为输入；完成后写入 `generatedMediaRefs` |
| `generate-new` | 没有合适原图，或用户要求从文本创作 | 调用 `GenerateImage(generationPrompt)`；完成后写入 `generatedMediaRefs` |
| `transform-original` | 需要上色、修复、风格化、扩图等派生处理 | 调用对应转换/编辑工具；完成后保留原图和派生图 |

策略解释器输入应显式建模用户 override，而不是让解释器重新解析自由文本：

```typescript
interface StoryboardImageStrategyInterpreterInputV1 {
  readonly table: StoryboardTableV1;
  readonly userOverride?: StoryboardImageStrategyOverrideV1;
  readonly availableTools: readonly StoryboardImageToolCapabilityV1[];
}

interface StoryboardImageStrategyOverrideV1 {
  readonly generationPolicy: 'allow' | 'deny' | 'confirm';
  readonly allowedStrategies?: readonly StoryboardShotImageStrategyV1[];
  readonly scope?: {
    readonly sceneIds?: readonly string[];
    readonly shotIds?: readonly string[];
  };
  readonly source: 'chat-instruction' | 'webview-confirmation' | 'workspace-setting';
  readonly reason?: string;
}

interface StoryboardImageToolCapabilityV1 {
  readonly toolName: 'GenerateImage' | 'TransformImage' | 'ResolveMediaRef' | (string & {});
  readonly supportsReferences: boolean;
  readonly supportsMasks?: boolean;
}
```

策略解释器必须满足：

- 没有 `generationPrompt` 时不得执行 `generate-new`。
- 没有 `sourceMediaRefs` 时不得执行 `reuse-original` 或 `use-as-reference`。
- `use-as-reference` 与 `transform-original` 必须保留原引用，生成结果只作为追加候选。
- 用户明确要求“不要生成新图 / 只整理原图”时，runtime 应拒绝执行生成策略，即使 LLM 输出了 `generate-new`。
- 用户明确要求“重新生成 / 换风格 / 关键帧 / 电影感”时，runtime 可将 `reuse-original` 诊断为需要确认或修复。
- 所需 provider 不可用时，解释器应产出缺失能力诊断，而不是抛弃分镜表或伪造生成结果。
- `GenerateImage` 的 `supportsReferences` 必须由 capability/tool schema 明确声明或保守推断；只知道工具存在时，只能认为它支持纯文本生成，不能假定它支持引用图输入。
- `TransformImage` 是策略路由名称，不表示 Agent 拥有图像编辑实现；具体 transform/edit 能力由 provider、Canvas、Sketch 或未来图片能力包实现。

用户 override 来源：

- Chat 中的明确用户指令由 Agent runtime 在进入策略解释器前归一化为 `StoryboardImageStrategyOverrideV1`。
- Webview 可在执行生成/转换前提供确认对话框，确认结果同样以 override 输入策略解释器。
- Workspace 或项目设置可提供默认 `generationPolicy`，例如“导入漫画时默认只复用原图”。
- 策略解释器不直接读取原始 chat transcript，不把自然语言解析、权限确认和工具调度混在一个模块里。

### 3.5 契约分层与灵活性

语义契约不能把 LLM 弱化成“表单填写器”。`StoryboardTableV1` 应采用分层契约：

```text
Stable Core
  ├─ 跨场景必需字段，保证可展示、可校验、可投影
Scenario Profile
  ├─ 不同工作流的推荐字段和质量提示
Namespaced Extensions
  ├─ 场景专属语义，使用 neko.* 命名空间
Narrative Reasoning
  └─ LLM 的自然语言解释、取舍理由和创意判断
```

Stable Core 只应包含跨场景真正必要的字段，例如：

- `scenes[]` / `shots[]`
- `shotNumber`
- `duration`
- `visualDescription`
- `characterAction`
- `imageStrategy`

Stable Core 必填字段应在代码中形式化为唯一事实源，供 validator、repair prompt 和测试共用：

```typescript
const STORYBOARD_TABLE_V1_REQUIRED_FIELDS = [
  'schemaVersion',
  'kind',
  'title',
  'scenes',
] as const;

const STORYBOARD_SCENE_V1_REQUIRED_FIELDS = [
  'sceneId',
  'sceneTitle',
  'shots',
] as const;

const STORYBOARD_SHOT_V1_REQUIRED_FIELDS = [
  'shotNumber',
  'duration',
  'visualDescription',
  'characterAction',
  'imageStrategy',
] as const;
```

其他字段应作为可选字段或 profile 推荐字段，不应因为缺失而直接阻断投影：

- 剧本拆镜：关注 `dialogue`、`shotScale`、`cameraMovement`、`cameraAngle`、`duration`。
- 漫画转视频：关注 `sourceMediaRefs`、`panelId`、`bubbleText`、`imageStrategy`、`motionHint`。
- 广告分镜：关注 `productMoment`、`callToAction`、`brandSafety`、`visualStyle`。
- 短视频脚本：关注 `hook`、`beat`、`caption`、`voiceOver`、`soundCue`。
- 人物形象创作：关注角色特征、服装、表情表、参考引用。

示例 extension：

```typescript
extensions: {
  'neko.mangaToVideo': {
    panelId: 'page-03-panel-02',
    bubbleText: '别回头！',
    motionHint: 'slow push-in'
  },
  'neko.adStoryboard': {
    productMoment: 'first reveal',
    callToAction: 'try now'
  }
}
```

Validator 应分级输出，而不是只有 pass/fail：

| 等级 | 含义 | 处理 |
|---|---|---|
| `error` | 结构不可投影或引用危险 | 阻止 Send-to，进入 repair 或失败诊断 |
| `warning` | 可投影但质量或一致性不足 | 允许展示和投影，但提示可修复 |
| `suggestion` | 可增强字段缺失 | 只作为 UI/LLM 提示 |
| `profileHint` | 当前 profile 推荐字段缺失 | 不阻断，供后续补全或 repair prompt 使用 |

这保证 prompt-first / agent-first 仍然成立：LLM 决定“想做什么”和“为什么”，契约只保证“说清楚、可验证、可投影”。

### 3.6 扩展

扩展通过 `schemaVersion` 和可选字段完成：

- v1：镜头计划、Canvas semantic import、Chat 表格展示。
- v1.1：支持人物绑定、资产引用、参考图角色、策略执行结果、profile-specific extension、`custom.${string}` profile。
- v2：支持多候选镜头、分支版本、用户确认状态、质量评估摘要。

字段新增必须满足：

- 不破坏 v1 projector。
- 不引入 Webview-only 字段到 shared 契约。
- 不让 Story 持有 shot-level 编辑事实。
- `StoryboardImageToolCapabilityV1.toolName` 是可扩展 union；新增 `Img2Video`、`Upscale`、`Inpaint` 等工具时，应同步扩展该 union 与 capability registry 的工具发现/路由规则。

### 3.7 测试

最低测试面：

- `StoryboardTableV1` validator 接受完整有效表。
- validator 拒绝缺失 `visualDescription`、非法 `duration`、空 scenes/shots、内联 base64 media refs、与 `imageStrategy` 不匹配的引用组合。
- validator 校验分层 refs 与 `StoryboardMediaRefV1.role` 的一致性，例如 `sourceMediaRefs` 不允许包含 `generated`。
- normalizer 能将只有 legacy `mediaRefs` 的输出按 `role` 分拣为 `sourceMediaRefs` / `generatedMediaRefs`。
- validator 不根据 `decisionReason` 修正、接受或拒绝策略。
- strategy interpreter 对 `reuse-original` 不调用生成工具。
- strategy interpreter 对 `generate-new` 调用 `GenerateImage`，并在完成后 backfill `generatedMediaRefs`。
- strategy interpreter 对 `use-as-reference` 保留原引用并追加生成引用。
- strategy interpreter 接受 `StoryboardImageStrategyOverrideV1`，并在 `generationPolicy: 'deny'` 时拒绝生成/转换任务。
- strategy interpreter 在 provider 不可用时返回缺失能力诊断，且不写入 `generatedMediaRefs`。
- repair retry 使用模型原始输出和 validation errors 生成修复请求。
- repair 超过次数后保留可读错误，不产生可发送 Canvas 的 payload。
- `StoryboardTableV1 -> CanvasStoryboardPayload` 投影保持 shot 顺序和 sceneId。
- `StoryboardTableV1 -> PluginTransferCutStoryboardPayload` 投影保持时长、提示词和媒体引用。
- Webview renderer 只消费已验证结构，不在 React 组件里做业务修复。

---

## 四、输出与修复闭环

### 4.1 Agent 输出格式

Agent 面向用户仍可以输出简短说明，但结构化分镜表必须放在 fenced JSON block 中：

````text
简短说明...

```neko-composite
{
  "template": "storyboard-table",
  "schemaVersion": 1,
  "title": "分镜表",
  "scenes": []
}
```
````

兼容期内允许旧结构：

```json
{
  "template": "storyboard-table",
  "sections": []
}
```

但旧结构只能作为展示格式或 legacy projector 输入。正式 Canvas/Cut 发送应优先使用 `StoryboardTableV1`。

### 4.2 校验失败处理

解析失败或 schema validation 失败时，不应直接展示损坏 JSON。

推荐流程：

```text
LLM output
  ↓
extract neko-composite block
  ↓
parse JSON
  ↓
validate StoryboardTableV1
  ├─ success → interpret imageStrategy → optional tool calls → backfill media refs → render + transfer projectors
  └─ fail → repair prompt with validation errors
           ↓
        retry up to N
           ↓
        final failure block
```

修复重试必须有上限，建议默认 `2` 次。重试只允许修复结构，不允许重新解释剧本或改变创意内容，避免 repair 阶段引入语义漂移。

### 4.3 图片引用与生成回填

由于 LLM 只能输出纯文本，图片链路必须是“引用声明 + runtime 回填”：

```text
LLM StoryboardTableV1
  ├─ sourceMediaRefs: [{ toolCallId, assetIndex, role }]
  ├─ imageStrategy: "reuse-original" | "generate-new" | ...
  └─ generationPrompt: "..."
        ↓
runtime strategy interpreter
        ↓
optional GenerateImage / transform tool call
        ↓
toolResultBackfill
        ↓
generatedMediaRefs / display mediaRefs resolved by Webview
```

LLM 禁止输出：

- base64 图片正文。
- `blob:` URL。
- localhost runtime URL。
- 未经工具调用产生的假 `toolCallId`。
- 指向本机绝对路径的臆造图片路径。

### 4.4 失败展示

最终失败时，Agent 应展示：

- 用户可读错误摘要。
- validation errors 列表。
- 原始自然语言说明。
- 不展示可点击“发送到 Canvas”的入口。

---

## 五、与现有格式的关系

### 5.1 `CompositeBlockData`

现有 `CompositeBlockData` 仍保留，职责是通用富内容 envelope：

```typescript
interface CompositeBlockData {
  readonly template: 'storyboard-table' | 'comparison' | 'gallery' | 'report';
  readonly title?: string;
  readonly sections: readonly CompositeSection[];
}
```

长期不建议继续把所有 storyboard 语义塞进 `sections[].content` 字符串。`sections` 可以继续服务 legacy renderer，但新的 storyboard 表应提供结构化 scenes/shots 数据。

### 5.2 `CanvasStoryboardPayload`

`CanvasStoryboardPayload` 仍是 Canvas 的唯一 storyboard import sink。`StoryboardTableV1` 不直接进入 Canvas，而是经纯函数投影：

```text
StoryboardTableV1
  ↓ projectStoryboardTableToCanvasPayload()
CanvasStoryboardPayload
  ↓ neko.canvas.importStoryboard
SceneGroupNode + ShotNode
```

### 5.3 `neko-story` 轻量分镜表

`neko-story` 的 `ScriptTableView` 是 scene-level readiness 表，不应升级为 `StoryboardTableV1` 编辑器。

如果 Story 需要展示 Agent 生成结果，只展示摘要状态和 “打开 Agent / 打开 Canvas” 入口，不持有 shot-level 表事实。

### 5.4 跨媒体能力扩展

本 ADR 虽然以分镜表和图片策略为切入点，但长期规则应适用于后续相似能力：

```text
LLM pure text plan
  ↓
Agent validate / repair / strategy interpretation
  ↓
Capability registry routing
  ↓
Domain provider execution or editor handoff
  ↓
artifact refs / task refs / media refs backfill
  ↓
Agent lightweight summary + domain webview editing
```

适用示例：

- 音频：Agent 输出 `AudioCuePlanV1` / 配音与音效计划；`neko-audio` 或 audio provider 负责声轨、配音、混音和预览事实。
- 视频：Agent 输出 `VideoShotPlanV1` / 剪辑意图；`neko-cut` 负责 timeline、转场、导出和可编辑状态。
- 人物形象：Agent 输出 `CharacterDesignPlanV1` / 角色设定与引用需求；`neko-sketch`、`neko-model`、`neko-puppet` 或未来 `neko-character` 负责资产生成、绑定、变体和编辑事实。
- 图片与分镜：Agent 输出 `StoryboardTableV1`；Canvas/Sketch/image provider 负责视觉资产执行，Canvas 负责正式分镜编辑事实。

共享契约归属规则：

- 多包共同消费、需要跨 Agent / Canvas / Cut / Story 投影的稳定 plan schema、artifact ref、capability request 放 `@neko/shared`。
- 子包内部编辑模型、provider 私有参数、Webview 状态不放 `@neko/shared`。
- Agent 只依赖共享能力接口、计划 schema 和 artifact refs；不直接导入子包 Webview、React 组件或领域实现。
- Agent Chat 只展示轻量摘要、进度、错误和结果引用；深度编辑、精确预览和长期事实源交给专业子包 Webview。

---

## 六、实施阶段

### Phase 1：契约与校验

- 在 `@neko/shared` 新增 `StoryboardTableV1`、`StoryboardShotRowV1`、`StoryboardShotCharacterV1`、`StoryboardMediaRefV1`、`StoryboardShotImageStrategyV1` 类型。
- 新增 validator / normalizer。
- 新增 validation error DTO。
- validator 输出分级诊断：`error` / `warning` / `suggestion` / `profileHint`。
- validator 使用形式化 Stable Core required fields 作为 `error` 级必填字段唯一事实源。
- validator 校验 `imageStrategy` 与 media refs 的结构一致性，但不读取 `decisionReason` 作为判定依据。
- validator 校验 `sourceMediaRefs` / `generatedMediaRefs` 与每条 `StoryboardMediaRefV1.role` 的一致性。
- normalizer 在兼容期支持把 legacy `mediaRefs` 按 `role` 分拣为分层 refs。
- normalizer 保留合法 `extensions`，但不让未知 extension 影响 stable core 投影；不可 JSON 序列化的 extension 必须作为 `error` 诊断。
- 在 Agent composite parser 后接入 schema validation。
- 单元测试覆盖合法/非法输出。

### Phase 2：修复重试

- 新增 storyboard-table repair prompt builder。
- Agent runtime 在解析失败时自动发起 bounded repair。
- 修复时保留原始 tool refs，不允许生成新的 base64 或临时 URL。
- 最终失败展示诊断块。

### Phase 3：策略执行与回填

- 新增 `StoryboardImageStrategyInterpreter`，输入 `StoryboardImageStrategyInterpreterInputV1`，输出待执行的图片任务计划和无需执行的复用引用。
- 固化 `reuse-original` / `use-as-reference` / `generate-new` / `transform-original` 四类策略行为。
- 将 Chat 指令、Webview 确认和 Workspace 默认值归一化为 `StoryboardImageStrategyOverrideV1`。
- 将生成/转换动作路由为 capability request，由 provider 或专业子包执行。
- `reuse-original` 不调用图片生成工具，只把 `sourceMediaRefs` 交给展示层解析。
- `use-as-reference` / `generate-new` / `transform-original` 由 runtime / Extension Host 调用对应工具，LLM 不直接声称图片已经生成。
- 工具完成后通过 `toolResultBackfill` 或 storyboard runtime patch 写回 `generatedMediaRefs`，再由 Webview 汇总展示。首轮实现采用 patch semantic table 的方式；如果后续持久化策略需要，也可以把 backfill 改为基于 shotId/tool result 的 overlay。
- 展示层必须能同时呈现原图、参考图和生成图的角色差异，避免把引用素材误认为生成结果。

### Phase 4：投影收敛

- 将现有 `storyboard-transfer-presenter` 的 Markdown / legacy composite 投影收敛到 `StoryboardTableV1` normalizer。
- `Send to Canvas` 只使用 validated projector。
- `Send to Cut` 只使用 validated projector。

### Phase 5：Skill / Prompt 固化

- 更新分镜相关 Skill，要求输出 `StoryboardTableV1`。
- 明确 Skill 中的 LLM 只输出计划文本；需要新图时只输出 `imageStrategy`、`generationPrompt` 和引用关系，不描述为“已生成图片”。
- Skill 应按 `profile` 提供字段模板，不要求所有场景填写同一套完整列。
- 保留自然语言 prompt-chain，不重新引入 phases / pipelines DSL。
- 为不同创作场景提供字段模板：剧本拆镜、漫画转视频、图片序列分镜、广告脚本分镜。

### Phase 6：版本演进与迁移

- legacy `sections` 继续渲染，但标记为 display-only。
- 对可投影内容给出迁移提示。
- 引入 schemaVersion 迁移函数，支持 v1 到后续版本的兼容投影。
- 后续音频、视频、人物形象等类似能力应先定义 plan schema 与 capability provider 契约，再接入 Agent 调度。

### Phase 1-6 实施备注（2026-05-31）

首轮实现采用“语义优先、兼容保留”的迁移方式：

- `StoryboardTableV1`、Stable Core required fields、validation diagnostics、normalizer、Canvas/Cut projector、imageStrategy interpreter 均落在 `@neko/shared`，保持为纯类型/纯函数，不依赖 Agent Webview 或子包实现。
- `CompositeBlockData` 增加可选 `storyboardTable` 与 `storyboardDiagnostics`，但继续保留必需 `sections`。语义 v1 表会生成 fallback sections 供旧 renderer 展示；invalid v1 表不会静默丢弃，而是生成 bounded diagnostics section。
- Webview presenter 在 `storyboardTable` 存在且无 `error` 诊断时优先使用 semantic projector；存在 `error` 时不暴露 Canvas/Cut Send-to payload。legacy sections 仍按原逻辑渲染和投影。
- Runtime 新增 `storyboard-image-runtime` 适配层，只解释/路由/回填，不导入 Canvas/Cut/Sketch/Model Webview。provider 或 tool execution port 缺失时只产生诊断，不伪造 `generatedMediaRefs`。
- Runtime 从 tool port 发现 `GenerateImage` / `TransformImage` / `ResolveMediaRef` 能力。`GenerateImage.supportsReferences` 由工具参数 schema 中的 reference/source/media ref 输入保守推断；只有 `has()` 命中但拿不到 schema 时，不声明引用支持。
- `generatedMediaRefs` 只由 completed tool/media result backfill 产生稳定 `tool-result` refs；失败任务保留 validated plan 和 warning diagnostic。
- `comic-to-storyboard` 内置 skill 已更新为请求 `StoryboardTableV1` semantic output，并明确 LLM 只能输出计划字段，不得声明未完成的媒体生成结果。

---

## 七、非目标

- 不在 `neko-story` 中实现 shot-level 分镜编辑器。
- 不让 Canvas 解析 Agent Markdown 或 `neko-composite`。
- 不把 prompt-chain 重新设计成机器调度 DSL。
- 不把大图、候选图墙、镜头拖拽排序放进 Agent Chat 表格。
- 不在分镜表中保存 base64、blob URL、localhost runtime URL 或临时访问 token。
- 不让 LLM 直接决定或假装完成工具执行；LLM 只能声明计划字段，runtime 负责执行、拒绝或回填。
- 不把 Agent 实现成图片、音频、视频、人物形象的统一编辑器或长期事实源。
- 不让 Agent 直接依赖子包 Webview、React 组件或私有编辑模型。
- 不要求安装所有创作子包后 Agent 才能生成和展示结构化计划。
- 不要求所有 profile 填写同一套字段，也不因缺少非核心推荐字段直接判定失败。

---

## 八、验收标准

长期方案完成时，应满足：

1. Agent 能稳定输出一个符合 `StoryboardTableV1` 的分镜表。
2. 无效输出会触发自动修复，超过上限后给出清晰诊断。
3. 分镜表语义类型归属 `@neko/shared`，Canvas/Cut projector 不依赖 `@neko/agent-types`。
4. `StoryboardShotCharacterV1` 与 `StoryboardMediaRefV1` 有明确结构定义，并被 validator 覆盖。
5. Validator 支持分级诊断，只有 `error` 阻断投影；`warning` / `suggestion` / `profileHint` 不弱化 LLM 的灵活输出。
6. 不同 `profile` 可以拥有不同推荐字段，合法 `extensions` 会被保留且不破坏 stable core 投影。
7. `decisionReason` 只作为展示/调试字段，不参与策略校验。
8. `imageStrategy` 可由 runtime 解释执行：复用策略不生成新图，生成/转换策略调用工具并回填媒体引用。
9. 用户 override 可通过 `StoryboardImageStrategyOverrideV1` 输入策略解释器，并能阻止或确认生成。
10. 生成/转换动作通过 capability provider 或专业子包执行，Agent 不内置领域创作实现。
11. Provider 缺失时，Agent 仍能展示 validated plan 和缺失能力诊断，但不会显示可执行入口或伪造结果。
12. 用户只会在 validated storyboard table 上看到 “发送到 Canvas / Cut”。
13. Canvas 只接收 `CanvasStoryboardPayload`，不知道 Agent 的展示格式。
14. Story 仍只持有 scene-level readiness，不持有 shot-level storyboard 事实。
15. 新增字段可以通过 schemaVersion 兼容演进。
16. 扩展到音频、视频、人物形象创作时，仍遵循 plan schema、capability routing、artifact refs/backfill、专业子包事实源的模式。

---

## 九、最终边界

用一句话定义：

> `StoryboardTableV1` 是 Agent 当轮生成的结构化镜头计划；它可展示、可校验、可投影，但不是 Story 或 Canvas 之外的第三份 storyboard 事实源。

> LLM 只输出纯文本计划；图片引用、图片生成和结果回填是 runtime 行为，不能伪装成模型文本能力。

> Agent 是计划、校验、编排和路由层；图片、音频、视频、人物形象等领域事实和深度编辑属于 capability provider 与专业子包。
