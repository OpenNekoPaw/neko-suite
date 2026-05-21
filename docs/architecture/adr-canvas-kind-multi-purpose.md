# ADR: 多用途画布 — 节点库 + 子系统按需激活

> 状态：**Accepted / Implemented (2026-05-21)**
> 关联：[adr-canvas-block-container.md](./adr-canvas-block-container.md) · [adr-canvas-generic-container-card.md](./adr-canvas-generic-container-card.md) · [adr-canvas-preview-boundary.md](./adr-canvas-preview-boundary.md) · [format-strategy.md](./format-strategy.md) · [adr-asset-federation.md](./adr-asset-federation.md) · [adr-structured-data-persistence.md](./adr-structured-data-persistence.md) · [agent-memory-unification.md](./agent-memory-unification.md) · [adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md) · [adr-webview-ui-design-system.md](./adr-webview-ui-design-system.md)
> 实现提案：已归档 [implement-multi-purpose-canvas-subsystems](../../openspec/changes/archive/2026-05-21-implement-multi-purpose-canvas-subsystems/)

---

## 实现状态（2026-05-21）

OpenSpec change `implement-multi-purpose-canvas-subsystems` 已实施并归档。当前落地边界如下：

| 范围 | 状态 | 说明 |
|------|------|------|
| `.nkc` v2.1 契约 | 已实现 | `CANVAS_VERSION` 与 NKC migrator 对齐到 `2.1`；`CanvasData` 增加 `projected`、`narrative`、`behavior`、`entityGraph`、`memoryGraph` optional 字段；v1→v2→v2.1 迁移链保持无破坏 |
| 子系统 Manifest | 已实现 | `CanvasSubsystemManifest`、内建 manifest 和扫描/summary 工具位于共享契约层；保持纯数据，不包含 React、VSCode API、predicate 或布局算法 |
| Webview Registration | 已实现 | Storyboard 和 Narrative 通过 `WebviewSubsystemRegistration` 显式复用共享 manifest；Behavior / Entity / Memory 先以 placeholder registration 激活边界 |
| 类型扩展与 fallback | 已实现 | Core / Registered 双层 node 与 connection union 已落地；结构完整 unknown node 在普通模式 warning + fallback 渲染，strict mode 可升级为 error |
| UI shell | 已实现首版 | 顶部工具栏、分组节点库、浮动面板宿主、内联连接编辑、节点展开 hook 已接入；Storyboard descriptor 图标已收敛为 Webview 侧 SVG React icon，避免 raw emoji 渲染差异 |
| Narrative 首切片 | 已实现首版 | Narrative 节点、choice 连接属性、FlowTraversal、变量浮动面板已落地；播放控制目前是工具栏 slot + disabled placeholder，运行时步进/路径高亮仍属后续 P1 |
| 投影画布边界 | 已实现基础设施 | `ProjectionAdapter` / write-back / source-changed / cache regeneration 通过共享 DTO + Extension API 边界实现；具体 entity/memory adapter 仍由对应包后续实现 |
| Agent 集成 | 已实现 | Active context 增加 `nodeTypeSummary`、`activeSubsystems`、`selectedNodeTypes` 和可选 metadata summary；`NekoCanvasCapabilityProvider.getPromptFragments()` 注入多用途 Canvas 子系统上下文 |

Review follow-up 已收口：Narrative/Storyboard manifest 注册路径统一、变量 ID 改为 UUID 优先、子系统加载双触发与静默吞错已修、浮动面板 drag listener 可清理、projection write-back / status boundary / promptFragments 已补契约测试、`FloatingPanelFrame` 死 prop 已移除。

## 一、背景与动机

### 1.1 现状

neko-canvas 当前是单一用途的**分镜画布编辑器**——围绕 Scene→Shot→Gallery 的影视预制工作流设计。16 种节点类型、3 种连接类型（`default`/`sequence`/`reference`）、5 种容器策略均服务于这一场景。

### 1.2 新增需求

| 场景 | 图结构 | 节点语义 | 交互模式 | 运行时 |
|------|--------|---------|---------|--------|
| **互动影游** | 有向分支图（DAG + 允许回环） | 场景片段 + 选择点 + 汇合点 | 编辑 + 路径预览 | 路径推演 |
| **Agent NPC** | 行为树 / 状态机 | 状态 + 触发器 + 条件 + 动作 | 编辑 + 实时调试 | 状态驱动 |
| **互动记忆** | 知识图谱 / 时间线 | 记忆节点 + 关联 + 衰减权重 | 只读浏览 + 搜索 | 无 |
| **素材关系** | 实体关系图 | Entity + 表征槽位 + 出场引用 | 编辑 + 浏览 | 无 |

### 1.3 方案评估

```
方案 A: 每个场景独立 Webview（neko-flow / neko-behavior / ...）
  ✗ 70% 共享基础设施重复（InfiniteCanvas / zoom+pan / connections / undo+redo / stores / hooks）
  ✗ 5 个 CustomEditor 注册，每个 retainContextWhenHidden: true 占独立内存
  ✗ 跨场景引用需要跨扩展 API 桥接

方案 B: Kind 判别器隔离（文件级 kind 字段锁定节点类型，不同 Kind 不可混合）
  ✗ 过度隔离——FlowTraversal / BehaviorExecutor 等子系统按节点类型运行，不按画布类型运行，无真实冲突
  ✗ 互动影游项目需要 5+ 文件 + canvas-embed 互相引用，割裂创作体验
  ✗ Kind 不可切换 → 用户创建时必须预判画布用途

方案 C: 自由混合 — 节点库分组 + 子系统按需激活（类 Visio/Draw.io）
  ✓ 所有节点类型可在同一画布共存
  ✓ 子系统按画布中实际存在的节点类型自动激活
  ✓ 模板只是创建便利（预选节点库展开状态），不锁定能力
  ✓ 互动影游项目一个 .nkc 文件，叙事+分镜+行为树+实体一张画布
  ✓ 70%+ 代码共享（统一交互模型）
```

---

## 二、设计决策

### D1: 自由混合，不强制 Kind

**决策**：取消 `kind` 文件级判别器。任何 `.nkc` 画布可放置任何节点类型。子系统（FlowTraversal / BehaviorExecutor / 面板 / Agent 工具）按画布中实际存在的节点类型**按需激活**。

**否决方案**：
- Kind 隔离——子系统已按节点类型分派，Kind 是冗余约束。实测 FlowTraversal 只遍历 Choice/Merge/NarrativeScene 节点，BehaviorExecutor 只 tick State/Trigger/Action 节点，两者在同一画布共存无冲突
- 多 Webview——70% 共享代码重复维护

### D2: 统一 `.nkc` 格式

**决策**：所有画布使用 `.nkc` 扩展名。`CanvasData` 无 `kind` 字段。子系统元数据按需存在——有 narrative 节点时出现 `narrative` section，有 behavior 节点时出现 `behavior` section。

