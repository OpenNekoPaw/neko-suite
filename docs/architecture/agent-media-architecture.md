# Agent 媒体架构：生成资产、富媒体展示与跨插件传递

**状态**: 已实施（Phase 1-5）  
**日期**: 2026-04-03  
**实施日期**: 2026-04-03  
**关联**: neko-agent · neko-story · neko-canvas · @neko/shared

---

## 背景

本文记录四个相互关联的架构决策，源于以下核心问题：

1. neko-story 是否应该内置分镜展示？
2. 分镜生成结果应该显示在 agent 还是 canvas？
3. agent 在没有其他插件时能否独立完成分镜生成？
4. agent 生成的二进制数据如何在插件间传递？
5. 生成内容能否通过拖拽放入其他插件？

---

## ADR-1：neko-story 的分镜职责边界

### 决策

**neko-story 的分镜职责上限是 `ScriptTableView`（场景分解表），不包含图片生成与展示。**

### 论证

```
编剧思维（文字 → 结构）      导演/分镜师思维（结构 → 画面）
  写剧本                          构图设计
  场景分解                         镜头语言
  台词打磨                         画面生成
       │                               │
       ▼                               ▼
  neko-story                      neko-canvas
```

两种思维模式时序分离，不同时发生：写作时不需要看图，看图时已不在写作。

### 职责边界

| 组件 | 决策 | 理由 |
|------|------|------|
| `ScriptTableView` | ✅ 保留 | 纯文字元数据（INT/EXT、地点、角色、时长），是 Fountain 解析的自然延伸 |
| `CreativeGridView`（含生成入口）| ❌ 移除/降级 | 图片生成是 canvas 核心能力，story 里是残缺版竞争 |
| 「在 Canvas 中创建分镜 ↗」按钮 | ✅ 新增 | story 唯一需要的桥接入口 |

### 现有死代码

```typescript
// CreativeGridView.tsx — 应清理
interface Props {
  generatedImages?: Record<number, string>  // 从未被传入，永远是占位符
}
```

### 正确的 story → canvas 路径

```
story ScriptTableView / 右键菜单
  │ executeCommand('neko.canvas.openStoryboard', { scriptPath })
  ▼ import_script_to_canvas MCP Tool
canvas 自动创建 SceneGroupNode + ShotNode 链
```

---

## ADR-2：agent 作为独立媒体生成工具

### 决策

**agent 必须能独立完成「剧本 → 分镜生成 → 展示」的完整闭环，不以 canvas 安装为前提。canvas 是可选的增强路径。**

### 问题根源

`import_script_to_canvas` 当前把生成逻辑和 canvas 写入耦合在一起：

```typescript
// 现状：canvas 未安装则静默失败
const canvasApi = await getCanvasAPI()  // undefined
await canvasApi.nodes.create(...)       // ❌ crash / noop
```

agent 是整个 neko-suite 里**最可能单独安装**的插件（core 包含 agent，canvas 在 video 包），不能对 canvas 有硬依赖。

### 重构方向

把 `import_script_to_canvas` 拆分为两步：

```
第一步：parse_script_to_shots（agent 内部，零外部依赖）
  → 读 .fountain 文件（Bash/Read 工具）
  → 解析 scenes[]
  → 循环调用 platform.media.generateImage()
  → 返回 GeneratedStoryboard（JSON，无二进制）

第二步（可选）：create_canvas_storyboard（canvas 安装时）
  → 接收 GeneratedStoryboard
  → 调用 canvasApi.nodes.create(...)
  → 创建 SceneGroupNode + ShotNode 链
```

### 自足性保证

```
只安装 neko-agent：
  ✅ 读 .fountain → 解析场景 → 批量生图
  ✅ Chat 内分场景展示分镜缩略图
  ✅ 保存到 .neko/generated/ 目录
  ✅ 完整闭环，不依赖其他插件

同时安装 canvas / cut / audio：
  ✅ Chat 底部出现「发送到 ↗」按钮（渐进增强）
  ✅ 分镜 → Canvas，音频 → 时间线，视频 → 剪辑轨道
```

---

## ADR-3：agent chat 富媒体展示层

### 决策

**agent chat 是 AI 工作的输出终端，必须支持富媒体 inline 展示。边界是「展示结果」，不是「编辑工具」。**

### 能力矩阵

| 能力 | 应有 | 理由 |
|------|------|------|
| 图片 inline 展示 | ✅ 必须 | 生图结果的最小可用展示 |
| 分镜网格（场景分组）| ✅ 必须 | agent 独立完成分镜任务的前提 |
| 音频播放 | ✅ 必须 | AI 配乐/TTS/音效的基础反馈 |
| 视频 inline 播放 | ✅ 必须 | AI 生成视频的基础反馈 |
| 多图对比视图 | ✅ 应有 | 同一镜头多候选版本的选择场景 |
| 时间线编辑 | ❌ 不该有 | neko-cut 的职责 |
| 音频混音台 | ❌ 不该有 | neko-audio 的职责 |
| 空间画布排布 | ❌ 不该有 | neko-canvas 的职责 |

### Chat 消息组件

