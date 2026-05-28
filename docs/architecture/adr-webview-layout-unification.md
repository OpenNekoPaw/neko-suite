# ADR: Webview 布局统一 — 布局原型提炼 + VSCode 原生 UI 整合 + 各子包布局优化

## 状态

Proposed (2026-05-22)

## 实施状态

Updated: 2026-05-26

OpenSpec changes: `implement-webview-layout-unification`, `standardize-creative-workbench-shell`

| 阶段 | 状态 | 已落地内容 |
|------|------|------------|
| Phase 0: 契约与基础设施 | Done | `StatusBarItemSpec` / Extension 侧 StatusBar 管理、`ResizeState` + `usePersistedResize` 已完成并有单测覆盖 |
| Phase 1: 先建后拆 | Done | Model 状态投射到原生 StatusBar 后移除 `WorkbenchTopBar`；Canvas subsystem/projection 状态迁入 `CanvasStatusBar`，Webview 左下状态遮挡移除 |
| Phase 2: Agent Header | Deferred / Rolled back | Agent Webview Header 设计存在问题，已回退到原 Webview 内 New Chat / History / AccountBar / TabBar 方案；后续另立 Agent redesign |
| Phase 3: Agent Input 分层 | Deferred / Rolled back | Agent session/chat model/native QuickPick 同步与齿轮 Popover 方案已回退；InputArea 保持原 Webview 选择器与生成参数布局 |
| Phase 4: Resize 补全 | Done | Model Right Dock、Outliner/Properties split、Timeline 高度使用持久化 resize；Puppet 右面板支持 280px 默认、200-400px 约束；Cut PreviewControls 增加设置/溢出菜单，PropertyPanel 宽度约束为 200-400px |
| Creative Workbench Shell | Done | `neko-cut`、`neko-canvas`、`neko-audio`、`neko-puppet`、`neko-model`、`neko-sketch` 已统一为左侧工具栏 + 主面板 + 右侧面板 + VSCode 原生 StatusBar 的布局契约 |
| Tool responsibility split | Done | 六个创意子包已按“左侧工具栏=通用/常用动作与显隐，主面板=创作表面与 Cut 时间线控制组件，右侧面板=属性/检查器/局部分区，StatusBar=被动状态”拆分；Cut 保留 timeline 控制条，其他子包不再引入横向命令工具栏 |
| Token/Icon guardrails | Done | 本次触及布局代码未新增 package-specific CSS token 前缀；新增低频预览菜单图标使用 `@neko/shared/icons`，广义 token/icon 迁移仍归属 UI Design System ADR |

验证证据采用目标测试和布局断言而非全量视觉截图：StatusBar 可见性、Canvas 状态迁移、Model/Puppet resize、Cut 窄布局结构，以及六个创意子包的 Workbench shell 职责均已有对应测试或 DOM/source assertion。Agent Header/Input 回退后不再作为本变更验收范围；完整验收状态以 `openspec/changes/implement-webview-layout-unification/tasks.md` 和 `openspec/changes/standardize-creative-workbench-shell/tasks.md` 为准。

## 关联 ADR

| 关联文档 | 关系 |
|---|---|
| [adr-webview-ui-design-system.md](./adr-webview-ui-design-system.md) | 本 ADR 聚焦布局结构层；UI Design System ADR 聚焦组件层 + 设计 token，两者互补 |
| [vscode-constraints.md](./vscode-constraints.md) | Webview 安全沙盒约束 — 布局方案必须在 CSP / 无 Node.js / 无 vscode API 限制下运作 |
| [adr-device-management.md](./adr-device-management.md) | 原生 VSCode UI（TreeView/QuickPick/StatusBar）与 Webview UI 的边界划分 |

---

## 1. 背景

### 1.1 当前布局碎片化现状

Neko Suite 10+ 个 webview 子包各自实现布局 Shell，导致以下问题：

| 问题 | 表现 |
|------|------|
| CSS 变量前缀碎片化 | 6 套独立命名空间：`--neko-*` / `--agent-*` / `--sketch-*` / `--model-*` / `--marketplace-*` / `--canvas-*`，同一语义颜色变量名不同 |
| 图标方案分裂 | 5 种策略并存：`@neko/shared/icons`(35 个) / 内联 SVG / Unicode 符号 / VSCode codicon / 无图标 |
| 布局 Shell 各自实现 | 相似结构（工具栏+主区+侧栏+底栏）从零构建，resize/collapse/persist 逻辑重复 |
| Header/StatusBar 冗余 | 多个子包在 Webview 内重建 VSCode 已提供的 UI 层（标题栏、状态信息） |
| 空间效率低 | neko-agent Header 占 44px + Input 占 220px，消息区被严重压缩 |

### 1.2 各子包布局现状

| 子包 | 布局模式 | CSS 前缀 | 图标方案 | 共享组件 | Webview Header | Webview 内状态 |
|------|---------|----------|---------|---------|---------------|--------------|
| neko-cut | 三栏(预览+时间线+属性) | `--neko-*` | shared icons | 高 | 无 | 无 |
| neko-agent | 单列聊天 | `--agent-*` | shared icons | 低 | TabBar+Actions (44px) | 无 |
| neko-canvas | 左侧工具栏+画布+右侧创建面板 | `--canvas-*`, `--neko-*` | shared icons | 高 | 无 | StatusBar |
| neko-sketch | 工具栏+画布+右面板+帧 | `--sketch-*` | 内联 SVG (~16) | 高 | 无 | AIRunMonitor |
| neko-model | 顶栏+视口+右Dock+时间线 | `--model-*` | 内联 SVG (~10) | 高 | WorkbenchTopBar (36px) | 引擎状态在 TopBar |
| neko-puppet | 视口+右面板栈+关键帧 | `--sketch-*` (复用) | Unicode 符号 | 高 | 无 | 无 |
| neko-story | 全屏文档 | 无前缀 | 无 | 无 | 无 | 无 |
| neko-market | 搜索+标签+内容 | `--marketplace-*` | codicon | 无 | SearchBar+TabBar | 无 |
| neko-live | 全屏视口+底部面板 | 直接 `--vscode-*` | 无 | 低 | 无 | 无 |
| neko-preview | 多入口(video/pdf/cbz/panorama) | `--neko-preview-*` | 混合 | 低 | 各 viewer 顶栏 | 无 |

### 1.3 VSCode 原生 UI 已占用情况

| UI 层 | 已占用情况 |
|-------|-----------|
| Activity Bar | 3 个自定义容器 (neko-assistant, neko-asset-manager, neko-devices) |
| Status Bar | 5-6 个 items (agent/engine/tools/assets/audio 等) |
| Editor Title | 4 个扩展贡献按钮 (story/preview/agent/dashboard) |
| Tree Views | 6+ 个 (audio outline, canvas outline, sketch layers, epub, assets ×3) |
| Custom Editors | 15+ 个 (各创作格式 + preview 格式) |

