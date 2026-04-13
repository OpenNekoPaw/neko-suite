# 基于 Fountain 剧本的 Flow F 视频创作开发方案

## 状态

当前仓库已经具备“剧本 -> Pipeline -> 生成 -> 时间线”的基础骨架，但仍处于“主链已定义、局部能力已落地、端到端体验尚未完全收口”的阶段。

已确认的现状：

- `neko-story` 已提供 `neko.story.startVideoCreation` 命令，作为从剧本启动视频创作的入口。
- `neko-agent` 已注册 `flowF`，主链为：
  `parseStoryboard -> importStoryboardToCanvas -> generatePrompts -> generatePilot -> batchGenerate -> qualityGate -> arrangeOnTimeline`
- `parseStoryboard` 已支持优先走 `NekoStoryAPI.generateScenePlans()` / `getScriptIndex()` 的结构化路径。
- `canvas` 已支持 semantic storyboard 导入，但该阶段是可选增强，不应阻塞“剧本到视频”的主链。

本方案的目标，是把现有骨架整理成一条清晰、可验证、可迭代的正式开发路径。

---

## 1. 设计结论

### 1.1 总体结论

`fountain` 剧本生成视频时，不应走“整篇剧本直接压成一个大 prompt”的路径，而应走：

1. 读取剧本事实
2. 结构化理解剧本
3. 生成场景/镜头计划
4. 生成 prompt
5. 生成媒体
6. 编排到时间线

也就是说：

> Agent 既读取剧本内容，也生成提示词，但“读取剧本”和“生成提示词”是前后两层，而不是二选一。

### 1.2 为什么不能直接把剧本转成一个提示词

直接把全文剧本转换成一个 prompt 会带来四类问题：

- 丢失结构信息：场景边界、角色、对白、动作摘要、行号范围都会被压平。
- 无法稳定拆镜：一个 scene 应拆几镜、镜头顺序如何安排，本质上是语义决策，不是文本改写。
- 无法做确认门：用户无法在“结构层”和“prompt 层”分别审查与修改。
- 无法做局部重试：一个 scene 或 shot 失败时，只能粗暴重跑整条链路。

因此，prompt 应被视为结构化剧本数据的派生物，而不是剧本输入的唯一表示。

---

## 2. 范围与目标

本方案覆盖的主流程是：

`Fountain 剧本 -> Agent pipeline(flowF) -> 媒体生成 -> 时间线编排`

不在本次方案主范围内的内容：

- 剧本文本编辑器增强
- `canvas` 内全文剧本预览
- `cut` 的高级剪辑 UI
- 音频生成和配音专项链路

本次开发目标：

1. 打通从 `.fountain/.nks/.story` 到视频生成的标准主流程。
2. 优先使用 `neko-story` 的结构化能力，而不是重复解析剧本文本。
3. 让每个 stage 的输入输出明确、可测试、可重试。
4. 使 `canvas` 成为可选增强，而不是剧本到视频主链的强依赖。

---

## 3. 现有基础能力盘点

### 3.1 `neko-story`

已具备：

- `getScriptIndex(uriOrPath)`
- `generateScenePlans(uriOrPath, sceneIds?)`
- `generateShotPlan(uriOrPath, sceneId, recommendedShotCount?)`
- `neko.story.startVideoCreation`
- `ScriptTableView` 场景审阅表
- `StorySceneStateStore` 场景级状态持久化

说明：

- `neko-story` 已经是剧本事实源与 scene-level 审阅入口。
- 后续应继续由它维护 scene 状态和剧本侧回写，而不是把状态散落在 Agent 对话上下文里。

### 3.2 `neko-agent`

已具备：

- `flowF` pipeline 注册
- `parseStoryboard` stage
- `generatePrompts` stage
- `generatePilot` stage
- `batchGenerate` stage
- `qualityGate` stage
- `arrangeOnTimeline` stage
- `StructuredStoryPlannerAdapter`
- `CanvasStoryboardSinkAdapter`

