# 节点抽象分析报告

> 分析日期：2025-01
> 参考：TapNow 画布节点架构
> 状态：待实施

---

## 1. 当前架构现状

### 1.1 类型层

```
@neko/shared (canvas.ts):
  CanvasNodeType = 'media' | 'storyboard' | 'annotation' | 'group'
  CanvasNodeBase → MediaCanvasNode | StoryboardCanvasNode | AnnotationCanvasNode | GroupCanvasNode

webview/types/extendedCanvas.ts:
  ExtendedNodeType = CanvasNodeType | 'text' | 'artboard'
  CanvasNodeBase → TextCanvasNode | ArtboardCanvasNode
```

### 1.2 组件层

```
BaseNode (公共框架: 拖拽/选中/端口/锚点)
  ├── MediaNode       ← 有 onDrag/onMove/onConnectionStart
  ├── StoryboardNode  ← 有 onDrag/onMove/onConnectionStart/onUpdateData
  ├── AnnotationNode  ← 有 onDrag/onMove/onConnectionStart/onUpdateData
  ├── TextNode        ← ❌ 缺少 onDrag/onConnectionStart（旧版 props）
  └── ArtboardNode    ← ❌ 缺少 onDrag/onConnectionStart（旧版 props）
```

### 1.3 渲染层

```typescript
// InfiniteCanvas.tsx → renderNode()
// 手动 switch 映射，TextNode/ArtboardNode 未注册
switch (node.type) {
  case 'media':      return <MediaNode ... />;
  case 'storyboard': return <StoryboardNode ... />;
  case 'annotation': return <AnnotationNode ... />;
  case 'group':      return <div ... />;  // 内联渲染
  default:           return null;          // text/artboard 被丢弃
}
```

---

## 2. 问题清单

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 1 | **Props 不一致** | 🔴 高 | 每个节点组件独立定义 Props 接口，新增 `onDrag` 时需逐个修改 6 个文件 |
| 2 | **renderNode 硬编码 switch** | 🔴 高 | 新增节点类型必须修改 InfiniteCanvas.tsx，违反开闭原则 (OCP) |
| 3 | **TextNode/ArtboardNode 未集成** | 🔴 高 | 缺少 `onDrag`、`onConnectionStart`，用 `as any` 绕过类型检查 |
| 4 | **类型分���** | 🟡 中 | `@neko/shared` 定义 4 种类型，`extendedCanvas.ts` 又定义 2 种，联合类型不完整 |
| 5 | **重复代码** | 🟡 中 | 每个节点组件都重复声明 `viewport/isSelected/onSelect/onDrag/onMove/onConnectionStart` |
| 6 | **Outline Provider 不识别扩展类型** | 🟢 低 | `syncOutline` 的 switch 只处理 4 种基础类型 |

### 问题影响量化

- 新增一个公共 prop（如 `onDrag`）：需修改 **6 个文件**（BaseNode + 5 个节点组件）
- 新增一个节点类型：需修改 **5+ 个文件**（类型定义 + 组件 + renderNode + outline + 注册表）
- 当前 `as any` 类型逃逸：**2 处**（TextNode.tsx:98, ArtboardNode.tsx:43）

---

## 3. TapNow 节点架构（参考）

TapNow 采用 **注册表模式 + 统一 Props 接口 + 渲染上下文**：

```typescript
// 1. 统一的渲染上下文（打包所有回调）
interface NodeRenderContext {
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect: (nodeId: string, multi: boolean) => void;
  onDrag: (nodeId: string, position: Position) => void;
  onMove: (nodeId: string, position: Position) => void;
  onConnectionStart: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  onUpdateData: (nodeId: string, data: Record<string, unknown>) => void;
}

// 2. 统一的节点组件 Props
interface NodeComponentProps<T = unknown> {
  node: CanvasNode & { data: T };
  context: NodeRenderContext;
}

// 3. 节点注册表
interface NodeRegistration {
  component: React.ComponentType<NodeComponentProps>;
  defaultPorts: PortDefinition[];
  icon: string;
  label: string;
  category: 'content' | 'structure' | 'annotation';
}

const nodeRegistry = new Map<string, NodeRegistration>();

// 注册节点类型
nodeRegistry.set('media', {
  component: MediaNode,
  defaultPorts: MEDIA_NODE_PORTS,
  icon: '🎬',
  label: 'Media',
  category: 'content',
});

// 4. 渲染时查表（无 switch）
function renderNode(node: CanvasNode, context: NodeRenderContext) {
  const reg = nodeRegistry.get(node.type);
  if (!reg) return <FallbackNode node={node} context={context} />;
  const Component = reg.component;
  return <Component key={node.id} node={node} context={context} />;
}
```

### TapNow 的优势

- **新增节点类型**：只需 1 个组件文件 + 1 行注册代码
- **公共 Props 变更**：只改 `NodeRenderContext` 接口，所有节点自动继承
- **注册表可查询**：工具栏、大纲、属性面板都可以从注册表获取元数据
- **FallbackNode**：未知类型不会崩溃，显示通用占位符

---

## 4. 推荐方案：渐进式抽象（3 步）

### Step 1: 统一 Props 接口

**目标**：消除 Props 重复定义，解决 Props 不一致问题。