```
StoryboardMessage（分场景分组）
  ┌─ 场景 3 · 咖啡馆 · INT · 日 ──────────────────┐
  │  ┌────────┐  ┌────────┐  ┌────────┐           │
  │  │ 全景   │  │ 中景   │  │ 特写   │           │
  │  │ [img]  │  │ [img]  │  │ [img]  │           │
  │  └────────┘  └────────┘  └────────┘           │
  │  [重新生成]  [在 Canvas 中编辑 ↗]              │
  └───────────────────────────────────────────────┘

AudioMessage
  ┌─ AI 配乐：场景3 背景音乐 ──────────────────────┐
  │  ▶  ━━━━━━━━━━━━━━━━○──────  1:23              │
  │  [重新生成]  [发送到时间线 ↗]                   │
  └───────────────────────────────────────────────┘

VideoMessage
  ┌─ 生成的视频片段 ───────────────────────────────┐
  │  ┌──────────────────────────────────────────┐  │
  │  │              [video player]              │  │
  │  └──────────────────────────────────────────┘  │
  │  [重新生成]  [导入时间线 ↗]                    │
  └───────────────────────────────────────────────┘
```

### Agent Chat 的独特价值

Chat 历史是**创作决策的时间线**，其他插件给不了：

```
10:23  「生成场景3分镜」→ [第1版：偏暗]
10:31  「重新生成，光线明亮一点」→ [第2版：满意]
10:45  「为场景3配乐」→ [音频播放]
11:02  「生成视频预览」→ [视频播放]
```

---

## ADR-4：GeneratedAsset — 二进制存磁盘，传递 JSON 引用

### 决策

**agent 生成的二进制数据直接写入本地磁盘，定义统一 JSON schema 作为引用。所有插件间传递只传 JSON，各自按需从磁盘加载文件。**

### 当前问题

```typescript
// 现状：base64 在内存/消息里反复传递
ShotNode.generatedImage = "data:image/png;base64,iVBORw0KGgo..."  // ~1.3MB 字符串
postMessage({ dataUrl: "data:image/..." })  // 跨进程传大对象
```

### GeneratedAsset Schema

位置：`@neko/shared/types/generated-asset.ts`

```typescript
type GeneratedAssetType =
  | 'generated-image'
  | 'generated-audio'
  | 'generated-video'
  | 'generated-storyboard'

interface BaseGeneratedAsset {
  type:        GeneratedAssetType
  id:          string        // nanoid，全局唯一
  path:        string        // 绝对路径：/workspace/.neko/generated/...
  mimeType:    string
  generatedAt: string        // ISO 8601
  prompt?:     string
  model?:      string        // fal.ai / dashscope / kling / ...
}

interface GeneratedImage extends BaseGeneratedAsset {
  type:    'generated-image'
  width:   number
  height:  number
  ratio:   string            // '16:9' | '1:1' | ...
  shotMeta?: {
    sceneIndex:      number
    shotIndex:       number
    shotScale?:      ShotScale
    cameraMovement?: CameraMovement
  }
}

interface GeneratedAudio extends BaseGeneratedAsset {
  type:       'generated-audio'
  duration:   number         // 秒
  sampleRate: number
  channels:   number
}

interface GeneratedVideo extends BaseGeneratedAsset {
  type:     'generated-video'
  duration: number
  width:    number
  height:   number
  fps:      number
}

interface GeneratedStoryboard extends BaseGeneratedAsset {
  type:   'generated-storyboard'
  scenes: Array<{
    sceneIndex: number
    heading:    string
    shots:      GeneratedImage[]
  }>
}

type GeneratedAsset =
  | GeneratedImage
  | GeneratedAudio
  | GeneratedVideo
  | GeneratedStoryboard
```

### 磁盘存储结构

```
<workspaceRoot>/
  .neko/
    generated/
      storyboard/
        scene-01/
          shot-001.png
          shot-002.png
        scene-03/
          shot-001.png
      audio/
        scene-01-bgm.wav
      video/
        scene-03-clip.mp4
      index.json            ← GeneratedAsset[] 目录，neko-assets 可接管
```

### 数据流

```
platform.media.generateImage()
  → AI 服务返回二进制
  → fs.writeFile(localPath, binary)       ← 唯一写盘点
  → 构造 GeneratedImage JSON
  → 追加到 .neko/generated/index.json
  → return GeneratedImage                 ← 只返回 JSON，不含二进制
       │
       ├─ Agent Chat 展示
       │    extension: path → asWebviewUri(path)
       │    postMessage({ asset: { ...json, webviewUri } })
       │    webview: <img src={webviewUri} />
       │
       ├─ Canvas ShotNode
       │    canvasApi.nodes.update(id, { generatedAsset: GeneratedImage })
       │    canvas extension: path → asWebviewUri
       │    webview: <img src={webviewUri} />
       │
       └─ neko-cut / neko-engine 导出
            直接使用 asset.path（原始文件，无 base64 转换）
```

### Webview 访问约束

Webview 无法直接访问 `file://`，统一在 extension 侧转换：

