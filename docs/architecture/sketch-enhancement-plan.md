# neko-sketch 增强方案：拖拽导入 + 工作流流转 + AI 集成

## Context

neko-sketch 当前定位为**两者兼顾** —— 先做好视频创作流程中的轻量快编环节，再逐步增强为独立 2D 创作工具。

现有 3 个核心缺口：
1. **图片导入方式单一**：仅支持文件对话框（Ctrl+I），不支持拖拽/粘贴
2. **跨模块流转依赖 Agent**：Canvas→Sketch→Cut 必须通过 AI Agent 中转，缺少直接 UI 快捷操作
3. **AI 编辑能力空白**：仅 `SketchGenerate`（文生图），缺少 Inpaint/Auto-layer/Style Transfer

---

## Phase 1: 拖拽 & 粘贴图片导入

### 1.1 剪贴板粘贴 (Ctrl+V / Cmd+V)

**原理**：Webview 内 `paste` 事件可以读取 `clipboardData.items` 中的图片 Blob（不需要 Extension 中转）。

**修改文件**：
- `packages/neko-sketch/packages/webview/src/App.tsx` — 注册 paste 事件监听
- `packages/neko-sketch/packages/webview/src/utils/image-import.ts` — 新增 `importImageFromBlob()`

**实现**：
```typescript
// App.tsx — 新增 paste 事件监听
useEffect(() => {
  const handlePaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const { layer, bitmap } = await importImageFromBlob(blob, 'Pasted Image');
        // 同 handleFileImport 逻辑：appendLayer + setActive + markDirty
      }
    }
  };
  window.addEventListener('paste', handlePaste);
  return () => window.removeEventListener('paste', handlePaste);
}, []);
```

```typescript
// image-import.ts — 新增
export async function importImageFromBlob(
  blob: Blob,
  name: string,
): Promise<{ layer: LayerData; bitmap: ImageBitmap }> {
  const bitmap = await createImageBitmap(blob);
  const layer: LayerData = {
    id: generateLayerId(),
    name,
    type: 'raster',
    // ... 同 importImageAsLayer 相同字段
  };
  return { layer, bitmap };
}
```

### 1.2 VSCode Explorer 拖拽

**原理**：VSCode `CustomEditorProvider` 的 webview 可以通过 `WebviewOptions.enableDropIntoEditorApi` + `window.addEventListener('drop')` 接收拖入的文件 URI。但 Custom Editor 的 webview 需要 Extension 侧注册 `DocumentDropEditProvider` 来处理 drop。

**更可靠的方案**：在 Extension 侧监听 drag-and-drop，通过已有的 `postImageData()` 管道推送。

**修改文件**：
- `packages/neko-sketch/packages/extension/src/extension.ts` — 注册 drop handler
- `packages/neko-sketch/packages/extension/src/editor/sketchEditorProvider.ts` — 暴露 webviewPanel 状态查询
- `packages/neko-sketch/package.json` — 添加 `dropMimeTypes` 贡献

**实现**：
```typescript
// extension.ts — 注册 DocumentDropEditProvider
class SketchDropProvider implements vscode.DocumentDropEditProvider {
  constructor(private readonly editorProvider: SketchEditorProvider) {}

  async provideDocumentDropEdits(
    _document: vscode.TextDocument,
    _position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<vscode.DocumentDropEdit | undefined> {
    const uriList = await dataTransfer.get('text/uri-list')?.asString();
    if (!uriList) return undefined;

    for (const uriStr of uriList.split('\n')) {
      const uri = vscode.Uri.parse(uriStr.trim());
      if (isImageFile(uri)) {
        const fileData = await vscode.workspace.fs.readFile(uri);
        const base64 = Buffer.from(fileData).toString('base64');
        const name = uri.path.split('/').pop() || 'dropped';
        this.editorProvider.postImageData(base64, name);
      }
    }
    return undefined; // No text edit needed, we handled it via postMessage
  }
}
```

> **注意**：`DocumentDropEditProvider` 适用于 TextDocument。对 CustomEditor，需用 webview 内的 `drop` 事件 + Extension 中转方式。具体实现：Webview 监听 `drop` → 发送 `file:dropRequest` 消息给 Extension（附带 URI） → Extension 读文件 → `file:imported` 回传。

### 1.3 外部文件管理器拖拽

**原理**：外部 drag-and-drop 到 VSCode webview 时，`DataTransfer` 中包含文件数据。Webview 可以监听 `dragover`/`drop` 事件。

