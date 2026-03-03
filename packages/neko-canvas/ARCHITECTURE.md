# neko-canvas 架构

> 无限画布 + 节点图编辑器，支持媒体节点内联播放、故事板卡片、连接系统和自动对齐。

---

## 系统定位

neko-canvas 是 Neko Suite 的可视化编排工具。以 VSCode CustomEditor 方式打开 `.jvc` 画布文件，提供无限画布上的节点摆放、连接、媒体内联播放等能力。它也是 neko-sketch（绘画工具）的基础平台。

---

## 子包结构

```
packages/neko-canvas/
├── packages/
│   ├── extension/    # Extension Host（Node.js）— 文件 I/O + 媒体代理
│   └── webview/      # Webview（React 18）— 无限画布 UI
└── package.json      # VSCode 扩展清单
```

---

## 整体架构

```
┌───────────────────────────────────────────────────────────┐
│                   VSCode Extension Host                    │
│                                                           │
│  extension.ts                                             │
│    ├─ CanvasEditorProvider (CustomEditorProvider)          │
│    │    └─ 处理 .jvc 文件读写                              │
│    │    └─ 消息分发（save/pickMedia/dropFiles/media:*）    │
│    │                                                     │
│    ├─ Views                                              │
│    │    ├─ CanvasOutlineProvider (TreeView 大纲)           │
│    │    ├─ CanvasStatusBar (节点数/选区/缩放)              │
│    │    ├─ CanvasTimelineProvider                        │
│    │    └─ AssetLibrary (资产库视图)                      │
│    │                                                     │
│    └─ 媒体代理 → neko-preview API（延迟加载）              │
│         └─ probe / play / seek / pause / captureFrame    │
│                                                           │
│         │ postMessage                                     │
│         ▼                                                 │
│  ┌─────────────────────────────────────────────────┐      │
│  │            Webview (React 18 + Vite)             │      │
│  │                                                 │      │
│  │  CanvasApp.tsx                                  │      │
│  │    ├─ InfiniteCanvas                            │      │
│  │    │    ├─ CanvasGrid (背景网格)                 │      │
│  │    │    ├─ CanvasViewport (CSS transform 变换层) │      │
│  │    │    ├─ ConnectionLayer (SVG 连线)            │      │
│  │    │    └─ Node Components                      │      │
│  │    │         ├─ MediaNode (视频/音频/图片)       │      │
│  │    │         ├─ StoryboardNode (故事板卡片)      │      │
│  │    │         ├─ AnnotationNode (文字注释)        │      │
│  │    │         ├─ TextNode (排版文字)              │      │
│  │    │         └─ ArtboardNode (画板/画框)         │      │
│  │    │                                            │      │
│  │    ├─ Controls                                  │      │
│  │    │    ├─ ZoomControls (缩放控制)               │      │
│  │    │    ├─ MiniMap (全局缩略导航)                │      │
│  │    │    └─ LayerPanel (图层树)                   │      │
│  │    │                                            │      │
│  │    ├─ CanvasToolbar (工具栏)                    │      │
│  │    ├─ PropertyPanel (属性面板)                   │      │
│  │    └─ ContextMenu (右键菜单)                    │      │
│  │                                                 │      │
│  │  Zustand Stores                                 │      │
│  │    ├─ canvasStore (节点/连接/选区/视口)           │      │
│  │    ├─ historyStore (撤销/重做)                   │      │
│  │    └─ clipboardStore (复制/粘贴)                 │      │
│  │                                                 │      │
│  │  Interaction Hooks                              │      │
│  │    ├─ useViewportTransform (平移/缩放)           │      │
│  │    ├─ useNodeDrag (节点拖拽)                     │      │
│  │    ├─ useNodeResize (8 点缩放)                   │      │
│  │    ├─ useConnectionDrag (拖拽连线)               │      │
│  │    ├─ useViewportCulling (视口裁剪优化)           │      │
│  │    ├─ useSnap (对齐吸附)                        │      │
│  │    └─ useCanvasCoordinates (屏幕↔画布坐标转换)    │      │
│  └─────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────┘
          │ WebSocket (通过 neko-preview API)
          ▼
    neko-engine (Rust Sidecar)
      └─ H.264 + PCM 流（媒体节点内联播放）
```

---

## 节点系统

### 支持的节点类型

