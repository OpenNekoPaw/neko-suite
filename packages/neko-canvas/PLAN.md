# Neko Canvas 功能增强计划

## 目标
完成以下核心功能，缩小与 TapNow 画布的差距：
1. **节点输入/输出端口** — 从标注连线升级为数据流连线
2. **撤销/重做** — Command 模式操作历史栈
3. **复制/粘贴** — 节点序列化 + 剪贴板
4. **UI 面板增强** — 左侧工具栏、右键菜单增强、节点属性面板

---

## 一、节点输入/输出端口系统

### 现状分析
- 当前 `BaseNode` 有 4 方向锚点 (top/right/bottom/left)，仅用于视觉连线
- 锚点是通用的，没有输入/输出区分
- 连线不携带数据，仅表示逻辑关系

### 设计方案

#### 1.1 类型定义扩展 (`@neko/shared` canvas.ts)

```
ConnectionAnchor 改为:
- 保留 top/right/bottom/left 作为位置
- 新增 PortDefinition 定义端口
- 节点类型声明自己支持的端口

CanvasNodeBase 新增:
  ports?: PortDefinition[]  // 可选，向后兼容

PortDefinition:
  id: string           // 端口唯一标识
  type: 'input' | 'output'
  position: 'top' | 'right' | 'bottom' | 'left'
  dataType?: string    // 'image' | 'video' | 'audio' | 'text' | 'any'
  label?: string

CanvasConnection 扩展:
  sourcePort?: string  // 源端口 ID（新增，可选向后兼容）
  targetPort?: string  // 目标端口 ID
```

#### 1.2 BaseNode 端口渲染
- 如果节点有 `ports` 定义，渲染端口而非通用锚点
- 输入端口：左侧，蓝色圆点
- 输出端口：右侧，绿色圆点
- 无 ports 定义时保持原有 4 方向锚点（向后兼容）
- 端口 hover 显示 label tooltip

#### 1.3 各节点类型默认端口
- MediaNode: output(image/video/audio)
- StoryboardNode: input(any), output(any)
- AnnotationNode: 无端口（保持原有锚点）
- TextNode: output(text)
- ArtboardNode: input(any)

#### 1.4 连线验证
- 只能从 output 连到 input
- 类型兼容检查（any 兼容所有）
- 一个 input 端口只能接一条连线

### 影响文件
- `packages/neko-types/src/types/canvas.ts` — 类型扩展
- `packages/webview/src/components/nodes/BaseNode.tsx` — 端口渲染
- `packages/webview/src/stores/canvasStore.ts` — 连线验证
- `packages/webview/src/components/connections/ConnectionLayer.tsx` — 端口位置计算

---

## 二、撤销/重做系统

### 现状分析
- 键盘快捷键已注册 (⌘Z / ⇧⌘Z)
- Extension 已转发 undo/redo 消息
- `handleKeyboardAction` 中 undo/redo case 为空

### 设计方案

#### 2.1 历史栈 Store (`stores/historyStore.ts`)

```
HistoryStore:
  undoStack: CanvasData[]    // 撤销栈
  redoStack: CanvasData[]    // 重做栈
  maxHistory: 50             // 最大历史数

  pushState(state)           // 记录快照
  undo() → CanvasData|null   // 撤销
  redo() → CanvasData|null   // 重做
  canUndo: boolean
  canRedo: boolean
  clear()
```

#### 2.2 集成方式
- 在 canvasStore 的变更操作中调用 `pushState`
- 需要记录的操作：addNode, removeNode, moveNode, updateNodeData, addConnection, removeConnection, deleteSelected
- 不记录的操作：setViewport, panCanvas, zoomCanvas, selectNode（视口和选择不入栈）
- 使用 middleware 模式包装 canvasStore

#### 2.3 防抖
- moveNode 拖拽过程中不记录，仅 dragEnd 时记录
- 连续快速操作合并（300ms 内同类操作合并）

### 影响文件
- 新建 `stores/historyStore.ts`
- `stores/canvasStore.ts` — 集成历史记录
- `CanvasApp.tsx` — 连接 undo/redo 处理

---

## 三、复制/粘贴系统

### 设计方案

#### 3.1 剪贴板 Store (`stores/clipboardStore.ts`)

```
ClipboardStore:
  clipboard: { nodes: CanvasNode[], connections: CanvasConnection[] } | null

  copy(selectedNodeIds)      // 复制选中节点及其间连线
  cut(selectedNodeIds)       // 剪切
  paste(offset)              // 粘贴（偏移避免重叠）
  canPaste: boolean
  duplicate(selectedNodeIds) // 原地复制（偏移 20px）
```