```typescript
// Extension Host 侧（各 extension 各自处理）
function toWebviewAsset<T extends BaseGeneratedAsset>(
  asset: T,
  webview: vscode.Webview
): T & { webviewUri: string } {
  const uri = vscode.Uri.file(asset.path)
  return { ...asset, webviewUri: webview.asWebviewUri(uri).toString() }
}

// Webview 侧只用 webviewUri，path 仅作元数据
<img src={asset.webviewUri} />
```

### 需要修改的存量代码

| 位置 | 修改内容 |
|------|---------|
| `platform/src/media.ts` | `generateImage()` 返回 `GeneratedImage`（写盘 + 返回 JSON），不返回 `dataUrl` |
| `neko-agent` generateForNode 命令 | `return { dataUrl }` → `return GeneratedImage` |
| `ShotNode` 类型定义 | `generatedImage?: string` → `generatedAsset?: GeneratedImage` |
| neko-cut 导出管线 | base64 解码 → 直接读 `asset.path` |

---

## ADR-5：跨插件内容传递与拖拽

### 决策

**直接 Webview → Webview 拖拽不可行（iframe 隔离边界）。主路径使用「发送到」命令按钮；可选增强实现 Extension Host 代理 DnD。传递载荷统一为 `GeneratedAsset` JSON。**

### 技术约束

```
agent chat webview        canvas webview
  ┌──────────┐              ┌──────────┐
  │  iframe  │   dragstart  │  iframe  │
  │          │  ─────────▶  │          │  ← HTML5 事件不跨 iframe
  └──────────┘    ✗ 失败    └──────────┘
```

### 路径 1：文件系统拖拽（零成本）

GeneratedAsset 已存磁盘，用户可从 VS Code 文件资源管理器拖入任意 webview。  
适合高级用户的备用路径。

### 路径 2：「发送到」按钮（推荐主路径）

```typescript
// Chat 消息底部按钮
<button onClick={() =>
  vscode.commands.executeCommand('neko.canvas.importAsset', asset satisfies GeneratedImage)
}>
  ↗ 发送到 Canvas
</button>
```

传递的是 `GeneratedAsset` JSON，不是二进制。接收方从 `path` 加载文件。

### 路径 3：Extension Host 代理 DnD（可选增强）

```
agent webview                Extension Host（DragDropBroker）      目标 webview
     │                                  │                              │
     │  postMessage('dnd:start', asset) │                              │
     │ ──────────────────────────────▶  │                              │
     │                                  │  payload = asset             │
     │                                  │  ◀──────────────────────── │
     │                                  │  'dnd:query'                 │
     │                                  │ ──────────────────────────▶ │
     │                                  │  返回 payload               │
     │                                  │  ◀──────────────────────── │
     │                                  │  'dnd:drop' + position       │
     │                                  │  dispatch to target          │
```

```typescript
// @neko/shared/drag-drop-broker.ts
class DragDropBroker {
  private payload: GeneratedAsset | null = null

  register(webview: vscode.Webview, targetExtension: string) {
    webview.onDidReceiveMessage(msg => {
      switch (msg.type) {
        case 'dnd:start':
          this.payload = msg.asset
          break
        case 'dnd:query':
          webview.postMessage({ type: 'dnd:payload', asset: this.payload })
          break
        case 'dnd:drop':
          if (this.payload) {
            vscode.commands.executeCommand(
              `neko.${targetExtension}.importAsset`,
              this.payload
            )
            this.payload = null
          }
          break
      }
    })
  }
}
```

各 webview drop zone（约 20 行，统一实现）：

```typescript
window.addEventListener('dragover', e => {
  e.preventDefault()
  vscode.postMessage({ type: 'dnd:query' })
})
window.addEventListener('drop', e => {
  e.preventDefault()
  vscode.postMessage({ type: 'dnd:drop', position: { x: e.clientX, y: e.clientY } })
})
```

### 实施顺序

| 优先级 | 路径 | 工程量 |
|--------|------|--------|
| P0 | 「发送到」按钮 | ~30 行，立即解决跨插件传递 |
| P1 | Extension Host 代理 DnD | ~100 行，DragDropBroker 通用基础设施 |
| P2 | 「在资源管理器显示」按钮 | ~5 行，高级用户备用路径 |

---

## ADR-6：预览组件分层架构 + RichContent 富内容扩展

**日期**: 2026-04-03  
**修订**: 2026-04-03（新增 RichContentBlock 注册表、音视频引擎约束修正、跨包传递设计）

### 问题

1. neko-suite 中存在多套名称相近的"预览组件"（VideoPlayer、AudioPlayer），需要明确各自的职责边界，判断是否需要统一。
2. VSCode webview 对 `<audio>`/`<video>` 格式兼容性有限，全部音视频播放必须通过 neko-engine 解码流式传输，不能依赖原生 HTML5 元素。
3. Agent chat 未来需要展示分镜网格、多候选对比、表单确认等**结构化富组件**，当前 `ContentBlockType` 联合类型无法支撑，需要通用的富内容扩展机制。
4. 富内容的数据结构需要在多个子包间复用（agent 展示、canvas 编辑、cut 导入），渲染组件则各包独立。

### 决策

**三层架构：**

