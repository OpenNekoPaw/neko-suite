# ADR: Provider Expression Context — 生成模型表达倾向子系统

## 状态

Proposed (2026-04-24)

> **协议地基对齐（2026-04-25）**：本 ADR 的 Provider 贡献形式（`providerCardFiles` 路径引用 + `providerAdapters` 对象）以 [adr-capability-protocol.md](./adr-capability-protocol.md) 定义的 **CapabilityContribution v1.0** 为容器接入。`ProviderRegistry` 不是独立新系统，而是 Capability Protocol Registry 下与 SkillRegistry/ToolRegistry 并列的子 Registry。Trust Level（core/community/untrusted）约束 ProviderCard 谁可以贡献（untrusted 禁止贡献 ProviderCard，见协议地基信任能力矩阵）。ProviderCard 不再作为 Runtime 面确定性 prompt 替换器，而是汇总为 `ProviderExpressionContext` PromptFragment，注入 AGENT 系统提示词，由 AGENT 在生成工具参数时自主判断是否调整表达倾向。

## 背景

neko-suite 以生成模型（图像 / 视频 / 音频）为核心创作引擎，已有 `agent-media-architecture.md` 定义了 GeneratedAsset 存储与 Send-to-Agent 协议。但在 **Plan/Task Markdown → Apply 工具参数** 环节，当前架构存在一个未正面处理的架构缺口：**不同生成模型对同一输入表现差异巨大**，且这种差异**不能用统一 schema 消除**。

### 差异的三个层级（本 ADR 覆盖范围）

生成模型差异在实践中可以精准分为三个正交层级。本 ADR 聚焦这三类的"输入端表达倾向"对齐：

| # | 差异类型 | 层级 | 根源 | 典型表现 |
|---|---|---|---|---|
| 1 | **Syntax Dialect**（方言） | 语法层 | 输入格式约定 | 权重语法 `::2` vs `(word:1.3)`；negative prompt 支持 / 位置；token 上限 |
| 2 | **Semantic Literacy**（语义理解深度） | 概念层 | 文本编码器能力 | "cyberpunk" 在 Flux 直接懂，在 SDXL 需要展开为 "neon lights, rainy night, blade runner style" |
| 3 | **Training Distribution Bias**（训练分布偏置） | 数据分布层 | 训练集构成 | 默认画风倾向（NovelAI 动漫 / SDXL 3D / Flux 写实）；描述密度要求（短 tag 堆砌 vs 长自然语言）；视角 / 空间描述依赖度 |

> 第四类差异 **Stochasticity**（采样随机性、候选池问题）是"输出端"的不确定性，**不在本 ADR 范围**——由独立的 `adr-generation-variance-and-selection.md` 处理（CandidatePool + Selection）。本 ADR 只处理"AGENT 如何在不改变用户意图的前提下，按 provider 倾向表达得更合适"。

### 当前架构的具体缺口

1. **Skill 中硬编码 provider-specific prompt**：Skill 作者为了出片，在 phases 里写死特定模型能理解的 prompt 字符串。换 provider 需要改 Skill。
2. **工具直接消费 prompt 字符串**：`image.generate({ prompt: "..." })` 没有 ProviderCard 上下文，AGENT 无法知道不同 provider 的表达偏好。
3. **新 provider 接入成本高**：每个新模型需要新建一个 tool，重写 prompt 组织逻辑。
4. **跨模型一致性无保障**：同一 Plan 在不同 provider 上表现方差无可控机制，用户感知差异巨大。
5. **能力画像无承载**：主流模型的偏好、甜点、反偏置策略散落在 README / 社区博客中，系统无法消费。

### 为什么不能用 schema 统一解决

一个朴素方案是"定义统一 Operation schema，每 provider 适配"——这解决不了核心问题：

- Schema 能统一**结构**（字段名、类型、枚举），不能统一**语义理解**
- 同一个 `prompt: "cyberpunk cat"` 字段，到模型里效果天差地别
- 强行对齐参数（`steps` / `cfg_scale` 归一化）只解决了 1% 的问题

