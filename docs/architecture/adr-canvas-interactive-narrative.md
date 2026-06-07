# ADR: Canvas 交互叙事双模设计 (Interactive Narrative Dual-Mode Canvas)

> 状态：**Proposed (2026-06-07)**
> 关联：[adr-canvas-kind-multi-purpose.md](./adr-canvas-kind-multi-purpose.md) · [adr-canvas-preview-boundary.md](./adr-canvas-preview-boundary.md) · [story-agent-canvas-boundary.md](./story-agent-canvas-boundary.md) · [adr-deliverable-management.md](./adr-deliverable-management.md) · [adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md) · [agent-media-architecture.md](./agent-media-architecture.md)

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

1. **分支叙事数据模型**——neko-story 的 Fountain 是线性剧本，无分支/条件/变量
2. **交互预览运行时**——当前 preview 只能单向播放，无法处理选项、变量、跳转
3. **导出为可独立运行的格式**——制作完成后无法导出为 HTML5 / Electron 等可交互产物

### 1.3 已有基础

Multi-Purpose Canvas ADR（[adr-canvas-kind-multi-purpose.md](./adr-canvas-kind-multi-purpose.md)）已实现 Narrative 子系统首版：

| 能力 | 状态 | 说明 |
|------|------|------|
| Narrative 节点类型 | 已实现 | `choice` / `merge` / `narrative-scene` / `narrative-note` |
| Choice 连接属性 | 已实现 | `choiceText` / `condition` / `priority` |
| FlowTraversal API | 已实现 | `getSuccessors` / `getChoicesAt` / `resolveDefaultPath` / `detectCycles` |
| 变量浮动面板 | 已实现 | `NarrativeVariable[]` 定义与编辑 |
| 播放控件 | 工具栏 slot | disabled placeholder，步进/路径高亮属后续 P1 |
| CanvasPlaybackState | 已定义 | `activeNodeId` / `visitedNodeIds` / `variables` |

**本 ADR 在此基础上定义**：Canvas 双模交互设计（Graph Mode + Play Mode）、Story-centric SSOT（场景图 + Fountain 片段，不发明新格式）、三种创作类型的 Play Mode 渲染器、以及导出管线。

---

## 二、设计决策

### D1: Story-centric SSOT，Canvas 为投影与交互层

**决策**：叙事内容的 SSOT 分为两层——**场景图结构**（`.nkstory` JSON）+**场景内容**（标准 Fountain 片段）。Canvas 是这些数据的可视化编辑与交互预览表面，不独立持有叙事数据。

**项目结构**：

```
story-project/
├── story.nkstory              ← 场景图 JSON（节点 + 边 + 条件 + 变量定义）
├── scenes/
│   ├── cafe-encounter.fountain  ← 纯标准 Fountain
│   ├── insomnia-branch.fountain
│   ├── daily-chat.fountain
│   └── confession.fountain
├── characters.yaml             ← 角色表（立绘/表情/语音映射）
└── assets/                     ← 媒体资产（背景 CG、立绘、音效、视频片段）
```

**`.nkstory` 场景图格式**：