### D3: 模板 = 创建便利，不是约束

**决策**：创建命令决定**初始节点面板展开状态和预填元数据**，不限制后续操作：

| 命令 | 初始效果 | 后续限制 |
|------|---------|---------|
| `neko.canvas.new` | 展开 Basic 组 | 无 |
| `neko.canvas.newStoryboard` | 展开 Basic + Storyboard 组 | 无 |
| `neko.canvas.newNarrative` | 展开 Basic + Narrative 组 + 预填空 `narrative` metadata | 无 |
| `neko.canvas.newBehavior` | 展开 Basic + Behavior 组 + 预填空 `behavior` metadata | 无 |

用户创建后随时展开其他组、拖入任何节点。

### D4: 自动投影画布

**决策**：entity-graph 和 memory-graph 的 SSOT 不是 `.nkc` 文件本身，而是外部 JSON。这类画布用 `projected: true` 标记（非 kind）：

| 类型 | SSOT | 持久化位置 | Git |
|------|------|-----------|-----|
| 用户创作画布 | `.nkc` 文件本身 | 用户指定路径 | 跟踪 |
| 投影画布 | 外部 JSON | `.neko/.cache/*.nkc` | 不跟踪 |

投影画布标题栏标注 `[Auto-generated]`，编辑操作写回 SSOT JSON，布局偏好缓存在 `.nkc` 中（丢失可重新生成）。

**写回边界**：Canvas 不直接依赖 neko-assets / neko-agent 内部实现（遵守 `no-cross-extension-deps` 规则）。写回通过共享类型 + Extension API 实现：

```typescript
// @neko/shared/types/canvas-projection.ts — Layer 0 共享类型（不依赖 VSCode API）
interface ProjectionAdapter {
  readonly sourceUri: string;           // SSOT JSON 路径
  project(): Promise<ProjectedCanvasData>;   // JSON → CanvasData 投影
  writeBack(changes: ProjectionWriteBack[]): Promise<void>;  // 编辑写回 SSOT
  onSourceChanged(listener: () => void): DisposableLike;  // 纯回调式，Extension Host 适配 VSCode FileSystemWatcher
}

interface DisposableLike {
  dispose(): void;
}

interface ProjectionWriteBack {
  operation: 'bind' | 'unbind' | 'update-alias' | 'update-weight';
  targetPath: string;  // JSON path in SSOT
  value: unknown;
}

// Canvas 通过 capability provider 发现投影适配器，不 import 具体实现
// neko-assets 注册 EntityProjectionAdapter
// neko-agent 注册 MemoryProjectionAdapter
```

Canvas 只承载布局与交互，实体/记忆 JSON 的写入规则由 assets/agent 侧的 `ProjectionAdapter` 定义。

### D5: 统一自由拖拽 + Auto Arrange 可选

**决策**：所有节点统一自由拖拽。自动布局作为工具栏 "Auto Arrange" 按钮按需触发，一次性重排后用户仍可自由调整：

| 策略 | 适用场景 | 算法 |
|------|---------|------|
| Flow (左→右) | narrative 流图 | 简单分层 |
| Tree (上→下) | behavior 树 | 层级递归 |
| Grid | 通用整理 | 网格对齐 |
| Cluster | entity / memory 关系图 | 聚类分组 |

Auto Arrange 按画布中**实际节点类型分布**推荐默认策略。混合画布按连通分量分别整理（narrative 子图用 Flow，behavior 子图用 Tree）。

### D6: 状态流转与播放

**决策**：画布支持轻量级播放预览，按子系统分别激活。播放控件**合并到顶部工具栏右侧**（条件显示），不单独设底部播放条：

```typescript
interface CanvasPlaybackState {
  activeNodeId: string | null;
  visitedNodeIds: Set<string>;
  activeConnectionIds: Set<string>;
  variables?: Record<string, unknown>;
}
```

| 子系统 | 播放形态 | 触发条件 |
|--------|---------|---------|
| Narrative | 步进式：沿路径前进 → Choice 暂停等用户选择 → 继续 | 画布中存在 Choice/Merge 节点 |
| Behavior | 调试式：手动触发事件 → 观察状态迁移 | 画布中存在 State/Trigger 节点 |
| Storyboard | 内联媒体播放（在 Shot 节点内） | 画布中存在 Media/Shot 节点 |
| Entity / Memory | 无播放 | — |

工具栏播放区域按当前活跃子系统条件显示：无可播放子系统时不显示；两个以上可播放子系统共存时提供模式下拉切换。

### D7: 画布 UI 布局 — 极简三区

**决策**：取消常驻右侧属性面板和底部栏。画布 UI 仅保留三个区域：

```
┌─ 顶部工具栏 ─────────────────────────────────────────────┐
│ [V][C][M][H]  [↩ ↪]  [Arrange▼]     [⏮◀ ▶⏸] Narrative▼ │
├──┬───────────────────────────────────────────────────────┤
│▼B│                                                       │
│▼S│                                                       │
│▶N│           Infinite Canvas（最大化）                    │
│▶B│                                                       │
│▶E│                                                       │
│▶M│                                                       │
├──┴───────────────────────────────────────────────────────┤
│ VSCode 原生状态栏: [24 nodes] [narrative·storyboard] [🔍100%] │
└──────────────────────────────────────────────────────────┘
```

| 区域 | 内容 | 形态 |
|------|------|------|
| **顶部工具栏** | 交互工具（选择/连线/框选/平移）+ 撤销重做 + Auto Arrange + 条件播放控件 | webview 内部，一行 |
| **左侧节点面板** | Draw.io 式分组折叠库（Basic/Storyboard/Narrative/Behavior/Entity/Memory） | 可折叠：折叠时 ~40px 图标条，展开时 ~200px 列表 |
| **画布区域** | 无限画布，占满剩余空间 | 最大化 |
| **浮动面板** | 子系统面板（VariablePanel / BlackboardPanel / CoveragePanel） | 按需通过工具栏按钮或快捷键唤出，可拖拽定位 |
| **VSCode 状态栏** | 缩放比例 + 节点计数 + 激活子系统 | VSCode 原生 StatusBarItem，零 webview 空间消耗 |

**否决方案**：
- 常驻右侧属性面板——neko-canvas 不支持颜色/样式编辑，属性面板退化为纯域属性编辑器；80% 时间显示不需要看的内容，浪费 ~280px 画布宽度。域属性通过节点内联展开编辑（见 D8）
- 自建底部栏——状态信息适合 VSCode 原生 StatusBarItem（文本 + 图标），播放控件仅几个按钮可合并到工具栏。自建底部栏无剩余内容