真正需要对齐的是 **AGENT 如何向该 provider 表达意图的倾向**。它不是稳定语法转换，也不是确定性概念替换；ProviderCard 只提供软上下文，最终由 AGENT 在用户 prompt 与 Plan/Task Markdown 约束下自主表达。

### 与既有 ADR 的关系

| ADR | 关系 |
|---|---|
| [agent-media-architecture.md](./agent-media-architecture.md) | GeneratedAsset / Send-to-Agent 协议不变；本 ADR 在 AGENT prompt 中新增 provider 表达上下文 |
| [agent-tool-skill-enhancement.md](./agent-tool-skill-enhancement.md) | TOOL_NAMES 常量 SSOT 约束保留；Provider 作为独立抽象与 Skill 平行 |
| [agent-unified-workflow.md](./agent-unified-workflow.md) §5.1 CapabilityKind | 新增 `providerCard` 作为第 4 种能力类型 |
| [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md) | ProviderCard feedback 仍进入项目级 Card 演化；不再通过 beforeToolCall 做确定性 prompt 替换 |
| [marketplace.md](./marketplace.md) | 新增 `provider-card` 分发品类 |
| [agent-memory-unification.md](./agent-memory-unification.md) | Layer 2 项目级 Card override 写入 `.neko/providers/*.card.md`（扩展 ProjectMemoryRouter 目标） |
| [agent-evolution-capacity.md](./agent-evolution-capacity.md) | 新增 Provider 层评级（预期 A）——全 markdown + 自演化，符合最强演化锚点 |

## 决策

### 1. Provider 作为独立抽象（不集成 Skill）

Skill 与 Provider 是**不同抽象维度**，属于 M:N 关系——一个 Skill 可调用任意 Provider，一个 Provider 服务任意 Skill。强行把 Provider 作为 Skill 子类型会导致：

- 同一 Provider 需要在每个 Skill 里重复声明
- Skill 市场混入"Flux Provider Card"与"短视频剪辑师 Skill"，搜索噪声大
- 用户心智错位（Skill 是创作意图，Provider 是技术引擎）

**Provider 以独立概念存在**，通过 `AgentCapabilityProvider.providerCards` 扩展槽贡献（复用现有 Capability Discovery 机制），但进入独立的 `ProviderRegistry`。

```typescript
// @neko/shared/types/extension-api.ts 扩展
export interface AgentCapabilityProvider {
  // ... 既有字段 ...
  readonly tools?: ToolDef[];
  readonly skills?: SkillDef[];
  readonly toolGroups?: ToolGroupDef[];
  readonly providerCards?: ProviderCard[];  // ⭐ 新增
}
```

### 2. ProviderCard 三合一结构

Provider 可按 provider 或 provider/model 贡献 markdown Card；`modelId` 可选，新模型没有 Card 时允许原生 passthrough。三个部分分别对应三类差异：