1. **Layer 1（neko-preview）**：完整流媒体播放，独立编辑器面板，不合并。
2. **Layer 2（agent MediaPreview）**：轻量展示卡片，音视频元数据从 engine 获取，点击跳转 Layer 1，不内嵌播放。
3. **Layer 3（RichContentBlock + Registry）**：新增 `rich_content` 内容块类型，用注册表模式动态映射 `kind → React 组件`，支持分镜/表单/对比等复杂展示。类型定义在 `@neko/shared`，渲染组件各包独立注册。

---

### 6.1 预览分层架构

#### 两层预览（不合并）

```
Layer 1：neko-preview（完整流媒体播放应用）
  ├── VideoPlayer  ← H264StreamClient + WebCodecs + FrameScheduler + PiP
  └── AudioPlayer  ← AudioStreamClient (PCM over WebSocket) + 波形 + 歌词 + 频谱
  以 CustomReadonlyEditorProvider 打开，独立编辑器面板，依赖 @neko/neko-client

Layer 2：neko-agent MediaPreview（生成结果展示卡片）
  ├── ImagePreview  ← <img>，折叠卡片，点击在 VSCode 中打开
  ├── VideoCard     ← poster 图 + 时长 badge，点击 → neko-preview
  └── AudioCard     ← 波形占位 + 时长 badge，点击 → neko-preview
  嵌入 Chat 对话中，委托播放给 Layer 1
  元数据（poster/波形/时长）由 extension host 从 engine 获取后传入
```

不合并理由：
- 两个 webview 是独立 Vite 构建（不同 bundle entry），React 组件无法跨包共享
- Layer 1 核心逻辑（WebCodecs/PCM 流）与 Layer 2（静态卡片）之间无可复用业务逻辑
- 强行共享会引入 VSCode 沙箱依赖管理问题

#### 音视频引擎约束

**关键约束**：VSCode webview 沙箱对 `<audio>`/`<video>` 格式支持有限，为保证兼容性，所有音视频播放统一走 neko-engine（H264 + PCM 流式传输）。

**影响**：
- Layer 2 **不能**使用 `<video>` 取 poster、不能用 `<audio controls>` 播放
- Layer 2 展示所需的元数据（poster 帧、波形、时长、分辨率）全部由 extension host 侧通过 EngineClient 获取
- 音视频文件必须先下载到本地磁盘，然后以文件路径传给 engine

**修正后的数据流**：

```
AI 生成音视频
  ↓
media-file-downloader 下载到 .neko/generated/（ADR-4）
  ↓
extension host 调用 EngineClient（通过 neko-preview API 或直接 dispatch）：
  ├─ probe(filePath)             → 时长、分辨率、编解码信息
  ├─ captureFrame(filePath, 0)   → poster 帧 base64（视频）
  └─ waveform(filePath)          → 波形峰值数据（音频）
  ↓
extension host 构造元数据 JSON：
  {
    posterUri: webview.asWebviewUri(posterPath),  // 或 data:image base64
    duration: 12.5,
    resolution: { width: 1920, height: 1080 },
    waveformPeaks: Float32Array,
    localPath: "/workspace/.neko/generated/video/scene-03.mp4"
  }
  ↓
postMessage 传给 webview（纯 JSON，无二进制）
  ↓
Chat webview 渲染静态卡片：
  ├─ VideoCard: poster 图 + 时长 + 分辨率 badge + 点击→neko-preview
  └─ AudioCard: 波形占位图 + 时长 badge + 点击→neko-preview
  ↓
用户点击 → postMessage('openFile', { filePath })
  ↓
extension host → vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview')
  ↓
neko-preview 独立面板：probe → stream → H264/PCM WebSocket 播放
```

#### 组件显示模式（修正后）

| 组件 | 展开模式（默认） | inline 模式（TaskCard 内用） |
|------|-----------------|------------------------------|
| `ImagePreview` | 折叠卡片 + `<img>` | 纯 `<img>` |
| `VideoCard` | 折叠卡片 + poster 图（engine 提供）+ 时长/分辨率 badge + 点击→neko-preview | 紧凑 poster + 点击→neko-preview |
| `AudioCard` | 折叠卡片 + 波形占位（engine 提供）+ 时长 badge + 点击→neko-preview | 波形图标 + 时长 + 点击→neko-preview |

三个组件的 inline/展开模式**行为一致**：均为静态展示 + 点击委托 neko-preview，消除了原来 AudioCard inline 使用 `<audio controls>` 的不一致。

#### 重命名

消除与 neko-preview 的命名冲突：

```
packages/neko-agent/packages/webview/src/components/ChatView/MediaPreview/
  VideoPlayer.tsx  →  VideoCard.tsx   （结果展示卡，非播放器）
  AudioPlayer.tsx  →  AudioCard.tsx   （结果展示卡，非播放器）
  ImagePreview.tsx →  保持不变
  index.ts         →  更新导出
```

影响文件：MessageItem.tsx、ToolCallDisplay.tsx、TaskCard.tsx（更新导入）。

---

### 6.2 RichContentBlock：结构化富内容扩展

#### 问题

