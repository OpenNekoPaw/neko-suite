# Agent Rich Content 跨组件投递分析

**状态**: 分析完成（待设计修复方案）
**日期**: 2026-05-07
**关联**: [agent-media-architecture.md](./agent-media-architecture.md) · [adr-agent-multimodal-perception.md](./adr-agent-multimodal-perception.md) · [canvas-agent-integration.md](./canvas-agent-integration.md)

---

## 1. 问题域

neko-agent webview 可以展示多模态 Rich Content（图片、视频、音频、分镜表格等），但这些内容**如何完整传递到 neko-canvas / neko-cut / neko-sketch 等组件**，现有协议存在多个断点。

本文分析已实现的投递链路、发现的 5 个结构性问题、以及修复方向。

---

## 2. neko-canvas 架构概览

### 2.1 双层架构

```
Extension Host (editor/canvasEditorProvider.ts)
  ├── CustomEditorProvider (.nkc 文件)
  ├── NekoCanvasAPI (导出给其他扩展)
  ├── BatchGenerationScheduler (图生成队列)
  └── AgentCapabilityProvider (12 个 MCP 工具)
         │
    postMessage (JSON, 零 base64)
         │
Webview (React 18 + Zustand)
  ├── InfiniteCanvas (无限画布)
  ├── 13 种节点类型
  ├── useVSCodeMessages (消息路由)
  └── canvasStore (Zustand 状态)
```

### 2.2 节点类型 (13 种)

定义位置：`packages/neko-types/src/types/canvas.ts`

| 类型 | 接口 | 用途 |
|------|------|------|
| `shot` | `ShotCanvasNode` | 分镜面板，含 generatedAsset / generationHistory |
| `scene` | `SceneGroupCanvasNode` | 场景语义容器（包裹多个 shot） |
| `gallery` | `GalleryCanvasNode` | 角色参考图（三视图/九表情/转面） |
| `media` | `MediaCanvasNode` | 视频/图片/音频文件引用 |
| `text` | `TextCanvasNode` | 富文本 markdown |
| `artboard` | `ArtboardCanvasNode` | 固定尺寸可导出区域 |
| `annotation` | `AnnotationCanvasNode` | 标注/批注 |
| `group` | `GroupCanvasNode` | 节点分组容器 |
| `storyboard` | `StoryboardCanvasNode` | 场景/分镜卡片 |
| `script` | `ScriptCanvasNode` | .nks/.fountain 剧本引用 |
| `document` | `DocumentCanvasNode` | PDF/DOCX/EPUB 缩略图预览 |
| `model` | `ModelCanvasNode` | AI 模型参考卡/工作流连接器 |
| `canvas-embed` | `CanvasEmbedCanvasNode` | 嵌套 .nkc 引用 |

### 2.3 Canvas 对外 API

位置：`packages/neko-canvas/packages/extension/src/api.ts`

```typescript
interface NekoCanvasAPI {
  asset:      { import, list, getById }
  canvas:     { create, addShape, updateShape, deleteShape }
  storyboard: { import(payload: CanvasStoryboardPayload) }
  nodes:      { list, get, update, create, generateImage, generateBatch,
                onSelectionChange }
  events:     { onDidChangeAssets, onDidChangeCanvas }
}
```

---

## 3. Agent Rich Content 系统

### 3.1 Registry Pattern (ADR-6 §6.2)

位置：`packages/neko-agent/packages/webview/src/components/ChatView/RichContent/`

```
RichContentRegistry (Singleton)
  register<T>(entry: RichContentRendererEntry<T>)
  get(kind: string) → entry | undefined
  has(kind: string) → boolean
```

零耦合：添加新 kind 无需修改 ToolCallDisplay。

### 3.2 已注册的 5 种 Built-in Kind

| Kind | 渲染器 | 数据形状 | 可用操作 |
|------|--------|----------|----------|
| `image` | `ImagePreview` | `{src, alt?, name?, localPath?}` | 点击打开 · SendToMenu · DnD |
| `image-grid` | `ImageGridCard` | `{urls[], localPaths?, name?}` | 每图点击/DnD · SendToMenu |
| `video` | `VideoCard` | `{src, poster?, title?, localPath?}` | 点击→neko-preview · SendToMenu |
| `audio` | `AudioCard` | `{src, title?, localPath?}` | 点击打开 · SendToMenu |
| `storyboard` | `StoryboardMessage` | `{scenes[], plugins?, onRegenerateScene?}` | 场景折叠 · 重新生成 · SendToMenu |

### 3.3 ContentBlockType 联合类型

位置：`packages/neko-agent/packages/agent-types/src/message.ts`

```typescript
type ContentBlockType =
  | 'thinking' | 'text' | 'tool_call'
  | 'code_diff' | 'plan' | 'composite';
```