**与 Unified Viewport Protocol 的关系**：D7 的 toolbar / status / viewport 方案不另起 viewport 协议。工具栏中的 zoom/pan 控件、StatusBarItem 中的缩放比例等均通过 [adr-unified-viewport-protocol](./adr-unified-viewport-protocol.md) 定义的 `ViewportShell` 协议实现。Canvas 的 `Toolbar.tsx` 是 ViewportShell 的具体宿主之一。

### D8: 节点内联编辑 — 取代属性面板

**决策**：节点本身就是编辑界面。域属性通过两层机制编辑，无需常驻属性面板：

**层级 1：内联摘要（默认状态）**

节点卡片直接显示关键信息 + 主要操作按钮：

```
┌─ Shot ──────────────────────────┐
│ ┌──────────┐  camera: close-up  │
│ │ thumbnail │  aspect: 16:9     │
│ │          │  status: ✅ done   │
│ └──────────┘                    │
│ [🔄 Regenerate]  [✏️ Sketch]   │
└─────────────────────────────────┘

┌─ Choice "逃跑还是战斗？" ───────┐
│  ○ 逃跑 ──→     ○ 战斗 ──→     │
│  ○ 谈判 ──→     [+ 添加分支]   │
└──────────────────────────────────┘

┌─ Entity "Anya" ─────────────────┐
│ 👤  portrait ✅ │ live2d ✅     │
│     voice ⚠️    │ motion ─      │
│ [绑定资产]                       │
└──────────────────────────────────┘
```

**层级 2：展开详情（双击节点 / 点击展开按钮）**

节点**原地向下展开**，显示完整可编辑属性：

```
┌─ Shot ──────────────────────────┐
│ ┌──────────┐  camera: close-up  │
│ │ thumbnail │  aspect: 16:9     │
│ └──────────┘  status: ✅ done   │
│─────────── ▼ 详情 ──────────────│
│ Prompt:                          │
│ ┌──────────────────────────────┐│
│ │ A young woman standing in    ││
│ │ rain, cinematic lighting...  ││
│ └──────────────────────────────┘│
│ Negative: [blurry, low quality] │
│ Model: [SDXL ▼]  Steps: [30]   │
│ Seed: [42]  Guidance: [7.5]     │
│ LoRA: style-v2 (0.8)  [+ Add]  │
│ History: v3 ✓ | v2 | v1        │
│ [🔄 Regenerate]  [✏️ Sketch]   │
└─────────────────────────────────┘
```

**交互规则**：
- 展开方向：仅向下扩展（不横向膨胀），避免推挤水平邻居
- 互斥展开：同一时间只有一个节点处于展开状态，选中其他节点时自动折叠当前节点
- 折叠触发：`Escape` / 点击画布空白区 / 选中其他节点
- 键盘导航：展开后 `Tab` 在控件间跳转
- 快速切换：`Tab` 跳到下一个同类节点并自动展开（缓解多节点批量编辑场景）

**层级 3：子系统浮动面板**

VariablePanel / BlackboardPanel / CoveragePanel 等**跨节点**的子系统面板不属于单个节点的属性，作为可拖拽浮动面板独立于节点存在：

```
┌─────────────────────────────┐
│ 📋 Variables          [×]   │
│ mood: "tense"               │
│ trust_level: 3              │
│ [+ Add Variable]            │
└─────────────────────────────┘
```

通过工具栏按钮或快捷键切换显示/隐藏。位置由用户拖拽决定，会话内记忆。

**连接属性编辑**：当前连接的 label / type / condition 编辑依赖 PropertyPanel（`PropertyPanel.tsx:1053-1124`）。取消属性面板后，连接属性通过以下方式编辑：
- 单击连线 → 连线上方出现内联浮动编辑条（label 文本框 + type 下拉 + condition 输入框）
- 双击连线 label → 直接进入 label 文本编辑
- 右键连线 → 上下文菜单（Delete / Change Type / Edit Condition）

---

## 三、子系统按需激活

### 3.1 激活规则

```
画布中存在 Choice / Merge / NarrativeScene 节点
  → 激活 narrative 子系统
  → 加载 FlowTraversal + ConditionEvaluator
  → VariablePanel 可通过工具栏按钮唤出（浮动面板）
  → 工具栏右侧出现叙事播放控件
  → narrative metadata section 出现在文件中

画布中存在 State / Trigger / Action / Condition / Composite 节点
  → 激活 behavior 子系统
  → 加载 BehaviorExecutor
  → BlackboardPanel 可通过工具栏按钮唤出（浮动面板）
  → 工具栏右侧出现调试播放控件
  → behavior metadata section 出现在文件中

画布中存在 Shot / Scene / Gallery 节点
  → 激活 storyboard 子系统
  → 启用 BatchGenerationScheduler
  → Shot 节点内联显示生成控件

画布中存在 Entity / Slot / Occurrence 节点
  → 激活 entity 子系统
  → RepresentationPanel + CoveragePanel 可通过工具栏按钮唤出（浮动面板）

画布中只有 Text / Media / Annotation / Group
  → 纯自由画布，无额外子系统
```

### 3.2 子系统注册契约

拆为两层，保持 L0/L1/L2 隔离——Manifest 放 Layer 0（纯数据，无 React/VSCode），Registration 放 Layer 2（Webview 侧 React 组件）：

```typescript
// @neko/shared/types/canvas-subsystem.ts — Layer 0（纯数据，不依赖 React/VSCode）
type CanvasConnectionRuleId =
  | 'port-data-type'
  | 'narrative-choice-target'
  | 'behavior-transition-target'
  | 'memory-association-weight';

interface CanvasConnectionRuleDescriptor {
  id: CanvasConnectionRuleId;
  options?: Record<string, unknown>;  // JSON-serializable config only
}

type AutoArrangeStrategyId = 'flow' | 'tree' | 'grid' | 'cluster';

interface CanvasSubsystemManifest {
  id: string;                       // 'narrative' | 'behavior' | 'storyboard' | 'entity' | 'memory'
  triggerNodeTypes: CanvasNodeType[];  // 包含这些类型则激活
  connectionTypes?: ConnectionType[];
  connectionRules?: CanvasConnectionRuleDescriptor[];  // 描述符/规则 ID，不放 predicate 函数
  autoArrangeStrategy?: AutoArrangeStrategyId;          // 策略 ID，算法实现由对应运行时层解析
  agentTools?: AgentToolDef[];       // Agent 工具定义（纯 JSON schema，无 React）
  metadata?: {
    key: string;                    // CanvasData 中的 metadata section key
    defaultValue: unknown;          // JSON-serializable 默认值；动态工厂放运行时 registration
  };
}

// webview/src/subsystems/ — Layer 2（Webview 侧，依赖 React）
interface WebviewSubsystemRegistration {
  manifest: CanvasSubsystemManifest;  // 复用 L0 manifest，避免第二事实源
  nodeRenderers?: NodeRendererRegistry;
  nodeTypeDescriptors?: NodeTypeDescriptorRegistry;  // Webview runtime descriptor，可包含 React icon
  floatingPanels?: FloatingPanelDef[];  // VariablePanel / BlackboardPanel 等
  playbackController?: PlaybackController;  // 注入到工具栏播放区域
}
```