```markdown
---
providerId: flux
modelId: flux-1-dev          # 可选；省略时表示 provider 级默认 Card
displayName: Flux.1 [dev]
version: 2026-04-24
capabilities: [image.generate]
---

# Flux.1 [dev] ProviderCard

## Part 1: Syntax Profile（语法层，对应 Dialect 差异）

### Weight Syntax
- 不使用括号权重（会被当字符串）
- 通过重复或前置强调关键概念

### Negative Prompt
- 不支持独立 negative 字段
- 必须改正向重述（"empty street" 而非 "no people"）

### Token Limits
- prompt: 512 tokens
- 超长不截断但末尾权重衰减

### Best Phrasing Pattern
- 自然语言段落（完整句子）
- 避免 booru tag 堆砌

## Part 2: Concept Coverage Map（语义层，对应 Semantic Literacy 差异）

### Native（直接懂，保留抽象即可）
- cyberpunk · noir · vaporwave · steampunk · art deco
- cinematic · moody · ethereal · melancholic · nostalgic
- impressionist · baroque · minimalist · brutalist
- studio ghibli · makoto shinkai · wes anderson style

### Partial（半懂，需辅助词校准）
- k-pop aesthetic   → 加 "idol visual, saturated color, glossy"
- wabi-sabi         → 加 "japanese minimalism, imperfect, rustic"

### Unknown（必须字面展开）
- liminal space     → "empty fluorescent hallway, backrooms, uncanny"
- dark academia     → "old library, tweed, gothic university, autumn"
- cluttercore       → "maximalist collection, wall of objects, vintage"

### Anti-Patterns（模型误解）
- "sketch"          → 会出线稿；改为 "loose graphite on paper"
- "3D render"       → 会出 Blender 感；改为 "volumetric, depth"

## Part 3: Training Profile（分布层，对应 Training Bias 差异）

### Style Prior（不加风格词时默认倾向）
- Default: 写实 + 电影感 + 浅景深
- Strength: High（难压制）

### Description Density
- Sweet spot: 30-80 words（自然语言段落）
- Under 10 words: 质量显著下降
- Over 200 words: 边际收益递减，后段稀释

### Style Family Affinity（擅长的风格族）
- ★★★ 摄影写实 / 电影感 / 胶片质感
- ★★★ 概念艺术 / 油画 / 水彩
- ★★☆ 动漫（需显式 "anime style, cel-shaded" 强化）
- ★☆☆ 像素艺术 / 8-bit（基本不会）
- ★☆☆ 工程图纸 / 技术插画（建议换模型）

### Spatial Grounding
- Strong: 自动合理视角、光影、景深
- 无需显式 camera angle

### Anti-Bias Strategies（压制默认倾向）
- 要非写实  → "illustration, not photograph, flat color"
- 要低景深感 → "everything in sharp focus, f/11"

### Caption Convention
- 推荐：自然语言段落
- 避免：booru tags（会被当字符串不当概念）
```

**关键设计原则**：Card 是 **markdown 而非代码**，AI 可读、社区可贡献、Memory 可演化；用**美学 / 能力语言**描述（"擅长摄影写实"），不用**技术参数**（`anime_bias=0.8`）——前者利于 AI 判断与演化，后者封死演化。

### 3. ProviderRouter — 按 Training Profile 做意图→模型匹配

Plan 层新增受控枚举 `styleFamily`，Router 按此字段 O(1) 查表匹配。Router 的职责只到 provider selection：输出 `primary` / `fallbacks` / `reason`，不读取或改写 prompt，也不把 `ConceptCoverage` 当作替换规则。ProviderCard 对表达方式的影响只通过 `ProviderExpressionContext` 进入 AGENT prompt，由 AGENT 自主判断是否采用。对于已确定 `providerId/modelId` 的单类型生成，Router/Context 只使用对应目标 Card；多 Card 仅用于候选选择。

```typescript
export type StyleFamily =
  | 'photorealistic'
  | 'anime'
  | 'illustration'
  | 'concept-art'
  | 'pixel-art'
  | 'painting'
  | '3d-render'
  | 'mixed';

export interface ProviderTarget {
  providerId: ProviderId;
  modelId?: ProviderModelId;
}

export interface IProviderRouter {
  /**
   * 按语义 + 偏好选择 Provider/Model target。
   * 综合：styleFamily × Training Profile × Memory 命中率 × Policy 偏好。
   */
  route(input: {
    capability: 'image.generate' | 'video.generate' | 'audio.generate';
    providerId?: ProviderId;                // 已指定 provider 时只在该 provider 内选择
    modelId?: ProviderModelId;              // 已指定 model 时只匹配该 model Card
    styleFamily: StyleFamily;
    projectHints?: ProjectProviderHints;    // Memory 注入，可包含 targetSuccessRate
    userPreference?: ProviderPreference;    // Policy 注入
    fallbackChain?: boolean;                // 是否允许降级
  }): ProviderSelection;
}

export interface ProviderSelection {
  primary: ProviderId;
  modelId?: ProviderModelId;
  fallbacks: ProviderTarget[];
  reason: string;  // 可观察可审计
}
```

