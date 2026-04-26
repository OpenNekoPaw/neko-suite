# neko-agent 对音视频创作需求与跨子包 AI 能力接入的分析

**状态**: 分析文档  
**日期**: 2026-04-08  
**范围**: `packages/neko-agent` 及其与 `neko-cut`、`neko-canvas`、`neko-story`、`neko-sketch`、`neko-puppet`、`neko-audio` 等子包的 AI 集成边界

---

## 执行摘要

### 当前满足度结论

- `neko-agent` 已满足“AI 辅助音视频创作编排层 / 中台”的核心需求。
- `neko-agent` 还不满足“独立承担完整音视频创作工作站”的要求。
- 综合判断：
  - 作为 **AI 创作编排层**：**7/10**
  - 作为 **独立音视频创作工作站**：**4/10**

### 架构结论

对于其他子包新增的 AI 能力，**不应默认都塞进 Skill，也不应默认都走 MCP**。正确做法是分层：

1. **通用模型型能力** 放在 `@neko/platform`
2. **第一方子包的本地能力** 通过 **插件注入为 Tool**
3. **多步工作流与用户交互模板** 通过 **Skill 编排**
4. **外部系统 / 第三方服务 / 团队自定义能力** 通过 **MCP 接入**

### 维护性结论

- **会增加维护难度**，前提是每次都要在 `neko-agent` 里手工新增一组 `createXxxTools()`、同步 Skill 名称、再补 UI/路由约定。
- 如果改成“**子包拥有能力实现，neko-agent 只负责发现、注册、编排**”，维护成本会显著下降。
- 当前 `packages/neko-agent/packages/extension/src/index.ts` 的集中式手工注册方式，已经开始暴露扩展性与命名一致性风险。

---

## 评估范围与方法

本分析基于以下维度：

- 能力入口：Tool / Skill / Pipeline / MCP / 平台媒体服务
- 创作链路：文档理解、分镜拆解、媒体生成、质量评估、时间线落地、跨插件传递
- 扩展方式：新增子包、新增 AI 能力、新增外部服务时的接入成本
- 维护成本：命名契约、注册点数量、耦合方向、是否需要反复修改 `neko-agent`

主要依据文件包括：

- `packages/neko-agent/packages/platform/src/index.ts`
- `packages/neko-agent/packages/platform/src/media/media-agent-tools.ts`
- `packages/neko-agent/packages/platform/src/media/routing/media-routing-manager.ts`
- `packages/neko-agent/packages/platform/src/config/default-config.ts`
- `packages/neko-agent/packages/extension/src/index.ts`
- `packages/neko-agent/packages/extension/src/tools/extensionTools.ts`
- `packages/neko-agent/packages/extension/src/tools/qualityCheckTools.ts`
- `packages/neko-agent/packages/extension/src/pipeline/pipeline-bootstrap.ts`
- `packages/neko-agent/packages/extension/src/pipeline/pipeline-adapters.ts`
- `packages/neko-agent/packages/extension/src/chat/message/agentStreamProcessor.ts`
- `packages/neko-agent/packages/extension/src/chat/message/attachmentProcessor.ts`
- `packages/neko-agent/packages/extension/src/chat/message/mediaPreprocessor.ts`
- `packages/neko-agent/packages/agent/src/pipeline/pipeline-registry.ts`
- `packages/neko-agent/packages/agent/src/pipeline/stages/*.ts`
- `packages/neko-agent/packages/agent/src/skill/builtins/index.ts`
- `packages/neko-agent/packages/agent/src/tools/tool-injection-manager.ts`
- `packages/neko-agent/packages/agent/src/mcp/mcp-tool.ts`
- `docs/architecture/agent-media-architecture.md`
- `docs/architecture/agent-unified-workflow.md`
- `docs/architecture/agent-media-architecture.md`
- `docs/architecture/extension-pack-strategy.md`

---

## 一、对音视频创作需求的满足度

### 满足度总表

| 维度 | 满足度 | 判断 |
|------|--------|------|
| 前期策划：文档/剧本理解、分镜拆解 | 8/10 | 已具备较强基础 |
| 中期生成：图像/视频/音乐/TTS | 7/10 | 已可用，但依赖模型配置 |
| 后期落地：时间线回填、素材归档、跨插件传递 | 6/10 | 主链路较完整，Pipeline 链路仍有不一致 |
| 质量评估：图片、视频、音频质检 | 5/10 | 设计有能力，音视频接线不足 |
| 独立工作站能力 | 4/10 | 仍依赖 `neko-cut` / `neko-canvas` / 其他子包 |
| 作为 AI 创作编排层 | 7/10 | 适合做 Suite 的 AI 中台 |

