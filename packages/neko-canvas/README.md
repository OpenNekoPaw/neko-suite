# NekoCanvas

> 无限画布编辑器：节点图编排、媒体资产管理、故事板、富文本、内联媒体播放

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host + Webview (React + DOM/SVG) 双进程

## Quick Reference

- **职责**：无限画布编辑、节点图编排、媒体资产预览、故事板管理
- **入口**：`packages/extension/src/extension.ts`
- **项目格式**：`.nkc`（JSON Visual Canvas）
- **Board 约定**：`neko/boards/*.nkc` 是普通 Canvas 文档，仅作为 Agent 默认检索/创建目录；不存在 Draft 格式、Board profile 或升级转换
- **子包**：`extension/`（Host）、`webview/`（React UI）
- **依赖**：`@neko/shared`
- **激活依赖**：neko-engine、neko-tools、neko-preview
- **节点类型（现有）**：Media / Storyboard / Annotation / Text / Artboard / Group / Shot / Scene / Gallery / Script / Document / Model / CanvasEmbed（13 种）
- **核心功能**：富文本编辑、分组管理、连接标签、图层面板、画板导出（PNG/SVG）、原地粘贴、分镜候选审阅、场景容器排序、输入引用节点投放
- **布局**：Webview 使用 Creative Workbench Shell：左侧 CanvasToolbar 承接 Pan/Add/Import/Undo/Redo 等全局画布工具，底部显隐组承接 HUD（MiniMap/ZoomControls）与右侧 NodeLibrary 显隐；FloatingPanelHost、PlaybackControllerHost、GenerationPromptPanel、ContentOverlay 保留为主面板控件或 overlay；NodeLibrary 作为右侧创建面板。
- **Basic 目录**：默认只展示 Media、Annotation、Group、Text、Artboard、Script、Document 等基础入口；Storyboard/Table/Scene/Shot/Gallery、timeline/workflow 和专业子系统入口仅在显式 Professional 路径出现。Basic 不改变 `.nkc` schema，也不隐藏文件中已有的专业节点。
- **基础展示**：基础内容节点按 descriptor 使用名称加内容的 low-chrome shell；专业节点保持 structured renderer。普通 Group 是半透明空间容器，真实后代继续使用绝对 Canvas 坐标。
- **状态显示**：subsystem summary 与 projection state 由 Extension 侧 CanvasStatusBar 显示，Webview 不再在无限画布左下角渲染状态徽章。
- **已落地 AI / 编排能力**：GenerationPromptPanel、BatchGenerationScheduler、ScriptNode TOC、Document/Model/CanvasEmbed 引用、`CanvasProjectAuthoringService` 无 UI `.nkc` 写入路径、`NekoCanvasAPI.importAsset()` 无 UI media 节点导入、`NekoCanvasAPI.storyboard.import()` 内部 API、Canvas Markdown lifecycle capability（`canvas.ingestMarkdown` review-only、`canvas.createStoryboardFromMarkdown` 生产 scene/shot 创建）、`NekoCanvasAPI.storyboard.getExecutionSummary()` 只读执行摘要

## Architecture

```
Extension Host
  ├── CanvasProjectAuthoringService → 无 UI 创建/修改 .nkc 生产事实
  ├── CanvasEditorProvider  → CustomEditorProvider（Webview 交互投影）
  └── AssetLibrary 视图

Webview (React + Vite)
  ├── InfiniteCanvas        → 无限画布（CSS Transform 平移/缩放）
  ├── NodeLayer             → DOM 节点渲染（13 种节点类型）
  ├── ConnectionLayer       → SVG 贝塞尔曲线连线 + 类型化端口
  ├── InlineMediaPlayer     → H.264+PCM 流式内联播放（WebCodecs）
  ├── ViewportCulling       → AABB 视口裁剪（仅渲染可见节点）
  ├── GenerationPromptPanel → 内嵌 AI 生图对话框（委托 neko-agent）
  └── Zustand Store         → 画布状态 + EditOperation 记录
```

### 包结构

```
packages/
├── extension/src/
│   ├── editor/     # CanvasEditorProvider
│   └── views/      # 资产库侧边栏
└── webview/src/
    ├── components/ # InfiniteCanvas + 节点组件
    ├── hooks/      # 交互 Hooks
    ├── stores/     # Zustand 状态
    └── services/   # postMessage 通信
```

### 技术栈

DOM / SVG / CSS Transform、Canvas 2D（媒体帧）、WebCodecs（H.264 解码）、React 18、Zustand、Tailwind CSS、Vite

### EditOperation 集成

Webview 端通过 `canvasOperationStore` 作为运行时桥接层生成 `EditOperation`，与现有快照式 undo/redo 并行：

- **操作类型**：`canvas.node.*`（节点 CRUD/移动/缩放/旋转/分组/重排）、`canvas.connection.*`（连接 CRUD）
- **Store**：`stores/canvasOperationStore.ts` — 运行时生成操作并同步到 Extension
- **canvasStore 集成**：节点与连接变更会调用 operation bridge 生成统一操作协议
- **Extension 同步**：`operationApplied` 消息 → CanvasEditorProvider dirty 事件