**修改文件**：
- `packages/neko-sketch/packages/webview/src/App.tsx` — 注册 dragover/drop 事件
- `packages/neko-sketch/packages/webview/src/components/DropOverlay.tsx` — 新增拖拽视觉反馈组件

**实现**：
```typescript
// App.tsx — dragover + drop 事件
useEffect(() => {
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    // Case 1: dataTransfer.files (external drag from OS file manager)
    if (e.dataTransfer?.files.length) {
      for (const file of e.dataTransfer.files) {
        if (file.type.startsWith('image/')) {
          const { layer, bitmap } = await importImageFromBlob(file, file.name);
          // appendLayer + setActive + markDirty
        }
      }
      return;
    }

    // Case 2: text/uri-list (VSCode Explorer drag — may not have file data)
    // Fallback: request Extension to read the file
    const uriList = e.dataTransfer?.getData('text/uri-list');
    if (uriList) {
      vscode.postMessage({ type: 'file:dropRequest', uris: uriList });
    }
  };

  const el = document.getElementById('root')!;
  el.addEventListener('dragover', handleDragOver);
  el.addEventListener('dragleave', handleDragLeave);
  el.addEventListener('drop', handleDrop);
  return () => { /* cleanup */ };
}, []);
```

**消息协议新增**：
```typescript
// types/index.ts 新增
| { type: 'file:dropRequest'; uris: string }  // Webview → Extension
```

**Extension 侧新增 handler**：
```typescript
// sketchEditorProvider.ts — handleWebviewMessage 新增 case
case 'file:dropRequest': {
  const uris = (message.uris as string).split('\n').filter(Boolean);
  for (const uriStr of uris) {
    const uri = vscode.Uri.parse(uriStr.trim());
    if (isImageUri(uri)) {
      const fileData = await vscode.workspace.fs.readFile(uri);
      const base64 = Buffer.from(fileData).toString('base64');
      const name = uri.path.split('/').pop() || 'dropped';
      webviewPanel.webview.postMessage({ type: 'file:imported', name, data: base64, path: uri.fsPath });
    }
  }
  break;
}
```

---

## Phase 2: 视频创作工作流流转

### 2.1 扩展 NekoSketchAPI

**修改文件**：
- `packages/neko-types/src/types/extension-api.ts` — 扩展 `NekoSketchAPI` 接口
- `packages/neko-sketch/packages/extension/src/extension.ts` — 实现新 API
- `packages/neko-sketch/packages/extension/src/editor/sketchEditorProvider.ts` — 新增方法

```typescript
// extension-api.ts — 扩展接口
export interface NekoSketchAPI {
  /** 已有：导入 base64 图片为新图层 */
  importImageData(base64: string, name: string): void;

  /** 新增：导入并关联来源上下文（用于流转回写） */
  importImageWithContext(base64: string, name: string, context: SketchImportContext): void;

  /** 新增：导出当前画布为 base64 PNG */
  exportCanvas(): Promise<string | null>;

  /** 新增：导出指定图层为 base64 PNG */
  exportLayer(layerId: string): Promise<string | null>;

  /** 新增：查询当前是否有活跃的 sketch 编辑器 */
  isActive(): boolean;
}

export interface SketchImportContext {
  /** 来源模块 */
  source: 'canvas' | 'cut' | 'preview' | 'agent';
  /** 来源节点 ID（canvas shot/gallery node） */
  sourceNodeId?: string;
  /** 来源 clip ID（cut timeline clip） */
  sourceClipId?: string;
  /** 附加信息（prompt、generation params 等） */
  metadata?: Record<string, unknown>;
}
```

### 2.2 注册跨模块命令

**修改文件**：
- `packages/neko-sketch/packages/extension/src/commands/index.ts` — 新增流转命令
- `packages/neko-sketch/package.json` — 注册新命令

```typescript
// 新增命令

// 1. 从 Sketch 发送到 Cut 时间线
'neko.sketch.sendToTimeline': async () => {
  const base64 = await sketchEditorProvider.requestExport();
  if (!base64) return;
  await vscode.commands.executeCommand('neko.cut.importGeneratedClip', {
    data: base64,
    type: 'image',
    name: 'sketch-export',
    duration: 3,
    source: 'sketch',
  });
};

// 2. 从 Sketch 发送回 Canvas 节点
'neko.sketch.sendToCanvas': async () => {
  const ctx = sketchEditorProvider.getImportContext();
  if (!ctx?.sourceNodeId) {
    vscode.window.showWarningMessage('No source canvas node linked');
    return;
  }
  const base64 = await sketchEditorProvider.requestExport();
  if (!base64) return;
  await vscode.commands.executeCommand('neko.canvas.updateNodeImage', {
    nodeId: ctx.sourceNodeId,
    cellId: ctx.metadata?.cellId,
    imageData: base64,
  });
};

// 3. 外部调用：在 Sketch 中编辑图片（canvas/preview 调用）
'neko.sketch.editImage': async (args: { base64: string; name: string; context: SketchImportContext }) => {
  // 创建临时 .nks 文件 → 用 importImageWithContext 打开
  // 或打开已有 .nks 并注入图层
  sketchEditorProvider.importImageWithContext(args.base64, args.name, args.context);
};
```

