# ADR: Agent 多模态展示与感知架构 — PerceptionCard / CompositeBlock / Provider-Aware Delivery

## 状态

Proposed (2026-05-06)

> 2026-05-06 Review: PerceptionCard 归属 `@neko/shared`；Provider-Aware Delivery 迁移至 `@neko/ai-sdk` multimodal-message-projection；ToolResultBackfill 拆为 shared payload + AgentEvent + Webview message + session/history 持久更新；confidence 按 evidence/layer 细分；perceptual layer 使用 asset ref 替代 inline base64；inputModalities 独立于 Concept Coverage。

**日期**: 2026-05-06
**关联**: neko-agent · neko-types · neko-client · neko-engine · @neko/ai-sdk
**关联文档**:

| 关联文档 | 关系 |
|---|---|
| [agent-media-architecture.md](./agent-media-architecture.md) | ADR-4 GeneratedAsset 协议、ADR-6 MediaPreview 三层 + RichContent Registry — 本 ADR 扩展其富内容层 |
| [perception-first-roadmap.md](./perception-first-roadmap.md) | ADR-P0 AgentObservation / PerceptionEvidence 协议 — PerceptionCard 建立在此之上 |
| [adr-provider-expression-context.md](./adr-provider-expression-context.md) | ProviderCard — Provider-Aware Delivery 消费 inputModalities；不塞入 Concept Coverage 文本语义 |
| [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md) | FeedbackArbiter — PerceptionCard per-evidence confidence 融入反馈信号 |
| [agent-first-multimodal-context-resolution.md](./agent-first-multimodal-context-resolution.md) | 多模态上下文分层 — PerceptionCard 是 Asset→AgentObservation 路径的结构化中间产物 |
| [adr-capability-protocol.md](./adr-capability-protocol.md) | Registration/Injection 两阶段 — PerceiveTool 走 lazy injection |
| [agent-first-multimodal-development-plan.md](./agent-first-multimodal-development-plan.md) | 统一开发方案 — 本 ADR 是其 Perception Pipeline + Composite Display 的具体架构实现 |
| [adr-skill-as-prompt-chains.md](./adr-skill-as-prompt-chains.md) | Skill prompt-chain — PerceptionPolicy 在 Skill 编排上下文中使用 |
| [creative-context-compression.md](./creative-context-compression.md) | 7 层优先级压缩 — PerceptionCard 中的 semantic 内容需在压缩中保留创作决策 |

---

## 背景

### 1.1 信息不对称：LLM 看不到生成结果

Agent 调用 `GenerateImage` / `GenerateVideo` 等工具后，工具立即返回 `{ backgroundMode: true, taskId, status: "queued" }`。任务完成后，Webview 通过 `media-extractors.ts` 从 `result.data` 提取 URL 渲染图片，但 LLM 只看到最初的 taskId — **对自己生产的资产完全失明**。

```
LLM ──call──► GenerateImage ──queue──► MediaService
                                           │
                                      task complete
                                           │
                 ┌─────────────────────────┤
                 ▼                         ▼
          Webview (sees result)      LLM (sees only taskId)
          via media-extractors       via buildToolResultMessages
          ✅ 渲染图片                 ❌ 永远不知道结果
```

`buildToolResultMessages()`（`act-phase.ts:156`）支持 `ToolResultAttachment[]`，但生成工具从未填充该字段。类型基础设施存在，管道断裂。

### 1.2 感知鸿沟：模态理解深度差异

不同媒体类型对 LLM 的「理解鸿沟」不同：

| 模态 | LLM 原生能力 | 鸿沟 | 桥接需求 |
|------|-------------|------|---------|
| 文本 | 完全理解 | 无 | 无 |
| 图片 | Vision 模型可直接看 | 小 | 缩放（已有 MediaPreprocessor） |
| 视频 | 不能看 | 大 | 关键帧采样 + 场景描述 + 转录 |
| 音频 | 不能听 | 大 | Whisper 转录 + 响度分析 |
| 3D  | 不能看 | 大 | 多角度渲染 + 网格统计 |

现有 5 个 perception tools（`perception-tools.ts`）已覆盖转录、CLIP 评分、分类、镜头检测，但这些工具与生成→反馈回路断裂 — 生成完成后不自动触发感知。

### 1.3 多模态组装：LLM 无法控制布局

`ContentBlockType = 'thinking' | 'text' | 'tool_call' | 'code_diff' | 'plan'`（`message.ts`）— 无 composite 类型。`BuiltinContentKind = 'image' | 'image-grid' | 'video' | 'audio' | 'storyboard'`（`RichContent/types.ts`）— 可扩展但无结构化表格。

LLM 无法表达「第 1 场分镜配这张图，第 2 场配那张图」的组装意图 — 只能按时间序列平铺 ContentBlock，无法控制叙事布局。

### 1.4 现状分析

| 已有组件 | 缺失 / 断裂 |
|---|---|
| 5 perception tools（transcribe / similarity / classify / detectShots / describeInput） | 无聚合 PerceiveTool；工具各自独立，非流水线 |
| `AgentObservation` / `PerceptionEvidence` 协议（`@neko/shared`，ADR-P0） | 无 PerceptionCard 承载分层感知结果 |
| `RichContentRegistry` + 5 renderer kinds | 无 composite 组装渲染器（分镜表格、对比网格） |
| `buildToolResultMessages()` 支持 `ToolResultAttachment` | 生成工具从不填充 attachments |
| `MediaPreprocessor` + `VisionPreprocessPolicy` | 仅处理用户上传；未挂接生成内容 |
| `MediaTaskDeliveryHost` + `finalizeCompletedMediaTaskOutputs()` | 无 perception pipeline 钩子 |
| `@neko/ai-sdk` `projectMultimodalPacketToChatMessage()` | 已有 provider-neutral 多模态投影，但不消费 PerceptionCard |

