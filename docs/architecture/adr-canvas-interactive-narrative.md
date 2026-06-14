# ADR: Canvas 交互叙事 — 编辑 + 预览分离架构 (Interactive Narrative: Editor + Preview Split)

> 状态：**Accepted / Phase 0-2 Implemented (2026-06-08); Phase 3.5+ Deferred**
> 关联：[adr-canvas-kind-multi-purpose.md](./adr-canvas-kind-multi-purpose.md) · [adr-canvas-preview-boundary.md](./adr-canvas-preview-boundary.md) · [story-agent-canvas-boundary.md](./story-agent-canvas-boundary.md) · [adr-deliverable-management.md](./adr-deliverable-management.md) · [adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md) · [agent-media-architecture.md](./agent-media-architecture.md)
> 实现同步：Phase 0-2 / PR1-PR10 已完成，核心链路 **Canvas 编辑 → Bridge 同步 → Preview 播放 → 三种渲染器 → HTML5 导出 → Agent 诊断** 已贯通。核心运行时已上移到 `@neko/shared`，Story Preview Webview 仅消费/重导出共享内核；HTML5 导出由 `neko-story/packages/extension` 的纯编排 `NarrativeExporter` 通过注入的 scene reader、asset resolver 和 copy adapter 产生产物；Agent 诊断和结构化上下文通过 Canvas structured content 暴露。
> 延后范围：原 Phase 3 的 PR11 Live2D / PR12 Spine 不属于 Phase 0-2 完成范围，明确延后到 Phase 3.5+。6 个 `narrative.*` 消融开关已注册到 `AblationToggles.narrative` / `NarrativePreviewFeatureToggles`，并通过 `neko.canvas.narrative.*` VSCode settings 投影到 Extension / Preview；`narrative.preview` 已作为 Extension command/panel hard gate 接入，Live2D/Spine 真实运行时仍是后续项。

---

## 一、背景与动机

### 1.1 目标创作类型

neko-suite 的创作管线已覆盖视频剪辑、AI 辅助、2D/3D 角色、剧本撰写等环节。三种**交互叙事**类型在素材制作层面已有基础，但缺少从"素材"到"可交互体验"的组装与预览能力：

| 类型 | 叙事载体 | 交互模式 | 现有素材管线 |
|------|---------|---------|------------|
| **互动影游** | 实拍/预渲染视频片段 | 关键节点选择分支 | neko-cut（视频剪辑 + GPU 特效） |
| **视觉小说** | 立绘 + 背景 CG + 文字 | 对话选项 + 演出系统 | neko-puppet（Live2D）+ neko-sketch（CG）+ neko-story（剧本） |
| **图文游戏** | 文字为主 + 插图辅助 | 选项/指令/属性判定 | neko-story（Fountain 剧本）+ neko-sketch（插图） |

### 1.2 核心缺口

1. **分支叙事编辑**——neko-story 的 Fountain 是线性剧本，无分支/条件/变量；Canvas narrative 子系统已有节点类型但缺少入口/终点语义和预览联动
2. **交互预览运行时**——当前 preview 只能单向播放，无法处理选项、变量、跳转
3. **人物演绎**——立绘/Live2D 资产已有，但缺少在预览中的演出层（表情切换、位置管理、口型同步）
4. **导出为可独立运行的格式**——制作完成后无法导出为 HTML5 / Electron 等可交互产物

### 1.3 已有基础

Multi-Purpose Canvas ADR（[adr-canvas-kind-multi-purpose.md](./adr-canvas-kind-multi-purpose.md)）已实现 Narrative 子系统首版：

| 能力 | 状态 | 说明 |
|------|------|------|
| Narrative 节点类型 | 已实现 | `choice` / `merge` / `narrative-scene` / `narrative-note` |
| Choice 连接属性 | 已实现 | `choiceText` / `condition` / `priority` |
| FlowTraversal API | 已实现 | `getSuccessors` / `getChoicesAt` / `resolveDefaultPath` / `detectCycles` |
| 变量浮动面板 | 已实现 | `NarrativeVariable[]` 定义与编辑 |
| 播放控件 | 工具栏 slot | `NarrativePlaybackController`：三按钮（上一步/播放/下一步），沿 defaultPath 步进高亮，1.2s 间隔；不处理 Choice 暂停、不渲染场景内容 |
| CanvasPlaybackState | 已定义 | `activeNodeId` / `visitedNodeIds` / `variables` |
| Fountain 文件拖入 | 已实现 | `.fountain` 可拖入 Canvas 作为 `script` 节点（引用源，不参与叙事遍历） |

**本 ADR 在此基础上定义**：

- 线性/分支分治——线性剧情以 neko-story 为主，多分支剧情以 Canvas 为创作核心
- Canvas-native 故事图——新增 `narrative-start` / `narrative-ending` 节点类型，画布文件即故事图
- 独立 Narrative Preview 面板——交互式预览播放（编辑+预览分离）
- 人物演绎分级——L0 静态立绘 → L1 CSS 动效 → L2 Live2D → L3 3D（分阶段）
- 三种创作类型的 PlayRenderer
- Canvas ↔ Preview 双向联动协议
- 导出管线（Preview = 导出原型）

---

## 二、设计决策

### D1: 线性/分支分治——Canvas-native 故事图

**决策**：线性剧情以 neko-story 为主编辑器（Fountain SSOT），多分支剧情以 Canvas narrative 子系统为创作核心（`.nkc` 画布文件即故事图 SSOT）。不引入独立的场景图中间格式，也不把 `.nks`、`.story` 或独立 `.nkstory` 作为新交互叙事工作流的图源或场景格式。

| 创作类型 | 主编辑器 | SSOT | Canvas 角色 |
|---------|---------|------|------------|
| 线性剧情 | neko-story | `.fountain` 文件 | 可拖入 `script` 节点作引用（现有能力） |
| 多分支剧情 | neko-canvas | `.nkc` 画布文件 | **创作核心**——narrative 节点图就是故事图 |

**项目结构**（多分支剧情）：

```
story-project/
├── narrative.nkc                 ← Canvas 画布文件（节点 + 连线 + 变量 = 故事图 SSOT）
├── scenes/
│   ├── cafe-encounter.fountain   ← 纯标准 Fountain（场景内容）
│   ├── insomnia-branch.fountain
│   ├── daily-chat.fountain
│   └── confession.fountain
├── characters.yaml               ← 角色表（立绘/表情/语音映射）
└── assets/                       ← 媒体资产（背景 CG、立绘、音效、视频片段）
```

**Canvas narrative metadata**（扩展现有 `NarrativeMetadata`）：

```typescript
interface NarrativeMetadata {
  entryNodeId?: string;            // 已有：入口节点（指向 narrative-start）
  variables: NarrativeVariable[];  // 已有：叙事变量
  genre?: StoryGenre;              // 新增：创作类型
  defaultLocale?: string;          // 新增：默认语言
}

type StoryGenre = 'interactive-film' | 'visual-novel' | 'illustrated-text' | 'hybrid';
```

**Fountain 片段保持纯标准**，不加任何分支扩展：

```fountain
INT. 咖啡馆 - 白天

小红推门进来，环顾四周，看到了靠窗的小明。

小红
（放下包，坐下来）
你今天怎么来这么早？

小明
昨晚没怎么睡。
```

**格式边界**：`narrative-scene.sceneRef` 只指向标准 `.fountain` 文件。分支、条件、变量、入口、终点和路径诊断属于 `.nkc` Canvas 图；`.nks` / `.story` / standalone `.nkstory` 是废弃的 Story/交互叙事设计，不参与 Preview、Agent 诊断或 HTML5 Export。注意 `.nks` 仍是 neko-sketch 的 2D 绘画项目扩展名，本 ADR 排除的是历史 Story 语言用途。