决策逻辑（AI 驱动，非规则引擎）：

```
route(capability: image.generate, styleFamily: anime, ...)
  ↓
查 ProviderRegistry.forCapability('image.generate')
  ↓
按 Training Profile × Style Family Affinity 打分：
  - NovelAI     ★★★ anime native     → 9.0
  - Flux        ★★☆ anime capable    → 7.0
  - Playground  ★★☆ illustration     → 6.5
  - SDXL        ★☆☆ 3D leakage       → 4.0
  ↓
Memory 加权（"本项目 NovelAI 命中率 80% > Flux 40%"）
Policy 加权（用户偏好 / 配额）
  ↓
选出 primary provider/model target + fallback targets，写 Journal
```

### 4. ProviderExpressionContext — 软提示词上下文

ProviderCard 不再被编译成确定性替换规则，也不在工具执行前改写 prompt。运行时只做一件事：把当前可用 ProviderCard 汇总成 `PromptFragment`，注入 AGENT 系统提示词。

```typescript
export interface ProviderExpressionContextOptions {
  readonly cards: readonly ProviderCard[];
  readonly mode?: 'selected' | 'candidates';
  readonly providerId?: ProviderId;
  readonly modelId?: ProviderModelId;
  readonly capability?: ProviderGenerationCapability;
  readonly maxCards?: number;
  readonly maxCardsPerCapability?: number;
  readonly maxContextTokens?: number;       // 可选：按真实/近似 token budget 裁剪摘要
  readonly estimateTokens?: (content: string) => number;
  readonly taskStage?: 'planning' | 'routing' | 'generation'; // 按任务阶段调整摘要优先级
  readonly fragmentId?: string;
}

export function createProviderExpressionPromptFragments(
  options: ProviderExpressionContextOptions,
): readonly PromptFragment[];
```

输入：ProviderCard 列表（Built-in / Market / Project 合并后），以及可选 `providerId` / `modelId` / `capability` 目标。

输出：`PromptFragment`（`provider:expression-context`），内容包含能力、风格倾向、描述密度、negative prompt 支持、失败/偏置提示与少量表达 hint。Card 数量按模型类型（capability）分层控制：已确定 `providerId + modelId + capability` 的单类型生成路径默认只渲染一张 selected Card；已确定 capability 但未定 provider/model 时只渲染同类型少量候选；capability 未确定时按 capability 分组渲染极简代表 Card；多张 Card 只用于 provider/model 候选选择或对比上下文。运行时可传入 `maxContextTokens` 与 token estimator，按预算从低优先级细节开始裁剪，避免 ProviderCard 上下文挤占主任务上下文。`taskStage` 控制摘要排序：`routing` 优先 style affinity / style prior，`generation` 优先 phrasing / negative prompt / concept hints，`planning` 保留中等粒度概览。

**关键约束**：

1. ProviderCard 是 soft guidance，不是 deterministic replacement rules。
2. Plan/Task Markdown 与用户 prompt 永远是 source of truth。
3. AGENT 可以参考 ProviderCard 调整表达倾向，也可以在不相关时直接写原生 prompt。
4. 单类型且已确定 `providerId/modelId` 的生成调用只使用匹配目标的一张 Card；不混合多个同类型模型的表达倾向。
5. 候选模式必须 capability-aware：已知类型只看同类型候选，未知类型按 image/video/audio 分组限制数量。
6. 工具层不再接收独立语义 prompt 字段，也不再调用运行时语义桥。
7. 新模型没有合适 Card 时仍可原生调用，不阻塞生成。

### 5. Plan Schema 扩展