### 已满足或较强的部分

#### 1. 已具备通用媒体生成工具层

`@neko/platform` 会在创建平台时将 `GenerateImage`、`GenerateVideo`、`GenerateMusic`、`GenerateTTS` 等工具注册到 Agent ToolRegistry，这说明图像、视频、音乐、语音生成被设计成平台级通用能力，而不是某个单独子包私有能力。

依据：

- `packages/neko-agent/packages/platform/src/index.ts`
- `packages/neko-agent/packages/platform/src/media/media-agent-tools.ts`

#### 2. 已具备音视频创作 Pipeline 骨架

现有 Pipeline 已覆盖“读文档/剧本 → 解析分镜 → 生成提示词 → 试拍 → 批量生成 → 质检 → 落时间线”的主干链路，说明 `neko-agent` 不只是聊天入口，而是已经承担编排职责。

依据：

- `packages/neko-agent/packages/agent/src/pipeline/pipeline-registry.ts`
- `packages/neko-agent/packages/extension/src/pipeline/pipeline-bootstrap.ts`

#### 3. 已具备较强的创作输入理解能力

文档读取覆盖 `.md/.txt/.fountain/.pdf/.docx/.pptx`，其中结构化文本和剧本类输入已经可以进入 Pipeline 上下文。

依据：

- `packages/neko-agent/packages/agent/src/pipeline/stages/read-document.ts`
- `packages/neko-agent/packages/extension/src/services/DocumentReaderService.ts`

#### 4. 已具备后台任务、落盘、资产索引和富媒体回显

聊天主链路中，生成任务会异步执行，完成后自动保存到工作区 `.neko/generated`，并写入资产索引，Webview 侧还能直接展示图片、视频、音频结果。这是“创作中台”成立的关键。

依据：

- `packages/neko-agent/packages/extension/src/chat/message/agentStreamProcessor.ts`
- `packages/neko-agent/packages/webview/src/components/ChatView/RichContent/renderers/StoryboardRenderer.tsx`
- `packages/neko-agent/packages/webview/src/components/ChatView/RichContent/renderers/VideoRenderer.tsx`
- `packages/neko-agent/packages/webview/src/components/ChatView/RichContent/renderers/AudioRenderer.tsx`

#### 5. 已具备跨插件桥接能力

`neko-agent` 已经桥接 `neko-cut`、`neko-canvas`、`neko-story`、`neko-sketch`、`neko-puppet`、转写与特效相关能力。当前模式是通过扩展层工具适配器把其他子包的 API 暴露给 Agent。

依据：

- `packages/neko-agent/packages/extension/src/index.ts`
- `packages/neko-agent/packages/extension/src/tools/extensionTools.ts`
- `packages/neko-agent/packages/extension/src/tools/puppetFaceTools.ts`

### 关键缺口

#### 1. Pipeline 合约仍存在不一致

虽然 Flow 定义完整，但部分 Stage 的输入前提并不总是与 Flow 定义严格匹配。例如：

- `generatePrompts` 强依赖 `ctx.scenes`
- `arrangeOnTimeline` 强依赖 `ctx.generatedPaths`
- 而不同 Flow 对 `readDocument`、`parseStoryboard`、`batchGenerate` 的前置组合并未完全被契约化约束

这意味着“设计上可组合”不等于“运行上稳定可组合”。

依据：

- `packages/neko-agent/packages/agent/src/pipeline/pipeline-registry.ts`
- `packages/neko-agent/packages/agent/src/pipeline/stages/generate-prompts.ts`
- `packages/neko-agent/packages/agent/src/pipeline/stages/arrange-on-timeline.ts`
- `packages/neko-agent/packages/agent/src/pipeline/stages/read-document.ts`
- `packages/neko-agent/packages/agent/src/pipeline/stages/parse-storyboard.ts`

#### 2. Pipeline 媒体落地链路弱于聊天主链路

聊天主链路会在任务完成后统一保存输出、建立资产对象、注册索引；但 Pipeline 中的 `MediaGeneratorAdapter` 直接把 `output.url` 当作素材路径返回，缺少统一的“下载到本地 + 资产索引 + 元数据归档”步骤。

这会导致 Pipeline 输出在稳定性、后续跨插件消费、离线可用性上弱于聊天主链路。

依据：