**生产绑定扩展**：`narrative-scene` 可额外保存 `productionRefs[]`，用于把互动影视节点绑定到 StoryboardTable scene/shot、Canvas scene/shot node、Cut clip、generated-video 或 asset。该字段只补充生产来源和可播放媒体引用，不参与分支推导，不覆盖 Canvas 连接、choice 条件、变量或 traversal order。Preview 使用 `interactive-preview` intent 解析 primary/fallback/generated-video binding；HTML5/package/final-export 使用 `package` 或 `final-export` intent 解析同一 durable ref。若 binding 只包含 Webview URI、blob URL、localhost runtime URL、绝对路径或 provider runtime handle，Canvas/Agent 必须给出 diagnostic，导出不得打包该 runtime-only 来源。

**长叙事 Canvas scope**：一个 `.nkc` 可以是 episode overview、sequence、scene、shot-cluster 或 interactive-narrative board。`creativeScope` 与 `relatedBoards` 只提供导航和 Agent 上下文摘要，不能把 Canvas 文件锁定为单一用途。互动视频项目通常保留一个 narrative graph board 作为分支 SSOT，再用 related boards 连接线性分镜、视频片段、镜头簇和 Cut 装配板。

**设计理由**：

1. **激活模式一致**——Canvas 子系统因节点类型存在而激活（`summarizeCanvasSubsystems()`），narrative 子系统天然适合作为分支故事的创作面
2. **零格式发明**——不需要 `.nkstory` 中间格式，Canvas `.nkc` 已有完整的节点/连线/元数据模型
3. **关注点分离**——场景内容（Fountain）由编剧在 neko-story 中编辑，分支结构（节点图）由策划在 Canvas 中编排
4. **现有能力直接复用**——`.fountain` 文件已可作为 `script` 节点拖入 Canvas（引用源）；narrative 节点已可手动创建；双击委托打开 neko-story 已有先例
5. **git 友好**——Fountain 文件和 `.nkc` JSON 均可 diff/merge
6. **AI 友好**——Agent 直接操作 Canvas API（现有 narrative 子系统 agent tools），无需额外学习场景图格式

**否决方案**：

- **`.nkstory` 独立场景图 JSON + Canvas 投影**——额外增加一个 SSOT 格式、一个 `StoryProjectionAdapter`、双向同步机制（投影→Canvas + 写回→`.nkstory`）。Canvas 已具备完整的节点编辑能力，不需要外部数据源投影
- **`.nks` / `.story` 作为叙事脚本格式**——属于早期 Story 语言设计，会和标准 Fountain 编辑、LSP、导出以及 Agent 结构化上下文形成双轨语义。新工作流直接使用 `.fountain`
- **Fountain + Yarn 混合格式**——需要同时理解两套语法的 LSP，交叉验证复杂度高；分支在文本中管理在 10+ 节点时不如可视化编辑
- **Fountain + 最小扩展**（`@choice` / `@if`）——非标扩展，Fountain 编辑器报警；变量系统表达力弱

### D2: 编辑与预览分离——Canvas + Narrative Preview

**决策**：采用 neko-story（Script + Preview）、neko-cut（Timeline + PreviewPanel）已验证的 **Editor + Preview 分离模式**。Canvas 负责故事图编辑，独立的 Narrative Preview Webview Panel 负责交互式预览播放。不在 Canvas 内做模式切换。

```
┌──────────────────────┬──────────────────────┐
│      Canvas          │   Narrative Preview  │
│   （图编辑器）         │   （交互预览器）       │
│                      │                      │
│  ┌───┐   ┌───┐      │  ┌────────────────┐  │
│  │开场│──→│◇A │──→…  │  │ [咖啡馆背景]    │  │
│  └───┘   └───┘      │  │                │  │
│   │        ▲         │  │  [小红立绘]     │  │
│   │      当前高亮     │  │                │  │
│   └──→ ┌───┐        │  │  小红：你怎么来  │  │
│        │◇B │──→…    │  │  这么早？       │  │
│        └───┘        │  │                │  │
│                      │  │  ► 追问原因     │  │
│  编辑连线/条件/变量   │  │  ► 转移话题     │  │
│                      │  └────────────────┘  │
│  纯编辑职责           │  纯预览职责           │
└──────────────────────┴──────────────────────┘
```

**与已有模式的一致性**：

| 模块 | Editor | Preview | 通信 |
|------|--------|---------|------|
| neko-story | Fountain 文本编辑器 | ScriptPreview 渲染视图 | Extension Host 中转 |
| neko-cut | Timeline 时间线 | PreviewPanel 视频预览 | Extension Host + WebSocket 流 |
| **本 ADR** | **Canvas 图编辑** | **NarrativePreview 交互播放** | **Extension Host 中转** |

**否决方案——Canvas 内双模切换（Graph Mode + Play Mode）**：

Canvas 的基础设施（无限画布 / zoom+pan / 节点框选 / 连线拖拽）和沉浸预览的需求（固定视口 / 顺序阅读 / 全屏场景渲染）存在根本冲突：

| 维度 | 图编辑 | 沉浸预览 |
|------|--------|---------|
| 视口 | 无限画布，自由缩放 | 固定尺寸，场景铺满 |
| 交互 | 多选、框选、拖拽节点 | 点击选项、滚动文字 |
| 焦点 | 全局拓扑 | 当前单一场景 |
| 渲染 | 小节点卡片 + 连线 | 全屏背景 + 立绘 + 对话框 |
| 鼠标 | pan（中键拖拽）、zoom（滚轮） | 滚动文字、hover 选项 |

在同一 Webview 里切换需要大量 mode gate 代码——每个事件处理器都要判断当前模式。分离后各自干净。

**分离架构的额外优势**：

1. **Preview = 导出原型**。NarrativePreview 是自包含的 React 应用，HTML5 导出 = 把 Preview 打包成独立页面。Preview 里看到什么，导出就是什么。双模方案需要从 Canvas store/hooks/subsystem 中抽离渲染逻辑再重新打包——额外工作和一致性风险
2. **并排实时反馈**。编辑和预览同时可见，修改立即体现。不需要在模式间来回切换
3. **Canvas 保持纯粹**。Canvas 已有的 `NarrativePlaybackController`（三按钮步进高亮）继续作为轻量图遍历工具，不承担沉浸预览职责

**Canvas 工具栏保留现有播放控件**：

现有 `NarrativePlaybackController` 的三按钮（上一步/播放/下一步）沿 defaultPath 步进高亮节点，用于快速检查图连通性。这与 NarrativePreview 的沉浸式播放不冲突——前者是"图的遍历工具"，后者是"叙事的体验工具"。

### D3: Canvas ↔ Preview 双向联动协议

**决策**：两个 Webview 通过 Extension Host 中转通信。Canvas 和 Preview 各自通过 `vscode.postMessage` 发送消息到 Extension Host，Extension Host 路由到对端。

**消息协议**：

```typescript
// 所有消息携带 requestId，防止快速编辑时旧消息覆盖新状态
interface NarrativeMessageEnvelope {
  requestId: string;               // ulid，发送方生成
}

// Canvas → Preview（通过 Extension Host 中转）
type CanvasToPreviewMessage = NarrativeMessageEnvelope & (
  | { type: 'preview:loadGraph'; snapshot: NarrativeGraphSnapshot; revision: number }
  | { type: 'preview:jumpTo'; nodeId: string; revision: number }
  | { type: 'preview:refresh'; snapshot: NarrativeGraphSnapshot; revision: number }
  | { type: 'preview:loadPlaybackPlan'; plan: CanvasPlaybackPlan; revision: number }
  | { type: 'preview:refreshPlaybackPlan'; plan: CanvasPlaybackPlan; revision: number }
  | { type: 'preview:setVariables'; variables: Record<string, unknown> }
  | { type: 'preview:setGenre'; genre: StoryGenre }
);

// Preview → Canvas（通过 Extension Host 中转）
type PreviewToCanvasMessage = NarrativeMessageEnvelope & (
  | { type: 'canvas:highlightPath'; nodeIds: string[] }
  | { type: 'canvas:highlightNode'; nodeId: string }
  | { type: 'canvas:choiceMade'; fromNodeId: string; toNodeId: string }
);

// Extension Host 路由
// NarrativePreviewBridge.ts — 归属 neko-canvas/packages/extension/
// 原因：Bridge 需要访问 Canvas editor provider 的当前文档模型（in-memory），
// 不能从磁盘 .nkc 读取（用户可能有未保存编辑）。
class NarrativePreviewBridge {
  constructor(
    private canvasEditorProvider: CanvasEditorProvider,  // 拥有当前文档模型
    private previewPanel: vscode.WebviewPanel,
  ) {}

  // 从 editor provider 的 in-memory 文档模型提取叙事图快照和 Canvas Playback Plan
  private extractGraphSnapshot(): { snapshot: NarrativeGraphSnapshot; plan?: CanvasPlaybackPlan; revision: number } {
    const document = this.canvasEditorProvider.currentDocument;
    // 提取 narrative 节点/连线/metadata，并对同一 CanvasData 做 playback 投影，不从磁盘读 .nkc
    // revision 为文档的编辑版本号，用于乐观并发控制
  }

  routeCanvasMessage(msg: CanvasToPreviewMessage): void {
    this.previewPanel.webview.postMessage(msg);
  }

  routePreviewMessage(msg: PreviewToCanvasMessage): void {
    this.canvasEditorProvider.postMessageToWebview(msg);
  }
}
```

