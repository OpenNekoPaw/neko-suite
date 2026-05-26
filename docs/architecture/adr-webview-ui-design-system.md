# ADR: Webview UI 设计体系 — 共享组件层 + 分批迁移策略

## 状态

Accepted / Implemented (Proposed 2026-05-19, implementation status updated 2026-05-25)

## 实施状态

Updated: 2026-05-25

本 ADR 是 [adr-webview-layout-unification.md](./adr-webview-layout-unification.md) 的后续组件层设计。布局统一 ADR 已完成一轮布局/StatusBar/resize/viewport 迁移；本 ADR 已通过 OpenSpec change `unify-webview-ui-design-system` 落地共享 UI 入口、primitive/creative contract、包内 adapter、legacy cutoff 和 Agent 隔离守卫。

| 层级 | 状态 | 当前事实 |
|------|------|----------|
| Layout / native chrome | Done / Scoped | Model/Canvas/Puppet/Cut 已完成本轮布局或状态迁移；Agent Header/Input 已回退并延期 |
| Viewport UI | Done | `@neko/ui/viewport` 导出 `ViewportShell`、`OverlayRenderer`、`ViewportToolbar`、prediction/diagnostics 和 control-flow test utilities |
| Shared component primitives | Done | `@neko/ui/primitives` 已提供 `Button`、`IconButton`、`Select`、`Slider`、`Popover`、`Tooltip`、`Dialog`、`Tabs`、`ContextMenu`、`Collapsible`、`ScrollArea`、`ToggleGroup`、`Progress`、`Badge`、`EmptyState` |
| Creative components | Done / P2 scoped | `PropertyPanel`、`PropertyRow`、`NumberInput`、`NumberSlider`、`ColorPicker`、`ColorSwatch`、`TreeView`、`KeyframeButton` 已落地；`AssetBrowser` 和 `MediaTransportControls` 保持 P2 placeholder |
| Package migration | Done / Exemptions remain | Cut/Puppet/Model/Sketch/Canvas 与 Audio/Live/Preview/Tools/Dashboard/Market/Story 已完成本轮触达面迁移；legacy timeline/menu/toolbar/resize 入口保留豁免 |
| Agent guardrail | Done / Separate | Agent Header/Input、selectors、slash/mention/media controls 未迁移；`agent-ui-isolation.test.ts` 防止本 change 误引入 `@neko/ui` |

---

## 关联 ADR

| 关联文档 | 关系 |
|---|---|
| [adr-webview-layout-unification.md](./adr-webview-layout-unification.md) | 布局结构、StatusBar、resize、Agent rollback 的前置决策 |
| [adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md) | `@neko/ui/viewport` 的协议来源 |
| [adr-viewport-stream-control-boundary.md](./adr-viewport-stream-control-boundary.md) | Viewport 语义控制与渲染流边界，避免 UI 组件迁移误碰 engine authority |
| [adr-capability-protocol.md](./adr-capability-protocol.md) | Webview 安全边界参考 |
| [adr-asset-federation.md](./adr-asset-federation.md) | AssetBrowser / market / preview 统一组件需求来源 |
| [vscode-constraints.md](./vscode-constraints.md) | Webview CSP、无 Node.js、无直接 VSCode API 的硬约束 |
| [adr-device-management.md](./adr-device-management.md) | 原生 VSCode UI 与 Webview UI 的边界划分 |

---

## 1. 背景

### 1.1 当前技术栈一致性

Neko Suite 13 个 webview 子包已在底层框架上基本统一：

| 维度 | 选型 | 一致性 |
|------|------|--------|
| UI 框架 | React 18 | 100% |
| 构建工具 | Vite | 100% |
| 样式方案 | Tailwind + package CSS | 高 |
| 主题 | VSCode CSS 变量 + `--neko-*` tokens | 高，但命名空间碎片化 |
| 状态管理 | Zustand / React built-in | 可共存 |
| i18n | `@neko/shared/i18n` + 各包领域翻译 | 高 |
| Webview 安全 | postMessage / 无直接 VSCode API | 必须保持 |

### 1.2 当前共享基础

`@neko/shared/components` 目前仍承担大量 UI 复用：

| 类别 | 现有能力 |
|------|----------|
| Layout | `VerticalToolbar`、`ToolbarButton`、`Panel`、`CollapsibleSection`、`ResizeHandle` |
| Overlay | `ContextMenu`、`buildAIMenuSection` |
| Media | `TimelineRuler`、`ProgressBar` |
| Keyframe | `KeyframeDiamond`、`KeyframeTimeline` |
| Primitives | `MacButton`、`MacIconButton`、`MacSlider`、`MacTabs` |
| Hooks | `useDrag`、`useResizable`、`usePersistedResize`、`useFileDrop` |