当前 `ContentBlockType` 是封闭的联合类型：

```typescript
type ContentBlockType = 'thinking' | 'text' | 'tool_call' | 'code_diff' | 'plan';
```

每新增一种展示组件（分镜、表单、对比...）就要修改联合类型 + switch 分支 + 新组件，导致：
- 消息协议持续膨胀
- ContentBlock 接口的可选字段爆炸（`storyboard?: ...`, `form?: ...`, ...）
- Skill 无法引入自定义渲染器

#### 决策：注册表模式

新增唯一一种 `ContentBlockType: 'rich_content'`，用 `kind` 字段区分具体渲染器，组件通过注册表动态查找。

#### RichContentBlock Schema

位置：`@neko/shared/types/rich-content.ts`

```typescript
// === 核心协议类型（Layer 0，零依赖） ===

interface RichContentBlock {
  type: 'rich_content'
  kind: string                    // 'storyboard' | 'media_card' | 'comparison' | 'form' | ...
  data: Record<string, unknown>   // 结构化数据，schema 由 kind 决定
  actions?: RichContentAction[]   // 底部操作按钮
}

interface RichContentAction {
  id: string
  label: string
  icon?: string                   // codicon 名称
  command?: string                // vscode command ID（点击时 postMessage 到 extension host 执行）
  commandArgs?: unknown[]         // 命令参数
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
}
```

#### 渲染注册表

位置：`neko-agent/packages/webview/src/components/ChatView/RichContent/`

```typescript
// === 注册表（webview 侧） ===

interface RichContentRendererEntry<T = unknown> {
  kind: string
  validate: (data: unknown) => data is T    // 运行时类型校验
  component: React.ComponentType<RichContentProps<T>>
}

interface RichContentProps<T = unknown> {
  data: T
  actions?: RichContentAction[]
  onAction: (actionId: string) => void      // 统一操作回调
}

class RichContentRegistry {
  private renderers = new Map<string, RichContentRendererEntry>();

  register<T>(entry: RichContentRendererEntry<T>): void {
    this.renderers.set(entry.kind, entry);
  }

  get(kind: string): RichContentRendererEntry | undefined {
    return this.renderers.get(kind);
  }
}

// 全局单例
export const richContentRegistry = new RichContentRegistry();
```

ContentBlockRenderer 扩展：

```typescript
// ContentBlockItem.tsx — 新增一个 case
case 'rich_content': {
  const { kind, data, actions } = block.richContent!;
  const entry = richContentRegistry.get(kind);
  if (entry && entry.validate(data)) {
    const Renderer = entry.component;
    return <Renderer data={data} actions={actions} onAction={handleAction} />;
  }
  return <JsonFallbackView data={data} kind={kind} />;  // 兜底
}
```

#### ContentBlock 类型扩展

```typescript
// agent-types/src/message.ts
export type ContentBlockType =
  | 'thinking' | 'text' | 'tool_call' | 'code_diff' | 'plan'
  | 'rich_content';    // 新增

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  timestamp: number;
  // ... 现有字段 ...
  richContent?: RichContentBlock;   // 新增，type === 'rich_content' 时使用
}
```

#### 预置 kind 定义

##### `storyboard`：分镜网格

```typescript
// @neko/shared/types/rich-content-kinds/storyboard.ts
interface StoryboardData {
  title?: string
  scriptPath?: string                 // .fountain 源文件路径
  scenes: Array<{
    sceneIndex: number
    heading: string                   // "INT. 咖啡馆 - 日"
    shots: Array<{
      shotIndex: number
      shotScale?: string              // '全景' | '中景' | '特写'
      imageUri?: string               // webviewUri（已生成）
      prompt?: string                 // 生图提示词
      status: 'pending' | 'generating' | 'completed' | 'failed'
    }>
  }>
}
```

渲染效果：

```
┌─ 场景 3 · INT. 咖啡馆 · 日 ─────────────────────┐
│  ┌────────┐  ┌────────┐  ┌────────┐              │
│  │ 全景   │  │ 中景   │  │ 特写   │              │
│  │ [img]  │  │ [生成中]│  │ [待生成]│              │
│  └────────┘  └────────┘  └────────┘              │
│  [重新生成]  [在 Canvas 中编辑 ↗]                 │
└──────────────────────────────────────────────────┘
```

##### `media_card`：音视频展示卡（统一 VideoCard/AudioCard）

```typescript
// @neko/shared/types/rich-content-kinds/media-card.ts
interface MediaCardData {
  mediaType: 'video' | 'audio'
  localPath: string                   // 本地文件绝对路径
  posterUri?: string                  // webviewUri（视频 poster，engine captureFrame）
  waveformPeaks?: number[]            // 波形数据（音频，engine waveform）
  duration?: number                   // 秒
  resolution?: { width: number; height: number }
  codec?: string
  mimeType?: string
  model?: string                      // 生成模型
  prompt?: string                     // 生成提示词
}
```

##### `comparison`：多候选对比