---

## 层级职责边界

本 ADR 涉及三个独立关注点，**必须分层实现，禁止混合**：

```
┌──────────────────────────────────────────────────────────────┐
│ Layer           │ 职责                  │ 归属包              │
├─────────────────┼───────────────────────┼────────────────────┤
│ PerceptionCard  │ Asset→结构化感知中间体  │ @neko/shared (L0)  │
│ (runtime)       │ 无 vscode / 无 React  │                    │
├─────────────────┼───────────────────────┼────────────────────┤
│ Provider-Aware  │ Card→Provider-specific │ @neko/ai-sdk       │
│ Delivery        │ ContentPart[] 投影     │ (扩展现有           │
│                 │                       │  multimodal-message │
│                 │                       │  -projection)       │
├─────────────────┼───────────────────────┼────────────────────┤
│ CompositeBlock  │ Webview 展示意图渲染    │ neko-agent/webview  │
│ (presentation)  │ + Assembly 层          │                    │
└─────────────────┴───────────────────────┴────────────────────┘
```

`buildToolResultMessages()`（`act-phase.ts`）**不做** provider-aware 投影。它只将 ToolResult（含已回填的 PerceptionCard）转为 generic `ChatMessage`。Provider-specific 投影在 `@neko/ai-sdk` 的异步多模态投影入口完成；现有同步 `projectMultimodalPacketToChatMessage()` 保持不破坏，新增 async sibling 消费 PerceptionCard 与 bounded asset loader。

---

## 决策

### 决策 1: PerceptionCard — 分层感知中间体

所有媒体资产（用户上传或 Agent 生成）经过 Perception Pipeline 后产出一张 **PerceptionCard**，作为 LLM-agnostic 的结构化感知中间层。

**类型归属 `@neko/shared`**（与 `AgentObservation` / `PerceptionEvidence` 同层），确保 ToolResult、runtime、platform、ai-sdk 均可引用，无类型绕路。

三层渐进结构，成本递增：

```
Layer    成本       触发条件            内容
─────────────────────────────────────────────────────────
  0      free       always             probe: format/dimensions/duration/size
  1      ~2-5s      policy-driven      CLIP describe + Whisper + shots + clipScore
  2      ~5-15s     on-demand          keyframes / waveform / multi-view renders
```

```typescript
interface PerceptionCard {
  readonly version: 1;
  readonly assetId: string;
  readonly modality: AgentObservationModality;
  readonly sourceToolCallId?: string;
  readonly contextPacketId?: string;
  readonly createdAt: number;

  readonly layerStatus: {
    readonly layer0: 'complete';
    readonly layer1: 'pending' | 'complete' | 'skipped' | 'failed';
    readonly layer2: 'pending' | 'complete' | 'skipped' | 'failed';
  };

  readonly structural: {
    readonly format: string;
    readonly mimeType: string;
    readonly byteSize: number;
    readonly width?: number;
    readonly height?: number;
    readonly durationMs?: number;
    readonly frameRate?: number;
    readonly channels?: number;
    readonly sampleRate?: number;
    readonly vertexCount?: number;
    readonly materialCount?: number;
  };

  readonly semantic?: {
    readonly evidences: readonly PerceptionEvidenceEntry[];
  };

  readonly perceptual?: {
    readonly keyframeRefs?: readonly PerceptualAssetRef[];
    readonly thumbnailRef?: PerceptualAssetRef;
    readonly waveformRef?: PerceptualAssetRef;
    readonly multiViewRefs?: readonly PerceptualAssetRef[];
  };

  readonly cost?: {
    readonly totalMs: number;
    readonly tokenEstimate: number;
    readonly gpuUsed: boolean;
  };

  readonly cacheKey?: string;
}

interface PerceptionEvidenceEntry {
  readonly kind: 'description' | 'transcript' | 'loudness' | 'clip-score'
              | 'shot-boundaries' | 'tags' | 'custom';
  readonly confidence: number;
  readonly value: unknown;
  readonly diagnostics?: PerceptionDiagnostics;
}

interface PerceptualAssetRef {
  readonly assetId: string;
  readonly uri: string; // relative path or ${VAR}/path; never webview/file URI
  readonly mimeType: string;
  readonly label?: string;
  readonly timestampMs?: number;
}

interface PerceptionDiagnostics {
  readonly languageDetected?: string;
  readonly languageConfidence?: number;
  readonly snr?: number;
  readonly blurScore?: number;
  readonly retryCount: number;
  readonly retryReason?: string;
}
```

**与旧版差异**:

| 旧版 | 修正 | 原因 |
|------|------|------|
| 无 `version` | 加 `version: 1` | 后续 schema 演进兼容 |
| 无 `contextPacketId` | 加 `contextPacketId` | 关联 `MultimodalContextPacket`，与 `@neko/ai-sdk` projection 对齐 |
| 无 `layerStatus` | 加三层状态 | 消费者知道哪些 layer 已完成/跳过/失败 |
| `semantic.confidence` 总分 | 改为 `evidences[]` 每条带 `confidence` | 不同 evidence 可靠度不同：转录 0.3 不代表 CLIP 也 0.3 |
| `perceptual.keyframes[].base64` | 改为 `keyframeRefs[].assetId + uri` | 遵守 GeneratedAsset 文件协议 — 二进制写盘，持久层只传稳定引用 / 相对路径 / `${VAR}/path`。Webview URI 只在 UI adapter 生成 |
| 无 `cost` | 加 `cost` | Pipeline 成本可观测，feed 进 FederationBudget 或消融实验 |
| 无 `cacheKey` | 加 `cacheKey` | 同一 asset 相同 layer 可复用缓存结果 |
| 归属 `@neko/agent-types` | 改为 `@neko/shared` | 与 `AgentObservation` / `PerceptionEvidence` 同层，避免 ToolResult → runtime → platform 类型绕路 |