**数据来源**：`NarrativePreviewBridge` 从 Canvas editor provider 的 **in-memory 文档模型**（不是磁盘 `.nkc`）提取叙事图快照，并从同一 `CanvasData` 生成瞬态 `CanvasPlaybackPlan`，确保包含未保存编辑。每条消息携带 `revision`（文档编辑版本号）和 `requestId`（ulid），Preview 端丢弃 `revision` 低于已处理值的消息，避免快速编辑时旧消息覆盖新状态。`NarrativeGraphSnapshot` 仍只包含 Narrative Runtime 节点；`scene`、`shot`、`script`、普通分组和媒体序列通过 `CanvasPlaybackPlan` 消费，不能塞入 Narrative Runtime。

**联动交互**：

| 操作 | 发起方 | 消息 | 接收方效果 |
|------|--------|------|-----------|
| 点击 Canvas 节点 | Canvas | `preview:jumpTo` | Preview 跳转到该场景 |
| 修改连线/条件 | Canvas | `preview:refresh` | Preview 重新加载故事图 |
| 右键"从此处预览" | Canvas | `preview:jumpTo` | Preview 从该节点开始播放 |
| 选择分支 | Preview | `canvas:choiceMade` | Canvas 高亮走过的边 |
| 场景切换 | Preview | `canvas:highlightNode` | Canvas 选中当前节点 |
| 播放路径推进 | Preview | `canvas:highlightPath` | Canvas 高亮已访问路径 |

**同步示意**：

```
Canvas Webview              Extension Host              Preview Webview
     │                            │                           │
     │── click node(id) ────────→ │                           │
     │                            │── preview:jumpTo(id) ───→ │
     │                            │                           │── render scene
     │                            │                           │
     │                            │ ←── canvas:highlightNode ─│
     │ ←── highlightNode ──────── │                           │
     │                            │                           │
     │                            │                           │── user clicks choice
     │                            │ ←── canvas:choiceMade ────│
     │ ←── highlightPath ──────── │                           │
     │── highlight edge ──        │                           │
     │                            │                           │
     │── edit condition ────────→ │                           │
     │                            │── preview:refresh ──────→ │
     │                            │                           │── reload graph
```

### D4: Narrative Preview 面板设计

**决策**：Narrative Preview 是独立的 Webview Panel，包含工具栏、Scene Viewport、PlaybackControlBar 三个区域。

**布局**：

```
┌─ Narrative Preview ─────────────────────────────────────────┐
│ [VN ▼] [ADV ▼]                [变量] [历史] [⛶ 全屏]        │ ← 工具栏
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │                  Scene Viewport                     │   │
│  │           (背景 + 立绘 + 对白 + 选项)                │   │
│  │                                                     │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [◄ 回退] [▶/⏸] [► 下一步] [⏭ 下一选择] │ 速度:1x │ 3/12   │ ← 播放控件
└─────────────────────────────────────────────────────────────┘
```

**工具栏**：

| 控件 | 功能 |
|------|------|
| Genre 切换 | 切换渲染器（VN / 互动影游 / 图文） |
| ADV/NVL 切换 | 视觉小说对话显示模式（仅 VN 渲染器时显示） |
| 变量面板 | 侧边浮出，显示/编辑当前变量状态（调试用） |
| 历史面板 | 侧边浮出，显示已走过的节点路径 + 选择记录 |
| 全屏 | Viewport 全屏展示（隐藏工具栏和播放控件） |

**PlaybackControlBar**：

| 控件 | 功能 | 与 neko-cut 的对比 |
|------|------|------------------|
| ◄ 回退 | 历史栈回退到上一节点 | 类似 Rewind，但按节点而非帧 |
| ▶/⏸ 播放/暂停 | 自动前进（默认路径），Choice 时暂停 | 类似 Play/Pause |
| ► 下一步 | 手动前进一步（一段对白或一个 action） | 类似 Forward |
| ⏭ 下一选择 | 跳过中间叙事直达下一个 Choice 节点 | 无对应（neko-cut 是连续时间轴） |
| 速度 | 文字显示速度 / 视频播放速度 | 类似 Speed 下拉 |
| 进度 | `已访问节点/总节点` | 类似时间显示，但离散 |

**关键差异**：neko-cut 的控件是连续时间轴上的（seek bar / 精确到帧），交互叙事是离散节点间的（步进 / 分支选择）。不需要 seek bar，但需要**历史路径面包屑**。

### D5: Scene Viewport 渲染——预览能力与人物演绎

**决策**：Scene Viewport 是 Preview 的核心渲染区域。所有渲染 **DOM-native**（Preview = 导出原型，必须脱离 VSCode/engine 独立运行）。

**预览内容能力分级**：

| 内容类型 | 优先级 | 渲染方式 | 技术方案 |
|---------|--------|---------|---------|
| 剧本文本（对白/旁白/动作） | P0 | 对白框 + 旁白文字 + 打字机效果 | 纯 HTML/CSS |
| 背景图/CG | P0 | 全屏 `<img>` + CSS transition（淡入/淡出/滑动） | DOM-native |
| 分支选项 | P0 | 可点击按钮/链接（三种 choiceLayout） | DOM-native |
| 角色立绘 | P0 | 多层 `<img>` 绝对定位（左/中/右）+ 表情切换 | DOM-native |
| BGM / 音效 | P1 | 场景切换时触发 | `<audio>` 标签 |
| 角色语音 | P1 | 逐句播放，配合对白高亮 | `<audio>` 标签 |
| 视频片段（互动影游） | P1 | 预导出 mp4 播放，结束后触发选项 | `<video>` 标签 |
| 分镜表浏览 | P1 | 镜头描述 + 参考图网格（只读，非编辑） | DOM-native |

**选项渲染——按创作类型分派**：

```
视觉小说 (choiceLayout: 'dialogue-box'):
┌──────────────────────────┐
│  [背景]                   │
│       [角色立绘]           │
│                           │
│  ┌──────────────────────┐ │
│  │ 小红：你怎么想？       │ │
│  │                      │ │
│  │  ► 追问原因           │ │  ← 选项在对话框内
│  │  ► 转移话题           │ │
│  └──────────────────────┘ │
└──────────────────────────┘

互动影游 (choiceLayout: 'overlay-center'):
┌──────────────────────────┐
│  [视频最后一帧/冻结]       │
│                           │
│     ┌──────────────┐     │
│     │ ► 追问原因    │     │  ← 选项浮在视频上方
│     │ ► 转移话题    │     │
│     └──────────────┘     │
│                           │
└──────────────────────────┘

图文游戏 (choiceLayout: 'inline'):
┌──────────────────────────┐
│  [插图]                   │
│                           │
│  你走到了岔路口。          │
│  左边是幽暗的小路，        │
│  右边是宽阔的大道。        │
│                           │
│  ► 走左边的小路            │  ← 选项在文本流末尾
│  ► 走右边的大道            │
│  ▸ 原地等待 [需要勇气≥3]  │  ← 条件不满足时灰显
└──────────────────────────┘
```