---

## 2. 布局场景分析

### 2.1 八种布局场景

通过分析项目内各子包实现与行业标准应用，识别出八种核心布局场景：

#### 场景 1：剪辑 (NLE)

代表：Premiere Pro, DaVinci Resolve, **neko-cut**

```
┌───────────────────────────────────┬─────────────────┐
│ Preview (flex: ratio, 20%-80%)    │ Property Panel   │
│                                   │ 固定宽度, 可折叠  │
├──── ResizeHandle (ns) ───────────┤ 可 resize (ew)   │
│ Timeline (flex: 1 - ratio)        │                  │
│                                   │                  │
└───────────────────────────────────┴─────────────────┘
```

核心特征：预览+时间线上下分割（比例可拖），右侧属性面板可折叠。全屏模式下时间线隐藏。

#### 场景 2：画布 (Node-Based Canvas)

代表：Figma, Miro, ComfyUI, **neko-canvas**

```
┌─ Top Toolbar ─────────────────────────────────────────┐
├──────────┬────────────────────────────────────────────┤
│ Node     │ Infinite Canvas (flex-1, relative)         │
│ Library  │   ┌──────────┐ FloatingPanel (z-20)       │
│ 可折叠    │   └──────────┘                            │
│ w-[220]  │              ┌─────────┐ MiniMap+Zoom     │
│          │              └─────────┘ (absolute)       │
└──────────┴────────────────────────────────────────────┘
```

核心特征：无限画布是绝对主角。浮动面板替代固定 dock，控件 absolute 悬浮在画布上。

#### 场景 3：素描 / 2D 绘画 (Raster Paint)

代表：Photoshop, Krita, **neko-sketch**

```
┌──────┬─────────────────────────┬──────────────┐
│V-    │ Canvas (flex-1)         │ Sidebar      │
│Tool  │ WebGL2                  │ 可折叠/resize │
│bar   │                        │ Collapsible  │
│(窄)  │                        │ Panels ×N    │
├──────┴─────────────────────────┴──────────────┤
│ Frame Timeline (底部, 可选)                     │
└────────────────────────────────────────────────┘
```

核心特征：画布占最大面积，左侧垂直工具栏极窄 (32-40px)，右侧属性栏按活动工具条件显示面板。

#### 场景 4：DAW (Digital Audio Workstation)

代表：Ableton Live, Logic Pro, FL Studio, Reaper（**项目未来可能新增**）

```
┌─ Transport Bar (播放/录音/BPM/时间码) ──────────────────┐
├──────────┬────────────┬─────────────────────────────────┤
│ Browser  │ Track      │ Timeline / Arrangement           │
│ 可折叠    │ Headers    │ (波形/MIDI/自动化, 可滚动)        │
│          │ (固定宽度)  │                                  │
├──────────┴────────────┴─────────────────────────────────┤
│ Bottom Panel (钢琴卷帘/混音器/编辑器, 可折叠)              │
└──────────────────────────────────────────────────────────┘
```

核心特征：Transport Bar 始终可见（实时操作），Track Headers + Timeline 是不可折叠的"十字中心"。行业四大 DAW 均收敛于此布局。

#### 场景 5：2D 骨骼编辑器 (Skeletal Animation)

代表：Spine, Live2D Cubism, **neko-puppet**

```
┌─────────────────────────────────┬───────────────┐
│ Viewport (ViewportShell, flex-1)│ Right Panels   │
│  overlayLayer (骨骼/网格)        │ w-60 固定      │
│  toolbarLayer (视口工具栏)       │ NodeTree       │
│                                 │ Parameters     │
│                                 │ ControlDrivers │
│                                 │ Animation      │
├─────────────────────────────────┴───────────────┤
│ Keyframe Timeline (h-180, 可折叠)                │
└──────────────────────────────────────────────────┘
```

核心特征：Viewport 使用统一 `ViewportShell`（@neko/ui），右侧固定宽度面板栈，底部关键帧可折叠。

#### 场景 6：3D 编辑器 (3D Workbench)

代表：Blender, Unity, **neko-model**

```
┌─────────────────────────────────┬───────────────┐
│ Viewport (flex-1)               │ Right Dock     │
│  ViewportToolbar (absolute)     │ Outliner       │
│  QualityOverlay                 │ ── resize ──  │
│                                 │ Properties    │
│                                 │ (按选中切换)   │
├─────────────────────────────────┴───────────────┤
│ Timeline Dock (折叠: 播放条 / 展开: 关键帧)       │
└──────────────────────────────────────────────────┘
```

核心特征：Viewport + Right Dock + Bottom Timeline 经典三件套。Properties 按选中对象动态切换面板类型。

#### 场景 7：Agent / AI 助手 (Chat Interface)

代表：Cursor, GitHub Copilot Chat, **neko-agent**

```
┌─ Tab Bar (对话标签 + 状态指示) ──────────────────┐
├──────────────────────────────────────────────────┤
│ Messages (flex-1, scroll)                        │
│  user / assistant / workItems / stateIndicator   │
├──────────────────────────────────────────────────┤
│ Input Area (sticky bottom)                       │
│  chips + attachments + textarea + tools          │
└──────────────────────────────────────────────────┘
```

核心特征：纯单列布局，无侧栏。消息列表 flex-1 占满，输入区固定底部。位于 VSCode 侧栏面板。

#### 场景 8：Dashboard (仪表盘/商城)

代表：VSCode Extensions, **neko-market**

```
┌─ Header (搜索栏) ────────────────────────────────┐
├─ TabBar [Browse | Installed | Owned | Updates] ──┤
├──────────────────────────────────────────────────┤
│ Content (flex-1, scroll, Grid/List)              │
├──────────────────────────────────────────────────┤
│ Detail Modal (overlay)                           │
└──────────────────────────────────────────────────┘
```

核心特征：纯单列+标签切换，内容区自由滚动 Grid/List，详情用 modal。

### 2.2 四种布局原型

八种场景归纳为四种布局原型：

```
原型 A: Workbench (工作台)
  适用: 剪辑, DAW, 3D 编辑器, 2D 骨骼编辑器
  结构: TopBar? + Left? + Center(flex-1) + Right? + Bottom?
  特点: 可选侧栏/底栏，resize/collapse，Center 不可缺

原型 B: Studio (画室)
  适用: 素描/绘画, 画布
  结构: VToolbar(窄) + Canvas(flex-1) + Sidebar? + Bottom?
  特点: 画布占最大面积，浮动面板，工具栏极窄

原型 C: Conversation (对话)
  适用: Agent/AI 助手
  结构: Header + Messages(flex-1, scroll) + Input(sticky)
  特点: 纯单列，无侧栏，位于 VSCode 侧栏面板

原型 D: Dashboard (仪表盘)
  适用: 商城, 素材库, 设置页
  结构: Header + Tabs + Content(flex-1, scroll) + Modal
  特点: 纯单列+标签，滚动内容
```