```typescript
interface StoryGraph {
  version: '1.0';
  metadata: StoryMetadata;
  variables: StoryVariable[];
  nodes: StoryNode[];
  edges: StoryEdge[];
}

interface StoryMetadata {
  title: string;
  author?: string;
  genre: 'interactive-film' | 'visual-novel' | 'illustrated-text' | 'hybrid';
  defaultLocale?: string;
}

interface StoryVariable {
  id: string;
  name: string;
  type: 'number' | 'boolean' | 'string';
  defaultValue: unknown;
  description?: string;
}

interface StoryNode {
  id: string;
  type: 'scene' | 'choice' | 'merge' | 'start' | 'ending';
  label: string;
  sceneRef?: string;           // 指向 scenes/*.fountain 的相对路径
  tags?: string[];             // act1, intro, bad-ending, ...
  variableEffects?: VariableEffect[];  // 进入此节点时的变量修改
  metadata?: Record<string, unknown>;  // 扩展字段（角色出场、背景、BGM）
}

interface StoryEdge {
  id: string;
  from: string;               // 源节点 ID
  to: string;                 // 目标节点 ID
  label?: string;             // 选项文字（对 choice 边）
  condition?: string;         // 条件表达式（如 "closeness >= 3"）
  priority?: number;          // 同源边排序（默认 0）
}

interface VariableEffect {
  variableId: string;
  operation: 'set' | 'add' | 'subtract' | 'toggle';
  value: unknown;
}
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

**设计理由**：

1. **零格式发明**——Fountain 就是 Fountain（现有 LSP 零改动），JSON 就是 JSON（标准 schema 验证）
2. **关注点完全分离**——场景内容由编剧在 neko-story 中编辑，分支结构由策划在 Canvas 中编排
3. **git 友好**——Fountain 文件和 JSON 均可 diff/merge，比混合格式清晰
4. **AI 友好**——Agent 处理结构化 JSON 比解析混合格式容易一个数量级
5. **投影方向天然**——story graph 投影到 canvas 是降维（结构→视觉），反之需升维

**否决方案**：

- **Fountain + Yarn 混合格式**——需要同时理解两套语法的 LSP，交叉验证复杂度高；分支在文本中管理在 10+ 节点时不如可视化编辑
- **Fountain + 最小扩展**（`@choice` / `@if`）——非标扩展，Fountain 编辑器报警；变量系统表达力弱
- **Canvas 自持叙事数据**——违反 `projected` 画布投影模式（D4 of multi-purpose canvas ADR）；叙事数据散落在 `.nkc` 空间布局中，不可独立使用

### D2: Canvas 双模设计（Graph Mode + Play Mode）

**决策**：Canvas 在 Narrative 子系统激活时支持两种交互模式，通过工具栏切换：

```
┌─ 工具栏 ─────────────────────────────────────────────────────────┐
│ [V][C][M][H] [↩ ↪] [Arrange▼]  │  [Graph] [Play] │  [⏮ ◀ ▶⏸]  │
│                                  │   模式切换       │  播放控件     │
└──────────────────────────────────────────────────────────────────┘
```

#### Graph Mode（图编辑模式）

全局拓扑视图，用于故事结构编排：

```
┌──────────────────────────────────────────────────────┐
│  ┌─────────┐     ┌──────────┐     ┌─────────┐       │
│  │ ▶ 开场   │────→│ ◇ 选择A  │────→│ ■ 结局1  │       │
│  │ cafe.ftn │     │ 追问原因  │     │ good.ftn│       │
│  └─────────┘     │ 转移话题  │     └─────────┘       │
│       │          └──────────┘                        │
│       │                                              │
│       │          ┌──────────┐     ┌─────────┐       │
│       └─────────→│ ◇ 选择B  │────→│ ■ 结局2  │       │
│                  │ [好感≥3]  │     │ bad.ftn │       │
│                  └──────────┘     └─────────┘       │
│                                                      │
│  节点操作: 拖拽 / 连线 / 双击编辑 / 右键菜单          │
│  路径高亮: 鼠标悬停节点显示所有可达路径                 │
└──────────────────────────────────────────────────────┘
```

功能：

| 操作 | 效果 |
|------|------|
| 拖拽节点 | 调整布局 |
| 节点间连线 | 创建 StoryEdge（弹出选项文字/条件输入） |
| 双击场景节点 | 在 neko-story 中打开对应 `.fountain` 文件 |
| 右键节点 | 「从此处开始播放」/ 「在 Story 中打开」/ 「删除」 |
| Auto Arrange | Flow (左→右) 自动布局 |
| 鼠标悬停节点 | 高亮该节点所有可达路径（FlowTraversal） |
| 条件标注 | 边上显示条件表达式（如 `好感 ≥ 3`） |

#### Play Mode（沉浸式预览模式）

聚焦当前场景，体验叙事流程：

```
┌────────────────────────────────────────────────────────────┐
│ ┌─ Mini Map (可折叠) ──┐  ┌─ Scene Viewport ────────────┐ │
│ │                      │  │                              │ │
│ │  ┌──┐   ┌──┐        │  │  [背景图: 咖啡馆内景]         │ │
│ │  │开 │──→│◇A│──→ …   │  │                              │ │
│ │  └──┘   └──┘        │  │       ┌──────────┐           │ │
│ │   │      ▲           │  │       │ 小红立绘  │           │ │
│ │   │    当前           │  │       └──────────┘           │ │
│ │   └──→┌──┐           │  │                              │ │
│ │       │◇B│──→ …      │  │  ┌──────────────────────┐   │ │
│ │       └──┘           │  │  │ 小红：你怎么来这么早？ │   │ │
│ │                      │  │  │                      │   │ │
│ └──────────────────────┘  │  │  ► 追问原因           │   │ │
│                           │  │  ► 转移话题           │   │ │
│ ┌─ State Panel ────────┐  │  └──────────────────────┘   │ │
│ │ 好感度: 2             │  │                              │ │
│ │ 已访问: 3/12          │  │  [◄ 回退]        [自动播放]  │ │
│ │ 当前路径: 开场→选择A  │  └──────────────────────────────┘ │
│ └──────────────────────┘                                   │
└────────────────────────────────────────────────────────────┘
```

功能：

| 操作 | 效果 |
|------|------|
| 点击选项 | 前进到对应分支节点，Mini Map 路径高亮 |
| 点击回退 | 回到上一节点（历史栈） |
| 自动播放 | 按默认路径（priority=0）自动前进，Choice 暂停 |
| 点击 Mini Map 节点 | 跳转到该节点预览（不影响变量状态） |
| Esc | 退出 Play Mode，返回 Graph Mode，当前位置高亮 |
| 变量面板 | 实时显示当前变量状态 |
| 修改变量 | 在 State Panel 手动修改变量值（调试用） |

#### 模式切换交互

```
Graph Mode                              Play Mode
    │                                       │
    │── 工具栏 [Play] 按钮 ──────────────→  │  从 start 节点开始
    │── 右键节点 "从此处开始播放" ─────────→  │  从指定节点开始
    │                                       │
    │  ←──────────────── Esc ──────────────  │  返回 Graph，高亮最后位置
    │  ←──────────── 到达 ending 节点 ─────  │  显示结局摘要，返回 Graph
    │                                       │