```typescript
// @neko/shared/types/rich-content-kinds/comparison.ts
interface ComparisonData {
  title?: string
  candidates: Array<{
    label: string                     // "版本 A - 暖色调"
    imageUri: string
    prompt?: string
    metadata?: Record<string, string>
  }>
  layout: 'side-by-side' | 'grid'    // 并排 | 网格
  selectedIndex?: number              // 用户选中项
}
```

##### `form`：结构化参数确认

```typescript
// @neko/shared/types/rich-content-kinds/form.ts
interface FormData {
  title: string
  description?: string
  fields: Array<{
    key: string
    label: string
    type: 'text' | 'select' | 'number' | 'toggle' | 'slider'
    value: unknown
    options?: Array<{ label: string; value: unknown }>
    required?: boolean
    validation?: { min?: number; max?: number; pattern?: string }
  }>
  submitAction: string                // action ID
  cancelAction?: string
}
```

##### `data_table`：结构化数据表

```typescript
// @neko/shared/types/rich-content-kinds/data-table.ts
interface DataTableData {
  title?: string
  columns: Array<{
    key: string
    label: string
    width?: number
    align?: 'left' | 'center' | 'right'
  }>
  rows: Array<Record<string, unknown>>
  highlightRows?: number[]
  sortable?: boolean
}
```

---

### 6.3 跨包传递：数据共享，渲染独立

#### 原则

```
类型定义（@neko/shared）  →  所有包共享，单一来源
渲染组件（各 webview）    →  各包独立注册，互不依赖
操作命令（extension host）→  通过 vscode.commands 跨包调用
```

#### 分层

```
@neko/shared/types/rich-content.ts          ← Layer 0：RichContentBlock 核心协议
@neko/shared/types/rich-content-kinds/*.ts  ← Layer 0：各 kind 的 data schema
    │
    │  npm 依赖（类型级别）
    ▼
neko-agent webview:  RichContentRegistry + 渲染组件（StoryboardMessage 等）
neko-canvas webview: 消费 StoryboardData → 创建 SceneGroupNode + ShotNode
neko-cut webview:    消费 MediaCardData → 导入时间线轨道
neko-story webview:  消费 DataTableData → ScriptTableView 格式兼容
```

#### 数据流示例：分镜从 agent → canvas

```
agent extension host:
  1. AI 生成分镜 → 构造 StoryboardData JSON
  2. 写入 .neko/generated/index.json（ADR-4）
  3. postMessage → agent chat webview 渲染 StoryboardMessage

用户点击 [在 Canvas 中编辑 ↗]:
  4. agent webview → postMessage({ type: 'action', actionId: 'send-to-canvas' })
  5. agent extension host →
       vscode.commands.executeCommand('neko.canvas.importStoryboard', storyboardData)
  6. canvas extension host 接收 StoryboardData（@neko/shared 类型）
       → 创建 SceneGroupNode + ShotNode 链（canvas 自有逻辑）
       → 图片从 GeneratedAsset.path 加载（磁盘文件，不走内存传递）
```

#### 各包角色

| 包 | 消费的 kind | 做什么 |
|----|------------|--------|
| neko-agent | 所有 kind | 渲染展示组件，触发操作 |
| neko-canvas | storyboard, media_card | 接收数据创建画布节点 |
| neko-cut | media_card | 接收数据导入时间线 |
| neko-story | data_table | 格式兼容 ScriptTableView |
| neko-audio | media_card (audio) | 接收音频导入混音台 |

各包**只依赖 `@neko/shared` 的类型定义**，不依赖 neko-agent 的渲染组件。接收方通过 `vscode.commands.registerCommand` 注册导入命令，发送方通过 `vscode.commands.executeCommand` 调用，零直接依赖。

#### 为什么不共享业务渲染组件

| 因素 | 说明 |
|------|------|
| 独立 Vite bundle | 每个 webview 是独立构建入口，无法 import 其他 webview 的 React 组件 |
| 渲染需求不同 | 同一份 StoryboardData，agent 渲染为只读网格卡片，canvas 渲染为可拖拽节点 |
| 沙箱隔离 | 各 webview iframe 隔离，共享组件会引入复杂的依赖管理 |
| 数据已解耦 | kind schema 在 @neko/shared 是纯类型，无运行时依赖 |

#### 跨包渲染一致性保障

不共享业务组件，但需要三层机制保证各包渲染同一份数据时视觉风格一致。

**第一层：共享设计令牌（已建立，零额外成本）**

所有 webview 的 `tailwind.config.ts` 已统一引用 `nekoTailwindPreset`：

```
@neko/shared/theme/
  ├── tokens.ts           → --neko-surface / --neko-accent / --neko-fg-* / ...
  ├── tailwind-preset.ts  → nekoTailwindPreset（注入 CSS 变量 + 工具类）
  └── types.ts            → ThemeKind（light / dark / high-contrast）

所有 10 个 webview 共用 → 颜色、圆角、阴影、字号天然一致
```

**第二层：共享 UI 原子组件（需补充 4 个）**

现有 `@neko/shared/components` 有 11 个共享组件（MacButton / Panel / ContextMenu 等），偏工具栏/面板类。RichContent 场景需要补充以下**纯展示原子**：