```typescript
// Plan.step.args 扩展
{
  tool: 'image.generate' | 'video.generate' | 'audio.generate',
  args: {
    // === 语义核心（provider-neutral） ===
    generationIntent: GenerationIntent,       // 上面定义的抽象字段组

    // === Router 驱动字段 ===
    styleFamily: StyleFamily,             // 必填，决定路由
    providerPreference?: ProviderId | 'auto',

    // === 非功能约束 ===
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3',
    quality?: 'draft' | 'standard' | 'high',

    // === 逃生阀（模型特有参数，绕过 Bridge） ===
    providerHints?: Record<ProviderId, Record<string, unknown>>
  }
}
```

`providerHints` 是**逃生阀**——当用户明确知道某个模型的特殊参数（如 Flux 的 `guidance: 3.5` 或 MJ 的 `--s 750`）时可以直传，Bridge 不会翻译这部分字段。

### 6. 三层 Card 分发策略

```
┌──────────────────────────────────────────────┐
│ Layer 0: Built-in Cards                      │
│   Flux / SDXL / MJ / Runway / Sora / DALL-E  │
│   位置：@neko/agent/providers/*.card.md       │
│   发布：随 @neko/agent 版本                    │
│   更新：季度级（人工 curate）                  │
├──────────────────────────────────────────────┤
│ Layer 1: Market Cards                        │
│   ComfyUI workflow / 专业 LoRA / 长尾模型     │
│   位置：neko-market 分发                       │
│   发布：社区贡献 + 投票审核                    │
│   更新：周/月级                                │
├──────────────────────────────────────────────┤
│ Layer 2: Project Override                    │
│   项目私有 / 企业内部 / 自动演化补丁          │
│   位置：.neko/providers/*.card.md             │
│   发布：项目内（可选入 git 共享给团队）        │
│   更新：持续（AI 自动 + 人工编辑）             │
├──────────────────────────────────────────────┤
│ Layer 3: Session Memory                      │
│   本会话观察，recall 注入                     │
│   位置：内存态 + Journal 事件                  │
│   发布：N/A                                    │
│   更新：每轮                                   │
└──────────────────────────────────────────────┘

运行时合并优先级：Session > Project > Market > Built-in
```

**为什么不能全部内置**：主流 provider 每月更新，@neko/agent 不应每月发包；HuggingFace 50 万+ 长尾模型无法穷举；私有 / 企业模型不应进公共代码库。

**为什么不能全部走市场**：主流模型必须开箱即用；市场审核延迟不适合小修小补；核心能力不能依赖第三方服务。

### 7. 四层演化模型

```
Layer 0 Built-in    人工维护 + 版本绑定           季度      内部团队
Layer 1 Market      社区贡献 + 版本发布           周/月     生态贡献者
Layer 2 Project  ⭐ AI 自动演化                   持续      Evaluator → Memory → Card
Layer 3 Session     Memory recall 注入            每轮      本会话观察
```

**Layer 2 自动演化是演化能力的真正载体**——通过 Evaluator → Memory → Card override 闭环实现：

```
Evaluator 打分  ──►  ProjectMemoryRouter
  CLIP 相似度          ├─ 抽取语义事实
  用户接受率            │    "Flux 对 cluttercore 命中率 30%"
  生成一致性            │    "本项目 MJ 需要 --s 750"
                      ▼
                  .neko/providers/<providerId>.card.md（增量补丁）
                      ▼
                  下次 Router / Bridge 查表时合并
```

**增量补丁**，不是全量重写——基础 Card 来自 Built-in/Market，项目层只写"相对于基础的修正"：

```markdown
# Flux.1 [dev] — Project Override for <projectName>

> 本项目专用补丁，自动演化生成。基础 Card: @built-in/flux-1-dev@1.2

## Overrides

### Concept Coverage（增量）
- cluttercore → 状态改为 Unknown（需完全展开）
  Evidence: 3 次生成 CLIP < 0.6，用户拒绝 2 次
  Added: 2026-04-20

### Training Profile（增量）
- Description Density sweet spot 调整为 40-100 words
  Evidence: 本项目偏好详细构图描述

### Anti-Bias（新增）
- "melancholic" 单独使用易出灰调，加 "muted but saturated palette"
```