说明：

- `agent` 已经是编排中心。
- 当前缺口主要在于“把结构化 scene/shot 真正稳定地接入所有 stage”，并补齐用户可感知的确认门和状态回写。

### 3.3 `neko-canvas`

已具备：

- semantic storyboard 导入能力
- `ScriptNode` 作为剧本引用节点
- `SceneGroupNode + ShotNode` 作为正式 storyboard 工作台

说明：

- `canvas` 是 storyboard 的正式视觉编辑器。
- 对视频主链来说，`canvas` 只能是增强项，不应成为主路径的硬前置条件。

---

## 4. 核心设计原则

在进入实现前，统一遵守以下原则：

### 4.1 事实源单一

- 剧本事实源只来自 `fountain` 文件和 `neko-story` 的结构化 API。
- 不在 `agent` 或 `canvas` 内复制维护另一套剧本真相。

### 4.2 Prompt 是派生层

- prompt 由 `ScenePlan / ShotPlan / ScriptIndex` 派生。
- 不允许把全文剧本字符串直接作为最终媒体生成 prompt。

### 4.3 结构优先，文本降级

- 能结构化时，优先使用 `getScriptIndex()` / `generateScenePlans()`。
- 仅在结构化能力 unavailable 时，才回退到 parser 或 LLM freeform 分析。

### 4.4 画布可选增强

- `importStoryboardToCanvas` 默认视为渐进增强。
- 没有 `canvas` 时，仍应能完成“剧本 -> prompts -> 生成 -> 时间线”的闭环。

### 4.5 可审查、可回退、可重试

- scene/shot 级别可审查 prompt。
- scene/shot 级别可局部重试。
- pipeline 状态能回写到 `story` 侧审阅表。

---

## 5. 推荐总体架构

### 5.1 主数据流

```text
用户在 neko-story 中选中当前剧本 / 当前场景
  -> 执行 neko.story.startVideoCreation
  -> neko-agent.startPipeline(flowF)
  -> parseStoryboard
       -> StructuredStoryPlannerAdapter
       -> NekoStoryAPI.generateScenePlans()
       -> NekoStoryAPI.getScriptIndex()
  -> generatePrompts
       -> 按 scene / shot 生成 prompt
  -> generatePilot
       -> 先生成一个样片供确认
  -> batchGenerate
       -> 批量生成所有 scene / shot 媒体
  -> qualityGate
       -> 质量与一致性检查
  -> arrangeOnTimeline
       -> 输出到 neko-cut 时间线
  -> 可选 importStoryboardToCanvas
       -> 导入 SceneGroupNode + ShotNode 到 canvas
```

### 5.2 stage 职责定义

#### `parseStoryboard`

输入：

- `source`
- `sourceFormat = 'fountain'`
- 可选 `sceneIds`

输出：

- `scenes: StoryboardScene[]`
- `scenePlans?: StoryScenePlan[]`

职责：

- 从剧本结构中提取 scene-level 输出。
- 在有 `shotPlans` 时把它们透传给后续 stage。

#### `generatePrompts`

输入：

- `scenes`
- `scenePlans / shotPlans`
- `globalStyle`

输出：

- 每个 scene/shot 的 `suggestedPrompt`

职责：

- 将结构化 scene/shot 信息转换为生成模型更适合消费的 prompt。
- 该 stage 不负责重新解释全文剧本。

#### `generatePilot`

输入：

- 已生成 prompt 的 `scenes`
- 可选 `sceneIndex`

输出：

- `pilotPath`
- `pilotSceneIndex`

职责：

- 低成本验证整体视觉风格，避免一上来就批量烧资源。

#### `batchGenerate`

输入：

- `scenes[].suggestedPrompt`
- `duration / resolution / style / aspectRatio`

输出：

- `generatedPaths`
- `taskIds`
- `failedScenes`