Extension Host 侧只读取 `CanvasSubsystemManifest`（Agent 工具注册、类型验证）；Webview 侧加载 `WebviewSubsystemRegistration`（渲染器、描述符、面板、播放控制）。内建 Manifest 注册表已放在 `@neko/shared`，Webview registration 只通过 `manifest` 字段复用 Manifest 数据；Extension Host 不 import `webview/src/subsystems/*`。

### 3.3 按需加载

```typescript
// subsystemRegistry.ts
const subsystemRegistry: SubsystemEntry[] = [
  { triggerTypes: ['shot','scene','gallery','script','model','storyboard','artboard','table','project'],
    load: () => import('./subsystems/storyboard') },
  { triggerTypes: ['choice','merge','narrative-scene','narrative-note'],
    load: () => import('./subsystems/narrative') },
  { triggerTypes: ['state','trigger','action','condition','composite'],
    load: () => import('./subsystems/behavior') },
  { triggerTypes: ['entity','representation-slot','occurrence','generated-asset'],
    load: () => import('./subsystems/entity') },
  { triggerTypes: ['memory','conversation','fact'],
    load: () => import('./subsystems/memory') },
];

// CanvasApp 启动时扫描节点类型 → 激活匹配的子系统
// 运行时新增节点 → 检查是否需要激活新子系统
// 删除最后一个触发节点 → 停用 UI/controller，但已加载 bundle 不强制卸载
//   （React.lazy module cache + Vite chunk 已在内存中，强制卸载会引入不必要的复杂度）
```

Vite code-splitting 确保未激活的子系统不进 initial bundle。

---

## 四、文件格式

### 4.1 版本对齐

当前版本源已对齐：

| 位置 | 值 | 含义 |
|------|---|------|
| `packages/neko-types/src/nkc/migrator.ts` | `CURRENT_NKC_VERSION = '2.1'` | migrator 维护的权威版本 |
| `packages/neko-types/src/types/canvas.ts` | `CANVAS_VERSION = '2.1'` | 与 migrator 权威版本同步 |

**决策**：以 `CURRENT_NKC_VERSION` 为权威版本源。本 ADR 扩展定义为 **v2.1**（v2.0 的 optional extension），`NkcVersion` union 已追加 `'2.1'`，`CANVAS_VERSION` 常量已同步更新为 `'2.1'`，消除双版本源不一致。

### 4.2 节点类型扩展契约

当前 `CanvasNodeType`（`canvas.ts:17`）和 `ConnectionType`（`canvas.ts:84`）是闭合 union。不使用裸 `(string & {})` 放开全部类型，而是通过注册契约扩展：

```typescript
// 内核接受已知类型 + 子系统注册类型
export type CanvasNodeType = CoreCanvasNodeType | RegisteredCanvasNodeType;

// 内核已知（不变）
type CoreCanvasNodeType =
  | 'media' | 'storyboard' | 'annotation' | 'group'
  | 'text' | 'artboard' | 'table'
  | 'shot' | 'scene' | 'gallery' | 'script' | 'document'
  | 'model' | 'canvas-embed' | 'project';

// 子系统注册的类型（编译时固定，运行时通过 registry 验证）
type RegisteredCanvasNodeType =
  // narrative
  | 'choice' | 'merge' | 'narrative-scene' | 'narrative-note'
  // behavior
  | 'state' | 'trigger' | 'action' | 'condition' | 'composite'
  // entity
  | 'entity' | 'representation-slot' | 'occurrence' | 'generated-asset'
  // memory
  | 'memory' | 'conversation' | 'fact';

// 连接类型同理
export type ConnectionType = CoreConnectionType | RegisteredConnectionType;

type CoreConnectionType = 'default' | 'sequence' | 'reference';
type RegisteredConnectionType =
  | 'choice'        // narrative: 选项连线
  | 'transition'    // behavior: 状态迁移
  | 'child'         // behavior: 组合节点子关系
  | 'association'   // memory: 记忆关联
  | 'derived-from'; // memory: 推理链

// Unknown node 处理
// 结构完整的 unknown node → severity: 'warning'（可打开、fallback 渲染）
// 结构不完整（缺 id/position/size）→ 保持 severity: 'error'
// 严格模式（导出/保存前校验）→ unknown node 升级为 error
```

子系统通过 `CanvasSubsystemManifest` 注册 descriptor、validation rule；Webview 侧通过 `WebviewSubsystemRegistration` 注册 renderer、panel、playback。unknown node 使用 fallback renderer（显示类型名 + 原始数据摘要）但 validator 保留 warning，不静默吞错。

### 4.3 CanvasData v2.1

```typescript
export interface CanvasData {
  version: string;                    // '2.1'
  name: string;
  projected?: boolean;                // 自动投影画布标记
  viewport?: CanvasViewport;
  nodes: CanvasNode[];                // 任意节点类型自由混合
  connections: CanvasConnection[];
  linkedProject?: string;

  // 子系统元数据——按需出现（有对应节点时自动创建）
  narrative?: NarrativeMetadata;
  behavior?: BehaviorMetadata;
  entityGraph?: EntityGraphMetadata;
  memoryGraph?: MemoryGraphMetadata;
}
```

### 4.4 子系统元数据

```typescript
interface NarrativeMetadata {
  entryNodeId?: string;              // 叙事起点
  variables: NarrativeVariable[];    // 叙事变量定义
}

interface BehaviorMetadata {
  rootNodeId?: string;               // 行为树根节点
  blackboard: BlackboardVariable[];  // 黑板变量
}

interface EntityGraphMetadata {
  entityScope: ('character' | 'scene' | 'object' | 'location' | 'style')[];
  bindingSource: string;
}

interface MemoryGraphMetadata {
  queryContext?: string;
  timeRange?: { start: string; end: string };
}
```

### 4.5 向后兼容

- v2.0 文件无子系统 metadata → 正常打开，storyboard 子系统按节点类型自动激活
- v2.1 文件被**新版**打开（已有 fallback renderer）→ 未注册的节点类型渲染为 fallback 卡片（显示类型名 + warning）；子系统 metadata 按需激活
- v2.1 文件被**旧版**打开（无 fallback renderer）→ 子系统 metadata 被忽略（JSON 容忍未知字段），但新节点类型会触发 validator error（`validator.ts:153`），**不保证旧版可正确展示新节点类型**
- `NkcVersion` union 追加 `'2.1'`，migrator 增加 `migrateNkcV2ToV2_1()`（实际为 no-op：v2.0 数据无需变换，仅升版本号）