**为什么 Layer 0-1 不自动演化**：会话级观察局部，不应污染全局；Layer 1 变更影响所有用户，必须社区审核；自动写回全局风险高——一个边缘案例可能改坏通用能力。遵循**"观察在 Layer 2 产生，经验证后升级到 Layer 1，成熟后 curate 进 Layer 0"**的 Git Flow 式演化。

### 8. 六控制面协同全景

```
┌──────────────────────────────────────────────────────────────┐
│ Schema 面   Plan/Task Markdown → GenerationIntent 字段定义        │
├──────────────────────────────────────────────────────────────┤
│ Prompt 面   ProviderCard markdown（AI 可读）         │
├──────────────────────────────────────────────────────────────┤
│ Prompt 面   ProviderExpressionContext PromptFragment           │
│             （AGENT 系统提示软上下文，不改写 prompt）          │
├──────────────────────────────────────────────────────────────┤
│ Policy 面   Provider 白名单 / 配额 / 用户偏好                  │
│             .neko/preferences.md: "图像默认 Flux"              │
├──────────────────────────────────────────────────────────────┤
│ Memory 面   Layer 2 Project Override（Card 自演化目标）         │
│             历史命中率 / 项目风格偏好                          │
├──────────────────────────────────────────────────────────────┤
│ Evaluator   CLIP 相似度 / 用户接受率 / 一致性评分               │
│             → 回写 Memory 驱动演化                             │
├──────────────────────────────────────────────────────────────┤
│ Control ⭐  ProviderRegistry（承载 Provider 子系统）            │
│             与 StageRegistry / ArtifactRegistry 并列            │
└──────────────────────────────────────────────────────────────┘
```

## 明确不做的事

本 ADR **不包含**：

1. **Stochasticity 处理**（CandidatePool + Selection）——交由独立 ADR `adr-generation-variance-and-selection.md`。本 ADR 处理"如何说得对"，那份处理"说完之后不确定怎么办"。
2. **LLM-as-judge 评估 Provider 质量**——违反 §11.6.9 纪律。确定性指标（CLIP）+ 用户接受率足够。
3. **跨 Provider 自动 Ensemble**——除非用户在 Plan 里显式声明 `modelEnsemble: [...]`，否则单次只路由一个 Provider。
4. **把 Card 做成 TypeScript 常量 / Schema**——必须是 markdown，才能 AI 驱动演化。
5. **Provider 集成到 Skill 系统**——M:N 关系强制平行抽象。
6. **用户手动选 Provider 作为主要路径**——Router 自动路由，用户只在 `.neko/preferences.md` 声明偏好。
7. **参数级 schema 归一化**（`steps` / `cfg_scale` / `guidance`）——这是 1% 问题，通过 `providerHints` 逃生阀处理即可。
8. **Layer 0-1 的自动演化**——安全模型要求 Git Flow 式人工审核。
9. **不把表达调整落回 Plan**——Plan/Task Markdown 保持 provider-neutral；ProviderCard 只影响 AGENT 当次工具参数生成倾向。

## 结果与影响

### 正面影响

1. **新 Provider 接入零代码**：只需贡献一张 markdown Card + Adapter 实现 + 挂 `AgentCapabilityProvider.providerCards`
2. **Plan 层 provider-neutral**：换 provider 不改 Plan；Plan diff 干净（只反映意图变化）
3. **Skill 作者解耦 Provider 知识**：不再需要为每个模型写一套 prompt
4. **演化能力 A 级**：全 markdown + 自演化，符合三原则共振
5. **Memory 演化最佳案例**：Project Override 是自评闭环最成熟的落地
6. **新 provider 只需要 Card**：降低社区贡献门槛

### 代价与约束

