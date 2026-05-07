## Context

`docs/architecture/adr-agent-multimodal-perception.md` 已经确定目标架构：PerceptionCard 归属 `@neko/shared`，ToolResultBackfill 拆成 shared payload / runtime event / Webview message / persistent patch，Provider-Aware Delivery 放在 `@neko/ai-sdk`，CompositeBlock 只由 Webview presentation 层消费。当前代码仍存在几个断点：`agent-stream-state.ts` 只处理普通 `tool_result`，`ToolCall.result` 不承载 `attachments` / `perceptionCards` / diagnostics，`projectMultimodalPacketToChatMessage()` 是同步 provider-neutral 投影，媒体任务完成后也没有自动把生成资产感知并回填到下一轮 LLM history。

五层分析：

- 职责：shared 定义契约，agent runtime 做回填协调与感知编排，extension 只做 VSCode / workspace / URI adapter，ai-sdk 做 provider message 投影，webview 做展示 assembly。
- 依赖：依赖方向保持 shared → agent-types → agent/runtime → extension/webview adapter；`@neko/ai-sdk` 消费 shared contract，但不反向依赖 Webview 或 Extension。
- 接口：先落 ToolResultBackfill 与 PerceptionCard shared contract，再接 stream/session patch、perception ports、provider async projection、CompositeBlock projection。
- 扩展：PerceptionCard 带 `version`、layer status、per-evidence confidence、cost/cache metadata；ProviderInputModalities 独立于生成能力，可扩展新 provider；CompositeTemplate 可注册新 renderer。
- 测试：每层都使用 mock ports 或 pure projection tests，覆盖 stream 内/stream 后回填、path policy、provider fallback、webview assembly 和 OpenSpec validate。

## Goals / Non-Goals

**Goals:**

- 闭合媒体生成任务完成后的结果回填，让 Webview 与下一轮 LLM history 都能看到完整 tool result。
- 定义 `PerceptionCard` 作为 provider-agnostic 的结构化感知中间体，并支持 Layer 0/1/2 渐进感知。
- 把感知 pipeline 做成 runtime service + ports，不让 Extension 或 Webview 拥有感知业务逻辑。
- 在 `@neko/ai-sdk` 增加异步 provider-aware projection，按 provider 输入模态能力选择 text/image/video fallback。
- 让 LLM 能输出 `CompositeBlock` 表达结构化多模态布局意图，由 Webview assembly 和 RichContent renderer 渲染。
- 统一路径策略：持久层只保存稳定 asset refs，payload 和 host URI 只在 adapter 边界生成。

**Non-Goals:**

- 不实现实时生成预览流；PerceptionCard 处理任务完成后的 post-hoc 感知。
- 不建立跨项目全局 PerceptionCard 搜索索引。
- 不新增媒体生成工具或替代现有 provider registry。
- 不在首版给 shared `ContentPart` 增加 `AudioPart`；音频默认以 transcript / loudness / duration 文本投影。
- 不让 CompositeBlock 进入 LLM 上下文回读；它是 Webview presentation intent。
- 不一次性完成 3D 深层感知；3D Layer 1/2 留给后续扩展。

## Decisions

### Decision 1: 先实现 ToolResultBackfill，再挂 Perception Pipeline

后台媒体任务通常在当前 stream 结束后完成，只改 `agent-stream-state.ts` 会导致 Webview 更新但 session history 仍旧。先定义 `ToolResultBackfillPayload`、merge policy 和 diagnostics，再由 `BackfillCoordinator` 同时驱动 stream projection、Webview message、`AgentSession.patchToolResult()`、Journal / ConversationRecord patch。

替代方案是让 `mediaTaskDeliveryHost.ts` 直接 post Webview message。这会把业务闭环留在 Extension，且下一轮 LLM 仍读取不到完整 tool result。

### Decision 2: `agent-stream-state.ts` 只做纯内存投影

`applyToolResultBackfill()` 只 merge `collectedToolCalls` 和 `contentBlocks`，不写 session、不写 journal、不 post Webview。所有副作用集中到 `BackfillCoordinator`。

替代方案是在 stream state handler 中直接持久化；这会让纯 projection 难以测试，也会把 runtime state 和 session 存储耦合。

### Decision 3: PerceptionCard 在 shared 层，resolved path 留在 port implementation

`PerceptionCard`、`PerceptualAssetRef`、`PerceptionEvidenceEntry`、`ToolResultBackfillPayload` 都放在 `@neko/shared`，并只保存相对路径或 `${VAR}/path` 形式的 stable URI。`PerceptualAssetResolverPort` 把 stable ref 解析为 `ResolvedPerceptualAsset`，其中的 `resolvedPath` 是 process-local 临时输入，不能持久化或发送到 Webview。