- `packages/neko-agent/packages/extension/src/pipeline/pipeline-bootstrap.ts`
- `packages/neko-agent/packages/extension/src/pipeline/pipeline-adapters.ts`
- `packages/neko-agent/packages/extension/src/chat/message/agentStreamProcessor.ts`

#### 3. 质量评估更接近“图片优先”

`qualityCheckTools` 设计上支持 `audioAnalyzer`、`frameExtractor`、`clipScorer` 等依赖，但在 Pipeline 启动阶段没有完整注入，导致运行时更像是视觉评估优先，而非完整音视频质检。

依据：

- `packages/neko-agent/packages/extension/src/tools/qualityCheckTools.ts`
- `packages/neko-agent/packages/agent/src/validation/consistency-evaluator.ts`
- `packages/neko-agent/packages/extension/src/pipeline/pipeline-bootstrap.ts`

#### 4. Skill 与实际 Tool 命名存在漂移

内置 Skill 中仍有 `ListElements`、`AddElement`、`AddTrack` 之类命名，而扩展层已注册的是 `ListTimelineElements`、`AddTimelineElement` 等名称。这会直接影响 Agent 自动编排的可靠性。

依据：

- `packages/neko-agent/packages/agent/src/skill/builtins/index.ts`
- `packages/neko-agent/packages/extension/src/tools/extensionTools.ts`

#### 5. 默认配置不是开箱即用的媒体创作配置

默认配置只提供了 LLM Provider / Model，没有默认媒体模型；而路由器要求显式模型或 `defaultMediaModels`。这意味着“用户进入 Agent 就能直接做稳定媒体创作”并不成立。

依据：

- `packages/neko-agent/packages/platform/src/config/default-config.ts`
- `packages/neko-agent/packages/platform/src/media/routing/media-routing-manager.ts`

#### 6. 多模态输入理解仍偏图片优先

附件处理链路中，音频和视频更多被作为引用文本进入上下文，而不是被系统性转成“可分析媒体对象”。这让 `neko-agent` 更像“多媒体生成入口”，而不是成熟的“多模态创作理解中台”。

依据：

- `packages/neko-agent/packages/extension/src/chat/message/attachmentProcessor.ts`
- `packages/neko-agent/packages/extension/src/chat/message/mediaPreprocessor.ts`

### 总体判断

`neko-agent` 的最佳定位不是替代 `neko-cut`、`neko-canvas`、`neko-audio` 的专业编辑器，而是：

- 统一 AI 入口
- 创作流程编排层
- 跨插件桥接层
- 多模型 / 多工具 / 多来源能力中台

---

## 二、其他子包新增 AI 能力时，应该怎么接入

### 先给结论

**不是在 `Skill / MCP / 插件注入` 三者中硬选一个，而是要先判断能力属于哪一层。**

### 推荐分层

| 层 | 适用能力 | 推荐机制 | 原因 |
|----|----------|----------|------|
| 平台层 | 通用模型调用、跨场景媒体生成 | `@neko/platform` | 这是“模型能力”，不是“业务插件能力” |
| 子包能力层 | `neko-cut`、`neko-story`、`neko-sketch`、`neko-puppet`、`neko-audio` 等本地上下文能力 | 插件注入为 Tool | 需要访问本地项目状态、编辑器状态、Extension API |
| 编排层 | 多步工作流、用户指令模板、技能入口 | Skill | 这是“怎么用能力”，不是“提供能力” |
| 外部扩展层 | ComfyUI、自建服务、第三方企业服务 | MCP | 这是“外部能力接入”，不是 monorepo 内部能力实现 |

### 四种方式的职责边界

#### 1. `@neko/platform`

适合放这里的能力：

- 文本转图像
- 文本转视频
- 文本转音乐
- TTS
- 跨多子包都能复用的媒体路由、任务管理、模型选择

不适合放这里的能力：

- 需要操作 `neko-cut` 时间线
- 需要读取 `neko-story` 索引
- 需要操作 `neko-sketch` 图层或 `neko-puppet` 参数

判断标准：

- 如果核心问题是“调用哪个模型、如何调度、如何保存生成任务”，放 `platform`
- 如果核心问题是“操作哪个编辑器、哪个工程对象、哪个子包状态”，不要放 `platform`

#### 2. 插件注入为 Tool

这是 **第一方子包新增 AI 能力的主通道**。

适合放这里的能力：