PerceptionCard 是 `PerceptionEvidence`（ADR-P0）的结构化载体 — 一张 Card 可作为一条 evidence（`source: 'engine'`）附加到 `AgentObservation` 中。

### 决策 2: PerceptionPolicy — 策略驱动感知时机

感知时机不是"主动 vs 被动"的二元选择，而是由策略解析器根据任务上下文自动决定。

三种时机：

| 时机 | 语义 | 适用场景 |
|------|------|---------|
| `on-completion` | 任务完成立即感知 | 工作流步骤，下一步依赖结果 |
| `on-reference` | 下次 LLM 引用该资产时才感知 | 单次生成，用户自己看 |
| `on-demand` | LLM 显式调用 PerceiveTool | 需要更深层分析 |

```typescript
type PerceptionTiming = 'on-completion' | 'on-reference' | 'on-demand';

interface PerceptionPolicy {
  readonly timing: PerceptionTiming;
  readonly layers: readonly (0 | 1 | 2)[];
  readonly reason: string;
}

interface PerceptionPolicyContext {
  readonly isWorkflow: boolean;
  readonly hasNextStep: boolean;
  readonly modality: AgentObservationModality;
  readonly userExplicitRequest: boolean;
}
```

默认策略解析：

```
userExplicitRequest?
  └── YES → on-completion, layers [0, 1, 2]

isWorkflow && hasNextStep?
  └── YES → on-completion, layers [0, 1]
             (下一步 LLM 推理需要知道上一步结果)

modality ∈ { video, audio }?
  └── YES → on-completion, layers [0]
             (LLM 无法直接感知音视频，至少返回元数据)
             escalation: toLayer1 = 'if-workflow'

default → on-reference, layers [0]
           (用户自己看结果，LLM 下轮对话再用)
```

PerceptionPolicy 在 Skill prompt-chain 上下文中使用：如果当前 Skill 声明了多步骤工作流（如"分镜生成"），`isWorkflow` 和 `hasNextStep` 由 Skill 上下文提供。

模态类型复用 `@neko/shared` 现有 `AgentObservationModality`（`image | video | audio | data | text | mixed`）。若后续需要独立媒体细分（如 `model3d` / `motion`），必须先在 shared 层扩展该 union 或定义显式映射，避免 ADR 内出现未落地的 `AgentMediaModality`。

### 决策 3: 系统预处理，LLM 决策

**原则：LLM 不编排感知管线，它读取感知结果做决策。**

```
❌ 反模式：LLM 自主调用 5 个工具拼凑感知
  LLM → ExtractVideoFrame(t=0) → ExtractVideoFrame(t=5) → Transcribe → Loudness → ...
  问题：5 轮推理、不知道最优采样策略、可能遗漏关键信息

✅ 正确模式：系统并行执行，LLM 读结果
  系统 → 并行: probe + CLIP + Whisper + shots
       → 组装 PerceptionCard
       → 发送给 LLM
  LLM → 读 Card，判断是否需要更深层 → 可选调用 PerceiveTool
```

Perception Pipeline 定义为 **runtime service + ports**，不依赖 VSCode / extension 层：

```typescript
interface IPerceptionPipeline {
  perceive(assetRef: PerceptualAssetRef, policy: PerceptionPolicy): Promise<PerceptionCard>;
}

// Ports — runtime 只依赖抽象，extension 层提供实现
interface PerceptualAssetResolverPort {
  resolve(ref: PerceptualAssetRef): Promise<ResolvedPerceptualAsset>;
}

interface ResolvedPerceptualAsset {
  readonly assetId: string;
  readonly ref?: PerceptualAssetRef;
  readonly uri?: string;
  readonly modality: AgentObservationModality;
  readonly mimeType: string;
  readonly resolvedPath?: string; // optional process-local path, never persisted or sent to Webview
  readonly byteSize?: number;
  readonly cacheKey?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface MediaProbePort {
  probe(asset: ResolvedPerceptualAsset): Promise<PerceptionCard['structural']>;
}

interface PerceptionClientRequest {
  readonly asset: ResolvedPerceptualAsset;
  readonly focus?: PerceptionFocus;
  readonly options?: Readonly<Record<string, unknown>>;
}

interface PerceptualAssetRequest {
  readonly asset: ResolvedPerceptualAsset;
  readonly focus?: PerceptionFocus;
  readonly options?: Readonly<Record<string, unknown>>;
}

interface PerceptionClientPort {
  describe?(request: PerceptionClientRequest): Promise<PerceptionEvidenceEntry | undefined>;
  transcribe?(request: PerceptionClientRequest): Promise<PerceptionEvidenceEntry | undefined>;
  classify?(request: PerceptionClientRequest): Promise<PerceptionEvidenceEntry | undefined>;
  detectShots?(request: PerceptionClientRequest): Promise<PerceptionEvidenceEntry | undefined>;
}

interface PerceptualAssetPort {
  createThumbnail?(request: PerceptualAssetRequest): Promise<PerceptualAssetRef | undefined>;
  extractKeyframes?(request: PerceptualAssetRequest): Promise<readonly PerceptualAssetRef[]>;
  createWaveform?(request: PerceptualAssetRequest): Promise<PerceptualAssetRef | undefined>;
  createMultiView?(request: PerceptualAssetRequest): Promise<readonly PerceptualAssetRef[]>;
}

interface BackfillSink {
  applyBackfill(payload: ToolResultBackfillPayload): Promise<void>;
}
```