各扩展到原型的映射：

| 子包 | 原型 | 区域配置 |
|------|------|---------|
| neko-cut | A: Workbench | 无左栏, 中心上下分割, 右=属性 |
| neko-canvas | B: Studio 变体 | 左=节点库, 中心=无限画布+浮动面板, 无右栏/底栏 |
| neko-sketch | B: Studio | 左=工具栏, 中心=画布, 右=属性侧栏, 底=帧时间线 |
| neko-model | A: Workbench | 无左栏, 中心=3D 视口, 右=Outliner+属性, 底=时间线 |
| neko-puppet | A: Workbench | 无左栏, 中心=2D 视口, 右=节点树+参数, 底=关键帧 |
| neko-agent | C: Conversation | 纯单列 |
| neko-market | D: Dashboard | 纯单列+标签 |
| neko-audio (DAW) | A: Workbench | 左=浏览器, 中心=轨道+时间线, 底=混音器 |

---

## 3. 设计决策

### D0: Creative Workbench Shell — 六个创意子包统一布局契约

第一轮覆盖范围固定为 `neko-cut`、`neko-canvas`、`neko-audio`、`neko-puppet`、`neko-model`、`neko-sketch`。这些 Webview 均采用同一结构语义：

```
┌─ VSCode Editor Tab / View Title（原生） ──────────────┐
├─ Left Rail ┬──────── Main Panel ────────┬ Right Panel ┤
│ 通用动作   │ 预览/viewport/画布/波形      │ 属性/检查器  │
│ 显隐开关   │ 时间线/transport/overlay控件 │ 面板局部控件  │
└───────────┴─────────────────────────────┴────────────┘
└─ VSCode StatusBar（原生，被动状态）──────────────────┘
```

共享层只提供 `@neko/ui/workbench` 的 slot contract：`CreativeWorkbenchShell`、`CreativeLeftRail`、`MainPanelControlLayer`。它不导入 VSCode API、Node-only 模块或任何功能子包；命令回调、store 选择、i18n key、engine 消息仍由各子包 adapter 负责。

| 区域 | 职责 | 允许内容 | 不允许内容 |
|------|------|----------|------------|
| 左侧工具栏 | 常用/通用动作；既有主工具入口；显示/隐藏主面板控件、右侧面板、overlay 或 panel stack | 保存、导入入口、文档级导出、Canvas/Sketch 主工具选择、Model/Puppet viewport 常用命令、Audio 分析/频谱命令、显隐开关 | 属性修改控件、局部 inspector tab、Cut timeline 控制组件、transport 组件 |
| 主面板 | 创作表面与嵌入该表面的控件 | preview controls、Cut timeline controls、timeline/transport surface、waveform/canvas/viewport surface、canvas zoom/minimap、播放组件自带控件 | 非 Cut 子包独立横向命令工具栏 |
| 右侧面板 | 属性、检查器、树/层级、库、效果链、局部分区 | property groups、outliner、layer stack、node library、effect/export/recording settings | 复制到左栏的局部属性按钮 |
| VSCode StatusBar | 被动状态和编辑器级摘要 | zoom/tool/layer、engine、selection/object count、duration/sample rate、subsystem/projection、export/proxy state | 高交互控件、预览图、scrubber、需要 rich UI 的进度面板 |

左栏中的 `visibility-toggle` 必须带 `aria-controls` 与 `aria-expanded`，并通过 `visibilityTarget` / `data-creative-left-rail-target` 标注为 `main-panel`、`right-panel` 或 `hud`。底部显隐组只控制主面板控件（如 timeline/header/keyframe strip）、右侧面板、HUD/overlay（如 minimap/zoom/viewport overlay）的显示状态；预览、viewport、画布、波形等主展示表面保持长显。显隐按钮数量按子包能力声明，不做固定三件套：Cut 只暴露 timeline 主面板控件与右侧属性面板两个开关；Model 暴露 viewport HUD、下侧动画/timeline controls、右侧 Dock 三个开关。按钮迁移必须先按功能职责归类：Cut 的 timeline 横向控制条是时间线控制组件，保留在主面板；其他子包不保留独立横向工具栏，Model/Puppet viewport 常用命令和 Audio 分析/频谱命令进入左侧工具栏；参数、画笔细项、节点属性、效果/导出/录制设置等局部控制仍归主面板组件或右侧面板。

### D1: VSCode 原生 UI 整合 — Webview 内不重建 VSCode 已提供的 UI 层

**原则**: Webview 内只放**需要空间交互的编辑器 UI**（工具栏、画布、时间线、属性面板）。纯信息展示和全局导航交给 VSCode 原生层。

#### 3.1 Header 裁定

| 子包 | 当前 Header | 裁定 | 迁移目标 |
|------|-----------|------|---------|
| neko-cut | 无独立 Header | **保留** | — |
| neko-agent | TabBar + NewChat + History + AccountBar (44px) | **保留 / Deferred** | 本变更回退 Agent Header 迁移，维持既有 Webview Header；后续另立 Agent redesign |
| neko-canvas | 旧 CanvasTopToolbar | **移除 shell 级横向工具栏** | 全局画布工具与显隐开关进入左侧工具栏；MiniMap/Zoom/Playback/FloatingPanel 作为主面板 overlay；NodeLibrary 进入右侧面板职责 |
| neko-model | WorkbenchTopBar ("Neko Model"+选中节点+对象数+引擎状态, 36px) | **移除** | 标题与 Editor Tab 重复→删除；选中节点/对象数/引擎状态 → StatusBar |
| neko-sketch | 无 | **正确** | — |
| neko-puppet | 无 | **正确** | — |
| neko-market | SearchBar + TabBar | **保留** | 搜索和四视图标签是 Dashboard 核心导航，不适合用 VSCode Tab 替代 |

**neko-model Header 移除方案**:

```
当前:
┌─ WorkbenchTopBar ─────────────────────────────────────┐
│ Neko Model          | Selected: Cube | Objects: 12 | 🟢 │
├───────────────────────────────────────────────────────┤
│ Viewport...                                           │

优化后:
┌─ VSCode Editor Tab ──────────────────────────────────┐
│ [scene.nkm]                                           │
├───────────────────────────────────────────────────────┤
│ Viewport... (多 36px 高度)                             │
└── StatusBar: [Selected: Cube] [Objects: 12] [🟢 :8901]┘
```

#### 3.2 Status 信息裁定

