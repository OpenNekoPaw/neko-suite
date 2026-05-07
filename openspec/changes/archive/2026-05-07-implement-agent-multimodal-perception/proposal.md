## Why

`neko-agent` 已经有多模态 context、媒体任务、RichContent 渲染和 perception tools 的基础，但生成工具完成后只把 `taskId` 留给 LLM，Webview 能看到图片/视频，下一轮模型却仍看不到自己刚生成的资产。现在需要把 ADR 中的 PerceptionCard、ToolResultBackfill、Provider-Aware Delivery 和 CompositeBlock 落成可实施契约，闭合“生成 → 感知 → 回填 → 下一轮推理/展示”的链路。

## What Changes

- 新增 ToolResultBackfill 契约：后台媒体任务完成后，可将资产元数据、attachments、`perceptionCards[]` 和 diagnostics 回填到原始 ToolCall.result，并同步 stream state、Webview、AgentSession / Journal / ConversationRecord。
- 新增 PerceptionCard 与 Perception Pipeline：媒体资产统一产出 provider-agnostic 的结构化感知卡，按 Layer 0/1/2 分层承载 structural、semantic evidence、perceptual asset refs、cost 和 cache metadata。
- 新增 PerceptionPolicy 与聚合 PerceiveTool：系统按 workflow/context 策略自动触发感知，LLM 需要深入分析时调用聚合工具，而不是直接编排底层 transcribe / classify / shot detection 工具。
- 新增 Provider-Aware Delivery：`@neko/ai-sdk` 根据 provider input modalities 将 PerceptionCard 异步投影为 provider-specific content parts，保留现有同步 projection 兼容入口。
- 新增 CompositeBlock 展示契约：LLM 可声明 storyboard table、comparison grid、asset gallery 等结构化多模态布局意图，Webview assembly 层解析 tool result / asset refs 并交给 RichContent renderer。
- 强化路径与 payload 边界：持久层只保存 `GeneratedAsset` / `PerceptualAssetRef` / `${WORKSPACE}/...` 等稳定引用；`file://`、webview URI、base64、绝对路径只在 host adapter / provider adapter 投影瞬间出现。
- 增加针对 stream 内回填、stream 结束后持久 patch、provider 投影、Perception Pipeline、CompositeBlock projection 和路径策略的测试。

## Capabilities

### New Capabilities

- `agent-tool-result-backfill`: 后台工具结果回填、merge 语义、stream/session/history/Webview 同步和 diagnostics。
- `agent-perception-card-pipeline`: PerceptionCard shared contract、PerceptionPolicy、PerceptionPipeline ports、PerceiveTool 和分层感知执行。
- `agent-provider-aware-perception-delivery`: Provider input modality 模型、PerceptionCard 到 provider message content parts 的异步投影和 bounded asset loading。
- `agent-composite-content-blocks`: CompositeBlock 内容契约、Webview assembly、RichContent storyboard/comparison/gallery renderer。

### Modified Capabilities

- None. 当前已归档 OpenSpec specs 中没有 agent 多模态感知能力基线；本变更新增 ADR 对应能力，不修改 3D / market 既有 specs。

## Impact

- `packages/neko-types` (`@neko/shared`): 新增 `PerceptionCard`、`PerceptionEvidenceEntry`、`PerceptualAssetRef`、ToolResultBackfill payload / merge / diagnostic contracts。
- `packages/neko-agent/packages/agent-types`: 扩展 ToolCall.result、ContentBlock、Webview message/projection 类型，支持 `attachments`、`perceptionCards`、`backfillDiagnostics` 和 `composite`。
- `packages/neko-agent/packages/agent`: 新增 BackfillCoordinator、PerceptionPipeline、PerceptionPolicyResolver、PerceiveTool、stream projection merge、session/history patch API。
- `packages/neko-agent/packages/extension`: 在 media task delivery host 挂接 perception/backfill；保留 VSCode/webview/file URI 适配职责，不承载 agent 感知业务。
- `packages/neko-agent/packages/ai-sdk`: 新增 async multimodal projection、ProviderInputModalities、PerceptionCard content part projection 和 bounded asset loader 接口。
- `packages/neko-agent/packages/webview`: 新增 CompositeBlock presenter / assembly，注册 storyboard table、comparison grid、asset gallery RichContent renderer。
- 文档与测试：更新 ADR/agent 架构说明，补充 unit/integration/webview presenter tests，并运行 OpenSpec validate 与相关 TypeScript/Vitest 检查。