```
@neko/shared/components/（Layer 2 DOM/React）
  ├── 已有 11 个：MacButton / MacIconButton / MacSlider / MacTabs / Panel /
  │               PanelSection / CollapsibleSection / ContextMenu / ToolbarButton /
  │               TimelineRuler / ProgressBar
  │
  └── 新增 4 个（RichContent 原子）：
      ├── Badge.tsx            ← 状态/元数据标签（"生成中" / "1920×1080" / "00:12"）
      ├── MediaThumbnail.tsx   ← 媒体缩略图容器（固定比例 + 加载态 + 错误态 + 覆盖层）
      ├── ActionBar.tsx        ← RichContent 底部操作按钮行（渲染 RichContentAction[]）
      └── StatusIndicator.tsx  ← 生成状态动画（pending → generating → completed → failed）
```

共享边界：

```
✅ 该共享的：纯展示原子（无业务逻辑，多包确实重复）
  Badge / MediaThumbnail / ActionBar / StatusIndicator

❌ 不该共享的：业务组件（各包交互逻辑完全不同）
  StoryboardMessage / SceneGroupNode / TimelineTrack / FormConfirmation
```

各包通过**组合共享原子**构建自己的业务组件：

```tsx
// neko-agent: StoryboardMessage（只读网格卡片）
import { Badge, MediaThumbnail, ActionBar, StatusIndicator } from '@neko/shared/components';

function StoryboardMessage({ data, actions, onAction }: RichContentProps<StoryboardData>) {
  return (
    <div className="flex flex-col gap-4">
      {data.scenes.map(scene => (
        <div key={scene.sceneIndex}>
          <div className="flex gap-2 mb-2">
            <Badge variant="info">{scene.heading}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {scene.shots.map(shot => (
              <MediaThumbnail key={shot.shotIndex} ratio="16:9">
                {shot.status === 'completed' && <img src={shot.imageUri} />}
                {shot.status === 'generating' && <StatusIndicator status="loading" />}
                {shot.shotScale && <Badge className="absolute top-1 left-1">{shot.shotScale}</Badge>}
              </MediaThumbnail>
            ))}
          </div>
        </div>
      ))}
      <ActionBar actions={actions} onAction={onAction} />
    </div>
  );
}

// neko-canvas: 同样的原子组件，但组合成可拖拽画布节点
import { Badge, MediaThumbnail } from '@neko/shared/components';

function ShotNode({ data }: CanvasNodeProps<ShotCanvasNode>) {
  return (
    <BaseNode resizable draggable>
      <MediaThumbnail ratio="16:9">
        <img src={data.generatedAsset?.webviewUri} />
        <Badge className="absolute top-1 left-1">{data.shotScale}</Badge>
      </MediaThumbnail>
      {/* canvas 特有：连接锚点、属性面板绑定等 */}
    </BaseNode>
  );
}
```

**第三层：Kind 渲染规约（文档契约）**

每个 kind 的 data schema 文件中附带渲染规约，作为各包实现渲染组件的参考标准：

```typescript
// @neko/shared/types/rich-content-kinds/storyboard.ts

interface StoryboardData { /* ... */ }

/**
 * ## Storyboard Rendering Spec
 *
 * Layout: Scene group cards, shots in horizontal grid within each group
 * Scene header: heading text + INT/EXT Badge + time-of-day Badge
 * Shot card: 16:9 ratio via MediaThumbnail, border-radius var(--neko-radius-md)
 *   - pending:    dashed border + placeholder text
 *   - generating: StatusIndicator skeleton animation
 *   - completed:  <img> + shotScale Badge top-left overlay
 *   - failed:     error icon + retry button
 * Action bar: ActionBar component, right-aligned
 * Spacing: shots gap-2, scenes gap-4
 */
```

规约不是强制代码约束，而是设计契约。各包开发者参照规约 + 使用共享原子组件，自然输出一致的渲染结果。当规约更新时，只需检查消费方是否对齐。

**三层保障总结**：

```
设计令牌（nekoTailwindPreset）  →  颜色/字号/间距一致     [已有]
UI 原子（Badge/Thumbnail/...） →  基础元素外观一致        [需补充 4 个]
渲染规约（JSDoc in schema）    →  组合布局/状态表现一致   [随 kind 一起定义]
```

---

### 6.4 与 GeneratedAsset 集成

ADR-4 的 `path → webviewUri` 转换适用于所有 Layer 2 组件和 RichContent 渲染器：

```
generateImage() 返回 GeneratedImage（含 path）
  │
  │  extension host
  ├─ toWebviewAsset(asset, webview) → { ...asset, webviewUri }
  │
  │  构造 RichContentBlock
  ├─ kind: 'storyboard' → shots[].imageUri = webviewUri
  ├─ kind: 'media_card' → posterUri = webviewUri
  ├─ kind: 'comparison' → candidates[].imageUri = webviewUri
  │
  │  postMessage 到 agent chat webview（纯 JSON）
  ▼
RichContentRegistry.get(kind).component 渲染
  ├─ <img src={shot.imageUri} />
  ├─ <img src={posterUri} />（视频 poster）
  └─ 波形数据 → Canvas 2D 绘制（音频）
```