- `neko-audio` 的降噪、配音修复、节拍分析、自动切段、自动混音建议
- `neko-cut` 的镜头检测、自动加字幕、智能节奏剪辑、语义对齐
- `neko-story` 的角色线索抽取、剧情节奏分析、剧本结构诊断
- `neko-sketch` 的局部重绘、风格迁移、分层生成
- `neko-puppet` 的表情参数生成、从图片映射表情参数

当前仓库已经大量采用这种模式：

- 在 `packages/neko-agent/packages/extension/src/index.ts` 中集中注册
- 通过 `createNekoCutTools()`、`createNekoCanvasTools()`、`createNekoStoryTools()`、`createNekoSketchTools()`、`createPuppetFaceTools()` 将其他扩展 API 桥接为 Agent Tool

优点：

- 能利用本地上下文、项目状态、选区、编辑器能力
- 能优雅降级，子包未安装时直接跳过注册
- 能保持业务逻辑仍由子包自己掌控

缺点：

- 目前还是 **集中式手工注册**
- 新增子包或新能力时，经常还要改 `neko-agent` 的入口代码

#### 3. Skill

Skill 适合做：

- 用户入口
- 工作流模板
- Prompt 组织
- Tool 白名单和组合调用策略

Skill **不适合** 承担：

- 新能力的底层实现
- 本地状态访问
- 跨插件 API 实现
- 复杂依赖注入

简化判断：

- 如果底层 Tool 已经存在，只是想把它包装成“剧本转视频”“自动配乐”“失败重试”这类用户能力，就用 Skill
- 如果底层 Tool 根本不存在，Skill 不是首选实现方式

#### 4. MCP

MCP 适合：

- 外部团队维护的能力
- 第三方工作流系统
- ComfyUI / 自建生成服务 / 企业内部 AI 中台
- 不想并入 monorepo 的能力

MCP 不适合：

- 访问本地 VSCode 编辑器状态
- 直接操作 `neko-cut` / `neko-story` / `neko-sketch` 内部对象
- 需要强依赖本地工程上下文的第一方能力

当前实现也证明了这一点：

- `MCPManager` 负责连接和注册外部工具
- `MCPTool` 将外部工具包装成 `mcp__${serverId}__${toolName}`

依据：

- `packages/neko-agent/packages/extension/src/bootstrap/serviceBootstrap.ts`
- `packages/neko-agent/packages/agent/src/mcp/mcp-tool.ts`

### 最推荐的决策顺序

新增 AI 能力时，建议按以下顺序判断：

1. **它是不是通用模型能力？**
   - 是：进 `@neko/platform`
2. **它是不是第一方子包的本地业务能力？**
   - 是：以插件 Tool 方式注入
3. **它是不是已有 Tool 的流程封装？**
   - 是：做 Skill
4. **它是不是外部系统或第三方能力？**
   - 是：走 MCP

这四层可以叠加，而不是互斥。

典型例子：

- “自动配乐”：
  - 音乐生成本身在 `platform`
  - 时间线分析和落音轨通过 `neko-cut` Tool
  - 用户入口用 Skill
- “ComfyUI 工作流生图”：
  - 不进 `platform`
  - 不写死在 `neko-agent`
  - 直接走 MCP
- “`neko-audio` 的自动降噪”：
  - 如果是本地音频工程能力，应由 `neko-audio` 提供 API，再由 Agent 注入 Tool

---

## 三、每次在 `neko-agent` 添加代码，是否会增加维护难度

### 会，但要看加在什么位置

#### 低风险

- 新增一个 Skill，复用已有 Tool
- 新增一个 MCP 服务器配置
- 在 `@neko/platform` 增加一个通用媒体 Provider 适配器

#### 高风险

- 在 `packages/neko-agent/packages/extension/src/index.ts` 继续堆积手工注册逻辑
- 在 `packages/neko-agent/packages/agent/src/skill/builtins/index.ts` 手工维护越来越多的 Tool 名称和流程说明
- 在 Pipeline 中继续写死子包专属业务逻辑

### 当前维护风险已经出现

当前第一方能力注册方式大致是：

1. 在 `neko-agent/extension` 里新增 `createXxxTools()`
2. 在 `registerExtensionTools()` 中手工导入并注册
3. 再去 Skill 里同步工具名
4. 再去 UI 层同步 Slash Command / Rich Content / 交互细节

这种方式的问题是：

- 注册点集中，入口文件会不断变大
- Tool 名称和 Skill 文案容易漂移
- 新子包接入需要跨多个目录修改
- `neko-agent` 会逐渐知道太多子包细节

### 正确目标