### 资产导入

| 方式 | 状态 | 说明 |
|------|------|------|
| Explorer 拖拽 | ✅ | `useDragDrop` → `project:addSource` → `dropAssets`（media/script/document/model/canvas） |
| 素材库拖拽 | ✅ | `application/json` 协议 → `project:addSource`，Extension Host 统一解析路径变量 |
| 工具栏文件选择器 | ✅ | `pickMedia` / `pickFile` 生成 `ProjectSourceAddRequest` 后再创建节点 |
| 引用节点选择器 | ✅ | `pickScriptDocument` / `pickReferenceDocument` / `pickModelReference` / `pickCanvasDocument` |
| 文档类型（ScriptNode 等）| ✅ | Explorer 拖入或工具栏选择均可创建 `ScriptNode` / `DocumentNode` / `ModelNode` / `CanvasEmbedNode` |

外部 `neko.canvas.importAsset` / `NekoCanvasAPI.importAsset()` 不再要求 Canvas Webview 已打开；它通过 `CanvasProjectAuthoringService` 创建 media 节点，只持久化 `${VAR}/path`、workspace-relative path、`ResourceRef` 或 `DocumentArchiveResourceRef`。Webview URI、blob、cache path 和 temp path 不能作为 `.nkc` 身份写入。

`NekoCanvasAPI.boards` 是 Agent 的公共 Board 路由边界：Canvas 拥有 `neko/boards/` 的安全索引、确定性解析和 revision-checked delivery。解析顺序为显式目标、有效会话绑定、唯一精确 scope 匹配、创建新 Board。Agent 不读取原始 `.nkc`，也不能退回活动/最近/专业目录 Canvas。Markdown 使用普通 Text/Markdown 内容；文件引用使用支持稳定 `ResourceRef` 的 DocumentNode；图片、音频和视频使用 MediaNode。所有重放按 provenance/artifact identity 幂等。

未提升生成媒体不会直接写入 Board，而由 Canvas Extension 投影成 runtime review Group。Save to Assets 通过 AssetLibrary/AssetStore 提升后，使用稳定 Asset identity 向冻结 Board revision 写入普通 Group 和 Asset-backed children；`.nkc` 不保存 runtime Group ID、generated-output ref、cache/render URI。`neko/generated/<kind>/` 仅保留历史读取与显式导入。

### 分镜系统（现状）

- **ShotNode**：单镜节点（景别/运镜/多角色/情绪/生图状态）
- **SceneGroupNode**：场景容器，支持镜头纳管、排序、自动布局、场景级批量生成
- **GalleryNode**：多视图画廊（三视图/四视图/九宫格/转面8方向），支持 cell 候选审阅
- **GenerationPromptPanel**：点击节点弹出，委托 `neko-agent.generateForNode`（ADR-2D-007）
- **BatchGenerationScheduler**：批量分镜生图队列（并发控制 + 进度回传）
- **候选审阅闭环**：ShotNode / GalleryCell 均支持 N/M 切换，并把筛选结果写回节点状态
- **cut 最小回流**：通过共享 `timelineSync` 契约仅回写 `lastImportedToTimeline*` 等操作元数据
- **asset 代理边界**：`NekoCanvasAPI.asset` 仅代理 `neko-assets` 的 `import/list/getById`，不作为资产事实源
- **执行摘要边界**：`storyboard.getExecutionSummary()` 与 `neko.canvas.getStoryboardExecutionSummary` 只投影 SceneGroup / ShotNode 的执行进度、选中资产引用、缩略图引用和 timeline import 元数据；它不是第二份 storyboard 数据源，也不暴露 Webview runtime URL、blob/data URL、播放状态或候选图墙 UI。

### Shot 创作 AI 按钮

Shot overlay 中的“优化提示词 / 生成图片 / 编辑图片 / 生成视频 / 编辑视频”是 Canvas creative AI action，不复用 `Send to Agent` 前台上下文交接，也不通过 Webview 直接调用 provider/model SDK。

- Webview 只发送 `canvasCreativeAiAction` / `canvasCreativeAiCandidateAction` typed message，并显示本地可判断的参数诊断、Agent 聚合进度和候选卡片。
- Extension Host 负责解析 `.nkc` 文档身份、shot/scene prompt document、source media、creative 参数、target/candidate refs、revision 和 idempotency，再调用 Agent 的 external creative invocation 命令。
- Agent 返回的提示词、图片、视频结果先写入 `node.data.creativeAiCandidates`。正式 `generatedAsset`、`generatedVideoAsset`、`imagePromptDocument` 或 `videoPromptDocument` 只有在用户接受或 judge 通过且 revision re-check 成功后才会更新。
- 候选卡片只展示 `ResourceRef`、generated asset id、workspace-relative path 或 `${VAR}/path` 等稳定身份摘要。Webview URI、blob/object URL、cache path、temp path 和 `dataUrl` 不能作为 durable result identity。
- 现有 `GenerationPromptPanel` / `generateForNode` / `generationProgress` 仍保留给未迁移的旧面板路径；Shot overlay AI 按钮的成功路径必须通过 typed creative action、Agent run/workItem 和 Canvas candidate apply。