```

**设计理由**：

- **编辑与预览同一表面**——创作者始终知道自己在故事结构中的位置，不需要在多窗口间切换
- **Mini Map 保持上下文**——Play Mode 不丢失全局视角，选择分支时能看到后续拓扑
- **符合 Canvas Preview Boundary**——Play Mode 的渲染内容（文字、立绘、背景图）均为 DOM-native，不违反"Canvas 不做 WebGL"规则
- **复用已有基础设施**——CanvasPlaybackState / FlowTraversal / ConditionEvaluator 已在 D6 (multi-purpose canvas ADR) 定义

### D3: Play Mode 渲染器分类型注册

**决策**：Play Mode 的场景渲染按创作类型分派，通过 `PlayRenderer` 接口注册到 `PreviewRendererRegistry`：

```typescript
interface PlayRenderer {
  readonly type: StoryGenre;
  renderScene(
    node: StoryNode,
    fountainContent: string,
    context: PlayContext
  ): React.ReactNode;
  renderChoice(choices: ChoiceOption[]): React.ReactNode;
  renderEnding(node: StoryNode, stats: PlayStats): React.ReactNode;
}

interface PlayContext {
  variables: Record<string, unknown>;
  visitedNodes: Set<string>;
  characters: CharacterMap;
  assets: AssetResolver;
  history: StoryNode[];
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
| `InteractiveFilmRenderer` | interactive-film | 视频播放器（engine H264 流）+ 字幕叠层 | neko-cut 导出片段 |
| `VisualNovelRenderer` | visual-novel | 背景 CG + 角色立绘层叠 + ADV/NVL 对话框 + 表情切换 | neko-puppet + neko-sketch |
| `IllustratedTextRenderer` | illustrated-text | 富文本渲染 + 内嵌插图 + 状态/物品面板 | neko-story + neko-sketch |

**渲染器选择**：由 `.nkstory` 的 `metadata.genre` 字段决定，也可在 Play Mode 工具栏切换。

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

**与 Canvas Preview Boundary 的关系**：

Play Mode 的渲染全部在 DOM 内完成（`<img>` / `<video>` / CSS 动画 / 富文本），不引入 WebGL。互动影游的视频播放通过 `<video>` 标签 + engine 预转码轻量 mp4（与 canvas preview boundary 的 Video 行一致）。角色立绘是 `<img>` 层叠 + CSS transform（位置/表情切换），不需要 Live2D 实时渲染——实时渲染属于 neko-puppet 专业编辑器的职责。

### D4: 场景内容解析——Fountain 到 Play 指令

**决策**：Play Mode 需要从标准 Fountain 文本中提取结构化的演出指令。这通过 `FountainPlayParser` 完成，**不修改 Fountain 语法**，而是利用 Fountain 已有元素的语义约定：

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

### D5: Story ↔ Canvas 投影协议

**决策**：`.nkstory` 到 Canvas 的投影复用 Multi-Purpose Canvas ADR 的 `ProjectionAdapter` 机制（D4）：

```typescript
// neko-story 注册的投影适配器
class StoryProjectionAdapter implements ProjectionAdapter {
  readonly sourceUri: string;  // story.nkstory 路径

  async project(): Promise<ProjectedCanvasData> {
    const graph = await this.loadStoryGraph();
    return {
      nodes: graph.nodes.map(n => this.toCanvasNode(n)),
      connections: graph.edges.map(e => this.toCanvasConnection(e)),
      metadata: { narrative: this.toNarrativeMetadata(graph) },
      projected: true,
    };
  }

  async writeBack(changes: ProjectionWriteBack[]): Promise<void> {
    // Canvas 中的编辑操作写回 .nkstory JSON
    // 例如：拖拽节点不写回（纯布局），新增连线写回为 StoryEdge
  }

  onSourceChanged(listener: () => void): DisposableLike {
    // 监听 .nkstory 文件变化，触发 Canvas 重新投影
  }
}
```

**写回边界**：

| Canvas 操作 | 写回目标 | 说明 |
|-------------|---------|------|
| 拖拽节点位置 | `.nkc` 缓存布局 | 纯视觉，不修改 SSOT |
| 新增/删除连线 | `.nkstory` edges[] | 修改叙事结构 |
| 编辑连线条件/选项文字 | `.nkstory` edges[] | 修改叙事逻辑 |
| 新增场景节点 | `.nkstory` nodes[] + 创建 `.fountain` 文件 | 扩展叙事 |
| 删除场景节点 | `.nkstory` nodes[] | 不删除 `.fountain` 文件（防误删） |
| 编辑变量定义 | `.nkstory` variables[] | 修改叙事状态模型 |
| 修改节点 variableEffects | `.nkstory` nodes[] | 修改叙事逻辑 |

**同步方向**：

```
.nkstory (SSOT)  ←→  Canvas (.nkc 缓存)  ←→  用户交互
       ↑                                         │
       └─────── writeBack ────────────────────────┘

scenes/*.fountain (SSOT)  →  FountainPlayParser  →  Play Mode 渲染
       ↑                                              │
       └──── 双击节点在 neko-story 中打开编辑 ──────────┘
```

### D6: 叙事运行时（Narrative Runtime）

**决策**：Play Mode 需要一个轻量运行时追踪当前状态，基于已有 `CanvasPlaybackState` 扩展：

```typescript
interface NarrativeRuntime {
  // 状态
  readonly state: NarrativeRuntimeState;

  // 控制
  start(nodeId?: string): void;         // 从指定节点（或 start 节点）开始
  advance(choiceIndex?: number): void;  // 前进（选择分支或默认路径）
  stepBack(): void;                     // 回退到历史栈上一步
  jumpTo(nodeId: string): void;         // 调试跳转（不修改变量）
  reset(): void;                        // 重置到初始状态

  // 变量
  getVariable(name: string): unknown;
  setVariable(name: string, value: unknown): void;  // 调试用

  // 事件
  onStateChange: Event<NarrativeRuntimeState>;
  onSceneEnter: Event<StoryNode>;
  onChoicePresented: Event<ChoiceOption[]>;
  onEnding: Event<{ node: StoryNode; stats: PlayStats }>;
}

interface NarrativeRuntimeState {
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  visitedNodeIds: Set<string>;
  history: Array<{ nodeId: string; choiceIndex?: number }>;
  status: 'idle' | 'playing' | 'waiting-choice' | 'ended';
}
```

**条件表达式求值**：复用 Multi-Purpose Canvas ADR 已定义的 `ConditionEvaluator`。表达式语法为简单比较：

```
closeness >= 3
hasItem == true
visitCount > 0
chapter == "act2"
```

不支持复杂逻辑（函数调用、嵌套表达式）。需要复杂条件时在 `variableEffects` 中用多个简单变量组合。

### D7: 导出管线

**决策**：创作完成后可导出为可独立运行的格式，通过 Deliverable Management ADR（[adr-deliverable-management.md](./adr-deliverable-management.md)）的 `ExportProfile` 体系扩展：

| 导出格式 | 产物 | 运行依赖 |
|---------|------|---------|
| **HTML5** | 单 `index.html` + 资产目录 | 浏览器 |
| **Electron** | 桌面应用包 | 无 |
| **JSON Bundle** | `.nkstory` + 场景 + 资产打包 | 第三方引擎（Ren'Py / Unity 适配） |

**HTML5 导出**包含：
- 内嵌的轻量叙事运行时（NarrativeRuntime 的浏览器版本）
- PlayRenderer 对应的渲染模板
- 打包后的资产（图片压缩 + 视频转码）
- 可选：存档/读档 + 设置页面

导出由 `host-cli` 的 `deliverables render` 命令支持无头执行，可接入 CI 管线。

---

## 三、与现有架构的关系

### 3.1 不修改 / 不重复建设

| 现有能力 | 本 ADR 的复用方式 |
|---------|-----------------|
| Narrative 子系统节点类型（choice/merge/narrative-scene） | 直接复用，Canvas 投影映射 StoryNode → CanvasNode |
| FlowTraversal API | NarrativeRuntime 的路径遍历基础 |
| CanvasPlaybackState | 扩展为 NarrativeRuntimeState |
| ConditionEvaluator | Play Mode 条件求值 |
| ProjectionAdapter | StoryProjectionAdapter 实现 |
| PreviewRendererRegistry | 注册 PlayRenderer |
| neko-story Fountain LSP | 场景内容编辑，零修改 |
| neko-story ScriptIndex | 结构化提取场景元数据 |
| characters.yaml / Asset Federation | 角色/资产绑定 |

### 3.2 新增模块

| 模块 | 位置 | 职责 |
|------|------|------|
| `StoryGraphService` | neko-story/packages/story/ | `.nkstory` CRUD + 校验 + 事件 |
| `StoryProjectionAdapter` | neko-story/packages/extension/ | .nkstory → Canvas 投影 + 写回 |
| `FountainPlayParser` | neko-story/packages/story/ | Fountain → PlayDirective[] |
| `NarrativeRuntime` | neko-canvas/packages/webview/ | Play Mode 状态机 |
| `InteractiveFilmRenderer` | neko-canvas/packages/webview/ | 互动影游 Play 渲染器 |
| `VisualNovelRenderer` | neko-canvas/packages/webview/ | 视觉小说 Play 渲染器 |
| `IllustratedTextRenderer` | neko-canvas/packages/webview/ | 图文游戏 Play 渲染器 |
| `NarrativeExporter` | neko-story/packages/story/ | 导出管线 |

### 3.3 依赖方向

```
neko-story/story (Domain Layer)
  ├── StoryGraphService        ← .nkstory CRUD
  ├── FountainPlayParser       ← Fountain → PlayDirective
  └── NarrativeExporter        ← 导出

neko-story/extension (Bridge Layer)
  └── StoryProjectionAdapter   ← 注册到 Canvas 投影系统

neko-canvas/webview (UI Layer)
  ├── NarrativeRuntime         ← Play Mode 状态机
  ├── GraphModeView            ← 图编辑视图
  ├── PlayModeView             ← 沉浸预览视图
  └── PlayRenderers/           ← 三种类型渲染器

@neko/shared (Layer 0)
  └── types/story-graph.ts     ← StoryGraph / StoryNode / StoryEdge 共享类型
```

遵守 `no-cross-extension-deps` 规则——neko-canvas 不 import neko-story。通过共享类型 + Extension API + ProjectionAdapter 接口通信。

---

## 四、用户工作流

### 4.1 从零开始创建互动叙事

```
1. 命令面板: "Neko: New Interactive Story"
   → 创建 story.nkstory + scenes/ 目录 + characters.yaml 模板
   → 在 Canvas 中打开投影画布（自动展开 Narrative 节点面板）

2. Graph Mode: 拖入 Start 节点 + 若干 Scene 节点 + Choice 节点
   → 连线建立分支结构
   → 双击 Scene 节点 → 在 neko-story 中编写 Fountain 内容

3. 编辑 characters.yaml: 绑定角色立绘、背景图

4. 切换 Play Mode: 从 Start 开始体验
   → 阅读对白 → 选择分支 → 观察变量变化
   → 发现问题 → Esc 回到 Graph Mode → 定位节点修改

5. 导出: 命令面板 "Neko: Export Interactive Story"
   → 选择 HTML5 → 生成可分享的单页应用
```

### 4.2 编剧与策划协作

```
编剧（neko-story）:
  → 打开 scenes/cafe-encounter.fountain
  → 用标准 Fountain 写对白和动作
  → 保存

策划（neko-canvas）:
  → 在 Graph Mode 中看到节点内容实时更新
  → 调整分支结构、添加条件
  → 切 Play Mode 测试流程
  → 发现缺少一个场景 → 新建节点 → 通知编剧填写内容
```

### 4.3 AI Agent 辅助

```
Agent 可执行的操作:
  → 读取 .nkstory 理解全局分支结构
  → 分析分支覆盖率（死路径检测、未连接节点）
  → 根据 Fountain 对白自动推荐表情映射
  → 生成分支建议（"此处可加一个好感度判定"）
  → 批量生成 Fountain 场景草稿
  → 一致性检查（角色名拼写、变量引用有效性）
```

---

## 五、实施计划

### Phase 0: 数据模型与基础设施（~4d）

| PR | 内容 | 依赖 |
|----|------|------|
| PR1 | `@neko/shared/types/story-graph.ts` 共享类型定义 | 无 |
| PR2 | `StoryGraphService` (.nkstory CRUD + JSON Schema 校验) | PR1 |
| PR3 | `FountainPlayParser` (Fountain → PlayDirective) + 单元测试 | PR1 |

### Phase 1: Canvas 投影与 Graph Mode（~5d）

| PR | 内容 | 依赖 |
|----|------|------|
| PR4 | `StoryProjectionAdapter` 实现 + 注册 | PR2 |
| PR5 | Graph Mode 视图增强（节点预览卡片 + 条件标注 + 路径高亮） | PR4 |
| PR6 | Graph Mode 写回（新增/删除连线、编辑条件写回 .nkstory） | PR4 |

### Phase 2: Play Mode 核心（~6d）

| PR | 内容 | 依赖 |
|----|------|------|
| PR7 | `NarrativeRuntime` 状态机 + 单元测试 | PR1 |
| PR8 | Play Mode 框架（模式切换 + Mini Map + State Panel） | PR7 |
| PR9 | `IllustratedTextRenderer`（图文游戏渲染器，最简版） | PR8 |
| PR10 | `VisualNovelRenderer`（VN 渲染器：ADV/NVL + 立绘 + 背景） | PR8, PR3 |

### Phase 3: 互动影游 + 导出（~5d）

| PR | 内容 | 依赖 |
|----|------|------|
| PR11 | `InteractiveFilmRenderer`（视频节点播放 + 字幕叠层） | PR8 |
| PR12 | HTML5 导出管线（NarrativeExporter + 模板） | PR7, PR9 |
| PR13 | Agent 集成（.nkstory 分析工具 + 分支覆盖率 + 一致性检查） | PR2 |

**总计：~20d，13 PR**

---

## 六、消融开关

| Toggle | 默认 | 效果 |
|--------|------|------|
| `narrative.playMode` | `true` | 关闭后 Canvas 仅保留 Graph Mode，Play Mode 不可用 |
| `narrative.miniMap` | `true` | 关闭后 Play Mode 不显示 Mini Map |
| `narrative.typewriterEffect` | `true` | 关闭后对白直接显示，不逐字打出 |
| `narrative.autoExpressionMatch` | `true` | 关闭后不从 Parenthetical 自动推断表情 |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Play Mode 渲染性能（大量立绘 + 背景切换） | 卡顿 | 预加载当前节点 ±2 跳邻居资产；图片懒加载 + 缓存 |
| .nkstory 与 Canvas 同步延迟 | 编辑丢失 | ProjectionAdapter 增量 diff（非全量重建）；乐观更新 + 冲突检测 |
| Fountain 语义不足以表达演出指令 | 立绘位置/BGM/转场效果无法标注 | characters.yaml 扩展元数据；Fountain Notes (`[[BGM: peaceful]]`) 作为约定 |
| 单一 .nkstory 文件过大 | 大型项目 100+ 节点 | 支持按 Chapter 拆分为多个 .nkstory + 跨文件引用 |
| 导出 HTML5 体积过大 | 互动影游视频资产大 | 视频按需加载（流式）；图文/VN 类型单页 < 10MB |

---

## 八、未来扩展方向（不在本 ADR 范围）

1. **多语言支持**——每个 `.fountain` 文件可有 `.fountain.zh-cn` / `.fountain.en` 变体，Play Mode 按 locale 切换
2. **Live2D 实时演出**——Play Mode 的 VN 渲染器接入 neko-puppet engine 实时渲染（需要 WebGL，突破当前 DOM-only 约束）
3. **语音合成**——对白文本 → TTS → 自动配音；角色绑定声纹
4. **多人协作编辑**——.nkstory 的 CRDT 同步
5. **Analytics**——记录测试游玩数据（选择分布、完成率、平均时长），辅助叙事平衡调整
6. **Ren'Py / Unity 导出**——NarrativeExporter 适配器，输出 `.rpy` / C# 脚本