此项改动不影响 Layer 1（neko-preview）的任何实现。

---

### 6.6 实施优先级

| 优先级 | 任务 | 工程量 | 依赖 |
|--------|------|--------|------|
| P0 | 重命名 VideoPlayer→VideoCard, AudioPlayer→AudioCard | ~30 min | 无 |
| P0 | 定义 `RichContentBlock` 类型 + `RichContentRegistry` + JsonFallbackView | ~200 行 | 无 |
| P0 | `ContentBlockType` 新增 `rich_content` + `ContentBlockItem` 新增 case | ~30 行 | 上一步 |
| P0 | 共享 UI 原子：Badge + MediaThumbnail + ActionBar + StatusIndicator | ~300 行 | 无 |
| P1 | `media_card` kind：VideoCard/AudioCard 统一为注册表条目，元数据从 engine 获取 | ~200 行 | ADR-4 GeneratedAsset |
| P1 | `storyboard` kind：分镜网格组件 | ~300 行 | ADR-2 parse_script_to_shots |
| P2 | `comparison` kind：多候选对比 | ~150 行 | 无 |
| P2 | `form` kind：结构化表单 | ~200 行 | 无 |
| P3 | `data_table` kind：结构化数据表 | ~100 行 | 无 |

---

## 总结

```
统一原则：
  二进制 → 磁盘（一次写入）
  插件间传递 → GeneratedAsset JSON + RichContentBlock JSON（轻量引用）
  展示 → 各自 webview 独立渲染
  类型 → @neko/shared 共享 schema，渲染组件各包独立

职责划分：
  neko-story   → 剧本编辑 + 场景分解表（文字）
  neko-agent   → 生成 + 展示结果 + 决策（富媒体 chat + RichContent）
  neko-canvas  → 分镜编辑工作台（空间排布，可选）

自足性：
  agent 无需其他插件即可完成生成→展示→保存
  canvas/cut/audio 安装时提供渐进增强路径（"发送到"按钮）

预览三层：
  Layer 1  neko-preview       → 完整流媒体播放（H264 / PCM streaming via engine）
  Layer 2  agent MediaPreview → 轻量结果卡片（元数据从 engine 获取，点击→Layer 1）
  Layer 3  RichContentBlock   → 结构化富内容（注册表模式，kind → 组件动态映射）

音视频约束：
  VSCode webview 不用 <audio>/<video> 原生播放
  全部走 neko-engine 解码流式传输
  音视频先下载到本地 → 文件路径 → engine probe/stream

跨包传递：
  类型定义在 @neko/shared（所有包共享）
  渲染组件各 webview 独立（不跨包共享业务组件）
  操作传递通过 vscode.commands（零直接依赖）

渲染一致性（三层保障）：
  设计令牌（nekoTailwindPreset）    → 颜色/字号/间距一致      [已有]
  UI 原子（Badge/MediaThumbnail/ActionBar/StatusIndicator）
                                    → 基础元素外观一致         [需补充]
  渲染规约（JSDoc in kind schema）  → 组合布局/状态表现一致    [随 kind 定义]
```

---

## 实施记录

**日期**: 2026-04-03

### 已实施（Phase 1-5）

| Phase | ADR | 交付物 | 关键文件 |
|-------|-----|--------|---------|
| 1 | ADR-4 | GeneratedAsset 类型层次 + GeneratedAssetIndex + toWebviewAsset + ShotNode 双写 | `@neko/shared/types/generated-asset.ts`, `generatedAssetIndex.ts`, `webview-asset.ts`, `canvas.ts` |
| 2 | ADR-6 | VideoPlayer→VideoCard / AudioPlayer→AudioCard 重命名 + AudioCard inline 修正 | `VideoCard.tsx`, `AudioCard.tsx`, `index.ts` |
| 3 | ADR-3+5 | ImageGridCard 多图网格 + SendToMenu 跨插件按钮 + TaskCard 集成 + pluginsAvailable 检测 | `ImageGridCard.tsx`, `SendToMenu.tsx`, `TaskCard.tsx`, `chatProvider.ts` |
| 4 | ADR-4 | `neko.canvas.importAsset` 命令 + postImportAsset + saveGeneratedImage 迁移 | `extension.ts`, `canvasEditorProvider.ts` |
| 5 | ADR-3 | StoryboardMessage 场景分组组件 | `StoryboardMessage.tsx` |

### 向下兼容策略

- `ShotNode.generatedImage?: string` 保留（`@deprecated`），新增 `generatedAsset?: GeneratedImage`
- `AudioPlayer` / `VideoPlayer` 作为别名保留在 `index.ts` 导出
- `taskUpdated` 消息保留 `urls` / `localPaths` 字段，`assets` 作为新增字段

### 待实施

- ADR-5 P1: Extension Host DragDropBroker 代理拖拽（~100 行）
- ADR-4: agentStreamProcessor 构造 GeneratedAsset JSON 并写入 index.json
- ADR-6 §6.2: RichContentBlock 注册表模式（kind 扩展点）
- 磁盘空间管理：`.neko/generated/` 清理策略（TTL / LRU / 手动）