#### 3.2 实现细节
- 复制时深拷贝节点数据，生成新 ID
- 保留节点间的连线关系（重映射 ID）
- 粘贴位置：视口中心 或 原位置偏移 (20, 20)
- 支持 ⌘C / ⌘V / ⌘X / ⌘D 快捷键

#### 3.3 键盘快捷键
- Extension 端注册新命令：copy, cut, paste, duplicate
- 转发到 webview

### 影响文件
- 新建 `stores/clipboardStore.ts`
- `CanvasApp.tsx` — 键盘处理
- `extension.ts` — 注册新命令
- `ContextMenu.tsx` — 菜单项

---

## 四、UI 面板增强

### 4.1 左侧工具栏 (新组件 `Toolbar/CanvasToolbar.tsx`)

参考 TapNow 的左侧垂直工具栏：
```
┌──┐
│ + │  添加节点（展开面板：文本/场景/图片/视频/音频）
│ 📋│  图层面板 toggle
│ 🔗│  连线模式 toggle
│ ↩ │  撤销
│ ↪ │  重做
│ ⚙ │  画布设置
└──┘
```

替换当前顶部水平工具栏，改为左侧垂直布局。

### 4.2 右键菜单增强

画布背景菜单新增：
- 粘贴 (⌘V)
- 撤销 (⌘Z) / 重做 (⇧⌘Z)

节点选中菜单新增：
- 复制 (⌘C) / 剪切 (⌘X) / 复制 (⌘D)
- 锁定/解锁
- 置于顶层/底层
- 分组

### 4.3 节点属性面板 (新组件 `panels/PropertyPanel.tsx`)

选中节点时在右侧显示属性面板：
- 位置 (x, y)
- 尺寸 (width, height)
- 锁定状态
- 节点特有属性（根据类型动态渲染）

### 4.4 布局调整

```
当前布局：
┌─────────────────────────┐
│ Toolbar (水平)           │
├─────────────────────────┤
│                         │
│      Canvas             │
│                         │
├─────────────────────────┤
│ StatusBar               │
└─────────────────────────┘

新布局：
┌──┬──────────────────┬───┐
│  │                  │   │
│工│                  │属 │
│具│    Canvas        │性 │
│栏│                  │面 │
│  │                  │板 │
├──┴──────────────────┴───┤
│ StatusBar               │
└─────────────────────────┘
```

### 影响文件
- 新建 `components/toolbar/CanvasToolbar.tsx`
- 新建 `components/panels/PropertyPanel.tsx`
- `CanvasApp.tsx` — 布局重构
- `ContextMenu.tsx` — 菜单增强
- `i18n/index.ts` — 新增翻译

---

## 实施顺序

### Phase 1: 基础设施 ✅ 已完成
1. ✅ 撤销/重做系统 (historyStore) — 50 级历史栈 + 拖拽优化 + 重复检测
2. ✅ 复制/粘贴系统 (clipboardStore) — Cmd+C/V/X/D + ID 重映射 + 连线保留

### Phase 2: 端口系统 ✅ 已完成
3. ✅ 类型定义扩展 — PortDefinition + getDefaultPorts()
4. ✅ BaseNode 端口渲染 — 输入(蓝)/输出(绿) + 类型着色
5. ✅ 连线验证逻辑 — 类型兼容 + 防自连 + 防重复 + maxConnections
6. ✅ ConnectionLayer 端口位置计算 — Bezier 曲线 + 方向箭头 + 动画

### Phase 3: UI 面板 ✅ 大部分完成
7. ✅ 左侧工具栏 (CanvasToolbar.tsx)
8. ✅ 右键菜单增强 — 画布/节点上下文菜单（撤销/重做/复制/粘贴/删除等）
9. ✅ 节点属性面板 (PropertyPanel.tsx) — 位置/尺寸/锁定/节点特有属性
10. ✅ 布局重构 — 左工具栏 + 中画布 + 右属性面板

### Phase 4: 集成测试与剩余功能
11. ✅ 键盘快捷键完善 — 10+ 快捷键（Delete/Esc/Cmd+A/Z/C/V/X/D）
12. ✅ Extension 端命令注册
13. ✅ i18n 翻译补全 — 50 个 key，中英双语
14. [ ] 框选（Box Selection）
15. [ ] 多节点同时拖拽
16. [ ] 节点缩放手柄
17. [ ] 对齐辅助线/吸附（组件已有，待集成）
18. [ ] 图层面板集成