| 子包 | Webview 内状态 | 裁定 | 理由 |
|------|--------------|------|------|
| neko-canvas | 左下: 子系统 ID + 投影状态 | **合并到 StatusBar** | 纯信息展示，不需交互，遮挡画布 |
| neko-sketch | 右下: AIRunMonitor | **保留** | 带预览图+操作按钮 (Apply/Discard)，是交互式 UI |
| neko-sketch | zoom/tool/layer 信息 | **仅 StatusBar** | 纯信息，已通过 `status:update` 同步 |
| neko-model | 引擎状态/节点名/对象数 | **合并到 StatusBar** | 移除 TopBar 后自然迁入 |
| neko-cut | 无 | **正确** | 已是最优 |
| neko-puppet | 无 | **正确** | 已是最优 |

**判断标准**: 纯信息展示（文字/图标/数字）→ VSCode StatusBar。需要交互的状态 UI（按钮/预览/进度条）→ 保留在 Webview 内。

### D2: neko-agent 保持侧栏面板，不迁移到 Editor Tab

**裁定**: 保持 `WebviewViewProvider` 在侧栏/面板，不迁移为 `CustomEditorProvider`。

**理由**:

| 维度 | 侧栏面板 | Editor Tab | 判断 |
|------|---------|-----------|------|
| 编辑上下文关联 | Agent 和编辑器**同时可见** | 互斥（同 Tab Group 只看一个） | 侧栏胜 |
| 持久可见性 | 天然并排 | 需 Split Editor 手动操作 | 侧栏胜 |
| 多对话管理 | 内部 TabBar 自控生命周期 | 需虚拟文件绑定 `*.ai-chat`，额外复杂度 | 侧栏胜 |
| 空间效率 | 宽 ~300-500px，高全屏 | 宽 ~800px+ (过宽)，独占 | 侧栏适合 |
| 行业共识 | Cursor / Copilot Chat / JetBrains AI / Windsurf / Claude Code | **无一选择 Editor Tab** | 侧栏胜 |

**推荐位置调整**: 当前注册在底部 Panel 区（与 Terminal 同级），高度受限。应支持拖拽到 **Secondary Sidebar (右侧)**，宽度 ~350px 足够、高度全屏 ~800px，消息可见区域大幅提升。

### D3: neko-agent Tab 栏保留，状态增强延期

**问题**: 当前 `OpenTab` 只存 `{id, title, conversationId}`，无实时运行状态。将 Tab 替换为 Dropdown 会丢失多对话并行状态一览。

**裁定**: 保留 Tab 栏。状态指示点和 Header 瘦身方案在本变更中回退，后续需要结合 Agent Webview 整体设计重新评估。

```
当前 Tab (只有标题):
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Chat 1   │ │ Chat 2   │ │ Chat 3 × │
└──────────┘ └──────────┘ └──────────┘

延期方案 (标题 + 状态点):
┌──────────┐ ┌──────────┐ ┌──────────┐
│ ● Chat 1 │ │ ◌ Chat 2 │ │ ⚠ Chat 3 │
└──────────┘ └──────────┘ └──────────┘
```

状态映射：

| Agent Phase | 图标 | 颜色 | 说明 |
|-------------|------|------|------|
| idle | (无) | — | 空闲，无干扰 |
| thinking | ● 脉冲 | 蓝色 | Agent 思考中 |
| acting | ● | 绿色 | Agent 执行工具中 |
| streaming | ● 脉冲 | 绿色 | 流式输出中 |
| error | ⚠ | 红色 | 出错需关注 |
| compressed | ◐ | 灰色 | 已压缩上下文 |

当前实现继续使用既有 44px Header：+New / History / AccountBar 保留在 Webview 内。

### D4: neko-agent Input Area 分层延期

**问题**: Input Area 当前混排消息输入 (A 类) 和生成配置 (B 类) 两类职责，Agent 模式下生成配置常不需要但占据固定空间。

**裁定**: 本变更不改变 Agent InputArea。已尝试的 StatusBar/QuickPick + 齿轮 Popover 方案因 Webview 设计问题回退，后续另立 Agent redesign。

#### Agent 模式 (~80% 使用时间)

```
┌─────────────────────────────────────────────┐
│ [canvas:Shot3 ×] [📎 ref.png ×]            │  chips + attachments
│ ┌───────────────────────────┐ [⚙] [▶ Send] │  textarea + 齿轮 + 发送
│ │ Ask anything...           │               │
│ └───────────────────────────┘               │
│ [📎] [/]  [◐ 42%]            [auto ▾]      │  工具行
└─────────────────────────────────────────────┘
延期方案曾考虑: StatusBar [agent ▾] [Claude Sonnet ▾] [user@neko]
```

- 当前实现：SessionModeSelector、ModelSelector、GenerationParams、SuggestionChips 继续由 Webview InputArea 管理。
- 后续 redesign 需要重新验证 Agent 模式空间收益、可发现性、失败回滚和跨进程同步成本。

#### Media 模式 (image/video/audio)

```
┌─────────────────────────────────────────────┐
│ [🖼 image ▾] [Model: DALL-E 3 ▾]           │  模式 + 模型选择
│ [16:9 ▾] [1080p ▾] [10s ▾]                 │  生成参数 (按类型变化)
├─────────────────────────────────────────────┤
│ [Chips] [Attachments]                       │
│ ┌───────────────────────────┐        [Send] │
│ │ Describe what to generate │               │
│ └───────────────────────────┘               │
│ [📎] [/] [◐ 42%]                           │
└─────────────────────────────────────────────┘
```

- SessionModeSelector 显示在 Input 顶行（已激活 Media 模式时需可见）
- MediaModelSelector 紧随模式选择器
- GenerationParams 按类型展开（IMAGE: ratio+resolution / VIDEO: +duration / AUDIO: type+duration）
- 配置完整可见，无需额外点击

#### 各控件裁定

| 控件 | Agent 模式 | Media 模式 | 理由 |
|------|-----------|-----------|------|
| SessionModeSelector | StatusBar | Input 顶行 | Agent 模式是默认，切换频率低 → StatusBar；Media 模式内切换需可见 |
| ModelSelector (chat) | StatusBar | 隐藏 | Chat 模型切换频率低 |
| MediaModelSelector | 齿轮 Popover 内 | Input 顶行 | Media 模式核心配置 |
| GenerationParams | 齿轮 Popover 内 | 第二行展开 | Agent 模式低频，Media 模式高频 |
| ExecutionMode (plan/ask/auto) | 底行保留 | 隐藏 | 仅 Agent 模式有意义 |
| ContextChips + Attachments | 保留 | 保留 | 两种模式都需要 |
| SuggestionChips | 按需显示 | 隐藏 | Media 模式不需建议 |
| UsageIndicator | 底行保留 | 底行保留 | 始终有用 |
| MediaCallCount | 底行保留 | 隐藏 | 仅 Agent 模式追踪 |

#### 高度对比