Extension 层的 `mediaTaskDeliveryHost.ts` 只做 VSCode/webview/file URI 适配，不拥有感知业务 — 它调用 `IPerceptionPipeline.perceive()` 并将 Card 组装为 `ToolResultBackfillPayload` 传给 `BackfillSink`。Agent runtime adapter 再把 payload 包装为 `tool_result_backfill` AgentEvent 或 session/history patch。

LLM 需要更深层感知时，调用聚合工具（不直接调底层工具）：

```typescript
interface PerceiveToolInput {
  readonly assetId: string;
  readonly depth: 1 | 2;
  readonly focus?: 'transcript' | 'visual' | 'audio' | 'shots' | 'composition';
  readonly options?: {
    readonly language?: string;
    readonly timeRange?: { readonly startMs: number; readonly endMs: number };
    readonly frameDensity?: 'sparse' | 'normal' | 'dense';
  };
}
```

`PerceiveTool` 内部根据 modality + focus 自动编排底层 perception tools，LLM 无需知道调用细节。

### 决策 4: Confidence + Recovery — 感知可靠性保障

每个 evidence 条目独立携带 confidence（0-1）和诊断信息。**不使用总分** — 转录 confidence 0.3 不影响 CLIP 评分 confidence 0.9 的可用性。

```typescript
interface PerceptionRetryPolicy {
  readonly acceptThreshold: number;    // default 0.6 — 直接使用
  readonly retryThreshold: number;     // default 0.3 — 触发重试
  readonly maxRetries: 1;              // 硬限制：最多重试 1 次
  readonly retryStrategy: 'upgrade-model' | 'adjust-params';
}
```

重试策略不是简单重复，而是换策略：

| 感知方法 | 重试策略 | 换什么 |
|---------|---------|--------|
| Whisper 转录 | upgrade-model | whisper-base → whisper-large |
| Whisper 转录 | adjust-params | 自动检测语言 → 指定语言 |
| CLIP 评分 | — | 数值结果，不需重试 |
| 关键帧提取 | adjust-params | uniform → keyframe-based |

LLM 收到的 PerceptionCard 中每条 evidence 携带可靠性标记：

```
evidence.confidence ≥ 0.6 → 正常使用，无标记
evidence.confidence 0.3-0.6 → 标注 "[UNCERTAIN]"
evidence.confidence < 0.3（重试后仍低）→ 标注 "[UNRELIABLE]"
```

LLM 的决策路径：

```
收到某条 evidence 为 UNCERTAIN/UNRELIABLE
  ├── 任务关键？→ 问用户确认
  ├── 可换维度？→ PerceiveTool({ focus: 'visual' }) 换个维度尝试
  ├── 其他 evidence 置信度够高？→ 仅用高置信度 evidence 继续
  └── 全部不可靠？→ 降级到只用 Layer 0 元数据 + 声明不确定性
```

Per-evidence confidence 同时作为 `PerceptionEvidence.confidence` 流入 `AgentObservation`，FeedbackArbiter 可将低置信度感知纳入反馈信号（参见 [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md)）。

### 决策 5: Provider-Aware Delivery — 适配不同 LLM 能力

PerceptionCard 始终生成（provider-agnostic），但投递给 LLM 的格式根据 Provider 输入模态能力调整。

**层级归属**：投影逻辑在 `@neko/ai-sdk` 的 `multimodal-message-projection.ts` 中实现（新增 async sibling，而不是破坏现有同步 `projectMultimodalPacketToChatMessage()`），**不在** `act-phase.ts` 的 `buildToolResultMessages()` 中。`act-phase` 只负责将 ToolResult（含 PerceptionCard）转为 generic `ChatMessage`；provider-specific 投影由 AI SDK adapter 在最终发送前完成。

**inputModalities 独立于 ProviderCard 的 Concept Coverage**。ProviderCard 当前 capabilities 字段（`image.generate | video.generate | audio.generate`）描述的是**生成**能力，不是**输入理解**能力。新增独立的 `inputModalities` 模型：

```typescript
interface ProviderInputModalities {
  readonly text: boolean;
  readonly image: boolean;
  readonly video: boolean | 'realtime-only';
  readonly audio: boolean | 'realtime-only';
}
```

首版不在 `ProviderInputModalities` 中声明 `document`。文档输入继续通过 text/data context 与 document reader 管道投影；只有当 shared `ContentPart` / provider adapter 形成统一 document payload 契约后，才扩展独立的 `document` 输入模态。

不同 LLM 的模态输入差异：

```
Provider             image   video           audio
──────────────────────────────────────────────────────────
Claude (Opus/Sonnet) ✅      ❌              ❌
GPT-5.5              ✅      ⚠️ 存疑         ⚠️ realtime-only
Gemini               ✅      ✅              ✅
本地模型 (Ollama)     部分     ❌              ❌
```

投影函数签名（在 `@neko/ai-sdk`）：

```typescript
interface PerceptionAssetLoader {
  load(ref: PerceptualAssetRef, policy?: VisionPreprocessPolicy): Promise<ProviderReadyAssetPayload>;
}

function projectMultimodalPacketToChatMessageAsync(
  packet: MultimodalContextPacket,
  options: MultimodalMessageProjectionOptions & {
    readonly perceptionCards?: readonly PerceptionCard[];
    readonly provider?: ProviderInputModalityResolverInput;
    readonly assetLoader?: PerceptionAssetLoader;
    readonly visionPolicy?: VisionPreprocessPolicy;
  },
): Promise<AsyncMultimodalMessageProjectionResult>;

function projectPerceptionCardToContentParts(
  card: PerceptionCard,
  options: {
    readonly providerModalities?: ProviderInputModalities;
    readonly assetLoader?: PerceptionAssetLoader;
    readonly visionPolicy?: VisionPreprocessPolicy;
    readonly imageDetail?: 'auto' | 'low' | 'high';
  },
): Promise<{ readonly parts: ContentPart[]; readonly diagnostics: readonly ProjectionDiagnostic[] }>;
```