### 2.3 Canvas → Sketch 流转 UI

**修改文件**：
- `packages/neko-canvas/packages/webview/src/` — ShotNode 右键菜单新增 "Edit in Sketch"
- `packages/neko-canvas/packages/extension/src/` — 处理 `editInSketch` 消息

```
Canvas Webview                    Canvas Extension                  Sketch Extension
     │                                  │                                │
     │  右键 ShotNode                    │                                │
     │  → "Edit in Sketch"              │                                │
     │  postMessage('editInSketch',     │                                │
     │    { nodeId, imageData })         │                                │
     │ ─────────────────────────────────>│                                │
     │                                  │  vscode.commands.executeCommand │
     │                                  │  ('neko.sketch.editImage', {   │
     │                                  │    base64, name, context })    │
     │                                  │ ──────────────────────────────>│
     │                                  │                                │  打开/激活 Sketch
     │                                  │                                │  importImageWithContext()
     │                                  │                                │
     │           (用户在 Sketch 编辑完成后)                                │
     │                                  │                                │
     │                                  │  "Send back to Canvas"         │
     │                                  │ <──────────────────────────────│
     │  nodeImageUpdated                │                                │
     │ <────────────────────────────────│                                │
```

### 2.4 Sketch 状态栏流转按钮

**修改文件**：
- `packages/neko-sketch/packages/extension/src/views/sketchStatusBar.ts` — 新增流转按钮
- `packages/neko-sketch/packages/webview/src/components/toolbar/` — 新增 Toolbar 流转按钮组

当 Sketch 有关联的 `SketchImportContext` 时，显示：
- `⬅ Back to Canvas` — 回写并返回 Canvas
- `➡ Send to Timeline` — 导出到 Cut 时间线
- 状态栏显示来源信息："From: Canvas Shot-3"

---

## Phase 3: AI 集成 (Inpaint + Auto-layer + Style Transfer)

### 3.1 架构总览

所有 AI 功能复用已有模式：neko-agent `extensionTools.ts` 中定义 MCP Tool → 调用 `MediaGenerationService` → 结果通过 `NekoSketchAPI` 注入。

```
Agent (LLM)
  ↓ calls tool
extensionTools.ts (neko-agent extension)
  ↓ reads selection/layer from sketch
NekoSketchAPI (neko-sketch extension)
  ↓ provides data
MediaGenerationService (neko-agent platform)
  ↓ sends to AI provider
AI Provider (OpenAI / Stability / fal.ai)
  ↓ returns result
NekoSketchAPI.importImageData()
  ↓ injects result
Webview (new layer)
```

### 3.2 扩展 NekoSketchAPI（AI 数据读取）

**修改文件**：
- `packages/neko-types/src/types/extension-api.ts` — 新增读取方法

```typescript
export interface NekoSketchAPI {
  // ... 已有 + Phase 2 新增 ...

  /** 新增：获取当前选区蒙版（用于 inpaint） */
  getSelectionMask(): Promise<SketchSelectionData | null>;

  /** 新增：获取指定图层像素数据（用于 auto-layer / style-transfer） */
  getLayerImageData(layerId?: string): Promise<string | null>; // base64 PNG

  /** 新增：获取合成后全画布图像（用于 style-transfer） */
  getCanvasImageData(): Promise<string | null>; // base64 PNG
}

export interface SketchSelectionData {
  x: number;
  y: number;
  width: number;
  height: number;
  mask: string; // base64 encoded grayscale mask PNG
  layerImageData: string; // base64 PNG of the active layer
}
```

**消息协议新增**：
```typescript
// Extension → Webview
| { type: 'request:selectionMask'; requestId: string }
| { type: 'request:layerImageData'; requestId: string; layerId?: string }
| { type: 'request:canvasImageData'; requestId: string }

// Webview → Extension
| { type: 'response:selectionMask'; requestId: string; data: SketchSelectionData | null }
| { type: 'response:layerImageData'; requestId: string; data: string | null }
| { type: 'response:canvasImageData'; requestId: string; data: string | null }
```