迁移前，`@neko/ui` 已经存在，但实际公共 API 仍以 viewport 为主：

```
@neko/ui
└── viewport/
    ├── ViewportShell
    ├── OverlayRenderer
    ├── ViewportToolbar
    ├── ViewportPredictionLayer
    ├── frame metadata bridge
    └── overlay diagnostics / control-flow test utils
```

本次实现后，`@neko/ui` 的公共入口已经扩展到 `viewport`、`primitives`、`creative`、`icons`、`hooks` 和 `test-utils`，并由 public-entrypoint 与 dependency-boundary 测试固定。

### 1.3 13 个 Webview 子包进度

| 子包 | 原型 | 本轮状态 | 已迁移触达面 | 保留差异 / 豁免 |
|------|------|----------|--------------|-----------------|
| `neko-cut` | Workbench / NLE | Done / partial exemption | Core PropertyPanel rows 经 Cut adapter 使用 shared creative controls；keyframe、preview/commit、token/icon mapping 已验证 | Timeline、AI menu、复杂效果/遮罩/transition 面板继续包内所有 |
| `neko-puppet` | Workbench / 2D skeletal | Done / partial exemption | ParameterPanel、Face parameters、reset controls、PuppetNodeTree 使用 `PropertyPanel` / `NumberSlider` / `TreeView` | KeyframeTimeline、layout resize 兼容入口保留 |
| `neko-model` | Workbench / 3D | Done / partial exemption | TransformPanel、FaceParameterSlider、SceneTree 使用 shared creative controls；500 visible item 测试覆盖 | Toolbar、KeyframeTimeline、layout resize 兼容入口保留 |
| `neko-sketch` | Studio / raster paint | Done / partial exemption | BrushPanel、LayerPanel、Layer actions/context popover 使用 shared creative/primitives | 主 Toolbar、SketchCanvas context menu、Collapsible shell 保留 |
| `neko-canvas` | Studio / node canvas | Done / partial exemption | PropertyPanel technical fields、NodeLibrary rows 使用 shared creative/primitives | Node gesture hooks、Canvas toolbar、media inline players、AI context menu 保留 |
| `neko-audio` | Workbench / DAW | Done / partial exemption | Transport、effects、export、recording、preset browser、side panel、drag/drop 使用 shared primitives/hooks/icons | Timeline/menu/toolbar/EditableWaveform 保留，等待 timeline/menu contract |
| `neko-live` | Viewport + bottom controls | Done | Tracking mode select、tracking/avatar/recording buttons、recording badges 使用 shared primitives | Compositor viewport、fallback canvas、engine stream authority 保持包内 |
| `neko-preview` | Preview viewers | Done / wrapper compatibility | `Mac*` wrappers 适配到 `@neko/ui/primitives`；audio/video controls、tabs、document context menu、progress/icons 已迁移 | 保留 wrapper 命名以兼容 viewer 代码；播放/stream authority 包内所有 |
| `neko-tools` | Diff tools | Done | MediaDiff mode buttons、similarity badge、zoom/opacity/seek sliders、playback icons 使用 shared primitives/icons | TimelineDiff expand glyph 和 waveform SVG 属于未触达可视化 UI |
| `neko-agent` | Conversation | Guarded / separate | 仅保留既有 `useFileDrop` 兼容入口；critical Header/Input path 不 import `@neko/ui` | Header/Input、selectors、account、slash/mention、media model controls 另开 redesign proposal |
| `neko-dashboard` | Dashboard | Done | Quick actions、workflow cards、task/project/creative controls、skills、recent activity 使用 shared primitives | Dashboard shell 和 table structure 保持包内 |
| `neko-market` | Dashboard / marketplace | Done | Search、Tabs、FilterDropdown、AssetCard、install progress、detail actions、LargeAssetPicker controls 使用 shared primitives | Installed/Owned/Updates 管理列表留给后续 focused pass |
| `neko-story` | Document / table | Done | Main tabs、creator status badges、scene/character actions、row menu trigger/items 使用 shared primitives/icons | Script table layout 和 hover preview 定位保持文档领域实现 |

---

## 2. 五层分析