`composite` 类型已定义（`CompositeTemplate = 'storyboard-table' | 'comparison' | 'gallery' | 'report'`），但尚无对应 Send-to 传输路径。

---

## 4. 已实现的 Send-to-X 投递链路

### 4.1 协议层次

```
Agent Webview               Extension Host                Target Extension
─────────────               ──────────────                ────────────────

SendToMenu 按钮
  │
  └─ VSCodeMessages.sendToPlugin(target, assetPath, mediaType)
       │
       └─ postMessage({ type: 'sendToPlugin', target, assetPath, mediaType })
             │
        fileAndPluginRoutes.ts
             │
        pluginTransferBridge.ts
             │
        buildRuntimePluginTransferPlan({ target, assetPath })
             │
       ┌─────┴───────────┬──────────────────┐
       │                 │                  │
  'canvas'          'cut'             'explorer'
       │                 │                  │
  neko.canvas.       neko.cut.         revealFileInOS
  importAsset        importGeneratedClip
       │                 │
  postImportAsset()   importToTimeline()
  { type: 'importGeneratedAsset', asset }
```

### 4.2 合约定义

位置：`packages/neko-agent/packages/agent-types/src/plugin-transfer-contract.ts`

```typescript
type PluginTransferTarget = 'canvas' | 'cut' | 'sketch' | 'explorer';

type PluginTransferMediaType = 'image' | 'video' | 'audio';

type PluginTransferCommandPlan =
  | { status: 'execute-command';
      command: 'neko.canvas.importAsset' | 'neko.cut.importGeneratedClip';
      payload: Record<string, string>; }
  | { status: 'reveal-file'; filePath: string; }
  | { status: 'unsupported'; target: string; };
```

### 4.3 PluginTransferBridge

位置：`packages/neko-agent/packages/extension/src/services/pluginTransferBridge.ts`

Extension-host 层桥接，调用 `buildRuntimePluginTransferPlan()` 并执行 VSCode command。零 base64 — 只传路径。

---

## 5. 已实现的跨扩展通信矩阵

| 源 → 目标 | 命令 | 传输内容 | 状态 |
|---|---|---|---|
| Agent → Canvas | `neko.canvas.importAsset` | `{path, type}` 单文件 | **webview 端丢失 (Problem A)** |
| Agent → Cut | `neko.cut.importGeneratedClip` | `{assetPath, duration?, trackIndex?}` | 已实现 |
| Agent → Explorer | `revealFileInOS` | 文件路径 | 已实现 |
| Canvas → Agent | `neko.agent.sendContext` | `AgentContextPayload` | 已实现 |
| Canvas → Agent | `neko.agent.buildPrompt` | prompt payload | 已实现 |
| Canvas → Agent | `neko.agent.getDndPayload` | DnD broker | 已实现 |
| Sketch → Canvas | `neko.canvas.updateNodeImage` | `{nodeId, imageData, cellId?}` | 已实现 |
| **Story → Canvas** | `neko.canvas.importStoryboard` | **`CanvasStoryboardPayload` 结构化** | 已实现 |
| Canvas → Agent | `registerCapabilities` | 12 个 MCP 工具 | 已实现 |
| Canvas → Cut | timeline sync | `CanvasTimelineSyncPayload` | 已实现 |

关键对比：**neko-story → canvas** 已有结构化导入协议（`CanvasStoryboardPayload` 包含 scenes / shots / characters），但 **agent → canvas** 只有扁平的 `{path, type}` 单文件路径。

---

## 6. 发现的 5 个结构性问题

### Problem A：Canvas Webview 缺少 `importGeneratedAsset` 消息处理

**严重程度**: P0 — Send-to-Canvas 功能实际上不工作

Extension 层 `canvasEditorProvider.ts:370` 发送：
```typescript
this.activeWebviewPanel.webview.postMessage({
  type: 'importGeneratedAsset',
  asset,
});
```

但 `useVSCodeMessages.ts` 的 switch-case 中**没有 `importGeneratedAsset` 分支**。消息发出后静默丢失。

**已处理的消息类型**（完整列表）：
`update` / `keyboardAction` / `setLocale` / `addMedia` / `dropAssets` / `dropMedia` / `generationProgress` / `buildPromptResult` / `scriptIndexResult` / `modelInstalledResult` / `timelineSync` / `updateNodeImage` / `nodes.*`

**缺失**：`importGeneratedAsset`

**修复方向**：在 `useVSCodeMessages.ts` 添加 case，调用 `canvasStore.addNode()` 创建对应类型节点（image → `media` 节点, storyboard → `shot` 节点数组）。

### Problem B：Send-to 只覆盖 canvas / cut，缺 sketch / model / puppet

`PluginTransferCommandPlan` 只有两条命令路径。`sketch` 虽在 `NEKO_PLUGIN_EXTENSION_IDS` 中定义了 extension ID，但 plan builder 对其回退到 `unsupported`。