投影逻辑：

```
始终包含: Card 文本摘要（Layer 0 structural + Layer 1 semantic evidences 的自然语言格式化）

image input = true:
  → assetLoader 加载 thumbnailRef / keyframeRefs → base64 → image ContentPart

video input = true (Gemini):
  → 可选原始视频引用（仅 Layer 2 on-demand，成本由调用方管控）

audio input = true:
  → 当前 shared ContentPart 无 AudioPart；默认仍投影 transcript / loudness / duration 文本
  → 只有当 `ContentPart` 扩展 `AudioPart` 且 provider adapter 支持时，才发送音频 payload

text-only:
  → semantic.description 展开为完整自然语言描述
```

`assetLoader` 是 bounded loader — 解析 `PerceptualAssetRef.uri`（相对路径或 `${VAR}/path`），按 `VisionPreprocessPolicy` 缩放后返回 base64。**base64 只在投影瞬间生成**，不存储在 PerceptionCard 中。

### 决策 6: CompositeBlock — 多模态组装

新增 `ContentBlockType: 'composite'`，允许 LLM 声明结构化多模态布局意图。

```typescript
// message.ts — 扩展 ContentBlockType
export type ContentBlockType =
  | 'thinking' | 'text' | 'tool_call' | 'code_diff' | 'plan'
  | 'composite';

export type CompositeTemplate =
  | 'storyboard-table'
  | 'comparison'
  | 'gallery'
  | 'report';

export interface MediaRef {
  readonly toolCallId: string;
  readonly assetIndex?: number;
  readonly caption?: string;
  readonly role?: string;
}

export interface CompositeSection {
  readonly heading?: string;
  readonly content?: string;
  readonly mediaRefs?: readonly MediaRef[];
  readonly layout?: 'inline' | 'grid' | 'table-row';
}

export interface CompositeBlockData {
  readonly template: CompositeTemplate;
  readonly title?: string;
  readonly sections: readonly CompositeSection[];
}

// ContentBlock 扩展
export interface ContentBlock {
  // ... existing fields ...
  composite?: CompositeBlockData;
}
```

Assembly 流程：

```
LLM 输出 CompositeBlock:
  { template: 'storyboard-table',
    sections: [
      { heading: "SC1 - INT. COFFEE SHOP",
        content: "Wide establishing shot, warm lighting",
        mediaRefs: [{ toolCallId: "call_abc", caption: "Golden hour" }],
        layout: "table-row" },
      { heading: "SC2 - CLOSE UP",
        content: "Protagonist turns, reveals emotion",
        mediaRefs: [{ toolCallId: "call_def" }],
        layout: "table-row" }
    ] }
      │
      ▼
Assembly Layer (content-block-presenter.ts, Webview 内)
  resolve mediaRef.toolCallId → 查找对应 ToolCall.result
  提取 resultAssetRefs / thumbnailAssetRef
  Extension adapter 先将 asset ref 解析为 webviewUri，再发送 Webview 渲染
      │
      ▼
RichContentRegistry.get('storyboard-table')
  ┌────┬──────────┬───────────────────────┬────────┐
  │ #  │ 画面      │ 内容                   │ 备注    │
  ├────┼──────────┼───────────────────────┼────────┤
  │ 1  │ [image]  │ Wide establishing...  │ 5s     │
  │ 2  │ [image]  │ Protagonist turns...  │ 3s     │
  └────┴──────────┴───────────────────────┴────────┘
  + [Save as Markdown] [Export Assets] buttons
```

新增 RichContent renderer kinds 注册在 `defaultRenderers.ts`：

| 新增 Kind | 渲染器 | 功能 |
|-----------|--------|------|
| `storyboard-table` | `StoryboardTableRenderer` | 分镜表格（镜号/画面/描述/时长） |
| `comparison-grid` | `ComparisonGridRenderer` | A/B 对比（before/after，多方案对比） |
| `asset-gallery` | `AssetGalleryRenderer` | 资产画廊（生成结果集合 + 保存按钮） |

CompositeBlock 的消费者是 **Webview 渲染层**，不进入 LLM 上下文 — LLM 产出 CompositeBlock 后不需要再"看到"它的渲染结果。

### 决策 7: ToolResultBackfill — 事件契约与闭合管道

生成任务完成后，通过正式的 **BackfillEvent** 将结果回填到原始 ToolCall，同时触发 Perception Pipeline。

**先定义事件契约，再挂 Pipeline**。当前 turn 的 stream state 只覆盖正在处理的事件流；媒体后台任务通常在 turn 事件流结束后才完成。因此 Backfill 必须同时定义四个面：

| 面 | 归属 | 职责 |
|---|---|---|
| Shared payload | `@neko/shared` | 定义 `ToolResultBackfillPayload`、`ToolResultBackfillMergePolicy`、`ToolResultBackfillDiagnostic` |
| Runtime event | `@neko/agent` session/runtime | 扩展 `AgentEvent` 为 `tool_result_backfill`，供正在运行的流即时合并 |
| Webview message | `@neko-agent/types` | 扩展 `ToolResultMessage` 或新增 `toolResultBackfill` message，支持 UI 更新 |
| Persistent update | `AgentSession` / Journal / ConversationRecord | 在 stream 已结束后仍能 patch 已持久化的 assistant message / tool call，保证下一轮 LLM history 读取到回填结果 |