职责：

- 并发生成所有 scene/shot 媒体结果。
- 保留失败索引，支持后续局部重试。

#### `arrangeOnTimeline`

输入：

- `generatedPaths`
- `scenes[].estimatedDuration`

输出：

- `elementIds`
- `totalDuration`

职责：

- 将生成结果按顺序排列到时间线。
- 即使部分失败，也要保证时长推进逻辑一致。

---

## 6. 版本策略

### 6.1 MVP：Scene-first

先按场景生成视频，不立即上镜头级完整拆分。

特点：

- 每个 scene 生成一个 prompt
- 每个 scene 生成一个视频片段
- 时间线按 scene 顺序排列

优点：

- 最快打通 end-to-end 主链
- 交互简单，便于验证 prompt/生成/编排是否闭环
- 对现有 `PipelineContext.scenes` 兼容最好

限制：

- 细粒度不足
- 镜头语言表达受限
- scene 内部节奏仍偏粗糙

### 6.2 正式版：Shot-first

在 Scene-first 跑通后，升级到镜头级生成。

特点：

- 基于 `generateShotPlan()` 或 `scenePlans[].shotPlans`
- 每个 shot 拥有独立 prompt
- `canvas` 导入作为默认增强路径

优点：

- 更适合 storyboard 驱动的创作方式
- 更容易做风格一致性与局部重试
- 更适合接入 `ShotNode` / `SceneGroupNode`

限制：

- 复杂度显著提高
- 需要补齐 shot 级状态回写和 timeline 编排细节

建议：

> 第一阶段先交付 Scene-first，第二阶段再升级到 Shot-first。

---

## 7. 分阶段开发方案

## 7.1 阶段一：打通 Scene-first 主链

目标：

- 从 `.fountain` 启动 `flowF`
- scene 级 prompt 审查
- scene 级样片确认
- scene 级批量生成
- 时间线编排成功

### 任务 1：稳定结构化入口

涉及模块：

- `packages/neko-story/packages/extension/src/extension.ts`
- `packages/neko-story/packages/extension/src/services/WorkspaceIndexService.ts`
- `packages/neko-agent/packages/extension/src/pipeline/pipeline-adapters.ts`

要点：

- `startVideoCreation` 传递完整 `scriptPath`、`sceneId`、selection context。
- `StructuredStoryPlannerAdapter` 明确三层路径：
  - 优先 `generateScenePlans + getScriptIndex`
  - 其次 parser
  - 最后 LLM freeform fallback
- 对“脚本未索引”场景给出稳定错误，而不是沉默失败。

验收：

- 未打开剧本、已打开剧本、当前场景启动三种路径都能稳定得到 `scenes[]` 或明确错误。

### 任务 2：scene 级 prompt 生成

涉及模块：

- `packages/neko-agent/packages/agent/src/pipeline/stages/generate-prompts.ts`
- prompt optimizer 依赖实现

要点：

- prompt 输入必须来自结构化 scene：
  - `heading`
  - `description`
  - `dialogue`
  - `estimatedDuration`
  - 可选 `globalStyle`
- 对话内容不直接原样拼接，应做摘要和镜头化表达。
- prompt 输出保持 scene 粒度。

验收：

- 用户能在确认门前看到每个 scene 的 prompt 预览。

### 任务 3：样片确认与批量生成

涉及模块：

- `generate-pilot.ts`
- `batch-generate.ts`
- pipeline gate UI

要点：

- 默认先生成当前 scene 或第一个 scene 的样片。
- 样片通过后再进入 batch。
- `failedScenes` 可回写，后续支持局部 retry。

验收：

- 样片失败不应导致整个 pipeline 状态混乱。
- batch 部分失败时，成功场景仍可进入后续编排。

### 任务 4：时间线编排

涉及模块：

- `arrange-on-timeline.ts`
- cut timeline adapter

要点：