**影响**：
- Agent 生成的 2D 素材无法直接发送到 neko-sketch 编辑
- Agent 生成的 3D 模型无法发送到 neko-model 查看
- 只能 reveal-file 后手动导入

### Problem C：SendToMenu 只传单个 assetPath

`SendToMenu` 接口：
```typescript
interface SendToMenuProps {
  assetPath: string;       // 单个文件
  mediaType: PluginTransferMediaType;
  plugins: PluginsAvailable;
}
```

对于 storyboard 多场景多镜头结构，`StoryboardRenderer.tsx` 只取 `scene.shots[0].localPath`，**丢失其余镜头和全部元数据**。

### Problem D：无结构化传输协议

当前 `{ path, type }` 是扁平文件传输。Agent 生成的语义上下文全部丢失：
- 场景编号 / 描述 / 转场类型
- 镜头参数（景别 / 运镜 / 角度）
- 角色信息 / 对白
- 生成提示词 / 模型参数

**对比**：neko-story → canvas 的 `CanvasStoryboardPayload` 包含完整结构化数据。

### Problem E：CompositeBlock 无传输路径

ADR 定义的 `CompositeBlock`（storyboard-table / comparison / gallery / report）只在 agent webview 内渲染，没有对应的 Send-to 投影器。一个完整分镜表格无法整体发送到 canvas。

---

## 7. 修复路线建议

### Phase 1 — 修复断点 (P0)

| PR | 范围 | 内容 |
|----|------|------|
| PR-1 | canvas webview | `useVSCodeMessages.ts` 补 `importGeneratedAsset` case → 创建 media/shot 节点 |
| PR-2 | agent webview | `SendToMenu` 支持 `assetPaths: string[]` 批量传输 |

### Phase 2 — 结构化传输协议

| PR | 范围 | 内容 |
|----|------|------|
| PR-3 | agent-types + agent runtime | 扩展 `PluginTransferCommandPlan` 支持 structured payload |
| PR-4 | agent → canvas | 复用 `CanvasStoryboardPayload`，agent 分镜 → `neko.canvas.importStoryboard` |
| PR-5 | agent → sketch/model | 新增 `neko.sketch.importImageData` / `neko.model.importAsset` 命令注册 |

### Phase 3 — CompositeBlock 整体投递

| PR | 范围 | 内容 |
|----|------|------|
| PR-6 | agent runtime | CompositeBlock → `CanvasStoryboardPayload` 投影器 |
| PR-7 | agent runtime | CompositeBlock → `TimelineImportPayload` 投影器 |

### 层级关系

```
Phase 3 (CompositeBlock 投影)
  └── Phase 2 (结构化协议)
        └── Phase 1 (断点修复)
              └── 现有 Send-to-X 基础设施 (ADR-5 P0)
```

---

## 8. 关键架构约束

### 8.1 零 Base64 原则 (ADR-4)

所有跨进程传输只传路径引用，不传二进制数据：
- Agent webview → Extension Host：`assetPath` (磁盘绝对路径)
- Extension Host → Target Extension：VSCode command + `{path}` payload
- Target Webview 显示：`webview.asWebviewUri(Uri.file(path))` 转安全 URI

### 8.2 三层隔离

```
Webview (React)     — 无 Node.js / 无 vscode API / 无 fs
Extension Host      — 桥接层，路由消息，调用 VSCode commands
Domain Packages     — 业务逻辑，无 vscode 依赖
```

Send-to 的 plan building 在 domain layer（`@neko/agent/runtime`），command 执行在 extension layer（`pluginTransferBridge.ts`）。

### 8.3 CanvasStoryboardPayload 是结构化传输的参考范本

neko-story → canvas 已验证的结构化导入：
```typescript
interface CanvasStoryboardPayload {
  scenes: Array<{
    heading: string;
    shots: Array<{
      description: string;
      shotScale?: string;
      cameraMovement?: string;
      characters?: string[];
      dialogue?: string;
      generatedAsset?: GeneratedImage;
    }>;
  }>;
}
```

Agent → Canvas 的结构化传输应复用此协议，而非重新发明。

---

## 9. 与 ADR 关联

| ADR | 关联点 |
|-----|--------|
| [agent-media-architecture.md](./agent-media-architecture.md) | GeneratedAsset 磁盘存储 + JSON 引用；Send-to-Agent 协议 |
| [adr-agent-multimodal-perception.md](./adr-agent-multimodal-perception.md) | PerceptionCard + CompositeBlock + Provider-Aware Delivery |
| [canvas-agent-integration.md](./canvas-agent-integration.md) | Canvas MCP 工具 + BatchGenerationScheduler |
| [adr-capability-protocol.md](./adr-capability-protocol.md) | AgentCapabilityProvider 注册模式 |
| [adr-asset-federation.md](./adr-asset-federation.md) | AssetHandler 自治 + Send-to-Anywhere 协议 |