| 层 | 职责 | 依赖边界 | 接口 | 扩展点 | 测试重点 |
|----|------|----------|------|--------|----------|
| L0: Contracts | UI 可消费的 DTO、viewport protocol、通用类型 | 无 React/DOM，不依赖 Webview | `ViewportFrameMeta`、`ViewportMenuItem`、property/tree DTO | 新领域协议字段 | 类型契约、序列化 fixture |
| L1: Host integration | VSCode StatusBar、QuickPick、commands、Webview lifecycle | Extension Host only，不引入 React | Status projection、postMessage handlers | per-package manager | active editor visibility、command dispatch |
| L2: UI primitives | Button、Input、Select、Slider、Tooltip、Dialog、Tabs、Menu | React/DOM only；不可直接访问 VSCode API | `@neko/ui/primitives` | variant、size、density、a11y behavior | keyboard/a11y、theme、CSP |
| L2: Creative UI | PropertyPanel、TreeView、ColorPicker、NumberInput、Keyframe controls | 只依赖 primitives + L0 类型 | `@neko/ui/creative` | domain adapter renderers | controlled state、edge values、virtualization |
| Package adapters | 把领域状态投射到共享 UI | 只在 owning package 内连接 store/controller | Cut/Model/Puppet/Sketch adapters | package-specific render overrides | behavior parity、visual regression、rollback |

核心原则：

1. `@neko/ui` 是 Webview React UI 层，不是业务领域层。
2. `@neko/ui` 可以消费 `@neko/shared` 的 L0 类型和 protocol，但不能依赖任何功能子包。
3. Extension 侧 UI 和 Webview 侧 UI 保持边界清晰；Webview 组件不可 import `vscode`。
4. Engine/viewport 语义控制不因 UI 组件迁移改变权威来源。

---

## 3. 问题分析

### 3.1 迁移前组件层缺口

| 问题 | 严重度 | 受影响包 | 说明 |
|------|:------:|---------|------|
| 无统一 `PropertyPanel` contract | P0 | cut, canvas, sketch, model, puppet | 属性检查器模式相似但各自实现，状态提交/预览/undo 语义分散 |
| 无统一 `NumberInput` / `Slider` | P0 | cut, sketch, model, puppet, audio, tools | 原生 input/range 大量重复，提交时机和边界处理不一致 |
| 无统一 `ColorPicker` | P0 | cut, sketch, canvas, model | 创作软件核心控件缺失，当前多为 HTML5 color 或本地实现 |
| 无统一 `TreeView` | P1 | sketch, model, puppet, canvas | 图层树/场景树/骨骼树/节点树各自实现键盘、选择、展开逻辑 |
| Dialog/Popover/Select/Menu 分散 | P1 | agent, cut, market, tools, preview, dashboard | 下拉、弹窗、浮层和右键菜单存在多套 ad-hoc 实现 |
| 图标方案碎片化 | P1 | 全部 | shared icons、inline SVG、Unicode、codicon 混用 |
| package-specific tokens 过多 | P2 | cut, model, sketch, agent, tools, preview | 已映射部分 `--neko-*`，但命名空间仍阻碍统一主题 |
| a11y / keyboard 不一致 | P2 | 全部 | 多数控件依赖 `title` 或手写焦点逻辑 |

### 3.2 需要保留的差异

统一 UI 不等于统一所有布局。以下差异是领域合理差异，不应被抽象抹平：

| 场景 | 应保留差异 |
|------|------------|
| Cut | NLE 的 preview/timeline/property 三栏关系、播放主控优先级 |
| Canvas | 无限画布、浮动面板、节点交互和连接行为 |
| Sketch | 左侧窄工具栏、画布优先、绘画参数密集面板 |
| Model/Puppet/Live | viewport 协议、overlay、engine authority 和 local fallback 语义 |
| Agent | Conversation 侧栏场景，Header/Input redesign 单独处理 |
| Story | 文档阅读/剧本表格排版可保持更轻量 |

---

## 4. 第三方 UI 库决策

### 4.1 决策：shadcn/ui 源码模式 + Radix Primitives

采用 shadcn/ui 的源码复制模式，并按需引入 Radix Primitives。原因：

1. shadcn/ui 不是运行时组件库，源码可进入 `@neko/ui` 后完全受控。
2. Radix 提供 ARIA、焦点管理和键盘导航，避免从零维护复杂 a11y 行为。
3. Tailwind + CSS variables 与现有 VSCode theme / `--neko-*` tokens 匹配。
4. 可以按组件逐步引入，不要求 13 个 webview 同步改造。

Bundle 预算作为引入前提：每个迁移 PR 必须记录受影响 webview 的 gzip bundle delta；单个 Radix primitive 默认增量上限为 20KB gzipped，超过阈值时必须在 PR 中说明原因，并优先评估 lazy import、拆分 adapter 或继续保留本地实现。

