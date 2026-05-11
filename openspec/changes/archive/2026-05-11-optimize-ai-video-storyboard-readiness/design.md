## Context

当前 `neko-story` 已经有轻量分镜表，展示场景、估算时长、人物、状态和场景动作；`neko-canvas` 已经有正式的 `SceneGroupNode`、`ShotNode`、`GalleryNode`、生成面板、候选历史、大图 Overlay、批量生成和导入 `neko-cut` 的链路。

问题不是两边缺少“分镜表”这个名字，而是两张表的职责还没有在契约层显式表达：

- `story` 表应回答“这个剧本场景是否准备好进入 AI 视频生成”。
- `canvas` 表/节点应回答“这个镜头生成什么、结果是否可用、如何继续迭代”。
- `agent` 需要读到两边稳定摘要，而不是读取 Webview 内部状态或猜测节点字段。
- `assets` 和角色注册表已经能提供角色缩略图和角色身份解析，但 `story` 侧还没有把它们建模成可测试的“人物形象准备度”。

架构约束：

- `neko-story` 继续拥有剧本文本事实源、Fountain 解析、`ScriptIndex`、场景级状态和剧本级诊断。
- `neko-canvas` 继续拥有正式 storyboard 工作台、镜头级编辑、视觉候选、生成结果和 Cut handoff。
- `neko-agent` 负责语义拆镜与流程编排，不成为持久分镜编辑器。
- Webview 不直接访问 VSCode/Node API，跨扩展通信必须走 Extension Host 命令/API。
- 共享契约优先落在 `packages/neko-types`，避免 `story` 直接读取 Canvas 内部节点实现。

## Goals / Non-Goals

**Goals:**

- 将 `ScriptTableView` 的产品定位升级为 AI 视频场景准备度表。
- 为 `story` 增加显式角色视觉准备度模型，覆盖已绑定、已生成、有缩略图、缺失、未知、过期等可扩展状态。
- 让 `story` 能从剧本文本、角色注册表和资产缩略图计算 scene-level readiness。
- 提供 Canvas scene/shot execution summary 契约，让 `story` 和 `agent` 能读取 Canvas 下游进度。
- 让发送到 Agent 的 scene/character 上下文带上稳定 ID、角色身份、资产引用和缩略图摘要。
- 保持 `canvas` 作为唯一正式 shot-level storyboard 工作台。

**Non-Goals:**

- 不在 `story` 中实现 ShotNode 行编辑、镜头拖拽排序、候选图墙、批量生成队列或图像大图审查器。
- 不让 `canvas` 解析 Fountain、维护剧本文本事实源或负责中文叙事实体抽取。
- 不重写 `neko-assets` 的资产注册表；本变更只消费现有角色记录、资产实体和缩略图能力。
- 不改变 `neko-cut` 的时间线事实源；Canvas 只继续输出已确认 storyboard 结构。
- 不引入新的网络依赖或生成模型依赖。

## Decisions

### Decision 1: Story 表采用 scene-level readiness，而不是 shot-level storyboard

`story` 表的主粒度保持 `scene`。每行聚合场景标题、摘要、估算时长、角色视觉状态、缺失项、下游 Canvas 状态和下一步动作。

原因：

- Story 的权威数据是剧本文本和 `ScriptIndex`，天然是场景结构。
- shot-level 编辑已经由 Canvas 的 `SceneGroupNode + ShotNode` 承担。
- 准备度表可以作为生成前确认门，避免用户直接进入 Canvas 后才发现角色形象或场景信息缺失。

备选方案：在 `story` 表中展开每个 shot。拒绝，因为这会复制 Canvas 的正式 storyboard 编辑职责，并制造双事实源。

### Decision 2: 新增 `StorySceneVideoReadiness` 作为 Story 侧聚合 DTO

新增共享 DTO，建议字段包括：

- `sceneId`
- `sourceScriptUri`
- `sceneTitle`
- `estimatedDuration`
- `recommendedShotCount`
- `characters`
- `missingInputs`
- `readinessStatus`
- `agentStatus`
- `canvasStatus`
- `timelineStatus`
- `canvasSummary`

该 DTO 由 Story Extension 聚合，不由 Webview 推导。Webview 只渲染和发送动作。

原因：

- Extension Host 能安全调用 `neko.assets`、`neko.canvas`、`neko.agent`。
- 方便单元测试 readiness 规则。
- 避免 Webview 持有跨扩展调用逻辑。

备选方案：继续把 `ScriptIndex + sceneStates + characterThumbnails` 分散传给 Webview。拒绝，因为 UI 需要猜测状态含义，后续难以扩展缺失项和下游进度。

### Decision 3: 人物形象状态按角色身份建模，而不是按图片 URL 建模

`StoryCharacterVisualReadiness` 以角色名和可选 `characterId` 为主键，状态来自角色注册表、资产绑定和缩略图解析。缩略图只是状态证据之一，不是状态本身。

建议状态：

- `bound`: 已解析到角色记录且有可用视觉资产。
- `generated`: 有生成资产或缩略图，但身份绑定可能需要确认。
- `missing`: 角色已识别，但没有可用视觉资产。
- `unresolved`: 剧本中出现角色名，但无法解析到角色注册表。
- `unknown`: 没有足够信息判断。
- `stale`: 角色视觉资产存在但被标记为过期或与当前角色记录版本不一致。

原因：

- 创作者真正关心的是“人物形象是否能被生成链路稳定引用”，不是“有没有一个小图”。
- 后续可以接入 `characterId`、`assetEntityId`、GalleryNode、GeneratedAsset，而不用改 UI 语义。

