# ADR: 面板放置策略 — 内嵌 Webview vs VSCode 原生容器

> 状态：已决策
> 日期：2026-03-16
> 范围：所有扩展的属性面板、滤镜面板、工具面板、全局面板

---

## 背景

Neko Suite 包含多种面板类型：属性编辑、滤镜参数、AI 助手、资产库、图层目录等。VSCode 提供两种放置方式：

1. **内嵌 Webview** — 面板作为编辑器 Webview 的一部分渲染（同一 React 树）
2. **VSCode 原生容器** — 面板注册为独立的 WebviewViewProvider（Activity Bar 侧栏）、Panel（底栏）或 TreeView（Explorer）

需要决定每种面板应采用哪种方式。

---

## 决策

### 核心原则：按编辑器绑定性分类

```
面板是否绑定特定编辑器实例？
├─ YES → 内嵌 Webview
└─ NO  → VSCode 原生容器
```

### 具体分配

| 面板 | 方案 | 理由 |
|------|------|------|
| neko-cut 属性面板 | **内嵌 Webview** | 绑定选中元素，编辑器实例级状态 |
| neko-sketch 滤镜面板 | **内嵌 Webview** | GPU 实时反馈 + 共享 WebGL 上下文 |
| neko-canvas 属性面板 | **内嵌 Webview** | 与 neko-cut 同理 |
| neko-model 属性面板 | **内嵌 Webview** | 与 neko-cut 同理 |
| Outline 目录树 | **Explorer TreeView** | 轻量数据，VSCode 原生 TreeView 最合适 |
| neko-agent AI 助手 | **Panel 底栏** | 全局功能，跨编辑器共享 |
| neko-assets 资产库 | **Activity Bar 侧栏** | 全局功能，跨编辑器拖拽 |
| neko-live 直播预览 | **Panel 底栏** | 全局功能，独立于文件编辑 |

---

## 分析

### 侧边栏方案的冲突清单

将编辑器绑定面板（如属性面板）放在 VSCode 侧边栏会引入以下问题：

| 冲突 | 严重性 | 说明 |
|------|--------|------|
| 幽灵数据 | P0 | 切换 tab 后侧栏显示旧编辑器的数据，用户误编辑 |
| 多同类文件闪烁 | P1 | 同时打开 A.nkv + B.nkv，面板状态依赖最后一次事件 |
| Activity Bar 膨胀 | P1 | 多个扩展各注册一个属性容器，图标堆积 |
| IPC 消息丢失 | P2 | Webview 未 ready 时 postMessage 静默丢失 |
| 状态双写 | P2 | Extension Host + React 各维护一份状态 |
| 多 bundle 构建 | P2 | 每个侧栏面板需独立 HTML + JS 入口 |

### 内嵌 Webview 方案的冲突清单

| 冲突 | 严重性 |
|------|--------|
| 无 | — |

每个编辑器 tab 是独立 Webview 实例，面板状态天然隔离。

### 代码量对比

```
内嵌方案（以属性面板为例）：
  PropertyPanel.tsx             ← 一个组件，直接读 Zustand store

侧边栏方案（以 neko-cut 现状为例）：
  PropertyPanelViewProvider.ts  ← Extension 端 Provider（283 行）
  PropertyPanelStandalone.tsx   ← 独立入口包装组件
  PropertyPanel.tsx             ← 实际 UI 组件（同内嵌）
  propertyPanel.html            ← 独立 HTML 入口
  vite.config.ts 多入口         ← 构建配置修改
  extension.ts 事件桥接          ← Editor ↔ Panel 双向 EventEmitter
  消息类型定义 × 6 种            ← IPC 类型契约
```

### 空间占用是伪命题

侧边栏唯一的优势是"不占主编辑区空间"，但：

1. VSCode 侧边栏本身也占屏幕空间，只是从 Webview 转移到 VSCode 容器
2. 内嵌面板可折叠/收起，不用时不占空间
3. 复杂属性面板（neko-cut 有 9 个 PropertyGroup）在窄侧边栏里体验反而差