### 4.2 引入顺序

| 组件 | Radix 原语 | 用途 | 优先级 |
|------|------------|------|:------:|
| Tooltip | `@radix-ui/react-tooltip` | 替代 HTML `title`，统一图标按钮说明 | P0 |
| Popover | `@radix-ui/react-popover` | Cut settings、Agent/Market/Tools 菜单后续替换 | P0 |
| Select | `@radix-ui/react-select` | 替代各包原生 select / 自建 dropdown | P0 |
| Slider | `@radix-ui/react-slider` | 统一参数滑条、音量、时间范围、blendshape | P0 |
| Dialog | `@radix-ui/react-dialog` | Market detail、large asset picker、确认弹窗 | P1 |
| ContextMenu | `@radix-ui/react-context-menu` | 增强现有 shared ContextMenu | P1 |
| Tabs | `@radix-ui/react-tabs` | Market/Dashboard/Story/Agent 后续统一 | P1 |
| Collapsible | `@radix-ui/react-collapsible` | 替代 CollapsibleSection 内部实现 | P1 |
| ScrollArea | `@radix-ui/react-scroll-area` | 长列表、TreeView、Inspector | P2 |
| ToggleGroup | `@radix-ui/react-toggle-group` | 工具栏模式选择 | P2 |

### 4.3 排除方案

| 排除 | 原因 |
|------|------|
| Ant Design / Arco | 体积和样式系统过重，与 VSCode 主题和 Tailwind 冲突 |
| Material UI | 视觉语言不匹配，Emotion/CSS-in-JS 增加 CSP 和 bundle 风险 |
| Mantine | 质量高但自带主题系统，覆盖成本高 |
| 全量自建基础控件 | a11y 和焦点管理成本过高 |

---

## 5. 方案设计

### 5.1 `@neko/ui` 目标包结构

```
packages/neko-ui/
├── src/
│   ├── index.ts
│   ├── viewport/                         # 已存在
│   │   ├── ViewportShell.tsx
│   │   ├── OverlayRenderer.tsx
│   │   ├── ViewportToolbar.tsx
│   │   └── ...
│   ├── primitives/
│   │   ├── button.tsx
│   │   ├── icon-button.tsx
│   │   ├── tooltip.tsx
│   │   ├── popover.tsx
│   │   ├── select.tsx
│   │   ├── slider.tsx
│   │   ├── dialog.tsx
│   │   ├── context-menu.tsx
│   │   ├── tabs.tsx
│   │   ├── collapsible.tsx
│   │   ├── scroll-area.tsx
│   │   └── toggle-group.tsx
│   ├── creative/
│   │   ├── property-panel/
│   │   ├── number-input/
│   │   ├── color-picker/
│   │   ├── tree-view/
│   │   ├── keyframe-controls/
│   │   ├── media-controls/
│   │   └── asset-browser/
│   ├── hooks/
│   │   ├── use-drag.ts
│   │   ├── use-resizable.ts
│   │   ├── use-persisted-resize.ts
│   │   ├── use-file-drop.ts
│   │   └── use-hotkeys.ts
│   ├── icons/
│   │   ├── media.tsx
│   │   ├── navigation.tsx
│   │   ├── action.tsx
│   │   ├── status.tsx
│   │   └── editor.tsx
│   └── utils/
│       └── cn.ts
```

### 5.2 Public API 分层

| Export | 内容 | 消费者 |
|--------|------|--------|
| `@neko/ui` | 稳定公共 API，允许导出 primitives/creative/viewport 的常用项 | Webview 子包 |
| `@neko/ui/viewport` | ViewportShell、OverlayRenderer、ViewportToolbar、prediction helpers | Model/Puppet/Live |
| `@neko/ui/primitives` | 基础控件 | 所有 Webview |
| `@neko/ui/creative` | 创作领域组件 | Cut/Canvas/Sketch/Model/Puppet/Audio/Tools |
| `@neko/ui/icons` | 图标组件 | 所有 Webview |
| `@neko/ui/test-utils` | UI 行为断言、a11y helpers、viewport workflow assertions | 测试 |

### 5.3 Layer 约束

```
L0: @neko/shared
  - DTO / protocol / i18n / theme / non-React utilities

L2: @neko/ui
  - React + DOM + Tailwind UI
  - 可依赖 @neko/shared 的 L0 类型和 protocol
  - 不依赖任何 feature package
  - 不直接访问 VSCode API

Feature webview packages
  - 通过 adapters 把领域 store/controller 映射到 @neko/ui props
```

不变量：