### 3.3 Tool: SketchInpaint（局部重绘）

**修改文件**：
- `packages/neko-agent/packages/extension/src/tools/extensionTools.ts` — 新增 tool

```typescript
{
  name: 'SketchInpaint',
  description:
    'Inpaint (locally redraw) a selected region in the active neko-sketch canvas. ' +
    'Requires an active selection in the sketch editor. The selected area is replaced ' +
    'with AI-generated content based on the prompt. Result is added as a new layer.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'What to draw in the selected area' },
      strength: { type: 'number', description: 'Inpaint strength 0.0-1.0 (default: 0.8)' },
      layerName: { type: 'string', description: 'Name for the result layer' },
    },
    required: ['prompt'],
  },
  execute: async (args) => {
    const api = await getAPI();
    const selection = await api.getSelectionMask();
    if (!selection) {
      return { error: 'No active selection in sketch editor. Use selection tools first.' };
    }

    const task = await media.inpaintImage({
      image: selection.layerImageData,   // base64 PNG
      mask: selection.mask,              // base64 grayscale mask
      prompt: args.prompt as string,
      strength: (args.strength as number) ?? 0.8,
    });

    const completed = await media.waitForTask(task.id, 3 * 60 * 1000);
    // ... download + import as layer (同 SketchGenerate 模式)
  },
}
```

### 3.4 Tool: SketchAutoLayer（AI 自动分层）

```typescript
{
  name: 'SketchAutoLayer',
  description:
    'Automatically decompose the active layer (or specified layer) into separate layers: ' +
    'line art, flat color, shadow, and highlight. Uses AI segmentation.',
  parameters: {
    type: 'object',
    properties: {
      layerId: { type: 'string', description: 'Layer ID to decompose (default: active layer)' },
      layers: {
        type: 'array',
        items: { type: 'string', enum: ['lineart', 'flatcolor', 'shadow', 'highlight'] },
        description: 'Which layers to extract (default: all four)',
      },
    },
  },
  execute: async (args) => {
    const api = await getAPI();
    const imageData = await api.getLayerImageData(args.layerId as string | undefined);
    if (!imageData) {
      return { error: 'No layer data available' };
    }

    const requestedLayers = (args.layers as string[] | undefined) ??
      ['lineart', 'flatcolor', 'shadow', 'highlight'];

    // 调用 AI 分层服务
    const results = await media.autoLayer({ image: imageData, layers: requestedLayers });

    // 逐层导入
    for (const result of results) {
      api.importImageData(result.data, `${result.type}.png`);
    }

    return { success: true, layersCreated: results.map(r => r.type) };
  },
}
```

### 3.5 Tool: SketchStyleTransfer（风格迁移）

```typescript
{
  name: 'SketchStyleTransfer',
  description:
    'Apply a style transfer to the active layer or full canvas. Transforms the image ' +
    'into the specified artistic style. Result is added as a new layer.',
  parameters: {
    type: 'object',
    properties: {
      style: {
        type: 'string',
        enum: ['anime', 'oil-painting', 'watercolor', 'pixel-art', 'sketch', 'comic', 'ghibli'],
        description: 'Target artistic style',
      },
      prompt: { type: 'string', description: 'Additional style guidance' },
      strength: { type: 'number', description: 'Style strength 0.0-1.0 (default: 0.7)' },
      scope: {
        type: 'string',
        enum: ['layer', 'canvas'],
        description: 'Apply to active layer or full canvas (default: layer)',
      },
    },
    required: ['style'],
  },
  execute: async (args) => {
    const api = await getAPI();
    const scope = (args.scope as string) ?? 'layer';
    const imageData = scope === 'canvas'
      ? await api.getCanvasImageData()
      : await api.getLayerImageData();

    if (!imageData) {
      return { error: 'No image data available' };
    }

    const task = await media.styleTransfer({
      image: imageData,
      style: args.style as string,
      prompt: args.prompt as string | undefined,
      strength: (args.strength as number) ?? 0.7,
    });

    const completed = await media.waitForTask(task.id, 3 * 60 * 1000);
    // ... download + import as layer
  },
}
```

### 3.6 MediaGenerationService 扩展

**修改文件**：
- `packages/neko-agent/packages/platform/src/media/` — 新增方法签名