---

## 五、节点库设计

### 5.1 节点面板（Draw.io 式分组）

```
节点面板（左侧，所有库始终可用）：
  ▼ Basic                        ← 默认展开
    Text / Annotation / Media / Group / Canvas-embed / Document
  ▼ Storyboard                   ← 模板可控初始展开
    Shot / Scene / Gallery / Script / Model / Artboard / Table / Project
  ▶ Narrative                    ← 默认折叠，展开即可使用
    Choice / Merge / NarrativeScene / NarrativeNote
  ▶ Behavior
    State / Trigger / Action / Condition / Composite
  ▶ Entity
    Entity / RepresentationSlot / Occurrence / GeneratedAsset
  ▶ Memory
    Memory / Conversation / Fact
```

### 5.2 各库节点详情

#### Storyboard（现有，不变）

| 节点 | 用途 |
|------|------|
| `shot` | 分镜面板（镜头参数 + AI 生成 + 候选审阅） |
| `scene` | 场景容器（有序 childIds） |
| `gallery` | 多视图角色参考（3-view / 4-view / 9-expression） |
| `script` | .nks/.fountain 剧本引用 |
| `model` | LoRA/ControlNet/VAE 模型引用 |
| `artboard` | 固定尺寸导出画布 |
| `table` | 表格容器 |
| `project` | 项目引用 |
| `storyboard` | 简单场景卡（legacy） |

#### Narrative（新增）

| 节点 | 用途 |
|------|------|
| `choice` | 分支决策点（多个输出端口，每个对应一个选项） |
| `merge` | 汇合点（多条分支合并） |
| `narrative-scene` | 叙事片段（场景描述 + 角色 + 情感标签） |
| `narrative-note` | 叙事批注 |

**新增连接属性**：

```typescript
interface NarrativeConnectionExtension {
  choiceText?: string;     // 选项文字（渲染在连线上）
  condition?: string;      // 简单条件表达式
  priority?: number;       // 默认路径 = 0
}
```

**FlowTraversal API**：

```typescript
interface FlowTraversal {
  getSuccessors(nodeId: string): Array<{ connection: CanvasConnection; node: CanvasNode }>;
  getPredecessors(nodeId: string): Array<{ connection: CanvasConnection; node: CanvasNode }>;
  resolveDefaultPath(startId: string): string[];
  getChoicesAt(nodeId: string): Array<{ choiceText: string; targetId: string; condition?: string }>;
  detectCycles(): string[][];
}
```

#### Behavior（新增）

| 节点 | 用途 |
|------|------|
| `state` | 状态节点 |
| `trigger` | 触发器（事件监听） |
| `action` | 执行动作 |
| `condition` | 条件守卫 |
| `composite` | 序列/选择/并行组合 |

#### Entity（新增）

| 节点 | 用途 |
|------|------|
| `entity` | CreativeEntity（角色/场景/物件/地点/风格） |
| `representation-slot` | 表征槽位（portrait/live2d/live3d/voice/motion） |
| `occurrence` | 出场引用（指向剧本行/分镜 Shot/时间线 Clip） |
| `generated-asset` | AI 生成物 |

**与 neko-assets TreeView 分工**：TreeView 管"有什么"（CRUD），Canvas 管"什么关系"（绑定/出场/依赖图）。

**关键交互**（写回 SSOT JSON）：

| 操作 | 写回目标 |
|------|---------|
| 拖资产到 Slot | `neko/entity-bindings.json` |
| 标记 Slot 为 rejected | `neko/entity-bindings.json` |
| 修改 Entity 别名 | `neko/entities/<kind>.json` |
| 点击 Occurrence | 跳转到源文件（无写入） |

#### Memory（新增）

| 节点 | 用途 |
|------|------|
| `memory` | 记忆条目 |
| `conversation` | 对话摘要 |
| `fact` | 关键事实 |

连接类型：`association`（带权重 + 衰减）/ `derived-from`（推理链）。面板：TimeFilter + SearchBar。

---

## 六、混合画布示例

一个互动影游项目的完整画布：

```
┌─────────────────────────────────────────────────────────────────┐
│  project.nkc                                                     │
│                                                                   │
│  ┌─ Narrative 主线 ─────────────────────────────────────────┐    │
│  │                                                            │    │
│  │  NarrativeScene ──→ Choice "逃跑/战斗"                     │    │
│  │   "开场"              ├──→ NarrativeScene "逃跑线"         │    │
│  │                       │     └─ Scene 容器                  │    │
│  │                       │        ├ Shot-1  ├ Shot-2          │    │
│  │                       └──→ NarrativeScene "战斗线"         │    │
│  │                             └─ Scene 容器                  │    │
│  │                                ├ Shot-3  ├ Shot-4          │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─ NPC 行为 ──────────┐    ┌─ 角色实体 ─────────────────┐      │
│  │ State "Anya.idle"    │    │ Entity "Anya"               │      │
│  │   → Trigger "接近"   │    │  ├ portrait ✅              │      │
│  │   → Action "对话"    │    │  ├ live2d ✅                │      │
│  └──────────────────────┘    │  └ voice ⚠️ missing         │      │
│                               └────────────────────────────┘      │
│                                                                   │
│  Text "设计笔记：Anya 在逃跑线不出场，战斗线是关键 NPC"           │
└───────────────────────────────────────────────────────────────────┘

激活的子系统：narrative + storyboard + behavior + entity
工具栏播放区域：narrative / behavior 可切换
可唤出浮动面板：VariablePanel / BlackboardPanel / RepresentationPanel
```

---

## 七、Agent 集成

### 7.1 统一工具前缀

所有工具统一 `canvas_` 前缀，通过参数区分节点类型：

```
canvas_create_node({ type: 'shot', ... })
canvas_create_node({ type: 'choice', ... })
canvas_create_node({ type: 'state', ... })
canvas_list_nodes({ types: ['choice','merge'] })
canvas_traverse_flow({ startId, mode: 'narrative' })
canvas_evaluate_behavior({ rootId, event: '...' })
canvas_bind_entity({ entityId, slotRole, assetUri })
```

### 7.2 上下文自动适配

`CanvasAgentActiveContextResult`（`canvas-agent-operations.ts`）已在保留 `selectedNodeIds` / `selectedNodes` / `focusedContainer` / `viewport` 等旧字段的基础上，增加子系统感知字段：

```typescript
// CanvasAgentActiveContextResult 扩展字段（v2.1 新增）
interface CanvasAgentActiveContextResult {
  // ... 现有字段保留 ...

  // v2.1 新增：子系统感知
  nodeTypeSummary?: Record<string, number>;       // { shot: 12, choice: 4, state: 5 }
  activeSubsystems?: string[];                     // ['narrative', 'storyboard', 'behavior']
  selectedNodeTypes?: CanvasNodeType[];            // 当前选中节点的类型列表
  subsystemMetadata?: {
    narrative?: { variables: NarrativeVariable[]; entryNodeId?: string };
    behavior?: { blackboard: BlackboardVariable[] };
  };
}
```