- `@neko/ui` 不 import `vscode`，不调用 `acquireVsCodeApi()`。
- `@neko/ui` 不 import `neko-cut`、`neko-model`、`neko-puppet` 等功能包。
- `@neko/ui` 组件是受控优先，业务状态归属调用方。
- `@neko/ui` 不执行 engine/viewport 核心计算，只渲染传入的 DTO 和回调。
- 新增组件必须消费 `--neko-*` / VSCode 主题变量，不新增 package-specific token 前缀。
- 新增图标必须从 `@neko/ui/icons` 或既有 codicon 映射进入；业务包不得继续新增 inline SVG 或 Unicode glyph 作为控件图标。

### 5.4 `@neko/shared/components` 关系

```
现在:
  @neko/shared/components  # 既有共享 UI + hooks
  @neko/ui/viewport        # viewport 专用 UI

迁移期:
  @neko/ui                 # 新 canonical UI API
  @neko/shared/components  # 兼容 re-export 或 deprecated legacy

完成后:
  @neko/ui                 # React UI 组件权威入口
  @neko/shared             # L0 类型/协议/主题/非 React 工具
```

迁移映射：

| 当前来源 | 目标 | 说明 |
|----------|------|------|
| `MacButton` / `MacIconButton` | `Button` / `IconButton` | 视觉保持，API 收敛到 variant/size/density |
| `MacSlider` | `Slider` / `NumberSlider` | 增加键盘与 aria 支持 |
| `MacTabs` | `Tabs` | Radix Tabs 内核，保持紧凑 VSCode 风格 |
| `ContextMenu` | `ContextMenu` | Radix 内核，保留 AI menu builder adapter |
| `CollapsibleSection` | `Collapsible` / `PropertyGroup` | 基础折叠和属性组语义分离 |
| `VerticalToolbar` / `ToolbarButton` | `Toolbar` / `ToolbarButton` / `ToggleGroup` | 工具栏按钮统一图标、tooltip、pressed 状态 |
| `ResizeHandle` / `useResizable` / `usePersistedResize` | `@neko/ui/hooks` | 保持兼容 re-export，后续入口转移 |
| `TimelineRuler` / `KeyframeTimeline` | `@neko/ui/creative` | 先搬迁入口，行为不重写 |
| shared icons | `@neko/ui/icons` | 分类导出，禁止新增 inline SVG 到业务包 |

### 5.5 Creative Inspector Contract

第一批领域组件以 Inspector 为核心，因为 Cut/Puppet/Model/Sketch/Canvas 重复度最高。

```ts
export type PropertyValue = string | number | boolean;

export interface PropertyOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

interface PropertyBase {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly animatable?: boolean;
  readonly hasKeyframes?: boolean;
  readonly isAtKeyframe?: boolean;
}

export type PropertyDefinition =
  | NumberPropertyDefinition
  | SliderPropertyDefinition
  | TextPropertyDefinition
  | ColorPropertyDefinition
  | BooleanPropertyDefinition
  | SelectPropertyDefinition;

export type NumberPropertyDefinition = PropertyBase & {
  readonly kind: 'number';
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
};

export type SliderPropertyDefinition = PropertyBase & {
  readonly kind: 'slider';
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string;
};

export type TextPropertyDefinition = PropertyBase & {
  readonly kind: 'text';
  readonly value: string;
};

export type ColorPropertyDefinition = PropertyBase & {
  readonly kind: 'color';
  readonly value: string;
  readonly alpha?: number;
};

export type BooleanPropertyDefinition = PropertyBase & {
  readonly kind: 'boolean';
  readonly value: boolean;
};

export type SelectPropertyDefinition = PropertyBase & {
  readonly kind: 'select';
  readonly value: string;
  readonly options: readonly PropertyOption[];
};
```

`PropertyDefinition` 使用逐 kind 的 discriminated union，而不是单一 interface + 大量可选字段。这样 adapter 在 `switch (definition.kind)` 中可以获得 exhaustive check，避免新增控件类型时遗漏 value/options/min/max 等字段约束。

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled property definition: ${JSON.stringify(value)}`);
}

function mapProperty(definition: PropertyDefinition): PropertyViewModel {
  switch (definition.kind) {
    case 'number':
      return mapNumber(definition);
    case 'slider':
      return mapSlider(definition);
    case 'text':
      return mapText(definition);
    case 'color':
      return mapColor(definition);
    case 'boolean':
      return mapBoolean(definition);
    case 'select':
      return mapSelect(definition);
    default:
      return assertNever(definition);
  }
}
```

事件语义：