需要在 `MediaGenerationService` 中新增：
```typescript
interface MediaGenerationService {
  // 已有
  generateImage(params: ImageGenParams): Promise<TaskHandle>;
  waitForTask(id: string, timeout: number): Promise<TaskResult>;

  // 新增
  inpaintImage(params: InpaintParams): Promise<TaskHandle>;
  autoLayer(params: AutoLayerParams): Promise<AutoLayerResult[]>;
  styleTransfer(params: StyleTransferParams): Promise<TaskHandle>;
}

interface InpaintParams {
  image: string;    // base64 source image
  mask: string;     // base64 grayscale mask
  prompt: string;
  strength: number; // 0.0-1.0
}

interface AutoLayerParams {
  image: string;
  layers: string[];
}

interface StyleTransferParams {
  image: string;
  style: string;
  prompt?: string;
  strength: number;
}
```

Provider 路由：
- Inpaint → OpenAI DALL-E (edit) / Stability AI / fal.ai
- Auto-layer → 自定义模型 / fal.ai segment-anything + 后处理
- Style Transfer → Stability AI style-transfer / fal.ai

---

## 实施优先级

```
Phase 1 (P0 - 2周): 拖拽 & 粘贴
├─ 1.1 剪贴板粘贴 Ctrl+V       → 1天（Webview 内完成，无需 Extension 改动）
├─ 1.2 外部文件拖拽 drop        → 2天（Webview dragover/drop + Extension file:dropRequest）
├─ 1.3 VSCode Explorer 拖拽     → 2天（同 1.2 机制，测试 URI 格式兼容）
└─ 1.4 视觉反馈 DropOverlay     → 1天

Phase 2 (P1 - 2周): 工作流流转
├─ 2.1 扩展 NekoSketchAPI       → 2天
├─ 2.2 注册跨模块命令            → 2天
├─ 2.3 Canvas "Edit in Sketch"  → 3天（含 Canvas 侧修改）
└─ 2.4 状态栏流转按钮            → 1天

Phase 3 (P1 - 3周): AI 集成
├─ 3.1 扩展 API 读取方法         → 2天（getSelectionMask / getLayerImageData / getCanvasImageData）
├─ 3.2 SketchInpaint Tool       → 3天（含 MediaGenerationService.inpaintImage）
├─ 3.3 SketchAutoLayer Tool     → 3天（含自定义 Provider 路由）
└─ 3.4 SketchStyleTransfer Tool → 2天（结构类似 Inpaint）
```

---

## 验证策略

```bash
# Phase 1
pnpm build                          # 全量构建
# 手动测试：复制图片 → Ctrl+V → 新图层出现
# 手动测试：从 Finder/Explorer 拖拽 PNG 到画布 → 新图层
# 手动测试：从 VSCode 侧边栏拖拽图片 → 新图层

# Phase 2
# 手动测试：Canvas ShotNode 右键 → "Edit in Sketch" → Sketch 打开并含图层
# 手动测试：Sketch "Send to Timeline" → neko-cut 时间线新增 clip
# 手动测试：Sketch "Back to Canvas" → Canvas 节点图片更新

# Phase 3
# 在 Sketch 中选区 → Agent 对话 "inpaint: fix the hand" → 新图层
# Agent 对话 "decompose this layer into line art and color" → 4 个新图层
# Agent 对话 "apply anime style to this layer" → 风格化新图层

# 单元测试
pnpm test                           # Vitest
pnpm check                          # Knip + dependency-cruiser
```

---

## 关键文件索引

| 文件 | 作用 |
|------|------|
| `packages/neko-sketch/packages/webview/src/App.tsx` | Webview 主入口，新增 paste/drop 事件 |
| `packages/neko-sketch/packages/webview/src/utils/image-import.ts` | 图片导入工具，新增 fromBlob |
| `packages/neko-sketch/packages/webview/src/types/index.ts` | 消息协议类型，新增 drop/AI 请求响应 |
| `packages/neko-sketch/packages/webview/src/components/DropOverlay.tsx` | 新建：拖拽视觉反馈 |
| `packages/neko-sketch/packages/extension/src/editor/sketchEditorProvider.ts` | Extension 消息处理，新增 drop/AI 代理 |
| `packages/neko-sketch/packages/extension/src/extension.ts` | Extension 入口，扩展 API 实现 |
| `packages/neko-sketch/packages/extension/src/commands/index.ts` | 新增流转命令 |
| `packages/neko-types/src/types/extension-api.ts` | NekoSketchAPI 接口扩展 |
| `packages/neko-agent/packages/extension/src/tools/extensionTools.ts` | 新增 3 个 AI Tools |
| `packages/neko-canvas/packages/extension/src/` | 新增 editInSketch 命令处理 |