| 节点类型 | 用途 | 特殊能力 |
|---------|------|---------|
| `MediaNode` | 视频/音频/图片 | 内联 H.264+PCM 播放、帧截取 |
| `StoryboardNode` | 场景/故事板卡片 | 标题 + 描述 + 缩略图 |
| `AnnotationNode` | 文字注释 | 自由文本 |
| `TextNode` | 排版文字 | 富文本编辑 |
| `ArtboardNode` | 画板/画框 | 固定尺寸容器 |
| `GroupNode` | 分组 | 层级组织 |

### 连接系统

```
节点可定义 ports（输入/输出端口）
  → 拖拽连线时实时预览
  → 类型验证（image/video/audio/text/any）
  → 端口最大连接数限制
```

---

## 核心数据流

### 打开画布

```
用户打开 .jvc 文件
  → CanvasEditorProvider.resolveCustomEditor()
    → 读取 JSON → postMessage('update', canvasData)
      → canvasStore 初始化节点/连接/视口
```

### 节点交互

```
用户拖拽节点
  → useNodeDrag hook 更新位置
    → useSnap 计算吸附（网格/其他节点）
      → AlignmentGuides 显示辅助线
        → canvasStore 更新
          → historyStore 推入撤销栈

用户拖拽连线
  → useConnectionDrag hook
    → 类型兼容性验证
      → ConnectionLayer SVG 渲染
        → canvasStore.addConnection()
```

### 媒体内联播放

```
用户点击 MediaNode
  → postMessage('media:play', {path})
    → Extension Host → neko-preview API
      → neko-engine 流启动
        → H264StreamClient / AudioStreamClient
          → InlineMediaPlayer 渲染
```

### 文件拖放

```
VSCode Explorer 拖放文件到 Webview
  → postMessage('resolveDroppedFiles', paths)
    → Extension Host 解析文件类型 + probe
      → postMessage('dropMedia', mediaInfo)
        → canvasStore.addNode(MediaNode, dropPosition)
```

---

## 性能优化

| 策略 | 实现 |
|------|------|
| **视口裁剪** | `useViewportCulling` — 仅渲染可见区域内的节点 |
| **CSS Transform** | `CanvasViewport` — 通过 CSS transform 实现平移/缩放，避免重绘 |
| **对齐缓存** | `snapEngine` — 缓存对齐线计算结果 |
| **按需加载** | neko-preview API 延迟获取，仅在媒体播放时加载 |

---

## 通信协议

### Webview → Extension

```
ready                      — Webview 就绪
save(canvasData)           — 保存画布 JSON
canvasStatus(info)         — 同步大纲/状态栏
pickMedia                  — 打开文件选择器
resolveDroppedFiles(paths) — 解析拖放的文件
media:probe(path)          — 媒体探测
media:play/seek/pause/stop — 播放控制
media:captureFrame         — 截取帧
```

### Extension → Webview

```
update(canvasData)         — 加载画布数据
keyboardAction(action)     — 转发快捷键
addMedia(mediaInfo)        — 文件选择器结果
dropMedia(mediaInfoList)   — 拖放文件解析结果
```

---

## 关键设计模式

| 模式 | 应用 |
|------|------|
| **CustomEditorProvider** | .jvc 文件的 VSCode 编辑器集成 |
| **Zustand Store** | 集中式不可变状态（canvasStore + historyStore + clipboardStore） |
| **Hook 组合** | 交互逻辑封装为可组合的自定义 Hook |
| **Viewport Culling** | 性能优化 — 仅渲染视口内节点 |
| **Lazy API** | neko-preview API 延迟获取，按需加载 |
| **Port-based Connection** | 类型化端口 + 连接验证 |

---

## 项目文件格式

- **扩展名**: `.jvc`（JSON Visual Canvas）
- **格式**: 序列化的画布数据（节点列表 + 连接列表 + 视口状态）
- **编辑器 viewType**: `neko.canvasEditor`

---

## 技术栈

| 层级 | 技术 |
|------|------|
| Extension Host | VSCode Extension API + TypeScript + esbuild |
| Webview UI | React 18 + Zustand + Tailwind CSS + Vite |
| 画布渲染 | CSS Transform（平移/缩放）+ SVG（连线） |
| 媒体播放 | 委托 neko-preview API（H264StreamClient / AudioStreamClient） |
| 交互系统 | 自定义 React Hooks（drag/resize/snap/connect） |
| 测试 | Vitest |