| 区域 | 当前 | Agent 优化后 | Media 优化后 |
|------|------|------------|------------|
| SuggestionChips | 32px | 按需 0-32px | 0 |
| TopBar (Mode+Model) | 36px | 0 (→StatusBar) | 36px |
| GenerationParams | 0-48px | 0 (→齿轮) | 36px |
| Chips+Attachments | 28-88px | 28-88px | 28-88px |
| Textarea | 40px | 40px | 40px |
| BottomBar | 24px | 24px | 24px |
| **总计** | **160-268px** | **92-184px** | **164-224px** |

上述高度收益属于延期方案，当前实现不作为本变更目标。

---

## 4. 各子包布局优化方案

### 4.1 neko-agent — P0

**问题汇总**:
- Header 占 44px，侧栏总高有限
- Input Area 两类职责混排，Agent 模式下生成配置占用固定空间
- 消息可见区域不足

**延期方案草图（本变更不落地）**:

```
┌─ VSCode view/title ──────────────── [+New] [History] ─┐  VSCode 原生
├─ Tab Bar (28px, 带状态点) ────────────────────────────┤
│ [● Chat 1] [◌ Chat 2] [⚠ Chat 3]                    │
├───────────────────────────────────────────────────────┤
│                                                       │
│  Messages (flex-1, scroll)                            │
│  ┌─ user message ──────────────────────────────┐     │
│  ├─ assistant message ─────────────────────────┤     │
│  ├─ AgentStateIndicator ───────────────────────┤     │
│  │ ● thinking... 3s                            │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
├─ Input Area (按模式分层, 见 §D4) ─────────────────────┤
│ [chips] [attachments]                                 │
│ [textarea]                              [⚙] [Send]   │
│ [📎] [/] [◐ 42%]                         [auto ▾]   │
└───────────────────────────────────────────────────────┘
  StatusBar: [agent ▾] [Claude Sonnet ▾] [user@neko]
```

**消息可见区域假设对比** (侧栏 800px 高度，延期方案，不作为当前实现验收):

| 状态 | 当前 | 优化后 |
|------|------|--------|
| Header 占用 | 44px | 28px (Tab 栏) |
| Input 占用 (Agent) | ~220px | ~120px |
| 消息区 | ~536px | ~652px (+22%) |

### 4.2 neko-model — P0

**问题汇总**:
- TopBar 36px 浪费空间（标题与 Editor Tab 重复，状态信息应在 StatusBar）
- Right Dock 宽度固定，不可 resize
- Outliner 和 Properties 比例固定
- Timeline 只有展开/折叠两态，无法拖拽高度

**优化方案**:

```
当前:                                优化后:
┌─ TopBar (36px) ───────────┐       ┌───────────────────────────────┐
├───────────────┬───────────┤       ├───────────────┬── ew resize ──┤
│ Viewport      │ RightDock │       │ Viewport      │ Right Dock    │
│ (flex-1)      │ (固定宽)   │       │ (flex-1)      │ (可调宽度)    │
│               │ Outliner  │       │               │ Outliner      │
│               │ ────────  │       │               │ ── ns resize ─│
│               │ Properties│       │               │ Properties    │
├───────────────┴───────────┤       ├───────────────┴── ns resize ──┤
│ Timeline (展开/折叠)       │       │ Timeline (可拖拽高度)          │
└───────────────────────────┘       └───────────────────────────────┘
                                     StatusBar: [Cube] [12 obj] [🟢]
```

改动项:
- 移除 WorkbenchTopBar → Viewport 高度 +36px
- 选中节点 / 对象数 / 引擎状态 → StatusBar items
- Right Dock ← ResizeHandle (ew) → 可调宽度
- Outliner / Properties 之间 ← ResizeHandle (ns) → 可调比例
- Timeline 高度 ← ResizeHandle (ns) → 可拖拽（复用 `useResizable`）

### 4.3 neko-puppet — P1

**问题汇总**:
- 右侧面板固定 `w-60` (240px)，四个面板堆叠内容挤压
- 无 ResizeHandle，宽度不可调

**优化方案**:

```
当前:                            优化后:
┌────────────┬─ w-60 ─┐        ┌────────────┬── ew resize ──┐
│ Viewport   │NodeTree │        │ Viewport   │ Right Panels  │
│            │Params   │        │            │ 默认 280px     │
│            │Drivers  │        │            │ 可拖 200-400px │
│            │Anim     │        │            │               │
└────────────┴────────┘        └────────────┴───────────────┘
```

改动项:
- 右侧面板加 ResizeHandle (ew)，默认 280px，可拖拽 200-400px
- 侧栏各面板间支持折叠优先级排序

### 4.4 neko-canvas — P1

**问题**: 左下角 glassmorphic 状态徽章遮挡画布。

**优化**: 子系统 ID + 投影状态 → VSCode StatusBar items（消除画布遮挡）。

### 4.5 neko-cut — P2

**问题**: PreviewControls 控件过多（11 按钮+2 下拉），横向挤压。

**优化**:
- Quality / Speed 下拉合并为 "Settings" 下拉或移入 PropertyPanel 顶部
- PiP / Screenshot / FPS 三个低频按钮收入 "..." 溢出菜单
- PropertyPanel 加 minWidth(200px) / maxWidth(450px) 约束

### 4.6 neko-sketch — 无需大改

当前布局已是最优。唯一建议: 侧栏面板最多 12 个 CollapsibleSection 时，按工具模式分组，非活跃组默认折叠。

### 4.7 neko-market — 保持现状

搜索+标签是 Dashboard 核心导航，适合保留在 Webview 内。

---

## 5. CSS Token 收敛与图标统一

> **范围边界**: CSS Token 收敛（6 套前缀 → `--neko-*`）和图标统一（5 种方案 → `@neko/ui/icons`）的详细方案、映射表和迁移步骤由 [adr-webview-ui-design-system.md](./adr-webview-ui-design-system.md) 拥有。本 ADR 仅声明布局层的依赖：布局组件必须消费 `--neko-*` token，不可引入新的自定义前缀。

**本 ADR 的要求**:
- 新增或修改布局组件时，使用 `--neko-*` token，不引入 `--canvas-*` / `--agent-*` 等自定义前缀
- 布局迁移 PR 中若发现自定义前缀，顺带替换为 `--neko-*` 别名，但不主动发起全包扫描替换（留给 UI Design System 迁移阶段）
- 图标同理：新增布局图标使用 `@neko/shared/icons` 或未来 `@neko/ui/icons`，不内联 SVG

---

## 6. 接口契约

### 6.1 StatusBarProjection — 状态信息统一投射

各子包向 StatusBar 投射状态的标准化接口：