**选项交互流程**：

```
NarrativeRuntime.status == 'waiting-choice'
  → PlayRenderer.renderChoice(choices)
  → 用户点击选项
  → NarrativeRuntime.advance(choiceIndex)
  → 应用 variableEffects
  → 发送 canvas:choiceMade 到 Canvas
  → 切换到目标节点
  → NarrativeRuntime.status = 'playing'
  → PlayRenderer.renderScene(nextNode)
```

**条件不满足的选项**：渲染为灰色禁用状态，hover 提示"需要 XX ≥ N"。通过消融开关 `narrative.showLockedChoices` 控制显示策略（隐藏 vs 灰显）。

**人物演绎能力分级**：

| 级别 | 表现 | 技术方案 | 优先级 | 导出兼容 |
|------|------|---------|--------|---------|
| **L0 静态立绘** | 固定立绘 + 表情差分图切换 | `<img>` src 替换 + crossfade | P0 | 完全兼容 |
| **L1 CSS 待机动效** | 呼吸/微摇晃/入场动画 | CSS `@keyframes`（transform scale/translate 循环） | P0 | 完全兼容 |
| **L2 Live2D** | MOC3 待机 + 表情 + 口型同步 | Cubism Web SDK（`<canvas>` 2D） | Phase 3.5+ 延后 | 兼容（SDK ~200KB） |
| **L3 Spine** | 骨骼动画角色表演 | spine-ts runtime（`<canvas>` 2D） | Phase 3.5+ 延后 | 兼容（runtime ~150KB） |
| **L4 3D 角色** | 3D 模型实时演绎 | 需 engine 流（超出 DOM-native 范围） | P3 远期 | 需预渲染 |

**P0 阶段**覆盖 90% 视觉小说需求：静态立绘 + 表情切换 + CSS 呼吸/入场动效。

**L2/L3 可行性与状态**：Cubism Web SDK 和 spine-ts 都是纯 `<canvas>` 2D 渲染，不依赖 WebGL heavy pipeline，可在 Webview 中运行，也能打包到 HTML5 导出中。但 PR11 / PR12 已从原 Phase 3 延后到 Phase 3.5+，Phase 0-2 只保留 feature gate 与静态/CSS 演绎路径。

**L4 限制**：3D 角色演绎必须走 engine streaming（类似 neko-cut 的 H264 流），与"Preview = 导出原型"设计原则冲突。作为远期扩展，需预渲染为视频片段后嵌入。

### D6: PlayRenderer 分类型注册

**决策**：Scene Viewport 的渲染按创作类型分派，通过 `PlayRenderer` 接口注册：

```typescript
interface PlayRenderer {
  readonly genre: StoryGenre;
  renderScene(
    node: NarrativeSceneData,
    directives: PlayDirective[],
    context: PlayContext
  ): React.ReactNode;
  renderChoice(choices: ChoiceOption[]): React.ReactNode;
  renderEnding(node: NarrativeSceneData, stats: PlayStats): React.ReactNode;
}

interface NarrativeSceneData {
  nodeId: string;
  label: string;
  sceneRef?: string;
  metadata: NarrativeSceneMetadata;
}

interface PlayContext {
  variables: Record<string, unknown>;
  visitedNodes: Set<string>;
  characters: CharacterMap;
  assets: AssetResolver;
  history: NarrativeSceneData[];
}

interface ChoiceOption {
  label: string;
  targetNodeId: string;
  condition?: string;
  conditionMet: boolean;
  disabled?: boolean;
}

interface PlayStats {
  totalNodes: number;
  visitedCount: number;
  pathTaken: string[];
  variableSnapshot: Record<string, unknown>;
}
```

**三种内建渲染器**：

| 渲染器 | 创作类型 | Scene Viewport 内容 | 素材来源 |
|--------|---------|-------------------|---------|
| `InteractiveFilmRenderer` | interactive-film | `<video>` 播放器 + 字幕叠层 + 选项浮层 | neko-cut 导出 mp4 |
| `VisualNovelRenderer` | visual-novel | 背景 `<img>` + 立绘 `<img>` 层叠 + ADV/NVL 对话框 + 打字机效果 + 人物演绎 | neko-puppet + neko-sketch |
| `IllustratedTextRenderer` | illustrated-text | 富文本渲染 + 内嵌 `<img>` 插图 + 状态/物品面板 | neko-story + neko-sketch |

**渲染器选择**：由 Canvas narrative metadata 的 `genre` 字段决定，也可在工具栏 Genre 下拉切换。

**ADV / NVL 模式**（视觉小说渲染器特有）：

```typescript
interface VisualNovelConfig {
  textDisplay: 'adv' | 'nvl';
  // ADV: 底部对话框，角色名 + 对白（《Fate》/《逆转裁判》）
  // NVL: 全屏文字铺满（《寒蝉》/《魔法使之夜》）
  typewriterSpeed?: number;      // 打字机效果速度（字/秒）
  autoAdvanceDelay?: number;     // 自动前进延迟（ms）
  characterPositions?: Record<string, 'left' | 'center' | 'right'>;
}
```

### D7: 场景内容解析——Fountain 到 Play 指令

**决策**：Preview 需要从标准 Fountain 文本中提取结构化的演出指令。这通过 `FountainPlayParser` 完成，**不修改 Fountain 语法**，而是利用 Fountain 已有元素的语义约定：

```typescript
interface PlayDirective {
  type: 'scene-heading' | 'dialogue' | 'action' | 'transition' | 'note';
  raw: string;
}

interface SceneHeadingDirective extends PlayDirective {
  type: 'scene-heading';
  location: string;              // "咖啡馆"
  time: string;                  // "白天"
  backgroundRef?: string;        // 从 characters.yaml 解析的背景资产引用
}

interface DialogueDirective extends PlayDirective {
  type: 'dialogue';
  character: string;             // "小红"
  parenthetical?: string;        // "放下包，坐下来"
  text: string;                  // "你今天怎么来这么早？"
  characterRef?: CharacterAsset; // 从 characters.yaml 解析的角色资产
}

interface ActionDirective extends PlayDirective {
  type: 'action';
  text: string;                  // "小红推门进来，环顾四周"
}
```

**角色/资产绑定**：通过 `characters.yaml` 将 Fountain 中的角色名映射到具体资产：

```yaml
characters:
  小红:
    portrait: assets/characters/xiaohong/default.png
    expressions:
      happy: assets/characters/xiaohong/happy.png
      sad: assets/characters/xiaohong/sad.png
      surprised: assets/characters/xiaohong/surprised.png
    position: right
    # L2 扩展
    live2d: assets/characters/xiaohong/model.moc3
    motions:
      idle: assets/characters/xiaohong/idle.motion3.json
  小明:
    portrait: assets/characters/xiaoming/default.png
    position: left

backgrounds:
  咖啡馆:
    day: assets/backgrounds/cafe-day.jpg
    night: assets/backgrounds/cafe-night.jpg
  森林:
    default: assets/backgrounds/forest.jpg
```

**表情推断**：Fountain 的 Parenthetical（圆括号内容）用于映射表情：

```
小红
（惊讶地）        → expressions.surprised
你居然在这里？
```

`FountainPlayParser` 在 Parenthetical 中匹配 `characters.yaml` 定义的表情关键词。未匹配则使用 `default` 表情。AI Agent 可辅助生成更精确的表情标注。

### D8: Canvas-native 故事节点体系

**决策**：新增 `narrative-start` 和 `narrative-ending` 两种 Canvas 节点类型，构成完整的故事图入口/终点语义。Canvas narrative 节点直接承载故事图数据，不投影外部格式。

**节点类型映射表**：