替代方案是在 PerceptionCard 中存 `file://`、webview URI 或 base64；这会破坏路径策略、扩大 history 体积，并让 runtime 依赖宿主环境。

### Decision 4: PerceptionPipeline 编排底层感知工具，LLM 只读结果或调用聚合 PerceiveTool

系统按 `PerceptionPolicyResolver` 自动选择 `on-completion`、`on-reference` 或 `on-demand`，并行执行 probe / transcribe / describe / shots / thumbnail 等 ports。LLM 需要更深时调用 `PerceiveTool({ assetId, depth, focus })`，不直接编排五个底层工具。

替代方案是让 LLM 自己调用底层 perception tools；这会增加推理轮次、采样策略不稳定，也更难统一 confidence/retry 语义。

### Decision 5: Provider-aware 投影在 AI SDK 异步入口完成

保留现有同步 `projectMultimodalPacketToChatMessage()`，新增 `projectMultimodalPacketToChatMessageAsync()` 和 `projectPerceptionCardToContentParts()`。Provider input modalities 来源优先级为 adapter runtime capability、ProviderCard `inputModalities`、built-in defaults、text-only fallback。`act-phase.ts` 只输出 generic ChatMessage / tool result，不编码 provider payload 规则。

替代方案是在 `buildToolResultMessages()` 中根据 provider 拼 content parts；这会让 agent executor 依赖 provider 细节，后续 Gemini / Claude / 本地模型差异会继续扩散。

### Decision 6: CompositeBlock 是 Webview presentation contract

`ContentBlockType` 新增 `composite`，数据只描述 template、sections、mediaRefs 和布局意图。Webview presenter 解析 `mediaRef.toolCallId` 到已回填的 tool result asset refs，再通过 Extension adapter 获取 webview-safe URI，最后交给 RichContent renderer。

替代方案是让 LLM 输出 markdown 表格和裸 URL；这无法稳定绑定 tool result，也难以提供资产操作、导出和交互状态。

## Risks / Trade-offs

- [回填与任务完成竞态] → `BackfillCoordinator` 使用 idempotent merge key，按 `toolCallId` 查找；缺失 tool call 只生成 diagnostic，不隐式创建成功结果。
- [历史 patch 语义复杂] → 先实现 shallow merge 和 allowlist overwrite，禁止深层任意覆盖；冲突写 diagnostics。
- [Perception 成本过高] → 默认 Layer 0 always，Layer 1/2 由 policy、workflow 和 on-demand 控制；记录 `cost` 与 cache key。
- [Provider payload token/size 膨胀] → async projection 使用 bounded asset loader 和 VisionPreprocessPolicy；text-only fallback 始终可用。
- [路径策略回归] → 添加单元测试验证 persisted payload 不含 `file://`、webview URI、absolute path 或 inline base64。
- [Composite renderer 增加 UI 复杂度] → 首版只做 storyboard table、comparison grid、asset gallery 三个 renderer，走 RichContentRegistry 既有扩展点。

## Migration Plan

1. 增加 shared contracts 和 `@neko-agent/types` 扩展，补齐 parse/build tests。
2. 实现 ToolResultBackfill merge helper、`applyToolResultBackfill()`、`BackfillCoordinator` 和 session/history patch API。
3. 新增 PerceptionCard / PerceptionPipeline / PerceptionPolicyResolver / PerceiveTool，使用 mock ports 先完成 runtime 单测。
4. 在 `mediaTaskDeliveryHost.ts` 接入 perception + backfill，Extension 仅提供 resolver、file/webview URI 和 media client adapters。
5. 在 `@neko/ai-sdk` 增加 async projection 与 ProviderInputModalities resolver，接入 AI SDK adapter message assembly。
6. 增加 CompositeBlock 类型、Webview presenter assembly 和 RichContent renderers。
7. 更新 ADR/架构文档，运行 OpenSpec validate、targeted TypeScript check 与 Vitest suites。

Rollback 策略：每个阶段保留旧同步 projection 和普通 `tool_result` 路径。若 perception 或 provider async projection 出现回归，可禁用自动 backfill perception，仅回填 Layer 0 元数据和 asset refs；不得回退为 Extension/Webview 独占业务逻辑。

## Open Questions

- `ToolResultAttachment.path` 现有注释为 absolute path，首版是直接改为 stable URI 语义，还是新增兼容字段并逐步迁移；建议实现时以 adapter 兼容转换保护旧调用点。
- ProviderCard `inputModalities` 字段是否与现有 provider expression context 同 PR 扩展；建议本变更只消费字段并提供 defaults。
- `on-reference` 延迟感知的触发点应挂在 context packet builder 还是 asset resolver；建议首版先覆盖 `on-completion` 与 explicit PerceiveTool，延迟触发作为 P1。