| 事件 | 用途 |
|------|------|
| `onPreviewChange(id, value)` | 滑动/拖拽中的实时预览，不写 undo history |
| `onCommit(id, value)` | blur / pointerup / Enter 后提交，进入 undo history |
| `onReset(id)` | 回默认值 |
| `onToggleKeyframe(id)` | 交给调用方连接 keyframe store |

### 5.6 TreeView Contract

```ts
export interface TreeViewItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly children?: readonly TreeViewItem[];
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly expanded?: boolean;
  readonly visible?: boolean;
  readonly locked?: boolean;
  readonly metadata?: unknown;
}
```

TreeView 只负责可访问性、展开/收起、选择、多选、重命名、拖拽排序 UI。节点含义由调用方 adapter 解释，例如 Model 的 scene node、Puppet 的 node snapshot、Sketch 的 layer。

TreeView 必须为大数据量场景预留渲染策略：

| 场景 | 约束 |
|------|------|
| 少量节点（< 200 visible items） | 可使用直接 DOM 渲染，保留完整 keyboard/focus 行为 |
| 大量节点（>= 200 visible items） | 必须启用 virtualization 或窗口化渲染策略，例如 `react-window` 同类实现 |
| 展开/过滤/搜索 | adapter 负责提供稳定 `id`、展开状态和过滤结果，TreeView 不解释领域节点含义 |
| 测试 | Model SceneTree / Sketch LayerPanel 迁移时必须包含 500 节点级别的渲染、键盘导航和选中状态断言 |

---

## 6. 子包迁移设计

### 6.1 第一批：Inspector / Form

| 子包 | 迁移内容 | 原因 |
|------|----------|------|
| Cut | `PropertyPanel`、`PropertyRow`、`NumberInput`、`ColorInput`、`SelectInput` | 已有声明式 `PropertyDefinition`，最适合做首个 adapter |
| Puppet | `ParameterPanel`、`FaceParameterSection` slider、reset button | 参数滑条与 Model/Cut 可复用 |
| Model | `TransformPanel`、`FaceParameterSlider` | 数值输入和 slider 密集 |
| Sketch | 工具参数面板、颜色/尺寸输入 | 表单控件数量高 |

### 6.2 第二批：Tree / List

| 子包 | 迁移内容 | 原因 |
|------|----------|------|
| Puppet | `PuppetNodeTree` | 当前使用 Unicode icon 和本地 tree state |
| Model | `SceneTree` | 可与 Puppet/Sketch 共用 visibility/selection 语义 |
| Sketch | `LayerPanel` | 图层树需要统一右键、可见性、锁定状态 |
| Canvas | node/library list | 后续可复用 TreeView/ListView primitives |

### 6.3 后续批次：Media / Dashboard / Marketplace / Document

| 子包 | 本轮迁移内容 | 仍保留原因 |
|------|--------------|------------|
| Audio | Transport、effects、export、recording、preset browser、side panel、drag/drop primitives/hooks/icons | Timeline、menu、toolbar 需要独立 timeline/menu contract |
| Live | TrackingPanel form controls、recording badge、Tailwind scan config | Compositor/viewport authority 不属于 UI primitive 迁移 |
| Preview | Viewer tabs、sliders、video/audio controls、document context menu、preview wrapper adapters | Wrapper 名称保留给既有 viewer 代码，后续可做命名清理 |
| Tools | DiffControls、range/select/button、progress/badge、audio/video seek controls | 波形/TimelineDiff 可视化控件未触达 |
| Dashboard | QuickActions、WorkflowCards、TaskTable、ProjectTable、CreativeEntities、SkillList、RecentActivity | Dashboard shell 和表结构保持包内 |
| Market | Search、Tabs、FilterDropdown、AssetCard、PackageDetail、LargeAssetPicker controls | 管理列表留给独立 marketplace controls pass |
| Story | Main tabs、table actions、row menu、touched icons/styles | 剧本表格布局和 hover preview 保持领域实现 |

### 6.4 Agent 单独处理

Agent Header/Input 在布局统一变更中已经回退。Agent 的组件迁移不应混入本 ADR 的通用 UI 迁移批次，因为它同时涉及：

- conversation tabs
- model/session/execution selectors
- account / SSO / onboarding
- media model selection
- slash command / mention / file reference menus
- generation params
- side-panel 空间约束

Agent 后续应单独提出 `redesign-agent-conversation-ui`，本 ADR 只允许复用低风险 primitives，例如 Tooltip、Button、Popover 的外观层替换，不改变交互信息架构。本次实现没有把 `@neko/ui` 引入 Agent Header/Input、conversation tabs、selectors、account flows、slash commands、mentions 或 media model controls；`packages/neko-ui/src/__tests__/agent-ui-isolation.test.ts` 会扫描这些 critical files 并阻止 accidental migration。