| Canvas 节点类型 | 语义角色 | 状态 | 视觉标识 |
|----------------|---------|------|---------|
| `narrative-start` | 故事入口（至多一个） | **新增** | `▶` 绿色 #22c55e |
| `narrative-scene` | 场景节点（链接 Fountain） | 已有 | `§` 蓝色 #0ea5e9 |
| `choice` | 分支选择点 | 已有 | `◇` 橙色 #f97316 |
| `merge` | 分支汇合点 | 已有 | `◆` 绿色 #22c55e |
| `narrative-ending` | 故事终点（可多个） | **新增** | `■` 红色 #ef4444 |
| `narrative-note` | 注释/备忘（不参与遍历） | 已有 | `¶` 紫色 #a855f7 |

**结构约束**：

| 约束 | 规则 | 校验时机 |
|------|------|---------|
| `narrative-start` 唯一性 | 画布中至多一个 start 节点 | 创建时 + FlowTraversal |
| `narrative-start` 无入边 | start 不接受入向连线 | 连线时校验 |
| `narrative-ending` 无出边 | ending 不发出连线 | 连线时校验 |
| `entryNodeId` 自动绑定 | 创建 start 节点时自动设为 `NarrativeMetadata.entryNodeId` | 创建时 |

**`narrative-scene` 节点 metadata 扩展**：

```typescript
interface NarrativeSceneMetadata {
  sceneRef?: string;                       // scenes/*.fountain 相对路径
  backgroundRef?: NarrativeAssetRef;       // 背景图资产引用
  bgm?: NarrativeAssetRef;                 // 背景音乐
  characters?: string[];                   // 出场角色名（从 characters.yaml 解析）
  variableEffects?: VariableEffect[];      // 进入时变量修改
}

interface VariableEffect {
  variableId: string;
  operation: 'set' | 'add' | 'subtract' | 'toggle';
  value: unknown;
}
```

**双击委托——遵循 Canvas Preview Boundary ADR 的 double-click to delegate 模式**：

```
narrative-scene 节点
├─ 静态卡片：场景标题 + Fountain 首行摘要 + 缩略图
├─ Hover：扩展预览（对白片段、角色列表、背景图）
└─ Double-click → Extension Host 打开 neko-story 编辑器编辑 sceneRef 指向的 .fountain 文件
```

已有通道：`subscribeCanvasSceneWriteback()` 已在 story extension 中实现，可监听编辑保存并刷新 Preview。

**`narrative-ending` 节点 metadata**：

```typescript
interface NarrativeEndingMetadata {
  endingType?: 'good' | 'normal' | 'bad' | 'secret' | 'custom';
  endingLabel?: string;            // "True Ending" / "Bad End 01"
  statisticsSummary?: boolean;     // 结束时是否显示游玩统计
}
```

**FlowTraversal 更新**：

现有 `traverseNarrativeFlow()` 使用 `NARRATIVE_NODE_TYPES` Set 过滤叙事节点。当前代码（`canvas-flow-traversal.ts` L21）**错误地包含了 `narrative-note`**——note 是注释节点，不应参与运行图遍历。需修正并扩展：

```typescript
// 参与叙事运行图遍历的节点类型（不含 narrative-note）
const NARRATIVE_TRAVERSAL_NODE_TYPES = new Set([
  'narrative-start',      // 新增：入口
  'narrative-scene',
  'choice',
  'merge',
  'narrative-ending',     // 新增：终点
]);

// 所有 narrative 子系统节点（含 note，用于子系统激活判断等非遍历场景）
const NARRATIVE_NODE_TYPES = new Set([
  ...NARRATIVE_TRAVERSAL_NODE_TYPES,
  'narrative-note',       // 注释节点，不参与遍历
]);
```

**分离理由**：`narrative-note` 是编辑时的注释/备忘，不连接到叙事流，不应出现在 `defaultPath`、`successors`、`deadEndNodeIds` 中。子系统激活判断（`summarizeCanvasSubsystems()`）仍需包含 note。

`narrative-start` 作为入口时，`traverseNarrativeFlow()` 优先使用类型定位（`node.type === 'narrative-start'`），fallback 到 `entryNodeId`，最后到首个 traversal 节点。

`narrative-ending` 节点出现在 `deadEndNodeIds` 中但不视为错误——它是预期的终点。`deadEndNodeIds` 应区分 `narrative-ending`（预期终点）和其他叙事节点的意外死端。

### D8.5: Canvas Playback Layer — 通用播放投影，不扩张 Narrative Runtime

**决策**：Canvas 播放采用 `CanvasData -> CanvasPlaybackPlan -> Preview/UI` 的瞬态投影层。基础 Canvas 仍只保存节点、容器、连接和可选 extension metadata；不在 `CanvasNodeBase` 上新增 `start` / `end` 必填字段，也不引入 `.nks` / `.story` / `.nkstory` 等新故事格式。线性内容直接引用 `.fountain` 文件，分支和播放路线属于 `.nkc` Canvas 图。

**Adapter / profile 与 behavior mode 分离**：

| 维度 | 含义 | 当前取值 |
|------|------|----------|
| Adapter/profile | 如何解释 Canvas 结构 | `auto` / `storyboard` / `narrative` / `media-sequence` / `generic` |
| Behavior mode | 如何执行已投影的计划 | `auto` / `manual` / `linear` / `interactive` |
| Advance policy | 运行时推进触发 | `timer` / `media-ended` / `user-input` / `condition` |

`storyboard` 将 `scene` 容器展开为按序 `shot` 单元，可通过 `scene -> scene` 的 `sequence` 连接继续播放；`narrative` 只投影 `narrative-start` / `narrative-scene` / `choice` / `merge` / `narrative-ending`；`media-sequence` 只携带持久 asset/resource 引用，运行时 URL 由 Preview resolver 现场解析；`generic` 使用容器顺序和 `sequence` / `default` / `choice` 连接播放普通节点。

**排序规则**：

1. 容器子节点：playback node override `order`
2. `container.childPlacements[childId].order`
3. `container.childIds` 顺序
4. 领域顺序（如 `shotNumber` / `sceneNumber`）
5. 稳定 fallback：位置自上而下、自左向右、最后按 node id

连接路线排序：

1. playback edge override `order`
2. `connection.priority`
3. `CanvasData.connections` 数组顺序
4. connection id

`sequence`、`default`、`choice` 是默认可播放连接；`reference` 默认不参与播放路线；`transition` 只作为装饰，除非后续 adapter 明确 opt-in。分组关系仍由 `parentId` + `container.childIds` 表达，连接线不决定归属。

**分支规则**：`linear` 选择排序后的第一条可用连接；`interactive` 在存在多条可用分支时暂停并展示分支按钮，标签优先级为 playback override label、`choiceText`、connection label、默认 continue。条件过滤分支时以 typed diagnostic 表达，不修改底层 Canvas 连接。

**Preview 诊断**：当 Narrative Preview 收到 0 个 runtime nodes 时，不再只显示 “0 runtime nodes”。UI 必须说明 Narrative Runtime 只接受 narrative runtime 节点，并提示 scene/shot、media 或普通分组会通过 Canvas Playback Plan 预览。Preview 消费 plan 时按 unit kind 处理：`shot`/`scene` 显示 storyboard 摘要或高亮，`media` 交给媒体 resolver，`narrative` 交给 Narrative Runtime，`node`/`container` 做通用节点摘要或 Canvas 高亮。

**非目标**：本层不替代 Narrative Runtime、HTML5 narrative export 或条件求值器；不做完整时间线编辑；不把 runtime URL、blob URL、Webview URI、timer handle 或当前 playhead 写回 `.nkc`；不把 `scene` / `shot` 加入 Narrative Runtime 节点集合。

### D9: 叙事运行时（Narrative Runtime）

**决策**：NarrativeRuntime 是 host-independent 的共享内核，位于 `@neko/shared`。Preview Webview、HTML5 Export 和测试只通过共享契约加载 `NarrativeGraphSnapshot`，不直接访问 VSCode API、不读磁盘、不持久化 runtime URL。Story Preview Webview 的 `preview/NarrativeRuntime.ts` 和 `preview/conditionEvaluator.ts` 只是对共享内核的兼容重导出。