```typescript
interface StatusBarItemSpec {
  id: string;                          // e.g. 'neko.model.selectedNode'
  text: string;                        // 显示文本
  tooltip?: string;
  command?: string;                    // 点击触发的命令
  alignment: 'left' | 'right';
  priority: number;                    // 越大越靠外侧
  visibilityCondition?: string;         // 可读条件描述, e.g. 'activeCustomEditorId == neko.modelEditor'
}
```

> **API 语义说明**: `visibilityCondition` 是业务层的可读描述，不是 VSCode 原生 `when` clause。
> 程序化创建的 `StatusBarItem` 不支持声明式 `when` 自动隐藏——实际由 `StatusBarGroup`（`@neko/shared`）
> 监听 `window.onDidChangeActiveTextEditor` + `window.tabGroups.onDidChangeTabs` / `onDidChangeTabGroups`
> 后检查 active tab（必要时判断 `vscode.TabInputCustom`），再手动调用 `show()` / `hide()` 控制可见性。

**关键约束**:
- 每个子包最多注册 3 个 StatusBar items（防过载）
- 可见性由 `StatusBarGroup` 管理器监听 active editor 变化后手动 show/hide（非声明式自动隐藏）
- 同类信息合并（如 model 的 "Selected: Cube | Objects: 12" 合并为一个 item）

### 6.2 AgentPhase — Deferred

Agent tab 状态协议在本变更中不落地。曾考虑扩展现有 `AgentPhase`
为 Tab 层增加 `'error' | 'compressed'` 两个 UI-only 状态，但 Agent Webview Header/Input 方案已回退，
因此该协议随独立 Agent redesign 重新评估。

```typescript
// 延期方案草图，非当前实现
type AgentPhase = 'idle' | 'thinking' | 'acting' | 'streaming' | 'error' | 'compressed';

interface OpenTab {
  id: string;
  title: string;
  conversationId: string;
  phase?: AgentPhase;                 // 新增，undefined 等同 'idle'
  phaseTimestamp?: number;            // 状态变更时间戳，用于 UI 动画
}
```

**当前实现**: `OpenTab` 仍保持既有数据形态，Header TabBar 不渲染 AgentPhase 状态点。

### 6.3 WorkbenchLayoutSlots — 布局 Slot 定义

四种原型的 slot 是**组合式**的，不是强制模板：

```typescript
interface WorkbenchSlots {
  topBar?: React.ReactNode;           // 仅 Workbench 原型允许
  leftPanel?: PanelSlot;              // 工具栏(sketch) 或 创建面板(canvas)
  center: React.ReactNode;            // 必选：视口/画布/编辑器
  rightPanel?: PanelSlot;             // 属性/检查器/层级树
  bottomPanel?: PanelSlot;            // 时间轴/关键帧
  floatingPanels?: FloatingPanelSlot[];
}

interface PanelSlot {
  content: React.ReactNode;
  defaultWidth?: number;              // 仅 left/right
  defaultHeight?: number;             // 仅 bottom
  minSize?: number;
  maxSize?: number;
  collapsible: boolean;
  persistKey?: string;                // webview state key for resize state
}
```

**说明**: 这不是要求所有子包立即迁移到统一 LayoutShell 组件。Slot 定义的作用是：
- 为未来 `@neko/ui` 的 LayoutShell 组件提供接口契约
- 明确每个 slot 的 resize/collapse 行为应保持一致
- 各子包当前实现可逐步对齐到这些语义

### 6.4 ResizeState 持久化策略

```typescript
interface ResizeState {
  panelId: string;                    // e.g. 'neko-model.rightDock'
  size: number;                       // px
  collapsed: boolean;
}
```

- 持久化到 `vscode.getState()` / `vscode.setState()`（Webview 侧）
- 不写磁盘，不跨 session（VSCode 已自动持久化 Webview state）
- 每个可 resize 面板有唯一 `panelId`

---

## 7. 实施计划

> **排序原则**: 契约先行 → 低风险迁移（先建后拆） → Agent Header/Input 回退并延期 → Resize 跟随各编辑器 → CSS Token 最后（由 UI Design System ADR 拥有）。

### Phase 0: 契约与基础设施 (~2d)

| PR | 内容 | 估时 | 验收标准 |
|----|------|------|---------|
| PR1 | `StatusBarItemSpec` 类型定义 + StatusBar 注册工具函数（`@neko/shared/types`） | 0.5d | 类型编译通过；工具函数单测（visibilityCondition 匹配后 show/hide、priority 排序） |
| PR2 | Agent tab phase contract | Deferred | Agent Webview 设计回退，Tab phase 后续随 Agent redesign 重新评估 |
| PR3 | `ResizeState` 持久化 hook：`usePersistedResize(panelId, defaultSize)` 基于 `vscode.getState/setState` | 1d | resize → 切换 Tab → 切回 → 尺寸恢复的集成测试 |

### Phase 1: 低风险迁移 — 先建后拆 (~2.5d)

| PR | 内容 | 估时 | 验收标准 |
|----|------|------|---------|
| PR4 | neko-model: **先建** StatusBar items（Selected/Objects/EngineStatus），`visibilityCondition: activeCustomEditorId == neko.modelEditor` | 1d | 切换到 model 编辑器时 StatusBar 显示三项；切走时隐藏 |
| PR5 | neko-model: **后拆** WorkbenchTopBar，Viewport 高度 +36px | 0.5d | TopBar 移除后无视觉回归（before/after 截图） |
| PR6 | neko-canvas: 子系统+投影状态接入**已有** CanvasStatusBar（`extension/src/views/canvasStatusBar.ts`），移除 Webview 内左下徽章 | 1d | StatusBar 显示 subsystems + projection state；Webview 内无状态遮挡 |

### Phase 2: Agent Header/Input 回退

| PR | 内容 | 估时 | 验收标准 |
|----|------|------|---------|
| PR7 | neko-agent: 保持既有 Webview Header/InputArea，移除本变更中尝试的 view/title、StatusBar/QuickPick selector、齿轮 Popover 迁移 | 0.5d | `packages/neko-agent` 无 native selector / compact Header/Input diff；后续另立 Agent redesign |

### Phase 3: 面板 Resize 补全 (~2.5d)

| PR | 内容 | 估时 | 验收标准 |
|----|------|------|---------|
| PR12 | neko-model: Right Dock + Outliner/Properties + Timeline 加 ResizeHandle + `usePersistedResize` | 1d | 拖拽→切 Tab→切回→尺寸保持；min/max 约束生效 |
| PR13 | neko-puppet: 右侧面板 `w-60` 改为 ResizeHandle (200-400px) + `usePersistedResize` | 0.5d | 拖拽→切 Tab→切回→宽度保持 |
| PR14 | neko-cut: PreviewControls 溢出菜单 + PropertyPanel min/max 约束 | 1d | 窄屏下低频按钮收入 `···`；PropertyPanel 不可拖拽到 <200px |