1. **新增 Provider 子系统**：ProviderRegistry + ProviderRouter + ProviderExpressionContext 共 3 个核心组件
2. **扩展 AgentCapabilityProvider**：新增 `providerCards` 扩展槽
3. **新增 Plan 字段**：`generationIntent` / `styleFamily` 是 breaking change（现有 Plan 需 migration）
4. **Market 新增品类**：`provider-card` 需要对齐审核流程
5. **AGENT prompt 变长**：ProviderCard 作为 PromptFragment 注入，需要控制卡片数量和摘要长度
6. **Built-in Card 维护成本**：内部团队需要为主流 provider 持续维护 Card

### 演化评级预期

| 控制面 | 本 ADR 影响 |
|---|---|
| Prompt | A → A（保持） |
| Schema | A- → A（generationIntent 结构化 + 受控枚举 styleFamily） |
| Runtime | A- → A-（保留 Router/Registry，移除确定性 Bridge hook） |
| Policy | B → B+（Provider 偏好纳入 preferences.md） |
| Memory | A → A+（Layer 2 Card override 是最强演化载体） |
| Evaluator | A → A（保持） |
| Control | A-（新增 ProviderRegistry 到 Control 面） |
| **Provider（新）** | **A** |

## 后续演进

实现状态（2026-04-25）：PR-P1 至 PR-P7 的 P0/P1 主链已调整为 ProviderCard 软上下文路线；确定性语义桥 / 独立语义 prompt 路径已取消，后续以 ProviderCard 摘要质量、Project Override 与反馈闭环增强为主。

| PR | 目标 | 状态 | 已落地范围 |
|---|---|---|---|
| **PR-P1** | ProviderRegistry + Card schema + ProviderCard 类型定义 | ✅ 完成 | `ProviderCard` / `GenerationIntent` / Registry / markdown parser |
| **PR-P2** | ProviderRouter 骨架（styleFamily 路由 + Memory 加权） | ✅ 完成 | styleFamily affinity 路由、显式 providerId 优先、fallback chain metadata |
| **PR-P3** | ProviderExpressionContext 骨架（ProviderCard → PromptFragment） | ✅ 完成 | ProviderCard 汇总为 AGENT 软提示上下文；工具层保持原生 prompt / Markdown-derived prompt |
| **PR-P4** | 主流 Built-in Cards：Flux / SDXL / MJ / Runway / Sora / DALL-E 6 张 | ✅ 完成 | 4 张 image card + 2 张 video card |
| **PR-P5** | neko-market `provider-card` 品类 + `.neko/providers/` Project Override 机制 | ✅ 完成 | market install target、global/project card loading、Project Override 写入 |
| **PR-P6** | Memory 演化闭环：Evaluator → ProjectMemoryRouter → Layer 2 Override | ✅ 完成 | tool metadata → feedback signal → project card observations / concept coverage / anti-bias candidates |
| **PR-P7** | 消融 toggle 接线 + 文档同步 | ✅ 完成 | 保留 `providerCardAutoEvolve` kill-switch；移除确定性 prompt 替换 kill-switch |

剩余增强项：

1. ProviderExpressionContext 已支持基础 token budget 裁剪与按 `taskStage` 调整摘要优先级；后续可继续按运行阶段动态分配预算。
2. Project Override 已支持 `review-queue` 模式，把候选 patch 写入 `.neko/providers/review/*.patch.md` 等待人工确认；后续可在 UI 中提供 approve/reject 操作。
3. Market `provider-card` 已接入基础 trustLevel / signature manifest 校验；后续可接入真实签名验签与服务端审核流水。

### 回滚策略

ProviderCard 不再位于工具执行前的确定性替换链路，因此不需要确定性 prompt 替换 kill-switch。

- `providerCardAutoEvolve: false`：关闭 Layer 2 Project ProviderCard 自动演化。
- `providerAdaptationMode: native`：生成工具参数显式要求原生 prompt passthrough；默认 `auto/agentic` 仅提示 AGENT 倾向，不做确定替换。
- 未注册 ProviderCard 或没有匹配 Card 时，AGENT 直接按用户 prompt / Plan/Task Markdown 原生生成工具参数。

### AblationToggles