### GPU 耦合场景（neko-sketch）

```
FilterPanel 参数变更
  → Zustand store 更新
  → SketchCanvas requestAnimationFrame
  → SketchRenderer.renderWithEffects()
  → FilterPipeline.applyFilters()  ← WebGL2 ping-pong FBO
  → GPU 输出到屏幕（16ms 内）
```

如果拆到侧边栏，需跨进程 postMessage 往返（+30-50ms），拖拽滑块体验不可接受。

---

## 当前视图注册全景

### Activity Bar

| Container ID | 所属扩展 | 内含视图 | when 条件 |
|---|---|---|---|
| `neko-asset-manager` | neko-assets | 4 个 TreeView | 无（全局） |
| `neko-properties` | neko-cut | `neko.propertyPanel` | ⚠️ 无（应迁移为内嵌） |

### Panel（底部面板）

| Container ID | 所属扩展 | 内含视图 | when 条件 |
|---|---|---|---|
| `neko-assistant` | neko-agent | `neko.aiAssistant` | 无（全局，正确） |
| `neko-live` | neko-live | `neko.livePreview` | 无（全局，正确） |

### Explorer

| View ID | 所属扩展 | when 条件 |
|---|---|---|
| `neko.projectOutline` | neko-cut | `activeCustomEditorId == 'neko.videoEditor'` |
| `neko.canvasOutline` | neko-canvas | `activeCustomEditorId == 'neko.canvasEditor'` |
| `neko.sketchLayerOutline` | neko-sketch | `activeCustomEditorId == 'neko.sketchEditor'` |

### Custom Editors

| ViewType | 扩展 | 文件类型 | Priority |
|---|---|---|---|
| `neko.videoEditor` | neko-cut | `*.nkv` | default |
| `neko.canvasEditor` | neko-canvas | `*.nkc` | default |
| `neko.sketchEditor` | neko-sketch | `*.nks` | default |
| `neko.modelEditor` | neko-model | `*.gltf/*.glb/*.vrm` | default |
| `neko.videoPreview` | neko-preview | 视频文件 | default |
| `neko.audioPreview` | neko-preview | 音频文件 | default |
| `neko.mediaDiff` | neko-tools | 多媒体文件 | option |
| `neko.assetVariantDiff` | neko-tools | `*.asset-diff` | default |

---

## 无冲突验证

| 组合 | 状态 | 原因 |
|------|------|------|
| Outline × Outline | ✅ | 互斥 `when` 条件 |
| Agent 面板 × 任何编辑器 | ✅ | 独立 Panel 容器 |
| Live 面板 × 任何编辑器 | ✅ | 独立 Panel 容器 |
| Assets 侧栏 × 任何编辑器 | ✅ | 全局功能，命令解耦 |
| 快捷键 × 快捷键 | ✅ | 全部用 `activeCustomEditorId` 隔离 |
| CustomEditor × CustomEditor | ✅ | 文件类型不重叠 |
| 内嵌属性面板 × 多 tab | ✅ | 每个 tab 独立实例 |

---

## 迁移计划

### neko-cut PropertyPanel 侧边栏 → 内嵌

1. 将 `PropertyPanel.tsx` 集成到主编辑器 Webview 的 React 树中
2. 用 Zustand store 替代 postMessage IPC
3. 删除 `PropertyPanelViewProvider.ts`、`PropertyPanelStandalone.tsx`、`propertyPanel.html`
4. 从 `package.json` 移除 `neko-properties` viewsContainer
5. 从 Vite 配置移除 `propertyPanel` 入口
6. 从 `extension.ts` 移除 EventEmitter 桥接代码

### 其他编辑器

neko-canvas、neko-model 如需属性面板，直接采用内嵌方案，不重复侧边栏的错误。

---

## 参考

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — 系统架构总览