`agent-stream-state.ts` 的 `applyToolResult()` 当前不支持 backfill merge 语义；PR-0 必须新增 `applyToolResultBackfill()`，同时提供 session/history 级 patch API，避免只更新 Webview 而 LLM 下轮仍看到 taskId-only 结果。

```typescript
// @neko/shared
interface ToolResultBackfillPayload {
  readonly toolCallId: string;
  readonly timestamp: number;

  readonly dataPatch: Record<string, unknown>;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly mergePolicy?: ToolResultBackfillMergePolicy;
}

interface ToolResultBackfillMergePolicy {
  readonly overwriteKeys: readonly string[];
  readonly preserveKeys?: readonly string[];
  readonly conflictStrategy: 'diagnostic' | 'preserve-existing' | 'overwrite-listed';
}

interface ToolResultBackfillDiagnostic {
  readonly path: string;
  readonly reason: 'conflict' | 'missing-tool-call' | 'invalid-existing-result';
  readonly existing?: unknown;
  readonly incoming?: unknown;
}

// @neko/agent AgentEvent
interface ToolResultBackfillEvent extends ToolResultBackfillPayload {
  readonly type: 'tool_result_backfill';
}
```

Merge 契约：

- `dataPatch` 是 shallow merge。
- 默认保留已有字段；只有 `mergePolicy.overwriteKeys` 中的 key 可覆盖。
- 推荐默认 `overwriteKeys = ['status', 'resultAssetRefs', 'thumbnailAssetRef', 'width', 'height', 'durationMs', 'frameRate', 'mimeType']`。
- 冲突且不在 overwrite allowlist 时，保留 existing，并写入 `ToolResultBackfillDiagnostic`。
- `attachments` 追加去重，不替换；去重键为 `type + path + mimeType`。
- `perceptionCards` 统一使用数组；按 `assetId + version + cacheKey` 更新：同 key 新卡覆盖旧卡，不同 key 追加。提供 helper `selectLatestPerceptionCard(cards, assetId?)` 给 UI / provider projection 取最新卡。
- Backfill 不改变 `success`；如果原始 tool result 不存在，则生成 diagnostic，不隐式创建成功结果。
- 持久层禁止写入 `file://`、webview URI 或绝对路径；只写入 `GeneratedAsset` / `PerceptualAssetRef` / `${WORKSPACE}/...` 等可解析引用。`file://`、base64 和 `webview.asWebviewUri()` 只在 adapter 投影瞬间生成。

```
现有 result.data = { taskId: "t1", status: "queued", backgroundMode: true }

BackfillEvent.dataPatch = {
  status: "completed",
  resultAssetRefs: [{ assetId: "asset-img-1", uri: "${WORKSPACE}/.neko/generated/image/img.png", mimeType: "image/png" }],
  thumbnailAssetRef: { assetId: "asset-img-1", uri: "${WORKSPACE}/.neko/generated/image/img.png", mimeType: "image/png" },
  width: 1024,
  height: 576
}

Merge 后 result.data = {
  taskId: "t1",
  status: "completed",           ← 在 overwriteKeys 中，可覆盖
  backgroundMode: true,          ← 保留
  resultAssetRefs: [...],        ← 新增 / 覆盖
  thumbnailAssetRef: {...},      ← 新增 / 覆盖
  width: 1024,                   ← 新增
  height: 576                    ← 新增
}
```

职责拆分：

| 组件 | 行为 |
|---|---|
| `agent-stream-state.ts` | 纯内存投影：新增 `applyToolResultBackfill()`，只 merge `collectedToolCalls` / `contentBlocks`，无持久化副作用 |
| `BackfillCoordinator`（新增 runtime service） | 接收 shared payload，调用 stream projection（若 turn 仍活跃）、Webview message、`AgentSession.patchToolResult()` 与 Journal / ConversationRecord patch |
| `AgentSession.patchToolResult()` | 会话权威 patch API；事件流已结束后，LLM 下一轮 history 以此为准 |

`agent-stream-state.ts` 的 handler：

```
收到 ToolResultBackfillEvent
  │
  ├── 1. 查找 collectedToolCalls[toolCallId]
  │      按 mergePolicy shallow merge dataPatch → result.data
  │      concat attachments → result.attachments
  │      merge result.perceptionCards = event.perceptionCards
  │
  ├── 2. 查找 contentBlocks[type=tool_call, toolCallId]
  │      更新对应 block 的 toolCall.result
```

`BackfillCoordinator` 负责持久化和通知：

```
BackfillCoordinator.apply(payload)
  ├── stream still active? → emit ToolResultBackfillEvent → applyToolResultBackfill()
  ├── AgentSession.patchToolResult(payload)
  ├── Journal append/patch projection event
  ├── ConversationRecord patch message/tool result
  └── post toolResultBackfill / toolResult message to Webview
```

完整端到端流程：

```
LLM ──call──► GenerateImage({ prompt })
                   │
          { taskId, backgroundMode: true }
                   │
     ┌─────────────┤
     ▼             ▼
  LLM 继续      MediaService 排队任务
  (只知道 taskId)      │
                       ▼
                  task 完成 → asset 写入磁盘
                       │
         ┌─────────────┤
         ▼             ▼
  finalizeOutputs   PerceptionPolicyResolver.resolve()
  (save to .neko/       │
   generated/)     IPerceptionPipeline.perceive()
                   (probe + CLIP + ...)
                        │
                        ▼
                  PerceptionCard + asset metadata
                        │
                        ▼
                  BackfillSink.applyBackfill(
                    ToolResultBackfillPayload {
                      toolCallId, dataPatch, attachments, perceptionCards
                    })
                        │
          ┌─────────────┼─────────────┐
          ▼                           ▼
    Webview 更新                   LLM 上下文更新
    applyToolResultBackfill()      下次 turn 的 buildToolResultMessages()
    + persistent patch            从已 patch 的 session history 读取
    → RichContent 渲染图片         → generic ChatMessage 含完整结果
                                   → @neko/ai-sdk 投影含 PerceptionCard
```