```typescript
export interface AblationToggles {
  // ... 既有字段 ...

  /** Layer 2 自动演化：false=禁用 Project Override 自动写入 */
  providerCardAutoEvolve?: false;
}
```

### 反模式清单（供 review 对照）

| 反模式 | 为什么错 |
|---|---|
| 把 ProviderCard 当 Skill 写 | M:N 关系被迫变 N:N 重复 |
| Provider 走 Skill 市场单独品类混在一起 | 搜索噪声：用户搜"动漫 skill"不应出现 NovelAI card |
| 全部 Card 都走市场 | 主流模型开箱即用承诺被破坏 |
| 项目层自动演化直接写回 Built-in | 边缘观察污染全局能力 |
| 把 Card 做成 TypeScript 常量 / Schema | 违反 §11.5 AI 原生，无法演化 |
| 每个 Card 一个 npm 包（@neko/provider-flux） | 过度工程；主流 Card 应内置 |
| 用户手动选 Provider 作为主路径 | ProviderRouter 应自动路由，用户只在 preferences 声明偏好 |
| 把 provider 表达结果落回 Plan | 破坏 Plan 的 provider-neutral 性，换模型要重编 |
| 在 Plan 层就按 provider 展开描述 | 锁死 provider；Plan 的语义层被污染 |
| 用技术参数描述 Card（`anime_bias=0.8`） | 无法 AI 驱动演化；应用美学 / 能力语言 |
| Card 全部展开描述（保守策略） | 限制强模型创造力；token 成本爆炸 |
| Card 全部保留抽象（激进策略） | 弱模型出废片 |

### 与其他 ADR 的对齐更新

本 ADR 合入后，需同步更新：

| ADR | 更新内容 |
|---|---|
| **agent-unified-workflow.md** §5.1 | CapabilityKind 联合新增 `providerCard` |
| **agent-unified-workflow.md** §7.4 | `.neko/` 布局新增 `providers/` 子目录 |
| **agent-tool-skill-enhancement.md** | 注明 Provider 与 Skill 的边界（M:N） |
| **agent-media-architecture.md** | 标注 Send-to-Agent 工具调用由 AGENT 结合 ProviderExpressionContext 生成参数 |
| **marketplace.md** | 新增 `provider-card` 品类 + 三层分发策略 |
| **agent-memory-unification.md** | ProjectMemoryRouter 扩展目标：`.neko/memory.md` + `.neko/providers/*.card.md` |
| **ablation-experiment-framework.md** | ProviderCard 仅保留 `providerCardAutoEvolve` 消融开关 |
| **agent-evolution-capacity.md** | §3 新增 Provider 层评级 A；§3.4 控制面表末追加 Provider 行 |
| **adr-control-plane-feedback-arbiter.md** | 补充说明 ProviderCard feedback 进入 Project Override 演化，不再作为 beforeToolCall 替换 hook |

### 不纳入本 ADR 的延伸议题

以下属于本 ADR 的自然延伸，但不在当前范围：

1. **CandidatePool + Selection**（`adr-generation-variance-and-selection.md`）—— 输出端不确定性的第四类差异处理
2. **Provider 质量打分标准库**——CLIP / 美学分模型的选择与加权策略
3. **跨 Provider 产物对比 UI**——用户在多 Provider ensemble 时的选择界面
4. **Provider Adapter 的 mock / fixture**——用于离线测试与重放的基础设施
5. **Provider Cost Aggregator**——跨 Provider 配额与成本追踪（属于 Policy 面扩展）
6. **Provider 回归测试框架**——Card 演化后的自动化质量验证

---

**核心承诺**：本 ADR 让生成模型的三类输入端差异（方言 / 语义深度 / 训练偏置）从"散落在 Skill / 代码 / README"升级为"统一的 Markdown Card + AGENT 表达倾向上下文 + 自演化闭环"。新 Provider 接入零代码、只写 Card；Plan 层保持 provider-neutral；Memory 驱动 Card 持续优化——符合 "LLM 变强 = 系统自动增强" 的最强演化锚点。