所有新增字段为 optional，确保旧调用方不受影响。Agent 从 `selectedNodeTypes` 和 `activeSubsystems` 判断操作上下文：
- 选中 Choice → 优先使用 narrative 相关工具
- 选中 Shot → 优先使用 storyboard 相关工具
- 用户说"整理画布" → 按 `nodeTypeSummary` 分连通分量选择 Auto Arrange 策略

### 7.3 Agent 无冲突

Agent 工具按节点类型分派，不按画布类型分派：

```
用户: "帮我生成第三场分镜"
  Agent: canvas_list_nodes({ types: ['shot'] }) → 过滤第三场 → canvas_generate_batch
  画布上有 Choice/State 节点？→ 无关，不看

用户: "检查叙事分支有没有死路"
  Agent: canvas_traverse_flow → FlowTraversal.detectCycles + 终端节点检查
  画布上有 Shot/State 节点？→ FlowTraversal 只遍历 narrative 连线，自动忽略
```

---

## 八、用户体验

### 8.1 创建入口

独立命令直接创建，模板只影响初始状态：

```
Explorer 右键 → New File...
  ├── New Canvas                 → 空 .nkc，展开 Basic 组
  ├── New Storyboard Canvas      → 空 .nkc，展开 Basic + Storyboard 组
  ├── New Narrative Flow          → 空 .nkc + narrative metadata，展开 Basic + Narrative 组
  └── New Behavior Tree           → 空 .nkc + behavior metadata，展开 Basic + Behavior 组

投影画布（entity-graph / memory-graph）：
  neko-assets 面板 → "Open Entity Graph" 按钮
  neko-agent 面板 → "View Memory Graph" 按钮
```

### 8.2 打开时行为

- 扫描节点类型 → 激活对应子系统 → 展开对应节点库组
- 工具栏按激活的子系统显示条件播放控件
- 投影画布标题栏标注 `[Auto-generated]`

### 8.3 节点视觉区分

不同库的节点有不同视觉风格，即使混在一起也一目了然：

| 库 | 视觉特征 |
|----|---------|
| Basic | 中性灰底，简洁卡片 |
| Storyboard | 缩略图主导，镜头参数标签 |
| Narrative | 流程图风格，分支箭头，选项文字在连线上 |
| Behavior | 圆角状态框，事件/条件标签 |
| Entity | 头像卡片，槽位网格，状态徽章 |
| Memory | 柔和色调，权重透明度，时间戳 |

### 8.4 工具栏布局

```
┌─ 左对齐（交互工具）────────────────── 右对齐（播放 + 操作）─┐
│ [V][C][M][H]  [↩ ↪]  [Arrange▼]  │  [⏮◀ ▶⏸] Narrative▼  │
└────────────────────────────────────┴────────────────────────┘
```

| 区域 | 内容 | 显示条件 |
|------|------|---------|
| 左侧常驻 | 选择(V) / 连线(C) / 框选(M) / 平移(H) | 始终 |
| 中部常驻 | 撤销 / 重做 / Auto Arrange 下拉 | 始终 |
| 右侧条件 | 播放/暂停/步进 + 模式下拉 | 有可播放子系统时显示 |

### 8.5 节点交互

| 操作 | 行为 |
|------|------|
| 单击节点 | 选中，显示内联摘要（默认状态） |
| 双击节点 | 展开详情编辑区（原地向下展开） |
| 双击其他节点 | 当前节点折叠，新节点展开 |
| `Escape` / 点击空白 | 折叠当前展开的节点 |
| `Tab`（展开状态） | 在节点内控件间跳转 |
| `Tab`（折叠状态） | 跳到下一个同类节点并自动展开 |
| 无选中 | 无额外 UI（画布最大化） |

### 8.6 VSCode 状态栏集成

画布状态通过 VSCode 原生 StatusBarItem 显示，零 webview 空间消耗：

```typescript
// Extension 侧注册，when activeCustomEditorId == 'neko.canvas' 自动显示
const zoomItem = vscode.window.createStatusBarItem(StatusBarAlignment.Right, 100);
zoomItem.text = '$(zoom-in) 100%';

const subsystemItem = vscode.window.createStatusBarItem(StatusBarAlignment.Right, 99);
subsystemItem.text = '$(symbol-event) narrative · storyboard';

const nodeCountItem = vscode.window.createStatusBarItem(StatusBarAlignment.Right, 98);
nodeCountItem.text = '$(layers) 24 nodes';
```

webview 通过 postMessage 向 Extension 推送状态变化，Extension 更新 StatusBarItem。

---

## 九、代码组织

```
packages/neko-canvas/packages/webview/src/
  ├── core/                              ← 共享内核（~70%）
  │   ├── InfiniteCanvas.tsx                Pan/Zoom/Grid/Viewport
  │   ├── CanvasViewport.tsx                CSS Transform
  │   ├── ConnectionLayer.tsx               连线渲染
  │   ├── BaseNode.tsx                      节点基础包装（collapsed / expanded 两态）
  │   ├── NodeLibraryPanel.tsx              节点面板（Draw.io 式分组，可折叠为图标条）
  │   ├── Toolbar.tsx                       顶部工具栏（交互工具 + 子系统注入播放控件槽位）
  │   ├── FloatingPanel.tsx                 可拖拽浮动面板容器（子系统面板宿主）
  │   ├── stores/                           canvasStore / historyStore / clipboardStore / playbackStore
  │   ├── hooks/                            useDrag / useResize / useKeyboard / useMarquee / useNodeExpand / ...
  │   └── utils/                            snapEngine / viewportMath / viewportCulling / ...
  │
  ├── subsystems/                        ← 子系统（按需加载）
  │   ├── storyboard/                       现有分镜逻辑平移
  │   │   ├── nodes/                        ShotNode / SceneGroupNode / GalleryNode / ...
  │   │   ├── panels/                       GenerationPromptPanel
  │   │   └── index.ts                      Manifest + Webview registration
  │   ├── narrative/
  │   │   ├── nodes/                        ChoiceNode / MergeNode / NarrativeSceneNode
  │   │   ├── panels/                       VariablePanel / PathPreview
  │   │   ├── flow/                         FlowTraversal / ConditionEvaluator
  │   │   └── index.ts
  │   ├── behavior/
  │   │   ├── nodes/                        StateNode / TriggerNode / ActionNode
  │   │   ├── panels/                       BlackboardPanel / DebugOverlay
  │   │   └── index.ts
  │   ├── entity/
  │   │   ├── nodes/                        EntityNode / SlotNode / OccurrenceNode
  │   │   ├── panels/                       RepresentationPanel / CoveragePanel
  │   │   ├── projection/                   SSOT JSON → CanvasData 投影
  │   │   └── index.ts
  │   └── memory/
  │       ├── nodes/                        MemoryNode / FactNode
  │       ├── controls/                     TimeFilter / SearchBar
  │       ├── projection/
  │       └── index.ts
  │
  ├── subsystemRegistry.ts              ← 子系统注册表 + 按需激活逻辑
  └── CanvasApp.tsx                      ← 扫描节点类型 → 激活子系统
```