---

## 迁移计划

### Phase 0: ToolResultBackfill 事件契约（1 PR）

**PR-0**: BackfillEvent + merge 语义
- 在 `@neko/shared` 定义 `ToolResultBackfillPayload` / `ToolResultBackfillMergePolicy` / `ToolResultBackfillDiagnostic`
- 在 `@neko/agent` 扩展 `AgentEvent`：新增 `tool_result_backfill`
- 在 `@neko-agent/types` 扩展 `ToolCall.result` 与 Webview message：支持 `attachments` / `perceptionCards` / `backfillDiagnostics`
- 在 `agent-stream-state.ts` 新增纯投影 `applyToolResultBackfill()` handler
- 新增 `BackfillCoordinator`；在 `AgentSession` / Journal / ConversationRecord 增加 tool result patch API，支持事件流结束后的持久化回填
- 定义 allowlist overwrite shallow merge 语义 + attachments 去重 concat 语义
- 单元测试：stream 内 backfill、stream 结束后 persistent patch、冲突 diagnostic、attachments 去重

**验收**：手动构造 Backfill payload 能同时更新 stream state、Webview 投影、已持久化 assistant message；下一轮 `buildToolResultMessages()` / session history 能读到回填后的 ToolCall.result

### Phase 1: PerceptionCard + Pipeline（2 PR）

**PR-1**: PerceptionCard 类型 + PerceptionPipeline 服务
- 在 `@neko/shared` 定义 `PerceptionCard` / `PerceptionEvidenceEntry` / `PerceptualAssetRef` 接口
- 在 `neko-agent/packages/agent/src/perception/` 新增 `PerceptionPipeline` 服务（实现 `IPerceptionPipeline`）
- 定义 ports：`MediaProbePort` / `PerceptionClientPort` / `PerceptualAssetPort` / `BackfillSink`（接收 shared payload，不接收 agent event）
- Pipeline 内部复用已有 `PerceptionTranscribeClient` / `PerceptionSimilarityClient` 等客户端
- 并行执行 Layer 0 + 按需 Layer 1，组装 PerceptionCard
- 单元测试：Pipeline 对各模态的输出验证

**PR-2**: PerceptionPolicyResolver + Extension 层集成
- 在 `neko-agent/packages/agent/src/perception/` 新增 `PerceptionPolicyResolver`
- 实现默认策略表（§决策 2 的解析逻辑）
- 在 `mediaTaskDeliveryHost.ts` 挂接：`finalizeCompletedMediaTaskOutputs()` 完成后调用 `IPerceptionPipeline.perceive()` + `BackfillSink.applyBackfill()`
- Extension 层只做 port 适配，不拥有感知业务
- 集成测试：generate image → task complete → Backfill payload 发射 → PerceptionCard 出现在 stream state 与 persisted session history

**验收**：LLM 调用 GenerateImage 后，任务完成时 ToolCall.result 包含完整元数据 + `perceptionCards[]`

### Phase 2: Provider-Aware Delivery + PerceiveTool（2 PR）

**PR-3**: Provider-Aware Delivery
- 在 `@neko/ai-sdk` 的 `multimodal-message-projection.ts` 扩展：新增 `projectPerceptionCardToContentParts()` 与 `projectMultimodalPacketToChatMessageAsync()`；保持现有同步 `projectMultimodalPacketToChatMessage()` 兼容
- 定义 `ProviderInputModalities` 接口（独立于 ProviderCard capabilities）
- 明确 `ProviderInputModalities` 来源优先级：provider adapter runtime capability > ProviderCard `inputModalities` 字段 > built-in provider defaults > text-only fallback
- 实现 bounded `assetLoader`：解析 `PerceptualAssetRef.uri` → 按 VisionPreprocessPolicy 缩放 → 返回 base64
- 音频默认投影为 transcript / loudness / duration 文本；只有 shared `ContentPart` 增加 `AudioPart` 后才启用音频 payload
- 在 AI SDK adapter 的 message assembly 阶段调用投影
- 单元测试：不同 Provider 模态组合下的 ContentPart[] 输出；验证 async loader、text-only fallback、audio-as-text fallback

**PR-4**: 聚合 PerceiveTool
- 在 `perception-tools.ts` 所在目录新增 `perceive-tool.ts`
- 实现 `PerceiveTool` — 根据 modality + focus 内部编排底层工具
- 注册为 lazy injection（`adr-capability-protocol.md` 两阶段）
- Confidence retry 逻辑（§决策 4）内置于 Pipeline，PerceiveTool 仅透传

**验收**：不同 Provider（Claude/GPT/本地）收到的 tool result 投影格式不同；LLM 可调用 PerceiveTool 深化感知

### Phase 3: CompositeBlock + 新渲染器（2 PR）

**PR-5**: CompositeBlock 类型 + Assembly 层
- 扩展 `ContentBlockType` union（`message.ts`）
- 定义 `CompositeBlockData` / `MediaRef` / `CompositeSection` 类型
- 在 `content-block-presenter.ts` 新增 `CompositeContentBlockProjection`
- Assembly 逻辑：resolve `mediaRef.toolCallId` → 已有 ToolCall results → webviewUri