**总计**: ~12d, 14 PRs（不含 CSS Token 收敛，由 UI Design System ADR Phase 4 执行）

---

## 8. 风险与缓解

| 风险 | 严重度 | 影响 | 缓解 |
|------|:------:|------|------|
| **StatusBar 过载** | 高 | 5-6 个扩展已注册 StatusBar items，新增 model(3)+canvas(2)+agent(2) 可能超载 | (1) `StatusBarGroup` 按活跃编辑器手动 show/hide——非活跃编辑器的 items 隐藏；(2) 每包限 3 个 items（§6.1）；(3) 同类信息合并为一个 item（如 model 的 Selected+Objects 合一） |
| **Agent Header/Input redesign 风险** | 高 | SessionModeSelector/ModelSelector 迁到 StatusBar/QuickPick 以及 Header 瘦身会改变高频工作流，已发现 Webview 设计问题 | 本变更回退 Agent Header/Input 迁移；后续单独提出 Agent redesign，再验证可发现性、空间收益、同步协议和失败回滚 |
| **model TopBar 移除导致状态丢失** | 高 | 如果先移除 TopBar 再建 StatusBar 通道，enginePort/selectedNode/objectCount 会从 UI 消失 | **先建后拆**：PR4 先建 StatusBar items 并验证可见性，PR5 再移除 TopBar。两个 PR 不可合并 |
| **估时外溢** | 中 | model resize 持久化比表面更复杂 | 实施时拆为子任务；Agent redesign 不纳入本变更估时 |

---

## 9. 跨子包组件位置一致性分析

### 9.1 当前组件位置矩阵

| 组件 | cut | canvas | sketch | model | puppet | 一致性 |
|------|-----|--------|--------|-------|--------|:------:|
| **工具栏** | 左侧 2 个显隐 + 主面板 Cut timeline 控制组件 | 左侧全局工具 | 左侧主工具 | 左侧常用命令 + viewport HUD/timeline/右侧 Dock 显隐 | 左侧常用命令 + 右侧面板显隐 | ✅ 高 |
| **属性/检查器** | 右侧 | 右侧/右上浮动 | 右侧 | 右侧 | 右侧 | ✅ 高 |
| **树/层级面板** | 无 | 右侧创建面板；未来 Outliner 右侧 | 右侧(sidebar) | 右侧 | 右侧 | ✅ 高 |
| **时间轴/关键帧** | 底部 | 无 | 底部 | 底部 | 底部 | ✅ 高 |
| **状态信息** | StatusBar | StatusBar | StatusBar + 交互式 AIRunMonitor | StatusBar | 无独立投影 | ✅ 高 |
| **MiniMap/缩放** | 预览区内嵌 | 右下浮动 | 无 | 无 | 无 | — |

### 9.2 不一致分类：合理差异 vs 不合理差异

#### 合理差异（场景驱动，不应强行统一）

| 差异 | 原因 |
|------|------|
| Cut 主面板 timeline 控制条 vs 其他子包左侧命令 rail | Cut 的横向控制条是时间线控制组件的一部分；Audio/Model/Puppet 的分析、viewport 等原横向命令行不应成为独立 toolbar，常用命令进入左侧工具栏，局部设置进入右侧面板 |
| canvas 有 MiniMap，其他包没有 | 只有无限画布需要全局鸟瞰导航，时间轴编辑器/绘画画布不需要 |
| canvas 无底部时间轴 | canvas 是空间编排，不是时间线性编辑 |
| cut 工具栏嵌入 PreviewControls | 视频编辑器工具即播放控制，嵌入预览区是行业标准（Premiere/DaVinci） |

#### 不合理差异（增加用户认知负担，应统一）

| 差异 | 影响 | 统一方案 |
|------|------|---------|
| **状态信息散落 5 个位置** | 顶部(model) vs 左下(canvas) vs 右侧(sketch/puppet) vs 底部(cut)，用户无法形成"状态在哪看"的一致预期 | **全部统一到 VSCode StatusBar**（§3.1 D1 已决定） |
| **canvas 创建面板曾在左侧，其他包检查器在右侧** | 左侧同时承载工具和大面板会压缩主画布，也混淆工具栏职责 | canvas NodeLibrary 本质是**创建面板**，迁入右侧面板职责；左侧只保留显示/隐藏 toggle 与全局工具 |
| **canvas 属性面板浮动，其他 4 包固定右侧** | 用户在 canvas 中编辑节点属性时找不到固定位置 | canvas FloatingPanelHost 保持浮动能力但**默认初始位置锚定右上**（当前已是 `right-3 top-3`），视觉上与其他包右侧面板对齐 |
| **model/puppet 右面板不可 Resize** | cut 右面板可 resize，model/puppet 不行，交互体验不一致 | model Right Dock + puppet 右面板补全 ResizeHandle（§4.2/§4.3 已决定） |

### 9.3 工具栏是否需要动态长度

**结论：所有子包工具栏保持固定长度，不引入动态伸缩。**

### 9.4 工具按钮职责归属

Workbench 类编辑器统一按区域职责归位按钮：

| 区域 | 职责 | 放置按钮 |
|------|------|----------|
| 左侧工具栏 | 常用/通用动作、既有主工具入口、区域显隐、面板显隐、高层工作区入口 | 保存/导入/文档级导出、显示/隐藏主面板控件、显示/隐藏 HUD、显示/隐藏右侧属性面板、Canvas/Sketch 主工具选择、Model/Puppet viewport 常用命令、Audio 分析/频谱命令 |
| 主面板工具 | 当前主工作区内嵌控件 | Cut timeline 控制组件、预览播放、transport、时间线表面、viewport/波形/画布展示表面、画布 zoom/minimap/playback |
| 右侧属性面板 | 选中对象、当前工具或属性面板内部状态 | 属性分组切换、局部 inspector tab、面板内应用/重置、效果/导出/录制设置 |
| VSCode StatusBar | 被动状态和编辑器级摘要 | 选中/对象数、engine、zoom/tool/layer、duration/sample rate、subsystem/projection、导出状态 |

本规则已落地到 `neko-cut`、`neko-canvas`、`neko-audio`、`neko-puppet`、`neko-model`、`neko-sketch`。后续新增按钮时先判断其作用域：如果按钮是编辑器级通用动作、常用命令或该编辑器既有主工具入口，放左侧工具栏；如果它是 Cut timeline 控制组件、transport、preview playback、canvas zoom/minimap/playback 等主面板内嵌组件，放主面板；如果它是属性/检查器局部操作，放右侧面板；如果按钮只切换某个面板或控件是否可见，优先放左侧工具栏底部显隐组，并标注 `main-panel` / `right-panel` / `hud`，但按钮数量必须由子包真实区域决定，例如 Cut=2、Model=3；如果只是文字/数字/图标状态摘要，优先投射到 VSCode StatusBar。除 Cut 的 timeline 控制组件外，其他子包不得重新引入横向命令工具栏。