- scene 级结果按顺序加入 timeline。
- 空 path 的 scene 跳过媒体添加，但保留时长推进。
- 支持 `trackName / gap / transitions` 参数。

验收：

- scene 顺序与 timeline 顺序一致。
- 部分失败不会破坏整体时间轴顺序。

---

## 7.2 阶段二：补齐产品侧审阅与状态回写

目标：

- 让用户在 `story` 中看到“剧本 -> 生成 -> 时间线”的过程状态，而不是只在 agent chat 里看结果。

### 任务 1：扩展 `StorySceneStateStore`

涉及模块：

- `packages/neko-story/packages/extension/src/services/storySceneStateStore.ts`
- `packages/neko-story/packages/webview/src/types.ts`

建议新增状态维度：

- `pilotStatus`
- `generationStatus`
- `timelineStatus`
- `lastPipelineId`
- `lastError`

原则：

- 继续以 scene 为最小状态单元。
- 不把媒体结果路径塞进 `story` state store，只保存流程状态和必要绑定信息。

### 任务 2：增强 `ScriptTableView`

涉及模块：

- `packages/neko-story/packages/webview/src/components/ScriptTableView.tsx`

建议动作：

- 开始视频创作
- 仅生成当前场景
- 重试失败场景
- 发送到 Canvas
- 打开已绑定 Canvas 场景

建议状态展示：

- not-requested
- parsing
- prompt-review
- pilot-review
- generating
- timeline-arranged
- failed

验收：

- 用户无需翻 Agent 对话，就能知道每个 scene 当前处于哪一步。

---

## 7.3 阶段三：升级到 Shot-first 正式版

目标：

- 将 scene 级视频创作升级为镜头级 storyboard 驱动流程。

### 任务 1：将 `shotPlans` 作为一等输入

涉及模块：

- `pipeline-adapters.ts`
- `parse-storyboard.ts`
- pipeline types

要点：

- `StoryboardScene` 继续保留 scene 粒度摘要。
- 真正的生成单元改为 `shotPlans`。
- scene 作为组织容器，shot 作为生成任务单元。

### 任务 2：shot 级 prompt 生成

prompt 输入建议：

- `sceneTitle`
- `shot.visualDescription`
- `shot.dialogue`
- `shot.duration`
- `camera/scale`
- `character bindings`
- `globalStyle`

输出：

- 每个 shot 的独立 prompt

### 任务 3：默认启用 `importStoryboardToCanvas`

涉及模块：

- `import-storyboard-to-canvas.ts`
- `CanvasStoryboardSinkAdapter`
- `neko-canvas`

目标：

- 在 batchGenerate 前或后，把 semantic storyboard 导入到 `canvas`
- 用户可在 `canvas` 中继续细调 `ShotNode`

### 任务 4：shot 级 timeline 编排

目标：

- 时间线从“每 scene 一个片段”升级为“每 shot 一个片段”
- scene 级信息作为 group/marker 辅助存在

---

## 8. 模块级改动建议

### 8.1 `neko-story`

建议优先改动：

- `extension.ts`
- `StorySceneStateStore`
- `ScriptTableView`

职责：

- 作为剧本事实源和启动入口
- 作为 scene-level 流程审阅面板
- 维护稳定状态回写

### 8.2 `neko-agent`

建议优先改动：

- `pipeline-adapters.ts`
- `parse-storyboard.ts`
- `generate-prompts.ts`
- `generate-pilot.ts`
- `batch-generate.ts`
- `arrange-on-timeline.ts`
- gate 与 progress bridge

职责：

- 作为语义决策和 pipeline 编排中心
- 统一处理 fallback、确认门、局部重试、阶段事件

### 8.3 `neko-canvas`

建议优先改动：

- `import storyboard` 链路
- `ScriptNode` 状态表现
- `SceneGroupNode + ShotNode` 承接 semantic storyboard

职责：

- 作为 storyboard 的正式视觉工作台
- 不承担全文剧本阅读或编辑职责