```typescript
interface NarrativeRuntime {
  readonly state: NarrativeRuntimeState;

  load(graph: NarrativeGraphSnapshot): void;  // 加载叙事图快照
  start(nodeId?: string): void;
  advance(choiceIndex?: number): void;
  stepBack(): void;
  jumpTo(nodeId: string): void;
  reset(): void;

  getVariable(name: string): unknown;
  setVariable(name: string, value: unknown): void;

  onStateChange: Event<NarrativeRuntimeState>;
  onSceneEnter: Event<NarrativeSceneData>;
  onChoicePresented: Event<ChoiceOption[]>;
  onEnding: Event<{ node: NarrativeSceneData; stats: PlayStats }>;
}

interface NarrativeGraphSnapshot {
  nodes: NarrativeNodeSnapshot[];
  connections: NarrativeConnectionSnapshot[];
  metadata: NarrativeMetadata;
  charactersYaml?: string;  // characters.yaml 路径（Extension Host 解析后传入内容）
}

interface NarrativeRuntimeState {
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  visitedNodeIds: Set<string>;
  history: Array<{ nodeId: string; choiceIndex?: number }>;
  status: 'idle' | 'playing' | 'waiting-choice' | 'ended';
}
```

**与 Canvas 现有 `NarrativePlaybackController` 的关系**：

| | Canvas NarrativePlaybackController | Preview NarrativeRuntime |
|--|----|----|
| **位置** | Canvas Webview 工具栏 | Preview Webview |
| **职责** | 沿 defaultPath 步进高亮节点（图遍历工具） | 完整叙事播放（含分支、变量、选项） |
| **交互** | 三按钮（上一步/播放/下一步） | 完整播放控件 + 场景内选项点击 |
| **渲染** | 仅高亮节点，不渲染场景内容 | 全场景渲染（背景/立绘/对白/视频） |
| **状态** | `NarrativePlaybackState`（简单索引） | `NarrativeRuntimeState`（完整变量+历史） |
| **保留** | 保留现有实现，不修改 | 新增 |

**条件表达式求值**：复用 Multi-Purpose Canvas ADR 已定义的 `ConditionEvaluator`。表达式语法为简单比较，白名单 AST（不使用 `eval` / `new Function`）：

```
closeness >= 3
hasItem == true
visitCount > 0
chapter == "act2"
```

**资源解析——对齐 ResourceRef + ContentAccessIntent**：

Preview 中的资源引用对齐仓库已有的 `ResourceRef`（`resource-cache.ts`）和 `ContentAccessIntent`（`content-access.ts`），不自创 stringly-typed 接口：

```typescript
import type { ResourceRef } from '@neko/shared';
import type { ContentAccessIntent } from '@neko/shared';

// 叙事资源引用：优先 ResourceRef，兼容项目相对路径
type NarrativeAssetRef =
  | ResourceRef                                          // 稳定跨包引用
  | { readonly kind: 'relative-path'; readonly path: string };  // characters.yaml 中的简写

interface NarrativeAssetResolver {
  resolve(
    ref: NarrativeAssetRef,
    intent: ContentAccessIntent,    // 'interactive-preview' | 'final-export' | 'package'
  ): Promise<string>;               // 返回可用 URL 或路径
}
```

| 场景 | `ContentAccessIntent` | 解析结果 |
|------|----------------------|---------|
| Preview Webview 中渲染 | `'interactive-preview'` | `webview.asWebviewUri()` 结果 |
| HTML5 导出打包 | `'final-export'` | 相对路径（`assets/...`） |
| 发行包 | `'package'` | 内联或相对路径 |

`NarrativeSceneMetadata` 中的 `backgroundRef` / `bgm` 等字段存储 `NarrativeAssetRef`（持久化时序列化为 `ResourceRef` 或 `{ kind, path }`）。Runtime-only 的 webview URI 不持久化。

NarrativeRuntime 和 PlayRenderer 通过 `NarrativeAssetResolver` 获取资源 URL，不直接依赖 VSCode API。Preview 注入 `'interactive-preview'` intent；导出分别注入 `'final-export'` 和 `'package'` intent，确保导出产物不复用 Webview URI、blob URL、object URL 或 engine runtime token。

### D10: 导出管线——Preview 即导出原型

**决策**：HTML5 导出复用与 Narrative Preview 相同的共享运行时语义，并通过 host adapter 替换资源解析和文件读取。`NarrativeExporter` 是纯导出编排类：输入 `NarrativeGraphSnapshot`，通过注入的 `readScene`、`NarrativeAssetResolver` 和 `copyAsset` 读取标准 `.fountain` 场景、解析 `characters.yaml`、打包资产，并生成 HTML5 artifacts。它不直接依赖 VSCode API，不把 React 引入 Extension Host，也不把 Preview 的 runtime URL 写入 `story.json`。

```
Narrative Preview (VSCode Webview)
  │
  ├── NarrativePlayer.tsx          ← 播放器 shell / controls
  ├── @neko/shared NarrativeRuntime ← 共享状态机
  ├── renderers/
  │   ├── VisualNovelRenderer.tsx
  │   ├── InteractiveFilmRenderer.tsx
  │   └── IllustratedTextRenderer.tsx
  │
  ▼
NarrativeExporter (neko-story/packages/extension/src/export/)
  │
  ├── 接收 Canvas bridge 提供的 NarrativeGraphSnapshot
  ├── readScene(sceneRef) → loadFountainPlayScene()
  ├── NarrativeAssetResolver('final-export') → source/export material
  ├── NarrativeAssetResolver('package') → packaged bundle material
  ├── copyAsset(adapter) → 相对 assets/... 输出
  └── 输出:
      ├── index.html
      ├── data/story.json         ← graph + parsed Fountain scenes + bindings + asset manifest
      ├── assets/neko-narrative-runtime.js
      ├── assets/neko-narrative-renderer.js
      └── assets/...              ← 相对打包资产
```

**导出格式**：

| 格式 | 产物 | 运行依赖 |
|------|------|---------|
| **HTML5** | 单 `index.html` + 资产目录 | 浏览器 |
| **Electron** | 桌面应用包 | 无 |
| **JSON Bundle** | 叙事图 + 场景 + 资产打包 | 第三方引擎适配 |

当前 Phase 0-2 已完成的是 `NarrativeExporter` 纯编排内核、HTML5 artifact 生成与测试。`host-cli` / `deliverables render` 的无头命令面接入仍作为后续 Deliverables/CLI 表面工作，可在接入后进入 CI 管线。

---

## 三、与现有架构的关系

### 3.1 不修改 / 不重复建设

| 现有能力 | 本 ADR 的复用方式 |
|---------|-----------------|
| Narrative 子系统节点类型（choice/merge/narrative-scene/narrative-note） | 直接复用，新增 narrative-start + narrative-ending |
| Narrative 子系统 triggerNodeTypes | 扩展为 6 种节点类型 |
| FlowTraversal API | Canvas 图遍历 + NarrativeRuntime 路径计算 |
| NarrativePlaybackController（三按钮） | 保留现有实现，Canvas 内轻量图遍历 |
| ConditionEvaluator | Preview 条件求值 |
| neko-story Fountain LSP | 场景内容编辑，零修改 |
| neko-story ScriptIndex | 结构化提取场景元数据 |
| characters.yaml / Asset Federation | 角色/资产绑定 |
| `script` 节点文件拖入 | `.fountain` 拖入 Canvas 作为引用节点（storyboard 子系统，不参与 narrative 遍历） |
| subscribeCanvasSceneWriteback | Fountain 编辑后同步刷新 |

### 3.2 新增模块