```typescript
// types/nodeProps.ts

/** All callbacks that BaseNode needs, bundled into a context object */
export interface NodeRenderContext {
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
}

/** Base props for all node components */
export interface NodeComponentProps<N extends CanvasNodeBase = CanvasNodeBase> {
  node: N;
  context: NodeRenderContext;
}

// 各节点组件简化为：
export type MediaNodeProps = NodeComponentProps<MediaCanvasNode>;
export type StoryboardNodeProps = NodeComponentProps<StoryboardCanvasNode>;
export type AnnotationNodeProps = NodeComponentProps<AnnotationCanvasNode>;
export type TextNodeProps = NodeComponentProps<TextCanvasNode>;
export type ArtboardNodeProps = NodeComponentProps<ArtboardCanvasNode>;
```

**影响**：
- 修改 `BaseNode.tsx` — 接受 `NodeRenderContext` 代替散列 props
- 修改 5 个节点组件 — 使用新 Props 接口
- 修改 `InfiniteCanvas.tsx` — 构建 context 对象传递

### Step 2: 节点注册表

**目标**：消除 renderNode switch，支持开闭原则。

```typescript
// registry/nodeRegistry.ts

export interface NodeRegistration {
  /** React component to render this node type */
  component: React.ComponentType<NodeComponentProps<any>>;
  /** Default port definitions */
  defaultPorts: PortDefinition[];
  /** Icon for toolbar, outline, etc. */
  icon: string;
  /** Display label */
  label: string;
  /** Category for grouping in UI */
  category: 'content' | 'structure' | 'annotation';
}

class NodeRegistry {
  private registry = new Map<string, NodeRegistration>();

  register(type: string, registration: NodeRegistration): void {
    this.registry.set(type, registration);
  }

  get(type: string): NodeRegistration | undefined {
    return this.registry.get(type);
  }

  getAll(): Map<string, NodeRegistration> {
    return new Map(this.registry);
  }

  getByCategory(category: string): [string, NodeRegistration][] {
    return [...this.registry].filter(([, r]) => r.category === category);
  }
}

export const nodeRegistry = new NodeRegistry();

// 注册所有内置节点类型
nodeRegistry.register('media', {
  component: MediaNode,
  defaultPorts: MEDIA_NODE_PORTS,
  icon: '🎬',
  label: 'Media',
  category: 'content',
});

nodeRegistry.register('storyboard', {
  component: StoryboardNode,
  defaultPorts: STORYBOARD_NODE_PORTS,
  icon: '📋',
  label: 'Storyboard',
  category: 'structure',
});

// ... 其他节点类型
```

**影响**：
- 新建 `registry/nodeRegistry.ts`
- 修改 `InfiniteCanvas.tsx` — 用注册表替代 switch
- 修改 `CanvasToolbar.tsx` — 可从注册表动态生成添加菜单
- 修改 `canvasOutlineProvider.ts` — 可从注册表获取图标/标签

### Step 3: 统��类型系统

**目标**：消除 `@neko/shared` 和 `extendedCanvas.ts` 的类型分裂。

**方案 A**：将 `text`/`artboard` 提升到 `@neko/shared`
- 优点：类型完整，无需 `as any`
- 缺点：需要修改共享包，影响其他消费者

**方案 B**：在 webview 层建立统一类型
```typescript
// types/canvasTypes.ts
import type { CanvasNode } from '@neko/shared';
import type { TextCanvasNode, ArtboardCanvasNode } from './extendedCanvas';

/** Complete canvas node union (shared + extended) */
export type FullCanvasNode = CanvasNode | TextCanvasNode | ArtboardCanvasNode;

/** Complete node type discriminator */
export type FullNodeType = CanvasNode['type'] | 'text' | 'artboard';
```

---

## 5. 成本收益分析

| 方案 | 改动量 | 新增节点成本 | 新增公共 Prop 成本 | 类型安全 |
|------|--------|-------------|-------------------|---------|
| **不抽象（现状）** | 0 | 5+ 文件 | 6 文件 | ❌ `as any` |
| **仅 Step 1** | ~2h | 3 文件 | 1 文件 | ✅ |
| **Step 1 + 2** | ~3h | **1 文件 + 1 行** | 1 文件 | ✅ |
| **全部 3 步** | ~4h | **1 文件 + 1 行** | 1 文件 | ✅✅ |

---

## 6. 实施建议

### 推荐：实施 Step 1 + Step 2

**理由**：
1. 当前已有 **6 种节点类型**，且 PLAN.md 暗示未来还会增加
2. 每次新增 `onDrag` 这样的公共 prop 都要改 6 个文件，维护成本线性增长
3. `TextNode` 和 `ArtboardNode` 已出现 `as any` 类型逃逸
4. 注册表模式是 TapNow 验证过的成熟方案，实现成本低
5. 注册表的元数据可被工具栏、大纲、属性面板复用

### 实施顺序

```
Phase 1 (Step 1): 统一 Props
  1. 定义 NodeRenderContext + NodeComponentProps 接口
  2. 重构 BaseNode 接受 context
  3. 逐个迁移 5 个节点组件
  4. 更新 InfiniteCanvas 构建 context

Phase 2 (Step 2): 注册表
  5. 创建 NodeRegistry 类
  6. 注册 6 种内置节点
  7. InfiniteCanvas 用注册表替代 switch
  8. 集成 TextNode/ArtboardNode 到 renderNode
  9. 工具栏/大纲从注册表读取元数据

Phase 3 (Step 3, 可选): 类型统一
  10. 评估是否提升到 @neko/shared
  11. 建立 FullCanvasNode 统一类型
```

### 验收标准

- [ ] 所有节点组件使用统一 `NodeComponentProps` 接口
- [ ] 无 `as any` 类型逃逸
- [ ] 新增节点类型只需 1 个组件文件 + 1 行注册
- [ ] TextNode 和 ArtboardNode 完整集成（端口、拖拽、连接）
- [ ] 编译通过，功能不退化