---

## 9. 风险与对策

### 风险 1：ScriptIndex 未就绪导致 parse 阶段不稳定

对策：

- 在 `neko-story` 入口侧明确预热索引
- adapter 层做 parser fallback
- 用户层显示“未索引/未打开剧本”的显式错误

### 风险 2：Prompt 粒度过粗，生成结果不可控

对策：

- MVP 先接受 scene 粒度的粗糙性
- 尽快升级到 shot-first
- 保留 pilot gate 和 partial retry

### 风险 3：Canvas 成为主链硬依赖

对策：

- `importStoryboardToCanvas` 默认视为增强项
- 主链成功标准不能依赖 canvas 安装状态

### 风险 4：状态散落在多个包中，用户难以理解

对策：

- 统一以 `story` 的 scene table 作为流程状态主入口
- Agent chat 展示结果，但不作为唯一状态界面

---

## 10. 验收标准

满足以下条件，可认为该方案第一阶段完成：

1. 用户在 `.fountain` 当前场景执行“开始视频创作”，能成功进入 `flowF`。
2. `parseStoryboard` 能稳定产出 scene 级结构，而不是直接把全文剧本塞给 prompt stage。
3. 用户在 `generatePrompts` 前能看到 scene 级 prompt 审查入口。
4. `generatePilot` 能先产出单 scene 样片供确认。
5. `batchGenerate` 支持部分失败，失败场景可识别。
6. `arrangeOnTimeline` 能按 scene 顺序生成 timeline。
7. `canvas` 未安装时，主链仍可完成。
8. `story` 的 scene table 能显示主要阶段状态。

满足以下条件，可认为正式版完成：

1. 已从 scene-first 升级到 shot-first。
2. `shotPlans` 成为真正的生成单元。
3. `canvas` 可承接 semantic storyboard 并支持后续视觉修订。
4. timeline 编排按 shot 顺序进行。
5. quality gate 能做局部重试和一致性回路。

---

## 11. 推荐实施顺序

建议按以下顺序推进：

1. 稳定 `parseStoryboard` 结构化入口
2. 完成 scene-first 的 `generatePrompts -> generatePilot -> batchGenerate -> arrangeOnTimeline`
3. 补齐 `story` 侧状态回写与审阅 UI
4. 将 `canvas` 导入作为增强项接回主链
5. 升级到 shot-first
6. 引入 quality gate 的局部重试

---

## 12. 关联文档

- [story-agent-canvas-boundary.md](../architecture/story-agent-canvas-boundary.md)
- [agent-media-architecture.md](../architecture/agent-media-architecture.md)
- [ai-capabilities.md](../architecture/ai-capabilities.md)
- [canvas-agent-integration.md](../architecture/canvas-agent-integration.md)

---

## 13. 实施记录（2026-04-13）

### 阶段一：Scene-first 主链

| 任务 | 状态 | 改动 |
|------|------|------|
| estimatedDuration 规则估算 | ✅ | `scriptIndexBuilder.ts` 已有行数+对话加权规则；`storyScenePlanner.ts` 新增 `distributeDuration()` 按 scene duration 分配 shot 时长 |
| 模板+LLM 混合 Prompt | ✅ | `pipeline-adapters.ts` 新增 `buildTemplatePrompt()` 纯函数组装结构化 prompt，LLM 仅做风格润色，失败时返回模板 |
| parseStoryboard 错误处理 | ✅ | `StructuredStoryPlannerAdapter` 返回 `StructuredStoryPlanSkip { reason }` 区分三类失败（未安装/未索引/无场景）；stage 将 reason 追加到错误消息 |
| startVideoCreation 入口 | ✅ | 支持 `sceneId` / `sceneIds` / `mode: 'all'` 三种调用模式；新增 `buildSceneAgentPayloadBySceneId()` 供 ScriptTableView 使用 |