---

## 十、迁移计划

落地原则：**契约先行**——先建 registry + 类型扩展 + fallback renderer + Agent context 扩展，把现有 storyboard 注册为第一个子系统验证模型，再做新子系统。不要同时做架构重构和新功能。

### Phase 0a: 契约层 + 版本对齐（~2d）
- **PR-1**: 统一 NKC 版本源——`NkcVersion` union 追加 `'2.1'`，`CANVAS_VERSION` 改为 `'2.1'`，migrator 增加 v2.0→v2.1 路径（no-op 升版本号 + 追加 optional metadata sections）
- **PR-2**: 类型扩展——`CanvasNodeType = CoreCanvasNodeType | RegisteredCanvasNodeType`，`ConnectionType` 同理。`CanvasData` 追加 `projected?` + 子系统 metadata optional fields
- **PR-3**: `CanvasSubsystemManifest` + `WebviewSubsystemRegistration` 注册契约、`subsystemRegistry.ts` + fallback renderer（unknown node 显示类型名 + warning）
- **验证**: 老 .nkc 打开/保存不丢字段；unknown node 渲染 fallback

### Phase 0b: 内核提取 + storyboard 适配（~3d）
- **PR-4**: 从现有 webview 提取 `core/` 目录（InfiniteCanvas / ConnectionLayer / BaseNode / stores / hooks）
- **PR-5**: 现有分镜逻辑平移到 `subsystems/storyboard/`，通过 `CanvasSubsystemManifest` / `WebviewSubsystemRegistration` 注册
- **PR-6**: Agent context 扩展——`CanvasAgentActiveContextResult` 追加 `nodeTypeSummary` / `activeSubsystems` / `selectedNodeTypes`（optional，兼容旧调用）
- **验证**: 现有分镜功能零回归；Agent getActiveContext() 旧调用不受影响

### Phase 0c: UI 重构（~2d）
- **PR-7**: `Toolbar.tsx`（顶部工具栏，含播放控件槽位）替代左侧竖向 `CanvasToolbar.tsx`
- **PR-8**: `NodeLibraryPanel.tsx`（Draw.io 式分组折叠面板，可折叠为图标条）
- **PR-9**: `FloatingPanel.tsx`（可拖拽浮动面板容器）+ 连接内联编辑条 + VSCode StatusBarItem 集成
- **PR-10**: `BaseNode.tsx` collapsed/expanded 两态 + `useNodeExpand` hook + 移除常驻 PropertyPanel
- **验证**: 现有节点编辑功能通过内联展开完成；连接属性通过内联浮动编辑条编辑

### Phase 1: narrative 子系统（~4d）
- **PR-11**: narrative 子系统注册 + ChoiceNode / MergeNode / NarrativeSceneNode 渲染
- **PR-12**: `choice` 连接类型 + choiceText/condition/priority + 连线渲染
- **PR-13**: FlowTraversal API + VariablePanel（浮动面板）
- **PR-14**: 工具栏叙事播放控件（步进 + Choice 暂停 + 路径高亮）
- **PR-15**: narrative Agent 工具

### Phase 2: entity 子系统（~3d）
- **PR-16**: entity 子系统注册 + EntityNode / SlotNode / OccurrenceNode 渲染
- **PR-17**: ProjectionAdapter 共享契约 + EntityProjectionAdapter（neko-assets 侧注册）+ SSOT 写回
- **PR-18**: RepresentationPanel + CoveragePanel（浮动面板）

### Phase 3: behavior 子系统（~4d）
- **PR-19**: behavior 子系统注册 + StateNode / TriggerNode / ActionNode 渲染
- **PR-20**: `transition` / `child` 连接类型
- **PR-21**: BehaviorExecutor + BlackboardPanel（浮动面板）+ DebugOverlay
- **PR-22**: behavior Agent 工具

### Phase 4: memory 子系统（~2d）
- **PR-23**: memory 子系统注册 + MemoryNode / FactNode 渲染
- **PR-24**: MemoryProjectionAdapter（neko-agent 侧注册）+ TimeFilter + SearchBar

**总计 ~20 工作日，24 PR**。Phase 0a/0b/0c 是顺序前置条件（契约→内核→UI），Phase 1-4 可并行。

### Phase 0 回归测试清单

| 测试场景 | 覆盖目标 |
|----------|---------|
| 老 .nkc（v1.0/v2.0）打开/保存 | migrator 升版本不丢字段 |
| metadata-only v2.1 文件被旧版 migrator 处理 | 未知字段不被删除（JSON 容忍）；含新节点类型的 v2.1 文件旧版 validator 会报错 |
| unknown node type 渲染 | fallback renderer + validator warning |
| 子系统触发扫描 | 加节点激活 / 删最后一个触发节点停用 UI（bundle 不卸载） |
| Agent getActiveContext() | 新增 optional 字段存在时返回；旧调用无 breaking change |
| projected 画布写回失败 | ProjectionAdapter.writeBack 异常不 crash 画布 |
| projected 画布 SSOT 变化 | FileSystemWatcher → onSourceChanged → 重投影 |
| projected 画布缓存丢失 | `.neko/.cache/*.nkc` 删除后可重建 |

---

## 十一、否决记录

### 否决：Kind 隔离模型

初始设计中 `CanvasData.kind` 字段锁定节点类型、Kind 不可切换、不同 Kind 专属节点不可混合。经过多轮分析否决：

1. **子系统按节点类型运行，不按画布类型运行**——FlowTraversal 只看 narrative 节点，BehaviorExecutor 只看 behavior 节点，共存无冲突
2. **Kind 隔离强制多文件**——互动影游项目需 5+ 文件 + canvas-embed 互引，割裂创作体验
3. **连线规则按端口类型验证**——Choice output 只能连 NarrativeScene input，与 Shot/State 正交
4. **Agent 工具按节点类型分派**——扫描 `nodeTypeSummary` 即可确定可用工具，无需 kind 判断
5. **面板按选中节点切换**——VariablePanel 在选中 narrative 节点时显示，BlackboardPanel 在选中 behavior 节点时显示，共存无冲突
6. **参考 Visio/Draw.io**——通用绘图工具证明形状库分组 + 自由混合是更灵活的模型。neko-canvas 节点虽然比 Visio 形状有更深语义，但子系统按需激活解决了语义隔离问题

