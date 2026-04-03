# Agent 媒体架构：生成资产、富媒体展示与跨插件传递

**状态**: ADR（架构决策记录）  
**日期**: 2026-04-03  
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

## ADR-6：预览组件分层架构

**日期**: 2026-04-03

### 问题

neko-suite 中存在多套名称相近的"预览组件"（VideoPlayer、AudioPlayer），需要明确各自的职责边界，判断是否需要统一。

### 决策

**两套预览组件职责不同、不应合并，但需修正 AudioPlayer inline 实现的不一致。**

### 两层架构

```
Layer 1：neko-preview（完整流媒体播放应用）
  ├── VideoPlayer  ← H264StreamClient + WebCodecs + FrameScheduler + PiP
  └── AudioPlayer  ← AudioStreamClient (PCM over WebSocket) + 波形 + 歌词 + 频谱
  以 CustomReadonlyEditorProvider 打开，独立编辑器面板，依赖 @neko/neko-client

Layer 2：neko-agent MediaPreview（生成结果展示卡片）
  ├── ImagePreview  ← <img>，折叠卡片，点击在 VSCode 中打开
  ├── VideoCard     ← <video> 取 poster/时长，点击 → openFile → neko-preview
  └── AudioCard     ← 音频信息卡片，点击 → openFile → neko-preview
  嵌入 Chat 对话中，委托播放给 Layer 1，无 neko-client 依赖
```

### 组件显示模式

MediaPreview 组件支持两种模式：

| 组件 | 展开模式（默认） | inline 模式（TaskCard 内用） |
|------|-----------------|------------------------------|
| `ImagePreview` | 折叠卡片 + `<img>` | 纯 `<img>` |
| `VideoCard` | 折叠卡片 + `<video>` poster + 点击→neko-preview | `<video>` thumbnail + 点击→neko-preview |
| `AudioCard` | 折叠卡片 + 信息行 + 点击→neko-preview（无原生播放） | ⚠️ `<audio controls>` 原生元素 |

### 唯一不一致点：AudioCard inline 模式

`VideoCard` inline 和展开模式都委托给 neko-preview（一致）；  
`AudioCard` inline 模式回退为 `<audio controls>` 原生元素（不一致）。

**修正方向**：与 VideoCard inline 对齐——显示静态波形占位 + 点击跳转 neko-preview，而非内嵌原生播放控件：

```tsx
// AudioCard inline — 应改为与 VideoCard inline 一致的交互
function InlineAudioCard({ src, title, localPath }: InlineProps) {
  return (
    <div onClick={() => openInPreview(localPath || src)}
         className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
                    hover:bg-[var(--vscode-list-hoverBackground)]">
      <AudioWaveformPlaceholder />     {/* 静态波形图标 */}
      <span className="flex-1 truncate text-[11px]">{fileName}</span>
      {duration > 0 && <span className="text-[10px]">{formatTime(duration)}</span>}
      <span className="text-[9px] opacity-60">Open in Preview</span>
    </div>
  )
}
// 保留 <audio preload="metadata"> 隐藏元素仅用于提取 duration，不显示控件
```

### 重命名建议

消除与 neko-preview 的命名冲突：

```
packages/neko-agent/packages/webview/src/components/ChatView/MediaPreview/
  VideoPlayer.tsx  →  VideoCard.tsx   （结果展示卡，非播放器）
  AudioPlayer.tsx  →  AudioCard.tsx   （结果展示卡，非播放器）
  ImagePreview.tsx →  保持不变
  index.ts         →  更新导出
```

### 不统一的理由

- 两个 webview 是独立 Vite 构建（不同 bundle entry），React 组件无法跨包共享
- Layer 1 核心逻辑（WebCodecs/PCM 流）与 Layer 2（`<img>`/`<video>` 元数据）之间无可复用业务逻辑
- 强行共享会引入新的 VSCode 沙箱依赖管理问题

### 与 GeneratedAsset 集成

ADR-4 中的 `path → webviewUri` 转换适用于 Layer 2 所有组件：

```
generateImage() 返回 GeneratedImage（含 path）
  │
  │  extension host
  ├─ toWebviewAsset(asset, webview) → { ...asset, webviewUri }
  │
  │  postMessage 到 agent chat webview
  ▼
ImagePreview src={asset.webviewUri}    ← 替换当前的 dataUrl
VideoCard   src={asset.webviewUri}     ← 新增视频结果展示
AudioCard   src={asset.webviewUri}     ← 新增音频结果展示
```

此项改动不影响 Layer 1（neko-preview）的任何实现。

---

## 总结

```
统一原则：
  二进制 → 磁盘（一次写入）
  插件间传递 → GeneratedAsset JSON（轻量引用）
  展示 → 各自 asWebviewUri 转换

职责划分：
  neko-story   → 剧本编辑 + 场景分解表（文字）
  neko-agent   → 生成 + 展示结果 + 决策（富媒体 chat）
  neko-canvas  → 分镜编辑工作台（空间排布，可选）

自足性：
  agent 无需其他插件即可完成生成→展示→保存
  canvas/cut/audio 安装时提供渐进增强路径

预览分层：
  neko-preview     → 完整流媒体播放（H264 / PCM streaming）
  agent MediaPreview → 轻量结果卡片（委托播放给 neko-preview）
  AudioCard inline → 修正为与 VideoCard inline 一致（点击→neko-preview）
```