| 模块 | 位置 | 职责 |
|------|------|------|
| `narrative-start` / `narrative-ending` 节点注册 | @neko/shared（types）+ neko-canvas/packages/webview/ | Canvas 节点类型 + descriptors + presets |
| `CanvasPlaybackPlan` / adapter registry | @neko/shared（types） | 将 CanvasData 瞬态投影为 storyboard / narrative / media-sequence / generic 播放计划 |
| `CanvasPlaybackController` | neko-canvas/packages/webview/ | 共享 Canvas 播放控件；显示 adapter/mode、路径位置、分支选项和当前播放高亮 |
| `NarrativePreviewBridge` | **neko-canvas/packages/extension/** | Canvas ↔ Preview 消息路由 + 从 editor document model 提取叙事图快照和 Canvas Playback Plan |
| `FountainPlayParser` | neko-story/packages/parser/ | Fountain → PlayDirective[]（扩展现有 parser 包） |
| `NarrativeAssetResolver` | @neko/shared（接口）+ Extension Host adapters | 端口化资源解析（`interactive-preview` / `final-export` / `package`） |
| `NarrativeRuntime` | **@neko/shared**（`types/narrative-runtime.ts`） | host-independent 叙事状态机，Preview 与 HTML5 Export 共用 |
| `NarrativePlayer` | neko-story/packages/webview/（preview 子目录） | Preview 核心播放器组件 |
| `InteractiveFilmRenderer` | neko-story/packages/webview/（preview 子目录） | 互动影游渲染器 |
| `VisualNovelRenderer` | neko-story/packages/webview/（preview 子目录） | 视觉小说渲染器 |
| `IllustratedTextRenderer` | neko-story/packages/webview/（preview 子目录） | 图文游戏渲染器 |
| `NarrativeExporter` | neko-story/packages/extension/src/export/ | 纯导出编排；通过注入 reader/resolver/copy adapter 生成 HTML5 artifacts |
| Agent 叙事诊断与摘要 | @neko/shared + neko-canvas/packages/webview/ | 结构化 Agent context；不包含 resolved Preview URL 或 renderer state |

**包路径说明**：neko-story 当前子包为 `extension/parser/types/webview`。Preview 组件放入 `webview/` 包的 `src/preview/` 子目录（共享 Vite 构建配置），而非新建顶层子包。若后续 Preview Webview 需要独立构建入口（独立 `index.html`），再提升为 `@neko-story/preview` 子包。

### 3.3 依赖方向

```
neko-story/packages/parser/ (Domain Layer — 现有包)
  └── FountainPlayParser       ← Fountain → PlayDirective（扩展现有 parser）

neko-story/packages/webview/src/preview/ (UI Layer — 独立 Webview 入口)
  ├── NarrativePlayer          ← 核心播放器组件
  ├── NarrativePreviewController ← 消费共享 Runtime + CanvasPlaybackPlan，处理 revisioned messages
  └── renderers/               ← 三种类型渲染器

neko-story/packages/extension/ (Bridge Layer — 现有包)
  └── NarrativeExporter        ← HTML5 导出编排（无 VSCode API 硬依赖）

neko-canvas/packages/extension/ (Bridge Layer — 现有包)
  └── NarrativePreviewBridge   ← Canvas ↔ Preview 消息路由 + 从 editor document model 提取叙事图和播放计划

neko-canvas/packages/webview/ (UI Layer — 现有)
  ├── narrative-start / narrative-ending descriptors + presets  ← 新增
  ├── CanvasPlaybackController ← adapter-aware 共享播放控件（storyboard/generic/media/narrative）
  └── NarrativePlaybackController ← narrative 子系统轻量步进能力迁移到共享播放层

@neko/shared (Layer 0)
  ├── types/canvas.ts               ← REGISTERED_CANVAS_NODE_TYPES 扩展
  ├── types/canvas-subsystem.ts      ← narrative triggerNodeTypes 扩展
  ├── types/canvas-flow-traversal.ts ← NARRATIVE_TRAVERSAL_NODE_TYPES / NARRATIVE_NODE_TYPES 拆分
  ├── types/canvas-playback.ts       ← CanvasPlaybackPlan + adapter registry + ordering/diagnostics helpers
  ├── types/narrative-preview.ts     ← Canvas ↔ Preview 消息类型 + NarrativeGraphSnapshot + CanvasPlaybackPlan messages
  ├── types/narrative-asset.ts       ← NarrativeAssetRef / NarrativeAssetResolver 接口
  ├── types/narrative-runtime.ts     ← NarrativeRuntime + WhitelistConditionEvaluator
  └── types/canvas-narrative-agent.ts ← Agent-facing diagnostics + structured summaries
```

遵守 `no-cross-extension-deps` 规则——neko-canvas 不 import neko-story。通过共享类型 + Extension API + postMessage 通信。

---

## 四、用户工作流

### 4.1 从零开始创建多分支叙事

```
1. 新建 Canvas: 命令面板 "Neko Canvas: New Canvas"
   → 创建 narrative.nkc
   → 从节点库拖入 narrative-start 节点（narrative 子系统激活）

2. 构建故事图:
   → 拖入 narrative-scene 节点 + choice 节点 + merge 节点
   → 连线建立分支结构
   → 在 choice 连线上编辑选项文字和条件

3. 编写场景内容:
   → 双击 narrative-scene 节点 → 在 neko-story 中编写标准 .fountain 内容
   → 不创建 .nks / .story / .nkstory 叙事文件
   → 编辑 characters.yaml 绑定角色立绘、背景图

4. 交互预览:
   → 命令面板 "Neko: Open Narrative Preview"（或 Canvas 工具栏按钮）
   → 打开 Narrative Preview 面板（与 Canvas 并排显示）
   → 从 Start 开始交互式体验
   → 阅读对白 → 选择分支 → 观察 Canvas 路径高亮
   → 发现问题 → 修改 Canvas 节点/连线 → Preview 实时刷新

5. 添加终点:
   → 拖入 narrative-ending 节点（可多个：good/bad/secret ending）
   → 连线到达终点 → Preview 显示游玩统计

6. 导出:
   → 命令面板 "Neko: Export Interactive Story"
   → 选择 HTML5 → 生成可分享的单页应用
```

### 4.2 线性剧情 + 少量分支

```
编剧（neko-story）:
  → 在 neko-story 中写线性 Fountain 剧本
  → 需要加分支时 → 新建 Canvas，创建 narrative-scene 节点
  → 每个 narrative-scene 的 sceneRef 指向已有的 .fountain 文件
  → 在 Canvas 中添加 choice 节点连接分支 narrative-scene
  → 形成"主线线性 + 局部分支"的混合结构
```

**script 节点的角色**：`.fountain` 拖入 Canvas 产生的 `script` 节点是**引用源**（storyboard 子系统），不参与 narrative 遍历。如需将 script 节点的场景纳入叙事流，用户应创建对应的 `narrative-scene` 节点并设置 `sceneRef` 指向同一 `.fountain` 文件。不提供自动"展开"机制——引用与叙事节点是不同语义。

### 4.3 编剧与策划协作

```
编剧（neko-story）:
  → 打开 scenes/cafe-encounter.fountain
  → 用标准 Fountain 写对白和动作
  → 保存 → Preview 实时刷新对应场景

策划（neko-canvas + Narrative Preview 并排）:
  → Canvas 中调整分支结构、添加条件、设置变量
  → Preview 中测试流程、选择分支
  → 发现缺少一个场景 → Canvas 中新建 narrative-scene → 通知编剧填写
```

### 4.4 AI Agent 辅助

```
已落地:
  → 读取 Canvas 叙事图理解全局分支结构（structured Canvas context）
  → 分析分支覆盖率（死路径检测、未连接节点、缺少 ending 的路径）
  → 输出 missing entry / unreachable node / accidental dead end / invalid sceneRef / unsupported condition 等诊断
  → 一致性检查（角色名拼写、变量引用有效性、Fountain sceneRef 有效性）

后续增强:
  → 根据 Fountain 对白自动推荐表情映射
  → 生成分支建议（"此处可加一个好感度判定"）
  → 批量生成 Fountain 场景草稿
```

---

## 五、实施状态与后续计划

### Phase 0: 节点类型 + 共享契约（已完成）

| PR | 状态 | 内容 | 依赖 |
|----|------|------|------|
| PR1 | 完成 | `@neko/shared` 扩展：`REGISTERED_CANVAS_NODE_TYPES` + `triggerNodeTypes` + `NARRATIVE_TRAVERSAL_NODE_TYPES` / `NARRATIVE_NODE_TYPES` 拆分（排除 note 参与遍历）；`NarrativeMetadata` 加 `genre` / `defaultLocale`；`NarrativeSceneMetadata` / `NarrativeEndingMetadata` / `VariableEffect` / `NarrativeAssetRef` 类型；`NarrativeGraphSnapshot` + Canvas ↔ Preview 消息类型（含 `requestId` / `revision`） | 无 |
| PR2 | 完成 | neko-canvas/packages/webview/：`narrative-start` / `narrative-ending` node descriptors + presets + renderer 注册；FlowTraversal 修正（排除 `narrative-note`，入口优先 `narrative-start` 类型） | PR1 |
| PR3 | 完成 | neko-story/packages/parser/：`FountainPlayParser` (Fountain → PlayDirective[]) + 单元测试 | PR1 |

### Phase 1: Preview 核心（已完成）

| PR | 状态 | 内容 | 依赖 |
|----|------|------|------|
| PR4 | 完成 | `NarrativeRuntime` 状态机（共享内核）+ `NarrativeAssetResolver` 接口（@neko/shared）+ `ConditionEvaluator` 白名单 AST + 单元测试 | PR1 |
| PR5 | 完成 | Preview Webview Panel 框架（neko-story/packages/webview/ preview 入口）+ `NarrativePreviewBridge`（neko-canvas/packages/extension/，从 editor document model 提取快照） | PR4, PR2 |
| PR6 | 完成 | `IllustratedTextRenderer`（图文游戏渲染器，验证全链路） | PR5, PR3 |
| PR7 | 完成 | `VisualNovelRenderer`（ADV/NVL + 立绘 L0/L1 + 背景 + 打字机 feature gate） | PR5, PR3 |

### Phase 2: 互动影游 + 导出（已完成）

| PR | 状态 | 内容 | 依赖 |
|----|------|------|------|
| PR8 | 完成 | `InteractiveFilmRenderer`（`<video>` 播放 + 选项浮层） | PR5 |
| PR9 | 完成 | HTML5 导出内核（NarrativeExporter（neko-story/packages/extension/）+ `NarrativeAssetResolver` `final-export` 实现 + 模板打包） | PR4, PR6 |
| PR10 | 完成 | Agent 集成（叙事图分析工具 + 分支覆盖率 + 一致性检查） | PR2 |

### Phase 2.5: Canvas Playback Layer（实施中）

| PR | 状态 | 内容 | 依赖 |
|----|------|------|------|
| PR10.5 | 实施中 | `@neko/shared` 新增 `CanvasPlaybackPlan`、playback metadata、adapter registry、storyboard/generic/media/narrative 投影和 typed diagnostics；`scene` / `shot` 不进入 Narrative Runtime | PR1, PR5 |
| PR10.6 | 实施中 | Canvas Webview 使用 adapter-aware `CanvasPlaybackController`，支持 play/pause、previous/next、路径位置、分支选择和当前播放高亮；子系统 controller 由 Canvas shell 仲裁为单一 active playback surface | PR10.5 |
| PR10.7 | 实施中 | `NarrativePreviewBridge` 在保留 `preview:loadGraph` / `preview:refresh` 的同时发送 `preview:loadPlaybackPlan` / `preview:refreshPlaybackPlan`；0 runtime nodes 诊断区分 Narrative Runtime 与 storyboard/generic/media playback | PR10.5, PR10.6 |

### Phase 3.5+: 人物演绎增强（延后）

| PR | 状态 | 内容 | 依赖 |
|----|------|------|------|
| PR11 | 延后到 Phase 3.5+ | Live2D L2 演绎（Cubism Web SDK 集成 + VisualNovelRenderer 扩展） | PR7 |
| PR12 | 延后到 Phase 3.5+ | Spine L3 演绎（spine-ts 集成） | PR7 |

**当前总计：Phase 0-2 / 10 PR 已完成；Phase 3.5+ / 2 PR 延后，不阻塞核心链路交付。**

---

## 六、消融开关

当前 6 个 `narrative.*` toggle 已接入消融配置契约：`AblationToggles.narrative` → `AblationMarkerHook.narrative`，共享默认由 `NarrativePreviewFeatureToggles` 定义。标准消融套件包含 6 个单项 variant，group/minimal suite 也包含 narrative preview stack 开关。Canvas 扩展贡献 `neko.canvas.narrative.*` settings，并在打开、刷新、跳转和变量同步前把最新 toggle 快照投递给 Preview。

| Toggle | 默认 | 配置状态 | 当前消费状态 | 效果 / 目标 |
|--------|------|----------|--------------|-------------|
| `narrative.preview` | `true` | 已注册 + `neko.canvas.narrative.preview` setting | Extension command/panel hard gate 已接入 | 关闭后 Narrative Preview 面板不可用 |
| `narrative.typewriterEffect` | `true` | 已注册 | Preview renderer feature gate 已接入 | 关闭后对白直接显示，不逐字打出 |
| `narrative.autoExpressionMatch` | `true` | 已注册 | Preview renderer feature gate 已接入；完整表情自动匹配随角色演绎增强推进 | 关闭后不从 Parenthetical 自动推断表情 |
| `narrative.showLockedChoices` | `true` | 已注册 | Preview renderer 已消费 | 关闭后条件不满足的选项隐藏而非灰显 |
| `narrative.previewAutoSync` | `true` | 已注册 | Preview controller 已消费 | 关闭后 Canvas 节点选择和 Preview 高亮路径不自动同步 |
| `narrative.live2dPerformance` | `false` | 已注册 | Preview renderer feature gate 已接入；Live2D runtime 延后到 Phase 3.5+ | 开启后 VN 渲染器优先使用 Live2D 表演路径 |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 两个 Webview 内存开销 | 大型项目占用增加 | Preview 关闭时释放资产；`retainContextWhenHidden` 仅 Canvas 常驻 |
| Canvas ↔ Preview 同步延迟 | 操作不流畅 | postMessage 延迟 < 1ms（同进程）；乐观更新 |
| Fountain 语义不足以表达演出指令 | 立绘位置/BGM/转场无法标注 | characters.yaml 扩展元数据；Fountain Notes (`[[BGM: peaceful]]`) 作为约定；narrative-scene metadata 补充 |
| Canvas .nkc 文件过大 | 100+ 节点 | Canvas 已支持大画布；可按 Chapter 拆分多个 .nkc |
| 导出 HTML5 体积过大 | 互动影游视频资产大 | 视频按需加载（流式）；图文/VN 类型 < 10MB |
| Preview 组件与 VSCode API 耦合影响导出 | 导出需额外解耦 | Preview 从设计上隔离 VSCode 依赖（AssetResolver 端口化，数据通过 props/context 注入） |
| Live2D/Spine SDK 许可证 | 商用限制 | Cubism SDK for Web (MIT/Live2D Proprietary)；spine-ts (Spine license)；需确认许可证条款 |

---

## 八、未来扩展方向（不在本 ADR 范围）

1. **多语言支持**——每个 `.fountain` 文件可有 `.fountain.zh-cn` / `.fountain.en` 变体，Preview 按 locale 切换
2. **3D 角色演绎（L4）**——VN 渲染器接入 engine 实时渲染（需预渲染方案兼容导出）
3. **语音合成**——对白文本 → TTS → 自动配音；角色绑定声纹
4. **多人协作编辑**——Canvas `.nkc` 的 CRDT 同步
5. **Analytics**——记录测试游玩数据（选择分布、完成率、平均时长），辅助叙事平衡调整
6. **Ren'Py / Unity 导出**——NarrativeExporter 适配器，输出 `.rpy` / C# 脚本
7. **存档系统**——Preview 支持 save/load，多存档槽位，导出后也可存档