`neko-agent` 应该维护：

- Tool 注册协议
- Skill 编排系统
- MCP 接入系统
- Pipeline 编排抽象
- 权限 / 上下文 / 任务 / 路由

而不应该维护：

- 各子包内部 AI 业务细节
- 各子包的参数语义细节
- 各子包的本地状态变更实现

---

## 四、推荐的后续架构：能力提供者协议

### 核心建议

为了避免“每增加一个子包 / 每新增一个 AI 功能，都要手改 `neko-agent`”，建议引入 **Agent 能力提供者协议**。

### 建议的职责分配

#### 子包负责

- 定义自己的领域 API
- 提供自己的 Agent 能力适配器
- 维护自己的 Tool 名称、参数、语义
- 可选提供自己的 Skill 模板

#### `neko-agent` 负责

- 发现已安装子包是否实现了 Agent Capability Provider
- 统一注册 Tool / Skill / ToolGroup
- 做权限、注入、上下文、MCP、任务、UI 编排

### 建议的协议形态

可以在共享层定义类似接口：

```ts
interface AgentCapabilityProvider {
  id: string;
  version: string;
  getAgentTools(context: AgentCapabilityContext): Tool[];
  getAgentSkills?(): Skill[];
  getToolGroups?(): ToolGroupDefinition[];
}
```

然后由各子包通过自己的扩展导出实现，例如：

- `neko-story` 导出“剧本理解能力提供者”
- `neko-audio` 导出“音频分析与修复能力提供者”
- `neko-sketch` 导出“图像生成与编辑能力提供者”
- `neko-puppet` 导出“角色参数生成能力提供者”

这样 `neko-agent` 就不需要再在入口里一项项手工 import `createNekoStoryTools`、`createNekoSketchTools`、`createPuppetFaceTools`。

### 这个方案的直接收益

- 新能力变成“子包内增量”，而不是“修改 `neko-agent` 主入口”
- 领域知识留在领域子包
- Tool 命名和实现更一致
- 子包可以独立演进、独立测试
- 后续市场化分发也更自然，`neko-market` 可以分发 Skill / Provider / 模型配置

---

## 五、后续是否还会有新增子包 / 新增 AI 功能

### 判断：高概率会持续增加

依据不是猜测，而是现有结构已经显示出这种趋势。

#### 1. 产品打包策略已经按场景分层

`docs/architecture/extension-pack-strategy.md` 明确了：

- `neko-suite-video`
- `neko-suite-2d`
- `neko-suite-audio`
- 全量包 `neko-suite`

这意味着 `neko-agent` 天然要面对多个场景子包不断扩展 AI 能力，而不是一次性固定功能集。

#### 2. 仓库内现有子包已经很多

当前仓库已有：

- `neko-audio`
- `neko-cut`
- `neko-canvas`
- `neko-story`
- `neko-sketch`
- `neko-puppet`
- `neko-live`
- `neko-model`
- `neko-assets`

其中一部分已经接入 Agent，一部分还没有完全接入。

#### 3. AI 能力本身也还会继续增加

从当前实现和产品方向看，后续高概率新增的能力包括：

- 音频：降噪、母带处理、节奏分析、配音对齐、声纹相关能力
- 视频：镜头切分、节奏剪辑、自动字幕、片段筛选、质量复检
- 剧本：结构诊断、角色线追踪、节奏建议、自动改写
- 画布 / 绘图：局部重绘、风格扩散、图层理解、镜头草图生成
- 角色 / 直播：表情驱动、口型驱动、镜头调度、直播场景辅助

### 因此必须假设“AI 能力会持续增长”

如果架构仍然假设：

- 能力种类是固定的
- 子包数量不会继续增加
- 所有能力都能靠内置 Skill 解决

那么 `neko-agent` 的维护成本会持续上升。

---

## 六、推荐路线图

### P0 ✅ (2026-04-08 已实施)

#### 1. 引入第一方能力提供者协议 ✅

目标：

- 让子包自带 Tool / Skill 提供者
- `neko-agent` 只做发现和注册

已实施：

- `AgentCapabilityProvider` 协议定义在 `packages/neko-types/src/types/agent-capability.ts`
- `CapabilityDiscoveryService` 混合发现（manifest 静态声明 + Command 动态注册）在 `packages/neko-agent/packages/extension/src/services/capabilityDiscoveryService.ts`
- neko-cut 示范迁移：`packages/neko-cut/packages/extension/src/agentCapabilityProvider.ts`
- 所有域工具已迁移至各自子包，`registerExtensionTools()` 仅保留 SkillProvider 元工具