### 否决：最大功能子集 / 全功能 Kind

提出过 `kind='full'` 允许所有节点类型的方案，实质上是 Kind 隔离模型的变体。自由混合模型直接解决了同一需求，无需特殊 Kind。

### 否决：每 Kind 专用布局引擎

提出过 narrative 用 dagre、behavior 用 tree、entity 用 elk 等专用布局。统一为自由拖拽 + Auto Arrange 可选后，不引入外部布局依赖，交互模型统一，核心共享比例提升到 70%+。

### 否决：常驻右侧属性面板

提出过 Figma/Unity 式常驻右侧属性面板，选中节点时切换内容。经分析否决：

1. **neko-canvas 不支持颜色/样式编辑**——节点视觉由类型决定，无字体/填充/边框等格式属性。属性面板退化为纯域属性编辑器
2. **80% 时间闲置**——创作者多数时间在编辑已有节点内容和连线，不需要看属性列表。选中 Text/Annotation 等简单节点时面板几乎空白
3. **浪费 ~280px 画布宽度**——在 VSCode 编辑器区域中，画布宽度本已受限（侧边栏已占一部分），再减 280px 影响创作体验
4. **编辑上下文断裂**——视线在右侧面板和画布节点间来回跳转

替代方案：节点内联展开编辑（D8），编辑上下文就在节点位置。子系统级面板（VariablePanel / BlackboardPanel）作为独立浮动面板按需唤出。

### 否决：自建底部栏

提出过画布底部状态栏 + 播放器工具条。经分析否决：

1. **状态信息适合 VSCode 原生 StatusBarItem**——缩放比例、节点计数、激活子系统等均为简单文本，StatusBarItem 原生支持且零 webview 空间消耗
2. **播放控件仅几个按钮**——Narrative 步进/Behavior 调试各 3-4 个按钮，可合并到顶部工具栏右侧条件显示
3. **底部栏无剩余内容**——状态归 VSCode，播放归工具栏后，底部栏为空

---

## 十二、风险与缓解

| 风险 | 缓解 |
|------|------|
| core 提取不干净导致分镜回归 | Phase 0 全量测试；storyboard 子系统通过前再开 Phase 1 |
| 子系统 Bundle 全量加载 | Vite dynamic import + React.lazy，按 triggerNodeTypes 按需加载 |
| 投影画布与 SSOT 不同步 | FileSystemWatcher 监听 JSON 变化 → 触发重新投影 |
| RegisteredCanvasNodeType union 膨胀 | 编译时固定类型，运行时通过 subsystemRegistry 验证；新子系统追加类型需更新 union |
| 混合画布中 Agent 上下文过载 | `getActiveContext()` 返回 nodeTypeSummary + selectedNodeTypes，Agent 按选区聚焦 |
| 播放器多子系统同时激活 | 工具栏播放区域一次只运行一个播放器，用户通过下拉切换 narrative/behavior 播放模式 |
| 节点内联展开膨胀推挤布局 | 仅向下扩展（不横向膨胀）+ 互斥展开（同时只有一个节点展开） |
| 多节点批量编辑效率下降 | `Tab` 跳到下一个同类节点并自动展开，缓解逐个双击的操作成本 |

---

## 十三、扩展性分析

### 13.1 新增子系统的标准路径

以 workflow（工作流编排/自动化流程）为例，新增一个子系统的步骤：

```
1. 类型层（@neko/shared）
   └ RegisteredCanvasNodeType 追加 'workflow-step' | 'workflow-trigger' | ...
   └ RegisteredConnectionType 追加 'workflow-flow'

2. 契约层（@neko/shared）
   └ 新增 CanvasSubsystemManifest: { id: 'workflow', triggerNodeTypes: [...], ... }

3. Webview 层（neko-canvas/webview）
   └ subsystems/workflow/index.ts — WebviewSubsystemRegistration
   └ subsystems/workflow/nodes/ — WorkflowStepNode / WorkflowTriggerNode / ...
   └ subsystems/workflow/panels/ — WorkflowVariablePanel（浮动面板）
   └ subsystems/workflow/playback/ — WorkflowDebugController（注入工具栏）

4. 注册层
   └ subsystemRegistry.ts 追加 { triggerTypes: [...], load: () => import('./subsystems/workflow') }

5. Agent 层
   └ agentTools 追加 canvas_execute_workflow / canvas_list_workflow_steps / ...
```

不需要修改 core 内核。Vite code-splitting 自动处理按需加载。

### 13.2 扩展瓶颈与演进路径

| 瓶颈 | 当前状态 | 触发条件 | 演进方向 |
|------|---------|---------|---------|
| **RegisteredCanvasNodeType 编译时固定** | union 类型，新子系统需改类型定义 | 第三方子系统（marketplace 插件） | 退化为 `CoreCanvasNodeType \| (string & {})`，运行时通过 subsystemRegistry 校验 + fallback renderer 兜底 |
| **agentTools 静态数组** | `AgentToolDef[]` 在 Manifest 中声明 | 子系统工具需要动态发现（如 MCP 工具） | 扩展为 `agentTools: AgentToolDef[] \| AgentToolProvider`，Provider 支持运行时枚举 |
| **子系统间无交互机制** | 子系统各自独立，通过 `canvasStore` 共享节点状态 | workflow 触发 narrative 播放、workflow 编排 storyboard batch generation | 引入轻量级跨子系统事件总线：`subsystemBus.emit('workflow:step-complete', { nodeId })` → narrative 子系统订阅并推进路径 |
| **floatingPanels 位置不持久** | 会话内记忆拖拽位置 | 用户重开画布后面板位置重置 | 面板位置存入 `.nkc` viewport section（或 workspace state） |

### 13.3 第三方子系统支持（远期）

当前架构为内建子系统设计（5 + 未来 workflow 等）。若 marketplace 需要第三方子系统扩展：

```
当前（内建子系统）：
  RegisteredCanvasNodeType — 编译时 union，类型安全
  subsystemRegistry — 硬编码 import 列表
  WebviewSubsystemRegistration — 直接 React.lazy

远期（第三方子系统）：
  CanvasNodeType — CoreCanvasNodeType | (string & {})，运行时 registry 校验
  subsystemRegistry — PluginManager 动态注册（类比 AgentCapabilityProvider）
  WebviewSubsystemRegistration — Remote module / iframe sandbox
  CanvasSubsystemManifest — 从 .nkc-subsystem.json 清单文件读取
  trustLevel — core / community / untrusted（复用 marketplace 三级信任）
```

**不在本 ADR 范围内实现**——当前 5 个内建子系统用编译时 union 足够，过早引入动态 registry 会增加不必要的复杂度。上述演进路径记录在此，待 marketplace 子系统需求明确时再落地。