---

## 7. 实施计划

### Phase 0: Baseline / Guardrails

| 任务 | 状态 |
|------|------|
| 确认 `@neko/ui/viewport` 作为现有已落地边界 | Done |
| 保留 `@neko/shared/components` 兼容入口 | Done / exempted |
| 为 `@neko/ui` 增加 dependency boundary test：不可 import feature packages / vscode | Done |
| 为新增组件建立 theme/a11y 测试基线 | Done |

### Phase 1: Primitives

| 任务 | 优先级 | 状态 |
|------|:------:|------|
| `Button` / `IconButton` / `Tooltip` | P0 | Done |
| `Select` / `Slider` / `Popover` | P0 | Done |
| `Dialog` / `Tabs` / `ContextMenu` | P1 | Done |
| `Collapsible` / `ScrollArea` / `ToggleGroup` | P1 | Done |
| `Progress` / `Badge` / `EmptyState` | P2 | Done |

Phase 1 起每个新增 primitive 必须同时完成 token 映射：组件内部只消费 `--neko-*` / VSCode theme variables，不新增 package-specific token；迁移调用方时删除或降级对应本地 token 别名。

### Phase 2: Creative Components

| 任务 | 优先级 | 状态 |
|------|:------:|------|
| `NumberInput` + `NumberSlider` | P0 | Done |
| `ColorPicker` + `ColorSwatch` | P0 | Done |
| `PropertyPanel` + `PropertyGroup` + `PropertyRow` | P0 | Done |
| `KeyframeToggle` / `KeyframeButton` | P1 | Done |
| `TreeView` | P1 | Done, includes 200+ virtualization path |
| `AssetBrowser` | P2 | Placeholder |
| `MediaTransportControls` | P2 | Placeholder |

Phase 2 不等待 Phase 4 才做 token 收敛。每个 creative component 的首个 package adapter 必须同时提交 token mapping diff，证明旧的 `--nk-*` / `--sketch-*` / `--model-*` / `--tools-*` 等语义可以映射到共享 `--neko-*` 或局部 adapter token。

`TreeView` 首版必须包含 virtualization 开关或可替换 renderer contract。即使 Cut adapter 不使用 TreeView，Model/Sketch/Puppet 迁移前也不得把 TreeView 固化为全量 DOM 渲染模型。

### Phase 3: Package Adapters

| 批次 | 子包 | 范围 |
|------|------|------|
| 3.1 | Cut | Done: Inspector/Form 首迁，验证 `PropertyDefinition` adapter |
| 3.2 | Puppet + Model | Done: Parameter/Transform/Tree 迁移 |
| 3.3 | Sketch + Canvas | Done: 面板、Layer/Node list、touched toolbar/list controls |
| 3.4 | Audio + Preview + Tools | Done: media controls、range/select/dialog/context controls |
| 3.5 | Dashboard + Market + Story | Done: dashboard primitives、cards/table/tabs/dialog/actions |

Phase 3.1 contract review gate 已通过：Cut core Basic/Transform/Text/Subtitle/Audio rows 可通过 discriminated `PropertyDefinition` 表达，preview/commit 和 undo boundary 由 Cut-owned bridge 持有，复杂 effects/mask/transition/transport-like 控件没有强行塞入通用 contract。

`@neko/shared/components` 的 React UI 入口硬截止已在 Phase 3.3 完成后生效：新代码不得再从 `@neko/shared/components` 导入 React UI 组件，只允许保留兼容 re-export 和 migration notes 中记录的 legacy exemptions。Phase 3.4 起新增或修改的 Webview UI 必须从 `@neko/ui` 导入，`legacy-shared-components-imports.test.ts` 会检查 allowlist。

### Phase 4: Cleanup

| 任务 | 说明 |
|------|------|
| Remove legacy imports | Done for non-exempt touched surfaces；剩余引用记录在 migration notes exemption table |
| Token convergence audit | Done for touched adapters/primitives；未触达 shell token 留到 Phase 4 package cleanup |
| Icon convergence | Done for touched controls；未触达 visualization/toolbar icons 保持包内债务 |
| A11y audit | Done through primitive/creative tests for keyboard、aria、focus、disabled、theme assertions |

---

## 8. 验收标准

每个组件和子包迁移必须满足：