**PR-6**: 新 RichContent 渲染器
- `StoryboardTableRenderer` — 分镜表格视图
- `ComparisonGridRenderer` — A/B 对比视图
- `AssetGalleryRenderer` — 资产画廊 + Save/Export 按钮
- 注册到 `defaultRenderers.ts`
- Webview 端 E2E 验证

**验收**：LLM 输出 CompositeBlock 后，Webview 渲染结构化表格/对比网格，含可交互的媒体卡片

---

## 非目标

1. **实时流式预览** — PerceptionCard 是 post-hoc（任务完成后），不覆盖生成过程中的实时预览
2. **3D 模态完整感知** — Layer 1/2 的 3D 感知（多角度渲染、网格分析）延期至 Q4 Operation 扩展（参见 [perception-first-roadmap.md](./perception-first-roadmap.md) Q4）
3. **对话导出 / Save as Markdown** — 已识别为需求但超出本 ADR 范围
4. **生成变体与候选选择** — 由 Provider 层面处理，不在本 ADR 范围
5. **PerceptionCard 全局检索索引** — 本 ADR 允许 PerceptionCard 随 conversation history / Journal projection 持久化，以保证下一轮 LLM 可见；但不建立跨会话、跨项目的全局可检索索引。全局持久化检索属于 asset-knowledge-graph。
6. **QualityGate 阻断逻辑** — PerceptionCard per-evidence confidence 流入 FeedbackArbiter，但阻断决策属于 [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md)
7. **新增生成工具** — 本 ADR 关注结果的感知与展示，不关注新生成能力的创建

---

## AblationToggles

| Toggle | 默认 | 效果 |
|--------|------|------|
| `perceptionPipelineEnabled` | `true` | `false` = 回退到无感知的 taskId-only 返回 |
| `perceptionAutoLayer1` | `true` | `false` = 仅 Layer 0，不自动执行 Layer 1 |
| `perceptionRetryEnabled` | `true` | `false` = 低置信度直接返回，不重试 |
| `compositeBlockEnabled` | `true` | `false` = CompositeBlock 降级为连续 text + tool_call blocks |
| `providerAwareDelivery` | `true` | `false` = 所有 Provider 统一收到文本摘要，不按能力投递 |

---

## 实施说明（2026-05-06）

本轮 OpenSpec 变更 `implement-agent-multimodal-perception` 将 ADR 的首版闭环落为可测试契约，实施中有以下对齐点：

1. `ProviderInputModalities` 作为 shared ProviderCard 输入能力字段落地，独立于生成能力与 Concept Coverage；AI SDK 在 async projection 阶段按 runtime capability / ProviderCard / built-in defaults / text-only fallback 解析。
2. `act-phase.ts` 保持 provider-neutral，只序列化 `neko.tool-result.v1` envelope；attachments、PerceptionCard 与 backfill diagnostics 由 platform / AI SDK adapter 在最终投递时转换。
3. Webview `CompositeBlock` assembly 不调用 VSCode API，也不读 agent runtime state；它只消费当前消息内已回填 tool result 中的 adapter-provided render URI，并输出 bounded missing-media diagnostics。
4. 持久层路径策略保持不变：`PerceptionCard`、`ToolResultBackfillPayload`、session / Journal history 只保存 stable `PerceptualAssetRef.uri` 或 `${WORKSPACE}/...` 形式；`file://`、webview URI、inline base64 与绝对宿主路径只允许出现在 Extension / provider / Webview 投影边界。
5. Composite renderers 通过既有 `RichContentRegistry` 注册：`storyboard-table`、`comparison-grid`、`asset-gallery`。`report` 模板首版复用 gallery projection，后续可注册独立 renderer。

## 复审修正（2026-05-07）

本轮实现与三轮代码复审确认整体仍符合 ADR 的三层边界与 Decision 7 回填闭环；以下实现期契约调整视为首版落地的一部分，并以代码契约为准：

1. `ProviderInputModalities` 明确包含 `text: boolean`，因为 text 是 provider message assembly 的稳定兜底能力；首版不包含 `document`。
2. `PerceptionClientPort` 与 `PerceptualAssetPort` 使用 optional capability methods。Pipeline 只组合已注入能力，并通过 evidence diagnostics / layer status 表达缺失或失败。
3. `ResolvedPerceptualAsset.resolvedPath` 为可选字段。解析器可以返回 metadata-only 或 adapter-owned URI 的资产描述；只有需要进程本地文件访问的 probe / derived asset port 才要求具体路径，且该路径不得持久化或传入 Webview。
4. `on-reference` timing 已进入 shared policy contract 与 resolver 输出，但首版运行时触发只闭合 `on-completion` 和 explicit `PerceiveTool`；真正的“下一次引用时触发”需要 asset reference detector / history lookup 钩子，作为后续 P1 增量实现。
5. `BackfillCoordinator.apply()` 对 stream / session / Webview 路径做 per-path error isolation，避免单一路径失败阻塞其它投递面；失败通过 `errors` 返回并保留 missing-tool-call diagnostics。
6. `PerceptionPipeline` 使用 `Promise.allSettled` 与局部 `settleOptional()` 收集 Layer 1/2，单个 backend 抛错不会丢弃其它成功 evidence / perceptual refs。
7. `ToolResultBackfill` attachment 去重采用 append-dedupe preserve-existing 语义；重复 key 的 incoming attachment 不覆盖已有 metadata。
8. provider-aware projection 只在已存在 `PerceptionCard` 时追加 provider-ready message，避免把原始 multimodal packet 重复注入为第二条 user message。
9. generated asset stable URI 统一复用 platform helper，Extension fallback 不再另算一套路径规则。
