# NekoCanvas

> 无限画布编辑器：节点图编排、媒体资产管理、故事板、富文本、内联媒体播放

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host + Webview (React + DOM/SVG) 双进程
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：无限画布编辑、节点图编排、媒体资产预览、故事板管理
- **入口**：`packages/extension/src/extension.ts`
- **项目格式**：`.nkc`（JSON Visual Canvas）
- **子包**：`extension/`（Host）、`webview/`（React UI）
- **依赖**：`@neko/shared`
- **激活依赖**：neko-engine、neko-tools、neko-preview
- **节点类型（现有）**：Media / Storyboard / Annotation / Text / Artboard / Group（6 种）
- **节点类型（规划）**：Shot / Scene / Gallery / Script / Document / Model / CanvasEmbed（+7 种）
- **核心功能**：富文本编辑、分组管理、连接标签、图层面板、画板导出（PNG/SVG）、原地粘贴
- **规划功能**：GenerationPromptPanel（内嵌 AI 生图，ADR-2D-007）、GalleryNode 角色多视图（三视图/九宫格）、分镜批量生图（BatchScheduler）、ScriptNode TOC 模式

## Architecture

```
Extension Host
  ├── CanvasEditorProvider  → CustomEditorProvider（.nkc 文件）
  └── AssetLibrary 视图

Webview (React + Vite)
  ├── InfiniteCanvas        → 无限画布（CSS Transform 平移/缩放）
  ├── NodeLayer             → DOM 节点渲染（6 种节点类型，规划 13 种）
  ├── ConnectionLayer       → SVG 贝塞尔曲线连线 + 类型化端口
  ├── InlineMediaPlayer     → H.264+PCM 流式内联播放（WebCodecs）
  ├── ViewportCulling       → AABB 视口裁剪（仅渲染可见节点）
  ├── GenerationPromptPanel → [规划] 内嵌 AI 生图对话框（委托 neko-agent）
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

Webview 端通过 `canvasOperationStore` 桥接层记录编辑操作，与现有快照式 undo/redo 并行：

- **操作类型**：`canvas.node.*`（节点 CRUD/移动/缩放/旋转/分组/重排）、`canvas.connection.*`（连接 CRUD）
- **Store**：`stores/canvasOperationStore.ts` — 记录操作 → postMessage 同步
- **canvasStore 集成**：14 个数据修改方法在执行后自动调用 operationStore 记录
- **Extension 同步**：`operationApplied` 消息 → CanvasEditorProvider dirty 事件

### 资产导入

| 方式 | 状态 | 说明 |
|------|------|------|
| Explorer 拖拽 | ✅ | `useDragDrop` → `resolveDroppedFiles` → `dropAssets`（media/script/document/model） |
| 素材库拖拽 | ✅ | `application/json` 协议，PathVariable 解析 |
| 工具栏文件选择器 | ✅ | `pickMedia` 已接通，图片/视频/音频可直接选入 |
| 文档类型（ScriptNode 等）| ✅ | Explorer 拖入可直接创建 `ScriptNode` / `DocumentNode` / `ModelNode` |

### 分镜系统（规划）

- **ShotNode**：单镜节点（景别/运镜/多角色/情绪/生图状态）
- **SceneGroupNode**：场景容器，shots 横向排列
- **GalleryNode**：多视图画廊（三视图/四视图/九宫格/转面8方向）
- **GenerationPromptPanel**：点击节点弹出，委托 `neko-agent.generateForNode`（ADR-2D-007）
- **BatchGenerationScheduler**：批量分镜生图队列（并发控制 + 进度回传）