备选方案：继续通过 `thumbnailUri` 是否存在判断。拒绝，因为没有缩略图不一定没有角色，没有绑定也可能有临时生成图。

### Decision 4: 叙事文本角色识别优先使用角色注册表词表

Story readiness 的角色识别分两层：

1. 保留 Fountain `character` 元素提取，作为结构化剧本标准路径。
2. 对 action/叙事文本使用 `characters.json` 中 canonical name、display name、alias、scriptName 的词表做保守匹配。

匹配结果必须标记来源，例如 `dialogue-character`、`registry-mention`、`manual`，避免把普通名词误识别成角色。

原因：

- 中文儿童故事、短视频脚本和普通叙事剧本经常把角色写在动作段落里。
- 使用项目角色注册表比纯 NLP/正则更可控、更可测试。

备选方案：完全依赖 LLM 抽取角色。拒绝作为 P0，因为成本、可重复性和离线测试都不如注册表匹配。

### Decision 5: Canvas 提供 scene/shot execution summary，而不是暴露内部节点树

新增 `CanvasStoryboardExecutionSummary` 或等价 API/命令，输出稳定摘要：

- `sourceScriptUri`
- `sceneId`
- `sceneNodeId`
- `shotCount`
- `generatedShotCount`
- `failedShotCount`
- `selectedThumbnailUri`
- `shots[]`

每个 shot 摘要包含 `shotId`、`shotNumber`、`duration`、`generationStatus`、`selectedAssetRef`、`thumbnailRef`、`timelineImportStatus` 等稳定字段。

原因：

- Story 只需要展示 Canvas 进度和跳转入口，不应理解 Canvas 的 `content`、`container`、`generationHistory` 内部结构。
- Agent 需要结构化上下文，但不应依赖 Webview 的渲染状态。

备选方案：Story 调 `canvas.nodes.list()` 后自行筛选 Scene/Shot/Gallery。拒绝，因为这会把 Canvas 内部存储耦合到 Story。

### Decision 6: Story 到 Agent 的上下文升级为可携带视觉引用

`characterSendToAgent` 和 scene-level action 的 payload 增加可选视觉引用摘要：

- `characterId`
- `assetEntityIds`
- `thumbnailPath` 或安全的 asset reference
- `sourceScriptUri`
- `sceneId`
- `readinessStatus`
- `missingInputs`

图片本体不直接塞入消息；Agent 需要大图时通过资产引用或后续工具读取。

原因：

- 保持消息轻量，避免把大图/二进制放进聊天上下文。
- 让 Agent 明确知道缺的是“角色视觉资产”还是“剧本角色身份”。

备选方案：发送 base64 缩略图到 Agent。拒绝，因为缩略图只适合预览，不适合作为稳定资产引用。

## Risks / Trade-offs

- [Risk] 中文叙事角色匹配误报普通词语 → Mitigation: P0 仅匹配角色注册表词表，记录匹配来源，并在 UI 上展示“需确认”状态。
- [Risk] Story readiness 聚合需要调用 assets/canvas，多扩展不可用时状态不稳定 → Mitigation: 每个外部来源都降级为 `unknown` 或 `not-available`，表格仍可基于剧本事实工作。
- [Risk] Canvas summary 与现有节点字段重复 → Mitigation: summary 是只读投影，不成为新的持久事实源。
- [Risk] 状态字段过多导致 Story 表拥挤 → Mitigation: 表格只展示摘要状态，详情通过 hover/popover 或 inspector 展开。
- [Risk] 角色视觉状态和资产 registry 版本暂不完整 → Mitigation: P0 先支持 `characterId + assetEntityId + thumbnail`，`stale` 作为可选扩展状态。
- [Risk] Agent payload 变更影响旧消费者 → Mitigation: 新字段全部可选，保留现有 `story-selection` / `canvas-node` payload 基础结构。

## Migration Plan

1. 在 `packages/neko-types` 新增 readiness 和 execution summary 类型，字段全部向后兼容可选。
2. 在 Story Extension 聚合 `StorySceneVideoReadiness`，初期由 `ScriptIndex`、`StorySceneStateStore`、角色注册表和 `neko.assets.getCharacterThumbnail` 组成。
3. Webview `ScriptTableView` 从旧输入平滑迁移到 readiness 输入；保留旧字段兼容测试直到 UI 完成切换。
4. 在 Canvas Extension 增加只读 execution summary API/命令，内部使用 container helpers 和 ShotNode 数据投影。
5. Story 读取 Canvas summary 后只更新展示状态和跳转绑定，不写回 Canvas 内部数据。
6. 扩展 Agent payload 的 `data` 字段，旧消费者忽略未知字段。
7. 补单元测试覆盖角色识别、readiness 聚合、Canvas summary 投影和 Webview 行渲染。

Rollback strategy: 新 DTO 和 payload 字段为可选；如果 Canvas summary 不可用，Story 表退回现有 `sceneStates + characterThumbnails` 渲染，不影响现有剧本预览、发送 Canvas 和生成命令。

## Open Questions

- `stale` 状态首版是否需要依赖角色记录 revision，还是先保留枚举但不产生该状态？
- Canvas summary 是否暴露为 `NekoCanvasAPI.storyboard.getExecutionSummary()`，还是先以命令形式实现再升级 API？
- Story UI 是否需要专门的“准备度详情面板”，还是首版只在行内状态和 hover 中展示缺失项？