1. Webview 侧不 import `vscode`，Extension 侧不 import React。
2. `@neko/ui` 不依赖任何 feature package。
3. 新增 UI 不引入新的 package-specific token 前缀。
4. 控件支持 disabled、focus-visible、keyboard 操作和 aria label。
5. 表单控件区分 preview change 和 commit change。
6. 迁移子包保留原行为测试或补充 adapter tests。
7. 复杂视觉组件至少有 DOM/source assertion；viewport 场景保留 semantic workflow tests。
8. Agent redesign 不与首批 creative UI migration 混合提交。
9. `PropertyDefinition` adapter 使用 exhaustive switch；新增 `kind` 时测试必须失败直到所有 adapter 覆盖。
10. Phase 3.3 后修改 Webview UI 时不得新增 `@neko/shared/components` React UI import，除非在迁移清单中标注 legacy 豁免。
11. 每批 Radix/shadcn primitive 迁移必须记录 gzip bundle delta；单 primitive 超过 20KB gzipped 时需要设计说明和替代方案评估。
12. `TreeView` 迁移到 Model/Sketch/Puppet 前必须通过 500 visible items 级别的 virtualization/keyboard/selection 测试。
13. 新增或迁移控件图标不得新增业务包 inline SVG / Unicode glyph；缺失图标先补 `@neko/ui/icons` 或 codicon mapping。

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| `@neko/ui` 变成业务聚合层 | 破坏依赖方向 | boundary tests 禁止依赖 feature packages；creative components 只接受 DTO/props |
| Radix 增加 bundle 体积 | Webview 首屏变慢 | 按组件引入；每批迁移后记录 bundle delta；单 primitive 默认不超过 20KB gzipped |
| 两套组件长期共存 | 维护成本上升 | Phase 3.3 作为硬截止；Phase 3.4 起新增/修改 UI 必须走 `@neko/ui` |
| PropertyPanel 抽象过度 | 不适配 Cut/Model/Puppet 差异 | 先以 Cut adapter 验证 contract；Phase 3.1 后设置 contract review gate，再迁 Model/Puppet |
| TreeView 全量 DOM 渲染失控 | 大场景卡顿、键盘导航不稳定 | TreeView contract 预留 virtualization；Model/Sketch/Puppet 迁移前做 500 visible items 测试 |
| 图标收敛后置导致清理面扩大 | inline SVG / Unicode glyph 继续扩散 | 新增控件图标从 Phase 1 起进入 `@neko/ui/icons` 或 codicon mapping |
| Token 收敛后置导致返工 | 后续回头改成本高 | Phase 1/2 开始随组件和 adapter 同步映射 token；Phase 4 只做 audit |
| Agent 被误纳入通用迁移 | 重复之前失败设计 | 明确单独 redesign，当前仅允许低风险外观 primitive 替换 |

---

## 10. 决策总结

1. `@neko/ui` 是 Webview React UI 的 canonical 入口，`@neko/shared` 回归 L0 类型/协议/主题/非 React 工具。
2. `@neko/ui/viewport`、`@neko/ui/primitives`、`@neko/ui/creative`、`@neko/ui/icons`、`@neko/ui/hooks`、`@neko/ui/test-utils` 已作为公共入口落地。
3. 基础控件采用 shadcn 源码模式 + Radix primitives；创作领域控件自建并保持受控优先。
4. Cut/Puppet/Model/Sketch/Canvas 的 Inspector/Form/Tree 已完成首批 adapter 迁移，Audio/Live/Preview/Tools/Dashboard/Market/Story 已完成后续低风险 primitive wave。
5. Agent Header/Input redesign 单独提案，不混入通用 UI 迁移。
6. 每次迁移以 adapter 方式连接业务 store，避免共享 UI 反向依赖功能包。
7. `PropertyDefinition` 使用 discriminated union，保证 adapter 具备类型层面的 exhaustive check。
8. `@neko/shared/components` React UI 入口已进入 Phase 3.3 后硬截止期，Phase 3.4 起新增/修改 UI 必须使用 `@neko/ui`，除非在 exemption table 和 allowlist test 中记录。
9. Radix/shadcn 引入受 bundle budget 约束，单 primitive 默认不超过 20KB gzipped；Popover、Select、ContextMenu 的 isolated baseline 超阈值，但 package deltas 通过 shared chunk reuse 记录和评估。
10. TreeView 已实现 200+ virtualization/windowing path，Model/Sketch/Puppet 大列表迁移包含 500 visible items 测试。
11. 图标收敛从 Phase 1 开始，新增控件图标只能进入 `@neko/ui/icons` 或 codicon mapping；未触达包内 visualization/toolbar icon 债务保留到后续 cleanup。