| 理由 | 说明 |
|------|------|
| 工具集是确定的 | 每个子包的工具不会在运行时增减。sketch 永远是那些画笔/形状工具，canvas 永远是 Select/Pan + 辅助操作 |
| 条件内容已用按钮级显隐解决 | canvas 的 PlaybackComponent 和 AutoArrange 选项随子系统变化，但通过条件渲染按钮实现，工具栏容器本身是 flex 全宽不变 |
| 动态长度导致布局跳动 | 工具栏宽度/高度变化挤压相邻区域（画布/面板），操作中布局偏移是差体验 |
| 行业零案例 | Figma、Photoshop、Blender、ComfyUI、Draw.io、Premiere — 没有一个用动态长度工具栏 |

**工具增多时的正确做法**：
- 工具栏内部分组折叠（sketch 画笔子类）或溢出菜单 `···`
- 上下文操作放右侧属性面板或 Popover，不扩展工具栏
- 工具栏是**锚点**，用户靠肌肉记忆定位，位置和尺寸不应变化

### 9.5 neko-canvas 布局专项分析

#### 9.5.1 当前布局结构

```
┌─ Left Rail ┬──────────────────── InfiniteCanvas ────────────────────┬ Right Panel ┐
│ Pan/Add    │ FloatingPanelHost / PlaybackControllerHost (overlay)    │ NodeLibrary │
│ Import     │ GenerationPromptPanel / ContentOverlay (overlay)        │ 创建面板     │
│ Undo/Redo  │ MiniMap + ZoomControls（主面板控件）                    │             │
│ Library ⟷  │ subsystem/projection 状态 → VSCode StatusBar            │             │
└────────────┴─────────────────────────────────────────────────────────┴─────────────┘
```

#### 9.5.2 Canvas 不需要 Header

Canvas 当前没有独立 Header（标题栏/文件名/状态栏），这是正确的：

| 信息 | 已有承载 |
|------|---------|
| 文件名 | VSCode Editor Tab 显示 `.nkcanvas` 文件名 |
| 文档导航 | 无限画布本身就是导航（平移+缩放+MiniMap） |
| 状态信息 | 应迁入 VSCode StatusBar（§3.1 已裁定） |

旧 `CanvasTopToolbar` 已迁移为左侧 `CanvasToolbar` 与主面板 overlay 控件，不再作为 shell 级横向工具栏存在。

#### 9.5.3 Canvas 去掉 shell 级横向工具栏

Canvas 的全局工具现在进入左侧工具栏；Playback、MiniMap、Zoom、FloatingPanel、GenerationPrompt 等保持在主面板 overlay 或主面板控件层。这样 Canvas 与 Audio/Model/Puppet/Sketch 一样不再有 shell 级横向工具栏，同时仍保留画布优先的交互模式；Cut 的 timeline 横向控制条是时间线控制组件，不属于被移除的 shell 级横向工具栏。

#### 9.5.4 NodeLibrary 作为右侧创建面板

NodeLibrary 是**创建面板**（拖拽新建节点），不是**层级树**（浏览编辑已有节点）。在 Creative Workbench Shell 中它归入右侧面板职责，左侧工具栏只保留显示/隐藏该面板的 toggle。

如果未来 canvas 需要增加节点 Outliner（浏览已有节点层级），应作为右侧 FloatingPanel 提供，不应与 NodeLibrary 创建面板合并。

#### 9.5.5 MiniMap+ZoomControls 保持主面板控件

- 右下角是行业通用位置（Figma、Blender、Draw.io 均放右下）
- subsystem/projection 状态迁入 StatusBar 后不再占据画布角落
- MiniMap 宽度与 ZoomControls 宽度对齐（通过 ResizeObserver 同步），聚合为整体控件簇

#### 9.5.6 工具栏小问题

| 问题 | 位置 | 建议 |
|------|------|------|
| Hand tool 使用 inline SVG | `CanvasToolbar.tsx` | 后续迁移到 `@neko/ui/icons`，与其他按钮图标来源统一 |
| Add Node popover 使用局部 menu 样式 | `CanvasToolbar.tsx` | 未来可替换为 `@neko/ui` menu/select primitive |
| Canvas status overlay 回潮风险 | `CanvasApp.tsx` | subsystem/projection 只通过 `canvasStatus` 同步到 `CanvasStatusBar`，不得恢复 Webview 左下状态徽章 |

---

## 10. 决策总结

1. **Webview 内不重建 VSCode 已提供的 UI 层** — Header 标题/导航按钮走 VSCode 原生 `view/title` 和 `editor/title`；纯信息状态走 StatusBar；仅需空间交互的编辑器 UI 留在 Webview
2. **neko-agent 保持侧栏面板** — 不迁移到 Editor Tab。行业共识 (Cursor/Copilot/JetBrains) + 编辑上下文并排可见性 + 对话非文件语义，三重理由支撑
3. **neko-agent Tab 栏保留，增强延期** — 不替换为 Dropdown；状态指示点和 Header 瘦身随后续 Agent redesign 重新评估
4. **neko-agent Input Area 保持现状** — 已尝试的 StatusBar/QuickPick + 齿轮 Popover 分层方案回退；后续另立 Agent redesign
5. **neko-model WorkbenchTopBar 先建后拆** — PR4 先建 StatusBar items 并验证，PR5 再移除 TopBar，两步不可合并
6. **面板 Resize 补全 + 状态持久化** — neko-model Right Dock/Timeline、neko-puppet 右侧面板加 ResizeHandle + `usePersistedResize` hook
7. **CSS Token/图标收敛由 UI Design System ADR 拥有** — 本 ADR 仅声明布局组件必须消费 `--neko-*` token，不主动发起全包替换
8. **跨子包组件位置：区分合理差异与不合理差异** — 工具栏位置差异因交互模式不同属合理差异，不强行统一；状态信息散落 5 个位置属不合理差异，统一到 VSCode StatusBar
9. **工具栏固定长度** — 所有子包工具栏保持固定尺寸，不引入动态伸缩
10. **neko-canvas 迁入 Creative Workbench Shell** — 顶部横向工具栏移除；左侧工具栏承接全局工具与右侧 NodeLibrary 显隐；MiniMap/Zoom/Playback/FloatingPanel 保持主面板控件；subsystem/projection 状态只进 StatusBar
11. **接口契约先行** — `StatusBarItemSpec`、`CreativeWorkbenchShell`、`WorkbenchLayoutSlots`、`ResizeState` 在共享层定义，后续 PR 对齐契约实施；Agent-specific 契约随独立 redesign 再定义
12. **实施顺序：契约 → 先建后拆 → Agent 回退并延期 → Resize → CSS(由 UI Design System ADR 执行)** — 避免跨包连锁改动