### 阶段二：状态回写与审阅 UI

| 任务 | 状态 | 改动 |
|------|------|------|
| StorySceneStateStore 扩展 | ✅ | `StoryAgentStatus` 从 5 种扩展到 11 种；新增 `generationStatus` / `timelineStatus` / `lastError`；`handlePipelineEvent` 细化到 `stage_start` / `gate_waiting` / `gate_confirmed` 级别 |
| webview 类型同步 | ✅ | `types.ts` 同步扩展；新增 3 个 `StorySceneAction`（startVideoCreation / generateCurrentScene / retryFailed） |
| ScriptTableView 增强 | ✅ | 新增 "开始创作" / "生成此场景" / "重试" 按钮（条件渲染）；新增 Generation 状态指示器；全部使用 i18n 键 |
| i18n | ✅ | en.ts / zh-cn.ts 各新增 9 个翻译键 |
| 事件桥接 | ✅ | 已有实现：`pipeline-progress-bridge.ts` → `neko.story.handlePipelineEvent` 命令 |

### 阶段三：Shot-first 升级

| 任务 | 状态 | 改动 |
|------|------|------|
| PipelineContext 类型 | ✅ | 新增 `generationUnit: 'scene' \| 'shot'`、`failedShots` 字段 |
| generationUnit 赋值链路 | ✅ | `neko.agent.startPipeline` 命令参数新增 `generationUnit`，透传到 PipelineContext；`createStoryPipelineParams` 同步支持 |
| generatePrompts shot 粒度 | ✅ | 新增 `IPromptOptimizer.optimizeShotPrompt()` 接口；`buildShotTemplatePrompt()` 纯函数；按 `ctx.generationUnit` 分支 |
| batchGenerate shot 粒度 | ✅ | Shot 模式下为每个 shot 创建独立 task（`scene-{i}-shot-{j}`）；独立 merge 逻辑 |
| arrangeOnTimeline shot 粒度 | ✅ | Shot 模式下每个 shot 独立上 timeline，scene heading 作为 trackName |
| qualityGate shot 粒度 | ✅ | 新增 `buildShotInputs()` 按 scene→shot 遍历构建输入，支持 `shotIndex` |
| importStoryboardToCanvas | ✅ | 无需改动 — `scenePlans[].shotPlans` 已自然传递 shot 数据 |

### 其他修复

| 项目 | 改动 |
|------|------|
| 类型常量修复 | `storyScenePlanner.ts`: `'eye_level'` → `'eye-level'`、`'push_in'` → `'dolly-in'`、`'WS'` → `'LS'` |
| workspaceRoot TS 错误 | `pipeline-adapters.ts`: import 改为 `@neko/shared/vscode/extension`（L1 层，支持 workspaceRoot 参数） |
| ScriptNode 自适应 | `ScriptNode.tsx`: 场景列表数量从硬编码 5 改为根据 `node.size.height` 动态计算 |
| 测试覆盖 | 新增 `promptTemplates.test.ts`（10 用例）；重写 `scriptTableView.test.tsx`（5 用例，修复预存失败）；更新 `storyScenePlanner.test.ts` / `storySceneStateStore.test.ts` |

### 测试结果

- neko-agent pipeline: 87/87 pass
- neko-story extension: 132/132 pass
- neko-story webview: 26/26 pass

---

## 结论

本方案采用“结构化剧本理解优先、prompt 派生、scene-first 起步、shot-first 收敛”的路线。

这样做的好处是：

- 符合当前仓库的职责边界
- 最大化复用现有 `neko-story` / `neko-agent` / `neko-canvas` 基础设施
- 可以先打通主链，再逐步升级精度
- 让用户在每个关键节点都可审查、可修改、可回退

最终目标不是“让模型直接从全文剧本胡乱发挥”，而是让剧本事实、语义规划、提示词生成、媒体生成和时间线编排形成一条可验证、可维护的标准生产链。