#### 2. 统一 Tool 命名契约 ✅

目标：

- 解决内置 Skill 与扩展 Tool 的命名漂移
- 让 Tool 名称成为稳定契约，而不是文案

已实施：

- `TOOL_NAMES` 常量注册表在 `packages/neko-types/src/types/tool-names.ts`（44 个 Tool，11 个分类）
- 所有 Builtin Skill 的 `allowedTools` 改用 `TOOL_NAMES_XXX.YYY` 常量引用
- 31 个不存在的 Tool 名已从 `allowedTools` 移除并标记 `TODO(P1)`
- `SkillService.apply()` 新增运行时校验，warn 级别日志报告引用未注册 Tool 的 Skill

#### 3. 拆分集中式注册入口 ✅

目标：

- 缩小 `packages/neko-agent/packages/extension/src/index.ts` 的耦合面
- 按能力域拆分注册和生命周期管理

已实施：

- Tool 注册逻辑提取到 `packages/neko-agent/packages/extension/src/bootstrap/toolBootstrap.ts`
- 能力发现初始化在 `packages/neko-agent/packages/extension/src/bootstrap/capabilityBootstrap.ts`
- `index.ts` 简化为纯编排入口

### P1 (部分已实施 2026-04-08)

#### 4. 统一 Pipeline 与聊天主链路的媒体落地流程

目标：

- Pipeline 输出统一走”保存到本地 + 资产索引 + 元数据对象”
- 避免出现一套链路稳定、一套链路仅返回 URL 的问题

状态：**未实施** — `MediaGeneratorAdapter` 仍直接返回远程 URL，缺少本地保存 + 资产索引步骤

#### 5. 补齐音频/视频质检依赖注入 ✅

目标：

- 让 `QualityCheck` 从”图片优先”升级为真正的音视频质检能力

已实施：

- `EngineAudioAnalyzerAdapter`（响度分析 + 静音检测）桥接 `EngineClient.analyzeLoudness/detectSilence`
- `EngineFrameExtractorAdapter`（帧提取 + 视频探测）桥接 `EngineClient.extractFrame/probe`
- `pipeline-bootstrap.ts` 注入 `audioAnalyzer` + `frameExtractor` 到 `createQualityCheckTools()`

#### 6. 提供默认媒体模型模板 ✅

目标：

- 降低媒体创作开箱门槛
- 减少”功能存在但默认不可用”的体验落差

已实施：

- `DEFAULT_MODELS` 新增 4 个媒体模型：DALL-E 3（image）、Sora（video）、TTS-1（audio）、Jukebox（music，默认禁用）
- `DEFAULT_USER_CONFIG.defaultMediaModels` 配置 image/video/audio 默认模型
- `media-routing-manager` 现在无需手动配置即可路由到默认媒体模型

### P2

#### 7. 能力市场化与版本化

目标：

- 让 Skill、Capability Provider、模型模板都能通过 `neko-market` 分发
- 支持按场景安装、按团队共享、按版本升级

#### 8. 建立能力清单与兼容矩阵

目标：

- 明确每个子包暴露了哪些 Tool / Skill / 依赖
- 明确哪些能力需要本地插件，哪些能力可以纯 MCP

---

## 七、最终结论

### 关于满足度

`neko-agent` 已经可以胜任 **Neko Suite 的 AI 创作编排中台**，尤其适合：

- 剧本驱动的 AIGC 视频草案生成
- 图像 / 视频 / 音乐 / TTS 的统一入口
- 任务后台化、资产回显与跨插件传递
- 以 Agent 为中心的跨工具创作流程

但它还不适合被定义为独立完整的音视频工作站，因为：

- 质量链路不够完整
- Pipeline 合约还不够稳
- 本地编辑能力主要仍落在其他子包

### 关于未来新增 AI 能力

最佳答案不是“都做成 Skill”或“都走 MCP”，而是：

- **通用模型能力进 `platform`**
- **第一方子包能力通过插件注入为 Tool**
- **Skill 负责工作流编排**
- **外部能力通过 MCP 接入**

### 关于维护成本

如果后续仍采用“每新增能力都手改 `neko-agent` 主入口”的方式，维护难度一定会上升。  
如果尽快引入“**子包自带 Agent Capability Provider，`neko-agent` 只负责发现、注册、编排**”的模式，那么 `neko-agent` 可以继续扩张能力面，而不会同步失控。
